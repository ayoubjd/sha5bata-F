import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AssetSidebar } from "@/components/editor/AssetSidebar";
import { Canvas } from "@/components/editor/Canvas";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { Timeline } from "@/components/editor/Timeline";
import { TopBar } from "@/components/editor/TopBar";
import { PreviewPlayer } from "@/components/editor/PreviewPlayer";
import { useEditor } from "@/lib/editor/store";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Studio — Sha5bata Whiteboard Animation Studio" },
      {
        name: "description",
        content:
          "Create hand-drawn whiteboard animations in your browser. Drop icons, images and text, choreograph a timeline and export a video.",
      },
      { property: "og:title", content: "Sha5bata — Whiteboard Animation Studio" },
      {
        property: "og:description",
        content:
          "Design VideoScribe-style whiteboard animations with drag-and-drop icons, images and text.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

function Studio() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(416);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((mod && key === "z" && e.shiftKey) || (mod && key === "y")) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar onPlay={() => setPreviewOpen(true)} />
      <div className="flex-1 flex overflow-hidden">
        <AssetSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Canvas />
          <Timeline height={timelineHeight} onHeightChange={setTimelineHeight} />
        </div>
        <PropertiesPanel />
      </div>
      <PreviewPlayer open={previewOpen} onClose={() => setPreviewOpen(false)} />
      <Toaster position="bottom-center" richColors />
    </div>
  );
}