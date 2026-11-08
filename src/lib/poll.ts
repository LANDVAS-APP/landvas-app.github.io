import { config } from '../env';

/**
 * Background refresh interval. On the temporary (free-tier) server everything
 * refreshes a third as often to save database load and bandwidth.
 */
export const poll = (ms: number) => (config.tempServer ? ms * 3 : ms);
/** A live check (chat lists, a match's backup check): half as often on the temporary server. */
export const live = (ms: number) => (config.tempServer ? ms * 2 : ms);
/** How long fetched data counts as fresh before a screen re-reads it. */
export const fresh = config.tempServer ? 60_000 : 10_000;
