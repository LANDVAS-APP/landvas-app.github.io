// Integrity signals: a random id for this install, a fingerprint of the browser/device (hashed — none of the raw values
// leave as an identity), and checks for emulators and browser automation. Sent once a session and every half hour, so the
// cheat scanner can spot one person running many accounts, scripts or emulators. No location, no contacts, nothing else.
import { useEffect } from 'react';
import { api } from '../backend/api';

const KEY = 'landvas.device';
function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch { return null; }
}

function gpu(): string {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 120);
  } catch { return ''; }
}

function canvasPrint(): string {
  try {
    const c = document.createElement('canvas'); c.width = 220; c.height = 30;
    const x = c.getContext('2d'); if (!x) return '';
    x.textBaseline = 'top'; x.font = "14px 'Arial'"; x.fillStyle = '#f60'; x.fillRect(100, 1, 62, 20);
    x.fillStyle = '#069'; x.fillText('LANDVAS ✨ 🖌️ integrity', 2, 15); x.fillStyle = 'rgba(102,204,0,0.7)'; x.fillText('LANDVAS ✨ 🖌️ integrity', 4, 17);
    return c.toDataURL().slice(-120);
  } catch { return ''; }
}

async function sha(s: string) {
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  } catch { return null; }
}

/** emulator and automation checks: what tripped, if anything */
export function environmentChecks(ua = navigator.userAgent, renderer = gpu()) {
  const reasons: string[] = [];
  let emulator = false, automation = false;
  const nav = navigator as Navigator & { webdriver?: boolean };
  const w = window as unknown as Record<string, unknown>;
  if (nav.webdriver) { automation = true; reasons.push('navigator.webdriver'); }
  if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium/i.test(ua)) { automation = true; reasons.push('ua:headless'); }
  if (w.callPhantom || w._phantom || w.__nightmare || w.domAutomation || w.domAutomationController) { automation = true; reasons.push('automation-global'); }
  try { if (Object.keys(document).some((k) => /^\$?cdc_|^\$wdc_/.test(k))) { automation = true; reasons.push('chromedriver'); } } catch { /* ignore */ }
  if (/sdk_gphone|Android SDK built for|google_sdk|Emulator|generic_x86|vbox86|Genymotion|BlueStacks|Nox|LDPlayer|MEmu/i.test(ua)) { emulator = true; reasons.push('ua:emulator'); }
  if (/SwiftShader|llvmpipe|Android Emulator|VirtualBox|VMware|Parallels|Bluestacks|Mesa OffScreen/i.test(renderer)) { emulator = true; reasons.push(`gpu:${renderer.slice(0, 40)}`); }
  // a phone browser that has no touch at all is usually a desktop pretending (or an emulator)
  if (/Android|iPhone|iPad/i.test(ua) && (navigator.maxTouchPoints ?? 0) === 0) { emulator = true; reasons.push('mobile-ua-no-touch'); }
  return { emulator, automation, reasons };
}

export async function collectSignals() {
  const renderer = gpu();
  const env = environmentChecks(navigator.userAgent, renderer);
  const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ?? 'web';
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
  const nav = navigator as Navigator & { deviceMemory?: number };
  const fpParts = [navigator.userAgent, navigator.language, (navigator.languages ?? []).join(','), tz, screen.width, screen.height, screen.colorDepth, window.devicePixelRatio,
    navigator.hardwareConcurrency ?? '', nav.deviceMemory ?? '', navigator.maxTouchPoints ?? '', renderer, canvasPrint(), platform];
  return {
    device_id: deviceId(), fp: await sha(fpParts.join('|')), platform, tz, lang: navigator.language,
    ua: navigator.userAgent.slice(0, 300), gpu: renderer, ...env,
  };
}

// per account, so switching accounts on one device reports each of them (that's exactly what multi-accounting looks like)
const last = new Map<string, number>();
async function ping(account: string) {
  if (Date.now() - (last.get(account) ?? 0) < 25 * 60_000) return;
  last.set(account, Date.now());
  try { await api.integrityPing(await collectSignals()); } catch { /* best effort */ }
}

/** report this session while signed in: now, then every half hour */
export function useIntegrityPing(account: string | null | undefined) {
  useEffect(() => {
    if (!account) return;
    void ping(account);
    const t = setInterval(() => void ping(account), 30 * 60_000);
    return () => clearInterval(t);
  }, [account]);
}
