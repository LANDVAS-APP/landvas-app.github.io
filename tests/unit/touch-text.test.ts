import { describe, expect, it } from 'vitest';
import { touchText } from '../../src/lib/touchText';

describe('touchText: instructions on a touch screen leave the keyboard out', () => {
  const cases: [string, string][] = [
    ['Drag (or hold A/D, ←/→) to steer. Gems are 1.', 'Drag to steer. Gems are 1.'],
    ['Hold and drag to lead your Inkborn (or use the arrow keys). Red berries 1', 'Hold and drag to lead your Inkborn. Red berries 1'],
    ['Tap beside your Inkborn to hop that way (or use the arrow keys / WASD). Each', 'Tap beside your Inkborn to hop that way. Each'],
    ['Hold the screen (or ↑ / W / Space) to fire; touch left or right (or ←/→) to drift.', 'Hold the screen to fire; touch left or right to drift.'],
    ['Hold anywhere (or ↑ / space) to float up', 'Hold anywhere to float up'],
    ['steer with drag or A/D, ←/→ and climb', 'steer with drag and climb'],
    ['Drag (or WASD/arrows) to lead your Inkborn', 'Drag to lead your Inkborn'],
  ];
  for (const [from, to] of cases) it(from, () => expect(touchText(from, true)).toBe(to));
  it('keeps other brackets', () => expect(touchText('Tap a plot (or a friend) to open it', true)).toBe('Tap a plot (or a friend) to open it'));
  it('leaves computers alone', () => expect(touchText(cases[0][0], false)).toBe(cases[0][0]));
});
