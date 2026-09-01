import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Music, Scissors, Square, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { sceneDuration, sceneOffsets, useEditor } from "@/lib/editor/store";
import { loadAudioBlob, useAudioPlayback } from "@/lib/editor/audioPlayback";

const PX_PER_SEC = 80;

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
  const recorderRef = useRef<MediaRecorder | null>(null);

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
        await importBlob(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "Voice-over");
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone permission was denied.");
    }
  };

  useEffect(() => () => recorderRef.current?.stop(), []);

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

  return (
    <div className="border-t bg-card">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
        <span className="font-semibold flex items-center gap-1 shrink-0">
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
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
          Add MP3
        </Button>
        <Button size="sm" variant={recording ? "destructive" : "ghost"} onClick={record}>
          {recording ? <Square className="w-3.5 h-3.5 mr-1" /> : <Mic className="w-3.5 h-3.5 mr-1" />}
          {recording ? "Stop" : "Record voice"}
        </Button>
        {selected && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <span className="max-w-32 truncate">{selected.name}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => splitAudioClip(selected.id, globalTime)}
              title="Split at playhead"
            >
              <Scissors className="w-3.5 h-3.5 mr-1" /> Split
            </Button>
            <label className="flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={selected.volume}
                onChange={(e) => updateAudioClip(selected.id, { volume: Number(e.target.value) })}
                className="w-24"
              />
            </label>
            <Button size="sm" variant="ghost" onClick={() => removeAudioClip(selected.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <div
          className="relative h-14 select-none"
          style={{ width }}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekGlobal((e.clientX - rect.left) / PX_PER_SEC);
            selectAudio(null);
          }}
        >
          {scenes.map((sc, i) => (
            <div
              key={sc.id}
              className="absolute top-0 bottom-0 border-l border-dashed border-border text-[10px] text-muted-foreground pl-1"
              style={{ left: offs[i] * PX_PER_SEC }}
            >
              {sc.name}
            </div>
          ))}
          <div
            className="absolute top-0 bottom-0 w-px bg-primary z-30 pointer-events-none"
            style={{ left: globalTime * PX_PER_SEC }}
          />
          {audio.map((clip) => (
            <div
              key={clip.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                selectAudio(clip.id);
                drag(e, clip.start, (start) => updateAudioClip(clip.id, { start: Math.max(0, start) }));
              }}
              className={`absolute top-5 h-8 rounded-md border px-2 text-[11px] flex items-center overflow-hidden cursor-grab ${
                clip.id === selectedAudioId
                  ? "border-primary bg-primary/25"
                  : "border-border bg-secondary"
              }`}
              style={{ left: clip.start * PX_PER_SEC, width: Math.max(24, clip.duration * PX_PER_SEC) }}
              title={`${clip.name} · ${clip.duration.toFixed(1)}s`}
            >
              <span
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-primary/60"
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
              <span className="truncate pl-2 pr-2">🎙 {clip.name}</span>
              <span
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-primary/60"
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
          ))}
          {audio.length === 0 && (
            <div className="absolute left-2 top-7 text-[11px] text-muted-foreground">
              Add an MP3 or record your voice — then drag to move, drag the edges to trim, and Split at the playhead.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
