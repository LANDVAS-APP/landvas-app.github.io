import { config } from '../env';

/**
 * Background refresh interval. On the temporary (free-tier) server everything
 * refreshes half as often to save database load and bandwidth.
 */
export const poll = (ms: number) => (config.tempServer ? ms * 2 : ms);
