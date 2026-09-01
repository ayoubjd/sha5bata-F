import { create } from "zustand";
import type { CustomFont } from "./fonts";
import { setSfxVolume as setSfxVolumeGlobal } from "./sfx";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  EASINGS,
  type AudioClip,
  type CameraKeyframe,
  type CameraState,
  type CanvasMode,
  type MoveKeyframe,
  type Scene,
  type SceneElement,
  type Transition,
  type VideoClip,
} from "./types";

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeScene(index: number): Scene {
  return {
    id: newId(),
    name: `Scene ${index}`,
    bgColor: "#fffdf5",
    elements: [],
    camera: [],
    transition: { type: "fade", duration: 0.8 },
    autoFollowCamera: false,
  };
}

export function sceneDuration(scene: Scene): number {
  if (scene.elements.length === 0) return 3;
  return Math.max(
    ...scene.elements.map(
      (e) => e.startTime + e.drawDuration + e.holdDuration,
    ),
    ...scene.elements.flatMap((e) => (e.motion ?? []).map((k) => k.time)),
    ...scene.camera.map((k) => k.time),
    3,
  );
}

/** Framing that keeps one element comfortably centred. */
function focusOn(
  el: SceneElement,
  t: number,
  w: number,
  h: number,
): CameraState {
  const pose = elementPoseAt(el, t);
  const ew = el.width * pose.scale;
  const eh = el.height * pose.scale;
  return {
    x: pose.x + el.width / 2,
    y: pose.y + el.height / 2,
    zoom: Math.min(
      2.4,
      Math.max(1, Math.min(w / (ew * 2.2), h / (eh * 2.2))),
    ),
  };
}

const FOLLOW_BLEND = 1.1; // seconds spent easing between two focus points

function lerpCam(a: CameraState, b: CameraState, e: number): CameraState {
  return {
    x: a.x + (b.x - a.x) * e,
    y: a.y + (b.y - a.y) * e,
    zoom: a.zoom + (b.zoom - a.zoom) * e,
  };
}

/** Camera transform for a scene at a local time. */
export function cameraAt(
  scene: Scene,
  t: number,
  canvasWidth: number = CANVAS_WIDTH,
  canvasHeight: number = CANVAS_HEIGHT,
): CameraState {
  const rest: CameraState = { x: canvasWidth / 2, y: canvasHeight / 2, zoom: 1 };

  if (scene.autoFollowCamera) {
    const els = [...scene.elements].sort((a, b) => a.startTime - b.startTime);
    if (els.length === 0) return rest;

    // When the camera should *begin* travelling towards each element, so it
    // has already arrived by the time that element starts animating.
    const switchT: number[] = [];
    for (let k = 0; k < els.length; k++) {
      const lead = Math.max(0, els[k].startTime - FOLLOW_BLEND);
      if (k === 0) switchT.push(Math.min(lead, els[k].startTime));
      else {
        const hold = Math.max(0, els[k - 1].cameraHold ?? 0);
        switchT.push(Math.max(lead, switchT[k - 1] + FOLLOW_BLEND + hold));
      }
    }

    let i = -1;
    for (let k = 0; k < els.length; k++) if (switchT[k] <= t) i = k;
    if (i === -1) return rest;

    const cur = els[i];
    const target = focusOn(cur, t, canvasWidth, canvasHeight);
    const since = t - switchT[i];
    if (since >= FOLLOW_BLEND) return target;

    // ease from wherever the camera was framing before this element appeared
    const from =
      i === 0
        ? rest
        : focusOn(els[i - 1], switchT[i], canvasWidth, canvasHeight);
    return lerpCam(from, target, EASINGS.ease(Math.max(0, since / FOLLOW_BLEND)));
  }


  const sorted = [...scene.camera].sort((a, b) => a.time - b.time);
  if (sorted.length === 0) return rest;
  // Implicit "rest" keyframe at t=0 so a single keyframe still animates
  // from the default framing instead of freezing the whole scene.
  const ks =
    sorted[0].time > 0.001
      ? [
          {
            ...sorted[0],
            id: "__start",
            time: 0,
            ...rest,
          } as CameraKeyframe,
          ...sorted,
        ]
      : sorted;
  if (t <= ks[0].time) return { x: ks[0].x, y: ks[0].y, zoom: ks[0].zoom };
  const last = ks[ks.length - 1];
  if (t >= last.time) return { x: last.x, y: last.y, zoom: last.zoom };
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (t >= a.time && t <= b.time) {
      const raw = b.time === a.time ? 1 : (t - a.time) / (b.time - a.time);
      const e = EASINGS[b.easing](Math.max(0, Math.min(1, raw)));
      return {
        x: a.x + (b.x - a.x) * e,
        y: a.y + (b.y - a.y) * e,
        zoom: a.zoom + (b.zoom - a.zoom) * e,
      };
    }
  }
  return rest;
}

/* ------------------------- element motion paths ------------------------- */

export interface ElementPose {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

/** Position/scale/rotation of an element at a local scene time. */
export function elementPoseAt(el: SceneElement, t: number): ElementPose {
  const base: ElementPose = {
    x: el.x,
    y: el.y,
    scale: 1,
    rotation: el.rotation,
  };
  const ks = [...(el.motion ?? [])].sort((a, b) => a.time - b.time);
  if (ks.length === 0) return base;

  const startTime = el.startTime + el.drawDuration;
  const full = [
    {
      id: "__base",
      time: Math.min(startTime, ks[0].time),
      x: el.x,
      y: el.y,
      scale: 1,
      rotation: el.rotation,
      easing: "ease" as const,
    },
    ...ks,
  ];

  if (t <= full[0].time) return base;
  const last = full[full.length - 1];
  if (t >= last.time)
    return { x: last.x, y: last.y, scale: last.scale, rotation: last.rotation };

  for (let i = 0; i < full.length - 1; i++) {
    const a = full[i];
    const b = full[i + 1];
    if (t >= a.time && t <= b.time) {
      const raw = b.time === a.time ? 1 : (t - a.time) / (b.time - a.time);
      const e = EASINGS[b.easing](Math.max(0, Math.min(1, raw)));
      return {
        x: a.x + (b.x - a.x) * e,
        y: a.y + (b.y - a.y) * e,
        scale: a.scale + (b.scale - a.scale) * e,
        rotation: a.rotation + (b.rotation - a.rotation) * e,
      };
    }
  }
  return base;
}

interface EditorState {
  scenes: Scene[];
  audio: AudioClip[];
  video: VideoClip[];
  selectedAudioId: string | null;
  selectedVideoId: string | null;
  activeSceneId: string;
  selectedId: string | null;
  selectedKeyframeId: string | null;
  selectedMoveId: string | null;
  showQuill: boolean;
  canvasMode: CanvasMode;
  previewTime: number | null; // scrubbed time in the editor canvas (local)
  propertiesCollapsed: boolean;
  setPropertiesCollapsed: (collapsed: boolean) => void;

  // undo / redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // scenes
  addScene: () => void;
  duplicateScene: (id: string) => void;
  removeScene: (id: string) => void;
  setActiveScene: (id: string) => void;
  renameScene: (id: string, name: string) => void;
  setTransition: (id: string, patch: Partial<Transition>) => void;
  reorderScene: (id: string, dir: -1 | 1) => void;

  // elements (operate on the active scene)
  addElement: (el: SceneElement) => void;
  updateElement: (id: string, patch: Partial<SceneElement>) => void;
  removeElement: (id: string) => void;
  select: (id: string | null) => void;
  setBg: (c: string) => void;
  setBgPreset: (id: string | null) => void;
  /** Use a user-imported image (data URL) as the scene background. */
  setBgImage: (src: string | null) => void;
  /** Background images the user imported this session. */
  customBackgrounds: { id: string; name: string; src: string }[];
  addBackgroundImage: (name: string, src: string) => void;
  /** Master volume for the paper hand sound effects (0..1). */
  sfxVolume: number;
  setSfxVolume: (v: number) => void;
  customFonts: CustomFont[];
  addFonts: (fonts: CustomFont[]) => void;
  selectKeyframe: (id: string | null) => void;
  selectMove: (id: string | null) => void;
  setShowQuill: (v: boolean) => void;
  /** Set "keep camera here": mirrors the time into hold and shifts later elements. */
  setCameraHold: (elementId: string, seconds: number) => void;
  setCanvasMode: (mode: CanvasMode) => void;
  setAutoFollowCamera: (id: string, enabled: boolean) => void;

  // element motion keyframes
  addMove: (elementId: string) => void;
  updateMove: (elementId: string, moveId: string, patch: Partial<MoveKeyframe>) => void;
  removeMove: (elementId: string, moveId: string) => void;

  // camera keyframes (active scene)
  addKeyframe: (kf?: Partial<CameraKeyframe>) => void;
  updateKeyframe: (id: string, patch: Partial<CameraKeyframe>) => void;
  removeKeyframe: (id: string) => void;

  setPreviewTime: (t: number | null) => void;

  // audio clips (global timeline)
  addAudioClip: (clip: Omit<AudioClip, "id">) => void;
  updateAudioClip: (id: string, patch: Partial<AudioClip>) => void;
  removeAudioClip: (id: string) => void;
  splitAudioClip: (id: string, atGlobalTime: number) => void;
  selectAudio: (id: string | null) => void;

  // video clips (global timeline)
  addVideoClip: (clip: Omit<VideoClip, "id">) => void;
  updateVideoClip: (id: string, patch: Partial<VideoClip>) => void;
  removeVideoClip: (id: string) => void;
  selectVideo: (id: string | null) => void;

  // derived
  activeScene: () => Scene;
  totalDuration: () => number; // active scene
  videoDuration: () => number; // all scenes incl. transition overlaps
}

const first = makeScene(1);

function patchScene(
  s: { scenes: Scene[] },
  id: string,
  fn: (sc: Scene) => Scene,
) {
  return { scenes: s.scenes.map((sc) => (sc.id === id ? fn(sc) : sc)) };
}

/** Serialised snapshot of the editable document (everything undo can restore). */
type DocSnapshot = {
  scenes: Scene[];
  audio: AudioClip[];
  video: VideoClip[];
};

const HISTORY_LIMIT = 100;

/** True when the two document snapshots differ in any field. */
function docDiffers(a: DocSnapshot, b: DocSnapshot): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export const useEditor = create<EditorState>((rawSet, get) => {
  let past: DocSnapshot[] = [];
  let future: DocSnapshot[] = [];

  const snapshot = (s: {
    scenes: Scene[];
    audio: AudioClip[];
    video: VideoClip[];
  }): DocSnapshot =>
    JSON.parse(
      JSON.stringify({ scenes: s.scenes, audio: s.audio, video: s.video }),
    );

  // Wrap set: record the document state that existed *before* each change.
  // Only document fields (scenes/audio) are history-relevant, so everything
  // else (selection, preview scrubbing, mode toggles) passes through silently.
  const set: typeof rawSet = (partial) => {
    const beforeScenes = get().scenes;
    const beforeAudio = get().audio;
    const beforeVideo = get().video;
    rawSet(partial);
    // Fast path: if the arrays weren't replaced, nothing document-altering changed.
    if (
      get().scenes === beforeScenes &&
      get().audio === beforeAudio &&
      get().video === beforeVideo
    )
      return;
    const before = snapshot({ audio: beforeAudio, scenes: beforeScenes, video: beforeVideo });
    if (docDiffers(before, snapshot(get()))) {
      past.push(before);
      if (past.length > HISTORY_LIMIT) past.shift();
      future = [];
      rawSet({ canUndo: true, canRedo: false });
    }
  };

  return {
    scenes: [first],
    audio: [],
    video: [],
    selectedAudioId: null,
    selectedVideoId: null,
    activeSceneId: first.id,
    selectedId: null,
    selectedKeyframeId: null,
    selectedMoveId: null,
    showQuill: true,
    canvasMode: "landscape",
    propertiesCollapsed: false,
    previewTime: null,
    canUndo: false,
    canRedo: false,
    undo: () => {
      const prev = past[past.length - 1];
      if (!prev) return;
      past.pop();
      future.push(snapshot(get()));
      rawSet({
        ...prev,
        selectedId: null,
        selectedKeyframeId: null,
        selectedMoveId: null,
        selectedAudioId: null,
        selectedVideoId: null,
        canUndo: past.length > 0,
        canRedo: true,
      });
    },
    redo: () => {
      const next = future[future.length - 1];
      if (!next) return;
      future.pop();
      past.push(snapshot(get()));
      rawSet({
        ...next,
        selectedId: null,
        selectedKeyframeId: null,
        selectedMoveId: null,
        selectedAudioId: null,
        selectedVideoId: null,
        canUndo: true,
        canRedo: future.length > 0,
      });
    },
  customFonts: [],
  addFonts: (fonts) =>
    set((s) => {
      const key = (f: CustomFont) => `${f.family}|${f.weight}|${f.style}`;
      const have = new Set(s.customFonts.map(key));
      return {
        customFonts: [...s.customFonts, ...fonts.filter((f) => !have.has(key(f)))],
      };
    }),
  customBackgrounds: [],
  addBackgroundImage: (name, src) =>
    set((s) => ({
      customBackgrounds: [...s.customBackgrounds, { id: newId(), name, src }],
    })),
  sfxVolume: 0.85,
  setSfxVolume: (v) => {
    setSfxVolumeGlobal(v);
    set({ sfxVolume: v });
  },

  addScene: () =>
    set((s) => {
      const sc = makeScene(s.scenes.length + 1);
      return { scenes: [...s.scenes, sc], activeSceneId: sc.id, selectedId: null };
    }),
  duplicateScene: (id) =>
    set((s) => {
      const src = s.scenes.find((x) => x.id === id);
      if (!src) return s;
      const copy: Scene = {
        ...src,
        id: newId(),
        name: `${src.name} copy`,
        elements: src.elements.map((e) => ({ ...e, id: newId() })),
        camera: src.camera.map((k) => ({ ...k, id: newId() })),
      };
      const idx = s.scenes.findIndex((x) => x.id === id);
      const next = s.scenes.slice();
      next.splice(idx + 1, 0, copy);
      return { scenes: next, activeSceneId: copy.id, selectedId: null };
    }),
  removeScene: (id) =>
    set((s) => {
      if (s.scenes.length === 1) return s;
      const next = s.scenes.filter((x) => x.id !== id);
      return {
        scenes: next,
        activeSceneId: s.activeSceneId === id ? next[0].id : s.activeSceneId,
        selectedId: null,
      };
    }),
  setActiveScene: (id) => set({ activeSceneId: id, selectedId: null, previewTime: 0 }),
  renameScene: (id, name) => set((s) => patchScene(s, id, (sc) => ({ ...sc, name }))),
  setTransition: (id, patch) =>
    set((s) =>
      patchScene(s, id, (sc) => {
        const transition = { ...sc.transition, ...patch };
        // the hand sweep needs a bit more stage time than fades — give it a
        // comfortable 1.5s default whenever the user switches to it
        if (patch.type === "hand" && patch.duration === undefined && sc.transition.type !== "hand") {
          transition.duration = 1.5;
        }
        return { ...sc, transition };
      }),
    ),
  reorderScene: (id, dir) =>
    set((s) => {
      const idx = s.scenes.findIndex((x) => x.id === id);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= s.scenes.length) return s;
      const next = s.scenes.slice();
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return { scenes: next };
    }),

  addElement: (el) =>
    set((s) => ({
      ...patchScene(s, s.activeSceneId, (sc) => ({
        ...sc,
        elements: [...sc.elements, el],
      })),
      selectedId: el.id,
    })),
  updateElement: (id, patch) =>
    set((s) =>
      patchScene(s, s.activeSceneId, (sc) => ({
        ...sc,
        elements: sc.elements.map((e) =>
          e.id === id ? ({ ...e, ...patch } as SceneElement) : e,
        ),
      })),
    ),
  removeElement: (id) =>
    set((s) => ({
      ...patchScene(s, s.activeSceneId, (sc) => ({
        ...sc,
        elements: sc.elements.filter((e) => e.id !== id),
      })),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  select: (id) => set({ selectedId: id }),
  selectKeyframe: (id) => set({ selectedKeyframeId: id }),
  selectMove: (id) => set({ selectedMoveId: id }),
  setShowQuill: (v) => set({ showQuill: v }),
  setCameraHold: (elementId, seconds) =>
    set((s) =>
      patchScene(s, s.activeSceneId, (sc) => {
        const el = sc.elements.find((e) => e.id === elementId);
        if (!el) return sc;
        const next = Math.max(0, seconds);
        const delta = next - Math.max(0, el.cameraHold ?? 0);
        if (delta === 0) return sc;
        const endOfEl = el.startTime + el.drawDuration + el.holdDuration;
        return {
          ...sc,
          elements: sc.elements.map((e) => {
            if (e.id === elementId)
              return {
                ...e,
                cameraHold: next,
                holdDuration: Math.max(0, e.holdDuration + delta),
              } as SceneElement;
            // push everything that starts after this element forward
            if (e.startTime >= endOfEl - 0.001)
              return {
                ...e,
                startTime: Math.max(0, e.startTime + delta),
                motion: (e.motion ?? []).map((k) => ({
                  ...k,
                  time: Math.max(0, k.time + delta),
                })),
              } as SceneElement;
            return e;
          }),
        };
      }),
    ),
  setCanvasMode: (canvasMode) => set({ canvasMode }),
  setPropertiesCollapsed: (propertiesCollapsed) => set({ propertiesCollapsed }),
  setAutoFollowCamera: (id, enabled) =>
    set((s) => patchScene(s, id, (sc) => ({ ...sc, autoFollowCamera: enabled }))),

  addMove: (elementId) =>
    set((s) =>
      patchScene(s, s.activeSceneId, (sc) => ({
        ...sc,
        elements: sc.elements.map((e) => {
          if (e.id !== elementId) return e;
          const ks = e.motion ?? [];
          const prev = ks[ks.length - 1];
          const startTime = e.startTime + e.drawDuration;
          const next: MoveKeyframe = {
            id: newId(),
            time: (prev ? prev.time : startTime) + 1,
            x: (prev ? prev.x : e.x) + 120,
            y: prev ? prev.y : e.y,
            scale: prev ? prev.scale : 1,
            rotation: prev ? prev.rotation : e.rotation,
            easing: "ease",
          };
          return { ...e, motion: [...ks, next] } as SceneElement;
        }),
      })),
    ),
  updateMove: (elementId, moveId, patch) =>
    set((s) =>
      patchScene(s, s.activeSceneId, (sc) => ({
        ...sc,
        elements: sc.elements.map((e) =>
          e.id === elementId
            ? ({
                ...e,
                motion: (e.motion ?? [])
                  .map((k) => (k.id === moveId ? { ...k, ...patch } : k))
                  .sort((a, b) => a.time - b.time),
              } as SceneElement)
            : e,
        ),
      })),
    ),
  removeMove: (elementId, moveId) =>
    set((s) => ({
      ...patchScene(s, s.activeSceneId, (sc) => ({
        ...sc,
        elements: sc.elements.map((e) =>
          e.id === elementId
            ? ({ ...e, motion: (e.motion ?? []).filter((k) => k.id !== moveId) } as SceneElement)
            : e,
        ),
      })),
      selectedMoveId: s.selectedMoveId === moveId ? null : s.selectedMoveId,
    })),

  setBg: (c) =>
    set((s) => patchScene(s, s.activeSceneId, (sc) => ({ ...sc, bgColor: c }))),
  setBgPreset: (id) =>
    set((s) =>
      patchScene(s, s.activeSceneId, (sc) => ({ ...sc, bgPreset: id, bgImage: null })),
    ),
  setBgImage: (src) =>
    set((s) =>
      patchScene(s, s.activeSceneId, (sc) => ({ ...sc, bgImage: src, bgPreset: null })),
    ),

  addKeyframe: (kf) =>
    set((s) => {
      const startId = newId();
      return {
        ...patchScene(s, s.activeSceneId, (sc) => {
          const time = kf?.time ?? sceneDuration(sc) / 2;
          const base = cameraAt(sc, time);
          // A camera move needs a start and an end: add both so the user can
          // frame where the camera begins and where it finishes.
          const start: CameraKeyframe = {
            id: startId,
            time,
            x: kf?.x ?? base.x ?? CANVAS_WIDTH / 2,
            y: kf?.y ?? base.y ?? CANVAS_HEIGHT / 2,
            zoom: kf?.zoom ?? base.zoom ?? 1,
            easing: kf?.easing ?? "ease",
          };
          const end: CameraKeyframe = {
            ...start,
            id: newId(),
            time: Math.min(sceneDuration(sc), time + 2),
          };

          return {
            ...sc,
            camera: [...sc.camera, start, end].sort((a, b) => a.time - b.time),
          };
        }),
        selectedKeyframeId: startId,
      };
    }),
  updateKeyframe: (id, patch) =>
    set((s) =>
      patchScene(s, s.activeSceneId, (sc) => ({
        ...sc,
        camera: sc.camera
          .map((k) => (k.id === id ? { ...k, ...patch } : k))
          .sort((a, b) => a.time - b.time),
      })),
    ),
  removeKeyframe: (id) =>
    set((s) =>
      patchScene(s, s.activeSceneId, (sc) => ({
        ...sc,
        camera: sc.camera.filter((k) => k.id !== id),
      })),
    ),

  setPreviewTime: (t) => set({ previewTime: t }),

  addAudioClip: (clip) =>
    set((s) => {
      const id = newId();
      return { audio: [...s.audio, { ...clip, id }], selectedAudioId: id };
    }),
  updateAudioClip: (id, patch) =>
    set((s) => ({
      audio: s.audio.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  removeAudioClip: (id) =>
    set((s) => ({
      audio: s.audio.filter((c) => c.id !== id),
      selectedAudioId: s.selectedAudioId === id ? null : s.selectedAudioId,
    })),
  splitAudioClip: (id, atGlobalTime) =>
    set((s) => {
      const clip = s.audio.find((c) => c.id === id);
      if (!clip) return s;
      const cut = atGlobalTime - clip.start;
      if (cut <= 0.05 || cut >= clip.duration - 0.05) return s;
      const left: AudioClip = { ...clip, duration: cut };
      const right: AudioClip = {
        ...clip,
        id: newId(),
        start: clip.start + cut,
        offset: clip.offset + cut,
        duration: clip.duration - cut,
      };
      return {
        audio: s.audio.flatMap((c) => (c.id === id ? [left, right] : [c])),
        selectedAudioId: right.id,
      };
    }),
  selectAudio: (id) => set({ selectedAudioId: id }),

  addVideoClip: (clip) =>
    set((s) => {
      const id = newId();
      return {
        video: [...s.video, { ...clip, id }],
        selectedVideoId: id,
        selectedAudioId: null,
      };
    }),
  updateVideoClip: (id, patch) =>
    set((s) => ({
      video: s.video.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  removeVideoClip: (id) =>
    set((s) => ({
      video: s.video.filter((c) => c.id !== id),
      selectedVideoId: s.selectedVideoId === id ? null : s.selectedVideoId,
    })),
  selectVideo: (id) => set({ selectedVideoId: id }),

  activeScene: () =>
    get().scenes.find((s) => s.id === get().activeSceneId) ?? get().scenes[0],
  totalDuration: () => sceneDuration(get().activeScene()),
  videoDuration: () => {
    const scenes = get().scenes;
    const video = scenes.reduce((acc, sc, i) => {
      const overlap =
        i < scenes.length - 1 && sc.transition.type !== "none"
          ? sc.transition.duration
          : 0;
      return acc + sceneDuration(sc) - overlap;
    }, 0);
    const audioEnd = get().audio.reduce(
      (max, c) => Math.max(max, c.start + c.duration),
      0,
    );
    const videoEnd = get().video.reduce(
      (max, c) => Math.max(max, c.start + c.duration),
      0,
    );
    return Math.max(video, audioEnd, videoEnd);
  },
  };
});

/** Reactive hook for the active scene. */
export function useActiveScene(): Scene {
  return useEditor((s) => s.scenes.find((x) => x.id === s.activeSceneId) ?? s.scenes[0]);
}

/** Global start time of each scene on the final video timeline. */
export function sceneOffsets(scenes: Scene[]): number[] {
  const offs: number[] = [];
  let acc = 0;
  scenes.forEach((sc, i) => {
    offs.push(acc);
    const overlap =
      i < scenes.length - 1 && sc.transition.type !== "none"
        ? sc.transition.duration
        : 0;
    acc += sceneDuration(sc) - overlap;
  });
  return offs;
}
