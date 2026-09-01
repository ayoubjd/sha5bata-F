import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEditor, sceneOffsets, sceneDuration } from "@/lib/editor/store";
import { canvasDimensions } from "@/lib/editor/types";
import { Download, Pause, Play, X } from "lucide-react";
import { exportWebm } from "@/lib/editor/exportVideo";
import { toast } from "sonner";
import { Stage } from "./Stage";
import { useAudioPlayback } from "@/lib/editor/audioPlayback";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PreviewPlayer({ open, onClose }: Props) {
  const scenes = useEditor((s) => s.scenes);
  const audio = useEditor((s) => s.audio);
  const video = useEditor((s) => s.video);
  const videoDuration = useEditor((s) => s.videoDuration);
  const total = videoDuration();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const showQuill = useEditor((s) => s.showQuill);
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasMode = useEditor((s) => s.canvasMode);
  const dimensions = canvasDimensions(canvasMode);
  const previewScale = Math.min(0.7, 760 / dimensions.width, 500 / dimensions.height);

  useAudioPlayback(audio, t, playing && open && !exporting, open && !exporting);

  useEffect(() => {
    if (!open) return;
    setT(0);
    setPlaying(true);
  }, [open]);

  useEffect(() => {
    if (!open || !playing) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, playing, total]);

  const offs = sceneOffsets(scenes);

  const doExport = async () => {
    if (!sceneRef.current) return;
    setExporting(true);
    setPlaying(false);
    setT(0);
    setProgress(0);
    setStatus("Recording…");
    try {
      await exportWebm({
        duration: total,
        fps: 30,
        width: dimensions.width,
        height: dimensions.height,
        format,
        onStatus: setStatus,
        audio,
        video,
        onFrame: (time) => {
          setT(time);
          setProgress(time / total);
          return new Promise((r) => requestAnimationFrame(() => r()));
        },
        captureNode: sceneRef.current,
      });
      toast.success(
        `${format.toUpperCase()} downloaded — check your browser downloads folder`,
      );
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? `Export failed: ${e.message}` : "Export failed. Try WebM instead.");
    } finally {
      setExporting(false);
      setPlaying(false);
      setT(0);
      setProgress(0);
      setStatus("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between bg-card">
          <DialogTitle className="text-sm font-semibold">
            Preview — {scenes.length} scene{scenes.length > 1 ? "s" : ""}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={exporting}
              onClick={() => {
                if (t >= total) setT(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              {playing ? "Pause" : "Play"}
            </Button>
            <select
              value={format}
              disabled={exporting}
              onChange={(e) => setFormat(e.target.value as "mp4" | "webm")}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label="Export format"
            >
              <option value="mp4">MP4 (H.264)</option>
              <option value="webm">WebM</option>
            </select>
            <Button size="sm" onClick={doExport} disabled={exporting}>
              <Download className="w-4 h-4 mr-1" />
              {exporting
                ? status || `Recording ${Math.round(progress * 100)}%`
                : "Download video"}
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="bg-muted p-4 flex justify-center">
          <div
            style={{
               width: dimensions.width * previewScale,
               height: dimensions.height * previewScale,
              overflow: "hidden",
            }}
          >
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left" }}>
              <Stage
                scenes={scenes}
                time={t}
                innerRef={sceneRef}
                showQuill={showQuill}
                mode={canvasMode}
                videos={video}
                playing={playing}
              />
            </div>
          </div>
        </div>

        <div className="p-3 border-t bg-card">
          <div className="flex items-center gap-3">
            <div className="text-xs tabular-nums w-20">
              {t.toFixed(1)}s / {total.toFixed(1)}s
            </div>
            <input
              type="range"
              min={0}
              max={total}
              step={0.05}
              value={t}
              disabled={exporting}
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.target.value));
              }}
              className="flex-1"
            />
          </div>
          <div className="relative h-4 mt-1">
            {scenes.map((sc, i) => (
              <span
                key={sc.id}
                className="absolute text-[10px] text-muted-foreground"
                style={{ left: `${(offs[i] / total) * 100}%` }}
                title={`${sc.name} · ${sceneDuration(sc).toFixed(1)}s`}
              >
                ▏{sc.name}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Export records the animation in real time, then encodes it with
            FFmpeg to <strong>.mp4</strong> (or saves raw <strong>.webm</strong>)
            straight to your Downloads folder. Keep this tab in the foreground
            while it records.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
