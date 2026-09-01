import { sceneDuration, useActiveScene, useEditor } from "@/lib/editor/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_PAPER,
  PAPER_STOCKS,
  TEXT_BACKDROPS,
  type Easing,
  type PaperStock,
  type TextBackdrop,
  type TransitionType,
} from "@/lib/editor/types";

import { BACKGROUNDS } from "@/lib/editor/backgrounds";
import { fontFamilies, readFontArchive, registerFont } from "@/lib/editor/fonts";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Move, Plus, Trash2, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const BUILTIN_FONTS = [
  { label: "Handwritten (Kalam)", value: "'Kalam', 'Comic Sans MS', cursive" },
  { label: "Marker", value: "'Comic Sans MS', 'Kalam', cursive" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Sans", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Typewriter", value: "'Courier New', monospace" },
  { label: "عربي — Cairo", value: "'Cairo', sans-serif" },
  { label: "عربي — Tajawal", value: "'Tajawal', sans-serif" },
  { label: "عربي — Almarai", value: "'Almarai', sans-serif" },
  { label: "عربي — Amiri (نسخ)", value: "'Amiri', serif" },
  { label: "عربي — Changa", value: "'Changa', sans-serif" },
  { label: "عربي — Reem Kufi (كوفي)", value: "'Reem Kufi', sans-serif" },
  { label: "عربي — Aref Ruqaa (رقعة)", value: "'Aref Ruqaa', serif" },
];

const WEIGHT_LABELS: Record<string, string> = {
  "100": "Thin",
  "200": "Extra light",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "Semi bold",
  "700": "Bold",
  "800": "Extra bold",
  "900": "Black",
};

function FontPicker({
  value,
  weight,
  onChange,
  onWeight,
}: {
  value: string;
  weight: number;
  onChange: (v: string) => void;
  onWeight: (w: number) => void;
}) {
  const customFonts = useEditor((s) => s.customFonts);
  const addFonts = useEditor((s) => s.addFonts);
  const fileRef = useRef<HTMLInputElement>(null);
  const families = fontFamilies(customFonts);

  // re-register imported fonts after a reload/HMR so they keep rendering
  useEffect(() => {
    customFonts.forEach((f) => void registerFont(f));
  }, [customFonts]);

  const currentFamily = value.replace(/^'|'$/g, "");
  const availableWeights =
    families.find((f) => f.family === currentFamily)?.weights ?? [];

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const fonts = await readFontArchive(file);
      if (!fonts.length) {
        toast.error("No .ttf / .otf / .woff files found in that zip.");
        return;
      }
      addFonts(fonts);
      onChange(`'${fonts[0].family}'`);
      onWeight(Number(fonts[0].weight) || 400);
      toast.success(`Imported ${fonts.length} font${fonts.length > 1 ? "s" : ""}`);
    } catch {
      toast.error("Could not read that font file.");
    }
  };

  return (
    <>
      <Label className="text-xs">Font</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 mb-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BUILTIN_FONTS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              <span style={{ fontFamily: f.value, fontSize: 16 }}>{f.label}</span>
            </SelectItem>
          ))}
          {families.map((f) => (
            <SelectItem key={f.family} value={`'${f.family}'`}>
              <span style={{ fontFamily: `'${f.family}'`, fontSize: 18 }}>
                {f.family} — Aa Bb 123
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {availableWeights.length > 1 && (
        <>
          <Label className="text-xs">Weight</Label>
          <Select
            value={String(weight)}
            onValueChange={(v) => onWeight(Number(v))}
          >
            <SelectTrigger className="mt-1 mb-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableWeights.map((w) => (
                <SelectItem key={w} value={w}>
                  <span
                    style={{
                      fontFamily: `'${currentFamily}'`,
                      fontWeight: Number(w),
                      fontSize: 16,
                    }}
                  >
                    {WEIGHT_LABELS[w] ?? w}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      <div
        className="rounded-md border p-3 mb-2 text-center overflow-hidden"
        style={{ fontFamily: value, fontWeight: weight, fontSize: 26, lineHeight: 1.2 }}
      >
        Aa Bb Cc 123
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".zip,.ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={(e) => void onFile(e)}
      />
      <Button
        variant="secondary"
        size="sm"
        className="w-full mb-3"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-3.5 h-3.5 mr-1.5" /> Import font (.zip)
      </Button>
    </>
  );
}

function MotionPanel({ elementId }: { elementId: string }) {
  const scene = useActiveScene();
  const addMove = useEditor((s) => s.addMove);
  const updateMove = useEditor((s) => s.updateMove);
  const removeMove = useEditor((s) => s.removeMove);
  const selectedMoveId = useEditor((s) => s.selectedMoveId);
  const selectMove = useEditor((s) => s.selectMove);
  const el = scene.elements.find((e) => e.id === elementId);
  if (!el) return null;
  const ks = el.motion ?? [];

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm flex items-center gap-1.5">
          <Move className="w-3.5 h-3.5" /> Motion path
        </h4>
        <Button size="sm" variant="secondary" onClick={() => addMove(el.id)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Move step
        </Button>
      </div>
      {ks.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add a move step to make this element travel to another spot. Drag the
          numbered handles on the canvas to place it.
        </p>
      )}
      {ks.map((k, i) => (
        <div
          key={k.id}
          className={`rounded-md border p-2 mb-2 ${
            selectedMoveId === k.id ? "border-primary bg-secondary/50" : ""
          }`}
          onPointerDown={() => selectMove(k.id)}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold">Step {i + 1}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => removeMove(el.id, k.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Label className="text-xs">Arrives at ({k.time.toFixed(1)}s)</Label>
          <Slider
            className="mb-2 mt-2"
            min={0}
            max={Math.max(10, sceneDuration(scene))}
            step={0.1}
            value={[k.time]}
            onValueChange={([v]) => updateMove(el.id, k.id, { time: v })}
          />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <Label className="text-xs">X</Label>
              <Input
                type="number"
                value={Math.round(k.x)}
                onChange={(e) => updateMove(el.id, k.id, { x: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Y</Label>
              <Input
                type="number"
                value={Math.round(k.y)}
                onChange={(e) => updateMove(el.id, k.id, { y: Number(e.target.value) })}
              />
            </div>
          </div>
          <Label className="text-xs">Scale ({k.scale.toFixed(2)}×)</Label>
          <Slider
            className="mb-2 mt-2"
            min={0.1}
            max={3}
            step={0.05}
            value={[k.scale]}
            onValueChange={([v]) => updateMove(el.id, k.id, { scale: v })}
          />
          <Label className="text-xs">Rotation ({Math.round(k.rotation)}°)</Label>
          <Slider
            className="mb-2 mt-2"
            min={-180}
            max={180}
            step={1}
            value={[k.rotation]}
            onValueChange={([v]) => updateMove(el.id, k.id, { rotation: v })}
          />
          <Select
            value={k.easing}
            onValueChange={(v) => updateMove(el.id, k.id, { easing: v as Easing })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="ease">Smooth (ease in-out)</SelectItem>
              <SelectItem value="easeIn">Ease in</SelectItem>
              <SelectItem value="easeOut">Ease out</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

function CameraPanel() {
  const scene = useActiveScene();
  const selectedKeyframeId = useEditor((s) => s.selectedKeyframeId);
  const updateKeyframe = useEditor((s) => s.updateKeyframe);
  const removeKeyframe = useEditor((s) => s.removeKeyframe);
  const selectedId = useEditor((s) => s.selectedId);
  const kf = scene.camera.find((k) => k.id === selectedKeyframeId);
  if (!kf) return null;
  const el = scene.elements.find((e) => e.id === selectedId);

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm">Camera keyframe</h4>
        <Button size="icon" variant="ghost" onClick={() => removeKeyframe(kf.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <Label className="text-xs">Time ({kf.time.toFixed(1)}s)</Label>
      <Slider
        className="mb-3 mt-2"
        min={0}
        max={Math.max(3, sceneDuration(scene))}
        step={0.1}
        value={[kf.time]}
        onValueChange={([v]) => updateKeyframe(kf.id, { time: v })}
      />
      <Label className="text-xs">Zoom ({kf.zoom.toFixed(2)}×)</Label>
      <Slider
        className="mb-3 mt-2"
        min={0.5}
        max={4}
        step={0.05}
        value={[kf.zoom]}
        onValueChange={([v]) => updateKeyframe(kf.id, { zoom: v })}
      />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <Label className="text-xs">Center X</Label>
          <Input
            type="number"
            value={Math.round(kf.x)}
            onChange={(e) => updateKeyframe(kf.id, { x: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Center Y</Label>
          <Input
            type="number"
            value={Math.round(kf.y)}
            onChange={(e) => updateKeyframe(kf.id, { y: Number(e.target.value) })}
          />
        </div>
      </div>
      <Label className="text-xs">Interpolation</Label>
      <Select
        value={kf.easing}
        onValueChange={(v) => updateKeyframe(kf.id, { easing: v as Easing })}
      >
        <SelectTrigger className="mt-1 mb-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="linear">Linear</SelectItem>
          <SelectItem value="ease">Smooth (ease in-out)</SelectItem>
          <SelectItem value="easeIn">Ease in</SelectItem>
          <SelectItem value="easeOut">Ease out</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          disabled={!el}
          onClick={() =>
            el &&
            updateKeyframe(kf.id, {
              x: el.x + el.width / 2,
              y: el.y + el.height / 2,
              zoom: Math.min(
                4,
                Math.max(
                  1,
                  Math.min(CANVAS_WIDTH / (el.width * 1.6), CANVAS_HEIGHT / (el.height * 1.6)),
                ),
              ),
            })
          }
        >
          Frame selected element
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            updateKeyframe(kf.id, { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, zoom: 1 })
          }
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

/** Paper look + dissolve timing for the paper-unfold entry. */
function PaperPanel({ elementId }: { elementId: string }) {
  const scene = useActiveScene();
  const updateElement = useEditor((s) => s.updateElement);
  const el = scene.elements.find((e) => e.id === elementId);
  if (!el) return null;
  const p = { ...DEFAULT_PAPER, ...(el.paper ?? {}) };
  const set = (patch: Partial<typeof p>) =>
    updateElement(el.id, { paper: { ...(el.paper ?? {}), ...patch } });
  const stockColor =
    PAPER_STOCKS.find((s) => s.value === p.stock)?.color ?? p.color;
  const shown = p.stock === "custom" ? p.color : stockColor;

  return (
    <div className="rounded-md border p-3 mb-3">
      <h4 className="font-semibold text-sm mb-2">Paper</h4>

      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">Keep the paper on screen</Label>
        <Switch checked={p.keep} onCheckedChange={(v) => set({ keep: v })} />
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {p.keep
          ? "The unfolded sheet stays behind the element as a paper card."
          : "The sheet dissolves after unfolding, leaving only the clean element."}
      </p>

      {!p.keep && (
        <>
          <Label className="text-xs">
            {p.dissolveDelay < 0
              ? `Disappears ${Math.abs(p.dissolveDelay).toFixed(2)}s before the unfold ends`
              : p.dissolveDelay === 0
                ? "Disappears exactly when the unfold ends"
                : `Disappears ${p.dissolveDelay.toFixed(2)}s after the unfold ends`}
          </Label>
          <Slider
            className="mb-1 mt-2"
            min={-Math.max(0.1, el.drawDuration)}
            max={3}
            step={0.01}
            value={[p.dissolveDelay]}
            onValueChange={([v]) => set({ dissolveDelay: v })}
          />
          <Input
            type="number"
            step={0.01}
            min={-Math.max(0.1, el.drawDuration)}
            className="mb-3 h-8"
            value={p.dissolveDelay}
            onChange={(e) => set({ dissolveDelay: Number(e.target.value) })}
          />

          <Label className="text-xs">
            Dissolve takes {p.dissolveDuration.toFixed(2)}s
          </Label>
          <Slider
            className="mb-3 mt-2"
            min={0.05}
            max={2}
            step={0.01}
            value={[p.dissolveDuration]}
            onValueChange={([v]) => set({ dissolveDuration: v })}
          />
        </>
      )}

      <Label className="text-xs">Paper stock</Label>
      <Select
        value={p.stock}
        onValueChange={(v) => set({ stock: v as PaperStock })}
      >
        <SelectTrigger className="mt-1 mb-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAPER_STOCKS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              <span className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-sm border inline-block"
                  style={{ background: s.color }}
                />
                {s.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {p.stock === "custom" && (
        <input
          type="color"
          className="w-full h-10 rounded border mb-2"
          value={p.color}
          onChange={(e) => set({ color: e.target.value })}
        />
      )}

      <div
        className="rounded-md border h-16 mb-3 relative overflow-hidden"
        style={{
          background: `linear-gradient(140deg, color-mix(in srgb, ${shown} 92%, white) 0%, ${shown} 50%, color-mix(in srgb, ${shown} 92%, black) 100%)`,
          boxShadow: `inset 0 0 26px rgba(0,0,0,${0.06 + p.shadow * 0.16})`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(122deg, rgba(255,255,255,0.5) 0%, rgba(0,0,0,0.07) 22%, rgba(255,255,255,0.42) 41%, rgba(0,0,0,0.08) 63%, rgba(255,255,255,0.35) 82%, rgba(0,0,0,0.06) 100%)",
            opacity: 0.35 + p.gloss * 0.75,
          }}
        />
      </div>

      <Label className="text-xs">Wrinkles ({Math.round(p.texture * 100)}%)</Label>
      <Slider
        className="mb-3 mt-2"
        min={0}
        max={1}
        step={0.05}
        value={[p.texture]}
        onValueChange={([v]) => set({ texture: v })}
      />
      <Label className="text-xs">Crease shadow ({Math.round(p.shadow * 100)}%)</Label>
      <Slider
        className="mb-3 mt-2"
        min={0}
        max={1}
        step={0.05}
        value={[p.shadow]}
        onValueChange={([v]) => set({ shadow: v })}
      />
      <Label className="text-xs">Sheen ({Math.round(p.gloss * 100)}%)</Label>
      <Slider
        className="mb-1 mt-2"
        min={0}
        max={1}
        step={0.05}
        value={[p.gloss]}
        onValueChange={([v]) => set({ gloss: v })}
      />
    </div>
  );
}


function ScenePanel() {
  const scene = useActiveScene();
  const setBg = useEditor((s) => s.setBg);
  const setBgPreset = useEditor((s) => s.setBgPreset);
  const setBgImage = useEditor((s) => s.setBgImage);
  const customBackgrounds = useEditor((s) => s.customBackgrounds);
  const addBackgroundImage = useEditor((s) => s.addBackgroundImage);
  const sfxVolume = useEditor((s) => s.sfxVolume);
  const setSfxVolume = useEditor((s) => s.setSfxVolume);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const renameScene = useEditor((s) => s.renameScene);
  const setTransition = useEditor((s) => s.setTransition);
  const setAutoFollowCamera = useEditor((s) => s.setAutoFollowCamera);

  return (
    <>
      <h3 className="font-semibold mb-3">Scene</h3>
      <Label className="text-xs">Name</Label>
      <Input
        className="mb-3 mt-1"
        value={scene.name}
        onChange={(e) => renameScene(scene.id, e.target.value)}
      />
      <Label className="text-xs">Background paper</Label>
      <div className="grid grid-cols-3 gap-2 mt-1 mb-2">
        <button
          onClick={() => {
            setBgPreset(null);
            setBgImage(null);
          }}
          title="Plain colour"
          className={`h-12 rounded-md border-2 bg-card ${
            !scene.bgPreset && !scene.bgImage ? "border-primary" : "border-border"
          }`}
        >
          <span className="text-[10px] text-muted-foreground">Plain</span>
        </button>
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            title={b.name}
            onClick={() => setBgPreset(b.id)}
            className={`h-12 rounded-md border-2 bg-cover bg-center ${
              scene.bgPreset === b.id ? "border-primary" : "border-border"
            }`}
            style={{ backgroundImage: `url(${b.src})` }}
          />
        ))}
        {customBackgrounds.map((b) => (
          <button
            key={b.id}
            title={b.name}
            onClick={() => setBgImage(b.src)}
            className={`h-12 rounded-md border-2 bg-cover bg-center ${
              scene.bgImage === b.src ? "border-primary" : "border-border"
            }`}
            style={{ backgroundImage: `url(${b.src})` }}
          />
        ))}
      </div>
      <input
        ref={bgFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const src = String(reader.result);
            addBackgroundImage(file.name, src);
            setBgImage(src);
            toast.success("Background imported");
          };
          reader.onerror = () => toast.error("Could not read that image.");
          reader.readAsDataURL(file);
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="w-full mb-3"
        onClick={() => bgFileRef.current?.click()}
      >
        <Upload className="w-3.5 h-3.5 mr-1.5" /> Import background image
      </Button>

      <Label className="text-xs">Background colour</Label>
      <div className="flex gap-2 items-center mt-1 mb-3">
        <input
          type="color"
          value={scene.bgColor}
          onChange={(e) => setBg(e.target.value)}
          className="w-10 h-10 rounded border"
        />
        <Input value={scene.bgColor} onChange={(e) => setBg(e.target.value)} />
      </div>

      <div className="flex items-center justify-between rounded-md border p-3 mb-3">
        <div>
          <Label htmlFor="auto-follow-camera" className="text-xs font-semibold">Auto-follow camera</Label>
          <p className="text-[10px] text-muted-foreground">Frames the active timeline element</p>
        </div>
        <Switch
          id="auto-follow-camera"
          checked={scene.autoFollowCamera}
          onCheckedChange={(enabled) => setAutoFollowCamera(scene.id, enabled)}
        />
      </div>

      <h4 className="font-semibold text-sm mt-4 mb-2">Transition to next scene</h4>
      <Select
        value={scene.transition.type}
        onValueChange={(v) => setTransition(scene.id, { type: v as TransitionType })}
      >
        <SelectTrigger className="mb-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Cut (none)</SelectItem>
          <SelectItem value="fade">Crossfade</SelectItem>
          <SelectItem value="slide">Slide</SelectItem>
          <SelectItem value="wipe">Wipe</SelectItem>
          <SelectItem value="hand">Paper hand sweep</SelectItem>
        </SelectContent>
      </Select>
      <Label className="text-xs">
        Transition length ({scene.transition.duration.toFixed(1)}s)
      </Label>
      <Slider
        className="mb-3 mt-2"
        min={0.2}
        max={3}
        step={0.1}
        value={[scene.transition.duration]}
        onValueChange={([v]) => setTransition(scene.id, { duration: v })}
      />

      <h4 className="font-semibold text-sm mt-4 mb-2">Paper hand sound effects</h4>
      <Label className="text-xs">Volume ({Math.round(sfxVolume * 100)}%)</Label>
      <Slider
        className="mb-2 mt-2"
        min={0}
        max={1}
        step={0.05}
        value={[sfxVolume]}
        onValueChange={([v]) => setSfxVolume(v)}
      />
      <p className="text-[10px] text-muted-foreground mb-2">
        Controls the carry and sweep foley for every scene.
      </p>
    </>
  );
}

export function PropertiesPanel() {
  const scene = useActiveScene();
  const selectedId = useEditor((s) => s.selectedId);
  const updateElement = useEditor((s) => s.updateElement);
  const setCameraHold = useEditor((s) => s.setCameraHold);
  const removeElement = useEditor((s) => s.removeElement);
  const el = scene.elements.find((e) => e.id === selectedId);
  const collapsed = useEditor((s) => s.propertiesCollapsed);
  const setCollapsed = useEditor((s) => s.setPropertiesCollapsed);

  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 border-l bg-card flex flex-col items-center pt-2">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setCollapsed(false)}
          title="Show properties"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </aside>
    );
  }

  return (
    <div className="w-72 shrink-0 border-l bg-card flex flex-col overflow-hidden">
      <div className="h-10 px-3 border-b flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold">Properties</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setCollapsed(true)}
          title="Minimize properties"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
      {!el ? (
        <>
          <ScenePanel />
          <CameraPanel />
          <p className="text-xs text-muted-foreground mt-6">
            Select an element on the canvas to edit its properties, or pick a
            camera keyframe on the timeline to set a pan/zoom.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold truncate">{el.name}</h3>
            <Button size="icon" variant="ghost" onClick={() => removeElement(el.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {el.type === "text" && (
            <>
              <Label className="text-xs">Text</Label>
              <Input
                className="mb-3 mt-1"
                value={el.text}
                onChange={(e) => updateElement(el.id, { text: e.target.value })}
              />
              <Label className="text-xs">Font size ({el.fontSize}px)</Label>
              <Slider
                className="mb-3 mt-2"
                min={12}
                max={200}
                step={1}
                value={[el.fontSize]}
                onValueChange={([v]) => updateElement(el.id, { fontSize: v })}
              />
              <Label className="text-xs">Ink color</Label>
              <input
                type="color"
                className="w-full h-10 rounded border mt-1 mb-3"
                value={el.color}
                onChange={(e) => updateElement(el.id, { color: e.target.value })}
              />
              <FontPicker
                value={el.fontFamily}
                weight={el.fontWeight}
                onChange={(v) => updateElement(el.id, { fontFamily: v })}
                onWeight={(w) => updateElement(el.id, { fontWeight: w })}
              />
              <Label className="text-xs">Text background</Label>
              <Select
                value={el.backdrop ?? "none"}
                onValueChange={(v) =>
                  updateElement(el.id, { backdrop: v as TextBackdrop })
                }
              >
                <SelectTrigger className="mt-1 mb-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEXT_BACKDROPS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(el.backdrop ?? "none") !== "none" && (
                <>
                  <Label className="text-xs">Background colour</Label>
                  <div className="flex gap-2 items-center mt-1 mb-2">
                    <input
                      type="color"
                      className="w-10 h-10 rounded border"
                      value={
                        el.backdropColor ??
                        (el.backdrop === "highlight"
                          ? "#ffd83d"
                          : el.backdrop === "sticky"
                            ? "#ffe066"
                            : "#f3e6cb")
                      }
                      onChange={(e) =>
                        updateElement(el.id, { backdropColor: e.target.value })
                      }
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {["#f3e6cb", "#fdf6e4", "#e7d7b6", "#ffd83d", "#ffe066", "#cfe3f0", "#f0cfd4", "#d8e6cf"].map(
                        (c) => (
                          <button
                            key={c}
                            title={c}
                            onClick={() => updateElement(el.id, { backdropColor: c })}
                            className="w-6 h-6 rounded border"
                            style={{ background: c }}
                          />
                        ),
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}


          {el.type === "svg" && (
            <>
              <Label className="text-xs">Ink color</Label>
              <input
                type="color"
                className="w-full h-10 rounded border mt-1 mb-3"
                value={el.color}
                onChange={(e) => updateElement(el.id, { color: e.target.value })}
              />
            </>
          )}

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <Label className="text-xs">Width</Label>
              <Input
                type="number"
                value={Math.round(el.width)}
                onChange={(e) => updateElement(el.id, { width: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Height</Label>
              <Input
                type="number"
                value={Math.round(el.height)}
                onChange={(e) => updateElement(el.id, { height: Number(e.target.value) })}
              />
            </div>
          </div>

          <Label className="text-xs">Rotation ({Math.round(el.rotation)}°)</Label>
          <Slider
            className="mb-4 mt-2"
            min={-180}
            max={180}
            step={1}
            value={[el.rotation]}
            onValueChange={([v]) => updateElement(el.id, { rotation: v })}
          />

          <h4 className="font-semibold text-sm mt-4 mb-2">Entry animation</h4>
          <Select
            value={el.entry ?? "draw"}
            onValueChange={(v) =>
              updateElement(el.id, {
                entry: v as "draw" | "slide" | "pen" | "paper-pen" | "unfold" | "appear",
              })
            }
          >
            <SelectTrigger className="mb-1 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draw">Quill pen — drawn stroke by stroke</SelectItem>
              <SelectItem value="pen">Hand with pen — drawn by hand</SelectItem>
              <SelectItem value="paper-pen">Paper hand — drawn in paper style</SelectItem>
              <SelectItem value="slide">Hand slide — carried into place</SelectItem>
              <SelectItem value="unfold">Paper unfold — crumpled ball opens up</SelectItem>
              <SelectItem value="appear">Appear — pop, fade or slide</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mb-3">
            Hand slide brings the finished element in from off-screen, held by a
            hand that drops it where you placed it.
          </p>

          {(el.entry ?? "draw") === "unfold" && <PaperPanel elementId={el.id} />}

          {(el.entry ?? "draw") === "appear" && (
            <div className="mb-3">
              <Label className="text-xs">Appear style</Label>
              <div className="grid grid-cols-3 gap-1 mt-1.5">
                {(
                  [
                    { value: "pop", label: "Pop" },
                    { value: "fade", label: "Fade in" },
                    { value: "slide", label: "Slide" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    onClick={() => updateElement(el.id, { appearStyle: o.value })}
                    className={`h-8 rounded-md border text-xs transition-colors ${
                      (el.appearStyle ?? "pop") === o.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-secondary"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {(el.appearStyle ?? "pop") !== "fade" && (
                <div className="mt-2">
                  <Label className="text-xs">Fly in from</Label>
                  <div className="grid grid-cols-4 gap-1 mt-1.5">
                    {(
                      [
                        { value: "left", label: "Left" },
                        { value: "right", label: "Right" },
                        { value: "up", label: "Up" },
                        { value: "down", label: "Down" },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.value}
                        onClick={() =>
                          updateElement(el.id, { appearDirection: o.value })
                        }
                        className={`h-8 rounded-md border text-xs transition-colors ${
                          (el.appearDirection ?? "right") === o.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-secondary"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


          <h4 className="font-semibold text-sm mt-4 mb-2">Timing</h4>
          <TimeField
            label="Start at"
            value={el.startTime}
            onChange={(v) => updateElement(el.id, { startTime: v })}
          />
          <TimeField
            label={`${
              (el.entry ?? "draw") === "slide"
                ? "Slide-in"
                : (el.entry ?? "draw") === "unfold"
                  ? "Unfold"
                  : (el.entry ?? "draw") === "appear"
                    ? "Appear"
                    : "Draw"
            } duration`}
            value={el.drawDuration}
            min={0.2}
            onChange={(v) => updateElement(el.id, { drawDuration: Math.max(0.2, v) })}
          />
          <TimeField
            label="Hold"
            value={el.holdDuration}
            onChange={(v) => updateElement(el.id, { holdDuration: v })}
          />
          <TimeField
            label="Keep camera here (extra)"
            value={el.cameraHold ?? 0}
            onChange={(v) => setCameraHold(el.id, v)}
          />
          <p className="text-xs text-muted-foreground mb-3">
            With auto-follow on, the camera stays framed on this element this
            much longer — the same time is added to its hold and every later
            element is pushed forward to match.
          </p>

          <MotionPanel elementId={el.id} />

          <CameraPanel />
        </>
      )}
      </div>
    </div>
  );
}

/**
 * Seconds control: an unbounded number input plus a slider whose range grows
 * with the value, so there is no hard ceiling on hold / camera-hold times.
 */
function TimeField({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  const max = Math.max(10, Math.ceil((value + 5) / 5) * 5);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step={0.1}
            min={min}
            value={Number(value.toFixed(2))}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) onChange(Math.max(min, v));
            }}
            className="h-7 w-20 text-xs"
          />
          <span className="text-[10px] text-muted-foreground">s</span>
        </div>
      </div>
      <Slider
        className="mt-2"
        min={min}
        max={max}
        step={0.1}
        value={[Math.min(value, max)]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
