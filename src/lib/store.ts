// Client UI state (not game state — game state always comes from the server).
import { create } from 'zustand';
import { config } from '../env';
import { safeStorage, saveStorage } from './utils';

export type MapMode = 'atlas' | 'canvas' | 'discovery' | 'land';
export type Theme = 'dark' | 'light' | 'system';
export type Settings = { theme: Theme; crispPixels: boolean; globe: boolean; reduceMotion: boolean; showGrid: boolean; haptics: boolean };

type View = { lng: number; lat: number; zoom: number };

type UiState = {
  mode: MapMode;
  selected: { gx: number; gy: number } | null;
  view: View;
  bbox: { min_gx: number; min_gy: number; max_gx: number; max_gy: number } | null;
  settings: Settings;
  flyTo: (View & { at: number }) | null;
  setMode(m: MapMode): void;
  select(c: { gx: number; gy: number } | null): void;
  setView(v: View, bbox: UiState['bbox']): void;
  requestFly(v: View): void;
  updateSettings(p: Partial<Settings>): void;
};

const defaultSettings: Settings = {
  theme: config.defaultTheme,
  crispPixels: false,
  globe: true,
  reduceMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  showGrid: true,
  haptics: true,
};

export const useUi = create<UiState>((set, get) => ({
  mode: safeStorage<MapMode>('landvas.mode', 'atlas'),
  selected: null,
  view: safeStorage<View>('landvas.view', { lng: -20, lat: 25, zoom: 1.6 }),
  bbox: null,
  settings: { ...defaultSettings, ...safeStorage<Partial<Settings>>('landvas.settings', {}) },
  flyTo: null,
  setMode: (mode) => {
    saveStorage('landvas.mode', mode);
    set({ mode });
  },
  select: (selected) => set({ selected }),
  setView: (view, bbox) => {
    saveStorage('landvas.view', view);
    set({ view, bbox });
  },
  requestFly: (v) => set({ flyTo: { ...v, at: Date.now() } }),
  updateSettings: (p) => {
    const settings = { ...get().settings, ...p };
    saveStorage('landvas.settings', settings);
    set({ settings });
    applyTheme(settings.theme);
  },
}));

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function effectiveDark(theme: Theme) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr) return attr === 'dark';
  return !matchMedia('(prefers-color-scheme: light)').matches;
}
