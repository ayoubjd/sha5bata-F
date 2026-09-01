import { useEffect, useRef } from "react";
import type { VideoClip } from "@/lib/editor/types";
import { registerVideoElement } from "@/lib/editor/videoRegistry";

/** Renders the video clips active at a global timeline time, overlaid on the
 *  board. Frames are synced to the global time so scrubbing, preview playback
 *  and DOM capture all show the right frame. */
export function VideoOverlay({
  clips,
  time,
  playing,
  muted = true,
  width,
  height,
}: {
  clips: VideoClip[];
  time: number;
  playing: boolean;
  muted?: boolean;
  width: number;
  height: number;
}) {
  const els = useRef(new Map<string, HTMLVideoElement>());

  // cleanup removed clips
  useEffect(() => {
    const map = els.current;
    const ids = new Set(clips.map((c) => c.id));
    for (const [id, el] of map) {
      if (ids.has(id)) continue;
      el.pause();
      registerVideoElement(id, null);
      map.delete(id);
    }
    return () => {
      for (const [id, el] of els.current) {
        el.pause();
        el.currentTime = 0;
        registerVideoElement(id, null);
      }
      els.current.clear();
    };
  }, [clips]);

  const active = clips.filter(
    (c) => time >= c.start && time < c.start + c.duration,
  );

  const sync = (el: HTMLVideoElement, clip: VideoClip) => {
    if (el.currentSrc !== clip.src) el.src = clip.src;
    el.muted = muted;
    el.volume = Math.max(0, Math.min(1, clip.volume));
    const target = clip.offset + (time - clip.start);
    if (Math.abs(el.currentTime - target) > 0.22) {
      try {
        el.currentTime = target;
      } catch {
        /* not seekable yet */
      }
    }
    void el.play().catch(() => undefined);
    if (!playing) el.pause();
  };

  const activeIds = new Set(active.map((c) => c.id));
  for (const clip of active) {
    const el = els.current.get(clip.id);
    if (el) sync(el, clip);
  }
  // keep paused clips that are currently off-window from drifting
  for (const [id, el] of els.current) {
    if (!activeIds.has(id) && !el.paused) el.pause();
  }

  return (
    <>
      {active.map((clip) => (
        <div
          key={clip.id}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 400,
            pointerEvents: "none",
          }}
        >
          <video
            ref={(node) => {
              if (node) {
                els.current.set(clip.id, node);
                registerVideoElement(clip.id, node);
                sync(node, clip);
              } else {
                els.current.delete(clip.id);
                registerVideoElement(clip.id, null);
              }
            }}
            src={clip.src}
            preload="auto"
            muted={muted}
            playsInline
            style={{ width, height, objectFit: "contain" }}
          />
        </div>
      ))}
    </>
  );
}