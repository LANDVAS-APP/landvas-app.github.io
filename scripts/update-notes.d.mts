export type Commit = { sha: string; subject: string; notes: string[] };
export function parseLog(raw: string): Commit[];
export function bullets(body: string): string[];
export function summarize(commits: Commit[], maxBullets?: number): { title: string; body: string; notes: string[] } | null;
export function aiPrompt(commits: Commit[]): string;
export function sqlJson(obj: unknown): string;
