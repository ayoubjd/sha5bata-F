import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ICONS } from "@/lib/editor/iconLibrary";
import { normalizeSvg } from "@/lib/editor/svgUtils";
import { vectorizeImage } from "@/lib/editor/vectorize";
import { newId, useActiveScene, useEditor } from "@/lib/editor/store";
import type { ImageElement, SvgElement, TextElement } from "@/lib/editor/types";
import { canvasDimensions } from "@/lib/editor/types";
import { ChevronLeft, ChevronRight, Loader2, Search, Shapes, Upload, Type } from "lucide-react";

/** Iconify: free, open-source library of 200k+ icons (the same sets iconbuddy indexes). */
const ICONIFY = "https://api.iconify.design";

function nextStart(items: { startTime: number; drawDuration: number; holdDuration: number }[]): number {
  if (!items.length) return 0;
  const last = items[items.length - 1];
  return last.startTime + last.drawDuration + last.holdDuration;
}

export function AssetSidebar() {
  const addElement = useEditor((s) => s.addElement);
  const updateElement = useEditor((s) => s.updateElement);
  const elements = useActiveScene().elements;
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [webQ, setWebQ] = useState("");
  const [webResults, setWebResults] = useState<string[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const canvasMode = useEditor((s) => s.canvasMode);
  const { width: canvasWidth, height: canvasHeight } = canvasDimensions(canvasMode);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      ICONS.filter(
        (i) =>
          i.name.toLowerCase().includes(q.toLowerCase()) ||
          i.category.toLowerCase().includes(q.toLowerCase()),
      ),
    [q],
  );

  const addSvg = (svg: string, name: string) => {
    const size = 200;
    const markup = normalizeSvg(svg);
    const el: SvgElement = {
      id: newId(),
      type: "svg",
      name,
      svg: markup,
      color: "#1a1a1a",
      strokeWidth: 1.6,
      x: canvasWidth / 2 - size / 2,
      y: canvasHeight / 2 - size / 2,
      width: size,
      height: size,
      rotation: 0,
      startTime: nextStart(elements),
      drawDuration: 2,
      holdDuration: 1,
    };
    addElement(el);
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        if (f.type === "image/svg+xml") {
          // Extract svg markup from data url
          const decoded = atob(src.split(",")[1] ?? "");
          addSvg(decoded, f.name);
        } else {
          const img = new Image();
          img.onload = () => {
            const max = 320;
            const ratio = img.width / img.height;
            const w = ratio >= 1 ? max : max * ratio;
            const h = ratio >= 1 ? max / ratio : max;
            const el: ImageElement = {
              id: newId(),
              type: "image",
              name: f.name,
              src,
               x: canvasWidth / 2 - w / 2,
               y: canvasHeight / 2 - h / 2,
              width: w,
              height: h,
              rotation: 0,
              startTime: nextStart(elements),
              drawDuration: 2,
              holdDuration: 1,
            };
            addElement(el);
            // Potrace the bitmap in the background so the quill can trace it.
            void vectorizeImage(src).then((traceSvg) => {
              if (traceSvg) updateElement(el.id, { traceSvg });
            });
          };
          img.src = src;
        }
      };
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  };

  const addText = () => {
    const el: TextElement = {
      id: newId(),
      type: "text",
      name: "Text",
      text: "Your text here",
      fontFamily: "'Kalam', 'Comic Sans MS', cursive",
      fontSize: 56,
      fontWeight: 700,
      color: "#1a1a1a",
      x: canvasWidth / 2 - 240,
      y: canvasHeight / 2 - 40,
      width: 480,
      height: 80,
      rotation: 0,
      startTime: nextStart(elements),
      drawDuration: 1.5,
      holdDuration: 1,
    };
    addElement(el);
  };

  const searchWeb = async () => {
    const term = webQ.trim();
    if (!term) return;
    setWebLoading(true);
    setWebError(null);
    try {
      const res = await fetch(
        `${ICONIFY}/search?query=${encodeURIComponent(term)}&limit=96`,
      );
      const data = (await res.json()) as { icons?: string[] };
      setWebResults(data.icons ?? []);
      if (!data.icons?.length) setWebError("No icons matched that search.");
    } catch {
      setWebError("Could not reach the icon library. Check your connection.");
    } finally {
      setWebLoading(false);
    }
  };

  const addWebIcon = async (id: string) => {
    const [prefix, name] = id.split(":");
    try {
      const svg = await fetch(`${ICONIFY}/${prefix}/${name}.svg?color=currentColor`).then(
        (r) => r.text(),
      );
      if (svg.trim().startsWith("<svg")) addSvg(svg, name);
    } catch {
      setWebError("That icon could not be downloaded.");
    }
  };

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 border-r bg-card flex flex-col items-center py-2 gap-2">
        <Button size="icon" variant="ghost" onClick={() => setCollapsed(false)} title="Open asset library">
          <ChevronRight />
        </Button>
        <Shapes className="w-4 h-4 text-muted-foreground mt-2" />
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-r bg-card flex flex-col min-h-0 overflow-hidden">
      <div className="h-10 px-3 border-b flex items-center justify-between">
        <span className="text-xs font-semibold">Asset library</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCollapsed(true)} title="Minimize asset library">
          <ChevronLeft />
        </Button>
      </div>
      <Tabs defaultValue="icons" className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-4 m-2">
          <TabsTrigger value="icons">Icons</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="flex-1 min-h-0 flex flex-col mt-0 px-3 pb-3">
          <form
            className="flex gap-2 mb-2"
            onSubmit={(e) => {
              e.preventDefault();
              void searchWeb();
            }}
          >
            <Input
              placeholder="Search 200k+ free icons..."
              value={webQ}
              onChange={(e) => setWebQ(e.target.value)}
            />
            <Button type="submit" size="icon" variant="secondary" disabled={webLoading}>
              {webLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </form>
          {webError && <p className="text-xs text-destructive mb-2">{webError}</p>}
          {!webResults.length && !webError && (
            <p className="text-xs text-muted-foreground mb-2">
              Search the free Iconify library (the same open icon sets IconBuddy
              indexes) and click any result to drop it on your canvas.
            </p>
          )}
          <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
            <div className="grid grid-cols-4 gap-2">
              {webResults.map((id) => (
                <button
                  key={id}
                  onClick={() => void addWebIcon(id)}
                  title={id}
                  className="aspect-square rounded-lg border bg-background hover:border-primary hover:bg-secondary transition-colors flex items-center justify-center p-2"
                >
                  <img
                    src={`${ICONIFY}/${id.replace(":", "/")}.svg?height=32`}
                    alt={id}
                    loading="lazy"
                    className="w-full h-full object-contain"
                  />
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="icons" className="flex-1 min-h-0 flex flex-col mt-0 px-3 pb-3">
          <Input
            placeholder="Search icons..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-2"
          />
          <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
            <div className="grid grid-cols-3 gap-2">
              {filtered.map((icon) => (
                <button
                  key={icon.name}
                  onClick={() => addSvg(icon.svg, icon.name)}
                  className="aspect-square rounded-lg border bg-background hover:border-primary hover:bg-secondary transition-colors flex items-center justify-center p-3"
                  title={icon.name}
                >
                  <div
                    style={{ color: "var(--color-foreground)" }}
                    className="w-full h-full"
                    dangerouslySetInnerHTML={{ __html: icon.svg }}
                  />
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="upload" className="px-3 pb-3 mt-0 overflow-y-auto">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.svg"
            multiple
            className="hidden"
            onChange={onUpload}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload SVG / PNG / JPG
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Tip: line-art SVGs are traced stroke-by-stroke by the quill. Uploaded
            PNG/JPG images are auto-vectorised (Potrace) so the quill traces their
            outlines, then the photo fades in.
          </p>
        </TabsContent>

        <TabsContent value="text" className="px-3 pb-3 mt-0 overflow-y-auto">
          <Button className="w-full" onClick={addText}>
            <Type className="w-4 h-4 mr-2" />
            Add text block
          </Button>
        </TabsContent>
      </Tabs>
    </aside>
  );
}