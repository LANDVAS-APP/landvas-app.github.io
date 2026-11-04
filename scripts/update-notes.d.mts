export type Commit = { sha: string; subject: string; notes: string[]; date?: string };
export function parseLog(raw: string): Commit[];
export function bullets(body: string): string[];
export function summarize(commits: Commit[], maxBullets?: number): { title: string; body: string; notes: string[] } | null;
export function aiPrompt(commits: Commit[]): string;
export function sqlJson(obj: unknown): string;
export type RichContent = { theme: string; emoji: string; subtitle: string; features: { emoji: string; title?: string; text: string }[]; cta: string | null };
export function richContent(commit: Commit): RichContent;
export function draftsFor(commits: Commit[]): { sha: string; title: string; body: string; notes: string[]; content: RichContent; link: string | null; built_at: string | null }[];
