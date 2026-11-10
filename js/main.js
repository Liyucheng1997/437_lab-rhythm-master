/* 主流程：标题 → 选歌 → 游戏 → 结算，以及设置 / 暂停 / 成绩存档。 */
(function () {
  const RM = window.RM;
  const A = RM.Audio;
  const Game = RM.Game;
  const SONGS = RM.SONGS;
  const DIFFS = ['简单', '普通', '困难'];
  const $ = (s) => document.querySelector(s);

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : d;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
  };
  const settings = Object.assign({ speed: 5, offset: 0, music: 80, sfx: 80, hitSound: true }, store.get('xinggui.settings', {}));
  const records = store.get('xinggui.records', {});
  const cur = Object.assign({ song: 0, diff: 1 }, store.get('xinggui.last', {}));
  if (!SONGS[cur.song]) cur.song = 0;
  if (!DIFFS[cur.diff]) cur.diff = 1;

  let screen = 'title';
  let lastAuto = false;
  let previewTimer = 0;
  let countdownTimer = 0;

  const compiled = (i) => RM.Music.compile(SONGS[i]);
  const chartOf = (i, d) => RM.Chart.generate(compiled(i), d);
  const recKey = (id, d) => id + ':' + d;
  const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  const fmtNum = (n) => n.toLocaleString('en-US');

  function show(name) {
    screen = name;
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'scr-' + name));
  }

  // ---------- 选歌 ----------
  function renderList() {
    const box = $('#song-list');
    box.innerHTML = '';
    $('#song-count').textContent = SONGS.length + ' 首';
    SONGS.forEach((s, i) => {
      const rec = records[recKey(s.id, cur.diff)];
      const b = document.createElement('button');
      b.className = 'song' + (i === cur.song ? ' active' : '');
      b.innerHTML =
        `<span class="song-no tabular">${i + 1}</span>` +
        `<span class="song-main"><div class="song-title">${s.title}</div><div class="song-sub">${s.composer} · ${s.en}</div></span>` +
        `<span class="song-lv tabular">Lv.${chartOf(i, cur.diff).level}</span>` +
        `<span class="song-grade${rec ? '' : ' none'}">${rec ? rec.grade : '–'}</span>`;
      b.addEventListener('click', () => selectSong(i, true));
      box.appendChild(b);
    });
  }

  function renderDetail() {
    const s = SONGS[cur.song];
    const C = compiled(cur.song);
    const ch = chartOf(cur.song, cur.diff);
    $('#d-title').textContent = s.title;
    $('#d-sub').textContent = `${s.composer} · ${s.en}`;
    $('#d-bpm').textContent = s.bpm + ' BPM';
    $('#d-len').textContent = fmtTime(C.duration);
    $('#d-notes').textContent = ch.count;
    const seg = $('#d-diff');
    seg.innerHTML = '';
    DIFFS.forEach((name, d) => {
      const b = document.createElement('button');
      b.className = d === cur.diff ? 'active' : '';
      b.innerHTML = `${name}<small>Lv.${chartOf(cur.song, d).level}</small>`;
      b.addEventListener('click', () => setDiff(d, true));
      seg.appendChild(b);
    });
    const rec = records[recKey(s.id, cur.diff)];
    $('#d-best').innerHTML = rec
      ? `<div class="best-grade">${rec.grade}</div><div class="best-main"><b>${fmtNum(rec.score)}</b><span>准确率 ${(rec.acc * 100).toFixed(2)}% · 最大连击 ${rec.combo}</span></div>` +
        (rec.ap ? '<span class="badge blue">全 Perfect</span>' : rec.fc ? '<span class="badge">全连</span>' : '')
      : '<span class="muted">还没有成绩，来一局吧</span>';
  }

  function selectSong(i, click) {
    cur.song = (i + SONGS.length) % SONGS.length;
    store.set('xinggui.last', cur);
    document.querySelectorAll('.song').forEach((el, k) => {
      el.classList.toggle('active', k === cur.song);
      if (k === cur.song) el.scrollIntoView({ block: 'nearest' });
    });
    renderDetail();
    if (click) A.sfx('click');
    schedulePreview();
  }

  function setDiff(d, click) {
    cur.diff = Math.max(0, Math.min(2, d));
    store.set('xinggui.last', cur);
    renderList();
    renderDetail();
    if (click) A.sfx('click');
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    A.stop();
    previewTimer = setTimeout(() => {
      if (screen === 'select') A.play(compiled(cur.song), { from: -0.05, gain: 0.6 });
    }, 380);
  }

  function enterSelect() {
    show('select');
    renderList();
    renderDetail();
    schedulePreview();
  }

  // ---------- 游戏 ----------
  function startGame(auto) {
    clearTimeout(previewTimer);
    clearInterval(countdownTimer);
    $('#countdown').hidden = true;
    $('#m-pause').hidden = true;
    lastAuto = auto;
    A.ensure();
    A.resume();
    show('stage');
    Game.start(SONGS[cur.song], cur.diff, { auto, speed: settings.speed, offset: settings.offset, hitSound: settings.hitSound });
  }

  function pauseGame() {
    if (screen !== 'stage' || !$('#countdown').hidden) return;
    if (Game.paused()) return resumeGame();
    if (Game.pause()) $('#m-pause').hidden = false;
  }

  function resumeGame() {
    $('#m-pause').hidden = true;
    const el = $('#countdown');
    let n = 3;
    el.hidden = false;
    el.innerHTML = `<span>${n}</span>`;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(countdownTimer);
        el.hidden = true;
        Game.resume();
      } else el.innerHTML = `<span>${n}</span>`;
    }, 600);
  }

  function quitGame() {
    clearInterval(countdownTimer);
    $('#countdown').hidden = true;
    $('#m-pause').hidden = true;
    Game.quit();
    enterSelect();
  }

  function showResult(r) {
    const s = SONGS[cur.song];
    $('#r-grade').textContent = r.grade;
    $('#r-title').textContent = s.title;
    $('#r-sub').textContent = `${s.composer} · ${DIFFS[r.diff]} Lv.${chartOf(cur.song, r.diff).level}`;
    $('#r-score').textContent = fmtNum(r.score);
    $('#r-acc').textContent = (r.acc * 100).toFixed(2) + '%';
    $('#r-combo').textContent = r.maxCombo;
    $('#r-el').textContent = `${r.early} / ${r.late}`;
    $('#r-perfect').textContent = r.cnt.perfect;
    $('#r-great').textContent = r.cnt.great;
    $('#r-good').textContent = r.cnt.good;
    $('#r-miss').textContent = r.cnt.miss;

    const badges = [];
    if (r.auto) badges.push('<span class="badge warn">自动演示 · 不计入成绩</span>');
    else {
      const key = recKey(s.id, r.diff);
      const old = records[key];
      if (!old || r.score > old.score) {
        records[key] = { score: r.score, acc: r.acc, grade: r.grade, combo: r.maxCombo, fc: r.fc, ap: r.ap };
        store.set('xinggui.records', records);
        badges.push('<span class="badge blue">新纪录</span>');
      }
    }
    if (r.ap) badges.push('<span class="badge blue">全 Perfect</span>');
    else if (r.fc) badges.push('<span class="badge">全连</span>');
    $('#r-badges').innerHTML = badges.join('');
    Game.quit();
    show('result');
    A.sfx('result');
  }

  // ---------- 设置 ----------
  function bindRange(id, key, fmt, apply) {
    const el = $('#s-' + id);
    const out = $('#v-' + id);
    el.value = settings[key];
    out.textContent = fmt(settings[key]);
    el.addEventListener('input', () => {
      settings[key] = +el.value;
      out.textContent = fmt(settings[key]);
      store.set('xinggui.settings', settings);
      if (apply) apply(settings[key]);
    });
  }
  function initSettings() {
    bindRange('speed', 'speed', (v) => v + ' 档');
    bindRange('offset', 'offset', (v) => (v > 0 ? '+' : '') + v + ' ms');
    bindRange('music', 'music', (v) => v + '%', (v) => A.setVolume('music', v / 100));
    bindRange('sfx', 'sfx', (v) => v + '%', (v) => A.setVolume('sfx', v / 100));
    const hit = $('#s-hit');
    hit.checked = settings.hitSound;
    hit.addEventListener('change', () => {
      settings.hitSound = hit.checked;
      store.set('xinggui.settings', settings);
    });
    A.setVolume('music', settings.music / 100);
    A.setVolume('sfx', settings.sfx / 100);
  }

  const openModal = (id) => {
    $(id).hidden = false;
    A.sfx('click');
  };
  const anyModal = () => !$('#m-settings').hidden || !$('#m-help').hidden;

  // ---------- 事件 ----------
  function init() {
    initSettings();
    $('#d-cover').innerHTML = '<i></i><i></i><i></i><i></i>';
    Game.init($('#cv'), {
      onEnd: (r) => setTimeout(() => showResult(r), 500),
      onPause: pauseGame,
    });

    $('#btn-enter').addEventListener('click', () => {
      A.ensure();
      A.sfx('start');
      enterSelect();
    });
    $('#btn-play').addEventListener('click', () => startGame(false));
    $('#btn-auto').addEventListener('click', () => startGame(true));
    $('#btn-settings').addEventListener('click', () => openModal('#m-settings'));
    $('#btn-help').addEventListener('click', () => openModal('#m-help'));
    $('#btn-pause').addEventListener('click', pauseGame);
    $('#btn-resume').addEventListener('click', resumeGame);
    $('#btn-restart').addEventListener('click', () => {
      Game.quit();
      startGame(lastAuto);
    });
    $('#btn-quit').addEventListener('click', quitGame);
    $('#btn-retry').addEventListener('click', () => startGame(lastAuto));
    $('#btn-back').addEventListener('click', enterSelect);
    document.querySelectorAll('.modal-overlay').forEach((ov) => {
      if (ov.id === 'm-pause') return;
      ov.addEventListener('click', (e) => {
        if (e.target === ov || e.target.closest('[data-close]')) ov.hidden = true;
      });
    });

    window.addEventListener('keydown', (e) => {
      if (anyModal()) {
        if (e.code === 'Escape') {
          $('#m-settings').hidden = true;
          $('#m-help').hidden = true;
        }
        return;
      }
      if (screen === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') $('#btn-enter').click();
      } else if (screen === 'select') {
        if (e.code === 'ArrowDown') selectSong(cur.song + 1, true);
        else if (e.code === 'ArrowUp') selectSong(cur.song - 1, true);
        else if (e.code === 'ArrowRight') setDiff(cur.diff + 1, true);
        else if (e.code === 'ArrowLeft') setDiff(cur.diff - 1, true);
        else if (e.code === 'Enter') startGame(false);
        else return;
        e.preventDefault();
      } else if (screen === 'result') {
        if (e.code === 'Enter') startGame(lastAuto);
        else if (e.code === 'Escape') enterSelect();
      }
    });

    // 切到后台自动暂停
    const autoPause = () => {
      if (screen === 'stage' && Game.active() && !Game.paused() && $('#countdown').hidden) pauseGame();
    };
    document.addEventListener('visibilitychange', () => document.hidden && autoPause());
    window.addEventListener('blur', autoPause);
  }

  init();
  RM._ui = { startGame, cur, settings };
})();
