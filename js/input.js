// ================================================================================================
// js/input.js — 操作：キーボード・攻撃ボタン・タップ移動・スティック・見え方
// keyboard, on-screen buttons, tap to walk (tap again to stop), drag stick, zoom levels
// (loaded 10/12: may use anything from the files loaded before it)
// ================================================================================================

// ---- キーボードとボタン ------------------------------------------
const KEYMAP = { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right', ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right' };
const ATTACK_KEYS = new Set(['Space', 'KeyJ', 'Enter']);
addEventListener('keydown', e => {
  if (e.code === 'KeyQ' && screen === 'play' && !e.repeat) { cycleWeapon(); return; }

  if (ATTACK_KEYS.has(e.code) && screen === 'play' && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) {
    e.preventDefault(); atkHeld = true; if (!e.repeat) fire(); return;
  }
  const d = KEYMAP[e.code]; if (!d || screen !== 'play') return;
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  e.preventDefault(); me.held.delete(d); me.held.add(d);
});
addEventListener('keyup', e => { if (ATTACK_KEYS.has(e.code)) atkHeld = false; const d = KEYMAP[e.code]; if (d) me.held.delete(d); });
addEventListener('blur', () => { me.held.clear(); atkHeld = false; });
{
  const b = $('atk');
  const on = e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('on'); atkHeld = true; fire(); };
  const off = () => { b.classList.remove('on'); atkHeld = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
}
document.querySelectorAll('.pad button').forEach(b => {
  const d = b.dataset.dir;
  const on = e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('on'); me.held.delete(d); me.held.add(d); };
  const off = () => { b.classList.remove('on'); me.held.delete(d); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
});

// ---- タップ・スティック ------------------------------------------
const TAP_MS = 350, DRAG_PX = 12, DEAD_PX = 6, STICK_R = 14;
let ptr = null;        // active pointer on the stage
let target = null;     // {x, y} in world pixels
let stick = null;      // {ox, oy, vx, vy, kx, ky} in screen (view) pixels
let VW = 320, VH = 192, camX = 0, camY = 0;
function toGame(e) {   // view pixels
  const r = cv.getBoundingClientRect(), k = VW / r.width;
  return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k };
}

// ---- 見え方（拡大の段階） ----------------------------------------
// how much of the map you see: game pixels across the short side of the screen (16 px = 1 tile)
const VIEWS = [{ name: 'ちかい' }, { px: 340, name: 'ふつう' }, { name: 'ひろい' }];
let viewIdx = 1;
try { const v = +localStorage.getItem('view'); if (v >= 0 && v < VIEWS.length && localStorage.getItem('view') !== null) viewIdx = v; } catch (e) {}
// 画面の大きさと見え方（ちかい/ふつう/ひろい）から、描く大きさを決める
function resize() {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = window.devicePixelRatio || 1;
  // whole-number scaling keeps the pixels crisp; the three levels are one step apart
  const base = Math.max(2, Math.round(Math.min(r.width, r.height) * dpr / VIEWS[1].px));
  const scale = Math.max(1, base + 1 - viewIdx);
  VW = Math.ceil(r.width * dpr / scale); VH = Math.ceil(r.height * dpr / scale);
  cv.width = VW; cv.height = VH;
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', () => { if (screen === 'play') resize(); });
$('zoom').textContent = '見え方：' + VIEWS[viewIdx].name;
$('zoom').addEventListener('click', () => {
  viewIdx = (viewIdx + 1) % VIEWS.length;
  try { localStorage.setItem('view', String(viewIdx)); } catch (e) {}
  $('zoom').textContent = '見え方：' + VIEWS[viewIdx].name;
  resize();
});
cv.addEventListener('pointerdown', e => {
  if (screen === 'play' && e.pointerType === 'mouse' && e.button === 2) {   // PC: right click = shoot toward the cursor
    e.preventDefault();
    const g = toGame(e);
    fire(g.x + camX - me.x, g.y + camY - (me.y - 12));
    return;
  }
  if (screen !== 'play' || ptr || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault(); cv.setPointerCapture?.(e.pointerId);
  ptr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t0: performance.now(), drag: false };
});
cv.addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const ddx = e.clientX - ptr.sx, ddy = e.clientY - ptr.sy, len = Math.hypot(ddx, ddy);
  if (!ptr.drag && len > DRAG_PX) { ptr.drag = true; target = null; }
  if (!ptr.drag) return;
  const g0 = toGame({ clientX: ptr.sx, clientY: ptr.sy }), kk = Math.min(len * g0.k, STICK_R) / (len || 1);
  stick = {
    ox: g0.x, oy: g0.y,
    vx: len > DEAD_PX ? ddx / len : 0, vy: len > DEAD_PX ? ddy / len : 0,
    kx: g0.x + ddx * kk, ky: g0.y + ddy * kk,
  };
});
// 指をはなしたとき：短いタップなら移動先を決める（歩いている途中なら止まる）
function endPointer(e, tapAllowed) {
  if (!ptr || e.pointerId !== ptr.id) return;
  if (tapAllowed && !ptr.drag && performance.now() - ptr.t0 < TAP_MS) {
    const g = toGame(e);
    if (target) target = null;                       // walking to a tapped spot: a tap stops you
    else target = { x: g.x + camX, y: g.y + camY };
  }
  ptr = null; stick = null;
}
cv.addEventListener('pointerup', e => endPointer(e, true));
cv.addEventListener('pointercancel', e => endPointer(e, false));
cv.addEventListener('lostpointercapture', e => endPointer(e, false));
cv.addEventListener('contextmenu', e => e.preventDefault());
