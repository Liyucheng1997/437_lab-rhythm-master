/* 谱面生成器：根据旋律自动生成 简单 / 普通 / 困难 三档谱面。
 * - 按拍点强弱抽稀旋律（越难保留越多）
 * - 音高走向决定轨道走向（上行往右、下行往左，碰边折返）
 * - 长音变成长按；困难档加入双押和跟着伴奏节奏的"节奏音符"
 */
(function () {
  const RM = (window.RM = window.RM || {});
  const LANES = 4;
  const cache = {};

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(C, diff) {
    const key = C.song.id + ':' + diff;
    if (cache[key]) return cache[key];
    const song = C.song;
    const spb = C.spb;
    const src = C.notes;
    const minGap = song.grid[diff] * spb - 1e-3;

    // 1) 抽稀：强拍优先
    const order = src.map((_, i) => i).sort((a, b) => src[b].strength - src[a].strength || a - b);
    const keep = new Array(src.length).fill(false);
    for (const i of order) {
      const t = src[i].t;
      let ok = true;
      for (let j = i - 1; j >= 0 && t - src[j].t < minGap; j--) if (keep[j]) ok = false;
      for (let j = i + 1; ok && j < src.length && src[j].t - t < minGap; j++) if (keep[j]) ok = false;
      if (ok) keep[i] = true;
    }
    const mel = src.filter((_, i) => keep[i]);

    // 2) 长按 + 3) 轨道
    const holdMin = [0.75, 0.6, 0.5][diff];
    const tailGap = [0.28, 0.2, 0.12][diff];
    const holdBeats = song.holdBeats || 1.5 * C.pulse;
    const notes = [];
    const busy = [0, 0, 0, 0];
    let lane = 1;
    let flip = 1;
    let dir = 1;
    let prev = null;
    mel.forEach((n, idx) => {
      const next = idx + 1 < mel.length ? mel[idx + 1].t : Infinity;
      let end = 0;
      if (n.dur >= holdMin && n.len >= holdBeats - 1e-6) {
        const he = Math.min(n.t + n.dur - 0.05, next - tailGap);
        if (he - n.t >= 0.4) end = he;
      }
      let target = lane;
      if (prev) {
        const dp = n.midi - prev.midi;
        const gap = n.t - prev.t;
        if (dp === 0) {
          if (gap < 0.19) target = lane + dir;
        } else {
          const step = Math.abs(dp) >= 7 && gap > 0.25 ? 2 : 1;
          const sgn = Math.sign(dp);
          target = lane + flip * sgn * step;
          if (target < 0 || target >= LANES) {
            flip = -flip;
            target = lane + flip * sgn * step;
          }
        }
        if (target < 0 || target >= LANES) {
          dir = -dir;
          target = lane + dir;
        }
        target = Math.max(0, Math.min(LANES - 1, target));
      }
      if (busy[target] > n.t - 0.05) {
        // 目标轨道正被长按占用，找最近的空轨
        let best = -1;
        for (let d = 1; d < LANES && best < 0; d++) {
          for (const c of [target + d, target - d]) if (c >= 0 && c < LANES && busy[c] <= n.t - 0.05) best = c;
        }
        if (best < 0) return;
        target = best;
      }
      if (target !== lane) dir = Math.sign(target - lane);
      lane = target;
      prev = n;
      if (end) busy[lane] = end + 0.22;
      notes.push({ t: n.t, end, lane, hold: !!end, fill: false, strength: n.strength, bar: Math.floor(n.beat / C.bar + 1e-6) });
    });

    const holds = notes.filter((n) => n.hold);
    const laneFree = (l, t) => !holds.some((h) => h.lane === l && t > h.t - 0.08 && t < h.end + 0.2);

    // 4) 双押
    if (diff >= 1) {
      const base = notes.slice();
      base.forEach((n, i) => {
        const gp = i ? n.t - base[i - 1].t : 9;
        const gn = i + 1 < base.length ? base[i + 1].t - n.t : 9;
        const want =
          diff === 2 ? n.strength >= 4 && gp >= 0.2 && gn >= 0.2 : n.strength >= 5 && n.bar % 2 === 0 && gp >= 0.4 && gn >= 0.4;
        if (!want) return;
        let l2 = LANES - 1 - n.lane;
        if (!laneFree(l2, n.t)) l2 = [0, 1, 2, 3].find((l) => l !== n.lane && laneFree(l, n.t));
        if (l2 === undefined || l2 === n.lane) return;
        notes.push({ t: n.t, end: 0, lane: l2, hold: false, fill: false, strength: n.strength, bar: n.bar });
      });
      notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
    }

    // 5) 节奏音符（仅困难）：在旋律的空隙里跟着伴奏打拍子
    if (diff === 2) {
      const rand = rng(song.id.length * 7919 + song.bpm);
      const step = song.fill;
      const near = step * spb * 0.8;
      const times = notes.map((n) => n.t);
      const fills = [];
      let p = 0;
      let lastLane = -1;
      const lastSec = C.secs[C.secs.length - 1];
      for (let b = 0; b < lastSec.beat - 1e-6; b += step) {
        let inten = 0;
        for (const sc of C.secs) if (b >= sc.beat - 1e-6) inten = sc.i;
        if (inten < 1) continue;
        const t = b * spb;
        while (p < times.length && times[p] < t - near) p++;
        if (p < times.length && Math.abs(times[p] - t) < near) continue;
        // 相邻音符占用的轨道尽量避开
        const avoid = new Set();
        if (p > 0 && t - times[p - 1] < 0.26) avoid.add(notes[p - 1].lane);
        if (p < times.length && times[p] - t < 0.26) avoid.add(notes[p].lane);
        if (lastLane >= 0) avoid.add(lastLane);
        let cand = [0, 1, 2, 3].filter((l) => laneFree(l, t) && !avoid.has(l));
        if (!cand.length) cand = [0, 1, 2, 3].filter((l) => laneFree(l, t) && l !== lastLane);
        if (!cand.length) continue;
        const l = cand[Math.floor(rand() * cand.length)];
        lastLane = l;
        fills.push({ t, end: 0, lane: l, hold: false, fill: true, strength: 2, bar: Math.floor(b / C.bar + 1e-6) });
      }
      for (const f of fills) notes.push(f);
      notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
    }

    // 6) 统计
    let total = 0;
    for (const n of notes) total += n.hold ? 2 : 1;
    const first = notes.length ? notes[0].t : 0;
    const last = notes.length ? notes[notes.length - 1].t : 1;
    const avg = notes.length / Math.max(1, last - first);
    let peak = 0;
    for (let i = 0, j = 0; i < notes.length; i++) {
      while (notes[i].t - notes[j].t > 3) j++;
      peak = Math.max(peak, (i - j + 1) / 3);
    }
    const level = Math.max(1, Math.min(12, Math.round(0.5 + avg * 0.75 + peak * 0.4)));
    const out = { notes, total, count: notes.length, level, avg, peak, first, last };
    cache[key] = out;
    return out;
  }

  RM.Chart = { generate, LANES };
})();
