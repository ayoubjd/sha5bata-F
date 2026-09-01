// Turns a raster image into a line-art SVG the quill can actually trace.
//
// The old approach flattened transparency onto white and let Potrace fill
// the silhouette, which produced a solid grey box for transparent PNGs.
// Instead we build an *edge map* (alpha boundaries + luminance edges),
// trace that with Potrace, and emit stroke-only paths.

const MAX = 520;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

/** Black-on-white edge bitmap: outlines of the subject + interior detail. */
function buildEdgeCanvas(img: HTMLImageElement): HTMLCanvasElement | null {
  const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * ratio));
  const h = Math.max(2, Math.round(img.height * ratio));
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;
  sctx.drawImage(img, 0, 0, w, h);
  const data = sctx.getImageData(0, 0, w, h).data;

  // Per-pixel luminance premultiplied against alpha (transparent = white paper)
  const lum = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    const l =
      (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) /
      255;
    alpha[i] = a;
    lum[i] = a * l + (1 - a) * 1; // composite over white
  }

  // Sobel over luminance + alpha so both drawn detail and cut-out silhouette
  // edges become ink.
  const edge = new Float32Array(w * h);
  let maxE = 0;
  const at = (arr: Float32Array, x: number, y: number) =>
    arr[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let gx = 0;
      let gy = 0;
      for (const arr of [lum, alpha]) {
        const a = at(arr, x - 1, y - 1);
        const b = at(arr, x, y - 1);
        const c = at(arr, x + 1, y - 1);
        const d = at(arr, x - 1, y);
        const f = at(arr, x + 1, y);
        const g = at(arr, x - 1, y + 1);
        const hh = at(arr, x, y + 1);
        const i2 = at(arr, x + 1, y + 1);
        gx += Math.abs(c + 2 * f + i2 - (a + 2 * d + g));
        gy += Math.abs(g + 2 * hh + i2 - (a + 2 * b + c));
      }
      const m = Math.hypot(gx, gy);
      edge[y * w + x] = m;
      if (m > maxE) maxE = m;
    }
  }
  if (maxE <= 0.0001) return null;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return null;
  const outImg = octx.createImageData(w, h);
  const threshold = 0.18 * maxE;
  let inkPixels = 0;
  for (let i = 0; i < w * h; i++) {
    const ink = edge[i] > threshold;
    if (ink) inkPixels++;
    const v = ink ? 0 : 255;
    outImg.data[i * 4] = v;
    outImg.data[i * 4 + 1] = v;
    outImg.data[i * 4 + 2] = v;
    outImg.data[i * 4 + 3] = 255;
  }
  if (inkPixels < 24) return null;
  octx.putImageData(outImg, 0, 0);
  return out;
}

/** Strip fills so the traced result is pure line art the quill can ink. */
function toStrokes(svg: string): string | null {
  if (typeof document === "undefined") return svg;
  const holder = document.createElement("div");
  holder.innerHTML = svg;
  const root = holder.querySelector("svg");
  if (!root) return null;
  const shapes = Array.from(
    root.querySelectorAll<SVGElement>("path, polygon, polyline, rect, circle, ellipse"),
  );
  if (!shapes.length) return null;
  const vb = root.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const scale = vb && vb.length === 4 ? Math.max(vb[2], vb[3]) : 512;
  const sw = Math.max(0.6, scale / 380);
  shapes.forEach((s) => {
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", String(sw));
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.removeAttribute("style");
  });
  root.querySelectorAll("g").forEach((g) => {
    g.removeAttribute("fill");
    g.removeAttribute("style");
  });
  return root.outerHTML;
}

export async function vectorizeImage(src: string): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const img = await loadImage(src);
    const edges = buildEdgeCanvas(img);
    if (!edges) return null;

    const { init, potrace } = await import("esm-potrace-wasm");
    await init();

    const out = await potrace(edges, {
      turdsize: 4,
      turnpolicy: 4,
      alphamax: 1,
      opticurve: true,
      opttolerance: 0.3,
      pathonly: false,
      extractcolors: false,
      posterizelevel: 1,
      posterizationalgorithm: 0,
    });
    const svg = Array.isArray(out) ? out[0] : out;
    if (!svg || !svg.includes("<svg")) return null;
    return toStrokes(svg);
  } catch {
    return null;
  }
}
