/* 音频引擎：Web Audio 实时合成（无任何音频文件）。
 * 乐器 = 多振荡器 + 低通包络；鼓 = 正弦扫频 / 滤波噪声；带卷积混响与总线压缩。
 */
(function () {
  const RM = (window.RM = window.RM || {});
  const A = (RM.Audio = {});

  let ctx = null;
  let master, comp, analyser, musicBus, sfxBus, conv, noise;
  let sess = null;
  let timer = null;
  let events = null;
  let evIdx = 0;
  let t0 = 0;
  const vol = { music: 0.8, sfx: 0.8 };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // o: [波形, 频率倍数, 音量, 失谐(音分)]；f: [起始截止倍数, 结束截止倍数, 时间]
  const P = {
    piano: { o: [['triangle', 1, 0.9, 0], ['sine', 2, 0.35, 0], ['sine', 3, 0.12, 2], ['sine', 4, 0.05, 0]], a: 0.004, d: 0.7, s: 0.12, r: 0.3, f: [9, 2.5, 0.5], g: 0.36 },
    keys: { o: [['triangle', 1, 0.8, 0], ['sine', 2, 0.25, 0]], a: 0.005, d: 0.35, s: 0.15, r: 0.15, f: [6, 2, 0.3], g: 0.09 },
    harp: { o: [['triangle', 1, 0.8, 0], ['sine', 2, 0.3, 0], ['sine', 3, 0.1, 0]], a: 0.003, d: 0.5, s: 0.05, r: 0.4, f: [8, 2, 0.25], g: 0.14 },
    pluck: { o: [['sawtooth', 1, 0.55, 0], ['triangle', 2, 0.3, 3], ['sine', 1, 0.4, 0]], a: 0.003, d: 0.6, s: 0.08, r: 0.35, f: [11, 1.6, 0.22], bend: 22, g: 0.44 },
    lead: { o: [['sawtooth', 1, 0.5, -8], ['sawtooth', 1, 0.5, 8], ['square', 0.5, 0.16, 0]], a: 0.008, d: 0.18, s: 0.65, r: 0.12, f: [7, 3, 0.2], g: 0.46 },
    square: { o: [['square', 1, 0.5, 0], ['square', 1, 0.3, 9], ['triangle', 2, 0.2, 0]], a: 0.004, d: 0.12, s: 0.55, r: 0.08, f: [8, 4, 0.15], g: 0.36 },
    strings: { o: [['sawtooth', 1, 0.5, -6], ['sawtooth', 1, 0.5, 6], ['sine', 1, 0.3, 0]], a: 0.025, d: 0.25, s: 0.8, r: 0.18, f: [5, 3.5, 0.3], vib: 5.5, g: 0.36 },
    pad: { o: [['sawtooth', 1, 0.4, -9], ['sawtooth', 1, 0.4, 9], ['sine', 1, 0.5, 0]], a: 0.15, d: 0.4, s: 0.8, r: 0.5, f: [3, 3, 0.1], g: 0.04 },
    bass: { o: [['sawtooth', 1, 0.5, 0], ['sine', 1, 0.9, 0]], a: 0.006, d: 0.18, s: 0.55, r: 0.08, f: [6, 2.5, 0.15], g: 0.2 },
    bell: { o: [['sine', 1, 1, 0], ['sine', 4, 0.3, 0], ['sine', 6.02, 0.1, 0]], a: 0.002, d: 0.8, s: 0.04, r: 0.5, f: [20, 20, 0.1], g: 0.26 },
  };

  A.ensure = function () {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master = ctx.createGain();
    master.gain.value = 0.95;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    master.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = vol.music;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = vol.sfx;
    sfxBus.connect(master);

    // 噪声源
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

    // 混响脉冲响应
    const rl = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < rl; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2);
    }
    conv = ctx.createConvolver();
    conv.buffer = ir;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.9;
    conv.connect(revOut);
    revOut.connect(musicBus);
    return ctx;
  };

  function playNote(inst, midi, t, dur, vel, dest) {
    const p = P[inst] || P.piano;
    const f = mtof(midi);
    const hi = midi > 84 ? 0.8 : 1;
    const peak = p.g * vel * hi;
    const end = Math.max(t + dur, t + p.a + 0.02);
    const stopAt = end + p.r * 2.2 + 0.05;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + p.a);
    g.gain.setTargetAtTime(peak * p.s, t + p.a, p.d / 3);
    g.gain.setTargetAtTime(0, end, p.r / 3);

    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 0.7;
    const c0 = Math.min(13000, Math.max(300, f * p.f[0]));
    const c1 = Math.min(13000, Math.max(250, f * p.f[1]));
    flt.frequency.setValueAtTime(c0, t);
    flt.frequency.exponentialRampToValueAtTime(c1, t + p.f[2]);
    flt.connect(g);
    g.connect(dest);

    let lfo = null;
    let lg = null;
    if (p.vib && dur > 0.3) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = p.vib;
      lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(9, t + 0.3);
      lfo.connect(lg);
      lfo.start(t);
      lfo.stop(stopAt);
    }
    for (const [type, mul, lvl, det] of p.o) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      if (p.bend) {
        o.detune.setValueAtTime(det + p.bend, t);
        o.detune.linearRampToValueAtTime(det, t + 0.06);
      } else o.detune.value = det;
      if (lg) lg.connect(o.detune);
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og);
      og.connect(flt);
      o.start(t);
      o.stop(stopAt);
    }
  }

  function noiseHit(t, v, dur, type, freq, q, dest) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = freq;
    flt.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  function tone(t, v, type, f0, f1, sweep, dur, dest) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function drum(name, t, v, dest) {
    switch (name) {
      case 'kick':
        tone(t, v * 0.95, 'sine', 165, 42, 0.11, 0.3, dest);
        noiseHit(t, v * 0.12, 0.012, 'highpass', 2000, 0.7, dest);
        break;
      case 'snare':
        noiseHit(t, v * 0.42, 0.17, 'highpass', 1500, 0.7, dest);
        tone(t, v * 0.32, 'triangle', 210, 130, 0.08, 0.1, dest);
        break;
      case 'hat':
        noiseHit(t, v * 0.2, 0.045, 'highpass', 8200, 0.7, dest);
        break;
      case 'rim':
        tone(t, v * 0.22, 'sine', 830, 830, 0, 0.035, dest);
        noiseHit(t, v * 0.08, 0.02, 'bandpass', 3200, 1.2, dest);
        break;
      case 'stick':
        tone(t, v * 0.3, 'sine', 1650, 1500, 0.02, 0.05, dest);
        noiseHit(t, v * 0.1, 0.02, 'bandpass', 4200, 1.5, dest);
        break;
      case 'crash':
        noiseHit(t, v * 0.22, 1.4, 'highpass', 5200, 0.7, dest);
        break;
    }
  }

  function newSession(gain) {
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(musicBus);
    const mel = ctx.createGain();
    const acc = ctx.createGain();
    const drm = ctx.createGain();
    drm.gain.value = 0.85;
    mel.connect(out);
    acc.connect(out);
    drm.connect(out);
    const ms = ctx.createGain();
    ms.gain.value = 0.2;
    mel.connect(ms);
    const as = ctx.createGain();
    as.gain.value = 0.1;
    acc.connect(as);
    const rs = ctx.createGain();
    rs.gain.value = gain;
    ms.connect(rs);
    as.connect(rs);
    rs.connect(conv);
    return { out, mel, acc, drm, rs };
  }

  function tick() {
    if (!events || !ctx) return;
    const now = ctx.currentTime;
    const horizon = now + 0.22;
    while (evIdx < events.length && t0 + events[evIdx].t < horizon) {
      const e = events[evIdx++];
      let when = t0 + e.t;
      if (when < now - 0.25) continue; // 迟到太多（标签页被节流）直接丢弃
      if (when < now) when = now + 0.003;
      if (e.k === 'n') playNote(e.inst, e.midi, when, e.dur, e.v, e.bus === 'mel' ? sess.mel : sess.acc);
      else drum(e.d, when, e.v, sess.drm);
    }
  }

  /** 播放编译后的曲目。opts.from = 起始的歌曲时间（秒，可为负数表示预备拍），opts.gain = 整体音量 */
  A.play = function (compiled, opts) {
    A.ensure();
    A.stop();
    opts = opts || {};
    sess = newSession(opts.gain == null ? 1 : opts.gain);
    events = compiled.events;
    const from = opts.from == null ? compiled.startTime : opts.from;
    evIdx = 0;
    while (evIdx < events.length && events[evIdx].t < from) evIdx++;
    t0 = ctx.currentTime + 0.12 - from;
    timer = setInterval(tick, 25);
    tick();
  };

  A.stop = function () {
    if (timer) clearInterval(timer);
    timer = null;
    events = null;
    if (sess && ctx) {
      const s = sess;
      const now = ctx.currentTime;
      s.out.gain.setTargetAtTime(0, now, 0.03);
      s.rs.gain.setTargetAtTime(0, now, 0.05);
      setTimeout(() => {
        try {
          s.out.disconnect();
          s.rs.disconnect();
        } catch (e) {}
      }, 400);
    }
    sess = null;
  };

  /** 当前歌曲时间（秒） */
  A.time = () => (ctx ? ctx.currentTime - t0 : 0);
  A.latency = () => (ctx ? ctx.outputLatency || ctx.baseLatency || 0 : 0);
  A.pause = () => ctx && ctx.state === 'running' && ctx.suspend();
  A.resume = () => ctx && ctx.state !== 'running' && ctx.resume();
  A.running = () => !!ctx && ctx.state === 'running';

  /** 失误时压低主旋律，重新打中后恢复 */
  A.duck = function (on) {
    if (sess) sess.mel.gain.setTargetAtTime(on ? 0.28 : 1, ctx.currentTime, 0.035);
  };

  A.setVolume = function (kind, v) {
    vol[kind] = v;
    if (!ctx) return;
    (kind === 'music' ? musicBus : sfxBus).gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  };

  A.spectrum = function (arr) {
    if (analyser) analyser.getByteFrequencyData(arr);
  };

  // ---------- 音效 ----------
  A.sfx = function (name) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const d = sfxBus;
    switch (name) {
      case 'perfect':
        noiseHit(t, 0.3, 0.035, 'bandpass', 3600, 1, d);
        tone(t, 0.16, 'sine', 2300, 2000, 0.03, 0.05, d);
        break;
      case 'great':
      case 'good':
        noiseHit(t, 0.26, 0.035, 'bandpass', 2600, 1, d);
        tone(t, 0.12, 'sine', 1700, 1500, 0.03, 0.045, d);
        break;
      case 'empty':
        noiseHit(t, 0.1, 0.025, 'bandpass', 1500, 1, d);
        break;
      case 'holdEnd':
        tone(t, 0.12, 'sine', 1320, 1980, 0.08, 0.12, d);
        break;
      case 'fever':
        noiseHit(t, 0.25, 0.7, 'highpass', 3000, 0.7, d);
        tone(t, 0.14, 'sawtooth', 220, 1760, 0.45, 0.5, d);
        [0, 4, 7, 12].forEach((iv, i) => playNote('bell', 84 + iv, t + 0.05 + i * 0.06, 0.3, 0.8, d));
        break;
      case 'click':
        tone(t, 0.12, 'sine', 1100, 900, 0.02, 0.04, d);
        break;
      case 'start':
        [0, 7, 12].forEach((iv, i) => playNote('bell', 72 + iv, t + i * 0.07, 0.3, 0.7, d));
        break;
      case 'result':
        [0, 4, 7, 12, 16].forEach((iv, i) => playNote('bell', 72 + iv, t + i * 0.09, 0.5, 0.8, d));
        break;
      case 'count':
        tone(t, 0.2, 'sine', 880, 880, 0, 0.09, d);
        break;
    }
  };

  A._dbg = () => ({ ctx, master, musicBus, sfxBus, sess, analyser });
})();
