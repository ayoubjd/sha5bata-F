import { TextBackdropLayer } from "@/components/editor/TextBackdropLayer";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/editor/store";
import { isRTLText, normalizeSvg } from "@/lib/editor/svgUtils";
import type { SceneElement } from "@/lib/editor/types";

interface Props {
  el: SceneElement;
  selected: boolean;
  scale: number;
}

type Handle = "move" | "nw" | "ne" | "sw" | "se" | "rot" | null;

export function CanvasElement({ el, selected, scale }: Props) {
  const { select, updateElement } = useEditor();
  const [drag, setDrag] = useState<Handle>(null);
  const startRef = useRef<{
    px: number;
    py: number;
    ex: number;
    ey: number;
    ew: number;
    eh: number;
    er: number;
  } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const s = startRef.current;
      if (!s) return;
      const dx = (e.clientX - s.px) / scale;
      const dy = (e.clientY - s.py) / scale;
      if (drag === "move") {
        updateElement(el.id, { x: s.ex + dx, y: s.ey + dy });
      } else if (drag === "rot") {
        const cx = s.ex + s.ew / 2;
        const cy = s.ey + s.eh / 2;
        const mx = s.ex + dx + s.ew / 2;
        const my = s.ey + dy + s.eh / 2;
        const angle = (Math.atan2(my - cy, mx - cx) * 180) / Math.PI + 90;
        updateElement(el.id, { rotation: angle });
      } else {
        // corner resize (uniform scale from opposite corner)
        let nx = s.ex,
          ny = s.ey,
          nw = s.ew,
          nh = s.eh;
        if (drag === "se") {
          nw = Math.max(20, s.ew + dx);
          nh = Math.max(20, s.eh + dy);
        } else if (drag === "sw") {
          nw = Math.max(20, s.ew - dx);
          nh = Math.max(20, s.eh + dy);
          nx = s.ex + (s.ew - nw);
        } else if (drag === "ne") {
          nw = Math.max(20, s.ew + dx);
          nh = Math.max(20, s.eh - dy);
          ny = s.ey + (s.eh - nh);
        } else if (drag === "nw") {
          nw = Math.max(20, s.ew - dx);
          nh = Math.max(20, s.eh - dy);
          nx = s.ex + (s.ew - nw);
          ny = s.ey + (s.eh - nh);
        }
        updateElement(el.id, { x: nx, y: ny, width: nw, height: nh });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, scale, el.id, updateElement]);

  const beginDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    select(el.id);
    startRef.current = {
      px: e.clientX,
      py: e.clientY,
      ex: el.x,
      ey: el.y,
      ew: el.width,
      eh: el.height,
      er: el.rotation,
    };
    setDrag(handle);
  };

  const content = () => {
    if (el.type === "svg") {
      return (
        <div
          style={{ color: el.color, width: "100%", height: "100%" }}
          dangerouslySetInnerHTML={{ __html: normalizeSvg(el.svg) }}
        />
      );
    }
    if (el.type === "image") {
      return (
        <img
          src={el.src}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      );
    }
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: el.fontFamily,
          fontSize: el.fontSize,
          fontWeight: el.fontWeight,
          color: el.color,
          textAlign: "center",
          direction: isRTLText(el.text) ? "rtl" : "ltr",
          lineHeight: 1.1,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          boxSizing: "border-box",
          padding: 4,
        }}
      >
        <TextBackdropLayer el={el} />
        <span style={{ position: "relative" }}>{el.text}</span>
      </div>
    );

  };

  return (
    <div
      onPointerDown={beginDrag("move")}
      style={{
        position: "absolute",
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        transform: `rotate(${el.rotation}deg)`,
        transformOrigin: "center",
        cursor: drag === "move" ? "grabbing" : "grab",
        outline: selected
          ? "2px solid var(--color-primary)"
          : "2px solid transparent",
        outlineOffset: 2,
        touchAction: "none",
      }}
    >
      {content()}
      {selected && (
        <>
          {(["nw", "ne", "sw", "se"] as const).map((h) => (
            <div
              key={h}
              onPointerDown={beginDrag(h)}
              style={{
                position: "absolute",
                width: 12,
                height: 12,
                background: "white",
                border: "2px solid var(--color-primary)",
                borderRadius: 2,
                ...(h.includes("n")
                  ? { top: -8 }
                  : { bottom: -8 }),
                ...(h.includes("w")
                  ? { left: -8 }
                  : { right: -8 }),
                cursor: `${h}-resize`,
              }}
            />
          ))}
          <div
            onPointerDown={beginDrag("rot")}
            title="Rotate"
            style={{
              position: "absolute",
              top: -30,
              left: "50%",
              transform: "translateX(-50%)",
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "var(--color-primary)",
              cursor: "grab",
            }}
          />
        </>
      )}
    </div>
  );
}