import { useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  FolderOpen,
  Save,
  Download,
  Trash2,
  FileText,
  Clock,
  HardDrive,
  Pencil,
  FilePlus,
} from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import {
  listProjects,
  saveProjectToStorage,
  loadProjectFromStorage,
  loadProjectFromFile,
  deleteProject,
  saveProjectToFile,
  getStorageUsage,
  clearAutoSave,
  type ProjectMeta,
} from "@/lib/editor/project";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

interface Props {
  onSave: () => void;
}

export function ProjectMenu({ onSave }: Props) {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const loadProject = useEditor((s) => s.loadProject);
  const newProject = useEditor((s) => s.newProject);
  const setId = useEditor((s) => s.setId);
  const setProjectName = useEditor((s) => s.setProjectName);
  const projectName = useEditor((s) => s.projectName);
  const dirty = useEditor((s) => s.dirty);
  const fileRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setProjects(listProjects());
  }, [open]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const getState = () => useEditor.getState();

  const handleSaveToStorage = async () => {
    try {
      const state = getState();
      const meta = await saveProjectToStorage(state);
      setId(meta.id);
      useEditor.setState({ dirty: false });
      toast.success(`Saved "${meta.name}"`);
      setProjects(listProjects());
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    }
  };

  const handleSaveToFile = async () => {
    try {
      await saveProjectToFile(getState());
      toast.success("Downloaded");
    } catch {
      toast.error("Failed to export");
    }
  };

  const handleLoadFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const project = await loadProjectFromFile(file);
      loadProject(project);
      toast.success(`Loaded "${project.projectName}"`);
      setOpen(false);
    } catch {
      toast.error("Invalid project file");
    }
    e.target.value = "";
  };

  const handleLoadFromStorage = async (id: string) => {
    try {
      const project = await loadProjectFromStorage(id);
      if (!project) {
        toast.error("Project not found");
        return;
      }
      loadProject(project, id);
      toast.success(`Loaded "${project.projectName}"`);
      setOpen(false);
    } catch {
      toast.error("Failed to load project");
    }
  };

  const handleDelete = (id: string, name: string) => {
    deleteProject(id);
    setProjects(listProjects());
    toast.success(`Deleted "${name}"`);
  };

  const handleNewProject = () => {
    if (dirty) {
      const ok = window.confirm("You have unsaved changes. Create a new project anyway?");
      if (!ok) return;
    }
    clearAutoSave();
    newProject();
    setOpen(false);
    toast.success("New project created");
  };

  const commitRename = () => {
    if (!renamingId) return;
    const trimmed = renameDraft.trim();
    if (trimmed) {
      // Update the meta list
      const meta = listProjects().map((m) =>
        m.id === renamingId ? { ...m, name: trimmed } : m,
      );
      localStorage.setItem("sha5bata_projects_meta", JSON.stringify(meta));

      // Update project data name
      const projectStr = localStorage.getItem(`sha5bata_projects_${renamingId}`);
      if (projectStr) {
        const project = JSON.parse(projectStr);
        project.projectName = trimmed;
        localStorage.setItem(`sha5bata_projects_${renamingId}`, JSON.stringify(project));
      }

      // If it's the currently open project, update the store too
      const currentId = getState().id;
      if (currentId === renamingId) {
        setProjectName(trimmed);
      }

      setProjects(listProjects());
      toast.success(`Renamed to "${trimmed}"`);
    }
    setRenamingId(null);
  };

  const storage = getStorageUsage();

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".sha5bata"
        className="hidden"
        onChange={handleLoadFromFile}
      />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs font-medium"
          >
            <FileText className="w-3.5 h-3.5" />
            Projects
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onClick={handleNewProject}>
            <FilePlus className="w-4 h-4 mr-2" />
            New project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSaveToStorage}>
            <Save className="w-4 h-4 mr-2" />
            Save to browser
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSaveToFile}>
            <Download className="w-4 h-4 mr-2" />
            Download as file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Load from file
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {projects.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No saved projects yet
            </div>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent group"
              >
                {renamingId === p.id ? (
                  <div className="flex-1 min-w-0">
                    <input
                      ref={renameInputRef}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full h-5 rounded border bg-background px-1 text-sm font-medium outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ) : (
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => handleLoadFromStorage(p.id)}
                  >
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTime(p.savedAt)}
                      <span className="mx-0.5">&middot;</span>
                      {p.sceneCount} scene{p.sceneCount !== 1 ? "s" : ""}
                      <span className="mx-0.5">&middot;</span>
                      {formatBytes(p.sizeBytes)}
                    </p>
                  </button>
                )}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 px-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(p.id);
                      setRenameDraft(p.name);
                    }}
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 px-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id, p.name);
                    }}
                    title="Delete project"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <HardDrive className="w-3 h-3" />
            <div className="flex-1">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(storage.percent, 100)}%`,
                    backgroundColor: storage.percent > 80 ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                  }}
                />
              </div>
            </div>
            <span>{formatBytes(storage.used)} / {formatBytes(storage.quota)}</span>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
