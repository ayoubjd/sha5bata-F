import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Mic,
  Music,
  Scissors,
  Square,
  Trash2,
  Volume2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { sceneDuration, sceneOffsets, useEditor } from "@/lib/editor/store";
import { loadAudioBlob, useAudioPlayback } from "@/lib/editor/audioPlayback";
import type { AudioClip } from "@/lib/editor/types";

const PX_PER_SEC = 80;

const CLIP_COLORS = [
  { bg: "rgba(99,102,241,0.18)", border: "rgba(99,102,241,0.5)", wave: "rgba(99,102,241,0.6)" },
  { bg: "rgba(168,85,247,0.18)", border: "rgba(168,85,247,0.5)", wave: "rgba(168,85,247,0.6)" },
  { bg: "rgba(14,165,233,0.18)", border: "rgba(14,165,233,0.5)", wave: "rgba(14,165,233,0.6)" },
  { bg: "rgba(34,197,94,0.18)", border: "rgba(34,197,94,0.5)", wave: "rgba(34,197,94,0.6)" },
  { bg: "rgba(249,115,22,0.18)", border: "rgba(249,115,22,0.5)", wave: "rgba(249,115,22,0.6)" },
  { bg: "rgba(236,72,153,0.18)", border: "rgba(236,72,153,0.5)", wave: "rgba(236,72,153,0.6)" },
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

function fmtTimer(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Render a waveform from decoded AudioBuffer data into a canvas. */
function WaveformCanvas({
  clipId,
  src,
  width,
  height,
  color,
}: {
  clipId: string;
  src: string;
  width: number;
  height: number;
  color: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    const audio = new Audio(src);
    const ctx = new OfflineAudioContext(1, 1, 44100);
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (cancelled) return;
        const raw = decoded.getChannelData(0);
        const samples = Math.max(1, Math.floor((raw.length / decoded.sampleRate) * 40));
        const step = Math.floor(raw.length / samples);
        const out = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
          let sum = 0;
          const base = i * step;
          const end = Math.min(base + step, raw.length);
          for (let j = base; j < end; j++) sum += Math.abs(raw[j]);
          out[i] = sum / (end - base || 1);
        }
        dataRef.current = out;
        drawWaveform(canvasRef.current, out, width, height, color);
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = new Float32Array(64).fill(0.15);
          dataRef.current = fallback;
          drawWaveform(canvasRef.current, fallback, width, height, color);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width * 2}
      height={height * 2}
      style={{ width, height }}
      className="absolute inset-0 pointer-events-none"
    />
  );
}

function drawWaveform(
  canvas: HTMLCanvasElement | null,
  data: Float32Array,
  w: number,
  h: number,
  color: string,
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w * 2, h * 2);
  const mid = h;
  const barW = Math.max(2, (w * 2) / data.length);
  for (let i = 0; i < data.length; i++) {
    const amp = Math.min(1, data[i] * 3);
    const barH = Math.max(2, amp * mid);
    ctx.fillStyle = color;
    ctx.fillRect(i * barW, mid - barH, barW - 1, barH * 2);
  }
}

/** Global voice-over / music lane spanning the whole video. */
export function AudioTrack({ playing }: { playing: boolean }) {
  const scenes = useEditor((s) => s.scenes);
  const audio = useEditor((s) => s.audio);
  const activeSceneId = useEditor((s) => s.activeSceneId);
  const previewTime = useEditor((s) => s.previewTime);
  const setPreviewTime = useEditor((s) => s.setPreviewTime);
  const setActiveScene = useEditor((s) => s.setActiveScene);
  const addAudioClip = useEditor((s) => s.addAudioClip);
  const updateAudioClip = useEditor((s) => s.updateAudioClip);
  const removeAudioClip = useEditor((s) => s.removeAudioClip);
  const splitAudioClip = useEditor((s) => s.splitAudioClip);
  const selectedAudioId = useEditor((s) => s.selectedAudioId);
  const selectAudio = useEditor((s) => s.selectAudio);

  const offs = sceneOffsets(scenes);
  const index = Math.max(0, scenes.findIndex((s) => s.id === activeSceneId));
  const globalTime = offs[index] + (previewTime ?? 0);
  const videoLength = offs[scenes.length - 1] + sceneDuration(scenes[scenes.length - 1]);
  const audioEnd = audio.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const total = Math.max(videoLength, audioEnd, 10);
  const width = total * PX_PER_SEC;

  useAudioPlayback(audio, globalTime, playing, previewTime !== null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const importBlob = async (blob: Blob, name: string) => {
    const loaded = await loadAudioBlob(blob, name);
    addAudioClip({
      name: loaded.name,
      src: loaded.src,
      start: Math.max(0, globalTime),
      offset: 0,
      duration: loaded.duration,
      sourceDuration: loaded.duration,
      volume: 1,
    });
    toast.success(`${name} added to the audio track`);
  };

  const record = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setRecordingTime(0);
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        await importBlob(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "Voice-over");
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecordingTime(0);
      recTimerRef.current = setInterval(() => setRecordingTime((t) => t + 0.1), 100);
    } catch {
      toast.error("Microphone permission was denied.");
    }
  };

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, []);

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

  const selected = audio.find((c) => c.id === selectedAudioId);

  const handleExportClip = useCallback(
    (clip: AudioClip) => {
      const a = document.createElement("a");
      a.href = clip.src;
      a.download = `${clip.name}.webm`;
      a.click();
    },
    [],
  );

  return (
    <div className="border-t bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs border-b border-border/50">
        <span className="font-semibold flex items-center gap-1.5 shrink-0 text-muted-foreground">
          <Music className="w-3.5 h-3.5" /> Audio
        </span>

        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
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
          <Music className="w-3 h-3" /> Import
        </Button>

        <Button
          size="sm"
          variant={recording ? "destructive" : "ghost"}
          className="h-6 text-[11px] gap-1"
          onClick={record}
        >
          {recording ? (
            <>
              <Square className="w-3 h-3" />
              <span className="animate-pulse">REC</span>
            </>
          ) : (
            <>
              <Mic className="w-3 h-3" /> Record
            </>
          )}
        </Button>

        {recording && (
          <span className="flex items-center gap-1 text-destructive font-mono text-[11px] tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            {fmtTimer(recordingTime)}
          </span>
        )}

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
              className="h-6 px-1.5 text-[11px] gap-1"
              onClick={() => splitAudioClip(selected.id, globalTime)}
              title="Split at playhead"
            >
              <Scissors className="w-3 h-3" /> Split
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px] gap-1"
              onClick={() => handleExportClip(selected)}
              title="Download clip"
            >
              <Download className="w-3 h-3" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px] text-destructive hover:text-destructive"
              onClick={() => removeAudioClip(selected.id)}
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1 text-muted-foreground">
          {audio.length > 0 && (
            <span className="tabular-nums">{audio.length} clip{audio.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Waveform lane */}
      <div className="overflow-x-auto">
        <div
          className="relative h-16 select-none"
          style={{ width }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekGlobal((e.clientX - rect.left) / PX_PER_SEC);
            selectAudio(null);
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

          {/* Audio clips */}
          {audio.map((clip) => {
            const colors = clipColor(clip.id);
            const isSelected = clip.id === selectedAudioId;
            const clipLeft = clip.start * PX_PER_SEC;
            const clipWidth = Math.max(32, clip.duration * PX_PER_SEC);

            return (
              <div
                key={clip.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectAudio(clip.id);
                  drag(e, clip.start, (start) =>
                    updateAudioClip(clip.id, { start: Math.max(0, start) }),
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
                {/* Waveform */}
                <WaveformCanvas
                  clipId={clip.id}
                  src={clip.src}
                  width={clipWidth}
                  height={40}
                  color={colors.wave}
                />

                {/* Left trim handle */}
                <span
                  className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 z-10"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    selectAudio(clip.id);
                    const startStart = clip.start;
                    const startOffset = clip.offset;
                    const startDur = clip.duration;
                    drag(e, 0, (delta) => {
                      const d = Math.max(-startOffset, Math.min(startDur - 0.2, delta));
                      updateAudioClip(clip.id, {
                        start: Math.max(0, startStart + d),
                        offset: startOffset + d,
                        duration: startDur - d,
                      });
                    });
                  }}
                />

                {/* Clip label */}
                <span className="relative z-10 truncate pl-2.5 pr-1 text-foreground font-medium drop-shadow-sm">
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
                    selectAudio(clip.id);
                    drag(e, clip.duration, (duration) =>
                      updateAudioClip(clip.id, {
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

          {audio.length === 0 && !recording && (
            <div className="absolute inset-0 flex items-center justify-center gap-4 text-[11px] text-muted-foreground pointer-events-none">
              <span className="flex items-center gap-1.5">
                <Music className="w-4 h-4 opacity-40" />
                Import an audio file or record your voice-over
              </span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">
                <Scissors className="w-4 h-4 opacity-40" />
                Drag to move · Edges to trim · Split at playhead
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
            onChange={(e) => updateAudioClip(selected.id, { volume: Number(e.target.value) })}
            className="w-28 accent-primary"
          />
          <span className="text-muted-foreground tabular-nums w-8 text-right">
            {Math.round(selected.volume * 100)}%
          </span>
          <span className="text-border mx-1">·</span>
          <span className="text-muted-foreground">
            {fmtTime(selected.offset)} → {fmtTime(selected.offset + selected.duration)}
          </span>
        </div>
      )}
    </div>
  );
}
