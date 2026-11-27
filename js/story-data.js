// ================================================================================================
// js/story-data.js — ストーリーのデータ（章・王様のセリフ・場所のつながり・村人・マップの種類）と記録
// chapters, king / ending lines, how places connect (LINKS), what kind of place each is,
// villagers (NPC_DEFS), map definitions (THEMES / SCENES), and the save in localStorage
// (loaded 3/12: may use anything from the files loaded before it)
// ================================================================================================
const KINGDOM = 'ドット王国';
const LAST_CH = 5, KEY_CH = 4;      // KEY_CH: the boss whose map shows the way to the demon castle
const CH = {
  1: { title: 'スライムの丘', place: '丘',
    intro: [{ n: '村人', t: '丘のスライムの群れを、どうか追い払ってください！' }],
    bossLine: 'ぷるぷる……ここはワシらの丘だぁ！',
    outro: [{ n: '村人', t: 'ありがとう、スライムたちもおとなしくなりました！' },
            { n: '', t: '草原の北の「迷いの森」への柵がひらいた！' }] },
  2: { title: '迷いの森', place: 'ゴブリンの巣',
    intro: [{ n: '', t: '迷いの森を抜けた先は、ゴブリンたちの巣だった！' }],
    bossLine: 'ギギッ！ ここまで来るとは、生意気なやつらめ！',
    outro: [{ n: '旅商人', t: '見て、ひだまり町のほうから煙が上がっている！' },
            { n: '', t: '草原の東の「ひだまり町」への柵がひらいた！' }] },
  3: { title: '襲われた町', place: 'ひだまり町',
    intro: [{ n: '町の人', t: 'オークたちが町に攻めてきたの、たすけて！' }],
    bossLine: 'ガハハ！ この町はオーク隊長さまがいただく！',
    outro: [{ n: '町長', t: '南の墓地のガイコツ大将が、魔王城の手がかりを持っているそうです。' },
            { n: '', t: '草原の南の「墓地」への柵がひらいた！ 町の人たちとも話してみよう' }] },
  4: { title: 'さまよう墓地', place: '墓地',
    intro: [{ n: '墓守', t: 'ガイコツ大将が、魔王城の地図を持っておるそうじゃ。' }],
    bossLine: 'カタカタ……地図は渡さぬぞ……',
    outro: [{ n: '', t: 'ガイコツ大将から、魔王城の地図を手に入れた！' },
            { n: '', t: '魔王城へは「もりかげ村の古井戸」から地下道で行けるらしい！' }] },
  5: { title: '北の魔王城', place: '魔王城',
    intro: [{ n: '北の魔王', t: 'よく来たな、小さき者どもよ。ここがお前たちの墓場だ！' }],
    bossLine: 'ゆくぞ！ わが力を思い知れ！',
    outro: [{ n: '北の魔王', t: 'ば、ばかな……この私が……！' },
            { n: '', t: '北の魔王を倒した！ 光る門からお城へ帰ろう！' }] },
};
const KING_NEXT = {                 // the king's hint about where to go next (a rumour, not an order)
  1: '草原の北の「スライムの丘」で、キングスライムが暴れているらしい。',
  2: '草原の北の「迷いの森」の奥に、ゴブリンキングが巣を作っているらしい。',
  3: '草原の東の「ひだまり町」が、オークたちに襲われているらしい。',
  4: '草原の南の「墓地」で、ガイコツ大将がさまよっているらしい。',
  5: 'もりかげ村の古井戸の地下道が、北の魔王の城に続いているらしい。',
}
// 王様のセリフ：「北の魔王を倒し…」＋ 次に行く場所のうわさ（KING_NEXT）
function kingLines(c) {
  if (c >= LAST_CH) return [{ n: '王様', t: '北の魔王を倒してくれて、ありがとう！ そなたたちは国の英雄じゃ。' }];
  return [{ n: '王様', t: (c ? 'よくやってくれた！ ' : '') + '北の魔王を倒し、' + KINGDOM + 'に平和を取り戻してくれ！' },
          { n: '王様', t: KING_NEXT[c + 1] }];
}
const ENDING = [{ n: '王様', t: 'おお……北の魔王を倒してくれたのか！ 国に平和が戻ったぞ。' },
                { n: '王様', t: 'そなたたちこそ、まことの英雄じゃ。またいつでも冒険に出てよいぞ！' }];
const CH_WAVES = { 1: [[0], [0]], 2: [[0, 1], [1]], 3: [[1, 9], [9], [1, 9]], 4: [[1, 2], [2], [1, 2]], 5: [[2, 3], [1, 3], [2, 3]] };   // enemy types per wave
const CH_BOSS = { 1: 0, 2: 1, 3: 9, 4: 2, 5: 4 };            // boss type per chapter
const MID_FOR_CH = { 1: 5, 2: 6, 4: 7, 5: 8 };               // mid-boss type per chapter (the town has none)
const CH_POOL = { 1: ['katana', 'axe'], 2: ['bow', 'red'], 4: ['hammer', 'green'], 5: ['bow', 'axe', 'katana', 'hammer', 'red', 'green'] };
const SAVE_KEY = 'dotwalk_story_v1';
// ストーリーの記録を読み込む（クリアした章・持っている武器・あけた宝箱）
function loadSave() {
  try {
    const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (v && typeof v === 'object') return { v: 2, cleared: Math.max(0, Math.min(LAST_CH, v.v === 2 ? v.cleared | 0 : [0, 1, 2, 4, 5][Math.min(4, v.cleared | 0)])), weapons: (Array.isArray(v.weapons) ? v.weapons : []).filter((w, i, a) => STORY_WEAPONS.includes(w) && a.indexOf(w) === i), talked: !!v.talked, chests: (Array.isArray(v.chests) ? v.chests : []).filter(k => typeof k === 'string').slice(0, 200), hearts: Math.max(0, Math.min(3, v.hearts | 0)) };
  } catch (e) {}
  return { v: 2, cleared: 0, weapons: [], talked: false, chests: [], hearts: 0 };
}
let save = loadSave();
// ストーリーの記録を保存
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} renderSaveInfo(); }
let storyPh = '';                     // phase of the place I am in (from the host), e.g. 'fight', 'done'
// the story world: places linked by exits you walk through. need = chapter you must have cleared to pass
// [side, to, chapter you must have cleared to pass, position along the side]
const LINKS = {
  castle: [['s', 'v1', 0]],           // (the castle builds its own door; listed so the 草原 guide arrow can find its way)
  v1: [['n', 'castle', 0], ['e', 'f1', 0]],
  f1: [['w', 'v1', 0], ['n', 'h1', 0, .2], ['n', 'f2', 1, .5], ['n', 'v2', 0, .8], ['e', 't1', 2], ['s', 'v3', 0, .3], ['s', 'f3', 3, .72]],
  h1: [['s', 'f1', 0], ['n', 'h1m', 0]],
  h1m: [['s', 'h1', 0]],
  f2: [['s', 'f1', 0], ['n', 'f2b', 0, 14 / 57], ['n', 'f2m', 0, 44 / 57]],   // the maze: two ways out at the far end
  f2b: [['s', 'f2', 0]],
  f2m: [['s', 'f2', 0]],
  v2: [['s', 'f1', 0]],
  t1: [['w', 'f1', 0]],
  v3: [['n', 'f1', 0]],
  f3: [['n', 'f1', 0], ['s', 'f3m', 0]],
  f3m: [['n', 'f3', 0]],
  f4: [['s', 'v2', 0]],              // the demon castle: only through the old well in もりかげ村 (the last place: no side room)
};
// kinds of places: hub = a few weak monsters / maze = monsters keep coming / bossroom = straight to the boss /
// mid = the mid-bosses guarding weapon chests / (none) = waves, then the boss
const AREA_KIND = { f1: 'hub', f2: 'maze', f2b: 'bossroom', h1m: 'mid', f2m: 'mid', f3m: 'mid' };
const AREA_PLACES = ['f1', 'h1', 'h1m', 'f2', 'f2b', 'f2m', 't1', 'f3', 'f3m', 'f4'];
const MID_CH = { h1m: 1, f2m: 2, f3m: 4 };          // which chapter's mid-boss lives in each side room
const CH_PLACE = { 1: 'h1', 2: 'f2b', 3: 't1', 4: 'f3', 5: 'f4' };
const FIELD_CH = { h1: 1, f2b: 2, t1: 3, f3: 4, f4: 5 };
const FIELD_BACK = { f1: 'castle', h1: 'castle', f2: 'castle', t1: 'castle', f3: 'castle', f4: 'castle' };   // wiped out anywhere: wake up in the castle
const PLACE_NAME = { castle: 'お城', v1: 'はじまりの村', v2: 'もりかげ村', v3: 'はかもり村', f1: '草原', h1: 'スライムの丘', h1m: 'オーガのねぐら', f2: '迷いの森', f2b: 'ゴブリンの巣', f2m: '森の奥の広場', t1: 'ひだまり町', f3m: '墓地の奥', f4m: '魔王城の地下', f3: '墓地', f4: '魔王城', island: '島' };
// villagers: tile position + what they say (with a little help for the adventure)
const NPC_DEFS = {                 // every villager says one sentence
  castle: [
    { k: 'doc', n: '大臣', tx: 17, ty: 7, lines: ['草原から丘・森・町・墓地へ道がつながっていて、草原では黄色い矢印が次の行き先を指しておりますぞ。'] },
    { k: 'knight_f', n: '近衛兵', tx: 8, ty: 8, lines: ['武器の番人は強い武器を落とすが、拾えるのはひとつの場所で1人1つまでだ。'] },
    { k: 'knight_m', n: 'お城の兵士', tx: 9, ty: 15, lines: ['この下の門を出ると、はじまりの村だ。'] },
    { k: 'elf_f', n: '侍女', tx: 18, ty: 15, lines: ['ボスを倒すと、次の場所への柵がひらくそうですよ。'] },
  ],
  v1: [
    { k: 'doc', n: '村長', tx: 8, ty: 8, lines: ['東の橋をわたると、草原じゃよ。'] },
    { k: 'elf_f', n: 'ミナ', tx: 23, ty: 8, lines: ['丘の北のオーガのねぐらのオーガは、刀か投げ斧を落とすんだって！'] },
    { k: 'knight_m', n: '見張りの兵士', tx: 18, ty: 14, lines: ['キングスライムが飛び上がったら、地面の赤い丸から逃げるんだ。'] },
    { k: 'dwarf_m', n: '商人', tx: 27, ty: 14, lines: ['ケーキはライフが1つ回復、メロンソーダは10秒間足が速くなるよ。'] },
    { k: 'elf_m', n: '少年', tx: 8, ty: 14, lines: ['最初のナイフは目の前しか届かないから、敵にぐっと近づいて切るんだよ。'] },
  ],
  v2: [
    { k: 'dwarf_f', n: '木こり', tx: 8, ty: 8, lines: ['ゴブリンキングが赤い線を出したら、横にずれて突進をよけろ！'] },
    { k: 'elf_m', n: '狩人', tx: 23, ty: 8, lines: ['迷いの森の右上の出口の先にいるマスクオークは、弓か赤い杖を落とすらしい。'] },
    { k: 'dwarf_m', n: '森番', tx: 29, ty: 8, lines: ['迷いの森のいちばん奥の宝箱には、ライフの上限が増える「いのちのハート」が入っているが、早い者勝ちらしいぞ。'] },
    { k: 'wizzard_f', n: 'おばあさん', tx: 18, ty: 14, lines: ['その古井戸は、昔どこか遠くへ続いていたそうだよ。'] },
    { k: 'knight_m', n: '旅の剣士', tx: 27, ty: 14, lines: ['オーク隊長のたいまつで地面が赤く光ったら、すぐに離れろ！'] },
    { k: 'elf_f', n: '木の実売り', tx: 13, ty: 14, lines: ['迷いの森の左上の出口を抜けると、ゴブリンの巣があるんだって。'] },
  ],
  t1: [   // hiding in their houses until the town is saved
    { k: 'doc', n: '町長', tx: 14, ty: 8, hide: true, gift: 'heal', giftLine: '町を救ってくれたお礼に、この「いやしの杖」を持っていきなさい。', lines: ['町を救ってくれて、本当にありがとう！'] },
    { k: 'dwarf_m', n: '鍛冶屋', tx: 20, ty: 8, hide: true, lines: ['墓地の奥のゾンビ巨人は、大ハンマーか緑の杖を落とすそうだ。'] },
    { k: 'elf_f', n: '宿屋の娘', tx: 9, ty: 14, hide: true, lines: ['魔王城の場所は、ガイコツ大将を倒せばわかるっておじいちゃんが言ってたよ。'] },
    { k: 'knight_f', n: '町の衛兵', tx: 24, ty: 14, hide: true, lines: ['オークどもめ、また来たら追い返してやる！'] },
  ],
  v3: [
    { k: 'doc', n: '墓守', tx: 8, ty: 8, lines: ['ガイコツ大将のうずまき状の骨は、弾のすき間から近づくんじゃ。'] },
    { k: 'knight_f', n: '僧侶', tx: 23, ty: 8, lines: ['緑の杖の弾は、敵を追いかけてくれますよ。'] },
    { k: 'knight_m', n: '墓地の番人', tx: 29, ty: 8, lines: ['墓地の南の出口の先に、ゾンビ巨人が眠っているらしい。'] },
    { k: 'lizard_m', n: '旅のトカゲ族', tx: 18, ty: 14, lines: ['魔王は体力が半分になると怒って、弾が倍になるぞ。'] },
    { k: 'wizzard_f', n: '旅の魔法使い', tx: 8, ty: 14, lines: ['魔王は空から火の玉を降らせるから、地面が赤く光ったらすぐ離れて。'] },
    { k: 'elf_f', n: '子ども', tx: 27, ty: 14, lines: ['魔王城への行き方は、ガイコツ大将を倒すとわかるんだって！'] },
  ],
};
const THEMES = {
  grass:  { g: ['#4a6b45', '#46663f'], sp: ['#55794f', '#3d5a3a'], deco: 'flowers', b: '#e3d29c', bs: ['#d3bf83', '#efe2b6'], deep: '#2a6f93', shal: '#3f8fb0', foam: '#d7eef5', wave: 'rgba(220, 242, 250, .55)', shadow: 'rgba(20, 40, 18, .35)' },
  forest: { g: ['#3f5d3a', '#3b5836'], sp: ['#4b6f45', '#32502e'], deco: 'mushrooms', b: '#7a6a48', bs: ['#6b5c3e', '#8a7a55'], deep: '#245066', shal: '#2f6a80', foam: '#bfe0e6', wave: 'rgba(200, 230, 240, .45)', shadow: 'rgba(12, 28, 12, .4)' },
  grave:  { g: ['#4f5749', '#4b5345'], sp: ['#5c6556', '#3f463b'], deco: 'bones', b: '#6e6a5e', bs: ['#5e5a50', '#7d796c'], deep: '#1d2830', shal: '#2a3a45', foam: '#8fa3ad', wave: 'rgba(150, 180, 190, .35)', shadow: 'rgba(10, 14, 10, .4)' },
  demon:  { g: ['#3b3446', '#37303f'], sp: ['#463e52', '#2f2937'], deco: 'cracks', b: '#2a2430', bs: ['#3a3240', '#201b26'], deep: '#8f2c16', shal: '#c24a1a', foam: '#ffb347', wave: 'rgba(255, 210, 120, .6)', shadow: 'rgba(0, 0, 0, .4)' },
  castle: { deep: '#221d2b', wave: null, shadow: 'rgba(0, 0, 0, .3)' },
  village: { g: ['#5b8a50', '#57844c'], sp: ['#679a5c', '#4b7543'], deco: 'flowers', b: '#c9a66b', bs: ['#b8935a', '#d9b97f'], deep: '#3d6b3a', shal: '#3f8fb0', foam: '#d7eef5', wave: null, shadow: 'rgba(20, 40, 18, .3)' },
};
const SCENES = {
  island: { w: 72, h: 54, seed: 20261106, oseed: 4242, theme: 'grass', fth: .64, pT: .3, pTl: .035, pR: .025 },
  castle: { hall: true, w: 26, h: 20, theme: 'castle' },
  v1: { village: true, w: 46, h: 30, seed: 501, theme: 'village', houses: [[4, 3], [10, 3], [19, 3], [25, 3], [5, 15], [12, 15], [22, 15]] },
  v2: { village: true, w: 46, h: 30, seed: 502, theme: 'village', houses: [[4, 3], [10, 3], [18, 3], [25, 3], [5, 15], [10, 15], [20, 15], [25, 15]], well: [13, 7] },
  v3: { village: true, w: 46, h: 30, seed: 503, theme: 'village', houses: [[4, 3], [10, 3], [19, 3], [25, 3], [5, 15], [12, 15], [22, 15]] },
  t1: { village: true, town: true, w: 46, h: 30, seed: 504, theme: 'village', houses: [[3, 3], [8, 3], [17, 3], [22, 3], [27, 3], [3, 15], [11, 15], [17, 15], [22, 15], [27, 15]] },
  f1: { w: 60, h: 44, seed: 1001, oseed: 1002, theme: 'grass',  fth: .72, pT: .2,  pTl: .015, pR: .03 },
  h1: { w: 56, h: 42, seed: 1101, oseed: 1102, theme: 'grass',  fth: .68, pT: .26, pTl: .02,  pR: .03 },
  h1m: { w: 38, h: 30, seed: 1201, oseed: 1202, theme: 'grass', fth: .66, pT: .3, pTl: .04, pR: .04, lair: true, lairCenter: true },
  f2: { w: 57, h: 42, seed: 2201, oseed: 2202, theme: 'forest', maze: true },
  f2b: { w: 42, h: 32, seed: 2401, oseed: 2402, theme: 'forest', fth: .55, pT: .22, pTl: .05, pR: .02 },
  f2m: { w: 38, h: 30, seed: 2301, oseed: 2302, theme: 'forest', fth: .5, pT: .32, pTl: .08, pR: .02, lair: true, lairCenter: true },
  f3m: { w: 38, h: 30, seed: 3401, oseed: 3402, theme: 'grave', fth: .6, pT: .16, pTl: .04, pR: .08, lair: true, lairCenter: true },
  f3: { w: 56, h: 42, seed: 3301, oseed: 3302, theme: 'grave',  fth: .6,  pT: .14, pTl: .03,  pR: .07 },
  f4: { w: 56, h: 42, seed: 4401, oseed: 4402, theme: 'demon',  fth: .62, pT: .12, pTl: .015, pR: .05 },
};
