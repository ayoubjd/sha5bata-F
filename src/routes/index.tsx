import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  AudioLines,
  Camera,
  Clapperboard,
  Feather,
  Film,
  FolderTree,
  Hand,
  Image,
  Keyboard,
  Layers,
  Mic,
  Monitor,
  Music,
  Palette,
  PenLine,
  Play,
  Rocket,
  Shapes,
  Sliders,
  Sparkles,
  TextCursorInput,
  Timer,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
import { ThemeToggle } from "@/components/editor/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BACKGROUNDS } from "@/lib/editor/backgrounds";
import logoImg from "@/assets/sha5batalogo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sha5bata — Whiteboard Animation Studio" },
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
  component: Home,
});

/* ── Interaction hooks ─────────────────────────────────────────── */

type PaperVars = {
  "--paper-tilt"?: string;
  "--delay"?: string;
  "--char-tilt"?: string;
  [key: `--${string}`]: string | undefined;
};

/** Convert an object with CSS custom properties into a valid style object. */
function pstyle(vars: Record<string, string | number | undefined>): CSSProperties {
  return vars as CSSProperties;
}

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("paper-is-visible");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useMouseTilt() {
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>("[data-tilt]");
    const onMove = (e: MouseEvent) => {
      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        if (r.width === 0) return;
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--tilt-x", `${(-py * 10).toFixed(2)}deg`);
        card.style.setProperty("--tilt-y", `${(px * 10).toFixed(2)}deg`);
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
}

function useCountUp(target: number, started: boolean, duration = 1600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, target, duration]);
  return value;
}

/* ── Data ──────────────────────────────────────────────────────── */

const FEATURES = [
  { icon: Shapes, title: "200k+ icon library", body: "Search and drop icons from Iconify — the same 200k+ open icons. Filter by name or category and click to place them on your canvas instantly." },
  { icon: Upload, title: "Upload your own art", body: "Bring in SVG, PNG or JPG files. PNGs and JPGs are auto-vectorised with Potrace so the quill pen can trace their outlines stroke by stroke." },
  { icon: TextCursorInput, title: "Handwritten text", body: "Add text in a range of built-in fonts — handwritten Kalam, marker, serif, sans and typewriter — or import your own font files and pick the weight." },
  { icon: Palette, title: "Text backdrops", body: "Wrap text in coloured shapes — rounded boxes, pill shapes, circles or ovals. Pick any background colour, corner radius and padding to make your words stand out on the board." },
  { icon: Feather, title: "Quill pen drawing", body: "The signature quill draws every SVG stroke and letter in order, exactly like a real whiteboard artist at work." },
  { icon: Hand, title: "Hand & pen animation", body: "Watch an illustrated hand hold the pen as it writes, carry finished elements into place, and sweep the whole scene away between takes." },
  { icon: Clapperboard, title: "Paper unfold & exits", body: "Crumple a ball of paper that unfolds to reveal your artwork, then dissolves away — timed to just before or after the reveal finishes." },
  { icon: Image, title: "Paper pen entry", body: "A paper cutout hand draws the element on screen with a realistic pen motion — different from the live hand, this one is a stylised paper silhouette." },
  { icon: Rocket, title: "Appear styles & directions", body: "Pop in with a springy overshoot, fade in smoothly, or slide in from any of the four sides — pick the mood and direction for every single element." },
  { icon: FolderTree, title: "Multi-scene timeline", body: "Build a video from many scenes, reorder them, and chain them with transitions — fade, slide, wipe or a sweeping hand." },
  { icon: Camera, title: "Camera pan & zoom", body: "Add camera keyframes to pan, zoom and refocus the action. Or turn on auto-follow so the camera tracks each element as it appears." },
  { icon: Sliders, title: "Motion keyframes", body: "Animate elements along a path with motion keyframes — place numbered handles and drag them anywhere on the canvas." },
  { icon: Music, title: "Voice-over, music & video", body: "Record or upload audio clips on the global timeline, trim them, and adjust volume. Drop video clips on the video track — trim, layer and reorder them alongside your animation." },
  { icon: Layers, title: "12 scene backgrounds", body: "Style every scene with one of twelve hand-painted paper textures — crumpled kraft, dark parchment, vintage paper and more. Or import any image you like." },
  { icon: Monitor, title: "16:9 or 9:16", body: "Switch your board between landscape widescreen and portrait vertical formats with one click." },
  { icon: Film, title: "Preview & export", body: "Scrub through the full animation and record it in real time. Export to MP4 (H.264) or WebM straight to your Downloads folder." },
  { icon: Keyboard, title: "Keyboard-first workflow", body: "Everything has a keyboard shortcut. Stay on the keyboard: add elements, cut scenes, duplicate, rename, and preview without reaching for the mouse." },
  { icon: Undo2, title: "Undo / redo everywhere", body: "Every change is captured. Undo, redo, revert camera tweaks and element nudges exactly the way you expect a pro editor to behave." },
  { icon: Sparkles, title: "RTL & Arabic text", body: "Type in Arabic, Hebrew or any right-to-left script. Sha5bata detects direction automatically and preserves connected-letter shaping with seven Arabic fonts built in." },
  { icon: Image, title: "Transition indicators", body: "See exactly where scene transitions begin and end in the timeline. Drag incoming and outgoing edges to control how long each transition takes." },
  { icon: Layers, title: "Full editor workspace", body: "A collapsible asset library, a resizable timeline and a property panel keep everything organized while you create." },
];

const TILTS = [
  { "--paper-tilt": "-2.5deg", "--delay": "0s" },
  { "--paper-tilt": "1.8deg", "--delay": "0.5s" },
  { "--paper-tilt": "-0.8deg", "--delay": "1s" },
  { "--paper-tilt": "2.2deg", "--delay": "0.25s" },
  { "--paper-tilt": "-1.6deg", "--delay": "0.75s" },
  { "--paper-tilt": "1.1deg", "--delay": "0.4s" },
] as PaperVars[];

const MARQUEE_BGS = [...BACKGROUNDS.slice(3), ...BACKGROUNDS.slice(3, 6), ...BACKGROUNDS.slice(6, 9)];

function PaperTitle({ text, className = "" }: { text: string; className?: string }) {
  const chars = text.split("");
  return (
    <span className={className} aria-label={text}>
      {chars.map((ch, i) => (
        <span
          key={i}
          className="paper-title-char"
          style={pstyle({
            animationDelay: `${0.35 + i * 0.045}s`,
            "--char-tilt": `${i % 2 ? 4 : -4}deg`,
          })}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}

function Reveal({
  children,
  className = "",
  tilt,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  tilt?: PaperVars;
  delay?: number;
}) {
  return (
    <div
      data-reveal
      className={`paper-reveal ${className}`}
      style={pstyle({ ...(tilt ?? {}), transitionDelay: delay ? `${delay}s` : "0s" })}
    >
      {children}
    </div>
  );
}

/* ── Feature card with 3D tilt ─────────────────────────────────── */
function FeatureCard({ feature, index }: { feature: (typeof FEATURES)[number]; index: number }) {
  const Icon = feature.icon;
  const tilt = TILTS[index % TILTS.length];
  return (
    <Reveal tilt={{ ...tilt, transitionDelay: `${Boolean(index % 2) ? 0.06 : 0}s` } as PaperVars}>
      <div
        data-tilt
        className="paper-card paper-tilt group h-full p-6 hover:z-10 cursor-default"
        style={pstyle({ ...tilt })}
      >
        <span className="paper-tape -top-2.5 left-1/2 -translate-x-1/2 -rotate-2" />
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-4 font-bold text-lg text-foreground">{feature.title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{feature.body}</p>
      </div>
    </Reveal>
  );
}

/* ── Counters ──────────────────────────────────────────────────── */
function Counter({
  value,
  suffix = "",
  started,
  icon: Icon,
  label,
}: {
  value: number;
  suffix?: string;
  started: boolean;
  icon: React.ElementType;
  label: string;
}) {
  const v = useCountUp(value, started);
  return (
    <div className="paper-card paper-float-b p-6 text-center">
      <Icon className="mx-auto h-6 w-6 text-primary" />
      <p className="mt-3 text-3xl font-extrabold tabular-nums">
        {v.toLocaleString()}
        {suffix}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setStarted(true),
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="mx-auto grid max-w-4xl grid-cols-2 gap-6 sm:grid-cols-4">
      <Counter value={200} suffix="k+" started={started} icon={Shapes} label="Free icons" />
      <Counter value={8} started={started} icon={Wand2} label="Entry effects" />
      <Counter value={2} suffix="" started={started} icon={Film} label="Video formats" />
      <Counter value={100} suffix="%" started={started} icon={Feather} label="In-browser" />
    </div>
  );
}

function Home() {
  useScrollReveal();
  useMouseTilt();

  return (
    <div className="min-h-screen w-full bg-background text-foreground overflow-x-hidden">
      {/* ---------- nav ---------- */}
      <header className="relative z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img
              src={logoImg}
              alt="Sha5bata logo"
              className="paper-card h-10 w-10 object-contain"
              style={pstyle({ "--paper-tilt": "-3deg" })}
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
            <Button asChild>
              <Link to="/studio">
                Open studio <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.32]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, oklch(0.6 0.05 80) 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[46rem] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />

        {/* drifting paper decorations */}
        <span className="paper-doily paper-drift h-44 w-44 -left-12 top-24" />
        <span className="paper-doily paper-drift h-32 w-32 right-2 top-40" style={{ animationDelay: "2s" }} />
        <span className="paper-doily paper-drift h-36 w-36 left-1/4 bottom-14" style={{ animationDelay: "4.5s" }} />
        <span className="paper-doily paper-wiggle h-20 w-20 right-1/3 top-24" />

        {/* floating paper "scratch" cards behind the heading */}
        <div className="pointer-events-none absolute left-[6%] top-32 hidden lg:block">
          <div className="paper-card paper-float-a p-4" style={pstyle({ "--paper-tilt": "-6deg" })}>
            <Feather className="h-8 w-8 text-primary/60" />
          </div>
          <div className="paper-card paper-float-b mt-3 p-4" style={pstyle({ "--paper-tilt": "5deg" })}>
            <Film className="h-8 w-8 text-primary/60" />
          </div>
        </div>
        <div className="pointer-events-none absolute right-[7%] top-44 hidden lg:block">
          <div className="paper-card paper-float-b p-4" style={pstyle({ "--paper-tilt": "7deg" })}>
            <Shapes className="h-8 w-8 text-primary/60" />
          </div>
          <div className="paper-card paper-float-a mt-3 p-4" style={pstyle({ "--paper-tilt": "-4deg" })}>
            <AudioLines className="h-8 w-8 text-primary/60" />
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 text-center">
          <div
            className="paper-card paper-float-a inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-muted-foreground paper-fall-in"
            style={pstyle({ "--paper-tilt": "1.2deg" })}
          >
            <span className="paper-tape -top-2 left-6 rotate-6" />
            <Feather className="h-3.5 w-3.5 text-primary" />
            100% in your browser — no installs
          </div>

          <h2 className="mx-auto mt-8 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            <PaperTitle text="Hand-drawn whiteboard" /> <br />
            <PaperTitle text="videos," className="text-primary" />{" "}
            <PaperTitle text="made by you" />
          </h2>

          <p className="paper-reveal paper-is-visible mx-auto mt-6 max-w-2xl text-lg text-muted-foreground" style={{ transitionDelay: "0.8s" }}>
            Turn icons, images and text into engaging whiteboard animations with
            a quill pen that draws your story stroke by stroke — then export it
            as a video in minutes.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="lg" className="h-12 px-8 text-base font-semibold" asChild>
              <Link to="/studio">
                <Play className="mr-2 h-5 w-5" />
                Start creating
              </Link>
            </Button>
            <a
              href="#features"
              className="paper-card inline-flex h-12 items-center justify-center rounded-md px-6 text-base font-medium transition-colors hover:bg-accent"
              style={pstyle({ "--paper-tilt": "-1deg" })}
            >
              Explore features
            </a>
          </div>
        </div>
      </section>

      {/* ---------- stats ---------- */}
      <section className="relative border-t bg-card py-16">
        <div className="relative mx-auto max-w-6xl px-4">
          <Stats />
        </div>
      </section>

      {/* ---------- background gallery marquee ---------- */}
      <section className="relative overflow-hidden border-t py-16">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            With every backdrop
          </p>
          <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Fifteen hand-painted papers</h2>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />
          <div className="paper-marquee overflow-visible" style={pstyle({ "--marquee-dur": "60s" })}>
            {[...MARQUEE_BGS, ...MARQUEE_BGS].map((b, i) => (
              <div key={`${b.id}-${i}`} className="paper-frame paper-toss shrink-0 overflow-hidden" style={{ animationDelay: `${i * 0.05}s` }}>
                <div
                  className="h-36 w-64 bg-cover bg-center"
                  style={{ backgroundImage: `url(${b.src})` }}
                />
                <p className="bg-card px-3 py-2 text-xs font-medium text-muted-foreground text-center">
                  {b.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">From idea to video in four steps</h2>
          </Reveal>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "1", icon: Shapes, title: "Add your elements", body: "Drop icons, upload art, or type text onto the board. Add video clips to the video track. Move, resize and rotate anything right on the canvas." },
              { step: "2", icon: Feather, title: "Animate", body: "Choose how each element enters — quill draw, pen hand, paper cutout, slide, paper unfold or pop/fade/slide appear. Pick the direction too." },
              { step: "3", icon: Camera, title: "Direct the camera", body: "Add pan and zoom keyframes, build multiple scenes with transitions, and lay down music or a voice-over." },
              { step: "4", icon: Film, title: "Preview & export", body: "Watch the full animation, then record and export an MP4 or WebM video straight to your downloads." },
            ].map((s, i) => {
              const Icon = s.icon;
              const tilt = TILTS[i % TILTS.length];
              return (
                <div key={s.step} className="relative">
                  <Reveal tilt={{ ...tilt! }}>
                    <div
                      className={`paper-card paper-toss group p-6 ${i % 2 ? "paper-float-b" : "paper-float-a"} hover:z-10`}
                      style={pstyle({ ...tilt, animationDelay: `${0.15 + i * 0.12}s` })}
                    >
                      <span className="paper-tape -top-2.5 left-1/2 -translate-x-1/2" />
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                          {s.step}
                        </div>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                      <h3 className="mt-4 font-bold">{s.title}</h3>
                      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                    </div>
                  </Reveal>
                  {i < 3 && <div className="step-dashes absolute -right-5 top-1/2 hidden w-5 -translate-y-1/2 lg:block" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- entry animations ---------- */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Entry animations</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">8 ways to bring an element on screen</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Every element gets its own entrance. Mix and match the styles for a lively, hand-crafted feel.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Feather, name: "Quill pen", desc: "Drawn stroke by stroke" },
              { icon: PenLine, name: "Hand with pen", desc: "Written by an illustrated hand" },
              { icon: Hand, name: "Hand slide", desc: "Carried in and dropped in place" },
              { icon: Clapperboard, name: "Paper unfold", desc: "A crumpled ball opens up, then dissolves" },
              { icon: Image, name: "Paper pen", desc: "A paper cutout hand draws the element on" },
              { icon: Rocket, name: "Pop", desc: "Springs in with an overshoot" },
              { icon: Sparkles, name: "Fade in", desc: "Cross-fades smoothly into position" },
              { icon: ArrowRight, name: "Slide", desc: "Glides in from left, right, up or down" },
            ].map((a, i) => {
              const Icon = a.icon;
              const tilt = TILTS[i % TILTS.length];
              return (
                <Reveal key={a.name} tilt={tilt} delay={0.05}>
                  <div
                    className={`paper-card paper-toss group flex items-center gap-4 p-5 ${i % 2 ? "paper-float-b" : "paper-float-a"} hover:z-10`}
                    style={pstyle({ ...tilt, animationDelay: `${0.1 + i * 0.1}s` })}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{a.name}</p>
                      <p className="text-sm text-muted-foreground">{a.desc}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- features grid ---------- */}
      <section id="features" className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Everything included
            </p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">A full whiteboard studio</h2>
          </Reveal>
          <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} feature={f} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <Reveal className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">FAQ</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Questions, answered</h2>
          </Reveal>
          <Reveal className="mt-10" delay={0.1}>
            <div className="paper-card px-6">
              <Accordion type="single" collapsible>
                {[
                  { q: "Do I need to install anything?", a: "No. Sha5bata runs 100% in your browser — icons, vectorisation, sound design and even MP4 export with embedded FFmpeg all happen locally." },
                  { q: "Can I use my own images and fonts?", a: "Yes. Upload SVG, PNG or JPG art (bitmaps are auto-vectorised with Potrace), or import font files and use them across every scene." },
                  { q: "Does it support Arabic and other RTL languages?", a: "Yes. Sha5bata automatically detects right-to-left text and preserves connected-letter shaping. Seven Arabic fonts are built in: Cairo, Tajawal, Almarai, Amiri, Changa, Reem Kufi and Aref Ruqaa." },
                  { q: "Can I add video clips?", a: "Yes. Drop video files onto the video track, trim them, and layer them with your whiteboard animation. Video clips play underneath the drawn elements." },
                  { q: "What is a text backdrop?", a: "Text backdrops wrap your text in a coloured shape — a rounded box, pill, circle or oval. Pick any background colour and corner radius to make text stand out." },
                  { q: "What file formats can I export?", a: "Record your animation in real time and export to MP4 (H.264) or WebM. Both land straight in your Downloads folder." },
                  { q: "Are the sound effects real recordings?", a: "The paper hand foley — crinkles, sweeps and unfolds — is generated from real recordings inside the browser, with adjustable volume and mute." },
                  { q: "Is it free?", a: "Every feature is included: the full icon library, paper backdrops, camera and motion keyframes, voice-over timeline and video export." },
                ].map((item, i) => (
                  <AccordionItem key={item.q} value={`item-${i}`} className={i === 0 ? "border-t-0" : ""}>
                    <AccordionTrigger className="text-left font-semibold">{item.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="relative overflow-hidden border-t">
        <div className="pointer-events-none absolute -bottom-32 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
        <span className="paper-doily paper-drift h-32 w-32 left-8 top-12" />
        <span className="paper-doily paper-drift h-24 w-24 right-10 bottom-16" style={{ animationDelay: "1.5s" }} />
        <div className="relative mx-auto max-w-6xl px-4 py-24 text-center">
          <Reveal>
            <h2 className="text-3xl font-extrabold sm:text-5xl">
              Ready to make your{" "}
              <span className="paper-streak bg-clip-text text-transparent">first animation?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Open the studio and start drawing — no account, no software, no
              downloads. Your ideas, on the whiteboard.
            </p>
            <Button size="lg" className="mt-8 h-12 px-8 text-base font-semibold" asChild>
              <Link to="/studio">
                <Play className="mr-2 h-5 w-5" />
                Start creating now
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Image className="h-4 w-4" aria-hidden />
            Made with <Feather className="h-3.5 w-3.5" aria-hidden /> in your browser
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/studio">
              <ArrowRight className="mr-1.5 h-4 w-4" />
              Open the editor
            </Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}