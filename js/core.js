// ================================================================================================
// js/core.js — 基本の設定・共通の道具・みんなで使う状態
// settings (sizes, network timings), $ / pickOne helpers, page guards (no zoom), version check,
// shared game state (me, other players, shots, pickups, enemies...), toast / banner messages, the game canvas
// (loaded 1/12: may use anything from the files loaded before it)
// ================================================================================================

// ---- 設定 --------------------------------------------------------
const SLOT_COLORS = ['#e8c547', '#e0644f', '#5aa9e6', '#9b6be0'];   // P1..P4 tags
const FW = 20, FH = 32, ROWS = { down: 0, left: 1, right: 2, up: 3 };
const TILE = 16, MAX = 4;
let MAP_W = 72, MAP_H = 54;                   // current map in tiles (changes with the scene)
let WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
const ID_PREFIX = 'dotwalk-shibata-test001-';
const CODE_CHARS = '0123456789';
const SEND_MS = 66, TIMEOUT_MS = 15000, JOIN_TIMEOUT_MS = 25000;
// battle
const LIFE_MAX = 3, INV_MS = 1000, DOWN_MS = 3000;   // lives, invincible time after a hit, battle respawn wait
// その人のライフの上限（ストーリーでは森のハートで増える）。p = 状態（lm を持つ）
const lifeMaxOf = p => (p && p.lm) || LIFE_MAX;
// 画面の部品をidで取る
const $ = id => document.getElementById(id);
const pickOne = a => a[Math.random() * a.length | 0];   // one item of an array, at random
// no zooming: pinch, Safari gestures, Ctrl+wheel and Ctrl +/- / 0 (double-tap zoom is off via touch-action in CSS)
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || e.scale && e.scale !== 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', ';'].includes(e.key)) e.preventDefault();
});
$('ver').textContent = 'ページの版：' + VERSION;
// stale-page check: browsers may keep an old copy of this page for a few minutes
if (typeof fetch === 'function') fetch(location.pathname + '?v=' + Date.now(), { cache: 'no-store' }).then(r => r.text()).then(t => {
  const m = t.match(/const VERSION = '([^']+)'/);
  if (m && m[1] !== VERSION) {
    $('ver').innerHTML = '';
    const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = '新しい版があります。ここを押して再読み込み';
    b.addEventListener('click', () => location.replace(location.pathname + '?v=' + Date.now() + (new URLSearchParams(location.search).get('room') ? '&room=' + new URLSearchParams(location.search).get('room') : '')));
    $('ver').append(b);
    if ($('lobby').hidden && $('select').hidden) toast('新しい版のページがあります。退出してから再読み込みしてください。');
  }
}).catch(() => {});

// ---- みんなで使う状態 --------------------------------------------
const me = { c: 0, x: WORLD_W / 2, y: WORLD_H / 2, dir: 'down', m: false, t: 0, held: new Set(), slot: 0,
  life: LIFE_MAX, down: false, inv: false, ko: 0, aimX: 0, aimY: 1, lastShot: -1e9, atkT: -1e9, w: 'knife', ammo: 0, fastUntil: 0 };
const shots = new Map();           // id -> shot  (x,y = point on the ground; drawn 12px higher)
let fx = [];                       // melee / slam effects
const pickups = new Map();         // id -> {id, w, x, y}
let pickSeq = 0, nextPickSpawn = 0, nextItemSpawn = 0;
let sparks = [];                   // hit effects
let shotSeq = 0, atkHeld = false;
const stats = new Map();           // host only: slot -> {life, invUntil, down, downUntil, ko}
let mode = 'pvp';                  // 'pvp' | 'coop'
let bossFx = [];                  // quake rings / teleport puffs (everyone)
let enemies = new Map();           // id -> {id, type, x, y, hp, maxHp, face, ...}  (host: authoritative, guest: interpolated copy)
let enemySeq = 0;
const game = { wave: 0, phase: 'wait', until: 0, queue: [], nextSpawn: 0, banner: '' };
let lastUI = '', lastWeaponKey = '', lastBossKey = '';
// 部屋の親が持つ、プレイヤー1人分の状態（ライフ・武器・クリア記録など）の初期値
const freshStat = () => ({ life: LIFE_MAX, invUntil: performance.now() + 1500, down: false, downUntil: 0, ko: 0, weapon: 'knife', ammo: 0, lastAtk: -1e9, fastUntil: 0, cleared: 0, owned: new Set(['knife']), chests: new Set() });
let screen = 'select';
let peer = null, isHost = false, roomCode = '';
let hostConn = null;               // client side: connection to host
const conns = new Map();           // host side: peerId -> {conn, slot, last}
let others = new Map();            // key -> {slot,c,x,y,dir,m, dx,dy,t}
let lastHostMsg = 0;
let listSig = '';
// 2つの向き（角度）の差
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); }
// P番号 → 「○○さん」
function slotName(slot) {
  if (slot === me.slot) return 'あなた';
  const o = otherBySlot(slot); return 'P' + slot + (o ? '（' + (NAMES[o.c] || '？') + '）' : '');
}

// ---- 画面のお知らせ ----------------------------------------------
let bannerTimer = 0;
// 画面まんなかの大きな文字（WAVE・章のタイトルなど）
function banner(html, ms, cls) {
  const el = $('banner'); el.innerHTML = html; el.className = 'banner' + (cls ? ' ' + cls : '');
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => { el.classList.add('fade'); setTimeout(() => { if (el.classList.contains('fade')) el.innerHTML = ''; }, 500); }, ms);
}
// ボス（武器の番人ではない）が出たとき：赤い「BOSS」表示
function bossBanner(name) { banner('<span class="boss-tag">BOSS</span>' + name + '<small>ボスが現れた！</small>', 3200, 'boss'); }
let toastTimer = 0;
// 画面上の小さなお知らせ（数秒で消える）
function toast(text) {
  const el = $('play-msg'); el.textContent = text; el.classList.remove('fade');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('fade'); setTimeout(() => { if (el.classList.contains('fade')) el.textContent = ''; }, 700); }, 5000);
}

// ---- ゲームの画面（canvas） --------------------------------
// tap = walk to that spot / press and slide = virtual stick (mouse and touch)
const cv = $('game'), ctx = cv.getContext('2d');
// 動く向き → 上下左右のどれを向くか
function faceOf(vx, vy) { return Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down'); }
ctx.imageSmoothingEnabled = false;
