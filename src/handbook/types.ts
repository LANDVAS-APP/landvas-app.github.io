import type { ReactNode } from 'react';
import type { Ctx } from './live';

export type Topic = {
  id: string;
  emoji: string;
  title: string;
  /** one line: what it is, shown under the title and in search */
  summary: string;
  /** extra words people might search for */
  keys?: string;
  /** shown only on the website (cash-out, the player portal…) */
  webOnly?: boolean;
  body(c: Ctx): ReactNode;
};

export type Chapter = {
  id: string;
  emoji: string;
  title: string;
  /** a short line for the chapter card */
  blurb: string;
  color: string;
  topics: Topic[];
};
