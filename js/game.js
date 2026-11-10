/* 游戏核心：时钟同步、判定、计分、Fever、Canvas 渲染与特效。 */
(function () {
  const RM = (window.RM = window.RM || {});
  const G = (RM.Game = {});
  const A = RM.Audio;

  const KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
  const LABELS = ['D', 'F', 'J', 'K'];
  const WIN = { perfect: 0.05, great: 0.1, good: 0.15 };
  const SCORE = { perfect: 1000, great: 700, good: 400 };
  const ACCW = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
  const JCOL = { perfect: '#ffd60a', great: '#64d2ff', good: '#30d158', miss: '#ff453a' };
  const JTEXT = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };
  const FEVER_LEN = 8;
  const KP = 1.3; // 透视强度
  const INV_FAR = 1 / (1 + KP);
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif';

  let cv, g;
  let W = 0;
  let H = 0;
  let dpr = 1;
  const geo = {};
  let st = null;
  let cb = {};
  let sprites = null;
  let spriteKey = '';
  const stars = [];
  const spec = new Uint8Array(128);

  // ---------- 初始化 ----------
  G.init = function (canvas, callbacks) {
    cv = canvas;
    g = cv.getContext('2d');
    cb = callbacks || {};
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('pointercancel', onPointerUp);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    for (let i = 0; i < 90; i++) stars.push({ a: Math.random() * Math.PI * 2, d: Math.random(), v: 0.05 + Math.random() * 0.25, s: 0.6 + Math.random() * 1.6 });
    requestAnimationFrame(frame);
  };

  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth;
    H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    geo.cx = W / 2;
    geo.yTop = H * 0.09;
    geo.yJ = H * 0.82;
    geo.wB = Math.min(W * 0.96, H * 0.74, 640);
    geo.lw = geo.wB / 4;
    geo.nh = Math.max(14, geo.lw * 0.2);
  }
  G.resize = resize;

  function proj(p) {
    let z = 1 + (1 - p) * KP;
    if (z < 0.5) z = 0.5;
    const inv = 1 / z;
    const s = (inv - INV_FAR) / (1 - INV_FAR);
    return [geo.yTop + s * (geo.yJ - geo.yTop), inv];
  }
  const laneX = (edge, sc) => geo.cx + (edge - 2) * geo.lw * sc;

  // ---------- 音符贴图 ----------
  function makeSprite(color, core) {
    const c = document.createElement('canvas');
    c.width = 288;
    c.height = 96;
    const x = c.getContext('2d');
    const rr = (px, py, w, h, r) => {
      x.beginPath();
      x.moveTo(px + r, py);
      x.arcTo(px + w, py, px + w, py + h, r);
      x.arcTo(px + w, py + h, px, py + h, r);
      x.arcTo(px, py + h, px, py, r);
      x.arcTo(px, py, px + w, py, r);
      x.closePath();
    };
    x.shadowColor = color;
    x.shadowBlur = 20;
    x.fillStyle = color;
    rr(24, 26, 240, 44, 16);
    x.fill();
    x.fill();
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(0,0,0,0.22)';
    rr(24, 48, 240, 22, 12);
    x.fill();
    x.fillStyle = core || 'rgba(255,255,255,0.92)';
    rr(44, 40, 200, 12, 6);
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.75)';
    x.lineWidth = 2.5;
    rr(25, 27, 238, 42, 15);
    x.stroke();
    return c;
  }
  function buildSprites(colors) {
    const key = colors.join();
    if (spriteKey === key) return;
    spriteKey = key;
    sprites = {
      a: makeSprite(colors[0]),
      b: makeSprite(colors[1]),
      fill: makeSprite('#c7cbe0', 'rgba(255,255,255,0.95)'),
      fever: makeSprite('#ffd60a'),
      dead: makeSprite('#55586a', 'rgba(255,255,255,0.3)'),
    };
  }
  const laneColor = (l) => st.song.colors[l === 0 || l === 3 ? 0 : 1];

  // ---------- 开始 / 结束 ----------
  G.start = function (song, diff, opts) {
    const C = RM.Music.compile(song);
    const chart = RM.Chart.generate(C, diff);
    buildSprites(song.colors);
    resize();
    const notes = chart.notes.map((n) => ({ t: n.t, end: n.end, lane: n.lane, hold: n.hold, fill: n.fill, s: 0 }));
    const lanes = [[], [], [], []];
    notes.forEach((n) => lanes[n.lane].push(n));
    st = {
      song,
      C,
      chart,
      diff,
      auto: !!opts.auto,
      opts,
      notes,
      lanes,
      head: [0, 0, 0, 0],
      first: 0,
      time: C.startTime,
      lastPerf: performance.now(),
      offset: (opts.offset || 0) / 1000,
      approach: 3.6 / (0.5 + opts.speed * 0.3),
      score: 0,
      shown: 0,
      combo: 0,
      maxCombo: 0,
      cnt: { perfect: 0, great: 0, good: 0, miss: 0 },
      accSum: 0,
      judged: 0,
      total: chart.total,
      early: 0,
      late: 0,
      fever: { g: 0, on: false, until: 0, ready: false, used: 0 },
      down: [false, false, false, false],
      autoUp: [0, 0, 0, 0],
      holdN: [null, null, null, null],
      press: [-9, -9, -9, -9],
      hitAt: [-9, -9, -9, -9],
      parts: [],
      rings: [],
      judge: null,
      comboAt: -9,
      shake: 0,
      pointers: {},
      paused: false,
      done: false,
      endAt: Math.max(C.duration, chart.last + 1) + 1.2,
    };
    A.play(C, { from: C.startTime });
    A.duck(false);
  };

  G.active = () => !!st && !st.done;
  G.paused = () => !!st && st.paused;

  G.pause = function () {
    if (!st || st.done || st.paused) return false;
    st.paused = true;
    st.down = [false, false, false, false];
    A.pause();
    return true;
  };
  G.resume = function () {
    if (!st || !st.paused) return;
    A.resume();
    st.paused = false;
    st.lastPerf = performance.now();
  };
  G.quit = function () {
    st = null;
    A.resume();
    A.stop();
  };

  function finish() {
    st.done = true;
    const acc = st.total ? st.accSum / st.total : 0;
    const c = st.cnt;
    let grade = 'D';
    if (acc >= 0.99) grade = 'SS';
    else if (acc >= 0.95) grade = 'S';
    else if (acc >= 0.9) grade = 'A';
    else if (acc >= 0.8) grade = 'B';
    else if (acc >= 0.7) grade = 'C';
    const res = {
      songId: st.song.id,
      diff: st.diff,
      auto: st.auto,
      score: st.score,
      acc,
      grade,
      cnt: Object.assign({}, c),
      maxCombo: st.maxCombo,
      total: st.total,
      fc: c.miss === 0,
      ap: c.perfect === st.total,
      early: st.early,
      late: st.late,
    };
    if (cb.onEnd) cb.onEnd(res);
  }

  // ---------- 判定 ----------
  function judgePos(lane) {
    return [geo.cx + (lane - 1.5) * geo.lw, geo.yJ];
  }

  function burst(lane, j, big) {
    const [x, y] = judgePos(lane);
    const col = st.fever.on ? '#ffd60a' : laneColor(lane);
    st.rings.push({ x, y, t: st.time, col: JCOL[j], big });
    const n = j === 'perfect' ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 140 + Math.random() * 320;
      st.parts.push({ x: x + (Math.random() - 0.5) * geo.lw * 0.5, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: st.time, life: 0.35 + Math.random() * 0.3, col: i % 3 ? col : '#ffffff', s: 2 + Math.random() * 3 });
    }
    if (st.parts.length > 400) st.parts.splice(0, st.parts.length - 400);
  }

  function applyJudge(j, lane, delta, silent) {
    const f = st.fever;
    st.cnt[j]++;
    st.judged++;
    st.accSum += ACCW[j];
    if (j === 'miss') {
      if (st.combo >= 10) st.shake = st.time;
      st.combo = 0;
      A.duck(true);
      if (!f.on) {
        f.g = Math.max(0, f.g - 0.06);
        f.ready = f.g >= 1;
      }
    } else {
      st.combo++;
      if (st.combo > st.maxCombo) st.maxCombo = st.combo;
      const mult = 1 + Math.min(st.combo, 50) * 0.02;
      st.score += Math.round(SCORE[j] * mult * (f.on ? 2 : 1));
      A.duck(false);
      if (!f.on) {
        f.g = Math.min(1, f.g + { perfect: 0.017, great: 0.011, good: 0.005 }[j]);
        if (f.g >= 1 && !f.ready) {
          f.ready = true;
          if (st.auto) G.fever();
        }
      }
      st.hitAt[lane] = st.time;
      burst(lane, j);
      if (j !== 'perfect' && delta) delta < 0 ? st.early++ : st.late++;
      st.comboAt = st.time;
    }
    if (!silent) st.judge = { j, at: st.time, d: j === 'perfect' || j === 'miss' ? 0 : delta };
  }

  function press(lane, t) {
    st.down[lane] = true;
    st.press[lane] = st.time;
    // 同一轨道上还有没结算的长按（低帧率或多指触屏时可能出现），先结算它
    const prevHold = st.holdN[lane];
    if (prevHold && prevHold.s === 3) {
      if (st.auto || t >= prevHold.end - 0.16) completeHold(prevHold);
      else {
        prevHold.s = 5;
        st.holdN[lane] = null;
        applyJudge('miss', lane, 0);
      }
    }
    const list = st.lanes[lane];
    let h = st.head[lane];
    for (; h < list.length; h++) {
      const c = list[h];
      if (c.s !== 0) continue;
      if (t - c.t <= WIN.good) break;
      // 已经过了判定窗口、只是这一帧还没来得及结算的音符：记为漏掉，不让这次按键打到它
      c.s = 2;
      applyJudge('miss', lane, 0);
      if (c.hold) {
        st.cnt.miss++;
        st.judged++;
      }
    }
    st.head[lane] = h;
    const n = list[h];
    if (!n || n.t - t > WIN.good) {
      if (st.opts.hitSound && !st.auto) A.sfx('empty');
      return;
    }
    const d = t - n.t;
    const ad = Math.abs(d);
    const j = ad <= WIN.perfect ? 'perfect' : ad <= WIN.great ? 'great' : 'good';
    if (n.hold) {
      n.s = 3;
      st.holdN[lane] = n;
    } else n.s = 1;
    st.head[lane] = h + 1;
    applyJudge(j, lane, d);
    if (st.opts.hitSound) A.sfx(j);
  }

  function release(lane, t) {
    st.down[lane] = false;
    const n = st.holdN[lane];
    if (n && n.s === 3) {
      if (t >= n.end - 0.16) completeHold(n);
      else {
        n.s = 5;
        st.holdN[lane] = null;
        applyJudge('miss', lane, 0);
      }
    }
  }

  function completeHold(n) {
    n.s = 4;
    st.holdN[n.lane] = null;
    applyJudge('perfect', n.lane, 0, true);
    if (st.opts.hitSound) A.sfx('holdEnd');
  }

  G.fever = function () {
    if (!st || st.done || st.paused) return;
    const f = st.fever;
    if (!f.ready || f.on) return;
    f.on = true;
    f.ready = false;
    f.until = st.time + FEVER_LEN;
    f.used++;
    f.at = st.time;
    A.sfx('fever');
  };

  // ---------- 输入 ----------
  function evTime(e) {
    let ts = e && e.timeStamp;
    const p = performance.now();
    if (!ts || Math.abs(ts - p) > 500) ts = p;
    return st.time + (ts - st.lastPerf) / 1000;
  }
  function onKeyDown(e) {
    if (!st || st.done) return;
    if (e.code === 'Escape') {
      if (cb.onPause) cb.onPause();
      e.preventDefault();
      return;
    }
    if (st.paused || st.auto) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) G.fever();
      return;
    }
    const lane = KEYS.indexOf(e.code);
    if (lane < 0 || e.repeat) return;
    e.preventDefault();
    press(lane, evTime(e));
  }
  function onKeyUp(e) {
    if (!st || st.done || st.paused || st.auto) return;
    const lane = KEYS.indexOf(e.code);
    if (lane >= 0) release(lane, evTime(e));
  }
  function onPointerDown(e) {
    if (!st || st.done || st.paused || st.auto) return;
    e.preventDefault();
    if (e.pointerType === 'touch') st.touch = true;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (st.fever.ready && y < geo.yTop + (geo.yJ - geo.yTop) * 0.45) {
      G.fever();
      return;
    }
    let lane = Math.floor((x - (geo.cx - geo.wB / 2)) / geo.lw);
    lane = Math.max(0, Math.min(3, lane));
    st.pointers[e.pointerId] = lane;
    press(lane, evTime(e));
  }
  function onPointerUp(e) {
    if (!st) return;
    const lane = st.pointers[e.pointerId];
    if (lane === undefined) return;
    delete st.pointers[e.pointerId];
    if (st.done || st.paused || st.auto) return;
    release(lane, evTime(e));
  }

  // ---------- 每帧更新 ----------
  function update() {
    const p = performance.now();
    const a = A.time() - A.latency() - st.offset;
    let est = st.time + (p - st.lastPerf) / 1000;
    if (Math.abs(a - est) > 0.045) est = a;
    else est += (a - est) * 0.1;
    st.time = est;
    st.lastPerf = p;
    const t = st.time;

    for (let l = 0; l < 4; l++) {
      const list = st.lanes[l];
      let h = st.head[l];
      while (h < list.length && list[h].s !== 0) h++;
      // 自动演奏
      if (st.auto) {
        while (h < list.length && list[h].t <= t) {
          const n = list[h];
          press(l, n.t);
          if (!n.hold) st.autoUp[l] = t + 0.08;
          h = st.head[l];
        }
        if (st.down[l] && !st.holdN[l] && t > st.autoUp[l]) st.down[l] = false;
      }
      // 漏掉的音符
      while (h < list.length && list[h].s === 0 && t > list[h].t + WIN.good) {
        const n = list[h];
        n.s = 2;
        applyJudge('miss', l, 0);
        if (n.hold) {
          st.cnt.miss++;
          st.judged++;
        }
        h++;
      }
      st.head[l] = h;
      // 长按完成
      const hn = st.holdN[l];
      if (hn && hn.s === 3) {
        if (t >= hn.end) {
          completeHold(hn);
          if (st.auto) st.down[l] = false;
        } else if (Math.random() < 0.5) {
          const [x, y] = judgePos(l);
          st.parts.push({ x: x + (Math.random() - 0.5) * geo.lw * 0.6, y, vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 260, t, life: 0.3 + Math.random() * 0.25, col: Math.random() < 0.4 ? '#fff' : laneColor(l), s: 2 + Math.random() * 2.5 });
        }
      }
    }

    const f = st.fever;
    if (f.on) {
      f.g = Math.max(0, (f.until - t) / FEVER_LEN);
      if (t >= f.until) {
        f.on = false;
        f.g = 0;
      }
    }
    st.shown += (st.score - st.shown) * 0.25;
    if (st.score - st.shown < 1) st.shown = st.score;
    if (t > st.endAt) finish();
  }

  // ---------- 渲染 ----------
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function drawBackground(t, pulse) {
    const c = st.song.colors;
    const fv = st.fever.on;
    g.fillStyle = '#05060c';
    g.fillRect(0, 0, W, H);
    let gr = g.createRadialGradient(geo.cx, geo.yTop, 0, geo.cx, geo.yTop, H * 0.95);
    gr.addColorStop(0, rgba(fv ? '#ffd60a' : c[0], 0.2 + pulse * 0.14));
    gr.addColorStop(0.55, rgba(c[1], 0.07 + pulse * 0.04));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);

    // 星尘
    const sp = fv ? 3.2 : 1;
    const dt = 1 / 60;
    g.fillStyle = '#fff';
    const R = Math.hypot(W, H) * 0.62;
    for (const s of stars) {
      s.d += s.v * dt * sp * (0.3 + s.d * 1.6);
      if (s.d > 1) {
        s.d = 0.02;
        s.a = Math.random() * Math.PI * 2;
      }
      const x = geo.cx + Math.cos(s.a) * s.d * R;
      const y = geo.yTop + Math.sin(s.a) * s.d * R;
      g.globalAlpha = Math.min(1, s.d * 2.2) * 0.75;
      const sz = s.s * (0.4 + s.d);
      if (fv) {
        g.fillRect(x, y, Math.cos(s.a) * sz * 6 || 1, Math.sin(s.a) * sz * 6 || 1);
      } else g.fillRect(x, y, sz, sz);
    }
    g.globalAlpha = 1;

    // 频谱柱
    A.spectrum(spec);
    const side = geo.cx - geo.wB / 2 - 24;
    if (side > 60) {
      const n = Math.min(22, Math.floor(side / 14));
      const bw = side / n;
      for (let i = 0; i < n; i++) {
        const v = spec[2 + i * 2] / 255;
        const h = v * v * H * 0.42;
        g.fillStyle = rgba(c[0], 0.1 + v * 0.3);
        g.fillRect(side - (i + 1) * bw + 2, H - h, bw - 4, h);
        g.fillStyle = rgba(c[1], 0.1 + v * 0.3);
        g.fillRect(W - side + i * bw + 2, H - h, bw - 4, h);
      }
    }
  }

  function drawHighway(t, pulse) {
    const fv = st.fever.on;
    const c = st.song.colors;
    const sB = (H - geo.yTop) / (geo.yJ - geo.yTop);
    const scB = INV_FAR + sB * (1 - INV_FAR);
    // 路面
    g.beginPath();
    g.moveTo(laneX(0, INV_FAR), geo.yTop);
    g.lineTo(laneX(4, INV_FAR), geo.yTop);
    g.lineTo(laneX(4, scB), H);
    g.lineTo(laneX(0, scB), H);
    g.closePath();
    const gr = g.createLinearGradient(0, geo.yTop, 0, H);
    gr.addColorStop(0, 'rgba(10,11,22,0)');
    gr.addColorStop(0.25, 'rgba(10,11,22,0.72)');
    gr.addColorStop(1, 'rgba(6,7,14,0.94)');
    g.fillStyle = gr;
    g.fill();

    // 节拍线
    const spb = st.C.spb;
    const pulseLen = st.C.pulse;
    const b0 = Math.ceil((t - 0.2) / spb / pulseLen);
    const b1 = Math.floor((t + st.approach) / spb / pulseLen);
    for (let b = b0; b <= b1; b++) {
      const beat = b * pulseLen;
      if (beat < -1e-6 || beat > st.C.totalBeats) continue;
      const p = 1 - (beat * spb - t) / st.approach;
      const [y, sc] = proj(p);
      const isBar = Math.abs(beat / st.C.bar - Math.round(beat / st.C.bar)) < 1e-4;
      g.strokeStyle = `rgba(255,255,255,${(isBar ? 0.2 : 0.07) * Math.min(1, p * 3)})`;
      g.lineWidth = isBar ? 1.5 : 1;
      g.beginPath();
      g.moveTo(laneX(0, sc), y);
      g.lineTo(laneX(4, sc), y);
      g.stroke();
    }

    // 轨道按下的光柱
    for (let l = 0; l < 4; l++) {
      const age = t - st.press[l];
      const hit = t - st.hitAt[l];
      let a = st.down[l] ? 0.3 : Math.max(0, 0.3 - age * 1.6);
      a += Math.max(0, 0.38 - hit * 2.2);
      if (a <= 0.01) continue;
      const [yU, scU] = proj(0.42);
      const col = fv ? '#ffd60a' : laneColor(l);
      const lg = g.createLinearGradient(0, geo.yJ, 0, yU);
      lg.addColorStop(0, rgba(col, a));
      lg.addColorStop(1, rgba(col, 0));
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(laneX(l, 1), geo.yJ);
      g.lineTo(laneX(l + 1, 1), geo.yJ);
      g.lineTo(laneX(l + 1, scU), yU);
      g.lineTo(laneX(l, scU), yU);
      g.closePath();
      g.fill();
    }

    // 轨道线
    for (let e = 0; e <= 4; e++) {
      const edge = e === 0 || e === 4;
      const lg = g.createLinearGradient(0, geo.yTop, 0, H);
      const col = edge ? (fv ? '#ffd60a' : c[e === 0 ? 0 : 1]) : '#ffffff';
      lg.addColorStop(0, rgba(col, 0));
      lg.addColorStop(0.3, rgba(col, edge ? 0.55 + pulse * 0.3 : 0.1));
      lg.addColorStop(1, rgba(col, edge ? 0.8 : 0.14));
      g.strokeStyle = lg;
      g.lineWidth = edge ? 2.5 : 1;
      g.beginPath();
      g.moveTo(laneX(e, INV_FAR), geo.yTop);
      g.lineTo(laneX(e, scB), H);
      g.stroke();
    }
  }

  function drawNoteSprite(sp, lane, y, sc, alpha) {
    const w = geo.lw * sc * 0.9;
    const h = geo.nh * sc;
    const cx = geo.cx + (lane - 1.5) * geo.lw * sc;
    g.globalAlpha = alpha;
    // 贴图里音符本体占 240x44，四周是光晕
    g.drawImage(sp, cx - (w * 288) / 240 / 2, y - (h * 96) / 44 / 2, (w * 288) / 240, (h * 96) / 44);
    g.globalAlpha = 1;
  }

  function drawNotes(t) {
    const fv = st.fever.on;
    const ap = st.approach;
    const notes = st.notes;
    while (st.first < notes.length) {
      const n = notes[st.first];
      const tailT = n.hold ? n.end : n.t;
      if ((n.s === 1 || n.s === 4 || t - tailT > ap * 0.5) && t > tailT) st.first++;
      else break;
    }
    // 先画长条，再画音符头
    for (let pass = 0; pass < 2; pass++) {
      for (let i = st.first; i < notes.length; i++) {
        const n = notes[i];
        if (n.t > t + ap) break;
        if (n.s === 1 || n.s === 4) continue;
        const dead = n.s === 2 || n.s === 5;
        let p = 1 - (n.t - t) / ap;
        if (n.hold) {
          if (n.s === 3) p = 1;
          const pT = Math.max(0, 1 - (n.end - t) / ap);
          if (pT > 1.5) continue;
          if (pass === 0) {
            const pH = Math.min(p, 1.6);
            if (pH > pT) {
              const [y1, s1] = proj(pH);
              const [y2, s2] = proj(pT);
              const col = dead ? '#55586a' : fv ? '#ffd60a' : laneColor(n.lane);
              const in1 = 0.16;
              g.beginPath();
              g.moveTo(laneX(n.lane + in1, s1), y1);
              g.lineTo(laneX(n.lane + 1 - in1, s1), y1);
              g.lineTo(laneX(n.lane + 1 - in1, s2), y2);
              g.lineTo(laneX(n.lane + in1, s2), y2);
              g.closePath();
              g.fillStyle = rgba(col, dead ? 0.22 : n.s === 3 ? 0.78 : 0.48);
              g.fill();
              g.strokeStyle = rgba(dead ? '#888' : '#ffffff', dead ? 0.25 : n.s === 3 ? 0.9 : 0.6);
              g.lineWidth = 2;
              g.stroke();
              // 中心亮线
              g.strokeStyle = rgba('#ffffff', dead ? 0.1 : 0.5);
              g.lineWidth = 3 * s1;
              g.beginPath();
              g.moveTo(laneX(n.lane + 0.5, s1), y1);
              g.lineTo(laneX(n.lane + 0.5, s2), y2);
              g.stroke();
              // 尾端
              g.fillStyle = rgba('#ffffff', dead ? 0.2 : 0.85);
              g.fillRect(laneX(n.lane + in1, s2), y2 - 2, (1 - in1 * 2) * geo.lw * s2, 4);
            }
          } else if (n.s !== 5 || p < 1.5) {
            const [y, sc] = proj(Math.min(p, 1.6));
            const sp = dead ? sprites.dead : fv ? sprites.fever : n.lane === 0 || n.lane === 3 ? sprites.a : sprites.b;
            if (n.s === 3) {
              // 按住中：判定线处的呼吸光
              const [x, yy] = judgePos(n.lane);
              const r = geo.lw * (0.42 + 0.06 * Math.sin(t * 30));
              const rg = g.createRadialGradient(x, yy, 0, x, yy, r);
              rg.addColorStop(0, 'rgba(255,255,255,0.9)');
              rg.addColorStop(0.35, rgba(fv ? '#ffd60a' : laneColor(n.lane), 0.6));
              rg.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = rg;
              g.fillRect(x - r, yy - r, r * 2, r * 2);
            }
            drawNoteSprite(sp, n.lane, y, sc, dead ? 0.4 : Math.min(1, p * 5));
          }
        } else if (pass === 1) {
          if (p > 1.6) continue;
          const [y, sc] = proj(p);
          const sp = dead ? sprites.dead : fv ? sprites.fever : n.fill ? sprites.fill : n.lane === 0 || n.lane === 3 ? sprites.a : sprites.b;
          drawNoteSprite(sp, n.lane, y, sc, dead ? 0.35 : Math.min(1, p * 5));
        }
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawJudgeLine(t, pulse) {
    const fv = st.fever.on;
    const x0 = laneX(0, 1);
    const h = geo.nh;
    // 判定线
    g.shadowColor = fv ? '#ffd60a' : '#ffffff';
    g.shadowBlur = 14 + pulse * 10;
    g.fillStyle = `rgba(255,255,255,${0.75 + pulse * 0.25})`;
    g.fillRect(x0, geo.yJ - 1.5, geo.wB, 3);
    g.shadowBlur = 0;
    for (let l = 0; l < 4; l++) {
      const col = fv ? '#ffd60a' : laneColor(l);
      const x = x0 + l * geo.lw + geo.lw * 0.05;
      const w = geo.lw * 0.9;
      const dn = st.down[l];
      roundRect(x, geo.yJ - h / 2, w, h, h * 0.36);
      g.fillStyle = rgba(col, dn ? 0.5 : 0.1);
      g.fill();
      g.strokeStyle = rgba(col, dn ? 1 : 0.6);
      g.lineWidth = 2;
      g.stroke();
      // 键位提示
      if (!st.touch) {
        g.font = `600 ${Math.round(geo.lw * 0.17)}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = `rgba(255,255,255,${dn ? 0.95 : 0.4})`;
        g.fillText(LABELS[l], x + w / 2, geo.yJ + h * 1.5);
      }
    }
  }

  function drawFx(t) {
    g.globalCompositeOperation = 'lighter';
    // 光环
    for (let i = st.rings.length - 1; i >= 0; i--) {
      const r = st.rings[i];
      const a = (t - r.t) / 0.32;
      if (a >= 1 || a < 0) {
        st.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - a, 3);
      g.strokeStyle = rgba(r.col, (1 - a) * 0.9);
      g.lineWidth = 4 * (1 - a) + 1;
      g.beginPath();
      g.ellipse(r.x, r.y, geo.lw * (0.25 + e * 0.5), geo.lw * (0.12 + e * 0.26), 0, 0, Math.PI * 2);
      g.stroke();
      // 中心闪光
      const fr = geo.lw * 0.55 * (1 - a);
      const rg = g.createRadialGradient(r.x, r.y, 0, r.x, r.y, fr);
      rg.addColorStop(0, `rgba(255,255,255,${0.75 * (1 - a)})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(r.x - fr, r.y - fr, fr * 2, fr * 2);
    }
    // 粒子
    for (let i = st.parts.length - 1; i >= 0; i--) {
      const p = st.parts[i];
      const age = t - p.t;
      if (age >= p.life || age < 0) {
        st.parts.splice(i, 1);
        continue;
      }
      const k = 1 - age / p.life;
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age + 420 * age * age;
      g.fillStyle = rgba(p.col, k);
      g.fillRect(x - p.s / 2, y - p.s / 2, p.s * k + 1, p.s * k + 1);
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawHud(t, pulse) {
    const f = st.fever;
    const c = st.song.colors;
    g.textBaseline = 'alphabetic';

    // 进度条
    const prog = Math.max(0, Math.min(1, t / st.C.duration));
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(0, 0, W, 3);
    g.fillStyle = f.on ? '#ffd60a' : c[0];
    g.fillRect(0, 0, W * prog, 3);

    const narrow = W < 620;
    const pad = narrow ? 14 : 28;
    // 左上：曲名与分数
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `500 ${narrow ? 12 : 14}px ${FONT}`;
    g.fillText(`${st.song.title} · ${['简单', '普通', '困难'][st.diff]}${st.auto ? ' · 自动演示' : ''}`, pad, 34);
    g.fillStyle = '#fff';
    g.font = `600 ${narrow ? 26 : 38}px ${FONT}`;
    g.fillText(String(Math.round(st.shown)).padStart(7, '0'), pad, narrow ? 64 : 76);

    // 右上：准确率
    g.textAlign = 'right';
    const rx = W - pad - (narrow ? 58 : 60);
    const acc = st.judged ? (st.accSum / st.judged) * 100 : 100;
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `500 ${narrow ? 12 : 14}px ${FONT}`;
    g.fillText('准确率', rx, 34);
    g.fillStyle = '#fff';
    g.font = `600 ${narrow ? 20 : 28}px ${FONT}`;
    g.fillText(acc.toFixed(2) + '%', rx, narrow ? 60 : 68);

    // 连击
    g.textAlign = 'center';
    if (st.combo >= 3) {
      const age = t - st.comboAt;
      const sc = 1 + 0.22 * Math.exp(-age * 16);
      const y = geo.yTop + (geo.yJ - geo.yTop) * 0.36;
      g.save();
      g.translate(geo.cx, y);
      g.scale(sc, sc);
      g.fillStyle = f.on ? '#ffd60a' : `rgba(255,255,255,0.92)`;
      g.font = `700 ${Math.round(geo.lw * 0.62)}px ${FONT}`;
      g.shadowColor = f.on ? '#ffd60a' : c[0];
      g.shadowBlur = 24;
      g.fillText(String(st.combo), 0, 0);
      g.shadowBlur = 0;
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = `600 ${Math.round(geo.lw * 0.13)}px ${FONT}`;
      g.fillText('COMBO', geo.cx, y + geo.lw * 0.2);
    }

    // 判定文字
    if (st.judge) {
      const age = t - st.judge.at;
      if (age < 0.6) {
        const sc = 1 + 0.4 * Math.exp(-age * 18);
        const al = age < 0.4 ? 1 : 1 - (age - 0.4) / 0.2;
        const y = geo.yTop + (geo.yJ - geo.yTop) * 0.66;
        g.save();
        g.translate(geo.cx, y - age * 22);
        g.scale(sc, sc);
        g.globalAlpha = al;
        g.fillStyle = JCOL[st.judge.j];
        g.shadowColor = JCOL[st.judge.j];
        g.shadowBlur = 18;
        g.font = `italic 700 ${Math.round(geo.lw * 0.3)}px ${FONT}`;
        g.fillText(JTEXT[st.judge.j], 0, 0);
        g.shadowBlur = 0;
        if (st.judge.d) {
          g.font = `600 ${Math.round(geo.lw * 0.11)}px ${FONT}`;
          g.fillStyle = st.judge.d < 0 ? '#64d2ff' : '#ff9f0a';
          g.fillText(st.judge.d < 0 ? '偏早' : '偏晚', 0, geo.lw * 0.2);
        }
        g.restore();
        g.globalAlpha = 1;
      }
    }

    // Fever 能量槽
    const gw = geo.wB * 0.56;
    const gx = geo.cx - gw / 2;
    const gy = Math.min(H - 22, geo.yJ + geo.nh * 2.6);
    roundRect(gx, gy, gw, 8, 4);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fill();
    if (f.g > 0.005) {
      roundRect(gx, gy, Math.max(8, gw * f.g), 8, 4);
      g.fillStyle = f.on || f.ready ? '#ffd60a' : c[0];
      if (f.ready || f.on) {
        g.shadowColor = '#ffd60a';
        g.shadowBlur = 12 + pulse * 12;
      }
      g.fill();
      g.shadowBlur = 0;
    }
    g.font = `600 ${narrow ? 11 : 12}px ${FONT}`;
    if (f.on) {
      g.fillStyle = '#ffd60a';
      g.fillText('FEVER  ×2', geo.cx, gy - 7);
    } else if (f.ready) {
      g.fillStyle = `rgba(255,214,10,${0.65 + 0.35 * Math.sin(t * 9)})`;
      g.fillText(st.touch ? 'FEVER 就绪 · 点击上方轨道' : 'FEVER 就绪 · 按空格', geo.cx, gy - 7);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillText('FEVER', geo.cx, gy - 7);
    }

    // Fever 启动时的大字与边缘光
    if (f.on) {
      const age = t - f.at;
      const vg = g.createRadialGradient(geo.cx, H / 2, Math.min(W, H) * 0.35, geo.cx, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(255,214,10,0)');
      vg.addColorStop(1, `rgba(255,170,10,${0.16 + pulse * 0.16})`);
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
      if (age < 1.1) {
        const sc = 0.7 + 0.5 * (1 - Math.exp(-age * 9));
        g.save();
        g.translate(geo.cx, H * 0.24);
        g.scale(sc, sc);
        g.globalAlpha = age < 0.8 ? 1 : 1 - (age - 0.8) / 0.3;
        g.fillStyle = '#ffd60a';
        g.shadowColor = '#ff9f0a';
        g.shadowBlur = 30;
        g.font = `italic 700 ${Math.round(geo.lw * 0.52)}px ${FONT}`;
        g.fillText('FEVER!', 0, 0);
        g.restore();
        g.globalAlpha = 1;
        g.shadowBlur = 0;
      }
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!st || !W) return;
    if (!st.paused && !st.done) update();
    if (!st) return;
    const t = st.time;
    const beat = t / st.C.spb / st.C.pulse;
    const ph = beat - Math.floor(beat);
    const pulse = t >= 0 && t < st.C.duration ? Math.exp(-ph * 4.5) : 0;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(t, pulse);
    g.save();
    const sh = t - st.shake;
    if (sh >= 0 && sh < 0.25) g.translate(Math.sin(sh * 90) * 6 * (1 - sh / 0.25), 0);
    drawHighway(t, pulse);
    drawNotes(t);
    drawJudgeLine(t, pulse);
    drawFx(t);
    g.restore();
    drawHud(t, pulse);
  }

  G.setTouch = (v) => {
    if (st) st.touch = v;
  };
  G._state = () => st;
  // 调试用：不依赖 requestAnimationFrame 推进一帧逻辑（后台标签页里动画帧会停）
  G._tick = () => {
    if (st && !st.paused && !st.done) update();
  };
})();
