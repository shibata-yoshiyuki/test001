// ================================================================================================
// js/data.js — 武器・アイテム・敵・ボス・キャラの画像などのデータ
// characters, weapons (damage etc.), items, enemy types, bosses, and the images they use
// (loaded 2/12: may use anything from the files loaded before it)
// ================================================================================================
// To add a character: put <id>_walk.png (20x32 frames, 4x4) in assets/sprites and add a line here.
const CHARS = [
  ['shibata', '柴田さん'], ['cyber', 'サイバー'], ['yami', 'ヤミさん'], ['kitamura', '北村さん'],
  ['yamada', '山田さん'], ['shindo', '新藤さん'], ['takeda', '武田さん'], ['kikuchi', '菊地さん'], ['mabuchi', '馬淵さん'],
];
const SHEETS = CHARS.map(c => 'assets/sprites/' + c[0] + '_walk.png');
const NAMES = CHARS.map(c => c[1]);
const imgs = SHEETS.map(src => { const im = new Image(); im.src = src; return im; });
// weapons (icons: 0x72 DungeonTileset II, CC0). kind: melee = arc in front, slam = ring around you, shot = projectile
// damage (dmg): the knife is 1. weapons that reach far or wide do 1 or less; close-in weapons do more (at most 3)
const WEAPONS = {
  knife:  { name: 'ナイフ',     icon: 'knife',             kind: 'melee', reach: 30, arc: 0.9, cd: 350, dmg: 1 },
  bow:    { name: '弓',         icon: 'bow',               kind: 'shot', spd: 260, rng: 260, cd: 520, dmg: 1, pierce: true, proj: 'arrow' },
  axe:    { name: '投げ斧',     icon: 'throwing_axe',      kind: 'shot', spd: 170, rng: 110, cd: 700, dmg: 1, pierce: true, boomerang: true, proj: 'axe' },
  katana: { name: '刀',         icon: 'katana',            kind: 'melee', reach: 40, arc: 1.7, cd: 450, dmg: 2 },
  hammer: { name: '大ハンマー', icon: 'big_hammer',        kind: 'slam', radius: 50, delay: 260, cd: 1000, dmg: 3 },
  red:    { name: '赤い杖',     icon: 'red_magic_staff',   kind: 'shot', spd: 170, rng: 150, cd: 500, dmg: 0.5, spread: [-0.3, 0, 0.3], proj: 'orbR' },
  green:  { name: '緑の杖',     icon: 'green_magic_staff', kind: 'shot', spd: 125, rng: 260, cd: 450, dmg: 0.5, homing: true, proj: 'orbG' },
};
const PICK_WEAPONS = ['bow', 'axe', 'katana', 'hammer', 'red', 'green'];
const WEAPON_USES = 20;
const W_IMGS = {};
for (const k of ['knife', 'bow', 'arrow', 'throwing_axe', 'katana', 'big_hammer', 'red_magic_staff', 'green_magic_staff']) { const im = new Image(); im.src = 'assets/weapons/' + k + '.png'; W_IMGS[k] = im; }
// one food and one drink (from the おまけ set)
const ITEMS = {
  food:  { name: 'ケーキ',       img: 'pickup_food',  text: 'ライフが1回復！' },
  drink: { name: 'メロンソーダ', img: 'pickup_drink', text: '10秒間、足が速くなる！' },
};
const FAST_MS = 10000, FAST_MULT = 1.6;
const ITEM_IMGS = {}; for (const k in ITEMS) { const im = new Image(); im.src = 'assets/items/' + ITEMS[k].img + '.png'; ITEM_IMGS[k] = im; }
// enemies (assets: 0x72 DungeonTileset II, CC0) — sprites face right; feet at (x, y)
const ENEMY_TYPES = [
  { key: 'swampy',      name: 'スライム',   hp: 1,  spd: 24, fw: 16, fh: 16, sc: 1, hw: 7,  hh: 13 },
  { key: 'goblin',      name: 'ゴブリン',   hp: 1,  spd: 44, fw: 16, fh: 16, sc: 1, hw: 5,  hh: 10 },
  { key: 'skelet',      name: 'ガイコツ',   hp: 3,  spd: 26, fw: 16, fh: 16, sc: 1, hw: 5,  hh: 14 },
  { key: 'necromancer', name: 'まじない師', hp: 2,  spd: 22, fw: 16, fh: 23, sc: 1, hw: 6,  hh: 15, shooter: true },
  { key: 'big_demon',   name: 'ボス',       hp: 30, spd: 20, fw: 32, fh: 36, sc: 2, hw: 22, hh: 56, boss: true },
  // story mid-bosses (guard a treasure chest; drawn at final size, hw/hh already scaled)
  { key: 'ogre',        name: 'オーガ',       hp: 12, spd: 22, fw: 32, fh: 36, sc: 1, hw: 10, hh: 26, mid: true },
  { key: 'masked_orc',  name: 'マスクオーク', hp: 12, spd: 34, fw: 16, fh: 23, sc: 2, hw: 12, hh: 32, mid: true },
  { key: 'big_zombie',  name: 'ゾンビ巨人',   hp: 16, spd: 18, fw: 32, fh: 36, sc: 1, hw: 9,  hh: 26, mid: true },
  { key: 'orc_shaman',  name: 'オーク呪術師', hp: 14, spd: 24, fw: 16, fh: 23, sc: 2, hw: 11, hh: 30, mid: true, shooter: true },
  { key: 'orc_warrior', name: 'オーク兵',     hp: 2,  spd: 34, fw: 16, fh: 23, sc: 1, hw: 5,  hh: 16 },   // 9: attacks the town
];
const ENEMY_IMGS = ENEMY_TYPES.map(t => { const im = new Image(); im.src = 'assets/enemies/' + t.key + '.png'; return im; });
const MAX_ALIVE = 24, ENEMY_BULLET = '#b45cff';
// every wave ends with one boss: that wave's enemy, made big
const LAST_WAVE = 4;
const BOSS_NAMES = ['キングスライム', 'ゴブリンキング', 'ガイコツ大将', '大まじない師', '魔王'];
const BOSS_HP = [14, 16, 20, 16, 48];   // 北の魔王 (index 4) is the toughest
BOSS_NAMES[9] = 'オーク隊長'; BOSS_HP[9] = 22;
const WAVE_BOSS = [0, 1, 2, 4];   // wave 1..4 -> enemy type (wave 4 = 魔王, the last boss)
// 協力モード：WAVEごとのボスの種類
function bossTypeFor(w) { return WAVE_BOSS[(w - 1) % WAVE_BOSS.length]; }
// size / hit box of an enemy (bosses are drawn 3x, the demon 2x)
function eDims(e) {
  const T = ENEMY_TYPES[e.type];
  if (!e.boss) return { sc: T.sc, hw: T.hw, hh: T.hh, r: T.mid ? 8 : 4 };
  const sc = T.boss ? T.sc : 3, k = sc / T.sc;
  return { sc, hw: T.hw * k, hh: T.hh * k, r: 10 };
}
const NPC_IMGS = {};
for (const k of ['doc', 'elf_f', 'elf_m', 'knight_m', 'knight_f', 'dwarf_m', 'dwarf_f', 'wizzard_f', 'lizard_m']) { const im = new Image(); im.src = 'assets/story/npc_' + k + '.png'; NPC_IMGS[k] = im; }
const KING_IMG = new Image(); KING_IMG.src = 'assets/story/king.png';
const CHEST_IMG = new Image(); CHEST_IMG.src = 'assets/story/chest.png';
