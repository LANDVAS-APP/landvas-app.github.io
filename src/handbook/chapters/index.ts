import type { Chapter } from '../types';
import { start } from './start';
import { world } from './world';
import { roll } from './roll';
import { rent } from './rent';
import { ink } from './ink';
import { luck } from './luck';
import { places } from './places';
import { inkborn } from './inkborn';
import { space } from './space';
import { enchant } from './enchant';
import { ultra } from './ultra';
import { social } from './social';
import { progress } from './progress';
import { strategy } from './strategy';
import { faq } from './faq';

/** the Handbook, in reading order */
export const CHAPTERS: Chapter[] = [start, world, roll, rent, ink, luck, places, inkborn, space, enchant, ultra, social, progress, strategy, faq];
