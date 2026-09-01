import { Button } from "@/components/ui/button";
import { Feather, Monitor, Play, Redo2, Smartphone, Undo2, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/lib/editor/store";
import { ThemeToggle } from "./ThemeToggle";
import { ProjectMenu } from "./ProjectMenu";
import logoImg from "@/assets/sha5batalogo.png";
import { useRef, useEffect, useCallback, useState } from "react";
import {
  loadProjectFromFile,
  autoSave,
  saveProjectToStorage,
  getStorageUsage,
} from "@/lib/editor/project";
import { toast } from "sonner";

interface Props {
  onPlay: () => void;
}

export function TopBar({ onPlay }: Props) {
  const showQuill = useEditor((s) => s.showQuill);
  const setShowQuill = useEditor((s) => s.setShowQuill);
  const canvasMode = useEditor((s) => s.canvasMode);
  const setCanvasMode = useEditor((s) => s.setCanvasMode);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const loadProject = useEditor((s) => s.loadProject);
  const projectName = useEditor((s) => s.projectName);
  const setProjectName = useEditor((s) => s.setProjectName);
  const dirty = useEditor((s) => s.dirty);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(projectName);
  const [saveFlash, setSaveFlash] = useState(false);

  // Sync name draft when project loads externally
  useEffect(() => {
    if (!editingName) setNameDraft(projectName);
  }, [projectName, editingName]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Auto-save debounced: save to localStorage after 5s of inactivity
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      const state = useEditor.getState();
      // Check storage before auto-saving
      const { percent } = getStorageUsage();
      if (percent > 90) {
        toast.warning(`Storage almost full (${percent}%). Free up space or export to file.`, {
          duration: 8000,
        });
      }
      autoSave(state).catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [dirty]);

  // Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveToStorage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const getState = () => useEditor.getState();

  const handleSaveToStorage = useCallback(async () => {
    try {
      const state = getState();
      const { percent } = getStorageUsage();
      if (percent > 95) {
        toast.error(`Storage full (${percent}%). Delete old projects or export to file.`);
        return;
      }
      const meta = await saveProjectToStorage(state);
      useEditor.setState({ id: meta.id, dirty: false });
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1200);
    } catch {
      toast.error("Failed to save");
    }
  }, []);

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const project = await loadProjectFromFile(file);
      loadProject(project);
      toast.success(`Loaded "${project.projectName}"`);
    } catch {
      toast.error("Invalid project file");
    }
    e.target.value = "";
  };

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== projectName) {
      setProjectName(trimmed);
    } else {
      setNameDraft(projectName);
    }
  };

  return (
    <header className="h-14 border-b bg-card px-4 flex items-center justify-between">
      <input
        ref={fileRef}
        type="file"
        accept=".sha5bata"
        className="hidden"
        onChange={handleLoad}
      />
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border bg-background p-0.5" aria-label="Canvas aspect ratio">
          <Button
            size="sm"
            variant={canvasMode === "landscape" ? "secondary" : "ghost"}
            className="h-7 px-2"
            onClick={() => setCanvasMode("landscape")}
            title="Landscape 16:9"
          >
            <Monitor className="w-4 h-4" /> 16:9
          </Button>
          <Button
            size="sm"
            variant={canvasMode === "portrait" ? "secondary" : "ghost"}
            className="h-7 px-2"
            onClick={() => setCanvasMode("portrait")}
            title="Portrait 9:16"
          >
            <Smartphone className="w-4 h-4" /> 9:16
          </Button>
        </div>
        <img
          src={logoImg}
          alt="Sha5bata logo"
          className="w-9 h-9 rounded-lg object-contain"
        />
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-lg leading-none">Sha5bata</h1>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">/</span>
            {editingName ? (
              <input
                ref={nameInputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") {
                    setNameDraft(projectName);
                    setEditingName(false);
                  }
                }}
                autoFocus
                className="h-6 w-48 rounded border bg-background px-1.5 text-sm font-medium outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <button
                onClick={() => {
                  setEditingName(true);
                  setNameDraft(projectName);
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium hover:bg-accent transition-colors"
                title="Click to rename project"
              >
                {projectName}
                {saveFlash ? (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20 animate-in fade-in">
                    <Check className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
                  </span>
                ) : dirty ? (
                  <span className="inline-block h-2 w-2 rounded-full bg-primary" title="Unsaved changes" />
                ) : null}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="flex items-center gap-0.5 rounded-lg border px-1 py-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </Button>
        </div>
        <ProjectMenu onSave={handleSaveToStorage} />
        <div className="flex items-center gap-2 mr-2 rounded-lg border px-3 py-1.5">
          <Feather className="w-4 h-4 text-muted-foreground" />
          <Label htmlFor="quill-toggle" className="text-xs cursor-pointer">
            Quill pen
          </Label>
          <Switch id="quill-toggle" checked={showQuill} onCheckedChange={setShowQuill} />
        </div>
        <Button onClick={onPlay}>
          <Play className="w-4 h-4 mr-1" /> Preview & Export
        </Button>
      </div>
    </header>
  );
}
