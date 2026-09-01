import { useEffect, useRef } from "react";
import type { AudioClip, VideoClip } from "./types";

/**
 * Keeps one <audio> element per clip in sync with a global timeline position.
 * `time` is the playhead in seconds; when `playing` is false clips are paused
 * but kept seeked so scrubbing stays responsive.
 */
export function useAudioPlayback(
  clips: AudioClip[],
  time: number,
  playing: boolean,
  enabled = true,
) {
  const pool = useRef(new Map<string, HTMLAudioElement>());
  const timeRef = useRef(time);
  timeRef.current = time;

  // clean up removed clips
  useEffect(() => {
    const map = pool.current;
    const ids = new Set(clips.map((c) => c.id));
    for (const [id, el] of map) {
      if (!ids.has(id)) {
        el.pause();
        map.delete(id);
      }
    }
  }, [clips]);

  useEffect(() => {
    const map = pool.current;
    return () => {
      for (const el of map.values()) el.pause();
      map.clear();
    };
  }, []);

  useEffect(() => {
    const map = pool.current;
    for (const clip of clips) {
      let el = map.get(clip.id);
      if (!el) {
        el = new Audio(clip.src);
        el.preload = "auto";
        map.set(clip.id, el);
      }
      if (el.src !== clip.src) el.src = clip.src;
      el.volume = Math.max(0, Math.min(1, clip.volume));

      const inside =
        enabled && time >= clip.start && time < clip.start + clip.duration;
      const target = clip.offset + (time - clip.start);

      if (!inside) {
        if (!el.paused) el.pause();
        continue;
      }
      if (Math.abs(el.currentTime - target) > 0.22) {
        try {
          el.currentTime = target;
        } catch {
          /* not seekable yet */
        }
      }
      if (playing && el.paused) void el.play().catch(() => undefined);
      if (!playing && !el.paused) el.pause();
    }
  }, [clips, time, playing, enabled]);
}

/** Reads duration + creates an object URL for an uploaded/recorded blob. */
export async function loadAudioBlob(blob: Blob, name: string) {
  const src = URL.createObjectURL(blob);
  const duration = await new Promise<number>((resolve) => {
    const el = new Audio(src);
    el.addEventListener("loadedmetadata", () => {
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      if (d > 0) resolve(d);
      else {
        // Chrome reports Infinity for some recordings — force a seek
        el.currentTime = 1e101;
        el.addEventListener("timeupdate", function once() {
          el.removeEventListener("timeupdate", once);
          resolve(Number.isFinite(el.duration) ? el.duration : 0);
        });
      }
    });
    el.addEventListener("error", () => resolve(0));
  });
  return { src, name, duration: duration || 5 };
}

/**
 * Keeps one <video> element per clip in sync with a global timeline position.
 * Mirrors useAudioPlayback but for overlay videos that play on the board.
 */
export function useVideoPlayback(
  clips: VideoClip[],
  time: number,
  playing: boolean,
  enabled = true,
) {
  const pool = useRef(new Map<string, HTMLVideoElement>());
  const timeRef = useRef(time);
  timeRef.current = time;

  useEffect(() => {
    const map = pool.current;
    const ids = new Set(clips.map((c) => c.id));
    for (const [id, el] of map) {
      if (!ids.has(id)) {
        el.pause();
        map.delete(id);
      }
    }
  }, [clips]);

  useEffect(() => {
    const map = pool.current;
    return () => {
      for (const el of map.values()) el.pause();
      map.clear();
    };
  }, []);

  useEffect(() => {
    const map = pool.current;
    for (const clip of clips) {
      let el = map.get(clip.id);
      if (!el) {
        el = document.createElement("video");
        el.preload = "auto";
        el.muted = true;
        map.set(clip.id, el);
      }
      if (el.src !== clip.src) el.src = clip.src;
      el.volume = Math.max(0, Math.min(1, clip.volume));

      const inside =
        enabled && time >= clip.start && time < clip.start + clip.duration;
      const target = clip.offset + (time - clip.start);

      if (!inside) {
        if (!el.paused) el.pause();
        continue;
      }
      if (Math.abs(el.currentTime - target) > 0.22) {
        try {
          el.currentTime = target;
        } catch {
          /* not seekable yet */
        }
      }
      if (playing && el.paused) void el.play().catch(() => undefined);
      if (!playing && !el.paused) el.pause();
    }
  }, [clips, time, playing, enabled]);
}

/** Reads duration + creates an object URL for an uploaded video blob. */
export async function loadVideoBlob(blob: Blob, name: string) {
  const src = URL.createObjectURL(blob);
  const duration = await new Promise<number>((resolve) => {
    const el = document.createElement("video");
    el.preload = "auto";
    el.addEventListener("loadedmetadata", () => {
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      if (d > 0) resolve(d);
      else {
        el.currentTime = 1e101;
        el.addEventListener("timeupdate", function once() {
          el.removeEventListener("timeupdate", once);
          resolve(Number.isFinite(el.duration) ? el.duration : 0);
        });
      }
    });
    el.addEventListener("error", () => resolve(0));
    el.src = src;
  });
  return { src, name, duration: duration || 5 };
}
