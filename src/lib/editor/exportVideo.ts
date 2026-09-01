// Client-side video export using MediaRecorder over a canvas we paint into
// each frame. We rasterize the live scene DOM by serializing it into an SVG
import { setSfxMuted } from "./sfx";
import { getVideoElement } from "./videoRegistry";
import type { AudioClip, VideoClip } from "./types";
// <foreignObject> and drawing that to canvas.

interface ExportOpts {
  duration: number;
  fps: number;
  width: number;
  height: number;
  captureNode: HTMLElement;
  onFrame: (time: number) => Promise<void>;
  /** Output container. mp4 is transcoded with FFmpeg after recording. */
  format?: "webm" | "mp4";
  onStatus?: (msg: string) => void;
  /** Voice-over / music clips muxed into the MP4. */
  audio?: AudioClip[];
  /** Timeline video clips painted over each frame (real video frames). */
  video?: VideoClip[];
}

const dataUrlCache = new Map<string, string>();

async function sourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:")) return source;
  const cached = dataUrlCache.get(source);
  if (cached) return cached;
  const blob = await fetch(source).then((response) => {
    if (!response.ok) throw new Error(`Could not embed export asset: ${response.status}`);
    return response.blob();
  });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not embed an export asset."));
    reader.readAsDataURL(blob);
  });
  dataUrlCache.set(source, dataUrl);
  return dataUrl;
}

async function inlineCloneAssets(clone: HTMLElement) {
  const images = Array.from(clone.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    const source = image.getAttribute("src");
    if (source) image.setAttribute("src", await sourceToDataUrl(source));
  }));
  const nodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
  await Promise.all(nodes.map(async (element) => {
    const match = element.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    const source = match?.[1];
    if (source) element.style.backgroundImage = `url("${await sourceToDataUrl(source)}")`;
  }));
}

async function domToImage(
  node: HTMLElement,
  width: number,
  height: number,
): Promise<HTMLImageElement> {
  // Clone node and inline computed styles is expensive; for MVP we rely on
  // inline styles used throughout the scene and pull in a minimal stylesheet.
  const clone = node.cloneNode(true) as HTMLElement;
  // Strip scaling transform so the export renders at native resolution.
  clone.style.transform = "none";
  clone.style.marginBottom = "0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  await inlineCloneAssets(clone);

  const xml = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px">` +
    xml +
    `</div></foreignObject></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.width = width;
  img.height = height;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("frame render failed"));
    img.src = url;
  });
  return img;
}

/** Rasterize the scene into an <img>, then paint the timeline video frames
 *  over it. The DOM snapshot can't capture <video>, so we draw the real
 *  decoded frames (object-fit: contain) from the overlay elements directly. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  node: HTMLElement,
  width: number,
  height: number,
  video: VideoClip[],
  time: number,
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return domToImage(node, width, height).then((img) => {
    ctx.drawImage(img, 0, 0, width, height);
    for (const clip of video) {
      if (time < clip.start || time >= clip.start + clip.duration) continue;
      const el = getVideoElement(clip.id);
      if (!el || !el.videoWidth || !el.videoHeight) continue;
      const scale = Math.min(width / el.videoWidth, height / el.videoHeight);
      const dw = el.videoWidth * scale;
      const dh = el.videoHeight * scale;
      try {
        ctx.drawImage(el, (width - dw) / 2, (height - dh) / 2, dw, dh);
      } catch {
        /* frame not decoded yet — carry on without it */
      }
    }
  });
}

/** Transcode a recorded WebM blob to H.264 MP4 using ffmpeg.wasm. */
export async function webmToMp4(
  webm: Blob,
  onStatus?: (msg: string) => void,
): Promise<Blob> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile } = await import("@ffmpeg/util");
  const coreModuleURL = (await import("@ffmpeg/core?url")).default;
  const wasmURL = (await import("@ffmpeg/core/wasm?url")).default;
  const coreSource = await fetch(coreModuleURL).then((response) => {
    if (!response.ok) throw new Error("Could not load the MP4 encoder.");
    return response.text();
  });
  const coreURL = URL.createObjectURL(new Blob([coreSource], { type: "text/javascript" }));
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => console.info(`[mp4 encoder] ${message}`));
  onStatus?.("Loading encoder…");
  ffmpeg.on("progress", ({ progress }) => {
    if (progress > 0 && progress <= 1)
      onStatus?.(`Encoding MP4 ${Math.round(progress * 100)}%`);
  });
  try {
    await ffmpeg.load({ coreURL, wasmURL });
    onStatus?.("Encoding MP4…");
    console.info(`[mp4 encoder] input bytes: ${webm.size}`);
    await ffmpeg.writeFile("in.webm", await fetchFile(webm));
    const exitCode = await ffmpeg.exec([
      "-i",
      "in.webm",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
    if (exitCode !== 0) throw new Error("The MP4 encoder could not process this recording.");
    const data = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
    return new Blob([data.slice().buffer as ArrayBuffer], { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
    URL.revokeObjectURL(coreURL);
  }
}

async function framesToMp4(
  frames: Blob[],
  fps: number,
  onStatus?: (msg: string) => void,
  audio: AudioClip[] = [],
): Promise<Blob> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile } = await import("@ffmpeg/util");
  const coreModuleURL = (await import("@ffmpeg/core?url")).default;
  const wasmURL = (await import("@ffmpeg/core/wasm?url")).default;
  const coreSource = await fetch(coreModuleURL).then((response) => response.text());
  const coreURL = URL.createObjectURL(new Blob([coreSource], { type: "text/javascript" }));
  const ffmpeg = new FFmpeg();
  onStatus?.("Loading encoder…");
  ffmpeg.on("progress", ({ progress }) => {
    if (progress > 0 && progress <= 1) onStatus?.(`Encoding MP4 ${Math.round(progress * 100)}%`);
  });
  try {
    await ffmpeg.load({ coreURL, wasmURL });
    onStatus?.("Preparing frames…");
    for (let index = 0; index < frames.length; index += 1) {
      const name = `frame-${String(index).padStart(6, "0")}.jpg`;
      await ffmpeg.writeFile(name, await fetchFile(frames[index]));
    }

    // audio inputs + mixing graph
    const usable: AudioClip[] = [];
    for (const clip of audio) {
      try {
        const buffer = await fetch(clip.src).then((r) => r.arrayBuffer());
        await ffmpeg.writeFile(`audio-${usable.length}.bin`, new Uint8Array(buffer));
        usable.push(clip);
      } catch (error) {
        console.warn("audio clip skipped", error);
      }
    }
    const audioArgs: string[] = [];
    usable.forEach((_, i) => audioArgs.push("-i", `audio-${i}.bin`));
    let filterArgs: string[] = [];
    if (usable.length > 0) {
      const chains = usable.map((clip, i) => {
        const delay = Math.max(0, Math.round(clip.start * 1000));
        return (
          `[${i + 1}:a]atrim=start=${clip.offset.toFixed(3)}:duration=${clip.duration.toFixed(3)},` +
          `asetpts=PTS-STARTPTS,volume=${clip.volume.toFixed(2)},` +
          `adelay=${delay}|${delay}[a${i}]`
        );
      });
      const mix =
        usable.map((_, i) => `[a${i}]`).join("") +
        `amix=inputs=${usable.length}:normalize=0,aresample=48000[aout]`;
      filterArgs = [
        "-filter_complex",
        `${chains.join(";")}${chains.length ? ";" : ""}${mix}`,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
      ];
    }

    onStatus?.("Encoding MP4…");
    const exitCode = await ffmpeg.exec([
      "-framerate", String(fps),
      "-i", "frame-%06d.jpg",
      ...audioArgs,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      ...filterArgs,
      "out.mp4",
    ]);
    if (exitCode !== 0) throw new Error("The MP4 encoder could not process the rendered frames.");
    const data = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
    return new Blob([data.slice().buffer as ArrayBuffer], { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
    URL.revokeObjectURL(coreURL);
  }
}

export async function exportWebm(opts: ExportOpts) {
  setSfxMuted(true);
  try {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas video rendering is not available in this browser.");

  // Setup recorder
  const stream = canvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  const frames: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);

  const frameCount = Math.ceil(opts.duration * opts.fps);
  for (let i = 0; i <= frameCount; i++) {
    const time = (i / opts.fps);
    await opts.onFrame(Math.min(time, opts.duration));
    // wait one microtask so React commits the frame
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      await drawFrame(
        ctx,
        opts.captureNode,
        opts.width,
        opts.height,
        opts.video ?? [],
        time,
      );
      videoTrack.requestFrame?.();
      if (opts.format === "mp4") {
        const frame = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error("Could not render an export frame.")),
            "image/jpeg",
            0.9,
          );
        });
        frames.push(frame);
      }
    } catch (e) {
      console.warn("frame skipped", e);
    }
    await new Promise((r) => setTimeout(r, 1000 / opts.fps));
  }

  recorder.requestData();
  await new Promise((resolve) => setTimeout(resolve, 100));
  recorder.stop();
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  let blob = new Blob(chunks, { type: "video/webm" });
  let ext = "webm";
  if (opts.format === "mp4") {
    if (frames.length === 0) throw new Error("No video frames were rendered.");
    blob = await framesToMp4(frames, opts.fps, opts.onStatus, opts.audio ?? []);
    ext = "mp4";
  } else if (blob.size === 0) {
    throw new Error("The browser produced an empty recording.");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `whiteboard-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  } finally {
    setSfxMuted(false);
  }
}