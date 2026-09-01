import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Clapperboard,
  Trash2,
  Film,
  Volume2,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { sceneDuration, sceneOffsets, useEditor, newId } from "@/lib/editor/store";
import { loadVideoBlob } from "@/lib/editor/audioPlayback";
import type { SceneElement, VideoClip } from "@/lib/editor/types";

const PX_PER_SEC = 80;

const CLIP_COLORS = [
  { bg: "rgba(239,68,68,0.18)", border: "rgba(239,68,68,0.5)", thumb: "rgba(239,68,68,0.25)" },
  { bg: "rgba(168,85,247,0.18)", border: "rgba(168,85,247,0.5)", thumb: "rgba(168,85,247,0.25)" },
  { bg: "rgba(14,165,233,0.18)", border: "rgba(14,165,233,0.5)", thumb: "rgba(14,165,233,0.25)" },
  { bg: "rgba(34,197,94,0.18)", border: "rgba(34,197,94,0.5)", thumb: "rgba(34,197,94,0.25)" },
  { bg: "rgba(249,115,22,0.18)", border: "rgba(249,115,22,0.5)", thumb: "rgba(249,115,22,0.25)" },
  { bg: "rgba(236,72,153,0.18)", border: "rgba(236,72,153,0.5)", thumb: "rgba(236,72,153,0.25)" },
];
function clipColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CLIP_COLORS[h % CLIP_COLORS.length];
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Generate a filmstrip thumbnail row for a video clip. */
function FilmstripCanvas({
  src,
  width,
  height,
  color,
  duration,
}: {
  src: string;
  width: number;
  height: number;
  color: string;
  duration: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const el = document.createElement("video");
    el.preload = "auto";
    el.muted = true;
    el.src = src;

    const captureFrames = async () => {
      const frameCount = Math.max(2, Math.min(20, Math.floor(width / 48)));
      const interval = duration / frameCount;
      const frames: string[] = [];

      for (let i = 0; i < frameCount && !cancelled; i++) {
        const time = i * interval;
        try {
          el.currentTime = time;
          await new Promise<void>((res, rej) => {
            const onSeeked = () => { el.removeEventListener("seeked", onSeeked); res(); };
            const onError = () => { el.removeEventListener("error", onError); rej(); };
            el.addEventListener("seeked", onSeeked);
            el.addEventListener("error", onError);
            setTimeout(() => { el.removeEventListener("seeked", onSeeked); rej(); }, 1500);
          });
          const c = document.createElement("canvas");
          c.width = 48;
          c.height = height;
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.drawImage(el, 0, 0, 48, height);
            frames.push(c.toDataURL("image/jpeg", 0.5));
          }
        } catch {
          // skip frame
        }
      }

      if (!cancelled && frames.length > 0) {
        framesRef.current = frames;
        drawFilmstrip(canvasRef.current, frames, width, height, color);
      }
    };

    captureFrames().catch(() => {});
    return () => { cancelled = true; };
  }, [src, width, height, color, duration]);

  return (
    <canvas
      ref={canvasRef}
      width={width * 2}
      height={height * 2}
      style={{ width, height }}
      className="absolute inset-0 pointer-events-none opacity-60"
    />
  );
}

function drawFilmstrip(
  canvas: HTMLCanvasElement | null,
  frames: string[],
  w: number,
  h: number,
  _color: string,
) {
  if (!canvas || frames.length === 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w * 2, h * 2);
  const fw = (w * 2) / frames.length;
  for (let i = 0; i < frames.length; i++) {
    const img = new Image();
    img.src = frames[i];
    // Draw synchronously after load for canvas
    const drawImg = () => {
      try {
        ctx.drawImage(img, i * fw, 0, fw, h * 2);
      } catch {}
    };
    if (img.complete) drawImg();
    else img.onload = drawImg;
  }
}

/** Global video lane — drops a movie over the animation on the timeline. */
export function VideoTrack() {
  const scenes = useEditor((s) => s.scenes);
  const video = useEditor((s) => s.video);
  const activeSceneId = useEditor((s) => s.activeSceneId);
  const previewTime = useEditor((s) => s.previewTime);
  const setPreviewTime = useEditor((s) => s.setPreviewTime);
  const setActiveScene = useEditor((s) => s.setActiveScene);
  const addVideoClip = useEditor((s) => s.addVideoClip);
  const updateVideoClip = useEditor((s) => s.updateVideoClip);
  const removeVideoClip = useEditor((s) => s.removeVideoClip);

  const selectedVideoId = useEditor((s) => s.selectedVideoId);
  const selectVideo = useEditor((s) => s.selectVideo);

  const offs = sceneOffsets(scenes);
  const index = Math.max(0, scenes.findIndex((s) => s.id === activeSceneId));
  const globalTime = offs[index] + (previewTime ?? 0);
  const videoLength = offs[scenes.length - 1] + sceneDuration(scenes[scenes.length - 1]);
  const videoEnd = video.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const total = Math.max(videoLength, videoEnd, 10);
  const width = total * PX_PER_SEC;

  const fileRef = useRef<HTMLInputElement>(null);

  const importBlob = async (blob: Blob, name: string) => {
    const loaded = await loadVideoBlob(blob, name);
    const state = useEditor.getState();
    const videoEnd = loaded.duration;

    addVideoClip({
      name: loaded.name,
      src: loaded.src,
      start: 0,
      offset: 0,
      duration: loaded.duration,
      sourceDuration: loaded.duration,
      volume: 1,
    });

    const scene = state.activeScene();
    const existingHold = scene.elements.find((e) => e.name === "__video_hold");
    if (existingHold) {
      state.updateElement(existingHold.id, {
        startTime: 0,
        holdDuration: Math.max(0.5, videoEnd),
      });
    } else if (scene.elements.length > 0) {
      const lastEl = [...scene.elements].sort(
        (a, b) => (a.startTime + a.drawDuration + a.holdDuration) - (b.startTime + b.drawDuration + b.holdDuration),
      )[scene.elements.length - 1];
      const lastEnd = lastEl.startTime + lastEl.drawDuration + lastEl.holdDuration;
      if (lastEnd < videoEnd) {
        state.updateElement(lastEl.id, {
          holdDuration: lastEl.holdDuration + (videoEnd - lastEnd),
        });
      }
    } else {
      const holdEl: SceneElement = {
        id: newId(),
        type: "text",
        x: -9999,
        y: -9999,
        width: 1,
        height: 1,
        rotation: 0,
        startTime: 0,
        drawDuration: 0,
        holdDuration: Math.max(0.5, videoEnd),
        name: "__video_hold",
        text: "",
        fontFamily: "sans-serif",
        fontSize: 1,
        fontWeight: 400,
        color: "transparent",
      };
      state.addElement(holdEl);
    }

    toast.success(`${name} added — timeline extended to ${loaded.duration.toFixed(1)}s`);
  };

  const seekGlobal = (t: number) => {
    const clamped = Math.max(0, Math.min(total, t));
    let i = 0;
    for (let k = 0; k < scenes.length; k++) if (offs[k] <= clamped) i = k;
    if (scenes[i].id !== activeSceneId) setActiveScene(scenes[i].id);
    setPreviewTime(Math.max(0, clamped - offs[i]));
  };

  const drag = (
    e: React.PointerEvent,
    initial: number,
    update: (value: number) => void,
  ) => {
    e.stopPropagation();
    const startX = e.clientX;
    const move = (event: PointerEvent) =>
      update(initial + (event.clientX - startX) / PX_PER_SEC);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const selected = video.find((c) => c.id === selectedVideoId);

  return (
    <div className="border-t bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs border-b border-border/50">
        <span className="font-semibold flex items-center gap-1.5 shrink-0 text-muted-foreground">
          <Clapperboard className="w-3.5 h-3.5" /> Video
        </span>

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importBlob(file, file.name);
            e.target.value = "";
          }}
        />

        <Button
          size="sm"
          variant="secondary"
          className="h-6 text-[11px] gap-1"
          onClick={() => fileRef.current?.click()}
        >
          <Film className="w-3 h-3" /> Import
        </Button>

        {selected && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />

            <span className="max-w-36 truncate text-foreground font-medium" title={selected.name}>
              {selected.name}
            </span>

            <span className="text-muted-foreground tabular-nums">
              {fmtTime(selected.offset)} – {fmtTime(selected.offset + selected.duration)}
            </span>

            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tabular-nums">{fmtTime(selected.duration)}</span>

            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px] text-destructive hover:text-destructive"
              onClick={() => removeVideoClip(selected.id)}
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1 text-muted-foreground">
          {video.length > 0 && (
            <span className="tabular-nums">{video.length} clip{video.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Filmstrip lane */}
      <div className="overflow-x-auto">
        <div
          className="relative h-16 select-none"
          style={{ width }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekGlobal((e.clientX - rect.left) / PX_PER_SEC);
            selectVideo(null);
          }}
        >
          {/* Scene boundaries */}
          {scenes.map((sc, i) => (
            <div
              key={sc.id}
              className="absolute top-0 bottom-0 border-l border-dashed border-border/60 text-[10px] text-muted-foreground pl-1 pt-0.5"
              style={{ left: offs[i] * PX_PER_SEC }}
            >
              {sc.name}
            </div>
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-primary z-30 pointer-events-none"
            style={{ left: globalTime * PX_PER_SEC }}
          />
          <div
            className="absolute top-0 w-2.5 h-2.5 -ml-1 bg-primary rounded-b-sm z-30 pointer-events-none"
            style={{ left: globalTime * PX_PER_SEC }}
          />

          {/* Video clips */}
          {video.map((clip) => {
            const colors = clipColor(clip.id);
            const isSelected = clip.id === selectedVideoId;
            const clipLeft = clip.start * PX_PER_SEC;
            const clipWidth = Math.max(40, clip.duration * PX_PER_SEC);

            return (
              <div
                key={clip.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectVideo(clip.id);
                  drag(e, clip.start, (start) =>
                    updateVideoClip(clip.id, { start: Math.max(0, start) }),
                  );
                }}
                className={`absolute top-3 h-10 rounded-lg border text-[11px] flex items-center overflow-hidden cursor-grab transition-shadow ${
                  isSelected
                    ? "shadow-[0_0_0_2px_rgba(99,102,241,0.4)] z-20"
                    : "hover:shadow-md z-10"
                }`}
                style={{
                  left: clipLeft,
                  width: clipWidth,
                  backgroundColor: colors.bg,
                  borderColor: isSelected ? "rgba(99,102,241,0.7)" : colors.border,
                }}
                title={`${clip.name} · ${fmtTime(clip.duration)}`}
              >
                {/* Filmstrip thumbnails */}
                <FilmstripCanvas
                  src={clip.src}
                  width={clipWidth}
                  height={40}
                  color={colors.thumb}
                  duration={clip.duration}
                />

                {/* Left trim handle */}
                <span
                  className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 z-10"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    selectVideo(clip.id);
                    const startStart = clip.start;
                    const startOffset = clip.offset;
                    const startDur = clip.duration;
                    drag(e, 0, (delta) => {
                      const d = Math.max(-startOffset, Math.min(startDur - 0.2, delta));
                      updateVideoClip(clip.id, {
                        start: Math.max(0, startStart + d),
                        offset: startOffset + d,
                        duration: startDur - d,
                      });
                    });
                  }}
                />

                {/* Clip label */}
                <span className="relative z-10 truncate pl-2.5 pr-1 text-foreground font-medium drop-shadow-sm">
                  <Film className="w-3 h-3 inline mr-1 opacity-70" />
                  {clip.name}
                </span>

                {/* Duration badge */}
                <span className="relative z-10 shrink-0 bg-black/40 text-white text-[9px] px-1 py-0.5 rounded tabular-nums mr-1">
                  {fmtTime(clip.duration)}
                </span>

                {/* Right trim handle */}
                <span
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 z-10"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    selectVideo(clip.id);
                    drag(e, clip.duration, (duration) =>
                      updateVideoClip(clip.id, {
                        duration: Math.max(
                          0.2,
                          Math.min(clip.sourceDuration - clip.offset, duration),
                        ),
                      }),
                    );
                  }}
                />
              </div>
            );
          })}

          {video.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-4 text-[11px] text-muted-foreground pointer-events-none">
              <span className="flex items-center gap-1.5">
                <Film className="w-4 h-4 opacity-40" />
                Import a video to overlay on your animation
              </span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">
                <Maximize2 className="w-4 h-4 opacity-40" />
                Clips play on the board during preview &amp; scrubbing (muted)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Selected clip volume bar */}
      {selected && (
        <div className="flex items-center gap-2 px-3 py-1 border-t border-border/50 text-xs">
          <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={selected.volume}
            onChange={(e) => updateVideoClip(selected.id, { volume: Number(e.target.value) })}
            className="w-28 accent-primary"
          />
          <span className="text-muted-foreground tabular-nums w-8 text-right">
            {Math.round(selected.volume * 100)}%
          </span>
          <span className="text-border mx-1">·</span>
          <span className="text-muted-foreground">
            {fmtTime(selected.offset)} → {fmtTime(selected.offset + selected.duration)}
          </span>
          <span className="text-border mx-1">·</span>
          <span className="text-muted-foreground">
            Source: {fmtDuration(selected.sourceDuration)}
          </span>
        </div>
      )}
    </div>
  );
}
