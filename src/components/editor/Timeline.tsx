import { sceneDuration, useActiveScene, useEditor } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Copy,
  Film,
  GripHorizontal,
  Layers,
  Music,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  Sliders,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { Easing, TransitionType } from "@/lib/editor/types";
import { AudioTrack } from "./AudioTrack";
import { VideoTrack } from "./VideoTrack";

const MIN_H = 120;
const MAX_H = 900;
const PX_PER_SEC = 80;

type TabKey = "scenes" | "tracks" | "keyframes" | "audio";

const TABS: { key: TabKey; label: string; icon: typeof Film }[] = [
  { key: "scenes", label: "Scenes", icon: Film },
  { key: "tracks", label: "Tracks", icon: Layers },
  { key: "keyframes", label: "Keyframes", icon: Sliders },
  { key: "audio", label: "Audio", icon: Music },
];

export function Timeline({
  height = 416,
  onHeightChange,
}: {
  height?: number;
  onHeightChange?: (h: number) => void;
}) {
  const [tab, setTab] = useState<TabKey>("tracks");
  const [pinned, setPinned] = useState<TabKey | null>(null);
  const [playing, setPlaying] = useState(false);

  const scene = useActiveScene();
  const dur = sceneDuration(scene);
  const previewTime = useEditor((s) => s.previewTime);
  const setPreviewTime = useEditor((s) => s.setPreviewTime);
  const addKeyframe = useEditor((s) => s.addKeyframe);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = (useEditor.getState().previewTime ?? 0) + dt;
      if (next >= dur) {
        setPreviewTime(dur);
        setPlaying(false);
        return;
      }
      setPreviewTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, dur, setPreviewTime]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const move = (event: PointerEvent) =>
      onHeightChange?.(Math.max(MIN_H, Math.min(MAX_H, startH + (startY - event.clientY))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const renderPane = (key: TabKey) => {
    if (key === "scenes") return <ScenesPane />;
    if (key === "tracks") return <TracksPane playing={playing} setPlaying={setPlaying} />;
    if (key === "keyframes") return <KeyframesPane />;
    return (
      <div className="flex flex-col">
        <AudioTrack playing={playing} />
        <VideoTrack />
      </div>
    );
  };

  const secondary = pinned && pinned !== tab ? pinned : null;

  return (
    <div className="border-t bg-card flex flex-col shrink-0 overflow-hidden" style={{ height }}>
      {/* Drag to grow the timeline / shrink the board — and back */}
      <div
        onPointerDown={startResize}
        onDoubleClick={() => onHeightChange?.(height > MIN_H + 40 ? MIN_H : 416)}
        title="Drag up for a bigger timeline, down for a bigger board"
        className="h-3 shrink-0 cursor-row-resize flex items-center justify-center bg-muted/40 hover:bg-muted transition-colors"
      >
        <GripHorizontal className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b shrink-0 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <div
            key={key}
            className={`group flex items-center rounded-md border text-xs shrink-0 transition-colors ${
              tab === key
                ? "border-primary bg-secondary"
                : "border-transparent hover:bg-secondary/60"
            }`}
          >
            <button
              onClick={() => setTab(key)}
              className="flex items-center gap-1.5 pl-2 pr-1 py-1 font-medium"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
            <button
              onClick={() => setPinned(pinned === key ? null : key)}
              title={pinned === key ? "Unpin from split view" : "Pin below current tab"}
              className={`px-1.5 py-1 ${
                pinned === key ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"
              }`}
            >
              {pinned === key ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2 pl-2 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              if ((previewTime ?? 0) >= dur) setPreviewTime(0);
              setPlaying((v) => !v);
            }}
            title={playing ? "Pause timeline" : "Play timeline"}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <span className="tabular-nums text-xs text-foreground">
            {(previewTime ?? 0).toFixed(2)}s
          </span>
          {previewTime !== null && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setPlaying(false);
                setPreviewTime(null);
              }}
            >
              Return to edit
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => addKeyframe({ time: previewTime ?? undefined })}
          >
            <Camera className="w-3.5 h-3.5 mr-1" /> Camera move (start + end)
          </Button>
        </div>
      </div>

      {/* Panes — everything scrolls */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className={`${secondary ? "flex-1" : "flex-1"} min-h-0 overflow-auto`}>
          {renderPane(tab)}
        </div>
        {secondary && (
          <div className="flex-1 min-h-0 overflow-auto border-t">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/30 sticky top-0 z-10">
              {TABS.find((t) => t.key === secondary)?.label}
            </div>
            {renderPane(secondary)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Scenes -------------------------------- */

function ScenesPane() {
  const scenes = useEditor((s) => s.scenes);
  const activeSceneId = useEditor((s) => s.activeSceneId);
  const setActiveScene = useEditor((s) => s.setActiveScene);
  const addScene = useEditor((s) => s.addScene);
  const duplicateScene = useEditor((s) => s.duplicateScene);
  const removeScene = useEditor((s) => s.removeScene);
  const setTransition = useEditor((s) => s.setTransition);
  const setAutoFollowCamera = useEditor((s) => s.setAutoFollowCamera);
  const scene = useActiveScene();

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {scenes.map((sc, i) => (
          <button
            key={sc.id}
            onClick={() => setActiveScene(sc.id)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs text-left transition-colors ${
              sc.id === activeSceneId ? "border-primary bg-secondary" : "hover:bg-secondary/50"
            }`}
          >
            <div className="font-semibold">
              {i + 1}. {sc.name}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {sceneDuration(sc).toFixed(1)}s · {sc.transition.type}
            </div>
          </button>
        ))}
        <Button size="sm" variant="secondary" onClick={addScene}>
          <Plus className="w-4 h-4 mr-1" /> Scene
        </Button>
        <Button size="sm" variant="ghost" onClick={() => duplicateScene(activeSceneId)}>
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={scenes.length === 1}
          onClick={() => removeScene(activeSceneId)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs border-t pt-3">
        <span className="font-semibold">Scene controls</span>
        <label className="flex items-center gap-1">
          Transition
          <select
            className="h-7 rounded-md border bg-background px-2"
            value={scene.transition.type}
            onChange={(e) => setTransition(scene.id, { type: e.target.value as TransitionType })}
          >
            <option value="none">Cut</option>
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="wipe">Wipe</option>
            <option value="hand">Hand sweep</option>
          </select>
        </label>
        <NumberField
          label="Length"
          value={scene.transition.duration}
          onChange={(duration) => setTransition(scene.id, { duration: Math.max(0.1, duration) })}
        />
        <label className="flex items-center gap-2">
          Auto-follow camera
          <Switch
            checked={scene.autoFollowCamera}
            onCheckedChange={(enabled) => setAutoFollowCamera(scene.id, enabled)}
          />
        </label>
      </div>
    </div>
  );
}

/* ------------------------------- Tracks -------------------------------- */

function TracksPane({
  playing: _playing,
  setPlaying,
}: {
  playing: boolean;
  setPlaying: (v: boolean) => void;
}) {
  const scene = useActiveScene();
  const dur = sceneDuration(scene);
  const width = Math.max(600, dur * PX_PER_SEC);
  const previewTime = useEditor((s) => s.previewTime);
  const setPreviewTime = useEditor((s) => s.setPreviewTime);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const selectedKeyframeId = useEditor((s) => s.selectedKeyframeId);
  const selectKeyframe = useEditor((s) => s.selectKeyframe);
  const removeKeyframe = useEditor((s) => s.removeKeyframe);
  const updateKeyframe = useEditor((s) => s.updateKeyframe);
  const selectedMoveId = useEditor((s) => s.selectedMoveId);
  const selectMove = useEditor((s) => s.selectMove);
  const updateElement = useEditor((s) => s.updateElement);
  const updateMove = useEditor((s) => s.updateMove);
  const setTransition = useEditor((s) => s.setTransition);
  const scenes = useEditor((s) => s.scenes);

  // outgoing transition (to the next scene): occupies the scene's tail
  const tr = scene.transition;
  const outActive = tr.type !== "none";
  const outStart = Math.max(0, dur - tr.duration);
  // incoming transition (overlap from the previous scene): occupies the head
  const sceneIdx = scenes.findIndex((s2) => s2.id === scene.id);
  const prevScene = sceneIdx > 0 ? scenes[sceneIdx - 1] : null;
  const inTr =
    prevScene && prevScene.transition.type !== "none" ? prevScene.transition : null;

  const timeFromPointer = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(dur, (e.clientX - rect.left) / PX_PER_SEC));
  };

  const dragTime = (e: React.PointerEvent, initial: number, update: (t: number) => void) => {
    e.stopPropagation();
    const startX = e.clientX;
    const move = (event: PointerEvent) => {
      const time = Math.max(0, Math.min(dur, initial + (event.clientX - startX) / PX_PER_SEC));
      update(time);
      setPreviewTime(time);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      style={{ width, minHeight: "100%" }}
      className="relative py-2 select-none"
      onPointerDown={(e) => {
        setPlaying(false);
        setPreviewTime(timeFromPointer(e));
      }}
    >
      <div className="flex text-[10px] text-muted-foreground border-b sticky top-0 bg-card z-20 cursor-col-resize">
        {Array.from({ length: Math.ceil(dur) + 1 }).map((_, i) => (
          <div key={i} style={{ width: PX_PER_SEC }} className="border-r px-1 h-4">
            {i}s
          </div>
        ))}
      </div>
      {/* Camera keyframe guide lines — run all the way down the tracks */}
      {scene.camera.map((k) => (
        <div
          key={`guide-${k.id}`}
          className="absolute top-4 bottom-0 w-px z-10 pointer-events-none"
          style={{
            left: k.time * PX_PER_SEC,
            background:
              k.id === selectedKeyframeId
                ? "var(--color-primary)"
                : "color-mix(in oklch, var(--color-primary) 35%, transparent)",
            opacity: k.id === selectedKeyframeId ? 0.9 : 0.6,
          }}
        />
      ))}
      {/* Transition guide lines — incoming overlap (scene head) and outgoing
          window (scene tail), so you can see exactly where each begins/ends */}
      {inTr && (
        <>
          <div
            className="absolute top-4 bottom-0 w-px z-10 pointer-events-none border-l-2 border-dashed"
            style={{
              left: 0,
              borderColor: "color-mix(in oklch, var(--color-primary) 55%, transparent)",
            }}
          />
          <div
            className="absolute top-4 bottom-0 w-px z-10 pointer-events-none border-l-2"
            style={{
              left: inTr.duration * PX_PER_SEC,
              borderColor: "color-mix(in oklch, var(--color-primary) 55%, transparent)",
            }}
          />
        </>
      )}
      {outActive && (
        <>
          <div
            className="absolute top-4 bottom-0 w-px z-10 pointer-events-none border-l-2 border-dashed"
            style={{
              left: outStart * PX_PER_SEC,
              borderColor: "color-mix(in oklch, var(--color-primary) 55%, transparent)",
            }}
          />
          <div
            className="absolute top-4 bottom-0 w-px z-10 pointer-events-none border-l-2"
            style={{
              left: dur * PX_PER_SEC,
              borderColor: "color-mix(in oklch, var(--color-primary) 55%, transparent)",
            }}
          />
        </>
      )}

      {previewTime !== null && (
        <div
          className="absolute top-2 bottom-0 w-px bg-primary z-30"
          style={{ left: previewTime * PX_PER_SEC }}
        >
          <div
            title="Drag to scrub"
            className="absolute -top-1 -left-2 w-4 h-4 rotate-45 bg-primary cursor-ew-resize"
            onPointerDown={(e) => {
              setPlaying(false);
              dragTime(e, previewTime, () => {});
            }}
          />
          <div
            className="absolute top-2 -left-1.5 bottom-0 w-3 cursor-ew-resize"
            onPointerDown={(e) => {
              setPlaying(false);
              dragTime(e, previewTime, () => {});
            }}
          />
        </div>
      )}

      {/* Camera track */}
      <div className="px-2 pt-2">
        <div className="relative h-7 rounded bg-primary/10 border border-dashed border-primary/40">
          <span className="absolute left-2 top-1 text-[10px] text-muted-foreground">camera</span>
          {scene.camera.map((k) => (
            <button
              key={k.id}
              onClick={() => selectKeyframe(k.id === selectedKeyframeId ? null : k.id)}
              onDoubleClick={() => removeKeyframe(k.id)}
              title={`${k.time.toFixed(1)}s · zoom ${k.zoom.toFixed(2)} · ${k.easing} (double-click to delete)`}
              className="absolute top-1 w-5 h-5 rotate-45 rounded-[3px] border-2 z-20"
              style={{
                left: k.time * PX_PER_SEC - 10,
                background:
                  k.id === selectedKeyframeId ? "var(--color-primary)" : "var(--color-card)",
                borderColor: "var(--color-primary)",
              }}
              onPointerDown={(e) => {
                selectKeyframe(k.id);
                dragTime(e, k.time, (time) => updateKeyframe(k.id, { time }));
              }}
            />
          ))}
        </div>
      </div>

      {/* Transition lane — incoming overlap at the scene head (from the
          previous scene) and outgoing window at the tail. Drag an inner edge
          to change the matching transition length. */}
      <div className="px-2 pt-1">
        <div className="relative h-6 rounded bg-secondary/40 border border-dashed">
          <span className="absolute left-2 top-1 text-[10px] text-muted-foreground">
            transition
          </span>
          {inTr && (
            <div
              className="absolute top-0 bottom-0 rounded-sm bg-primary/10 border-x-2 border-primary/50 overflow-hidden"
              style={{ left: 0, width: Math.max(2, inTr.duration * PX_PER_SEC) }}
              title={`incoming ${inTr.type} · ${inTr.duration.toFixed(1)}s — overlaps from the previous scene, ends at ${inTr.duration.toFixed(1)}s (add elements after this to keep them visible)`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-primary truncate px-1 pointer-events-none">
                ← {inTr.type}
              </span>
              <div
                title="Drag to change the previous scene's transition length"
                className="absolute top-0 bottom-0 -right-1.5 w-3 cursor-ew-resize z-20"
                onPointerDown={(e) =>
                  dragTime(e, inTr.duration, (time) =>
                    setTransition(prevScene!.id, {
                      duration: Math.max(0.1, Math.min(dur - 0.1, time)),
                    }),
                  )
                }
              />
            </div>
          )}
          {outActive ? (
            <div
              className="absolute top-0 bottom-0 rounded-sm bg-primary/20 border-x-2 border-primary/70 overflow-hidden"
              style={{
                left: outStart * PX_PER_SEC,
                width: Math.max(2, (dur - outStart) * PX_PER_SEC),
              }}
              title={`outgoing ${tr.type} · ${tr.duration.toFixed(1)}s — begins at ${outStart.toFixed(1)}s, ends at ${dur.toFixed(1)}s`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-primary truncate px-1 pointer-events-none">
                {tr.type} →
              </span>
              <div
                title="Drag to change transition length"
                className="absolute top-0 bottom-0 -left-1.5 w-3 cursor-ew-resize z-20"
                onPointerDown={(e) =>
                  dragTime(e, outStart, (time) =>
                    setTransition(scene.id, {
                      duration: Math.max(0.1, Math.min(dur - 0.1, dur - time)),
                    }),
                  )
                }
              />
            </div>
          ) : (
            !inTr && (
              <span className="absolute right-2 top-1 text-[10px] text-muted-foreground/60">
                cut — no transition
              </span>
            )
          )}
        </div>
      </div>


      {/* Element tracks */}
      <div className="p-2 space-y-1">
        {scene.elements.map((el) => (
          <div key={el.id} className="relative h-7 rounded bg-secondary/40">
            <button
              onClick={() => select(el.id)}
              className="absolute h-7 rounded-md text-xs px-2 text-primary-foreground truncate flex items-center gap-2 shadow-sm hover:brightness-110"
              style={{
                left: el.startTime * PX_PER_SEC,
                width: el.drawDuration * PX_PER_SEC,
                background:
                  selectedId === el.id ? "var(--color-primary)" : "oklch(0.7 0.15 45)",
              }}
              onPointerDown={(e) => {
                select(el.id);
                dragTime(e, el.startTime, (time) => updateElement(el.id, { startTime: time }));
              }}
            >
              🪶 {el.name}
            </button>
            <div
              className="absolute h-7 rounded-r-md bg-muted-foreground/30 text-[10px] text-muted-foreground flex items-center px-1"
              style={{
                left: (el.startTime + el.drawDuration) * PX_PER_SEC,
                width: el.holdDuration * PX_PER_SEC,
              }}
            >
              hold
            </div>
            {(el.motion ?? []).map((k, i) => (
              <button
                key={k.id}
                onClick={() => {
                  select(el.id);
                  selectMove(k.id);
                }}
                title={`Moves to step ${i + 1} at ${k.time.toFixed(1)}s`}
                className="absolute top-1.5 w-4 h-4 rounded-full border-2 text-[9px] leading-none flex items-center justify-center"
                style={{
                  left: k.time * PX_PER_SEC - 8,
                  background:
                    selectedMoveId === k.id ? "var(--color-primary)" : "var(--color-card)",
                  color:
                    selectedMoveId === k.id
                      ? "var(--color-primary-foreground)"
                      : "var(--color-primary)",
                  borderColor: "var(--color-primary)",
                }}
                onPointerDown={(e) => {
                  select(el.id);
                  selectMove(k.id);
                  dragTime(e, k.time, (time) => updateMove(el.id, k.id, { time }));
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ))}
        {scene.elements.length === 0 && (
          <div className="text-xs text-muted-foreground p-2">
            Add icons, images or text to see them appear on the timeline.
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Keyframes ------------------------------- */

function KeyframesPane() {
  const scene = useActiveScene();
  const dur = sceneDuration(scene);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const selectedKeyframeId = useEditor((s) => s.selectedKeyframeId);
  const selectKeyframe = useEditor((s) => s.selectKeyframe);
  const updateKeyframe = useEditor((s) => s.updateKeyframe);
  const removeKeyframe = useEditor((s) => s.removeKeyframe);
  const addKeyframe = useEditor((s) => s.addKeyframe);
  const selectedMoveId = useEditor((s) => s.selectedMoveId);
  const selectMove = useEditor((s) => s.selectMove);
  const addMove = useEditor((s) => s.addMove);
  const updateMove = useEditor((s) => s.updateMove);
  const removeMove = useEditor((s) => s.removeMove);
  const setPreviewTime = useEditor((s) => s.setPreviewTime);
  const previewTime = useEditor((s) => s.previewTime);

  const element = scene.elements.find((e) => e.id === selectedId);
  const camera = [...scene.camera].sort((a, b) => a.time - b.time);
  const moves = [...(element?.motion ?? [])].sort((a, b) => a.time - b.time);

  return (
    <div className="p-3 space-y-4 text-xs">
      {/* Camera keyframes */}
      <section className="space-y-2">
        <header className="flex items-center justify-between">
          <h3 className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
            Camera keyframes
          </h3>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => addKeyframe({ time: previewTime ?? undefined })}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add move (start + end)
          </Button>
        </header>
        {camera.length === 0 && (
          <p className="text-muted-foreground">
            No camera moves yet. Add one to zoom or pan across the board.
          </p>
        )}
        {camera.map((k, i) => (
          <KeyframeCard
            key={k.id}
            title={i === 0 ? "Camera start" : i === camera.length - 1 ? "Camera end" : `Camera ${i + 1}`}
            active={k.id === selectedKeyframeId}
            onSelect={() => {
              selectKeyframe(k.id);
              setPreviewTime(k.time);
            }}
            onDelete={() => removeKeyframe(k.id)}
          >
            <SliderRow
              label="Time"
              unit="s"
              min={0}
              max={Math.max(dur, k.time)}
              step={0.05}
              value={k.time}
              onChange={(time) => {
                updateKeyframe(k.id, { time });
                setPreviewTime(time);
              }}
            />
            <SliderRow
              label="Zoom"
              unit="×"
              min={0.5}
              max={4}
              step={0.05}
              value={k.zoom}
              onChange={(zoom) => updateKeyframe(k.id, { zoom })}
            />
            <SliderRow
              label="Pan X"
              min={-2000}
              max={2000}
              step={5}
              value={k.x}
              onChange={(x) => updateKeyframe(k.id, { x })}
            />
            <SliderRow
              label="Pan Y"
              min={-2000}
              max={2000}
              step={5}
              value={k.y}
              onChange={(y) => updateKeyframe(k.id, { y })}
            />
            <EasingRow value={k.easing} onChange={(easing) => updateKeyframe(k.id, { easing })} />
          </KeyframeCard>
        ))}
      </section>

      {/* Element motion keyframes */}
      <section className="space-y-2 border-t pt-3">
        <header className="flex items-center justify-between gap-2">
          <h3 className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
            Element motion
          </h3>
          <div className="flex items-center gap-2">
            <select
              className="h-7 rounded-md border bg-background px-2 max-w-40"
              value={selectedId ?? ""}
              onChange={(e) => select(e.target.value || null)}
            >
              <option value="">Select an element…</option>
              {scene.elements.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={!element}
              onClick={() => element && addMove(element.id)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add move
            </Button>
          </div>
        </header>
        {!element && <p className="text-muted-foreground">Pick an element to edit its moves.</p>}
        {element && moves.length === 0 && (
          <p className="text-muted-foreground">
            No moves on “{element.name}”. Add one to make it travel, scale or spin.
          </p>
        )}
        {element &&
          moves.map((k, i) => (
            <KeyframeCard
              key={k.id}
              title={`Move ${i + 1}`}
              active={k.id === selectedMoveId}
              onSelect={() => {
                selectMove(k.id);
                setPreviewTime(k.time);
              }}
              onDelete={() => removeMove(element.id, k.id)}
            >
              <SliderRow
                label="Time"
                unit="s"
                min={0}
                max={Math.max(dur, k.time)}
                step={0.05}
                value={k.time}
                onChange={(time) => {
                  updateMove(element.id, k.id, { time });
                  setPreviewTime(time);
                }}
              />
              <SliderRow
                label="X"
                min={-2000}
                max={2000}
                step={5}
                value={k.x}
                onChange={(x) => updateMove(element.id, k.id, { x })}
              />
              <SliderRow
                label="Y"
                min={-2000}
                max={2000}
                step={5}
                value={k.y}
                onChange={(y) => updateMove(element.id, k.id, { y })}
              />
              <SliderRow
                label="Scale"
                unit="×"
                min={0.1}
                max={4}
                step={0.05}
                value={k.scale}
                onChange={(scale) => updateMove(element.id, k.id, { scale })}
              />
              <SliderRow
                label="Rotate"
                unit="°"
                min={-360}
                max={360}
                step={1}
                value={k.rotation}
                onChange={(rotation) => updateMove(element.id, k.id, { rotation })}
              />
              <EasingRow
                value={k.easing}
                onChange={(easing) => updateMove(element.id, k.id, { easing })}
              />
            </KeyframeCard>
          ))}
      </section>
    </div>
  );
}

function KeyframeCard({
  title,
  active,
  onSelect,
  onDelete,
  children,
}: {
  title: string;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onPointerDown={onSelect}
      className={`rounded-lg border p-2 space-y-1.5 transition-colors ${
        active ? "border-primary bg-secondary/60" : "hover:bg-secondary/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          title="Delete keyframe"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  unit = "",
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <Slider
        className="flex-1"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <Input
        type="number"
        className="h-7 w-20 px-2 text-xs"
        step={step}
        value={Number(value.toFixed(2))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-3 text-muted-foreground">{unit}</span>
    </div>
  );
}

function EasingRow({ value, onChange }: { value: Easing; onChange: (v: Easing) => void }) {
  const options: { key: Easing; label: string }[] = [
    { key: "linear", label: "Linear" },
    { key: "ease", label: "Smooth" },
    { key: "easeIn", label: "Ease in" },
    { key: "easeOut", label: "Ease out" },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">Easing</span>
      <div className="flex rounded-md border overflow-hidden">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={(e) => {
              e.stopPropagation();
              onChange(o.key);
            }}
            className={`px-2 py-1 text-[11px] ${
              value === o.key ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 shrink-0">
      {label}
      <Input
        type="number"
        className="h-7 w-20 px-2 text-xs"
        step={step}
        value={Number(value.toFixed(2))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
