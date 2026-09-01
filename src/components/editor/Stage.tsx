import {
  cameraAt,
  elementPoseAt,
  sceneDuration,
  sceneOffsets,
  type ElementPose,
} from "@/lib/editor/store";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_PAPER,
  PAPER_STOCKS,
  type AppearDirection,
  type AppearStyle,
  type CanvasMode,
  type Scene,
  type SceneElement,
  type VideoClip,
} from "@/lib/editor/types";

import {
  glyphNibHeight,
  isRTLText,
  layoutText,
  measureText,
  normalizeSvg,
  pointAtProgress,
  sketchMask,
  svgViewBox,
  svgWithProgress,
  textLines,
  traceText,
} from "@/lib/editor/svgUtils";

import { backgroundById } from "@/lib/editor/backgrounds";
import { TextBackdropLayer } from "@/components/editor/TextBackdropLayer";
import { VideoOverlay } from "@/components/editor/VideoOverlay";
import quillImg from "@/assets/quill.png";
import handImg from "@/assets/hand-paper.png";
import penHandImg from "@/assets/hand-pen.png";
import sweepHandImg from "@/assets/hand-sweep.png";
import paperHandPenImg from "@/assets/paper-hand-pen.png";
import { playPaperFold, playPaperSweep } from "@/lib/editor/sfx";
import { useEffect, useRef } from "react";

/** Eased slide-in offset for hand-carried elements (arrives from the right). */
export function slideEntryOffset(progress: number, width: number, height: number) {
  const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, progress)), 3);
  return {
    dx: (1 - e) * (width * 0.6 + 900),
    dy: (1 - e) * (height * 0.05 + 40),
    opacity: Math.min(1, progress * 4),
  };
}

/** Eased transform for the "appear" entry (pop / fade-in / slide). */
export function appearEntryOffset(
  style: AppearStyle,
  progress: number,
  width: number,
  height: number,
  direction: AppearDirection = "right",
) {
  const q = Math.min(1, Math.max(0, progress));
  // How far off-canvas the element starts, from the given direction.
  const from = {
    left: { dx: -(width * 0.6 + 500), dy: 0 },
    right: { dx: width * 0.6 + 500, dy: 0 },
    up: { dx: 0, dy: -(height * 0.6 + 300) },
    down: { dx: 0, dy: height * 0.6 + 300 },
  }[direction];
  switch (style) {
    case "fade":
      return {
        scale: 1,
        dx: 0,
        dy: 0,
        opacity: Math.min(1, q * 4),
      };
    case "slide":
      const e = 1 - Math.pow(1 - q, 3);
      return {
        scale: 1,
        dx: (1 - e) * from.dx,
        dy: (1 - e) * from.dy,
        opacity: Math.min(1, q * 3),
      };
    case "pop":
      // spring-like pop with a small overshoot past scale 1
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const s = 1 + c3 * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2);
      return {
        scale: Math.max(0.01, s),
        dx: (1 - q) * from.dx,
        dy: (1 - q) * from.dy,
        opacity: Math.min(1, q * 8),
      };
  }
}

function HandCarrier({
  x,
  y,
  progress,
}: {
  x: number;
  y: number;
  progress: number;
}) {
  const w = 420;
  const h = w * 1.489;
  // hand lifts away in the last 15% once the element is set down
  const lift = Math.max(0, (progress - 0.85) / 0.15);
  return (
    <div
      style={{
        position: "absolute",
        // fingertips (upper-left of the artwork) hold the element,
        // so the palm sits down-right of it
        left: x - w * 0.14,
        top: y - h * 0.08,
        width: w,
        height: h,
        pointerEvents: "none",
        zIndex: 40,
        backgroundImage: `url(${handImg})`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        opacity: 1 - lift,
        transform: `translate(${lift * 220}px, ${lift * 120}px)`,
        filter: "drop-shadow(0 14px 26px rgba(0,0,0,0.18))",
      }}
    />
  );
}

/** Paper hand that sweeps the whole scene away, left to right. */
function SweepHand({
  progress,
  width,
  height,
}: {
  progress: number;
  width: number;
  height: number;
}) {
  const w = width * 0.8;
  const h = w * 0.514;
  const q = Math.min(1, Math.max(0, progress));
  // sweeps in from the bottom-left and rises to the middle as it crosses
  const x = -w * 0.95 + q * (width + w * 1.05);
  const rise = 1 - Math.pow(1 - q, 2);
  const y = height * (0.9 - 0.42 * rise) - h * 0.45;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        pointerEvents: "none",
        zIndex: 900,
        backgroundImage: `url(${sweepHandImg})`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        transform: `rotate(${-12 + rise * 12}deg)`,
        transformOrigin: "0% 50%",
        filter: "drop-shadow(0 16px 30px rgba(0,0,0,0.2))",
      }}
    />
  );
}

/* ------------------------------ elements ------------------------------ */

function fontOf(el: Extract<SceneElement, { type: "text" }>) {
  return `${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
}

/* ---------------------------- paper unfold ----------------------------- */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Parse #rgb/#rrggbb into rgb parts. */
function hexRgb(hex: string) {
  const s = hex.replace("#", "");
  const f =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s.padEnd(6, "0");
  return [
    parseInt(f.slice(0, 2), 16),
    parseInt(f.slice(2, 4), 16),
    parseInt(f.slice(4, 6), 16),
  ] as const;
}

const shift = (hex: string, amount: number) => {
  const [r, g, b] = hexRgb(hex);
  const m = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v + amount * 255)));
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
};

/** Realistic sheet gradient built from the chosen paper colour. */
const paperFace = (color: string) =>
  `linear-gradient(140deg, ${shift(color, 0.05)} 0%, ${color} 48%, ${shift(color, -0.05)} 78%, ${shift(color, -0.1)} 100%)`;

/** Crumple wrinkles drawn over the paper face while it is still folded. */
const WRINKLES =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.018' numOctaves='4' seed='7'/><feDisplacementMap in='SourceGraphic' scale='30'/><feColorMatrix type='saturate' values='0'/></filter><rect width='300' height='300' fill='%23888' filter='url(%23c)' opacity='0.55'/></svg>\")";

const CREASE_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='turbulence' baseFrequency='0.04' numOctaves='3' seed='3'/><feColorMatrix type='saturate' values='0'/></filter><rect width='220' height='220' filter='url(%23n)' opacity='0.5'/></svg>\")";

/** Fine paper-fibre grain — always on, gives the sheet a real stock feel. */

/** Merge the element's paper options with the defaults. */
export function resolvePaper(el: SceneElement) {
  const p = el.paper ?? {};
  const stock = p.stock ?? DEFAULT_PAPER.stock;
  const stockColor =
    PAPER_STOCKS.find((s) => s.value === stock)?.color ?? DEFAULT_PAPER.color;
  return {
    keep: p.keep ?? DEFAULT_PAPER.keep,
    dissolveDelay: p.dissolveDelay ?? DEFAULT_PAPER.dissolveDelay,
    dissolveDuration: Math.max(0.05, p.dissolveDuration ?? DEFAULT_PAPER.dissolveDuration),
    stock,
    color: stock === "custom" ? (p.color ?? DEFAULT_PAPER.color) : stockColor,
    texture: p.texture ?? DEFAULT_PAPER.texture,
    shadow: p.shadow ?? DEFAULT_PAPER.shadow,
    gloss: p.gloss ?? DEFAULT_PAPER.gloss,
  };
}

/**
 * Paper skin opacity at a given scene time. `dissolveDelay` is relative to the
 * end of the unfold, and may be **negative** — the paper then starts melting
 * away *before* the unfold finishes, so the clean element takes its place as
 * the sheet leaves. Never starts before the element itself.
 */
export function paperOpacityAt(el: SceneElement, time: number) {
  const cfg = resolvePaper(el);
  if (cfg.keep) return 1;
  const end = el.startTime + el.drawDuration;
  const start = Math.max(el.startTime, end + cfg.dissolveDelay);
  if (time <= start) return 1;
  return 1 - easeInOut(clamp01((time - start) / cfg.dissolveDuration));
}


const FIBERS =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='11'/><feColorMatrix type='saturate' values='0'/></filter><rect width='160' height='160' filter='url(%23f)' opacity='0.35'/></svg>\")";


/** Quantise a 0..1 progress to stop-motion steps. */
const STOP_FPS = 12;
const stepped = (p: number, fps = STOP_FPS) =>
  clamp01(Math.round(clamp01(p) * fps) / fps);

/** Deterministic per-frame jitter so each held frame looks hand-placed. */
function frameJitter(frame: number) {
  const s = Math.sin(frame * 12.9898) * 43758.5453;
  const r1 = s - Math.floor(s);
  const s2 = Math.sin(frame * 78.233) * 12345.6789;
  const r2 = s2 - Math.floor(s2);
  return { jx: (r1 - 0.5) * 5, jy: (r2 - 0.5) * 5, jr: (r1 - 0.5) * 2.2 };
}

/**
 * Stop-motion paper unfold.
 *
 * Frame 1: a tightly folded packet sits exactly where the element belongs.
 * Frame 2: the right half snaps open, creases catch the light.
 * Frame 3: the bottom halves drop open and the artwork mask-reveals inside
 *          the creases as if printed on the sheet.
 * Frame 4: the sheet is flat, the artwork fully visible.
 * Outro:   the paper texture dissolves away, leaving only the clean element.
 */
function PaperUnfold({
  el,
  pose,
  progress,
  paperOpacity,
}: {
  el: SceneElement;
  pose: ElementPose;
  progress: number;
  /** 0..1 opacity of the paper skin, driven by the user's dissolve timing. */
  paperOpacity?: number;
}) {
  const raw = clamp01(progress);
  // snappy stop-motion: motion advances in discrete frames
  const p = stepped(raw);
  const frame = Math.round(p * STOP_FPS);
  const { jx, jy, jr } = frameJitter(frame);
  const w = el.width;
  const h = el.height;

  const paperCfg = resolvePaper(el);
  const base = paperCfg.color;
  const texture = paperCfg.texture;
  const shadowAmt = paperCfg.shadow;
  const gloss = paperCfg.gloss;

  // ---- frame phases (snappy: short opens, brief holds) ----
  const packetIn = easeOutCubic(seg(p, 0, 0.1)); // frame 1 — folded packet appears
  const fy = easeOutCubic(seg(p, 0.14, 0.42)); // frame 2 — right half opens
  const fx = easeOutCubic(seg(p, 0.4, 0.68)); // frame 3 — bottom halves open
  const grow = easeInOut(seg(p, 0.1, 0.66)); // packet footprint -> full sheet
  // artwork prints itself into the creases once the sheet is mostly open
  const imageIn = easeOutCubic(seg(p, 0.5, 0.8));
  // outro — paper skin dissolves on the user's schedule
  const paperFade = paperOpacity ?? 1;
  // crumple/crease texture smooths out as it flattens
  const crumple = 1 - easeInOut(seg(p, 0.2, 0.72));
  const settle = seg(p, 0.66, 0.82);

  // Text blocks that already carry a paper/marker backdrop shouldn't be
  // multiplied into the unfolding sheet — cross-fade them instead.
  const hasBackdrop =
    el.type === "text" && (el.backdrop ?? "none") !== "none";
  const printBlend = hasBackdrop ? 0 : paperFade;
  // as the sheet melts away the artwork must already be fully there
  const artOpacity = Math.max(imageIn, 1 - paperFade);

  const startRatio = 0.34; // tight folded packet size relative to the sheet
  const packetScale = startRatio + (1 - startRatio) * grow;



  const quadrant = (qx: 0 | 1, qy: 0 | 1) => (
    <div
      style={{
        position: "absolute",
        left: qx * (w / 2),
        top: qy * (h / 2),
        width: w / 2,
        height: h / 2,
        overflow: "hidden",
        backfaceVisibility: "hidden",
      }}
    >
      {/* paper face underneath — dissolves on the user's schedule */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: hasBackdrop ? paperFade * (1 - 0.7 * imageIn) : paperFade,
          background: paperFace(base),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: WRINKLES,
            backgroundSize: "150% 150%",
            backgroundPosition: `${qx * 100}% ${qy * 100}%`,
            mixBlendMode: "multiply",
            opacity: (0.2 + crumple * 0.4) * texture,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: CREASE_NOISE,
            backgroundSize: "120px 120px",
            mixBlendMode: "multiply",
            opacity: 0.14 * texture,
          }}
        />
        {/* fine paper fibres — always present, keeps the stock believable */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: FIBERS,
            backgroundSize: "160px 160px",
            mixBlendMode: "multiply",
            opacity: 0.1 + texture * 0.12,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(122deg, rgba(255,255,255,0.5) 0%, rgba(0,0,0,0.07) 22%, rgba(255,255,255,0.42) 41%, rgba(0,0,0,0.08) 63%, rgba(255,255,255,0.35) 82%, rgba(0,0,0,0.06) 100%)",
            opacity: 0.35 + gloss * 0.75,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            boxShadow: `inset 0 0 26px rgba(0,0,0,${0.06 + shadowAmt * 0.16})`,
          }}
        />
      </div>


      {/* the artwork, printed on the sheet then left clean on its own */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: artOpacity,
          // text that carries its own paper backdrop must never multiply into
          // the unfolding sheet — it would go muddy. Cross-fade instead.
          mixBlendMode: printBlend > 0.02 ? "multiply" : "normal",
          filter: printBlend > 0.02 ? `saturate(${0.9 + 0.1 * (1 - printBlend)})` : undefined,
          transition: "none",
        }}
      >
        <ElementRenderer
          el={el}
          progress={1}
          visible
          pose={{
            x: -qx * (w / 2),
            y: -qy * (h / 2),
            scale: 1,
            rotation: 0,
          }}
        />
      </div>

    </div>
  );

  // crease shading along the folds
  const shade = (amount: number, dir: "x" | "y") => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background:
          dir === "y"
            ? "linear-gradient(90deg, rgba(0,0,0,0.38), rgba(0,0,0,0) 55%)"
            : "linear-gradient(180deg, rgba(0,0,0,0.34), rgba(0,0,0,0) 55%)",
        opacity: amount,
      }}
    />
  );

  return (
    <div
      style={{
        position: "absolute",
        left: pose.x,
        top: pose.y,
        width: w,
        height: h,
        transform: `rotate(${pose.rotation}deg) scale(${pose.scale * (1 + Math.sin(settle * Math.PI) * 0.025)})`,
        transformOrigin: "center",
        perspective: Math.max(900, (w + h) * 1.1),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: packetIn,
          transformStyle: "preserve-3d",
          transform: `translate(${(1 - fy) * (w / 4) + jx * (1 - grow)}px, ${(1 - fx) * (h / 4) + jy * (1 - grow)}px) rotate(${(1 - grow) * (-5 + jr)}deg) scale(${packetScale})`,
          transformOrigin: "center",
          filter: `drop-shadow(0 ${6 + 14 * (1 - Math.min(fx, fy))}px ${14 + 16 * (1 - Math.min(fx, fy))}px rgba(0,0,0,${0.24 * Math.max(paperFade, 0.12)}))`,
        }}
      >
        {/* leftover crumple texture on the folded packet, smoothing out */}
        {crumple > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 5,
              opacity: crumple * 0.7 * paperFade,
              backgroundImage: WRINKLES,
              backgroundSize: "180% 180%",
              backgroundPosition: "center",
              mixBlendMode: "multiply",
            }}
          />
        )}

        {/* top-left quarter — stays put */}
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d" }}>
          {quadrant(0, 0)}

          {/* bottom-left quarter unfolds downward */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: h / 2,
              width: w / 2,
              height: h / 2,
              transformOrigin: "top center",
              transformStyle: "preserve-3d",
              transform: `rotateX(${-180 * (1 - fx)}deg)`,
            }}
          >
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: -h / 2, width: w, height: h }}>
                {quadrant(0, 1)}
              </div>
              {shade((1 - fx) * paperFade, "x")}
            </div>
          </div>

          {/* right half swings open around the centre crease */}
          <div
            style={{
              position: "absolute",
              left: w / 2,
              top: 0,
              width: w / 2,
              height: h,
              transformOrigin: "left center",
              transformStyle: "preserve-3d",
              transform: `rotateY(${-180 * (1 - fy)}deg)`,
            }}
          >
            <div style={{ position: "absolute", left: -w / 2, top: 0, width: w, height: h }}>
              {quadrant(1, 0)}
            </div>
            {/* bottom-right quarter rides the right half, then folds down */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: h / 2,
                width: w / 2,
                height: h / 2,
                transformOrigin: "top center",
                transformStyle: "preserve-3d",
                transform: `rotateX(${-180 * (1 - fx)}deg)`,
              }}
            >
              <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                <div style={{ position: "absolute", left: -w / 2, top: -h / 2, width: w, height: h }}>
                  {quadrant(1, 1)}
                </div>
                {shade((1 - fx) * paperFade, "x")}
              </div>
            </div>
            {shade((1 - fy) * paperFade, "y")}
          </div>
        </div>
      </div>
    </div>
  );
}


export function ElementRenderer({
  el,
  progress,
  visible,
  pose,
}: {
  el: SceneElement;
  progress: number;
  visible: boolean;
  pose?: ElementPose;
}) {
  if (!visible) return null;

  const p = pose ?? { x: el.x, y: el.y, scale: 1, rotation: el.rotation };

  const wrap: React.CSSProperties = {
    position: "absolute",
    left: p.x,
    top: p.y,
    width: el.width,
    height: el.height,
    transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
    transformOrigin: "center",
  };

  if (el.type === "svg") {
    const html = normalizeSvg(
      progress >= 1 ? el.svg : svgWithProgress(el.svg, progress),
    );
    return (
      <div
        style={{ ...wrap, color: el.color }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (el.type === "image") {
    if (el.traceSvg && progress < 1) {
      const outline = normalizeSvg(svgWithProgress(el.traceSvg, progress));
      const fade = Math.max(0, (progress - 0.8) / 0.2);
      return (
        <div style={{ ...wrap }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              color: "#1a1a1a",
              opacity: 1 - fade,
            }}
            dangerouslySetInnerHTML={{ __html: outline }}
          />
          <img
            src={el.src}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              opacity: fade,
            }}
          />
        </div>
      );
    }
    const mask = progress >= 1 ? undefined : sketchMask(progress);
    return (
      <div style={{ ...wrap, overflow: "hidden" }}>
        <img
          src={el.src}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
          }}
        />
      </div>
    );
  }

  const t = traceText(el.text, progress, fontOf(el));

  if (isRTLText(el.text)) {
    // RTL (Arabic, Hebrew, …): reveal whole lines right-to-left with a clip
    // so connected letter shaping is never broken by per-char spans.
    const font = fontOf(el);
    const lines = textLines(el.text, font, el.width - 8);
    return (
      <div
        style={{
          ...wrap,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: el.fontFamily,
          fontSize: el.fontSize,
          fontWeight: el.fontWeight,
          color: el.color,
          textAlign: "center",
          direction: "rtl",
          lineHeight: 1.1,
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          wordBreak: "break-word",
          boxSizing: "border-box",
          padding: 4,
        }}
      >
        <TextBackdropLayer el={el} />
        <span style={{ position: "relative", display: "block", width: "100%" }}>
          {lines.map((line, i) => {
            let clip = 100;
            if (line.str && t.chars >= line.lastIdx) {
              clip = 0;
            } else if (line.str && t.chars >= line.firstIdx) {
              const doneInLine = Math.max(0, t.chars - line.firstIdx);
              const doneWidth = measureText(line.str.slice(0, doneInLine), font);
              const nextWidth = measureText(
                line.str.slice(0, Math.min(line.str.length, doneInLine + 1)),
                font,
              );
              const front = doneWidth + (nextWidth - doneWidth) * t.partial;
              clip = Math.min(100, Math.max(0, (1 - front / Math.max(1, line.width)) * 100));
            }
            const clipStyle =
              clip > 0
                ? {
                    clipPath: `inset(0 0 0 ${clip}%)`,
                    WebkitClipPath: `inset(0 0 0 ${clip}%)`,
                  }
                : {};
            return (
              <span key={i} style={{ display: "block", textAlign: "center" }}>
                <span
                  style={{
                    display: "inline-block",
                    whiteSpace: "pre",
                    ...clipStyle,
                  }}
                >
                  {line.str || "\u200b"}
                </span>
              </span>
            );
          })}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        ...wrap,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: el.fontFamily,
        fontSize: el.fontSize,
        fontWeight: el.fontWeight,
        color: el.color,
        textAlign: "center",
        lineHeight: 1.1,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: "break-word",
        boxSizing: "border-box",
        padding: 4,
      }}
    >
      <TextBackdropLayer el={el} />
      <span style={{ position: "relative", whiteSpace: "pre-wrap" }}>
        {Array.from(el.text).map((char, index) => {
          const complete = index < t.chars;
          const current = index === t.chars;
          return (
            <span
              key={index}
              style={{
                opacity: complete || current ? 1 : 0,
                clipPath: current
                  ? `inset(0 ${(1 - t.partial) * 100}% 0 0)`
                  : undefined,
                WebkitClipPath: current
                  ? `inset(0 ${(1 - t.partial) * 100}% 0 0)`
                  : undefined,
              }}
            >
              {char}
            </span>
          );
        })}
      </span>
    </div>
  );
}


/* -------------------------------- quill -------------------------------- */

function nibPosition(el: SceneElement, progress: number, pose: ElementPose) {
  let tipX = el.width * progress;
  let tipY = el.height / 2;

  if (el.type === "svg") {
    const p = pointAtProgress(el.svg, progress);
    if (p) {
      const { vw, vh } = svgViewBox(el.svg);
      tipX = (p.x / vw) * el.width;
      tipY = (p.y / vh) * el.height;
    }
  } else if (el.type === "text") {
    const font = fontOf(el);
    const t = traceText(el.text, progress, font);
    const rtl = isRTLText(el.text);
    const layout = layoutText(el.text, font, el.width - 8);
    const current =
      layout.chars.find((item) => item.index >= t.chars && item.char.trim()) ??
      layout.chars.slice().reverse().find((item) => item.char.trim());
    if (!current) return { x: pose.x, y: pose.y };
    const u = Math.min(1, Math.max(0, current.index === t.chars ? t.partial : 0));
    const lineHeight = el.fontSize * 1.1;
    const textTop = (el.height - layout.lineCount * lineHeight) / 2;
    const baseline = textTop + current.line * lineHeight + el.fontSize * 0.86;
    const char = current.char;
    // follow the real outline of the glyph currently being inked
    const h = char ? glyphNibHeight(char, font, rtl ? 1 - u : u) : null;
    tipY = baseline - (h ?? el.fontSize * 0.35);
    if (rtl) {
      // RTL: the ink front sweeps from the line's right edge leftward.
      // Prefix widths are measured on shaped text so the nib stays glued
      // to the connected Arabic forms the browser actually renders.
      const line = textLines(el.text, font, el.width - 8)[current.line];
      const lineWidth = line?.width || layout.lineWidths[current.line] || 0;
      const doneInLine = line ? Math.max(0, t.chars - line.firstIdx) : 0;
      const doneWidth = line ? measureText(line.str.slice(0, doneInLine), font) : 0;
      const nextWidth = line
        ? measureText(line.str.slice(0, Math.min(line.str.length, doneInLine + 1)), font)
        : 0;
      const front = doneWidth + (nextWidth - doneWidth) * u;
      tipX = (el.width - lineWidth) / 2 + lineWidth - front;
    } else {
      const lineWidth = layout.lineWidths[current.line] ?? 0;
      tipX = (el.width - lineWidth) / 2 + current.x + current.width * u;
    }
  } else if (el.traceSvg) {

    const p = pointAtProgress(el.traceSvg, progress);
    if (p) {
      const { vw, vh } = svgViewBox(el.traceSvg);
      tipX = (p.x / vw) * el.width;
      tipY = (p.y / vh) * el.height;
    }
  } else {
    // raster: nib follows the slanted sketch band
    tipX = el.width * progress;
    tipY = el.height * (0.5 + 0.35 * Math.sin(progress * Math.PI * 4));
  }

  const cx = pose.x + el.width / 2;
  const cy = pose.y + el.height / 2;
  const lx = tipX - el.width / 2;
  const ly = tipY - el.height / 2;
  const rad = (pose.rotation * Math.PI) / 180;
  return {
    x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
  };
}

/** Seconds the writing tool spends flying in and settling before the first ink. */
export const TOOL_LEAD_IN = 0.35;

function Quill({
  el,
  progress,
  pose,
  approach = 1,
}: {
  el: SceneElement;
  progress: number;
  pose: ElementPose;
  /** 0 = still flying in, 1 = nib settled on the ink front */
  approach?: number;
}) {
  const { x, y } = nibPosition(el, Math.max(0, progress), pose);
  const size = 260;
  const a = Math.min(1, Math.max(0, approach));
  const ease = 1 - Math.pow(1 - a, 3);
  // Fade in already touching the first ink point; never fly in from a remote
  // position because that makes the opening stroke look disconnected.
  const offX = 0;
  const offY = 0;
  // gentle writing wobble (only once the pen is on the page)
  const tilt = Math.sin(Math.max(0, progress) * Math.PI * 8) * 2 * ease;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size * 0.17 + offX,
        top: y - size * 0.92 + offY,
        width: size,
        height: size,
        pointerEvents: "none",
        opacity: Math.min(1, a * 3),
        zIndex: 50,
      }}
    >
      {/* wet ink dot at the nib */}
      <div
        style={{
          position: "absolute",
          left: size * 0.17 - 3,
          top: size * 0.92 - 3,
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "rgba(20,20,20,0.55)",
          opacity: ease,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          backgroundImage: `url(${quillImg})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          transform: `rotate(${tilt + (1 - ease) * 10}deg)`,
          transformOrigin: "17% 92%",
          filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.18))",
        }}
      />
    </div>
  );
}

/** A hand holding a pen that draws the element, nib riding the ink front. */
function PenHand({
  el,
  progress,
  pose,
  approach = 1,
}: {
  el: SceneElement;
  progress: number;
  pose: ElementPose;
  approach?: number;
}) {
  const { x, y } = nibPosition(el, Math.max(0, progress), pose);
  const size = 460;
  // pen tip sits at ~25% / 70% of the artwork
  const tipX = 0.25;
  const tipY = 0.7;
  const a = Math.min(1, Math.max(0, approach));
  const ease = 1 - Math.pow(1 - a, 3);
  const offX = 0;
  const offY = 0;
  const tilt = Math.sin(Math.max(0, progress) * Math.PI * 10) * 1.5 * ease;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size * tipX + offX,
        top: y - size * tipY + offY,
        width: size,
        height: size,
        pointerEvents: "none",
        opacity: Math.min(1, a * 3),
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${penHandImg})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          transform: `rotate(${tilt + (1 - ease) * 8}deg)`,
          transformOrigin: `${tipX * 100}% ${tipY * 100}%`,
          filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.18))",
        }}
      />
    </div>
  );
}

/**
 * A paper-cutout hand holding a pen — uses the hand PNG image.
 * Same nib logic as PenHand.
 */
function PaperPenHand({
  el,
  progress,
  pose,
  approach = 1,
}: {
  el: SceneElement;
  progress: number;
  pose: ElementPose;
  approach?: number;
}) {
  const { x, y } = nibPosition(el, Math.max(0, progress), pose);
  // image is 669×373 — the pen is held horizontally, nib pointing left.
  // The nib tip (leftmost point of the pen) is at pixel (~205, 160).
  const imgW = 669;
  const imgH = 373;
  const tipPx = 205;
  const tipPy = 160;
  const tipX = tipPx / imgW;
  const tipY = tipPy / imgH;
  // hand scales continuously with element size (no tight clamp so the
  // difference between small and large elements is clearly visible)
  const scale = Math.min(2.5, Math.max(0.5, Math.max(el.width, el.height) / 420));
  const cw = Math.round(imgW * scale);
  const ch = Math.round(imgH * scale);
  const a = Math.min(1, Math.max(0, approach));
  const ease = 1 - Math.pow(1 - a, 3);
  const tilt = Math.sin(Math.max(0, progress) * Math.PI * 10) * 1.5 * ease;

  return (
    <div
      style={{
        position: "absolute",
        left: x - cw * tipX,
        top: y - ch * tipY,
        width: cw,
        height: ch,
        pointerEvents: "none",
        opacity: Math.min(1, a * 3),
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${paperHandPenImg})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          transform: `rotate(${tilt + (1 - ease) * 8}deg)`,
          transformOrigin: `${tipX * 100}% ${tipY * 100}%`,
          filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.12))",
        }}
      />
      {/* wet ink dot at the pen nib */}
      <div
        style={{
          position: "absolute",
          left: tipX * 100 + "%",
          top: tipY * 100 + "%",
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "rgba(20,20,20,0.5)",
          opacity: ease,
          zIndex: 25,
          transform: "translate(-50%,-50%)",
        }}
      />
    </div>
  );
}


/* ------------------------------ scene layer ---------------------------- */

/** Screen-space x of the sweeping hand's leading fingertips. */
export function sweepHandEdge(progress: number, width: number) {
  const q = Math.min(1, Math.max(0, progress));
  const w = width * 0.8;
  const x = -w * 0.95 + q * (width + w * 1.05);
  return x + w * 0.88;
}

export function SceneLayer({
  scene,
  time,
  showQuill = true,
  style,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT,
  sweepProgress,
}: {
  scene: Scene;
  time: number; // local scene time
  showQuill?: boolean;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
  /** 0..1 progress of an outgoing paper-hand sweep, if one is running. */
  sweepProgress?: number;
}) {
  const cam = cameraAt(scene, time, width, height);

  // paper-fold cue when a hand-carried element starts sliding in
  const carriedNow = scene.elements.filter(
    (el) =>
      ((el.entry ?? "draw") === "slide" || (el.entry ?? "draw") === "unfold") &&
      time >= el.startTime &&
      time < el.startTime + el.drawDuration,
  );
  const carrying = carriedNow.map((el) => el.id).join(",");
  const carryDuration = carriedNow[0]?.drawDuration ?? 1.1;
  const carriedRef = useRef("");
  useEffect(() => {
    const prev = carriedRef.current.split(",").filter(Boolean);
    const now = carrying.split(",").filter(Boolean);
    if (now.some((id) => !prev.includes(id))) playPaperFold(carryDuration);
    carriedRef.current = carrying;
  }, [carrying, carryDuration]);

  // convert the hand's screen-space fingertip x into scene coordinates so
  // each element starts moving exactly when the hand reaches it
  const sweepSceneX =
    sweepProgress === undefined
      ? undefined
      : (sweepHandEdge(sweepProgress, width) - width / 2) / cam.zoom + cam.x;
  // the writing tool appears slightly before the first ink so it is already
  // standing on the first letter when it starts to appear
  const active = scene.elements.find((el) => {
    const entry = el.entry ?? "draw";
    return (
      (entry === "draw" || entry === "pen" || entry === "paper-pen") &&
      time >= el.startTime - TOOL_LEAD_IN &&
      time < el.startTime + el.drawDuration
    );
  });
  const activeApproach = active
    ? Math.min(1, Math.max(0, (time - (active.startTime - TOOL_LEAD_IN)) / TOOL_LEAD_IN))
    : 0;

  const bgSrc = scene.bgImage ?? backgroundById(scene.bgPreset)?.src ?? null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: scene.bgColor,
        ...style,
      }}
    >
      {bgSrc && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${bgSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
           transform: `translate(${width / 2}px, ${height / 2}px) scale(${cam.zoom}) translate(${-cam.x}px, ${-cam.y}px)`,
        }}
      >

        {scene.elements.map((el) => {
          const end = el.startTime + el.drawDuration;
          const p =
            time < el.startTime
              ? 0
              : time >= end
                ? 1
                : (time - el.startTime) / el.drawDuration;
          let pose = elementPoseAt(el, time);
          let sweepTilt = 0;
          if (sweepSceneX !== undefined) {
            const push = sweepSceneX - pose.x;
            if (push > 0) {
              pose = { ...pose, x: pose.x + push };
              sweepTilt = Math.min(6, push / 60);
            }
          }
          const isSlide = (el.entry ?? "draw") === "slide";
          if (sweepTilt) pose = { ...pose, rotation: pose.rotation + sweepTilt };
          if ((el.entry ?? "draw") === "unfold") {
            if (time < el.startTime) return null;
            const paperAlpha = paperOpacityAt(el, time);
            if (p < 1 || paperAlpha > 0.01)
              return (
                <PaperUnfold
                  key={el.id}
                  el={el}
                  pose={pose}
                  progress={p}
                  paperOpacity={paperAlpha}
                />
              );
            // paper is gone — just the clean artwork
            return (
              <ElementRenderer key={el.id} el={el} progress={1} visible pose={pose} />
            );
          }

          if (isSlide) {
            const { dx, dy, opacity } = slideEntryOffset(p, el.width, el.height);
            const slidePose = { ...pose, x: pose.x + dx, y: pose.y + dy };
            return (
              <div key={el.id} style={{ opacity }}>
                <ElementRenderer
                  el={el}
                  progress={1}
                  visible={time >= el.startTime}
                  pose={slidePose}
                />
                {time >= el.startTime && p < 1 && (
                  <HandCarrier
                    x={slidePose.x + el.width * 0.35}
                    y={slidePose.y + el.height * 0.5}
                    progress={p}
                  />
                )}
              </div>
            );
          }

          if ((el.entry ?? "draw") === "appear") {
            const style = el.appearStyle ?? "pop";
            const { dx, dy, scale: aos, opacity } = appearEntryOffset(
              style,
              p,
              el.width,
              el.height,
              el.appearDirection,
            );
            // Fold the scale into the element's own pose (ElementRenderer scales
            // around the element's centre), so pop grows from the element itself
            // rather than from the canvas origin — direction stays where you set it.
            const appearPose = {
              ...pose,
              x: pose.x + dx,
              y: pose.y + dy,
              scale: pose.scale * aos,
            };
            return (
              <div key={el.id} style={{ opacity }}>
                <ElementRenderer
                  el={el}
                  progress={1}
                  visible={time >= el.startTime}
                  pose={appearPose}
                />
              </div>
            );
          }

          return (
            <ElementRenderer
              key={el.id}
              el={el}
              progress={p}
              visible={time >= el.startTime}
              pose={pose}
            />
          );
        })}
        {showQuill &&
          active &&
          ((active.entry ?? "draw") === "pen" ? (
            <PenHand
              el={active}
              progress={(time - active.startTime) / active.drawDuration}
              pose={elementPoseAt(active, Math.max(time, active.startTime))}
              approach={activeApproach}
            />
          ) : (active.entry ?? "draw") === "paper-pen" ? (
            <PaperPenHand
              el={active}
              progress={(time - active.startTime) / active.drawDuration}
              pose={elementPoseAt(active, Math.max(time, active.startTime))}
              approach={activeApproach}
            />
          ) : (
            <Quill
              el={active}
              progress={(time - active.startTime) / active.drawDuration}
              pose={elementPoseAt(active, Math.max(time, active.startTime))}
              approach={activeApproach}
            />
          ))}
      </div>
    </div>
  );
}

/* --------------------------------- stage -------------------------------- */

/** Renders the whole multi-scene video at a global time. */
export function Stage({
  scenes,
  time,
  innerRef,
  showQuill = true,
  mode = "landscape",
  videos = [],
  playing = false,
}: {
  scenes: Scene[];
  time: number;
  innerRef?: React.Ref<HTMLDivElement>;
  showQuill?: boolean;
  mode?: CanvasMode;
  videos?: VideoClip[];
  playing?: boolean;
}) {
  const width = mode === "portrait" ? CANVAS_HEIGHT : CANVAS_WIDTH;
  const height = mode === "portrait" ? CANVAS_WIDTH : CANVAS_HEIGHT;
  const offs = sceneOffsets(scenes);
  const sweeps: React.ReactNode[] = [];
  let sweeping = "";
  let sweepDuration = 1.2;

  const layers = scenes.map((scene, i) => {
    const start = offs[i];
    const dur = sceneDuration(scene);
    const end = start + dur;
    if (time < start || time > end) return null;

    const local = time - start;
    let style: React.CSSProperties = {};
    let sweepProgress: number | undefined;

    // outgoing transition into the next scene
    const tr = scene.transition;
    if (i < scenes.length - 1 && tr.type !== "none") {
      const overlapStart = offs[i + 1];
      if (time >= overlapStart) {
        const q = Math.min(1, (time - overlapStart) / Math.max(0.01, tr.duration));
        if (tr.type === "fade") style = { opacity: 1 - q };
        if (tr.type === "slide")
          style = { transform: `translateX(${-q * 35}%)`, opacity: 1 - q * 0.4 };
        if (tr.type === "wipe") style = { opacity: 1 };
        if (tr.type === "hand") {
          sweeping = scene.id;
          sweepDuration = tr.duration;
          // the paper hand drags each element off to the right the moment its
          // fingertips reach it — handled per element inside SceneLayer
          sweepProgress = q;
          // keep this layer above the incoming scene and let it show through
          style = { background: "transparent", zIndex: 500 + i };
          sweeps.push(
            <SweepHand key={`sweep-${scene.id}`} progress={q} width={width} height={height} />,
          );
        }
      }
    }

    // incoming transition from the previous scene
    const prev = scenes[i - 1];
    if (prev && prev.transition.type !== "none") {
      const d = Math.max(0.01, prev.transition.duration);
      if (local < d) {
        const q = local / d;
        if (prev.transition.type === "fade") style = { ...style, opacity: q };
        if (prev.transition.type === "slide")
          style = { ...style, transform: `translateX(${(1 - q) * 100}%)` };
        if (prev.transition.type === "wipe")
          style = { ...style, clipPath: `inset(0 ${(1 - q) * 100}% 0 0)` };
        // "hand" leaves the incoming scene untouched — it is revealed as the
        // hand carries the previous scene away.
      }
    }

    return (
      <SceneLayer
        key={scene.id}
        scene={scene}
        time={local}
        showQuill={showQuill}
        style={{ zIndex: i, ...style }}
        width={width}
        height={height}
        sweepProgress={sweepProgress}
      />
    );
  });

  // a lot of paper folding at once when the sweep hand enters
  const sweepRef = useRef("");
  useEffect(() => {
    if (sweeping && sweeping !== sweepRef.current) playPaperSweep(sweepDuration);
    sweepRef.current = sweeping;
  }, [sweeping, sweepDuration]);

  return (
    <div
      ref={innerRef}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        background: scenes[0]?.bgColor ?? "#fff",
      }}
    >
      {layers}
      {sweeps}
      <VideoOverlay clips={videos} time={time} playing={playing} width={width} height={height} />
    </div>
  );
}
