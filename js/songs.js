/* 曲库：全部为公版（Public Domain）经典旋律，由浏览器实时合成演奏。
 *
 * 记谱格式（旋律 m）：
 *   L4 / L8 / L16     设定基本时值（四分 / 八分 / 十六分音符）
 *   E5  C#5  Bb4      音名 + 八度（C4 = 中央 C）
 *   E5:2  E5:1.5      时值 = 基本时值 × 倍数
 *   -  或  -:4        休止
 *   |                 小节线（仅用于校验，可省略）
 * 和弦 c：Am  G7  D/F#  N(无和弦)，默认占一小节，Am:2 表示占 2 拍。
 * 段落 i（强度）：0 = 只有铺底，1 = 轻鼓，2 = 完整编曲，3 = 高潮。
 */
(function () {
  const RM = (window.RM = window.RM || {});

  // ---------- 欢乐颂 ----------
  const odeA1 = `L4 E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | E5:1.5 D5:.5 D5:2 |`;
  const odeA2 = `L4 E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5:1.5 C5:.5 C5:2 |`;
  const odeB = `L4 D5 D5 E5 C5 | D5 E5:.5 F5:.5 E5 C5 | D5 E5:.5 F5:.5 E5 D5 | C5 D5 G4:2 |`;
  const odeCA1 = `C G Am C:2 G:2`;
  const odeCA2 = `C G Am G:2 C:2`;
  const odeCB = `G:2 C:2 G:2 C:2 G:2 E:2 Am:1 D:1 G:2`;

  // ---------- 茉莉花 ----------
  const J1 = `L8 E5:2 E5 G5 A5 C6 C6 A5 | G5:2 G5 A5 G5:4 |`;
  const J3 = `L8 G5:2 G5:2 G5:2 E5 G5 | A5:2 A5:2 G5:4 |`;
  const J4 = `L8 E5:2 D5 E5 G5:2 E5 D5 | C5:2 C5 D5 C5:4 |`;
  const J5 = `L8 E5 D5 C5 E5 D5:3 E5 | G5:2 A5 C6 G5:4 |`;
  const J6 = `L8 D5:2 E5 G5 D5 E5 C5 A4 | G4:4 A4:2 C5:2 |`;
  const J7 = `L8 D5:3 E5 C5 D5 C5 A4 | G4:8 |`;
  const jasM = [J1, J1, J3, J4, J5, J6, J7].join(' ');
  const jasC = [
    `C:2 Am:2 F:2 G:2`,
    `C:2 Am:2 Dm:2 G:2`,
    `C:2 Em:2 F:2 C:2`,
    `Am:2 Em:2 F:2 C:2`,
    `C:2 G:2 Am:2 Em:2`,
    `Dm:2 Am:2 C:2 Am:2`,
    `Dm:2 G:2 C`,
  ].join(' ');

  // ---------- 卡农 ----------
  const CAN = `D:2 A:2 Bm:2 F#m:2 G:2 D:2 G:2 A:2`;
  const canP1 = `L2 F#5 E5 | D5 C#5 | B4 A4 | B4 C#5 |`;
  const canP2 = `L2 D5 C#5 | B4 A4 | G4 F#4 | G4 E4 |`;
  const canP3 = `L4 D5 F#5 A5 G5 | F#5 D5 F#5 E5 | D5 B4 D5 A5 | G5 B5 A5 G5 |`;
  const canP4 = `L4 F#5 D5 E5 C#6 | D6 F#6 A6 A5 | B5 G5 A5 F#5 | D5 D6 D6:1.5 C#6:.5 |`;
  const canP6 = `L8 D5 C#5 D5 D4 C#4 A4 E4 F#4 | D4 D5 C#5 B4 C#5 F#5 A5 B5 | G5 F#5 E5 G5 F#5 E5 D5 C#5 | B4 A4 G4 F#4 E4 G4 F#4 E4 |`;
  const canP7 = `L8 D4 E4 F#4 G4 A4 E4 A4 G4 | F#4 B4 A4 G4 A4 G4 F#4 E4 | D4 B3 B4 C#5 D5 C#5 B4 A4 | G4 F#4 E4 B4 A4 B4 A4 G4 |`;
  const canP5 = `L16 A5:2 F#5 G5 A5:2 F#5 G5 A5 A4 B4 C#5 D5 E5 F#5 G5 | F#5:2 D5 E5 F#5:2 F#4 G4 A4 B4 A4 G4 A4 F#4 G4 A4 | G4:2 B4 A4 G4:2 F#4 E4 F#4 E4 D4 E4 F#4 G4 A4 B4 | G4:2 B4 A4 B4:2 C#5 D5 A4 B4 C#5 D5 E5 F#5 G5 A5 |`;
  const canP5b = `L16 F#5:2 D5 E5 F#5:2 E5 D5 E5 C#5 D5 E5 F#5 E5 D5 C#5 | D5:2 B4 C#5 D5:2 D4 E4 F#4 G4 F#4 E4 F#4 D5 C#5 D5 | B4:2 D5 C#5 B4:2 A4 G4 A4 G4 F#4 G4 A4 B4 C#5 D5 | B4:2 D5 C#5 D5:2 C#5 B4 C#5 D5 E5 D5 C#5 D5 B4 C#5 |`;

  // ---------- 致爱丽丝（3/8 拍，一小节 = 6 个十六分音符）----------
  const elA = `L16 E5 D#5 E5 B4 D5 C5 | A4:2 - C4 E4 A4 | B4:2 - E4 G#4 B4 | C5:2 - E4 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:2 - C4 E4 A4 | B4:2 - E4 C5 B4 |`;
  const elE1 = ` A4:2 - - E5 D#5 |`;
  const elE2 = ` A4:2 - B4 C5 D5 |`;
  const elEnd = ` A4:6 |`;
  const elB = `L16 E5:3 G4 F5 E5 | D5:3 F4 E5 D5 | C5:3 E4 D5 C5 | B4:2 - E4 E5 - | - E5 E6 - - D#5 | E5 - - D#5 E5 D#5 |`;
  const elCA = `E Am E Am E Am E Am`;
  const elCB = `C G Am E E E`;

  // ---------- 康康舞曲 ----------
  const ccA = `L8 C5:4 D5 F5 E5 D5 | G5:2 G5:2 G5 A5 E5 F5 | D5:2 D5:2 D5 F5 E5 D5 | C5 C6 B5 A5 G5 F5 E5 D5 | C5:4 D5 F5 E5 D5 | G5:2 G5:2 G5 A5 E5 F5 | D5:2 D5:2 D5 F5 E5 D5 | C5 G5 D5 E5 C5:2 -:2 |`;
  const ccCA = `C:2 G:2 | C | G | C:2 G:2 | C:2 G:2 | C | G | C:1 G:1 C:2`;
  const ccBr = `L8 G5:2 B5:2 D6:2 B5:2 | C6:2 G5:2 E5:2 G5:2 | G5:2 B5:2 D6:2 B5:2 | C6 B5 A5 G5 F5 E5 D5 C5 | A5:2 C6:2 A5:2 F5:2 | G5:2 C6:2 G5:2 E5:2 | D5 E5 F5 G5 A5 B5 C6 D6 | G5:2 G5:2 G5:2 -:2 |`;
  const ccCBr = `G | C | G | C:2 G:2 | F | C | G | G`;

  // ---------- 土耳其进行曲（2/4 拍）----------
  const tkP = `L16 -:4 B4 A4 G#4 A4 |`;
  const tkA = `L16 C5:2 -:2 D5 C5 B4 C5 | E5:2 -:2 F5 E5 D#5 E5 | B5 A5 G#5 A5 B5 A5 G#5 A5 | C6:4 A5:2 C6:2 | B5:2 A5:2 G5:2 A5:2 | B5:2 A5:2 G5:2 A5:2 | B5:2 A5:2 G5:2 F#5:2 |`;
  const tkA1 = ` E5:4 B4 A4 G#4 A4 |`;
  const tkA2 = ` E5:4 E5:2 F5:2 |`;
  const tkB = `L16 G5:2 G5:2 A5 G5 F5 E5 | D5:4 E5:2 F5:2 | G5:2 G5:2 A5 G5 F5 E5 | D5:4 C5:2 D5:2 | E5:2 E5:2 F5 E5 D5 C5 | B4:4 C5:2 D5:2 | E5:2 E5:2 F5 E5 D5 C5 | B4:4 B4 A4 G#4 A4 |`;
  const tkC = `L16 C5:2 -:2 D5 C5 B4 C5 | E5:2 -:2 F5 E5 D#5 E5 | B5 A5 G#5 A5 B5 A5 G#5 A5 | C6:4 A5:2 B5:2 | C6:2 B5:2 A5:2 G#5:2 | A5:2 E5:2 F5:2 D5:2 | C5:4 B4:4 |`;
  const tkC1 = ` A4:4 A5:2 B5:2 |`;
  const tkCend = ` A4:8 |`;
  const tkM = `L16 C#6:4 A5:2 B5:2 | C#6:2 B5:2 A5:2 G#5:2 | F#5:2 G#5:2 A5:2 B5:2 | G#5:2 E5:2 A5:2 B5:2 | C#6:4 A5:2 B5:2 | C#6:2 B5:2 A5:2 G#5:2 | F#5:2 B5:2 G#5:2 E5:2 |`;
  const tkM1 = ` A5:4 A5:2 B5:2 |`;
  const tkM2 = ` A5:4 E5:2 F5:2 |`;
  const tkCA = `Am Am Am Am Em Em B Em`;
  const tkCB = `C G C G Am E Am E`;
  const tkCC = `Am Am Am F Dm:1 E:1 Am:1 Dm:1 Am:1 E:1 Am`;
  const tkCM = `A A:1 E:1 F#m E A A:1 E:1 Bm:1 E:1 A`;

  // ---------- 野蜂飞舞（2/4 拍，改编）----------
  const beeIn = `L16 E6 D#6 D6 C#6 D6 C#6 C6 B5 | C6 B5 A#5 A5 G#5 G5 F#5 F5 | E5 D#5 D5 C#5 D5 C#5 C5 B4 | C5 B4 A#4 A4 G#4 G4 F#4 F4 | E4 D#4 D4 C#4 D4 C#4 C4 B3 | E4 D#4 D4 C#4 D4 C#4 C4 B3 | E4 D#4 D4 C#4 C4 F4 E4 D#4 | E4 D#4 D4 C#4 C4 C#4 D4 D#4 |`;
  const beeT = `L16 E5 D#5 D5 C#5 C5 F5 E5 D#5 | E5 D#5 D5 C#5 C5 C#5 D5 D#5 | E5 D#5 D5 C#5 C5 F5 E5 D#5 | E5 D#5 D5 C#5 C5 C#5 D5 D#5 | E5 F5 E5 D#5 E5 F5 E5 D#5 | E5 F5 F#5 G5 G#5 A5 A#5 B5 | C6 B5 A#5 A5 G#5 G5 F#5 F5 | E5 D#5 E5 F5 E5 D5 C5 B4 |`;
  const beeD = `L16 A5 G#5 G5 F#5 F5 A#5 A5 G#5 | A5 G#5 G5 F#5 F5 F#5 G5 G#5 | A5 G#5 G5 F#5 F5 A#5 A5 G#5 | A5 G#5 G5 F#5 F5 F#5 G5 G#5 | A5 A#5 A5 G#5 A5 A#5 A5 G#5 | A5 G#5 G5 F#5 F5 E5 D#5 D5 | C#5 D5 D#5 E5 F5 F#5 G5 G#5 | G#5 A5 G#5 G5 F#5 F5 E5 D#5 |`;
  const beeEnd = `L16 E5 D#5 D5 C#5 D5 C#5 C5 B4 | C5 B4 A#4 A4 G#4 G4 F#4 F4 | E4 F4 F#4 G4 G#4 A4 A#4 B4 | C5 C#5 D5 D#5 E5 F5 F#5 G5 | G#5 A5 A#5 B5 C6 C#6 D6 D#6 | E6:2 -:2 E5:2 -:2 | A5:2 -:6 |`;
  const beeCIn = `Am Am Am Am E E E E`;
  const beeCT = `Am Am Am Am Am E Am E`;
  const beeCD = `Dm Dm Dm Dm Dm Dm A E`;
  const beeCEnd = `Am Am E E E E Am`;

  RM.SONGS = [
    {
      id: 'ode',
      title: '欢乐颂',
      en: 'Ode to Joy',
      composer: '贝多芬',
      bpm: 132,
      bar: 4,
      style: 'pop',
      lead: 'lead',
      grid: [1, 0.5, 0.5],
      fill: 0.5,
      colors: ['#ffb340', '#ff6b5e'],
      sections: [
        { m: `L1 - -`, c: `C G`, i: 1 },
        { m: odeA1 + odeA2, c: odeCA1 + ' ' + odeCA2, i: 2 },
        { m: odeB + odeA2, c: odeCB + ' ' + odeCA2, i: 2 },
        { m: odeA1 + odeA2, c: odeCA1 + ' ' + odeCA2, i: 3, tr: 2 },
        { m: odeB + odeA2, c: odeCB + ' ' + odeCA2, i: 3, tr: 2 },
        { m: `L1 C6`, c: `C`, i: 0, tr: 2 },
      ],
    },
    {
      id: 'jasmine',
      title: '茉莉花',
      en: 'Jasmine Flower',
      composer: '中国民歌',
      bpm: 84,
      bar: 4,
      style: 'ballad',
      lead: 'pluck',
      grid: [1, 0.5, 0.5],
      fill: 0.5,
      colors: ['#7ee0c3', '#f7a8d0'],
      sections: [
        { m: `L1 - -`, c: `C:2 Am:2 F:2 G:2`, i: 1 },
        { m: jasM, c: jasC, i: 1 },
        { m: jasM, c: jasC, i: 2, tr: 2 },
        { m: `L1 -`, c: `C`, i: 0, tr: 2 },
      ],
    },
    {
      id: 'canon',
      title: 'D 大调卡农',
      en: 'Canon in D',
      composer: '帕赫贝尔',
      bpm: 106,
      bar: 4,
      style: 'anthem',
      lead: 'strings',
      grid: [1, 0.5, 0.25],
      fill: 0.5,
      colors: ['#64b5ff', '#b98cff'],
      sections: [
        { m: canP1, c: CAN, i: 0 },
        { m: canP3, c: CAN, i: 1 },
        { m: canP4, c: CAN, i: 1 },
        { m: canP6, c: CAN, i: 2 },
        { m: canP7, c: CAN, i: 2 },
        { m: canP5, c: CAN, i: 3 },
        { m: canP5b, c: CAN, i: 3 },
        { m: canP2, c: CAN, i: 1 },
        { m: `L1 D5`, c: `D`, i: 0 },
      ],
    },
    {
      id: 'elise',
      title: '致爱丽丝',
      en: 'Für Elise',
      composer: '贝多芬',
      bpm: 66,
      bar: 1.5,
      pulse: 0.5,
      countIn: 3,
      style: 'waltz',
      lead: 'piano',
      grid: [0.5, 0.25, 0.25],
      fill: 0.25,
      colors: ['#ff8fb1', '#9d8cff'],
      sections: [
        { m: `L16 -:4 E5 D#5 |`, c: `N`, i: 0 },
        { m: elA + elE1, c: elCA, i: 1 },
        { m: elA + elE2, c: elCA, i: 2 },
        { m: elB, c: elCB, i: 2 },
        { m: elA + elE2, c: elCA, i: 2 },
        { m: elB, c: elCB, i: 3 },
        { m: elA + elEnd, c: elCA, i: 3 },
        { m: `L16 -:6`, c: `Am`, i: 0 },
      ],
    },
    {
      id: 'cancan',
      title: '康康舞曲',
      en: 'Can-Can',
      composer: '奥芬巴赫',
      bpm: 160,
      bar: 4,
      style: 'galop',
      lead: 'square',
      grid: [2, 1, 0.5],
      fill: 0.5,
      colors: ['#ff5e7e', '#ffd23f'],
      sections: [
        { m: `L1 - -`, c: `C G`, i: 1 },
        { m: ccA, c: ccCA, i: 2 },
        { m: ccA, c: ccCA, i: 2 },
        { m: ccBr, c: ccCBr, i: 2 },
        { m: ccA, c: ccCA, i: 3, tr: 2 },
        { m: ccA, c: ccCA, i: 3, tr: 2 },
        { m: `L1 C6`, c: `C`, i: 0, tr: 2 },
      ],
    },
    {
      id: 'turkish',
      title: '土耳其进行曲',
      en: 'Rondo Alla Turca',
      composer: '莫扎特',
      bpm: 112,
      bar: 2,
      countIn: 4,
      holdBeats: 1,
      style: 'march',
      lead: 'piano',
      grid: [1, 0.5, 0.25],
      fill: 0.5,
      colors: ['#4fd8eb', '#ffa14a'],
      sections: [
        { m: tkP, c: `N`, i: 0 },
        { m: tkA + tkA1, c: tkCA, i: 2 },
        { m: tkA + tkA2, c: tkCA, i: 2 },
        { m: tkB, c: tkCB, i: 2 },
        { m: tkC + tkC1, c: tkCC, i: 2 },
        { m: tkM + tkM1, c: tkCM, i: 3 },
        { m: tkM + tkM2, c: tkCM, i: 3 },
        { m: tkB, c: tkCB, i: 2 },
        { m: tkC + tkCend, c: tkCC, i: 3 },
        { m: `L2 -`, c: `Am`, i: 0 },
      ],
    },
    {
      id: 'bee',
      title: '野蜂飞舞',
      en: 'Flight of the Bumblebee',
      composer: '里姆斯基-科萨科夫',
      bpm: 140,
      bar: 2,
      countIn: 4,
      style: 'dnb',
      lead: 'lead',
      grid: [1, 0.5, 0.25],
      fill: 0.5,
      colors: ['#ffe14a', '#ff5ad1'],
      sections: [
        { m: beeIn, c: beeCIn, i: 1 },
        { m: beeT, c: beeCT, i: 2 },
        { m: beeD, c: beeCD, i: 2 },
        { m: beeT, c: beeCT, i: 3 },
        { m: beeD, c: beeCD, i: 3 },
        { m: beeT, c: beeCT, i: 3 },
        { m: beeEnd, c: beeCEnd, i: 3 },
        { m: `L2 -`, c: `Am`, i: 0 },
      ],
    },
  ];
})();
