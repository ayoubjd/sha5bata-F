import { unzipSync } from "fflate";

export interface CustomFont {
  /** Family name shared by every weight/style of the same typeface. */
  family: string;
  dataUrl: string;
  weight: string;
  style: "normal" | "italic";
  /** Original file name, useful as a label. */
  file: string;
}

const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

function isFontName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("__macosx") || lower.split("/").pop()?.startsWith(".")) return false;
  return FONT_EXT.test(lower);
}

function mimeOf(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".otf")) return "font/otf";
  return "font/ttf";
}

function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

const WEIGHTS: [RegExp, string][] = [
  [/thin|hairline/i, "100"],
  [/extra ?light|ultra ?light/i, "200"],
  [/light/i, "300"],
  [/regular|normal|book/i, "400"],
  [/medium/i, "500"],
  [/semi ?bold|demi ?bold/i, "600"],
  [/extra ?bold|ultra ?bold/i, "800"],
  [/black|heavy/i, "900"],
  [/bold/i, "700"],
];

/**
 * Splits "Caveat-SemiBoldItalic.ttf" into family "Caveat", weight 600, italic —
 * so all variants register under one family and the browser renders the real
 * design instead of synthesising a fake bold/italic.
 */
function parseFontName(path: string) {
  const file = path.split("/").pop() ?? path;
  const base = file.replace(FONT_EXT, "");
  const parts = base.split(/[-_]/);
  const tail = parts.length > 1 ? parts[parts.length - 1] : "";
  const spaced = tail.replace(/([a-z])([A-Z])/g, "$1 $2");

  const style: "normal" | "italic" = /italic|oblique/i.test(spaced) ? "italic" : "normal";
  const withoutItalic = spaced.replace(/italic|oblique/gi, "").trim();
  const weight = WEIGHTS.find(([re]) => re.test(withoutItalic))?.[1];

  const isStyleTail =
    !!weight || style === "italic" || /^(it|obl)$/i.test(withoutItalic);
  const familyRaw = isStyleTail && parts.length > 1 ? parts.slice(0, -1).join(" ") : base;

  return {
    family: familyRaw
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    weight: weight ?? (style === "italic" ? "400" : "400"),
    style,
    file,
  };
}

/** Load the font into the document with its real weight/style descriptors. */
export async function registerFont(font: CustomFont) {
  if (typeof document === "undefined") return;
  const face = new FontFace(font.family, `url(${font.dataUrl})`, {
    weight: font.weight,
    style: font.style,
  });
  await face.load();
  document.fonts.add(face);
}

/** Extract every font file from a .zip (or accept a bare font file). */
export async function readFontArchive(file: File): Promise<CustomFont[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const out: CustomFont[] = [];

  const push = (name: string, bytes: Uint8Array) => {
    const meta = parseFontName(name);
    out.push({ ...meta, dataUrl: bytesToDataUrl(bytes, mimeOf(name)) });
  };

  if (isFontName(file.name)) {
    push(file.name, buf);
  } else {
    const entries = unzipSync(buf);
    for (const [name, bytes] of Object.entries(entries)) {
      if (!isFontName(name) || !bytes.length) continue;
      push(name, bytes);
    }
  }

  // prefer woff2 > woff > otf > ttf when the same variant ships twice
  const rank = (f: CustomFont) =>
    f.file.toLowerCase().endsWith(".woff2")
      ? 3
      : f.file.toLowerCase().endsWith(".woff")
        ? 2
        : f.file.toLowerCase().endsWith(".otf")
          ? 1
          : 0;
  const best = new Map<string, CustomFont>();
  for (const f of out) {
    const key = `${f.family}|${f.weight}|${f.style}`;
    const cur = best.get(key);
    if (!cur || rank(f) > rank(cur)) best.set(key, f);
  }
  const fonts = [...best.values()];

  for (const f of fonts) await registerFont(f);
  return fonts;
}

/** Distinct family names, with the weights available for each. */
export function fontFamilies(fonts: CustomFont[]) {
  const map = new Map<string, Set<string>>();
  for (const f of fonts) {
    if (!map.has(f.family)) map.set(f.family, new Set());
    map.get(f.family)!.add(f.weight);
  }
  return [...map.entries()].map(([family, weights]) => ({
    family,
    weights: [...weights].sort(),
  }));
}
