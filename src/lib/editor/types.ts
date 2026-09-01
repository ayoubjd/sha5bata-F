export type ElementType = "svg" | "image" | "text";

export type Easing = "linear" | "ease" | "easeIn" | "easeOut";
export type CanvasMode = "landscape" | "portrait";
/** How an element arrives on the canvas. */
export type EntryAnimation = "draw" | "slide" | "pen" | "paper-pen" | "unfold" | "appear";
/** Appear entry styles. */
export type AppearStyle = "pop" | "fade" | "slide";
/** Direction an "appear" element flies in from (pop/slide only). */
export type AppearDirection = "left" | "right" | "up" | "down";

/** Preset paper stocks for the unfold entry. */
export type PaperStock =
  | "white"
  | "offwhite"
  | "kraft"
  | "parchment"
  | "newsprint"
  | "blueprint"
  | "custom";

export const PAPER_STOCKS: { value: PaperStock; label: string; color: string }[] = [
  { value: "white", label: "Bright white", color: "#ffffff" },
  { value: "offwhite", label: "Off-white sketch", color: "#f7f5ef" },
  { value: "kraft", label: "Kraft brown", color: "#d8b98c" },
  { value: "parchment", label: "Parchment", color: "#efe2c4" },
  { value: "newsprint", label: "Newsprint grey", color: "#e6e5e0" },
  { value: "blueprint", label: "Blueprint blue", color: "#c7d8e8" },
  { value: "custom", label: "Custom colour", color: "#ffffff" },
];

/** How the paper looks and whether/when it leaves after unfolding. */
export interface PaperOptions {
  /** Paper stays as a sheet behind the element instead of dissolving. */
  keep?: boolean;
  /** Seconds after the unfold finishes before the paper starts to dissolve. */
  dissolveDelay?: number;
  /** Seconds the dissolve itself takes. */
  dissolveDuration?: number;
  stock?: PaperStock;
  /** Base colour, used when stock is "custom". */
  color?: string;
  /** Wrinkle / crumple strength, 0..1. */
  texture?: number;
  /** Crease + drop shadow strength, 0..1. */
  shadow?: number;
  /** Sheen / lighting strength, 0..1. */
  gloss?: number;
}

export const DEFAULT_PAPER: Required<Omit<PaperOptions, "color">> & { color: string } = {
  keep: false,
  dissolveDelay: -1.2,
  dissolveDuration: 0.35,
  stock: "offwhite",
  color: "#f7f5ef",
  texture: 0.7,
  shadow: 0.7,
  gloss: 0.6,
};


/** A position the element travels to inside its scene. */
export interface MoveKeyframe {
  id: string;
  time: number; // seconds, local to the scene
  x: number;
  y: number;
  scale: number; // 1 = original size
  rotation: number;
  easing: Easing;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // Timeline (in seconds)
  startTime: number;
  drawDuration: number; // how long the "drawing" takes
  holdDuration: number; // how long it stays visible after drawing
  name: string;
  /** Optional motion path — element animates between these keyframes. */
  motion?: MoveKeyframe[];
  /** Entry animation: quill-drawn or carried in by a sliding hand. */
  entry?: EntryAnimation;
  /** Sub-style for the "appear" entry: pop, fade or slide. */
  appearStyle?: AppearStyle;
  /** Direction the "appear" element flies in from (pop/slide styles only). */
  appearDirection?: AppearDirection;
  /** Extra seconds the auto-follow camera stays on this element before moving on. */
  cameraHold?: number;
  /** Paper-unfold entry look & behaviour. */
  paper?: PaperOptions;

}

export interface SvgElement extends BaseElement {
  type: "svg";
  svg: string; // raw SVG markup (single <svg>...</svg>)
  color: string;
  strokeWidth: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string; // data URL or remote URL
  /** Potrace-vectorised outline of the bitmap, used for quill tracing. */
  traceSvg?: string;
}

/** Decorative paper/marker backing drawn behind a text block. */
export type TextBackdrop =
  | "none"
  | "highlight"
  | "holes"
  | "cutout"
  | "clip"
  | "pin"
  | "sticky";

export const TEXT_BACKDROPS: { value: TextBackdrop; label: string }[] = [
  { value: "none", label: "None" },
  { value: "highlight", label: "Yellow highlight" },
  { value: "holes", label: "Paper with holes" },
  { value: "cutout", label: "Cutout paper" },
  { value: "clip", label: "Paper + U clip" },
  { value: "pin", label: "Paper with pin" },
  { value: "sticky", label: "Sticky note" },
];

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  /** Paper / marker style drawn behind the text. */
  backdrop?: TextBackdrop;
  /** Tint of the paper / highlighter behind the text. */
  backdropColor?: string;
}


export type SceneElement = SvgElement | ImageElement | TextElement;

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

// ---------------- Camera ----------------

export interface CameraKeyframe {
  id: string;
  time: number; // seconds, relative to the scene start
  x: number; // scene-space point that should sit at the viewport centre
  y: number;
  zoom: number; // 1 = fit
  easing: Easing; // easing used when travelling *to* this keyframe
}

export type TransitionType = "none" | "fade" | "slide" | "wipe" | "hand";

/** A voice-over or music clip placed on the global video timeline. */
export interface AudioClip {
  id: string;
  name: string;
  src: string; // object URL or data URL
  start: number; // global seconds where the clip begins
  offset: number; // trim-in inside the source file
  duration: number; // how much of the source plays
  sourceDuration: number;
  volume: number; // 0..1
}

/** A video clip placed on the global timeline, overlaid on the animation. */
export interface VideoClip {
  id: string;
  name: string;
  src: string; // object URL or data URL
  start: number; // global seconds where the clip begins
  offset: number; // trim-in inside the source file
  duration: number; // how much of the source plays
  sourceDuration: number;
  /** 0..1 master volume for the clip's own audio track. */
  volume: number;
}

export interface Transition {
  type: TransitionType;
  duration: number; // seconds of overlap with the next scene
}

export interface Scene {
  id: string;
  name: string;
  bgColor: string;
  /** Id of a paper texture preset from lib/editor/backgrounds, if any. */
  bgPreset?: string | null;
  /** A user-imported background image (data URL), used when set. */
  bgImage?: string | null;
  elements: SceneElement[];
  camera: CameraKeyframe[];
  transition: Transition;
  autoFollowCamera: boolean;
}

export function canvasDimensions(mode: CanvasMode) {
  return mode === "portrait"
    ? { width: 720, height: 1280 }
    : { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
}

export const EASINGS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  ease: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
};

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_CAMERA: CameraState = {
  x: CANVAS_WIDTH / 2,
  y: CANVAS_HEIGHT / 2,
  zoom: 1,
};