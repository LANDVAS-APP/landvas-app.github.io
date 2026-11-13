// Clips: a short vertical video of a roll — the actual roll, replayed frame for frame from its record (the same stage
// that drew it live: the drop, the minigame strip, the rarity drum and every reroll, the near miss, the flood, the
// particles exactly where they flew), with the LANDVAS mark, your name and a caption — or of any moment from the game
// (src/clips/moments.ts). Made in the browser (WebCodecs → MP4, or MediaRecorder), shared straight from the phone.
// Snip: pause on any frame and save it as a picture.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { rarityInfo, rarityTier, type RarityId } from '../shared/rarity';
import { buzz, isNative } from '../native/native';
import { config } from '../env';
import { kindInfo } from '../enchant/kinds';
import { sharedAssets } from './stage/assets';
import { drawBrand, drawCaption, drawFooter, drawLuck, drawPickMontage, drawTray } from './stage/chrome';
import { drawStage } from './stage/draw';
import { layoutFor } from './stage/layout';
import { HOLD, clipAt, clipTimeline, type Trace } from './stage/trace';

const W = 720, H = 1280, FPS = 30;

/** whether a pull is worth a clip on the spot (better than Rare, shiny or Enchanted; any roll can be clipped later from Clips) */
export const clippable = (r: RarityId | string, shiny?: boolean, enchanted?: boolean) => rarityTier(r) >= 2 || !!shiny || !!enchanted || r === 'enchanted';

/** something to film: its size, its length, how to draw any moment of it, and what to call it */
export type ClipJob = {
  w: number; h: number; total: number;
  /** the frame a snip opens on (ms) */
  poster: number;
  prepare(): Promise<void>;
  draw(g: CanvasRenderingContext2D, ms: number): void;
  name: string; title: string; text: string;
  color: string; glow: string;
};

/** a roll, replayed from its record */
export function rollJob(tr: Trace, luck?: number | null): ClipJob {
  const multi = !!(tr.final.choices && tr.final.choices.length > 1);
  const L = layoutFor(W, H, { mode: 'clip', multi });
  const A = sharedAssets(1, true);
  const tl = clipTimeline(tr);
  const f = tr.final, ench = f.enchant ?? null;
  const info = rarityInfo(ench ? 'enchanted' : f.rarity), ek = ench ? kindInfo(ench.kind) : null;
  const label = ek ? ek.name : info.name;
  return {
    w: W, h: H, total: tl.total, poster: Math.max(0, tl.total - HOLD + 1700),
    prepare: () => A.prepare(tr),
    draw(g, ms) {
      const { t, pick } = clipAt(tl, ms);
      drawStage(g, L, tr, t, { dpr: 1, assets: A });
      g.setTransform(1, 0, 0, 1, 0, 0);
      drawBrand(g, L, tr.user);
      drawLuck(g, L, tr, t, luck);
      drawTray(g, L, A, tr, t);
      if (pick != null) drawPickMontage(g, L, A, tr, pick);
      drawCaption(g, L, tr, t);
      drawFooter(g, L);
    },
    name: `landvas-${(ek ? ek.name : info.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}${f.shiny ? '-shiny' : ''}`,
    title: `${label} on LANDVAS`,
    text: ek ? `My plot came out ENCHANTED — a ${ek.name} (#${ench!.serial})! ${ek.emoji} landvas.app` : `I just pulled a ${f.shiny ? 'SHINY ' : ''}${info.name} plot on LANDVAS! ${info.emoji ?? '🎉'} landvas.app`,
    color: ench ? '#B26BFF' : info.color, glow: ench ? '#F0DBFF' : info.glow,
  };
}

// ---- encoding ---------------------------------------------------------------------------------------------------------
/** formats to try, best first (MP4 shares everywhere); ones that recorded nothing on this device are skipped */
const BROKEN = 'landvas.clipBroken';
function formats(): string[] {
  if (typeof MediaRecorder === 'undefined') return [];
  let broken: string[] = [];
  try { broken = JSON.parse(localStorage.getItem(BROKEN) || '[]'); } catch { /* */ }
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .filter((m) => MediaRecorder.isTypeSupported(m) && !broken.includes(m));
}
function markBroken(m: string) {
  try { const b = JSON.parse(localStorage.getItem(BROKEN) || '[]'); localStorage.setItem(BROKEN, JSON.stringify([...new Set([...b, m])])); } catch { /* */ }
}
const yieldNow = () => new Promise((r) => setTimeout(r, 0));

/** frame by frame with exact timestamps (WebCodecs → MP4): full length and smooth on any phone, however busy it is.
    Null where the browser can't encode H.264 this way. */
async function encodeMp4(job: ClipJob, onProgress?: (x: number) => void): Promise<Blob | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  let codec: string | null = null;
  for (const c of ['avc1.640028', 'avc1.4d0028', 'avc1.42001f']) {
    try { if ((await VideoEncoder.isConfigSupported({ codec: c, width: job.w, height: job.h, bitrate: 6_000_000, framerate: FPS })).supported) { codec = c; break; } } catch { /* next */ }
  }
  if (!codec) return null;
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: job.w, height: job.h, frameRate: FPS }, fastStart: 'in-memory' });
  let failed = false;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: () => { failed = true; } });
  enc.configure({ codec, width: job.w, height: job.h, bitrate: 6_000_000, framerate: FPS });
  // (a CPU-backed canvas: every frame goes straight to the encoder, no GPU read-back per frame)
  const cv = document.createElement('canvas'); cv.width = job.w; cv.height = job.h;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const n = Math.ceil((job.total + 150) / (1000 / FPS));
  for (let i = 0; i < n && !failed; i++) {
    job.draw(g, Math.min((i * 1000) / FPS, job.total));
    const f = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(f, { keyFrame: i % (FPS * 2) === 0 });
    f.close();
    if (i % 3 === 0 || enc.encodeQueueSize > 6) { onProgress?.(i / n); await yieldNow(); }
  }
  if (failed) return null;
  await enc.flush(); enc.close();
  muxer.finalize();
  return failed ? null : new Blob([target.buffer], { type: 'video/mp4' });
}

/** make the clip: frame by frame where possible, else recorded in real time; a picture where video can't be made */
export async function encode(job: ClipJob, onProgress?: (x: number) => void): Promise<{ blob: Blob; kind: 'video' | 'image'; ext: string }> {
  await job.prepare();
  try {
    const mp4 = await encodeMp4(job, onProgress);
    if (mp4 && mp4.size > 0) { lastDebug = { via: 'webcodecs' }; return { blob: mp4, kind: 'video', ext: 'mp4' }; }
  } catch { /* fall back to recording */ }
  const cv = document.createElement('canvas'); cv.width = job.w; cv.height = job.h;
  const g = cv.getContext('2d')!;
  const fmts = formats();
  if (!fmts.length || !cv.captureStream) return { blob: await snipBlob(job, job.poster), kind: 'image', ext: 'png' };
  // some browsers claim a format and then record nothing: try each in turn until one gives data
  lastDebug = { mime: fmts[0] };
  let used = fmts[0], chunks: Blob[] = [];
  for (const m of fmts) {
    used = m; chunks = [];
    // frames are pushed one by one as they're drawn (so a busy phone never drops the ending)
    const stream = cv.captureStream(0);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    const push = () => track.requestFrame?.();
    const rec = new MediaRecorder(stream, { mimeType: m, videoBitsPerSecond: 6_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    rec.start(250);
    job.draw(g, 0); push();
    const t0 = performance.now();
    const ok = await new Promise<boolean>((resolve) => {
      // next frame: on the animation frame, or a timer if animation frames are being held back
      const next = () => { let fired = false; const go = () => { if (!fired) { fired = true; tick(); } }; requestAnimationFrame(go); setTimeout(go, 1000 / FPS + 8); };
      const tick = () => {
        const t = performance.now() - t0;
        job.draw(g, Math.min(t, job.total)); push();
        onProgress?.(Math.min(1, t / job.total));
        if (t >= job.total + 150) { resolve(true); return; }
        next();
      };
      next();
    });
    rec.stop(); stream.getTracks().forEach((tr) => tr.stop());
    await done;
    lastDebug[m] = { ok, chunks: chunks.length, bytes: chunks.reduce((n, c) => n + c.size, 0) };
    if (ok && chunks.reduce((n, c) => n + c.size, 0) > 0) break;
    markBroken(m); onProgress?.(0);
  }
  if (!chunks.length) return { blob: await snipBlob(job, job.poster), kind: 'image', ext: 'png' };
  const type = used.split(';')[0];
  return { blob: new Blob(chunks, { type }), kind: 'video', ext: type === 'video/mp4' ? 'mp4' : 'webm' };
}

/** one frame of it, as a picture */
export async function snipBlob(job: ClipJob, ms: number): Promise<Blob> {
  await job.prepare();
  const cv = document.createElement('canvas'); cv.width = job.w; cv.height = job.h;
  job.draw(cv.getContext('2d', { willReadFrequently: true })!, Math.max(0, Math.min(job.total, ms)));
  return new Promise<Blob>((r) => cv.toBlob((b) => r(b!), 'image/png'));
}

/** save a file: the phone's share sheet in the app (Save Video / Save Image), a download on the web */
export async function saveFile(file: File, text?: string) {
  if (isNative()) {
    try { await navigator.share({ files: [file], text, title: file.name }); } catch { /* cancelled */ }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast.success(file.type.startsWith('image') ? 'Picture saved' : 'Clip saved');
}
export async function shareFile(file: File, text: string, title: string) {
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, title }); return; }
  } catch { return; /* cancelled */ }
  await saveFile(file, text);
}

// (tests: make a clip directly)
export let lastDebug: Record<string, unknown> = {};
if (config.e2e || import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__landvasClip = async (tr: Trace) => { const r = await encode(rollJob(tr)); return { kind: r.kind, type: r.blob.type, size: r.blob.size, debug: lastDebug }; };
  w.__landvasClipDebug = () => lastDebug;
}

// ---- the buttons and the sheet ----------------------------------------------------------------------------------------
/** the "Clip it" button on a roll: replays the roll you just saw */
export function ClipButton({ trace, luck }: { trace: () => Trace; luck?: number | null }) {
  const [job, setJob] = useState<ClipJob | null>(null);
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setJob(rollJob(trace(), luck)); buzz('light'); }} onPointerDown={(e) => e.stopPropagation()} data-testid="roll-clip"
        className="lv-clip-btn relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-2xl px-4 font-display text-[15px] font-black text-white">
        🎬 Clip it
      </button>
      {job && <ClipSheet job={job} onClose={() => setJob(null)} />}
    </>
  );
}

/** open the clip sheet from anywhere (a toast's button, a scene) */
let host: Root | null = null;
export function openClip(job: ClipJob, startWith?: 'video' | 'snip') {
  if (!host) { const el = document.createElement('div'); el.dataset.clipHost = ''; document.body.appendChild(el); host = createRoot(el); }
  const r = host;
  r.render(<ClipSheet key={Date.now()} job={job} startWith={startWith} onClose={() => r.render(null)} />);
}

/** cut a clip of anything (a roll, a moment) and share it, save it, or snip a frame */
export function ClipSheet({ job, onClose, startWith }: { job: ClipJob; onClose(): void; startWith?: 'video' | 'snip' }) {
  return createPortal(<Sheet job={job} onClose={onClose} startWith={startWith} />, document.body);
}

/** how many clip sheets are open (the live roll underneath rests meanwhile) */
export const clipping = { open: 0 };

function Sheet({ job, onClose, startWith = 'video' }: { job: ClipJob; onClose(): void; startWith?: 'video' | 'snip' }) {
  const [prog, setProg] = useState(0);
  useEffect(() => { clipping.open++; return () => { clipping.open--; }; }, []);
  const [out, setOut] = useState<{ url: string; file: File; kind: 'video' | 'image' } | null>(null);
  const [snip, setSnip] = useState<number | null>(startWith === 'snip' ? job.poster : null);
  const vid = useRef<HTMLVideoElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || startWith === 'snip') return;
    started.current = true;
    void encode(job, setProg).then(({ blob, kind, ext }) => {
      setOut({ url: URL.createObjectURL(blob), file: new File([blob], `${job.name}.${ext}`, { type: blob.type }), kind });
      buzz('success');
    }).catch(() => { toast.error('Couldn’t make the clip on this device'); onClose(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  const openSnip = () => {
    const v = vid.current;
    const at = v && out?.kind === 'video' && v.currentTime > 0.05 ? v.currentTime * 1000 : job.poster;
    v?.pause();
    setSnip(Math.min(job.total, at));
    buzz('light');
  };
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[260] grid place-items-center bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && (out || snip != null)) onClose(); }} data-testid="clip-sheet">
        {snip != null ? (
          <SnipEditor job={job} at={snip} onAt={setSnip} onBack={startWith === 'snip' ? onClose : () => { setSnip(null); void vid.current?.play(); }} backLabel={startWith === 'snip' ? 'Close' : '← Back to the clip'} />
        ) : (
          <motion.div className="grid w-full max-w-[340px] justify-items-center gap-3" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}>
            <div className="relative aspect-[9/16] w-full max-h-[64vh] overflow-hidden rounded-3xl bg-[#05040F] shadow-[0_0_60px_var(--c)]" style={{ ['--c' as string]: `${job.color}88` }}>
              {out ? (out.kind === 'video'
                ? <video ref={vid} src={out.url} className="h-full w-full object-cover" autoPlay loop muted playsInline data-testid="clip-video" onClick={(e) => { const v = e.currentTarget; if (v.paused) void v.play(); else v.pause(); }} />
                : <img src={out.url} className="h-full w-full object-cover" alt="" data-testid="clip-image" />)
                : (
                  <div className="grid h-full place-items-center p-6 text-center">
                    <div className="grid gap-3">
                      <div className="text-5xl">🎬</div>
                      <div className="font-display text-lg font-black text-white">Cutting your clip…</div>
                      <div className="text-[12px] font-semibold text-white/55">Replaying it frame by frame</div>
                      <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(prog * 100)}%`, background: `linear-gradient(90deg, ${job.color}, ${job.glow})` }} /></div>
                    </div>
                  </div>
                )}
            </div>
            {out?.kind === 'video' && <div className="text-[11px] font-semibold text-white/50">Tap the video to pause · 📸 Snip saves the frame</div>}
            <div className="grid w-full grid-cols-3 gap-2">
              <button disabled={!out} onClick={() => out && void shareFile(out.file, job.text, job.title)} className="h-12 rounded-2xl font-display font-black text-white disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${job.color}, ${job.glow})` }} data-testid="clip-share">Share</button>
              <button disabled={!out} onClick={() => out && void saveFile(out.file, job.text)} className="h-12 rounded-2xl bg-white/10 font-bold text-white disabled:opacity-40" data-testid="clip-save">Save</button>
              <button onClick={openSnip} className="h-12 rounded-2xl bg-white/10 font-bold text-white" data-testid="clip-snip">📸 Snip</button>
            </div>
            <button onClick={onClose} className="text-sm font-bold text-white/60">Close</button>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/** pick any frame (scrub), see it sharp, save it as a picture */
function SnipEditor({ job, at, onAt, onBack, backLabel }: { job: ClipJob; at: number; onAt(ms: number): void; onBack(): void; backLabel: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { void job.prepare().then(() => setReady(true)); }, [job]);
  useEffect(() => {
    if (!ready || !cv.current) return;
    const raf = requestAnimationFrame(() => job.draw(cv.current!.getContext('2d')!, at));
    return () => cancelAnimationFrame(raf);
  }, [ready, at, job]);
  const file = async () => new File([await snipBlob(job, at)], `${job.name}-snip.png`, { type: 'image/png' });
  return (
    <motion.div className="grid w-full max-w-[340px] justify-items-center gap-3" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} data-testid="clip-snip-editor" onClick={(e) => e.stopPropagation()}>
      <div className="relative aspect-[9/16] w-full max-h-[60vh] overflow-hidden rounded-3xl bg-[#05040F] shadow-[0_0_60px_var(--c)]" style={{ ['--c' as string]: `${job.color}88` }}>
        <canvas ref={cv} width={job.w} height={job.h} className="h-full w-full object-cover" data-testid="clip-snip-canvas" />
        {!ready && <div className="absolute inset-0 grid place-items-center text-white/70">…</div>}
      </div>
      <div className="grid w-full gap-1">
        <input type="range" min={0} max={Math.round(job.total)} step={33} value={Math.round(at)} onChange={(e) => onAt(Number(e.target.value))} className="w-full accent-[#FFE14D]" aria-label="Choose the frame" data-testid="clip-snip-scrub" />
        <div className="flex justify-between text-[11px] font-bold text-white/50"><span>Slide to pick the frame</span><button className="text-[#FFE14D]" onClick={() => onAt(job.poster)}>★ Best moment</button></div>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        <button onClick={async () => void shareFile(await file(), job.text, job.title)} className="h-12 rounded-2xl font-display font-black text-white" style={{ background: `linear-gradient(135deg, ${job.color}, ${job.glow})` }} data-testid="snip-share">Share picture</button>
        <button onClick={async () => void saveFile(await file(), job.text)} className="h-12 rounded-2xl bg-white/10 font-bold text-white" data-testid="snip-save">Save picture</button>
      </div>
      <button onClick={onBack} className="text-sm font-bold text-white/60">{backLabel}</button>
    </motion.div>
  );
}
