import { backgroundById } from "@/lib/editor/backgrounds";
import { useCallback, useEffect, useRef, useState } from "react";
import { sceneOffsets, useActiveScene, useEditor } from "@/lib/editor/store";
import { canvasDimensions } from "@/lib/editor/types";
import { CanvasElement } from "./CanvasElement";
import { SceneLayer } from "./Stage";
import { VideoOverlay } from "./VideoOverlay";

type CamDrag = "move" | "resize" | null;

const EDGE = 14;

/** Clickable/draggable border strips for a camera frame; the inside stays
 *  transparent to pointer events so elements below remain selectable. */
function CamEdges({
  onDown,
  title,
  cursor,
}: {
  onDown: (e: React.PointerEvent) => void;
  title: string;
  cursor: string;
}) {
  const base: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "auto",
    cursor,
    touchAction: "none",
  };
  return (
    <>
      {[
        { top: -EDGE / 2, left: 0, right: 0, height: EDGE },
        { bottom: -EDGE / 2, left: 0, right: 0, height: EDGE },
        { top: 0, bottom: 0, left: -EDGE / 2, width: EDGE },
        { top: 0, bottom: 0, right: -EDGE / 2, width: EDGE },
      ].map((pos, i) => (
        <div key={i} title={title} onPointerDown={onDown} style={{ ...base, ...pos }} />
      ))}
    </>
  );
}

export function Canvas() {
  const scene = useActiveScene();
  const video = useEditor((s) => s.video);
  const scenes = useEditor((s) => s.scenes);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const selectedKeyframeId = useEditor((s) => s.selectedKeyframeId);
  const selectKeyframe = useEditor((s) => s.selectKeyframe);
  const updateKeyframe = useEditor((s) => s.updateKeyframe);
  const updateMove = useEditor((s) => s.updateMove);
  const selectedMoveId = useEditor((s) => s.selectedMoveId);
  const selectMove = useEditor((s) => s.selectMove);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const canvasMode = useEditor((s) => s.canvasMode);
  const previewTime = useEditor((s) => s.previewTime);
  const showQuill = useEditor((s) => s.showQuill);
  const { width: canvasWidth, height: canvasHeight } = canvasDimensions(canvasMode);

  const sortedCam = [...scene.camera].sort((a, b) => a.time - b.time);
  const kf = scene.camera.find((k) => k.id === selectedKeyframeId);
  const camIndex = sortedCam.findIndex((k) => k.id === selectedKeyframeId);
  const selEl = scene.elements.find((e) => e.id === selectedId);
  const selMove = selEl?.motion?.find((k) => k.id === selectedMoveId);

  const [camDrag, setCamDrag] = useState<CamDrag>(null);
  const camStart = useRef<{ px: number; py: number; x: number; y: number; zoom: number } | null>(
    null,
  );
  const offs = sceneOffsets(scenes);
  const sceneIndex = Math.max(0, scenes.findIndex((s) => s.id === scene.id));
  const previewGlobalTime = sceneIndex >= 0 && previewTime !== null
    ? offs[sceneIndex] + previewTime
    : 0;
  const [moveDrag, setMoveDrag] = useState<string | null>(null);
  const moveStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [scaleDrag, setScaleDrag] = useState<string | null>(null);
  const scaleStart = useRef<{ px: number; w: number; scale: number } | null>(null);

  useEffect(() => {
    if (!scaleDrag || !selEl) return;
    const onMove = (e: PointerEvent) => {
      const s = scaleStart.current;
      if (!s) return;
      const next = Math.max(0.1, (s.w + (e.clientX - s.px) / scale) / (selEl.width || 1));
      updateMove(selEl.id, scaleDrag, { scale: Math.min(6, next) });
    };
    const onUp = () => setScaleDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scaleDrag, selEl, scale, updateMove]);


  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const padding = 40;
      const s = Math.min(
        (rect.width - padding) / canvasWidth,
        (rect.height - padding) / canvasHeight,
      );
      setScale(Math.max(0.1, Math.min(1.5, s)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasWidth, canvasHeight]);

  /* --- drag the camera framing box directly on the canvas --- */
  useEffect(() => {
    if (!camDrag || !kf) return;
    const onMove = (e: PointerEvent) => {
      const s = camStart.current;
      if (!s) return;
      const dx = (e.clientX - s.px) / scale;
      const dy = (e.clientY - s.py) / scale;
      if (camDrag === "move") {
        updateKeyframe(kf.id, { x: s.x + dx, y: s.y + dy });
      } else {
         const w = Math.max(120, canvasWidth / s.zoom + dx * 2);
        updateKeyframe(kf.id, {
           zoom: Math.min(6, Math.max(0.5, canvasWidth / w)),
        });
      }
    };
    const onUp = () => setCamDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [camDrag, kf, scale, updateKeyframe, canvasWidth]);

  /* --- drag motion keyframe handles --- */
  useEffect(() => {
    if (!moveDrag || !selEl) return;
    const onMove = (e: PointerEvent) => {
      const s = moveStart.current;
      if (!s) return;
      updateMove(selEl.id, moveDrag, {
        x: s.x + (e.clientX - s.px) / scale,
        y: s.y + (e.clientY - s.py) / scale,
      });
    };
    const onUp = () => setMoveDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [moveDrag, selEl, scale, updateMove]);

  const beginCam = useCallback(
    (mode: Exclude<CamDrag, null>) => (e: React.PointerEvent) => {
      if (!kf) return;
      e.stopPropagation();
      camStart.current = { px: e.clientX, py: e.clientY, x: kf.x, y: kf.y, zoom: kf.zoom };
      setCamDrag(mode);
    },
    [kf],
  );

  return (
    <div
      ref={wrapRef}
      className="flex-1 overflow-hidden flex items-center justify-center relative"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, oklch(0.9 0.02 80) 1px, transparent 0)",
        backgroundSize: "24px 24px",
      }}
      onPointerDown={() => select(null)}
    >
      <div
        style={{
width: canvasWidth,
          height: canvasHeight,
          flexShrink: 0,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          background: scene.bgColor,
          backgroundImage: scene.bgImage
            ? `url(${scene.bgImage})`
            : backgroundById(scene.bgPreset)
              ? `url(${backgroundById(scene.bgPreset)!.src})`
              : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "0 20px 60px -20px rgba(0,0,0,0.15)",
          borderRadius: 12,
          position: "relative",
          overflow: "hidden",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {previewTime !== null ? (
          <SceneLayer
            scene={scene}
            time={previewTime}
            showQuill={showQuill}
            width={canvasWidth}
            height={canvasHeight}
          />
        ) : scene.elements.map((el) => (
          <CanvasElement
            key={el.id}
            el={el}
            selected={selectedId === el.id}
            scale={scale}
          />
        ))}

        {previewTime !== null && (
          <VideoOverlay
            clips={video}
            time={previewGlobalTime}
            playing={false}
            width={canvasWidth}
            height={canvasHeight}
          />
        )}

        {/* ghost framings of the other camera keyframes.
            Only the borders are clickable so elements inside stay selectable. */}
        {previewTime === null &&
          scene.camera
            .filter((k) => k.id !== selectedKeyframeId)
            .map((k) => (
              <div
                key={k.id}
                style={{
                  position: "absolute",
                  width: canvasWidth / k.zoom,
                  height: canvasHeight / k.zoom,
                  left: k.x - canvasWidth / k.zoom / 2,
                  top: k.y - canvasHeight / k.zoom / 2,
                  border: "2px dashed color-mix(in oklab, var(--color-primary) 45%, transparent)",
                  borderRadius: 8,
                  pointerEvents: "none",
                  zIndex: 18,
                }}
              >
                <CamEdges
                  title={`Camera @ ${k.time.toFixed(1)}s — click to edit`}
                  cursor="pointer"
                  onDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    selectKeyframe(k.id);
                  }}
                />
              </div>
            ))}

        {previewTime === null && kf && (
          <div
            style={{
              position: "absolute",
               width: canvasWidth / kf.zoom,
               height: canvasHeight / kf.zoom,
               left: kf.x - canvasWidth / kf.zoom / 2,
               top: kf.y - canvasHeight / kf.zoom / 2,
              border: "3px dashed var(--color-primary)",
              borderRadius: 8,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.06)",
              pointerEvents: "none",
              touchAction: "none",
              zIndex: 20,
            }}
          >
            <CamEdges
              title="Drag the frame border to pan the camera"
              cursor={camDrag === "move" ? "grabbing" : "grab"}
              onDown={(e) => {
                if (e.button !== 0) return;
                beginCam("move")(e);
              }}
            />
            <span
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                beginCam("move")(e);
              }}
              className="absolute -top-7 left-0 text-xs font-semibold px-2 py-0.5 rounded"
              style={{
                background: "var(--color-primary)",
                color: "var(--color-primary-foreground)",
                pointerEvents: "auto",
                cursor: camDrag === "move" ? "grabbing" : "grab",
                touchAction: "none",
              }}
            >
              {camIndex === 0 ? "Camera start" : camIndex === scene.camera.length - 1 ? "Camera end" : "Camera"} @ {kf.time.toFixed(1)}s · {kf.zoom.toFixed(2)}× — drag border to pan
            </span>
            <div
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                beginCam("resize")(e);
              }}
              title="Drag to zoom"
              style={{
                position: "absolute",
                right: -9,
                bottom: -9,
                width: 18,
                height: 18,
                borderRadius: 4,
                background: "var(--color-primary)",
                border: "2px solid white",
                cursor: "nwse-resize",
                pointerEvents: "auto",
                touchAction: "none",
              }}
            />
          </div>
        )}


        {/* motion path of the selected element */}
        {previewTime === null && selEl && (selEl.motion?.length ?? 0) > 0 && (
          <>
            <svg
              className="pointer-events-none"
              style={{ position: "absolute", inset: 0, zIndex: 15 }}
               width={canvasWidth}
               height={canvasHeight}
            >
              <polyline
                points={[
                  `${selEl.x + selEl.width / 2},${selEl.y + selEl.height / 2}`,
                  ...(selEl.motion ?? []).map(
                    (k) => `${k.x + selEl.width / 2},${k.y + selEl.height / 2}`,
                  ),
                ].join(" ")}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeDasharray="8 6"
              />
            </svg>
            {(selEl.motion ?? []).map((k, i) => (
              <div
                key={k.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  selectMove(k.id);
                  moveStart.current = { px: e.clientX, py: e.clientY, x: k.x, y: k.y };
                  setMoveDrag(k.id);
                }}
                title={`Move to this spot at ${k.time.toFixed(1)}s`}
                className="text-[10px] font-bold flex items-center justify-center"
                style={{
                  position: "absolute",
                  left: k.x + selEl.width / 2 - 12,
                  top: k.y + selEl.height / 2 - 12,
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background:
                    selectedMoveId === k.id ? "var(--color-primary)" : "white",
                  color:
                    selectedMoveId === k.id
                      ? "var(--color-primary-foreground)"
                      : "var(--color-primary)",
                  border: "2px solid var(--color-primary)",
                  cursor: "grab",
                  touchAction: "none",
                  zIndex: 16,
                }}
              >
                {i + 1}
              </div>
            ))}

            {/* rectangle selector for the selected motion keyframe */}
            {selMove && (
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  moveStart.current = {
                    px: e.clientX,
                    py: e.clientY,
                    x: selMove.x,
                    y: selMove.y,
                  };
                  setMoveDrag(selMove.id);
                }}
                style={{
                  position: "absolute",
                  left: selMove.x + (selEl.width - selEl.width * selMove.scale) / 2,
                  top: selMove.y + (selEl.height - selEl.height * selMove.scale) / 2,
                  width: selEl.width * selMove.scale,
                  height: selEl.height * selMove.scale,
                  transform: `rotate(${selMove.rotation}deg)`,
                  border: "2px solid var(--color-primary)",
                  borderRadius: 6,
                  background: "color-mix(in oklab, var(--color-primary) 8%, transparent)",
                  cursor: moveDrag === selMove.id ? "grabbing" : "grab",
                  touchAction: "none",
                  zIndex: 17,
                }}
              >
                <span
                  className="absolute -top-6 left-0 text-[10px] font-semibold px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
                  style={{
                    background: "var(--color-primary)",
                    color: "var(--color-primary-foreground)",
                  }}
                >
                  {selMove.time.toFixed(1)}s · {selMove.scale.toFixed(2)}×
                </span>
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    scaleStart.current = {
                      px: e.clientX,
                      w: selEl.width * selMove.scale,
                      scale: selMove.scale,
                    };
                    setScaleDrag(selMove.id);
                  }}
                  title="Drag to resize"
                  style={{
                    position: "absolute",
                    right: -8,
                    bottom: -8,
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: "var(--color-primary)",
                    border: "2px solid white",
                    cursor: "nwse-resize",
                    touchAction: "none",
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
