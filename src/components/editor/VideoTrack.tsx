import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Clapperboard, Trash2, Film } from "lucide-react";
import { toast } from "sonner";
import { sceneDuration, sceneOffsets, useEditor } from "@/lib/editor/store";
import { loadVideoBlob } from "@/lib/editor/audioPlayback";

const PX_PER_SEC = 80;

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
    addVideoClip({
      name: loaded.name,
      src: loaded.src,
      start: Math.max(0, globalTime),
      offset: 0,
      duration: loaded.duration,
      sourceDuration: loaded.duration,
      volume: 1,
    });
    toast.success(`${name} added to the video track`);
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
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
        <span className="font-semibold flex items-center gap-1 shrink-0">
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
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
          <Film className="w-3.5 h-3.5 mr-1" /> Add video
        </Button>
        {selected && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <span className="max-w-32 truncate">{selected.name}</span>
            <Button size="sm" variant="ghost" onClick={() => removeVideoClip(selected.id)}>
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
            selectVideo(null);
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
          {video.map((clip) => (
            <div
              key={clip.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                selectVideo(clip.id);
                drag(e, clip.start, (start) =>
                  updateVideoClip(clip.id, { start: Math.max(0, start) }),
                );
              }}
              className={`absolute top-5 h-8 rounded-md border px-2 text-[11px] flex items-center overflow-hidden cursor-grab ${
                clip.id === selectedVideoId
                  ? "border-primary bg-primary/25"
                  : "border-border bg-secondary"
              }`}
              style={{
                left: clip.start * PX_PER_SEC,
                width: Math.max(24, clip.duration * PX_PER_SEC),
              }}
              title={`${clip.name} · ${clip.duration.toFixed(1)}s`}
            >
              <span
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-primary/60"
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
              <span className="truncate pl-2 pr-2">
                🎬 {clip.name} · {clip.duration.toFixed(1)}s
              </span>
              <span
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-primary/60"
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
          ))}
          {video.length === 0 && (
            <div className="absolute left-2 top-7 text-[11px] text-muted-foreground">
              Add a video to overlay it on your animation — drag to move, drag the
              edges to trim. Clips play on the board during preview and scrubbing
              (muted so autoplay is never blocked).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}