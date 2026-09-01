import type { CustomFont } from "./fonts";
import { registerFont } from "./fonts";
import type { AudioClip, CanvasMode, Scene, VideoClip } from "./types";

/** Serializable project snapshot. */
export interface ProjectData {
  version: 1;
  projectName: string;
  scenes: Scene[];
  audio: AudioClip[];
  video: VideoClip[];
  canvasMode: CanvasMode;
  customFonts: CustomFont[];
  customBackgrounds: { id: string; name: string; src: string }[];
  sfxVolume: number;
  showQuill: boolean;
}

/** Lightweight metadata for listing saved projects. */
export interface ProjectMeta {
  id: string;
  name: string;
  savedAt: number; // Date.now()
  sceneCount: number;
  /** Approximate file size in bytes (pre-JSON). */
  sizeBytes: number;
}

const LS_KEY = "sha5bata_projects";
const LS_META_KEY = "sha5bata_projects_meta";
const AUTO_SAVE_KEY = "sha5bata_autosave";
const LAST_OPEN_KEY = "sha5bata_last_open";
const LS_USAGE_KEY = "sha5bata_usage";

/* ── localStorage helpers ──────────────────────────────────────── */

function readMetaList(): ProjectMeta[] {
  try {
    return JSON.parse(localStorage.getItem(LS_META_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeMetaList(list: ProjectMeta[]): void {
  localStorage.setItem(LS_META_KEY, JSON.stringify(list));
}

function readProject(id: string): ProjectData | null {
  try {
    const raw = localStorage.getItem(`${LS_KEY}_${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeProject(id: string, data: ProjectData): void {
  localStorage.setItem(`${LS_KEY}_${id}`, JSON.stringify(data));
}

function removeProject(id: string): void {
  localStorage.removeItem(`${LS_KEY}_${id}`);
}

/** Estimate total localStorage usage in bytes. */
export function getStorageUsage(): { used: number; quota: number; percent: number } {
  let used = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) used += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
  }
  // Typical browser limit is 5MB per origin
  const quota = 5 * 1024 * 1024;
  return { used, quota, percent: Math.round((used / quota) * 100) };
}

/** Check if saving a blob of given size would exceed storage. */
export function wouldExceedStorage(addedBytes: number): boolean {
  const { used, quota } = getStorageUsage();
  return used + addedBytes > quota * 0.95; // 95% threshold
}

/* ── Object URL → data URL conversion ──────────────────────────── */

/** Max size per clip to attempt data-URL conversion (4 MB). */
const MAX_CLIP_CONVERT = 4 * 1024 * 1024;

async function objectUrlToDataUrl(url: string): Promise<string> {
  if (!url.startsWith("blob:")) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    if (blob.size > MAX_CLIP_CONVERT) {
      // Too large for localStorage — keep the object URL (will be dead on reload
      // but at least the save succeeds and the project structure is preserved).
      console.warn("Clip too large for data-URL conversion, keeping object URL:", blob.size);
      return url;
    }
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    // fetch or conversion failed — keep original URL as-is
    console.warn("objectUrlToDataUrl failed, keeping original URL");
    return url;
  }
}

async function buildProjectData(state: {
  projectName: string;
  scenes: Scene[];
  audio: AudioClip[];
  video: VideoClip[];
  canvasMode: CanvasMode;
  customFonts: CustomFont[];
  customBackgrounds: { id: string; name: string; src: string }[];
  sfxVolume: number;
  showQuill: boolean;
}): Promise<ProjectData> {
  const audio = await Promise.all(
    state.audio.map(async (c) => ({
      ...c,
      src: await objectUrlToDataUrl(c.src),
    })),
  );
  const video = await Promise.all(
    state.video.map(async (c) => ({
      ...c,
      src: await objectUrlToDataUrl(c.src),
    })),
  );

  return {
    version: 1,
    projectName: state.projectName,
    scenes: state.scenes,
    audio,
    video,
    canvasMode: state.canvasMode,
    customFonts: state.customFonts,
    customBackgrounds: state.customBackgrounds,
    sfxVolume: state.sfxVolume,
    showQuill: state.showQuill,
  };
}

/* ── Public API ────────────────────────────────────────────────── */

/** List all saved projects (metadata only, fast). */
export function listProjects(): ProjectMeta[] {
  return readMetaList().sort((a, b) => b.savedAt - a.savedAt);
}

/** Load a project from localStorage by id. Registers fonts. */
export async function loadProjectFromStorage(id: string): Promise<ProjectData | null> {
  const project = readProject(id);
  if (!project) return null;
  if (project.customFonts?.length) {
    await Promise.all(project.customFonts.map((f) => registerFont(f)));
  }
  return project;
}

/** Save a project to localStorage. Returns the meta entry. */
export async function saveProjectToStorage(state: {
  id: string | null;
  projectName: string;
  scenes: Scene[];
  audio: AudioClip[];
  video: VideoClip[];
  canvasMode: CanvasMode;
  customFonts: CustomFont[];
  customBackgrounds: { id: string; name: string; src: string }[];
  sfxVolume: number;
  showQuill: boolean;
}): Promise<ProjectMeta> {
  const project = await buildProjectData(state);
  const id = state.id ?? crypto.randomUUID();
  const jsonStr = JSON.stringify(project);

  // Check if the project data exceeds localStorage limits
  const estimatedBytes = new Blob([jsonStr]).size;
  if (estimatedBytes > 4.5 * 1024 * 1024) {
    throw new Error(`Project too large for browser storage (${(estimatedBytes / 1048576).toFixed(1)} MB). Use "Download as file" instead.`);
  }

  try {
    writeProject(id, project);
  } catch (e: any) {
    // QuotaExceededError
    if (e?.name === "QuotaExceededError" || e?.code === 22) {
      throw new Error("Browser storage is full. Delete old projects or use \"Download as file\".");
    }
    throw e;
  }

  const meta: ProjectMeta = {
    id,
    name: project.projectName,
    savedAt: Date.now(),
    sceneCount: project.scenes.length,
    sizeBytes: estimatedBytes,
  };

  const list = readMetaList().filter((m) => m.id !== id);
  list.push(meta);
  writeMetaList(list);

  // Track last opened project
  setLastOpenProject(id);

  return meta;
}

/** Delete a project from localStorage. */
export function deleteProject(id: string): void {
  removeProject(id);
  writeMetaList(readMetaList().filter((m) => m.id !== id));
  // Clear last open if it was the deleted one
  if (getLastOpenProject() === id) clearLastOpenProject();
}

/* ── Last-open tracking ────────────────────────────────────────── */

export function setLastOpenProject(id: string): void {
  localStorage.setItem(LAST_OPEN_KEY, id);
}

export function getLastOpenProject(): string | null {
  return localStorage.getItem(LAST_OPEN_KEY);
}

export function clearLastOpenProject(): void {
  localStorage.removeItem(LAST_OPEN_KEY);
}

/** Auto-save the current state to a dedicated localStorage slot. */
export async function autoSave(state: {
  projectName: string;
  scenes: Scene[];
  audio: AudioClip[];
  video: VideoClip[];
  canvasMode: CanvasMode;
  customFonts: CustomFont[];
  customBackgrounds: { id: string; name: string; src: string }[];
  sfxVolume: number;
  showQuill: boolean;
}): Promise<void> {
  try {
    const project = await buildProjectData(state);
    const json = JSON.stringify(project);
    if (new Blob([json]).size > 4 * 1024 * 1024) return; // too large, skip auto-save
    localStorage.setItem(AUTO_SAVE_KEY, json);
  } catch {
    // Silently fail — auto-save is best-effort
  }
}

/** Load the auto-saved project (if any). Returns null if none. */
export async function loadAutoSave(): Promise<ProjectData | null> {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    const project: ProjectData = JSON.parse(raw);
    if (!project.version || !Array.isArray(project.scenes)) return null;
    if (project.customFonts?.length) {
      await Promise.all(project.customFonts.map((f) => registerFont(f)));
    }
    return project;
  } catch {
    return null;
  }
}

/** Clear the auto-save slot. */
export function clearAutoSave(): void {
  localStorage.removeItem(AUTO_SAVE_KEY);
}

/* ── File download / upload ─────────────────────────────────────── */

/** Download the project as a .sha5bata file. */
export async function saveProjectToFile(state: {
  projectName: string;
  scenes: Scene[];
  audio: AudioClip[];
  video: VideoClip[];
  canvasMode: CanvasMode;
  customFonts: CustomFont[];
  customBackgrounds: { id: string; name: string; src: string }[];
  sfxVolume: number;
  showQuill: boolean;
}): Promise<void> {
  const project = await buildProjectData(state);
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const safeName = project.projectName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "project";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.sha5bata`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a .sha5bata file from disk. Registers fonts. */
export async function loadProjectFromFile(file: File): Promise<ProjectData> {
  const text = await file.text();
  const project: ProjectData = JSON.parse(text);

  if (!project.version || !Array.isArray(project.scenes)) {
    throw new Error("Invalid project file");
  }

  if (project.customFonts?.length) {
    await Promise.all(project.customFonts.map((f) => registerFont(f)));
  }

  return project;
}
