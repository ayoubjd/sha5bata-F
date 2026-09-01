// Utilities that drive the "drawn by hand" tracing effect.
// Everything is cached per-SVG-string because getTotalLength() forces layout.

interface Parsed {
  root: SVGSVGElement;
  nodes: SVGGeometryElement[];
  lens: number[];
  total: number;
  vw: number;
  vh: number;
}

const cache = new Map<string, Parsed | null>();

const SELECTOR = "path, circle, rect, line, polyline, polygon, ellipse";

/**
 * Make an arbitrary SVG string safe to drop on the canvas: ensure a viewBox
 * exists and force the root to fill its container instead of using the
 * icon's intrinsic (often 1em / 24px) size.
 */
export function normalizeSvg(svg: string): string {
  if (typeof document === "undefined") return svg;
  const holder = document.createElement("div");
  holder.innerHTML = svg;
  const root = holder.querySelector("svg");
  if (!root) return svg;
  if (!root.getAttribute("viewBox")) {
    const w = parseFloat(root.getAttribute("width") || "") || 24;
    const h = parseFloat(root.getAttribute("height") || "") || 24;
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.display = "block";
  return root.outerHTML;
}

function parse(svg: string): Parsed | null {
  if (typeof document === "undefined") return null;
  if (cache.has(svg)) return cache.get(svg)!;
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0";
  holder.innerHTML = svg;
  document.body.appendChild(holder);
  const root = holder.querySelector("svg");
  if (!root) {
    document.body.removeChild(holder);
    cache.set(svg, null);
    return null;
  }
  const nodes = Array.from(root.querySelectorAll<SVGGeometryElement>(SELECTOR));
  const lens = nodes.map((n) => {
    try {
      return n.getTotalLength();
    } catch {
      return 0;
    }
  });
  const vb = root.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const vw = vb && vb.length === 4 ? vb[2] : Number(root.getAttribute("width")) || 24;
  const vh = vb && vb.length === 4 ? vb[3] : Number(root.getAttribute("height")) || 24;
  // Keep the parsed copy alive (detached) so getPointAtLength keeps working.
  const detached = root.cloneNode(true) as SVGSVGElement;
  const parsed: Parsed = {
    root,
    nodes,
    lens,
    total: lens.reduce((a, b) => a + b, 0) || 1,
    vw,
    vh,
  };
  // keep the live node in the DOM but hidden so geometry stays measurable
  holder.style.width = "0px";
  holder.style.height = "0px";
  holder.style.overflow = "hidden";
  void detached;
  cache.set(svg, parsed);
  return parsed;
}

export function svgViewBox(svg: string): { vw: number; vh: number } {
  const p = parse(svg);
  return { vw: p?.vw ?? 24, vh: p?.vh ?? 24 };
}

export function extractPathLengths(svg: string): number[] {
  return parse(svg)?.lens ?? [];
}

/**
 * Returns SVG markup where strokes are revealed progressively (0..1).
 * Filled shapes fade their fill in just after their outline is traced, which
 * is what makes solid clip-art still look "drawn".
 */
export function svgWithProgress(svg: string, progress: number): string {
  const p = parse(svg);
  if (!p) return svg;
  const clone = p.root.cloneNode(true) as SVGSVGElement;
  const nodes = Array.from(clone.querySelectorAll<SVGGeometryElement>(SELECTOR));
  let drawn = progress * p.total;
  nodes.forEach((n, i) => {
    const L = p.lens[i] ?? 0;
    const show = Math.max(0, Math.min(L, drawn));
    const local = L > 0 ? show / L : 1;
    drawn -= L;

    const fill = n.getAttribute("fill");
    const stroke = n.getAttribute("stroke");
    const hasFill = fill && fill !== "none";
    if (hasFill && (!stroke || stroke === "none")) {
      // give solid shapes a temporary outline so they can be traced
      n.setAttribute("stroke", "currentColor");
      n.setAttribute("stroke-width", n.getAttribute("stroke-width") ?? "1.5");
    }
    if (hasFill) {
      // fill catches up with the outline
      const fillP = Math.max(0, (local - 0.55) / 0.45);
      n.setAttribute("fill-opacity", String(Math.min(1, fillP)));
    }
    n.setAttribute("stroke-linecap", "round");
    n.setAttribute("stroke-linejoin", "round");
    n.setAttribute("stroke-dasharray", `${L}`);
    n.setAttribute("stroke-dashoffset", `${L - show}`);
  });
  return clone.outerHTML;
}

/** Accumulated transform from a node up to the root svg (viewBox space). */
function toViewBox(
  node: Element,
  root: Element,
  x: number,
  y: number,
): { x: number; y: number } {
  if (typeof DOMMatrix === "undefined") return { x, y };
  const chain: Element[] = [];
  let cur: Element | null = node;
  while (cur && cur !== root) {
    chain.unshift(cur);
    cur = cur.parentElement;
  }
  let m = new DOMMatrix();
  for (const el of chain) {
    const list = (el as SVGGraphicsElement).transform?.baseVal;
    const consolidated = list?.consolidate?.();
    if (consolidated) m = m.multiply(DOMMatrix.fromMatrix(consolidated.matrix));
  }
  const p = m.transformPoint(new DOMPoint(x, y));
  return { x: p.x, y: p.y };
}

/** Tip position, in viewBox units, at the given progress. */
export function pointAtProgress(
  svg: string,
  progress: number,
): { x: number; y: number } | null {
  const p = parse(svg);
  if (!p) return null;
  let target = progress * p.total;
  for (let i = 0; i < p.nodes.length; i++) {
    const L = p.lens[i];
    if (target <= L) {
      try {
        const pt = p.nodes[i].getPointAtLength(Math.max(0, target));
        return toViewBox(p.nodes[i], p.root, pt.x, pt.y);
      } catch {
        return null;
      }
    }
    target -= L;
  }
  return null;
}

// ------------------------- text tracing -------------------------

let measureCtx: CanvasRenderingContext2D | null = null;

export function measureText(text: string, font: string): number {
  if (typeof document === "undefined") return 0;
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return 0;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

export interface TextTrace {
  /** how many whole characters are inked */
  chars: number;
  /** opacity of the character currently being written */
  partial: number;
  /** x offset (px, from the text block's left edge) of the nib */
  nibX: number;
  /** total rendered width of the text */
  fullWidth: number;
  /** left offset of the glyph currently being written */
  charStart: number;
  /** width of the glyph currently being written */
  charWidth: number;
}

/** Char-by-char ink flow, with the nib riding the current glyph. */
export function traceText(
  text: string,
  progress: number,
  font: string,
): TextTrace {
  const p = Math.max(0, Math.min(1, progress));
  const exact = text.length * p;
  const chars = Math.floor(exact);
  const slot = exact - chars;
  // Each glyph inks in during the first 70% of its own slot, then the nib
  // rests briefly before moving on — that pause is what reads as "writing".
  const INK = 0.7;
  const partial = Math.max(0, Math.min(1, slot / INK));
  const fullWidth = measureText(text, font);
  const doneWidth = measureText(text.slice(0, chars), font);
  const nextWidth = measureText(text.slice(0, Math.min(text.length, chars + 1)), font);
  return {
    chars,
    partial,
    // the nib sits exactly at the ink front of the glyph being written
    nibX: doneWidth + (nextWidth - doneWidth) * partial,
    fullWidth,
    charStart: doneWidth,
    charWidth: Math.max(0, nextWidth - doneWidth),
  };
}

export interface TextLayoutChar {
  index: number;
  char: string;
  x: number;
  line: number;
  width: number;
}

export interface TextLayout {
  chars: TextLayoutChar[];
  lineWidths: number[];
  lineCount: number;
}

/**
 * Measures the same word wrapping used by the canvas text box. Keeping this
 * deterministic lets the writing tool follow wrapped text without depending
 * on viewport pixels or DOM timing.
 */
export function layoutText(
  text: string,
  font: string,
  maxWidth: number,
): TextLayout {
  const limit = Math.max(1, maxWidth);
  const chars: TextLayoutChar[] = [];
  const lineWidths: number[] = [0];
  let line = 0;
  let x = 0;

  const nextLine = () => {
    line += 1;
    x = 0;
    lineWidths[line] = 0;
  };

  const tokens = text.match(/\n|[^\S\n]+|[^\s]+/g) ?? [];
  let sourceIndex = 0;
  for (const token of tokens) {
    if (token === "\n") {
      sourceIndex += 1;
      nextLine();
      continue;
    }
    const tokenWidth = measureText(token, font);
    const isSpace = /^\s+$/.test(token);
    if (!isSpace && x > 0 && x + tokenWidth > limit) nextLine();

    for (const char of token) {
      const width = measureText(char, font);
      if (x > 0 && x + width > limit) nextLine();
      chars.push({ index: sourceIndex, char, x, line, width });
      x += width;
      lineWidths[line] = x;
      sourceIndex += 1;
    }
  }
  return { chars, lineWidths, lineCount: lineWidths.length };
}

/**
 * True when the text contains right-to-left script (Arabic, Hebrew, …).
 * Used to flip the writing-tool direction and the ink reveal so Arabic
 * text is written right-to-left the way it reads.
 */
export function isRTLText(text: string): boolean {
  return /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(
    text,
  );
}

export interface TextLine {
  /** the line's text (logical order) */
  str: string;
  /** shaped width of the whole line */
  width: number;
  /** source index of the line's first char */
  firstIdx: number;
  /** source index of the line's last char */
  lastIdx: number;
}

/**
 * Splits text into the same wrapped lines layoutText produces, returning
 * each line's string (reconstructed in logical order) plus its shaped
 * width and source-index range. Empty lines are preserved.
 */
export function textLines(
  text: string,
  font: string,
  maxWidth: number,
): TextLine[] {
  const layout = layoutText(text, font, maxWidth);
  const lines: (TextLine | undefined)[] = [];
  for (const c of layout.chars) {
    const l = lines[c.line] ?? { str: "", width: 0, firstIdx: c.index, lastIdx: c.index };
    l.str += c.char;
    l.lastIdx = c.index;
    lines[c.line] = l;
  }
  const out: TextLine[] = [];
  for (let i = 0; i < layout.lineCount; i++) {
    const l = lines[i];
    out.push(l ? { ...l, width: measureText(l.str, font) } : { str: "", width: 0, firstIdx: -1, lastIdx: -1 });
  }
  return out;
}

// ------------------------- glyph contour tracing -------------------------

interface GlyphProfile {
  /** rendered glyph width in px */
  width: number;
  /** per-column distance (px) from the baseline up to the topmost ink */
  top: Float32Array;
  /** per-column distance (px) from the baseline down to the lowest ink */
  bottom: Float32Array;
}

const glyphCache = new Map<string, GlyphProfile | null>();

/**
 * Rasterises a single glyph and extracts its ink contour, column by column.
 * This lets the quill nib ride the actual outline of the letter being written
 * instead of gliding along a flat baseline.
 */
function glyphProfile(char: string, font: string): GlyphProfile | null {
  const key = `${font}|${char}`;
  const hit = glyphCache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === "undefined" || !char.trim()) {
    glyphCache.set(key, null);
    return null;
  }
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "48") || 48;
  const canvas = document.createElement("canvas");
  const ctx2 = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx2) {
    glyphCache.set(key, null);
    return null;
  }
  ctx2.font = font;
  const w = Math.max(1, Math.ceil(ctx2.measureText(char).width));
  const baseline = Math.ceil(size * 1.3);
  canvas.width = w + 2;
  canvas.height = baseline + Math.ceil(size * 0.6);
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  c.font = font;
  c.textBaseline = "alphabetic";
  c.fillStyle = "#000";
  c.fillText(char, 1, baseline);
  const data = c.getImageData(0, 0, canvas.width, canvas.height).data;

  const top = new Float32Array(w);
  const bottom = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let hiY = -1;
    let loY = -1;
    for (let y = 0; y < canvas.height; y++) {
      if (data[(y * canvas.width + (x + 1)) * 4 + 3] > 40) {
        if (hiY < 0) hiY = y;
        loY = y;
      }
    }
    top[x] = hiY < 0 ? size * 0.35 : baseline - hiY;
    bottom[x] = loY < 0 ? 0 : baseline - loY;
  }
  const profile: GlyphProfile = { width: w, top, bottom };
  glyphCache.set(key, profile);
  return profile;
}

/**
 * Height above the baseline where the nib should sit while writing `char`,
 * at horizontal fraction `u` (0..1) through the glyph. Follows the letter's
 * own outline, easing between its top and bottom contour so the pen dips
 * through bowls and descenders the way a real hand would.
 */
export function glyphNibHeight(
  char: string,
  font: string,
  u: number,
): number | null {
  const g = glyphProfile(char, font);
  if (!g) return null;
  const f = Math.max(0, Math.min(0.999, u));
  const i = Math.min(g.width - 1, Math.floor(f * g.width));
  const j = Math.min(g.width - 1, i + 1);
  const frac = f * g.width - i;
  const topAt = g.top[i] + (g.top[j] - g.top[i]) * frac;
  const botAt = g.bottom[i] + (g.bottom[j] - g.bottom[i]) * frac;
  // ride the top contour, sinking toward the bottom of the stroke mid-glyph
  const dip = Math.max(0, Math.sin(f * Math.PI * 2)) * 0.35;
  return topAt + (botAt - topAt) * dip;
}


// ------------------------- raster sketch reveal -------------------------

/**
 * CSS mask that reveals a raster image in slanted "pencil shading" bands,
 * which reads much more like sketching than a flat wipe.
 */
export function sketchMask(progress: number): string {
  const p = Math.max(0, Math.min(1, progress));
  const soft = 6; // % feather
  const pct = p * (100 + soft);
  return `linear-gradient(105deg, #000 ${Math.max(0, pct - soft)}%, rgba(0,0,0,0.35) ${pct}%, rgba(0,0,0,0) ${Math.min(100, pct + soft)}%)`;
}
