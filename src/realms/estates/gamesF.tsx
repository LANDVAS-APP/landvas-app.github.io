// Estate stand games, part 2 — the City Exchange, the Neon Boardwalk and the Gemheart Caverns.
//   🪙 Coin Counter      give exact change, fast
//   🔨 Going, Going…     bid at the auction — win it for less than it's worth
//   💼 Briefcase Shuffle follow the case with the cash
//   📝 Contract Rush     sign the good deals, shred the bad ones
//   🦀 Whack-a-Crab      bop the crabs, never the starfish
//   🔔 High Striker      swing on the needle's peak to ring the bell
//   🔫 Water Gun Race    keep your stream on the target to win the race
//   🎈 Balloon Darts     throw darts in an arc at drifting balloons
//   💎 Gem Swap          swap neighbours to make rows of three
//   🛤️ Rail Switch       flip the points so every cart reaches its own colour
//   🪨 Geode Crack       strike when the ring closes on the weak spot
//   🔦 Lamp in the Dark  sweep your lamp through the cave to find the gems
import { rng } from '../../home/party/kit';
import { sfx } from '../../arcade/sfx';
import { emoji, useGame, type GameProps, type Ptr } from '../games';
import { INTRO, TOP, burst, button, clamp, hearts, hud, inBox, intro, pops, sparks, type Pop, type Spark } from './kit';

const msgDraw = (g: CanvasRenderingContext2D, w: number, y: number, msg: string, t: number, c = '#FFE14D') => { if (t <= 0) return; g.globalAlpha = Math.min(1, t); g.fillStyle = c; g.font = '900 22px ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeText(msg, w / 2, y); g.fillText(msg, w / 2, y); g.globalAlpha = 1; };

// ======================================================================================================================
// 🪙 Coin Counter
// ======================================================================================================================
const COINS = [100, 50, 25, 10, 5, 1];
export function CoinCounter({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 50, owe = 0, given: number[] = [], served = 0, custT = 0, msg = '', msgT = 0, streak = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => { const price = 1 + Math.floor(r() * (60 + served * 15)), paid = [100, 200, 500][Math.min(2, Math.floor(served / 4))]; owe = Math.max(1, paid - price) % 500 || 37; given = []; custT = 0; };
    deal();
    const sum = () => given.reduce((a, b) => a + b, 0);
    const btns = () => COINS.map((c, i) => { const bw = (W - 40) / 3; return { c, x: 15 + (i % 3) * (bw + 5), y: H - 210 + Math.floor(i / 3) * 74, w: bw, h: 66 }; });
    const ctrl = () => ({ undo: { x: 15, y: H - 60, w: (W - 40) / 2, h: 46 }, give: { x: 25 + (W - 40) / 2, y: H - 60, w: (W - 40) / 2, h: 46 } });
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; custT += dt; msgT -= dt; return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#1E2A38'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2A3A4A'; g.beginPath(); g.roundRect(20, TOP + 10, w - 40, 150, 18); g.fill();
        emoji(g, ['🧑‍💼', '👩‍💼', '🧔', '👵', '🧑‍🎨'][served % 5], 70, TOP + 85, 56);
        g.fillStyle = '#fff'; g.font = '800 15px ui-rounded'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('Change, please!', 120, TOP + 55);
        g.font = '900 34px ui-rounded'; g.fillStyle = '#FFE14D'; g.fillText(`¢${owe}`, 120, TOP + 95);
        g.fillStyle = custT > 8 ? '#FF5A5F' : '#3DDC97'; g.fillRect(120, TOP + 130, Math.max(0, (w - 160) * (1 - custT / 12)), 6);
        // the tray
        g.fillStyle = '#0E1620'; g.beginPath(); g.roundRect(20, TOP + 180, w - 40, 120, 14); g.fill();
        given.forEach((c, i) => { const x = 50 + (i % 9) * ((w - 90) / 9), y = TOP + 215 + Math.floor(i / 9) * 46; g.fillStyle = c >= 25 ? '#D0D4DC' : c >= 5 ? '#E0C35A' : '#C87A4A'; g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill(); g.fillStyle = '#333'; g.font = '900 11px ui-rounded'; g.textAlign = 'center'; g.fillText(`${c}`, x, y); });
        g.fillStyle = sum() === owe ? '#3DDC97' : sum() > owe ? '#FF5A5F' : '#fff'; g.font = '900 18px ui-rounded'; g.textAlign = 'right'; g.fillText(`¢${sum()} / ¢${owe}`, w - 34, TOP + 290);
        btns().forEach((b) => button(g, b.x, b.y, b.w, b.h, b.c >= 25 ? '#8A93A6' : b.c >= 5 ? '#B8963A' : '#A0603A', `¢${b.c}`, { font: '900 20px ui-rounded' }));
        const C = ctrl(); button(g, C.undo.x, C.undo.y, C.undo.w, C.undo.h, '#ffffff22', '↶ take back'); button(g, C.give.x, C.give.y, C.give.w, C.give.h, sum() === owe ? '#3DDC97' : '#555', 'HAND OVER');
        msgDraw(g, w, TOP + 330, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#3DDC97', streak > 1 ? `🔥 ${streak}` : `🧾 ${served}`);
        intro(g, w, h, t, ['Coin Counter', 'Tap coins to make the exact change,', 'then HAND OVER. Fewer coins + faster', '= bigger tip!']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const b = btns().find((x) => inBox(p, x)); if (b) { if (given.length < 18) { given.push(b.c); sfx.coin(); } return; }
        const C = ctrl();
        if (inBox(p, C.undo)) { given.pop(); sfx.tick(); return; }
        if (inBox(p, C.give)) {
          if (sum() === owe) {
            // the fewest coins it could be done in
            let rest = owe, best = 0; for (const c of COINS) { best += Math.floor(rest / c); rest %= c; }
            served++; streak++; const tidy = given.length <= best ? 15 : 0, quick = Math.max(0, Math.round(20 - custT * 2)), pts = 12 + tidy + quick + Math.floor(level / 2) * 2;
            score += pts; msg = tidy ? `Neat change! +${pts}` : `+${pts}`; msgT = 1; sfx.tickets?.(6); burst(sp, W / 2, TOP + 240, ['#E0C35A', '#D0D4DC'], 16, 200); deal();
          } else { streak = 0; score = Math.max(0, score - 5); msg = sum() > owe ? 'Too much!' : 'Not enough!'; msgT = 0.9; sfx.bonk(); }
        }
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔨 Going, Going…
// ======================================================================================================================
const LOTS = [{ e: '🏺', n: 'Old vase' }, { e: '🖼️', n: 'Lost painting' }, { e: '⌚', n: 'Gold watch' }, { e: '🎻', n: 'Violin' }, { e: '💍', n: 'Diamond ring' }, { e: '🚗', n: 'Classic car' }, { e: '🗿', n: 'Stone head' }, { e: '📜', n: 'Treasure map' }];
export function GoingGoing({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 55, lot = LOTS[0], worth = 0, lo = 0, hi = 0, price = 0, leader: 'you' | 'rival' = 'rival', clock = 0, phase: 'bid' | 'sold' = 'bid', soldT = 0, msg = '', msgT = 0, rivalCap = 0, won = 0, step = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => { lot = LOTS[Math.floor(r() * LOTS.length)]; worth = Math.round((40 + r() * 160) / 5) * 5; lo = Math.round(worth * (0.7 + r() * 0.15)); hi = Math.round(worth * (1.1 + r() * 0.2)); price = Math.round(worth * 0.3 / 5) * 5; step = 5; leader = 'rival'; clock = 2.2; phase = 'bid'; rivalCap = Math.round(worth * (0.75 + r() * 0.5)); };
    deal();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (phase === 'bid') {
          clock -= dt;
          // the rival keeps bidding while it's under what they'll pay
          if (leader === 'you' && price + step <= rivalCap && clock < 1.6 + r() * 0.6) { price += step; leader = 'rival'; clock = 2.2; sfx.tick(); }
          if (clock <= 0) {
            phase = 'sold'; soldT = 1.6;
            if (leader === 'you') { const gain = worth - price; won++; score += Math.max(0, gain) + 10 + Math.floor(level / 2) * 2; msg = gain >= 0 ? `Yours! Worth ${worth} → +${gain + 10}` : `Overpaid by ${-gain}…`; if (gain < 0) score = Math.max(0, score + gain); sfx[gain >= 0 ? 'jackpot' : 'fail'](); if (gain > 0) burst(sp, W / 2, H * 0.35, ['#FFE14D', '#3DDC97'], 24, 240); }
            else { msg = price < worth ? `The rival got a bargain (worth ${worth})` : `Good pass — it was only worth ${worth}`; if (price >= worth) score += 8; sfx.thud(); }
            msgT = 1.6;
          }
        } else { soldT -= dt; if (soldT <= 0) deal(); }
        return time <= 0 && phase === 'sold' && soldT <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#3A1E28'; g.fillRect(0, 0, w, h); g.fillStyle = '#5A2E3A'; for (let i = 0; i < 6; i++) g.fillRect(i * (w / 6), 0, w / 12, h);
        g.fillStyle = '#C9A64A'; g.fillRect(w / 2 - 90, TOP + 210, 180, 14);
        emoji(g, lot.e, w / 2, TOP + 140, 96);
        g.fillStyle = '#fff'; g.font = '900 20px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lot.n, w / 2, TOP + 40);
        g.font = '700 14px ui-rounded'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(`Expert says: worth ${lo} – ${hi}`, w / 2, TOP + 64);
        g.font = '900 44px ui-rounded'; g.fillStyle = leader === 'you' ? '#3DDC97' : '#FF8A8A'; g.fillText(`${price}`, w / 2, TOP + 270);
        g.font = '800 14px ui-rounded'; g.fillStyle = '#fff'; g.fillText(phase === 'bid' ? (leader === 'you' ? 'You’re winning…' : 'The rival 🎩 leads') : 'SOLD!', w / 2, TOP + 305);
        if (phase === 'bid') { const c = clamp(clock / 2.2, 0, 1); g.fillStyle = clock < 0.8 ? '#FF5A5F' : '#FFE14D'; g.fillRect(w / 2 - 100, TOP + 325, 200 * c, 8); g.fillStyle = '#fff'; g.font = '800 12px ui-rounded'; g.fillText(clock < 0.8 ? 'going… going…' : '', w / 2, TOP + 348); }
        emoji(g, '🎩', 50, TOP + 270, 42);
        button(g, 30, h - 110, w - 60, 70, phase === 'bid' && leader !== 'you' ? '#C9A64A' : '#555', phase === 'bid' ? (leader === 'you' ? 'you lead — wait…' : `🔨 BID ${price + step}`) : '…', { font: '900 22px ui-rounded' });
        msgDraw(g, w, TOP + 380, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#C9A64A', won ? `🏆 ${won}` : '');
        intro(g, w, h, t, ['Going, Going…', 'Tap BID to outbid the rival.', 'Win each lot for LESS than it’s worth —', 'if the price passes its worth, let it go!']);
      },
      down(p: Ptr) { if (phase !== 'bid' || leader === 'you' || time <= 0 || p.y < H - 120) return; price += step; leader = 'you'; clock = 2.2; sfx.coin(); },
      key(k, d) { if (d && (k === ' ' || k === 'Enter')) this.down?.({ x: W / 2, y: H - 70, id: 0 }, W, H); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 💼 Briefcase Shuffle
// ======================================================================================================================
export function BriefcaseShuffle({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 55, n = 3, pos: number[] = [], cash = 0, phase: 'show' | 'shuffle' | 'pick' | 'reveal' = 'show', T = 0, swaps: [number, number][] = [], si = 0, swapT = 0, round = 0, picked = -1, msg = '', msgT = 0, streak = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const slotX = (s: number) => W / 2 + (s - (n - 1) / 2) * Math.min(110, (W - 40) / n);
    const Y = () => TOP + (H - TOP) * 0.45;
    const deal = () => { round++; n = Math.min(5, 3 + Math.floor(round / 3)); pos = Array.from({ length: n }, (_, i) => i); cash = Math.floor(r() * n); phase = 'show'; T = 0; picked = -1; const k = 4 + round * 2; swaps = Array.from({ length: Math.min(18, k) }, () => { const a = Math.floor(r() * n); let b = Math.floor(r() * (n - 1)); if (b >= a) b++; return [a, b] as [number, number]; }); si = 0; swapT = 0; };
    deal();
    const speed = () => Math.max(0.16, 0.42 - round * 0.025);
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; T += dt;
        if (phase === 'show' && T > 1.4) { phase = 'shuffle'; swapT = 0; }
        if (phase === 'shuffle') { swapT += dt; if (swapT >= speed()) { const [a, b] = swaps[si]; const ia = pos.indexOf(a), ib = pos.indexOf(b); [pos[ia], pos[ib]] = [pos[ib], pos[ia]]; si++; swapT = 0; sfx.swish(); if (si >= swaps.length) phase = 'pick'; } }
        if (phase === 'reveal' && T > 1.3) deal();
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#1E2A38'; g.fillRect(0, 0, w, h); g.fillStyle = '#5A3A20'; g.fillRect(0, Y() + 40, w, 30);
        for (let c = 0; c < n; c++) {
          let x = slotX(pos[c]), y = Y();
          if (phase === 'shuffle' && si < swaps.length) { const [a, b] = swaps[si], k = swapT / speed(); if (pos[c] === a || pos[c] === b) { const from = slotX(pos[c]), to = slotX(pos[c] === a ? b : a); x = from + (to - from) * k; y += Math.sin(k * Math.PI) * (pos[c] === a ? -40 : 40); } }
          const open = phase === 'show' || (phase === 'reveal' && (c === cash || c === picked));
          g.fillStyle = '#6B4A2A'; g.beginPath(); g.roundRect(x - 40, y - 26, 80, 56, 8); g.fill(); g.fillStyle = '#C9A64A'; g.fillRect(x - 10, y - 34, 20, 8); g.fillRect(x - 3, y - 2, 6, 10);
          if (open) emoji(g, c === cash ? '💵' : '📄', x, y - 46, 30);
        }
        g.fillStyle = '#fff'; g.font = '800 16px ui-rounded'; g.textAlign = 'center'; g.fillText(phase === 'show' ? 'Watch the cash…' : phase === 'shuffle' ? 'Shuffling!' : phase === 'pick' ? 'Which case has the cash?' : '', w / 2, TOP + 40);
        msgDraw(g, w, h - 80, msg, msgT);
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#3DDC97', streak > 1 ? `🔥 ${streak}` : `💼 ${n}`);
        intro(g, w, h, t, ['Briefcase Shuffle', 'The cash goes in one case,', 'then they’re shuffled. Keep your eye on it', 'and tap the right case!']);
      },
      down(p: Ptr) {
        if (phase !== 'pick' || time <= 0) return;
        let best = -1, bd = 60; for (let c = 0; c < n; c++) { const d = Math.hypot(slotX(pos[c]) - p.x, Y() - p.y); if (d < bd) { bd = d; best = c; } }
        if (best < 0) return;
        picked = best; phase = 'reveal'; T = 0;
        if (best === cash) { streak++; const pts = 20 + n * 10 + swaps.length * 2 + streak * 5 + Math.floor(level / 2) * 2; score += pts; msg = `Cash! +${pts}`; sfx.jackpot(); burst(sp, slotX(pos[best]), Y(), ['#3DDC97', '#FFE14D'], 24, 240); }
        else { streak = 0; msg = 'Just paperwork…'; sfx.fail(); }
        msgT = 1.2;
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 📝 Contract Rush
// ======================================================================================================================
export function ContractRush({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, cost = 0, gain = 0, risk = false, cardT = 0, slide = 0, dir = 0, done = 0, streak = 0, msg = '', msgT = 0, busy = false;
    const pp: Pop[] = [], sp: Spark[] = [];
    const deal = () => { cost = 10 + Math.floor(r() * 90); gain = Math.max(1, cost + Math.round((r() - 0.45) * 60)); if (gain === cost) gain++; risk = done > 6 && r() < 0.25; cardT = 0; slide = 1; dir = 0; busy = false; };
    deal();
    const good = () => gain > cost && !risk;
    const judge = (sign: boolean) => {
      if (busy) return; busy = true;
      done++;
      if (sign === good()) { streak++; const pts = 6 + Math.max(0, Math.round(8 - cardT * 3)) + Math.min(12, streak) + Math.floor(level / 3); score += pts; sfx.blip(Math.min(12, streak)); pp.push({ x: W / 2, y: TOP + 80, t: `+${pts}`, life: 0.7, c: '#3DDC97' }); }
      else { streak = 0; score = Math.max(0, score - 10); time -= 2; sfx.bonk(); msg = sign ? (risk ? 'It had a ⚠️ clause!' : 'That deal lost money!') : 'That was a good deal!'; msgT = 1; }
      dir = sign ? -1 : 1;
      setTimeout(deal, 160);
    };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; cardT += dt; msgT -= dt; slide = Math.max(0, slide - dt * 6); if (cardT > 4 && !busy) { msg = 'Too slow — the deal walked'; judge(!good()); } return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#E8ECEF'; g.fillRect(0, 0, w, h);
        const cw = Math.min(w - 60, 300), ch = 260, cx = w / 2 + slide * w + dir * 0, cy = TOP + 40;
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.roundRect(cx - cw / 2 + 6, cy + 6, cw, ch, 14); g.fill();
        g.fillStyle = '#FFFDF6'; g.beginPath(); g.roundRect(cx - cw / 2, cy, cw, ch, 14); g.fill();
        g.fillStyle = '#2A3A4A'; g.font = '900 18px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CONTRACT', cx, cy + 30);
        g.font = '800 16px ui-rounded'; g.textAlign = 'left'; g.fillStyle = '#C8352C'; g.fillText(`You pay:   ${cost}`, cx - cw / 2 + 30, cy + 90); g.fillStyle = '#2A8A4A'; g.fillText(`You earn:  ${gain}`, cx - cw / 2 + 30, cy + 130);
        g.fillStyle = 'rgba(0,0,0,0.2)'; for (let i = 0; i < 4; i++) g.fillRect(cx - cw / 2 + 30, cy + 165 + i * 14, cw - 60 - i * 30, 4);
        if (risk) { g.fillStyle = '#FF8A2A'; g.font = '900 14px ui-rounded'; g.textAlign = 'center'; g.fillText('⚠️ small print: penalty clause', cx, cy + 238); }
        g.fillStyle = '#FFB13D'; g.fillRect(cx - cw / 2, cy + ch - 6, cw * Math.max(0, 1 - cardT / 4), 6);
        button(g, 20, h - 110, w / 2 - 30, 80, '#C8352C', '🗑️ SHRED'); button(g, w / 2 + 10, h - 110, w / 2 - 30, 80, '#2A8A4A', '✍️ SIGN');
        msgDraw(g, w, h - 140, msg, msgT, '#C8352C');
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#2A8A4A', streak > 2 ? `🔥 ${streak}` : `📝 ${done}`);
        intro(g, w, h, t, ['Contract Rush', 'SIGN if you earn more than you pay,', 'SHRED if you don’t — or if there’s a', '⚠️ penalty clause. Be quick!']);
      },
      down(p: Ptr) { if (time <= 0 || p.y < H - 120 || slide > 0.3) return; judge(p.x > W / 2); },
      key(k, d) { if (!d) return; if (k === 'ArrowRight') judge(true); if (k === 'ArrowLeft') judge(false); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🦀 Whack-a-Crab
// ======================================================================================================================
export function WhackACrab({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const N = 9;
    let score = 0, time = 40, combo = 0, hits = 0, spawnT = 0.5, bonk = -1, bonkT = 0;
    const holes: { up: number; life: number; kind: 'crab' | 'gold' | 'star' | null }[] = Array.from({ length: N }, () => ({ up: 0, life: 0, kind: null }));
    const pp: Pop[] = [], sp: Spark[] = [];
    const hole = (i: number) => { const cw = (W - 30) / 3, chh = (H - TOP - 120) / 3; return { x: 15 + (i % 3) * cw + cw / 2, y: TOP + 40 + Math.floor(i / 3) * chh + chh / 2, r: Math.min(cw, chh) * 0.36 }; };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; spawnT -= dt; bonkT -= dt;
        const pace = 1 + (40 - time) / 25;
        if (spawnT <= 0) { const free = holes.map((h, i) => (h.kind ? -1 : i)).filter((i) => i >= 0); if (free.length) { const i = free[Math.floor(r() * free.length)], roll = r(); holes[i] = { up: 0, life: Math.max(0.55, 1.3 - (40 - time) / 50), kind: roll < 0.12 ? 'gold' : roll < 0.3 ? 'star' : 'crab' }; } spawnT = Math.max(0.22, 0.75 - (40 - time) / 70) / pace * 1.3; }
        for (const h of holes) { if (!h.kind) continue; h.up = Math.min(1, h.up + dt * 6); h.life -= dt; if (h.life <= 0) { if (h.kind === 'crab' || h.kind === 'gold') combo = 0; h.kind = null; h.up = 0; } }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#F2D9A0'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(200,160,90,0.4)'; g.fillRect((i * 83) % w, (i * 41) % h, 3, 3); }
        holes.forEach((ho, i) => {
          const b = hole(i); g.fillStyle = '#5A3A20'; g.beginPath(); g.ellipse(b.x, b.y + b.r * 0.4, b.r, b.r * 0.4, 0, 0, Math.PI * 2); g.fill();
          if (ho.kind) { g.save(); g.beginPath(); g.rect(b.x - b.r * 1.2, b.y - b.r * 2, b.r * 2.4, b.r * 2.4); g.clip(); emoji(g, ho.kind === 'star' ? '⭐' : ho.kind === 'gold' ? '🦞' : '🦀', b.x, b.y + b.r * 0.4 - ho.up * b.r * 0.9, b.r * 1.2); g.restore(); }
          g.fillStyle = '#C9A06A'; g.beginPath(); g.ellipse(b.x, b.y + b.r * 0.55, b.r * 1.05, b.r * 0.22, 0, 0, Math.PI); g.fill();
          if (i === bonk && bonkT > 0) emoji(g, '💥', b.x, b.y - b.r * 0.3, b.r);
        });
        sparks(sp, g, 1 / 60); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF5A5F', combo > 2 ? `🔥 ×${combo}` : `🦀 ${hits}`);
        intro(g, w, h, t, ['Whack-a-Crab', 'Bop the crabs 🦀 as they pop up.', 'Lobsters 🦞 are worth triple —', 'but never bop a starfish ⭐!']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const i = holes.findIndex((_, k) => { const b = hole(k); return Math.hypot(p.x - b.x, p.y - (b.y - b.r * 0.2)) < b.r * 1.15; });
        if (i < 0) return; const ho = holes[i]; if (!ho.kind || ho.up < 0.4) return;
        bonk = i; bonkT = 0.2; const b = hole(i);
        if (ho.kind === 'star') { combo = 0; score = Math.max(0, score - 15); sfx.fail(); pp.push({ x: b.x, y: b.y - b.r, t: 'ouch! −15', life: 0.8, c: '#FF5A5F' }); }
        else { combo++; hits++; const pts = (ho.kind === 'gold' ? 15 : 5) + Math.min(10, combo) + Math.floor(level / 3); score += pts; sfx.blip(Math.min(12, combo)); burst(sp, b.x, b.y, ['#FF5A5F', '#FFE14D'], 10, 160); pp.push({ x: b.x, y: b.y - b.r, t: `+${pts}`, life: 0.6, c: '#C8352C' }); }
        ho.kind = null; ho.up = 0;
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔔 High Striker
// ======================================================================================================================
export function HighStriker({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, needle = 0, nv = 1.4, puck = 0, pv = 0, phase: 'aim' | 'fly' = 'aim', rings = 0, swings = 0, msg = '', msgT = 0, last = 0, streak = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const towerTop = () => TOP + 40, towerBot = () => H - 190;
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (phase === 'aim') { needle += nv * dt * (1 + swings * 0.06); if (needle > 1) { needle = 1; nv = -Math.abs(nv); } if (needle < 0) { needle = 0; nv = Math.abs(nv); } }
        else {
          puck += pv * dt; pv -= 2.2 * dt;
          if (puck >= 1) { puck = 1; pv = 0; }
          if (pv <= 0) {
            phase = 'aim'; swings++;
            const hgt = puck, rang = hgt >= 0.999;
            if (rang) { rings++; streak++; const pts = 40 + streak * 10 + Math.floor(level / 2) * 2; score += pts; msg = `DING! +${pts}`; sfx.jackpot(); burst(sp, W / 2, towerTop(), ['#FFE14D', '#FF3D9A', '#FFFFFF'], 30, 280); }
            else { streak = 0; const pts = Math.round(hgt * 25); score += pts; msg = ['Weakling!', 'Not bad', 'So close!'][hgt < 0.5 ? 0 : hgt < 0.85 ? 1 : 2] + ` +${pts}`; sfx.thud(); }
            msgT = 1.1; last = hgt; puck = 0;
          }
        }
        return time <= 0 && phase === 'aim';
      },
      draw(g, w, h, t) {
        g.fillStyle = '#1A0A2A'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 20; i++) { g.fillStyle = ['#FF3D9A', '#22B8FF', '#FFE14D'][i % 3]; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + i); g.beginPath(); g.arc((i * 61) % w, 30 + (i % 2) * 20, 4, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
        const tx = w / 2, T0 = towerTop(), B0 = towerBot();
        g.fillStyle = '#C8352C'; g.fillRect(tx - 18, T0, 36, B0 - T0);
        for (let k = 0; k <= 10; k++) { const y = B0 - (B0 - T0) * (k / 10); g.fillStyle = '#FFE14D'; g.fillRect(tx - 30, y, 12, 3); g.fillRect(tx + 18, y, 12, 3); }
        emoji(g, '🔔', tx, T0 - 14, 40);
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(tx - 24, B0 - (B0 - T0) * puck - 12, 48, 18, 6); g.fill();
        if (last && phase === 'aim') { g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(tx - 34, B0 - (B0 - T0) * last, 68, 2); }
        // the power gauge
        const gx = 30, gw = w - 60, gy = h - 160;
        const grd = g.createLinearGradient(gx, 0, gx + gw, 0); grd.addColorStop(0, '#3DDC97'); grd.addColorStop(0.7, '#FFE14D'); grd.addColorStop(0.92, '#FF5A5F'); grd.addColorStop(1, '#FF3D9A');
        g.fillStyle = grd; g.beginPath(); g.roundRect(gx, gy, gw, 26, 13); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(gx + gw * 0.94, gy - 4, gw * 0.06, 34);
        g.fillStyle = '#fff'; g.fillRect(gx + gw * needle - 3, gy - 8, 6, 42);
        button(g, 30, h - 110, w - 60, 72, phase === 'aim' ? '#FF3D9A' : '#555', phase === 'aim' ? '🔨 SWING!' : '…', { font: '900 24px ui-rounded' });
        msgDraw(g, w, TOP + 20, msg, msgT);
        sparks(sp, g, 1 / 60, 200); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF3D9A', rings ? `🔔 ${rings}` : '');
        intro(g, w, h, t, ['High Striker', 'The needle sweeps the power gauge.', 'Tap SWING when it’s in the bright band', 'at the very top to ring the bell!']);
      },
      down(p: Ptr) {
        if (phase !== 'aim' || time <= 0 || p.y < H - 180) return;
        const pow = needle >= 0.94 ? 1.08 : needle * 0.95; pv = Math.sqrt(2 * 2.2 * pow) * 1.0; phase = 'fly'; sfx.swish();
      },
      key(k, d) { if (d && (k === ' ' || k === 'Enter')) this.down?.({ x: W / 2, y: H - 60, id: 0 }, W, H); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔫 Water Gun Race
// ======================================================================================================================
export function WaterGunRace({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 50, aim: { x: number; y: number } | null = null, tx = W / 2, tv = 90, race = 0, mine = 0, rivals = [0, 0], wins = 0, phase: 'race' | 'done' = 'race', doneT = 0, msg = '', msgT = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const TY = () => TOP + 140;
    const lane = (i: number) => W * (0.2 + i * 0.3);
    const reset = () => { race++; mine = 0; rivals = [0, 0]; phase = 'race'; tv = (80 + race * 20) * (r() < 0.5 ? 1 : -1); tx = W / 2; };
    reset();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (phase === 'race') {
          tx += tv * dt; if (tx < 50 || tx > W - 50) tv *= -1; if (r() < dt * 0.7) tv = (r() < 0.5 ? -1 : 1) * (80 + race * 20 + r() * 60);
          const on = aim && Math.abs(aim.x - tx) < 30 && Math.abs(aim.y - TY()) < 34;
          if (on) { mine += dt * 0.22; score += dt * 6; if (r() < 0.3) sp.push({ x: tx + (r() - 0.5) * 20, y: TY() + (r() - 0.5) * 20, vx: (r() - 0.5) * 120, vy: -r() * 120, life: 0.4, c: '#9AE6FF', s: 3 }); }
          rivals = rivals.map((v, i) => v + dt * (0.07 + race * 0.012 + i * 0.01) * (0.6 + r() * 0.8));
          if (mine >= 1 || rivals.some((v) => v >= 1)) {
            phase = 'done'; doneT = 1.6;
            if (mine >= 1) { wins++; const pts = 60 + race * 10 + Math.floor(level / 2) * 2; score += pts; msg = `You win! +${pts} 🧸`; sfx.jackpot(); burst(sp, lane(1), H - 200, ['#FFE14D', '#FF3D9A'], 30, 260); }
            else { msg = 'A rival popped first!'; sfx.fail(); }
            msgT = 1.6;
          }
        } else { doneT -= dt; if (doneT <= 0) reset(); }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2A0A40'; g.fillRect(0, 0, w, h);
        // the moving target clown
        g.fillStyle = '#FFE14D'; g.fillRect(30, TY() - 3, w - 60, 6);
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(tx, TY(), 30, 0, Math.PI * 2); g.fill(); g.fillStyle = '#FF3D9A'; g.beginPath(); g.arc(tx, TY(), 20, 0, Math.PI * 2); g.fill(); g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(tx, TY(), 9, 0, Math.PI * 2); g.fill();
        // three balloons racing to pop
        const lev = [rivals[0], mine, rivals[1]];
        lev.forEach((v, i) => { const x = lane(i), base = h - 180; g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, base); g.lineTo(x, base + 60); g.stroke(); const s = 18 + v * 40; g.fillStyle = i === 1 ? '#FF3D9A' : '#7A7A9A'; g.beginPath(); g.ellipse(x, base - s, s * 0.85, s, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = '800 12px ui-rounded'; g.textAlign = 'center'; g.fillText(i === 1 ? 'YOU' : 'rival', x, base + 76); });
        if (aim) { g.strokeStyle = 'rgba(154,230,255,0.8)'; g.lineWidth = 6; g.beginPath(); g.moveTo(lane(1), h - 40); g.quadraticCurveTo(lane(1), (h + aim.y) / 2, aim.x, aim.y); g.stroke(); }
        emoji(g, '🔫', lane(1), h - 40, 36);
        msgDraw(g, w, TOP + 30, msg, msgT);
        sparks(sp, g, 1 / 60, 200); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF3D9A', wins ? `🧸 ${wins}` : `Race ${race}`);
        intro(g, w, h, t, ['Water Gun Race', 'Hold your finger on the moving target', 'to squirt it — your balloon grows.', 'Pop yours before the rivals pop theirs!']);
      },
      down(p: Ptr) { aim = { x: p.x, y: p.y }; }, move(p: Ptr) { if (aim) aim = { x: p.x, y: p.y }; }, up() { aim = null; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🎈 Balloon Darts
// ======================================================================================================================
export function BalloonDarts({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, aim: { x: number; y: number } | null = null, darts = 0, pops2 = 0, streak = 0, spawnT = 0;
    const balloons: { x: number; y: number; v: number; c: string; gold?: boolean }[] = [];
    const flying: { x: number; y: number; vx: number; vy: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const start = () => ({ x: W / 2, y: H - 80 });
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; spawnT -= dt;
        if (spawnT <= 0) { const gold = r() < 0.1; balloons.push({ x: 30 + r() * (W - 60), y: H - 160, v: (40 + r() * 50) * (gold ? 1.6 : 1), c: gold ? '#FFD23F' : ['#FF5A5F', '#22B8FF', '#3DDC97', '#B36BFF'][Math.floor(r() * 4)], gold }); spawnT = 0.5 + r() * 0.5; }
        for (const b of balloons) { b.y -= b.v * dt; b.x += Math.sin(t * 2 + b.y * 0.02) * 20 * dt; }
        for (let i = balloons.length - 1; i >= 0; i--) if (balloons[i].y < TOP - 40) balloons.splice(i, 1);
        for (let i = flying.length - 1; i >= 0; i--) {
          const d = flying[i]; d.vy += 700 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
          const hit = balloons.find((b) => Math.hypot(b.x - d.x, b.y - d.y) < 24);
          if (hit) { balloons.splice(balloons.indexOf(hit), 1); flying.splice(i, 1); pops2++; streak++; const pts = (hit.gold ? 30 : 8) + Math.min(12, streak * 2) + Math.floor(level / 3); score += pts; burst(sp, hit.x, hit.y, [hit.c, '#fff'], 16, 220); sfx.perfect(Math.min(12, streak)); pp.push({ x: hit.x, y: hit.y - 20, t: `+${pts}`, life: 0.7, c: hit.c }); continue; }
          if (d.y > H + 40 || d.x < -40 || d.x > W + 40) { flying.splice(i, 1); streak = 0; }
        }
        return time <= 0 && !flying.length;
      },
      draw(g, w, h, t) {
        const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#5AB8F0'); sky.addColorStop(1, '#BFE6FF'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
        for (const b of balloons) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(b.x, b.y + 22); g.lineTo(b.x + Math.sin(t * 3) * 4, b.y + 50); g.stroke(); g.fillStyle = b.c; g.beginPath(); g.ellipse(b.x, b.y, 18, 22, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(b.x - 6, b.y - 8, 4, 7, -0.5, 0, Math.PI * 2); g.fill(); }
        for (const d of flying) { g.save(); g.translate(d.x, d.y); g.rotate(Math.atan2(d.vy, d.vx)); g.fillStyle = '#5A3A20'; g.fillRect(-14, -1.5, 22, 3); g.fillStyle = '#C0C4CC'; g.beginPath(); g.moveTo(8, -3); g.lineTo(16, 0); g.lineTo(8, 3); g.fill(); g.fillStyle = '#FF3D9A'; g.fillRect(-16, -4, 5, 8); g.restore(); }
        const s = start();
        if (aim) { const dx = s.x - aim.x, dy = s.y - aim.y, vx = dx * 5, vy = dy * 5; g.fillStyle = 'rgba(255,255,255,0.7)'; let x = s.x, y = s.y, ux = vx, uy = vy; for (let i = 0; i < 16; i++) { const h2 = 0.03; uy += 700 * h2; x += ux * h2; y += uy * h2; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); } }
        g.fillStyle = '#A9865E'; g.fillRect(0, h - 60, w, 60); emoji(g, '🎯', s.x, s.y, 30);
        sparks(sp, g, 1 / 60, 200); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FF3D9A', streak > 1 ? `🔥 ${streak}` : `🎈 ${pops2}/${darts}`);
        intro(g, w, h, t, ['Balloon Darts', 'Drag back from the bottom and let go', 'to throw a dart — it drops as it flies.', 'Gold balloons pay most!']);
      },
      down(p: Ptr) { if (time > 0) aim = { x: p.x, y: p.y }; },
      move(p: Ptr) { if (aim) aim = { x: p.x, y: p.y }; },
      up() { if (aim) { const s = start(), dx = s.x - aim.x, dy = s.y - aim.y; if (Math.hypot(dx, dy) > 14) { flying.push({ x: s.x, y: s.y, vx: dx * 5, vy: dy * 5 }); darts++; sfx.swish(); } aim = null; } },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 💎 Gem Swap
// ======================================================================================================================
const GEMS = ['💎', '🔷', '🔶', '🟣', '🟢', '❤️'];
export function GemSwap({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    const N = 7;
    let score = 0, time = 60, grid: number[] = [], sel = -1, start: { x: number; y: number; i: number } | null = null, combo = 0, flashCells: Set<number> = new Set(), flashT = 0, msg = '', msgT = 0;
    const pp: Pop[] = [], sp: Spark[] = [];
    const geo = () => { const cs = Math.min((W - 20) / N, (H - TOP - 80) / N); return { cs, ox: (W - cs * N) / 2, oy: TOP + 30 }; };
    const runs = () => { const out = new Set<number>(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, v = grid[i]; if (v < 0) continue; if (x < N - 2 && grid[i + 1] === v && grid[i + 2] === v) { out.add(i); out.add(i + 1); out.add(i + 2); } if (y < N - 2 && grid[i + N] === v && grid[i + 2 * N] === v) { out.add(i); out.add(i + N); out.add(i + 2 * N); } } return out; };
    const fill = () => { for (let x = 0; x < N; x++) { const col: number[] = []; for (let y = N - 1; y >= 0; y--) if (grid[y * N + x] >= 0) col.push(grid[y * N + x]); for (let y = N - 1, k = 0; y >= 0; y--, k++) grid[y * N + x] = k < col.length ? col[k] : Math.floor(r() * GEMS.length); } };
    grid = Array.from({ length: N * N }, () => Math.floor(r() * GEMS.length));
    for (let g0 = 0; g0 < 30; g0++) { const m = runs(); if (!m.size) break; m.forEach((i) => (grid[i] = Math.floor(r() * GEMS.length))); }
    const resolve = () => {
      let chain = 0, total = 0;
      for (;;) { const m = runs(); if (!m.size) break; chain++; total += m.size; flashCells = new Set(m); m.forEach((i) => { const G = geo(); burst(sp, G.ox + (i % N + 0.5) * G.cs, G.oy + (Math.floor(i / N) + 0.5) * G.cs, ['#FFE14D', '#8AF0FF', '#FF9AE8'], 3, 140); grid[i] = -1; }); fill(); }
      if (chain) { const pts = total * 3 * chain + Math.floor(level / 3); score += pts; flashT = 0.3; combo++; if (chain > 1) { msg = `Cascade ×${chain}! +${pts}`; msgT = 1.1; sfx.jackpot(); } else sfx.blip(Math.min(12, total)); }
      return chain > 0;
    };
    const swap = (a: number, b: number) => { [grid[a], grid[b]] = [grid[b], grid[a]]; if (!resolve()) { [grid[a], grid[b]] = [grid[b], grid[a]]; sfx.bonk(); combo = 0; } };
    const cellAt = (p: Ptr) => { const G = geo(), cx = Math.floor((p.x - G.ox) / G.cs), cy = Math.floor((p.y - G.oy) / G.cs); return cx < 0 || cy < 0 || cx >= N || cy >= N ? -1 : cy * N + cx; };
    return {
      score: () => score,
      update(dt, t) { if (t < INTRO) return false; time -= dt; flashT -= dt; msgT -= dt; return time <= 0; },
      draw(g, w, h, t) {
        g.fillStyle = '#1A1024'; g.fillRect(0, 0, w, h);
        const G = geo(); g.fillStyle = '#2A1E3A'; g.beginPath(); g.roundRect(G.ox - 6, G.oy - 6, G.cs * N + 12, G.cs * N + 12, 14); g.fill();
        grid.forEach((v, i) => { const x = G.ox + (i % N + 0.5) * G.cs, y = G.oy + (Math.floor(i / N) + 0.5) * G.cs; if (i === sel) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x - G.cs / 2, y - G.cs / 2, G.cs, G.cs); } if (v >= 0) emoji(g, GEMS[v], x, y, G.cs * 0.72); });
        msgDraw(g, w, h - 30, msg, msgT, '#8AF0FF');
        sparks(sp, g, 1 / 60, 100); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#B36BFF', '');
        intro(g, w, h, t, ['Gem Swap', 'Swipe a gem into its neighbour', '(or tap one, then the next) to swap.', 'Make lines of 3 or more!']);
      },
      down(p: Ptr) { if (time <= 0) return; const i = cellAt(p); if (i < 0) return; start = { x: p.x, y: p.y, i }; },
      move(p: Ptr) {
        if (!start) return; const dx = p.x - start.x, dy = p.y - start.y, G = geo(); if (Math.hypot(dx, dy) < G.cs * 0.4) return;
        const a = start.i, x = a % N, y = Math.floor(a / N); let b = -1;
        if (Math.abs(dx) > Math.abs(dy)) { if (dx > 0 && x < N - 1) b = a + 1; if (dx < 0 && x > 0) b = a - 1; } else { if (dy > 0 && y < N - 1) b = a + N; if (dy < 0 && y > 0) b = a - N; }
        start = null; sel = -1; if (b >= 0) swap(a, b);
      },
      up(p: Ptr) {
        if (!start) return; const a = start.i; start = null;
        if (sel < 0) { sel = a; sfx.tick(); return; }
        const adj = Math.abs((sel % N) - (a % N)) + Math.abs(Math.floor(sel / N) - Math.floor(a / N)) === 1;
        if (adj) swap(sel, a); sel = adj ? -1 : a; void p;
      },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🛤️ Rail Switch
// ======================================================================================================================
const RAIL = ['#FF5A5F', '#22B8FF', '#FFE14D', '#3DDC97'];
export function RailSwitch({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    // a binary tree of points: switch 0 at the top splits left/right, switches 1 and 2 split again into 4 bins
    const sw = [0, 0, 0];
    let score = 0, time = 50, spawnT = 0.5, delivered = 0, wrong = 0, streak = 0;
    const carts: { c: number; p: number; path: number[] | null }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const binX = (i: number) => W * (0.14 + i * 0.24);
    const Y0 = () => TOP + 30, Y1 = () => TOP + (H - TOP) * 0.32, Y2 = () => TOP + (H - TOP) * 0.58, Y3 = () => H - 130;
    const nodes = () => ({ s0: { x: W / 2, y: Y1() }, s1: { x: W * 0.26, y: Y2() }, s2: { x: W * 0.74, y: Y2() } });
    // the path for a cart, fixed when it passes each switch
    const pointAt = (path: number[], p: number) => {
      const N = nodes(), mid = path[0] ? N.s2 : N.s1, bin = { x: binX((path[0] ? 2 : 0) + path[1]), y: Y3() };
      const pts = [{ x: W / 2, y: Y0() }, N.s0, mid, bin];
      const seg = Math.min(2, Math.floor(p * 3)), k = p * 3 - seg; const a = pts[seg], b = pts[seg + 1];
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    };
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; spawnT -= dt;
        if (spawnT <= 0) { carts.push({ c: Math.floor(r() * 4), p: 0, path: null }); spawnT = Math.max(0.9, 2.2 - (50 - time) / 30); }
        const v = 0.16 + (50 - time) / 400;
        for (let i = carts.length - 1; i >= 0; i--) {
          const c = carts[i], before = c.p; c.p += v * dt;
          if (!c.path && before < 1 / 3 && c.p >= 1 / 3) c.path = [sw[0], 0];
          if (c.path && before < 2 / 3 && c.p >= 2 / 3) c.path[1] = sw[c.path[0] ? 2 : 1];
          if (c.p >= 1) {
            carts.splice(i, 1); const bin = (c.path![0] ? 2 : 0) + c.path![1];
            if (bin === c.c) { delivered++; streak++; const pts = 12 + Math.min(15, streak * 2) + Math.floor(level / 3); score += pts; sfx.blip(Math.min(12, streak)); burst(sp, binX(bin), Y3(), [RAIL[bin], '#fff'], 12, 160); pp.push({ x: binX(bin), y: Y3() - 30, t: `+${pts}`, life: 0.7, c: RAIL[bin] }); }
            else { wrong++; streak = 0; score = Math.max(0, score - 6); sfx.bonk(); pp.push({ x: binX(bin), y: Y3() - 30, t: 'wrong bin', life: 0.7, c: '#fff' }); }
          }
        }
        return time <= 0 || wrong >= 6;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2A1E1A'; g.fillRect(0, 0, w, h);
        const N = nodes();
        const rail = (a: { x: number; y: number }, b: { x: number; y: number }, on: boolean) => { g.strokeStyle = on ? '#C0C4CC' : '#4A4040'; g.lineWidth = on ? 7 : 4; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
        rail({ x: w / 2, y: Y0() }, N.s0, true);
        rail(N.s0, N.s1, sw[0] === 0); rail(N.s0, N.s2, sw[0] === 1);
        for (let k = 0; k < 4; k++) rail(k < 2 ? N.s1 : N.s2, { x: binX(k), y: Y3() }, (k < 2 ? sw[1] : sw[2]) === k % 2);
        for (const [i, s] of [N.s0, N.s1, N.s2].entries()) { g.fillStyle = '#FFB020'; g.beginPath(); g.arc(s.x, s.y, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = '#222'; g.font = '900 18px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sw[i] ? '↘' : '↙', s.x, s.y); }
        for (let k = 0; k < 4; k++) { g.fillStyle = RAIL[k]; g.beginPath(); g.roundRect(binX(k) - 34, Y3() + 6, 68, 44, 8); g.fill(); emoji(g, '📦', binX(k), Y3() + 28, 22); }
        for (const c of carts) { const pt = pointAt(c.path ?? [sw[0], sw[sw[0] ? 2 : 1]], c.p); g.fillStyle = RAIL[c.c]; g.beginPath(); g.roundRect(pt.x - 18, pt.y - 13, 36, 26, 6); g.fill(); emoji(g, '💎', pt.x, pt.y - 4, 16); }
        sparks(sp, g, 1 / 60, 200); pops(pp, g, 1 / 60);
        hud(g, w, score, `${'❌'.repeat(wrong)} ⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB020', streak > 1 ? `🔥 ${streak}` : `🛒 ${delivered}`);
        intro(g, w, h, t, ['Rail Switch', 'Tap the yellow points to flip them.', 'Send every cart down to the bin of its colour.', 'Six wrong bins and the mine shuts!']);
      },
      down(p: Ptr) {
        if (time <= 0) return; const N = nodes();
        [N.s0, N.s1, N.s2].forEach((s, i) => { if (Math.hypot(s.x - p.x, s.y - p.y) < 44) { sw[i] = 1 - sw[i]; sfx.tick(); } });
      },
      key(k, d) { if (!d) return; const i = ['1', '2', '3'].indexOf(k); if (i >= 0) sw[i] = 1 - sw[i]; },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🪨 Geode Crack
// ======================================================================================================================
export function GeodeCrack({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 45, ring = 1, rv = 0.7, spot = { x: 0, y: 0 }, cracks = 0, need = 3, opened = 0, phase: 'strike' | 'open' = 'strike', openT = 0, msg = '', msgT = 0, perfect = 0, inside = '💜';
    const pp: Pop[] = [], sp: Spark[] = [];
    const C = () => ({ x: W / 2, y: TOP + (H - TOP) * 0.42, R: Math.min(W * 0.36, 150) });
    const place = () => { const c = C(), a = r() * Math.PI * 2, d = r() * c.R * 0.55; spot = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d }; ring = 1; rv = 0.55 + opened * 0.06 + r() * 0.2; };
    const deal = () => { cracks = 0; need = 3 + Math.min(3, Math.floor(opened / 2)); phase = 'strike'; inside = ['💜', '💎', '🔷', '🟣', '🌈'][Math.floor(r() * 5)]; place(); };
    deal();
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt;
        if (phase === 'strike') { ring -= rv * dt; if (ring < -0.2) { ring = 1; sfx.tick(); } }
        else { openT -= dt; if (openT <= 0) deal(); }
        return time <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#1A1210'; g.fillRect(0, 0, w, h);
        const c = C();
        if (phase === 'open') { g.fillStyle = '#4A3A3A'; g.beginPath(); g.arc(c.x - c.R * 0.35, c.y, c.R * 0.7, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(c.x + c.R * 0.35, c.y, c.R * 0.7, 0, Math.PI * 2); g.fill(); const gr = g.createRadialGradient(c.x, c.y, 2, c.x, c.y, c.R * 0.6); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, '#B36BFF'); g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, c.R * 0.55, 0, Math.PI * 2); g.fill(); emoji(g, inside, c.x, c.y, c.R * 0.6); }
        else {
          g.fillStyle = '#6A5A50'; g.beginPath(); for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, rr = c.R * (0.9 + ((k * 37) % 10) / 100); g.lineTo(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr); } g.closePath(); g.fill();
          g.strokeStyle = '#2A1E1A'; g.lineWidth = 3; for (let k = 0; k < cracks; k++) { const a = k * 2.1; g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x + Math.cos(a) * c.R * 0.8, c.y + Math.sin(a) * c.R * 0.8); g.lineTo(c.x + Math.cos(a + 0.3) * c.R * 0.95, c.y + Math.sin(a + 0.3) * c.R * 0.95); g.stroke(); }
          g.fillStyle = '#FFE14D'; g.beginPath(); g.arc(spot.x, spot.y, 7, 0, Math.PI * 2); g.fill();
          if (ring > 0) { g.strokeStyle = Math.abs(ring) < 0.1 ? '#3DDC97' : '#FFFFFF'; g.lineWidth = 3; g.beginPath(); g.arc(spot.x, spot.y, 8 + ring * 90, 0, Math.PI * 2); g.stroke(); }
        }
        button(g, 30, h - 104, w - 60, 70, phase === 'strike' ? '#8A7A6A' : '#444', `⛏️ STRIKE  ${cracks}/${need}`, { font: '900 20px ui-rounded' });
        msgDraw(g, w, TOP + 20, msg, msgT, '#B36BFF');
        sparks(sp, g, 1 / 60, 300); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#B36BFF', opened ? `🪨 ${opened}` : '');
        intro(g, w, h, t, ['Geode Crack', 'The white ring shrinks onto the weak spot.', 'STRIKE right as it closes on the yellow dot.', 'Crack it open to see the crystals inside!']);
      },
      down(p: Ptr) {
        if (phase !== 'strike' || time <= 0 || p.y < H - 120) return;
        const off = Math.abs(ring);
        if (off < 0.1) { cracks++; perfect++; score += 10 + (off < 0.04 ? 6 : 0); sfx.perfect(cracks * 3); burst(sp, spot.x, spot.y, ['#C0B8A8', '#FFE14D'], 14, 200); }
        else if (off < 0.25) { cracks++; score += 4; sfx.thud(); }
        else { score = Math.max(0, score - 3); sfx.bonk(); pp.push({ x: spot.x, y: spot.y - 20, t: 'clang!', life: 0.6, c: '#fff' }); }
        if (cracks >= need) { opened++; const pts = 30 + need * 6 + Math.floor(level / 2) * 2; score += pts; msg = `${inside} Cracked open! +${pts}`; msgT = 1.3; sfx.jackpot(); phase = 'open'; openT = 1.2; const c = C(); burst(sp, c.x, c.y, ['#B36BFF', '#8AF0FF', '#FFFFFF'], 40, 320); }
        else place();
      },
      key(k, d) { if (d && (k === ' ' || k === 'Enter')) this.down?.({ x: W / 2, y: H - 60, id: 0 }, W, H); },
    };
  }, onEnd, onScore);
}

// ======================================================================================================================
// 🔦 Lamp in the Dark
// ======================================================================================================================
export function LampDark({ seed, level, onEnd, onScore }: GameProps) {
  return useGame((W, H) => {
    const r = rng(seed);
    let score = 0, time = 50, oil = 1, lx = W / 2, ly = H / 2, found = 0, msg = '', msgT = 0;
    const gems: { x: number; y: number; e: string; p: number; seen: number }[] = [];
    const bats: { x: number; y: number; vx: number; vy: number }[] = [];
    const pp: Pop[] = [], sp: Spark[] = [];
    const rocks = Array.from({ length: 26 }, () => ({ x: r() * W, y: TOP + r() * (H - TOP), s: 20 + r() * 40 }));
    const add = () => { const roll = r(); gems.push({ x: 30 + r() * (W - 60), y: TOP + 30 + r() * (H - TOP - 60), e: roll < 0.08 ? '💎' : roll < 0.2 ? '⛽' : ['🔶', '🔷', '🟣', '🟢'][Math.floor(r() * 4)], p: roll < 0.08 ? 40 : 10, seen: 0 }); };
    for (let i = 0; i < 6; i++) add();
    for (let i = 0; i < 2; i++) bats.push({ x: r() * W, y: TOP + r() * (H - TOP), vx: 80, vy: 50 });
    return {
      score: () => score,
      update(dt, t) {
        if (t < INTRO) return false;
        time -= dt; msgT -= dt; oil -= dt * (0.035 + (50 - time) / 3000);
        for (const gm of gems) if (Math.hypot(gm.x - lx, gm.y - ly) < 70) gm.seen = Math.min(1, gm.seen + dt * 3); else gm.seen = Math.max(0, gm.seen - dt * 1.5);
        for (const b of bats) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.x < 0 || b.x > W) b.vx *= -1; if (b.y < TOP || b.y > H) b.vy *= -1; if (Math.hypot(b.x - lx, b.y - ly) < 30) { oil -= 0.08; b.vx *= -1; b.vy *= -1; sfx.bonk(); pp.push({ x: lx, y: ly - 30, t: '🦇 −oil', life: 0.7, c: '#FF8A8A' }); } }
        return time <= 0 || oil <= 0;
      },
      draw(g, w, h, t) {
        g.fillStyle = '#2A2028'; g.fillRect(0, 0, w, h);
        for (const k of rocks) { g.fillStyle = '#3A3036'; g.beginPath(); g.arc(k.x, k.y, k.s, 0, Math.PI * 2); g.fill(); }
        for (const gm of gems) emoji(g, gm.e, gm.x, gm.y, 30);
        for (const b of bats) emoji(g, '🦇', b.x, b.y, 26);
        // darkness with a hole where the lamp shines
        const rad = 60 + oil * 70;
        const dark = g.createRadialGradient(lx, ly, rad * 0.35, lx, ly, rad); dark.addColorStop(0, 'rgba(0,0,0,0)'); dark.addColorStop(1, 'rgba(0,0,0,0.97)');
        g.fillStyle = dark; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,200,100,0.08)'; g.beginPath(); g.arc(lx, ly, rad * 0.5, 0, Math.PI * 2); g.fill();
        // oil
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.roundRect(14, h - 34, w - 28, 18, 9); g.fill(); g.fillStyle = oil > 0.3 ? '#FFB020' : '#FF5A5F'; g.beginPath(); g.roundRect(16, h - 32, (w - 32) * clamp(oil, 0, 1), 14, 7); g.fill();
        g.fillStyle = '#fff'; g.font = '800 11px ui-rounded'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🪔 lamp oil', w / 2, h - 25);
        msgDraw(g, w, TOP + 20, msg, msgT);
        sparks(sp, g, 1 / 60, 200); pops(pp, g, 1 / 60);
        hud(g, w, score, `⏱ ${Math.ceil(Math.max(0, time))}s`, '#FFB020', found ? `💎 ${found}` : '');
        intro(g, w, h, t, ['Lamp in the Dark', 'Drag to sweep your lamp round the cave.', 'Tap gems once your light finds them.', '⛽ refills the oil — dodge the bats!']);
      },
      down(p: Ptr) {
        if (time <= 0) return;
        const gm = gems.find((x) => x.seen > 0.5 && Math.hypot(x.x - p.x, x.y - p.y) < 30);
        if (gm) { gems.splice(gems.indexOf(gm), 1); if (gm.e === '⛽') { oil = Math.min(1, oil + 0.35); pp.push({ x: gm.x, y: gm.y - 20, t: '+oil', life: 0.8, c: '#FFB020' }); sfx.coin(); } else { found++; const pts = gm.p + Math.floor(level / 3); score += pts; pp.push({ x: gm.x, y: gm.y - 20, t: `+${pts}`, life: 0.8, c: '#FFE14D' }); burst(sp, gm.x, gm.y, ['#FFE14D', '#8AF0FF'], 12, 160); sfx.blip(Math.min(12, found)); } add(); return; }
        lx = p.x; ly = p.y;
      },
      move(p: Ptr) { lx = p.x; ly = p.y; },
    };
  }, onEnd, onScore);
}
void hearts;
