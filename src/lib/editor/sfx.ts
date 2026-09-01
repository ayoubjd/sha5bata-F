// Paper foley sound effects. Real recordings are served from /public
// (paper-carry.mp3, paper-sweep.mp3). Each sample is time-stretched (via
// playbackRate) so it lasts exactly as long as the animation that triggers
// it. If the recordings are missing, procedural paper synthesis is used as
// a fallback so the foley always works — offline, in dev, and in exports.

let ctx: AudioContext | null = null;
let muted = false;
let volume = 0.85;

export function setSfxMuted(v: boolean) {
  muted = v;
}

/** Master volume (0..1) for the paper foley effects. */
export function setSfxVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

export function getSfxVolume() {
  return volume;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || muted) return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// ------------------------- procedural paper synthesis -------------------------

/** RBJ biquad band-pass, optionally sweeping f0 -> f1 across the buffer. */
function bandpass(data: Float32Array, sr: number, f0: number, f1: number, q: number) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const n = data.length;
  for (let i = 0; i < n; i++) {
    const f = f0 + (f1 - f0) * (i / n);
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const cw = Math.cos(w);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * cw) / a0;
    const a2 = (1 - alpha) / a0;
    const x0 = data[i];
    const y = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y;
    data[i] = y;
  }
}

/** Short impulsive noise bursts — the crackles that make paper read as paper. */
function crackles(data: Float32Array, sr: number, count: number, maxAmp: number, seedStart = 0, seedEnd = 1) {
  for (let i = 0; i < count; i++) {
    const pos = Math.floor(data.length * (seedStart + Math.random() * (seedEnd - seedStart)));
    const len = Math.floor(sr * (0.004 + Math.random() * 0.025));
    const amp = maxAmp * (0.25 + Math.random() * 0.75);
    for (let j = 0; j < len && pos + j < data.length; j++) {
      const env = 1 - j / len;
      data[pos + j] += (Math.random() * 2 - 1) * amp * env * env;
    }
  }
}

/** Fade-in/out envelope with a gentle mid swell so it reads as a motion. */
function envelope(data: Float32Array, attack: number, release: number) {
  const n = data.length;
  const a = Math.floor(n * attack);
  const r = Math.floor(n * release);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < a) g = i / a;
    else if (i > n - r) g = (n - i) / r;
    // subtle turbulence
    g *= 0.75 + 0.25 * Math.sin((i / n) * Math.PI * 6 + Math.sin(i * 0.0007) * 3);
    data[i] *= g;
  }
}

function synthPaper(ac: AudioContext, kind: "carry" | "sweep"): AudioBuffer {
  const sr = ac.sampleRate;
  const dur = kind === "carry" ? 1.1 : 1.4;
  const buf = ac.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  if (kind === "carry") {
    // a sheet sliding onto the board: bright band, dense fine crackle
    bandpass(d, sr, 2600, 1400, 1.1);
    crackles(d, sr, 55, 0.5);
    envelope(d, 0.12, 0.3);
  } else {
    // the big hand sweep: darker, sweeping downward, sparser bigger crackles
    bandpass(d, sr, 1800, 500, 0.9);
    crackles(d, sr, 40, 0.65);
    crackles(d, sr, 25, 0.5, 0, 0.6);
    envelope(d, 0.08, 0.35);
  }

  // normalise to a sane peak
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const norm = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < d.length; i++) d[i] *= norm;
  return buf;
}

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();

const RECORDINGS: Record<"carry" | "sweep", string> = {
  carry: "/paper-carry.mp3",
  sweep: "/paper-sweep.mp3",
};

/** Try the real recording from /public; fall back to procedural synthesis. */
function bufferFor(ac: AudioContext, kind: "carry" | "sweep"): Promise<AudioBuffer> {
  const hit = buffers.get(kind);
  if (hit) return Promise.resolve(hit);
  const inflight = loading.get(kind);
  if (inflight) return inflight;
  const task = (async () => {
    try {
      const res = await fetch(RECORDINGS[kind]);
      if (!res.ok) throw new Error(String(res.status));
      const mime = res.headers.get("content-type") ?? "";
      if (mime.includes("text/html")) throw new Error("not audio");
      const buf = await ac.decodeAudioData(await res.arrayBuffer());
      buffers.set(kind, buf);
      return buf;
    } catch {
      // recording missing/unreadable — synthesise instead
      const buf = synthPaper(ac, kind);
      buffers.set(kind, buf);
      return buf;
    } finally {
      loading.delete(kind);
    }
  })();
  loading.set(kind, task);
  return task;
}

/**
 * Plays a sample stretched to `duration` seconds so its motion matches the
 * animation. `rateFloor`/`rateCeil` keep the pitch shift musical.
 */
function playStretched(kind: "carry" | "sweep", duration: number, baseGain: number) {
  const gain = baseGain * volume;
  if (gain <= 0.001) return;
  const ac = audio();
  if (!ac) return;
  void bufferFor(ac, kind).then((buf) => {
    const rate = Math.max(0.5, Math.min(2.5, buf.duration / Math.max(0.15, duration)));
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const g = ac.createGain();
    const t0 = ac.currentTime;
    const playLen = buf.duration / rate;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.06, playLen * 0.1));
    g.gain.setValueAtTime(gain, t0 + playLen * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + playLen);

    src.connect(g).connect(ac.destination);
    src.start(t0);
    src.stop(t0 + playLen + 0.05);
  });
}

let last = 0;

/**
 * A single sheet being carried in by the hand.
 * `duration` should be the length of the slide so the sound tracks it.
 */
export function playPaperFold(duration = 1.1) {
  const now = Date.now();
  if (now - last < 90) return;
  last = now;
  playStretched("carry", Math.max(0.4, Math.min(4, duration)), 0.85);
}

/**
 * The paper hand sweeping the whole scene away.
 * Pass the transition duration so the flurry lasts exactly as long as the sweep.
 */
export function playPaperSweep(duration = 1.2) {
  const now = Date.now();
  if (now - last < 200) return;
  last = now;
  playStretched("sweep", Math.max(0.5, Math.min(6, duration)), 0.95);
}
