import { Button } from "@/components/ui/button";
import { Feather, Monitor, Play, Redo2, Smartphone, Undo2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/lib/editor/store";
import { ThemeToggle } from "./ThemeToggle";
import logoImg from "@/assets/sha5batalogo.png";

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
  return (
    <header className="h-14 border-b bg-card px-4 flex items-center justify-between">
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
        <div>
          <h1 className="font-bold text-lg leading-none">Sha5bata</h1>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
            Whiteboard animation studio
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="flex items-center gap-0.5 rounded-lg border px-1 py-0.5 mr-2">
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