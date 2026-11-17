import { describe, expect, it } from 'vitest';
import { createCloseGround } from '../../src/eyes/closeGround';

// a stand-in for the renderer: the squares are "copied" by remembering nothing at all
const fakeRenderer = () => ({
  getContext: () => ({ TEXTURE_2D: 1, generateMipmap: () => {} }),
  copyTextureToTexture: () => {},
  properties: { get: () => ({ __webglTexture: {} }) },
  state: { bindTexture: () => {}, unbindTexture: () => {} },
  capabilities: { getMaxAnisotropy: () => 4 },
}) as never;
const img = { width: 192, height: 192 } as never;

describe('the sharpest ground, a square at a time', () => {
  const make = () => {
    const g = createCloseGround(fakeRenderer(), { px: 1536, metres: 150, tiles: 8 });
    const painted: string[] = [];
    g.setPainter((r) => { painted.push(`${r.x0},${r.z0}`); return img; });
    return { g, painted };
  };
  it('paints the window round you, nearest first, and shows it all', () => {
    const { g, painted } = make();
    for (let k = 0; k < 10; k++) g.update(3, 3, 1000);
    expect(g.state().painted).toBe(64);
    expect(painted[0]).toBe('0,0');
    expect(g.state().shown).toEqual([-75, -75, 75, 75]);
  });
  it('walking on paints only the new row, and keeps showing the rest', () => {
    const { g, painted } = make();
    for (let k = 0; k < 10; k++) g.update(3, 3, 1000);
    const before = painted.length;
    g.update(3 + 18.75, 3, 1000);
    expect(painted.length - before).toBe(8);
    expect(g.state().shown).toEqual([-56, -75, 94, 75]);
  });
  it('the world\'s origin moving by whole spans keeps every square (nothing painted again)', () => {
    const { g, painted } = make();
    for (let k = 0; k < 10; k++) g.update(3, 3, 1000);
    const before = painted.length;
    g.shift(450, 0);
    g.update(3 - 450, 3, 1000);
    expect(painted.length).toBe(before);
    expect(g.state().shown).toEqual([-525, -75, -375, 75]);
    // and a keep-painter swap doesn't forget them either
    g.setPainter((r) => { painted.push(`${r.x0},${r.z0}`); return img; }, true);
    g.update(3 - 450, 3, 1000);
    expect(painted.length).toBe(before);
    expect(g.state().shown).toEqual([-525, -75, -375, 75]);
  });
  it('a painter that answers later (a worker) still fills the window', async () => {
    const g = createCloseGround(fakeRenderer(), { px: 1536, metres: 150, tiles: 8 });
    g.setPainter(() => Promise.resolve(img));
    for (let k = 0; k < 40; k++) { g.update(0, 0, 1000); await Promise.resolve(); await Promise.resolve(); }
    expect(g.state().painted).toBe(64);
    g.update(0, 0, 1000);
    expect(g.state().shown).toEqual([-75, -75, 75, 75]);
  });
});
