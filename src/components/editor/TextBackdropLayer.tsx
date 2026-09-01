import type { TextElement } from "@/lib/editor/types";

/**
 * Paper / marker decoration drawn behind a text block.
 * Shared by the editor canvas and the animation stage so both look identical.
 *
 * Every style is tinted from `el.backdropColor` so the user can recolour the
 * paper, the highlighter or the sticky note.
 */

function shade(hex: string, amount: number) {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount * 255);
  const g = clamp(((n >> 8) & 255) + amount * 255);
  const b = clamp((n & 255) + amount * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.5'/></svg>\")";

const FIBRE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.02 0.35' numOctaves='3'/><feColorMatrix type='saturate' values='0'/></filter><rect width='300' height='300' filter='url(%23f)' opacity='0.35'/></svg>\")";

/** Soft, wide wrinkle shading — the big folds you see across a real sheet. */
const WRINKLE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420'><filter id='w'><feTurbulence type='fractalNoise' baseFrequency='0.008 0.014' numOctaves='4' seed='19'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0.9'/></feComponentTransfer></filter><rect width='420' height='420' filter='url(%23w)' opacity='0.6'/></svg>\")";

/** Fine hairline creases, gives the paper its micro-relief. */
const CREASES =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='k'><feTurbulence type='turbulence' baseFrequency='0.035' numOctaves='2' seed='5'/><feColorMatrix type='saturate' values='0'/></filter><rect width='260' height='260' filter='url(%23k)' opacity='0.45'/></svg>\")";

/** Faint ruled lines, like a notepad. */
const RULES = (color: string) =>
  `repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 25px, ${shade(color, -0.22)} 25px, ${shade(color, -0.22)} 26px)`;

/** Faint graph-paper grid. */
const GRID = (color: string) =>
  `repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 15px, ${shade(color, -0.16)} 15px, ${shade(color, -0.16)} 16px), repeating-linear-gradient(90deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 15px, ${shade(color, -0.16)} 15px, ${shade(color, -0.16)} 16px)`;

/** A strip of translucent washi tape. */
function Tape({
  style,
  tint = "#d8c48a",
}: {
  style: React.CSSProperties;
  tint?: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        background: `linear-gradient(180deg, ${shade(tint, 0.1)} 0%, ${tint} 55%, ${shade(tint, -0.08)} 100%)`,
        opacity: 0.78,
        mixBlendMode: "multiply",
        clipPath:
          "polygon(2% 6%, 20% 0%, 44% 7%, 68% 1%, 88% 8%, 100% 3%, 99% 92%, 82% 99%, 60% 92%, 36% 100%, 15% 93%, 0% 98%)",
        boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: FIBRE,
          backgroundSize: "180% 100%",
          mixBlendMode: "multiply",
          opacity: 0.2,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 42%, rgba(255,255,255,0.28) 100%)",
        }}
      />
    </div>
  );
}

/** A textured sheet of paper with soft edge shading. */
function Sheet({
  color,
  clipPath,
  radius = 0,
  rule = "none",
}: {
  color: string;
  clipPath: string;
  radius?: number;
  /** printed ruling on the stock */
  rule?: "none" | "lines" | "grid";
}) {

  return (
    <div style={{ position: "absolute", inset: 0, clipPath, borderRadius: radius }}>
      {/* base tone with soft lighting */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(120% 90% at 25% 12%, ${shade(color, 0.06)} 0%, ${color} 45%, ${shade(color, -0.09)} 100%)`,
        }}
      />
      {/* broad wrinkle shading — the paper is never perfectly flat */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: WRINKLE,
          backgroundSize: "180% 180%",
          backgroundPosition: "30% 20%",
          mixBlendMode: "multiply",
          opacity: 0.22,
          filter: "contrast(1.5)",
        }}
      />
      {/* matching highlight pass so wrinkles read as relief, not dirt */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: WRINKLE,
          backgroundSize: "180% 180%",
          backgroundPosition: "31.2% 21.4%",
          mixBlendMode: "screen",
          opacity: 0.18,
          filter: "contrast(1.6)",
        }}
      />
      {/* hairline creases */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: CREASES,
          backgroundSize: "130px 130px",
          mixBlendMode: "multiply",
          opacity: 0.12,
        }}
      />
      {/* paper fibre + grain */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `${GRAIN}, ${FIBRE}`,
          backgroundSize: "160px 160px, 300px 300px",
          mixBlendMode: "multiply",
          opacity: 0.24,
        }}
      />
      {/* crease highlights */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(107deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 18%, rgba(0,0,0,0.06) 34%, rgba(255,255,255,0.22) 52%, rgba(0,0,0,0.05) 72%, rgba(255,255,255,0.18) 100%)",
          opacity: 0.5,
        }}
      />
      {/* inner edge darkening (torn fibres catching light) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow:
            "inset 0 0 22px rgba(0,0,0,0.18), inset 0 2px 0 rgba(255,255,255,0.4), inset 0 -3px 6px rgba(0,0,0,0.12)",
        }}
      />
      {/* printed ruling, sunk into the fibres */}
      {rule !== "none" && (
        <div
          style={{
            position: "absolute",
            inset: "7% 6% 7% 6%",
            backgroundImage: rule === "grid" ? GRID(color) : RULES(color),
            mixBlendMode: "multiply",
            opacity: rule === "grid" ? 0.5 : 0.55,
            filter: "blur(0.3px)",
          }}
        />
      )}
      {/* aged foxing — warm staining that creeps in from the torn edges */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 120% at 50% 50%, rgba(0,0,0,0) 52%, rgba(120,82,40,0.16) 82%, rgba(92,60,26,0.3) 100%)",
          mixBlendMode: "multiply",
        }}
      />
      {/* deckled edge fuzz */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: GRAIN,
          backgroundSize: "70px 70px",
          mixBlendMode: "overlay",
          opacity: 0.14,
        }}
      />
    </div>
  );
}



const TORN =
  "polygon(1% 7%, 7% 2%, 15% 6%, 23% 1%, 32% 6%, 41% 2%, 50% 7%, 59% 2%, 69% 6%, 78% 1%, 88% 6%, 96% 2%, 100% 9%, 98% 22%, 100% 35%, 97% 48%, 100% 62%, 98% 76%, 100% 90%, 93% 98%, 82% 94%, 71% 99%, 60% 95%, 49% 100%, 38% 95%, 27% 99%, 16% 95%, 6% 99%, 0% 91%, 2% 77%, 0% 63%, 3% 49%, 0% 36%, 2% 21%)";

const SHEET =
  "polygon(0% 3%, 9% 0.5%, 21% 3%, 34% 0.5%, 48% 3%, 62% 0.5%, 76% 3%, 89% 0.5%, 100% 3%, 98.5% 25%, 100% 50%, 98.5% 75%, 100% 97%, 88% 99.5%, 74% 97%, 60% 99.5%, 45% 97%, 30% 99.5%, 16% 97%, 3% 99.5%, 0% 97%, 1.5% 74%, 0% 50%, 1.5% 26%)";

export function TextBackdropLayer({ el }: { el: TextElement }) {
  const kind = el.backdrop ?? "none";
  if (kind === "none") return null;

  const color =
    el.backdropColor ?? (kind === "highlight" ? "#ffd83d" : kind === "sticky" ? "#ffe066" : "#f3e6cb");
  const dropShadow =
    "drop-shadow(0 2px 2px rgba(0,0,0,0.22)) drop-shadow(0 14px 24px rgba(0,0,0,0.3))";

  if (kind === "highlight") {
    return (
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "-3%",
          right: "-3%",
          top: "16%",
          height: "68%",
          filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.12))",
        }}
      >
        {/* two overlapping marker strokes, translucent like real ink */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(178deg, ${shade(color, 0.1)} 0%, ${color} 42%, ${shade(color, -0.08)} 100%)`,
            mixBlendMode: "multiply",
            opacity: 0.9,
            clipPath:
              "polygon(0.4% 14%, 12% 4%, 30% 10%, 52% 2%, 74% 9%, 92% 3%, 100% 13%, 99% 46%, 100% 82%, 88% 95%, 66% 88%, 44% 97%, 22% 90%, 8% 98%, 0% 84%)",
            filter: "blur(0.4px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "4%",
            right: "2%",
            top: "38%",
            height: "48%",
            background: `linear-gradient(90deg, ${shade(color, -0.12)}, ${shade(color, 0.05)})`,
            mixBlendMode: "multiply",
            opacity: 0.55,
            clipPath: "polygon(0% 20%, 100% 0%, 98% 78%, 2% 100%)",
            filter: "blur(1px)",
          }}
        />
        {/* ink pooling at the stroke ends, where the marker starts and lifts */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, ${shade(color, -0.2)} 0%, rgba(0,0,0,0) 9%, rgba(0,0,0,0) 90%, ${shade(color, -0.22)} 100%)`,
            mixBlendMode: "multiply",
            opacity: 0.5,
            filter: "blur(1.5px)",
          }}
        />
        {/* dry-marker streaks along the drag direction */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: FIBRE,
            backgroundSize: "220% 100%",
            mixBlendMode: "screen",
            opacity: 0.16,
          }}
        />

      </div>
    );
  }

  if (kind === "cutout") {
    return (
      <div
        aria-hidden
        style={{ position: "absolute", inset: "-9% -6%", filter: dropShadow }}
      >
        <Sheet color={color} clipPath={TORN} />
        <Tape
          style={{ left: "58%", top: "-5%", width: "22%", height: "16%", transform: "rotate(-4deg)" }}
        />

      </div>
    );
  }

  if (kind === "holes") {
    return (
      <div aria-hidden style={{ position: "absolute", inset: "-8% -5%", filter: dropShadow }}>
        <Sheet color={color} clipPath={SHEET} rule="lines" />
        {[0.2, 0.5, 0.8].map((t) => (
          <div
            key={t}
            style={{
              position: "absolute",
              left: "4.5%",
              top: `calc(${t * 100}% - 8px)`,
              width: 16,
              height: 16,
              borderRadius: 999,
              background:
                "radial-gradient(circle at 50% 38%, rgba(0,0,0,0.72), rgba(0,0,0,0.9))",
              boxShadow:
                "inset 0 3px 4px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.5)",
            }}
          />
        ))}
        {/* margin rule line, like notebook paper */}
        <div
          style={{
            position: "absolute",
            left: "11%",
            top: "6%",
            bottom: "6%",
            width: 1,
            background: "rgba(190,80,80,0.35)",
          }}
        />
      </div>
    );
  }

  if (kind === "sticky") {
    return (
      <div aria-hidden style={{ position: "absolute", inset: "-9% -7%", filter: dropShadow }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: "polygon(0 0, 100% 1%, 100% 88%, 86% 100%, 0 99%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(165deg, ${shade(color, 0.09)} 0%, ${color} 52%, ${shade(color, -0.12)} 100%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: GRAIN,
              backgroundSize: "160px 160px",
              mixBlendMode: "multiply",
              opacity: 0.2,
            }}
          />
          {/* soft bowing of the note across its width */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: WRINKLE,
              backgroundSize: "200% 200%",
              mixBlendMode: "multiply",
              opacity: 0.12,
              filter: "contrast(1.4)",
            }}
          />
          {/* adhesive strip along the top, slightly darker where it presses */}
          <div
            style={{
              position: "absolute",
              left: "6%",
              right: "6%",
              top: 0,
              height: "22%",
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0) 85%)",
              opacity: 0.7,
            }}
          />

          <div
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: "inset 0 -26px 30px -26px rgba(0,0,0,0.35)",
            }}
          />
        </div>
        {/* curled corner */}
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: "16%",
            paddingBottom: "13%",
            background: `linear-gradient(315deg, ${shade(color, -0.28)} 0%, ${shade(color, -0.05)} 60%, rgba(0,0,0,0) 61%)`,
            clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
            filter: "drop-shadow(-2px -2px 3px rgba(0,0,0,0.25))",
          }}
        />
      </div>
    );
  }

  // clip + pin share the paper sheet
  return (
    <div aria-hidden style={{ position: "absolute", inset: "-10% -5%" }}>
      <div style={{ position: "absolute", inset: 0, filter: dropShadow }}>
        <Sheet color={color} clipPath={SHEET} rule="grid" />
      </div>
      {kind === "clip" ? (
        <svg
          viewBox="0 0 40 60"
          style={{
            position: "absolute",
            left: "50%",
            top: -24,
            width: 36,
            height: 56,
            transform: "translateX(-50%)",
            filter: "drop-shadow(0 4px 5px rgba(0,0,0,0.4))",
          }}
        >
          <defs>
            <linearGradient id="clipMetal" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8f949c" />
              <stop offset="35%" stopColor="#e9ecf1" />
              <stop offset="60%" stopColor="#aab0b8" />
              <stop offset="100%" stopColor="#6f747c" />
            </linearGradient>
          </defs>
          <path
            d="M8 52 V16 a12 12 0 0 1 24 0 V44"
            fill="none"
            stroke="url(#clipMetal)"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <path
            d="M8 50 V16 a12 12 0 0 1 24 0 V42"
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: -12,
            width: 26,
            height: 26,
            marginLeft: -13,
            borderRadius: 999,
            background:
              "radial-gradient(circle at 34% 28%, #ffb0a2 0%, #e2543f 42%, #a52c1c 78%, #6d1a10 100%)",
            boxShadow:
              "0 6px 10px rgba(0,0,0,0.45), inset -2px -3px 5px rgba(0,0,0,0.35)",
          }}
        />
      )}
    </div>
  );
}
