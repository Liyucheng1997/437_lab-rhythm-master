/* 编曲编译器：把 songs.js 里的旋律 + 和弦，编译成带伴奏（贝斯 / 和声 / 鼓）的事件表。 */
(function () {
  const RM = (window.RM = window.RM || {});
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const QUAL = {
    '': [0, 4, 7],
    m: [0, 3, 7],
    7: [0, 4, 7, 10],
    m7: [0, 3, 7, 10],
    maj7: [0, 4, 7, 11],
    dim: [0, 3, 6],
    sus4: [0, 5, 7],
  };
  const EPS = 1e-6;

  function pcOf(s) {
    let p = PC[s[0]];
    if (s[1] === '#') p++;
    else if (s[1] === 'b') p--;
    return (p + 12) % 12;
  }
  function midiOf(name, oct) {
    return 12 * (oct + 1) + PC[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0);
  }
  const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-4;

  function parseMelody(str, bar, errors, label) {
    let unit = 1;
    let pos = 0;
    const notes = [];
    const toks = str.replace(/\|/g, ' | ').trim().split(/\s+/);
    for (const tok of toks) {
      if (!tok) continue;
      if (tok === '|') {
        if (!isInt(pos / bar)) errors.push(`${label}: 小节线处时值不齐（第 ${pos} 拍）`);
        continue;
      }
      let m = /^L(\d+)$/.exec(tok);
      if (m) {
        unit = 4 / +m[1];
        continue;
      }
      m = /^(-|([A-G][#b]?)(\d))(?::([\d.]+))?$/.exec(tok);
      if (!m) {
        errors.push(`${label}: 无法识别的记号 "${tok}"`);
        continue;
      }
      const len = unit * (m[4] ? parseFloat(m[4]) : 1);
      if (m[1] !== '-') notes.push({ beat: pos, len, midi: midiOf(m[2], +m[3]) });
      pos += len;
    }
    return { notes, total: pos };
  }

  function parseChords(str, bar, errors, label) {
    let pos = 0;
    const segs = [];
    for (const tok of str.trim().split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const m = /^(N|[A-G][#b]?)(m7|maj7|m|7|dim|sus4)?(?:\/([A-G][#b]?))?(?::([\d.]+))?$/.exec(tok);
      if (!m) {
        errors.push(`${label}: 无法识别的和弦 "${tok}"`);
        continue;
      }
      const len = m[4] ? parseFloat(m[4]) : bar;
      if (m[1] === 'N') segs.push({ beat: pos, len, pc: -1 });
      else {
        const pc = pcOf(m[1]);
        segs.push({ beat: pos, len, pc, iv: QUAL[m[2] || ''], bass: m[3] ? pcOf(m[3]) : pc });
      }
      pos += len;
    }
    return { segs, total: pos };
  }

  const cache = {};

  function compile(song) {
    if (cache[song.id]) return cache[song.id];
    const errors = [];
    const spb = 60 / song.bpm;
    const BAR = song.bar;
    const pulse = song.pulse || 1;
    const notes = [];
    const segs = [];
    const secs = [];
    let beat0 = 0;

    song.sections.forEach((sec, si) => {
      const label = `${song.title} 段落${si + 1}`;
      const tr = sec.tr || 0;
      const mel = parseMelody(sec.m, BAR, errors, label);
      const ch = parseChords(sec.c, BAR, errors, label);
      if (Math.abs(mel.total - ch.total) > EPS) errors.push(`${label}: 旋律 ${mel.total} 拍 ≠ 和弦 ${ch.total} 拍`);
      if (!isInt(mel.total / BAR)) errors.push(`${label}: 总长 ${mel.total} 拍不是整小节`);
      for (const n of mel.notes) notes.push({ beat: beat0 + n.beat, len: n.len, midi: n.midi + tr });
      for (const s of ch.segs) {
        if (s.pc < 0) segs.push({ beat: beat0 + s.beat, len: s.len, pc: -1, inten: sec.i });
        else
          segs.push({
            beat: beat0 + s.beat,
            len: s.len,
            pc: (s.pc + tr + 120) % 12,
            iv: s.iv,
            bass: (s.bass + tr + 120) % 12,
            inten: sec.i,
          });
      }
      secs.push({ beat: beat0, len: mel.total, i: sec.i });
      beat0 += mel.total;
    });

    const totalBeats = beat0;
    const nBars = Math.round(totalBeats / BAR);
    const intenAt = (b) => {
      for (let k = secs.length - 1; k >= 0; k--) if (b >= secs[k].beat - EPS) return secs[k].i;
      return 0;
    };

    // ---------- 生成伴奏 ----------
    const ev = [];
    const N = (beat, inst, midi, len, v, bus) =>
      ev.push({ t: beat * spb, k: 'n', inst, midi, dur: len * spb, v, bus: bus || 'acc' });
    const D = (beat, d, v) => ev.push({ t: beat * spb, k: 'd', d, v });
    const style = song.style;

    for (let b = 0; b < nBars; b++) {
      const s = b * BAR;
      const I = intenAt(s);
      if (I <= 0) continue;
      switch (style) {
        case 'pop':
        case 'anthem':
          for (let k = 0; k < 4; k++) {
            D(s + k, 'hat', 0.55);
            if (I >= 2) D(s + k + 0.5, 'hat', 0.35);
            if (I >= 3) {
              D(s + k + 0.25, 'hat', 0.16);
              D(s + k + 0.75, 'hat', 0.16);
            }
          }
          D(s, 'kick', 1);
          D(s + 2, 'kick', 0.9);
          if (I >= 2) {
            D(s + 1, 'snare', 0.9);
            D(s + 3, 'snare', 0.9);
            D(s + (b % 2 ? 2.5 : 1.5), 'kick', 0.6);
          } else {
            D(s + 1, 'rim', 0.6);
            D(s + 3, 'rim', 0.6);
          }
          break;
        case 'ballad':
          D(s, 'kick', 0.6);
          D(s + 2.5, 'kick', 0.4);
          for (let k = 0; k < 8; k++) D(s + k * 0.5, 'hat', k % 2 ? 0.16 : 0.28);
          if (I >= 2) {
            D(s + 1, 'snare', 0.38);
            D(s + 3, 'snare', 0.38);
            D(s + 2, 'kick', 0.45);
          } else {
            D(s + 1, 'rim', 0.5);
            D(s + 3, 'rim', 0.5);
          }
          break;
        case 'waltz':
          for (let k = 0; k < 3; k++) D(s + k * 0.5, 'hat', k ? 0.3 : 0.45);
          if (b % 2 === 0) D(s, 'kick', 0.9);
          else D(s, I >= 2 ? 'snare' : 'rim', 0.7);
          if (I >= 3) {
            D(s + 0.25, 'hat', 0.14);
            D(s + 0.75, 'hat', 0.14);
            D(s + 1.25, 'hat', 0.14);
            if (b % 2) D(s + 1, 'kick', 0.5);
          }
          break;
        case 'galop':
          for (let k = 0; k < 4; k++) {
            D(s + k, 'kick', 0.72);
            D(s + k + 0.5, 'hat', 0.5);
          }
          if (I >= 2) {
            D(s + 1, 'snare', 0.85);
            D(s + 3, 'snare', 0.85);
          }
          break;
        case 'march':
          D(s, 'kick', 0.95);
          D(s + 1, I >= 2 ? 'snare' : 'rim', 0.8);
          for (let k = 0; k < 4; k++) D(s + k * 0.5, 'hat', k % 2 ? 0.28 : 0.42);
          if (I >= 3 && b % 4 === 3) {
            D(s + 1.5, 'snare', 0.5);
            D(s + 1.75, 'snare', 0.6);
          }
          break;
        case 'dnb':
          for (let k = 0; k < 4; k++) D(s + k * 0.5, 'hat', k % 2 ? 0.3 : 0.45);
          if (I >= 2) {
            D(s + (b % 2 ? 0.5 : 0), 'kick', 1);
            D(s + 1, 'snare', 0.9);
            if (b % 2 === 0) D(s + 1.75, 'kick', 0.5);
          } else if (b % 2 === 0) D(s, 'kick', 0.9);
          if (I >= 3) for (let k = 0; k < 4; k++) D(s + k * 0.5 + 0.25, 'hat', 0.16);
          break;
      }
    }
    // 段落开头的镲片
    secs.forEach((sc, k) => {
      if (sc.i >= 2 && (k === 0 || secs[k - 1].i < sc.i || sc.i >= 3)) D(sc.beat, 'crash', 0.8);
    });

    for (const sg of segs) {
      if (sg.pc < 0) continue;
      const I = sg.inten;
      const b0 = sg.beat;
      const bassM = 36 + sg.bass; // C2..B2
      const tones = sg.iv.map((iv) => 55 + ((((sg.pc + iv - 55) % 12) + 12) % 12)).sort((a, b) => a - b);
      const root3 = 48 + sg.pc;
      const pool = [root3, root3 + 7, root3 + 12, root3 + 12 + sg.iv[1], root3 + 19];

      // 铺底
      const wantPad = I === 0 || style === 'pop' || style === 'ballad' || style === 'anthem' || style === 'dnb';
      if (wantPad) for (const tn of tones) N(b0, 'pad', tn, sg.len, I === 0 ? 0.9 : 0.6);
      if (I === 0) {
        N(b0, 'bass', bassM, sg.len * 0.95, 0.6);
        if (style === 'anthem') for (let k = 0; k < sg.len; k++) N(b0 + k, 'keys', pool[[0, 2, 3, 2][k % 4]], 0.9, 0.7);
        continue;
      }

      // 贝斯
      if (style === 'ballad') N(b0, 'bass', bassM, sg.len * 0.95, 0.7);
      else if (style === 'waltz') N(b0, 'bass', bassM, Math.min(sg.len, 1.4), 0.8);
      else if (style === 'galop' || style === 'march') {
        for (let k = 0; k < sg.len - EPS; k++) {
          const odd = Math.round(b0 + k) % 2 === 1;
          N(b0 + k, 'bass', odd ? (bassM + 7 > 47 ? bassM - 5 : bassM + 7) : bassM, 0.45, odd ? 0.7 : 0.9);
        }
      } else if (I === 1) {
        for (let k = 0; k < sg.len - EPS; k++) N(b0 + k, 'bass', bassM, 0.9, 0.75);
      } else {
        for (let k = 0; k < sg.len - EPS; k += 0.5) {
          const off = !isInt(k);
          N(b0 + k, 'bass', I >= 3 && off && style !== 'dnb' ? bassM + 12 : bassM, 0.42, off ? 0.65 : 0.9);
        }
      }

      // 和声型
      if (style === 'pop') {
        for (let k = 0; k < sg.len - EPS; k++) {
          const at = I >= 2 ? b0 + k + 0.5 : b0 + k;
          if (at < b0 + sg.len - EPS) for (const tn of tones) N(at, 'keys', tn, 0.3, 0.8);
        }
      } else if (style === 'dnb') {
        for (const off of [0, 0.75, 1.5])
          if (off < sg.len - EPS) for (const tn of tones) N(b0 + off, 'keys', tn + 12, 0.18, 0.7);
      } else if (style === 'galop' || style === 'march') {
        for (let k = 0.5; k < sg.len - EPS; k++) for (const tn of tones) N(b0 + k, 'keys', tn, 0.2, 0.75);
      } else if (style === 'anthem' || style === 'ballad') {
        const inst = style === 'ballad' ? 'harp' : 'keys';
        const pat = [0, 1, 2, 3, 4, 3, 2, 1];
        for (let k = 0, j = 0; k < sg.len - EPS; k += 0.5, j++) N(b0 + k, inst, pool[pat[j % 8]], 0.6, j % 2 ? 0.6 : 0.8);
      } else if (style === 'waltz') {
        const pat = I >= 2 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2];
        for (let j = 0; j < pat.length && j * 0.25 < sg.len - EPS; j++) N(b0 + j * 0.25, 'keys', pool[pat[j]], 0.4, j ? 0.7 : 0.9);
      }
    }

    // ---------- 旋律 ----------
    const outNotes = notes.map((n) => {
      const pos = n.beat - Math.floor(n.beat / BAR + EPS) * BAR;
      let strength = 1;
      if (pos < 1e-4) strength = 5;
      else if (BAR === 4 && Math.abs(pos - 2) < 1e-4) strength = 4;
      else if (isInt(pos / pulse)) strength = 3;
      else if (isInt(pos / (pulse / 2))) strength = 2;
      return { t: n.beat * spb, dur: n.len * spb, beat: n.beat, len: n.len, midi: n.midi, strength };
    });
    for (const n of outNotes)
      ev.push({ t: n.t, k: 'n', inst: song.lead, midi: n.midi, dur: n.dur * 0.97, v: 1, bus: 'mel' });

    // ---------- 预备拍 ----------
    const countIn = song.countIn || BAR;
    for (let b = -countIn; b < -EPS; b += pulse) D(b, 'stick', isInt(b / BAR) ? 1 : 0.6);

    ev.sort((a, b) => a.t - b.t);
    const out = {
      song,
      spb,
      bar: BAR,
      pulse,
      notes: outNotes,
      events: ev,
      secs,
      totalBeats,
      duration: totalBeats * spb,
      startTime: -countIn * spb - 0.5,
      errors,
    };
    cache[song.id] = out;
    if (errors.length && window.console) console.warn('[曲谱校验]', errors);
    return out;
  }

  RM.Music = { compile };
})();
