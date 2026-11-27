// ================================================================================================
// js/render.js — 画面に描く・毎フレームの処理
// drawing helpers (enemies, characters, pickups, hearts) and frame(): move, update, draw — 60 times a second
// (loaded 11/12: may use anything from the files loaded before it)
// ================================================================================================

// ---- 描く部品 ----------------------------------------------------
function pushObstacleDrawables(list) {     // only those near the screen
  const x0 = Math.floor(camX / TILE) - 1, y0 = Math.floor(camY / TILE) - 1;
  const x1 = Math.ceil((camX + VW) / TILE) + 1, y1 = Math.ceil((camY + VH) / TILE) + 3;
  for (let y = Math.max(0, y0); y < Math.min(MAP_H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(MAP_W, x1); x++) {
    const o = obst[y][x]; if (!o || o === 3) continue;
    const v = ((x * 7 + y * 13) % 2);
    const bx = x * TILE + 8, by = y * TILE + 15;
    const set = OB_SPRITES[SCENES[curScene].theme] || OB_SPRITES.grass, im = set[o === 4 ? 2 : o][v];
    if (o === 2 || o === 4) list.push({ y: by, draw: () => {
      const behind = me.y < by && me.y > by - 30 && Math.abs(me.x - bx) < 15;   // you are behind this tree: see through it
      if (behind) ctx.globalAlpha = .5;
      ctx.drawImage(im, bx - (im.width >> 1), by - im.height + 1);
      ctx.globalAlpha = 1;
    } });
    else list.push({ y: by, draw: () => ctx.drawImage(im, bx - (im.width >> 1), by - im.height + 1) });
  }
}
function drawWaves(now) {   // little moving highlights on visible sea tiles
  if (!THEME.wave) return;
  const x0 = Math.floor(camX / TILE) - 1, y0 = Math.floor(camY / TILE) - 1;
  const x1 = Math.ceil((camX + VW) / TILE) + 1, y1 = Math.ceil((camY + VH) / TILE) + 1;
  ctx.fillStyle = THEME.wave;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const inMap = x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
    if (inMap && land[y][x]) continue;
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    if (h % 5) continue;
    const ph = (now / 900 + (h % 97) / 97) % 1;
    const wx = x * TILE + 2 + (h % 7) + Math.round(Math.sin(ph * Math.PI * 2) * 2), wy = y * TILE + 4 + (h >> 3) % 8;
    ctx.fillRect(wx, wy, 4, 1); ctx.fillRect(wx + 1, wy - 1, 2, 1);
  }
}
const HEART = ['01010', '11111', '11111', '01110', '00100'];
// メロンソーダ中の足あと
function drawSpeedTrail(x, y, now) {
  ctx.fillStyle = 'rgba(200, 255, 210, .7)';
  const ph = (now / 60 | 0) % 3;
  for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(x) - 9 + ((i + ph) % 3) * 6, Math.round(y) - 1 - i % 2, 3, 1);
}
// 地面の物（武器・アイテム・宝箱）を描く
function drawPickup(pk, now) {
  const W = WEAPONS[pk.w], im = pk.w === 'chest' || pk.w === 'tchest' ? CHEST_IMG : W ? W_IMGS[W.icon] : ITEM_IMGS[pk.w]; if (!im || !im.complete || !im.naturalWidth) return;
  const bob = Math.round(Math.sin(now / 250 + pk.id) * 2), sc = im.height > 24 ? .5 : 1;
  const w = Math.round(im.width * sc), h = Math.round(im.height * sc), x = Math.round(pk.x), y = Math.round(pk.y);
  ctx.fillStyle = 'rgba(255, 240, 150, .35)'; ctx.beginPath(); ctx.ellipse(x, y - 1, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(im, x - Math.round(w / 2), y - h - 4 + bob, w, h);
  if ((now / 400 | 0) % 2) { ctx.fillStyle = '#fff8c8'; ctx.fillRect(x + 5, y - h - 6 + bob, 1, 1); ctx.fillRect(x - 6, y - 8 + bob, 1, 1); }
}
// 敵を描く（ボスの予告線・ためなども）
function drawEnemy(e, x, y, now) {
  const T = ENEMY_TYPES[e.type], im = ENEMY_IMGS[e.type], D = eDims(e), sc = D.sc;
  const act = e.act || 0;
  // a leaping slime is drawn higher than its shadow
  const lift = e.boss && T.key === 'swampy' && act === 2 ? Math.round(Math.sin(Math.min(1, e.jp || 0) * Math.PI) * 46) : 0;
  const w = T.fw * sc, h = T.fh * sc, dx = Math.round(x - w / 2), dy = Math.round(y - h) - lift;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(x - D.hw), Math.round(y) - 1, Math.round(D.hw * 2), 2);
  if (e.boss) {
    if (T.key === 'goblin' && act === 1) {       // dash warning line
      ctx.save(); ctx.globalAlpha = .35 + .35 * ((now / 80 | 0) % 2); ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + Math.cos(e.ang) * 150, y - 8 + Math.sin(e.ang) * 150); ctx.stroke(); ctx.restore();
    }
    if (T.key === 'swampy' && (act === 1 || act === 2)) {   // landing marker
      ctx.save(); ctx.strokeStyle = 'rgba(255, 80, 80, .7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.jx1 || x, e.jy1 || y, 30, 18, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (T.key === 'big_demon' && e.rage) {      // enraged aura
      ctx.save(); ctx.globalAlpha = .25 + .15 * Math.sin(now / 120); ctx.fillStyle = '#ff2a2a';
      ctx.beginPath(); ctx.ellipse(x, y - 4, D.hw + 8, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  if (now - (e.flash || 0) < 160 && (now / 50 | 0) % 2) return;        // hit flash
  if (e.boss && T.key === 'big_demon' && act === 1) ctx.globalAlpha = .35 + .3 * ((now / 70 | 0) % 2);   // fading out to teleport
  const f = Math.floor(now / 130 + e.id) % 4;
  if (im.complete && im.naturalWidth) {
    if (e.face < 0) { ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(im, f * T.fw, 0, T.fw, T.fh, 0, 0, w, h); ctx.restore(); }
    else ctx.drawImage(im, f * T.fw, 0, T.fw, T.fh, dx, dy, w, h);
  }
  ctx.globalAlpha = 1;
  if ((e.boss || T.mid) && act === 1) {           // "!" before every boss attack
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(Math.round(x) - 1, dy - 16, 3, 7); ctx.fillRect(Math.round(x) - 1, dy - 7, 3, 2);
  }
  if (e.boss && T.key === 'goblin' && act === 3) { // dizzy
    for (let i = 0; i < 3; i++) { const a = now / 200 + i * 2.1; ctx.fillStyle = '#fff46b'; ctx.fillRect(Math.round(x + Math.cos(a) * 12), Math.round(dy + 4 + Math.sin(a) * 4), 2, 2); }
  }
  if (T.mid && !e.aggro) {                        // sleeping mid-boss
    const zz = (now / 500 | 0) % 3; ctx.fillStyle = '#e8e2c8';
    for (let i = 0; i <= zz; i++) { const zx = Math.round(x) + 6 + i * 5, zy = dy - 6 - i * 5; ctx.fillRect(zx, zy, 4, 1); ctx.fillRect(zx + 2, zy + 1, 1, 1); ctx.fillRect(zx + 1, zy + 2, 1, 1); ctx.fillRect(zx, zy + 3, 4, 1); }
  }
  if (e.boss || e.maxHp > 1) {        // health bar
    const bw = e.boss ? 40 : T.mid ? 24 : 12, bx = Math.round(x - bw / 2), by = dy - 4;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
    ctx.fillStyle = e.boss ? '#ff4d6d' : T.mid ? '#ff9f43' : '#f2c14e'; ctx.fillRect(bx, by, Math.max(0, Math.round(bw * e.hp / e.maxHp)), 2);
    if (e.boss || T.mid) {               // a tag so a boss and a mid-boss are never mixed up
      const tag = e.boss ? 'BOSS' : '番人';
      ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#000'; ctx.fillText(tag, Math.round(x) + 1, by - 2);
      ctx.fillStyle = e.boss ? '#ff6b7f' : '#ffb366'; ctx.fillText(tag, Math.round(x), by - 3);
      ctx.textAlign = 'start';
    }
  }
}
// プレイヤーを描く（ライフのハート・P番号も）
function drawChar(c, x, y, dir, frame, slot, isMe, p = {}) {
  const now = performance.now();
  let dx = Math.round(x - FW / 2), dy = Math.round(y - FH);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fillRect(dx + 5, dy + FH - 2, 10, 2); ctx.fillRect(dx + 4, dy + FH - 1, 12, 1);
  if (now - (p.atkT || -1e9) < 140) { frame = 1; dx += Math.round((p.ax || 0) * 2); dy += Math.round((p.ay || 0) * 2); }   // small lunge
  const blink = p.inv && !p.down && (now / 90 | 0) % 2;
  if (p.down) ctx.globalAlpha = .4;
  if (!blink && imgs[c] && imgs[c].complete) ctx.drawImage(imgs[c], (p.down ? 0 : frame) * FW, ROWS[p.down ? 'down' : dir] * FH, FW, FH, dx, dy, FW, FH);
  ctx.globalAlpha = 1;
  // life hearts above the tag
  const lv = p.life === undefined ? lifeMaxOf(p) : p.life;
  const nH = lifeMaxOf(p);                       // 3 hearts, or more after finding いのちのハート (kept centred)
  for (let i = 0; i < nH; i++) {
    const hx = dx + 1 - (nH - 3) * 3 + i * 6, hy = dy - 8;
    ctx.fillStyle = i < lv ? '#e5484d' : 'rgba(30,30,30,.55)';
    HEART.forEach((row, r) => [...row].forEach((b, cc) => { if (b === '1') ctx.fillRect(hx + cc, hy + r, 1, 1); }));
  }
  // player tag: small coloured flag with P-number above the head
  const tx = dx + 5, ty = dy - 1;
  ctx.fillStyle = '#111'; ctx.fillRect(tx - 1, ty - 1, 11, 7);
  ctx.fillStyle = SLOT_COLORS[slot - 1]; ctx.fillRect(tx, ty, 9, 5);
  drawDigit(slot, tx + 3, ty, isMe);
}
const DIGITS = { 1: ['010', '110', '010', '010', '111'], 2: ['110', '001', '010', '100', '111'], 3: ['110', '001', '010', '001', '110'], 4: ['101', '101', '111', '001', '001'] };
// 小さな数字を描く
function drawDigit(n, x, y, isMe) {
  ctx.fillStyle = isMe ? '#fff' : '#111';
  (DIGITS[n] || []).forEach((row, r) => [...row].forEach((b, c) => { if (b === '1') ctx.fillRect(x + c, y + r, 1, 1); }));
}

// ---- 毎フレームの処理 --------------------------------------------
const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
let last = performance.now();
// 毎フレーム：①自分を動かす ②出口・会話・拾う ③親は弾と敵を動かす ④カメラ ⑤マップ・物・敵・人を手前から順に描く
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (screen === 'select') {
    const f = Math.floor(now / 125) % 4;
    cardCtx.forEach((c, i) => { c.clearRect(0, 0, FW, FH); if (imgs[i].complete) c.drawImage(imgs[i], f * FW, 0, FW, FH, 0, 0, FW, FH); });
  }
  if (screen === 'play') {
    const run = $('run').checked, fast = now < me.fastUntil, speed = (run ? 96 : 48) * (fast ? FAST_MULT : 1);
    // input priority: keys / pad  >  stick  >  tap target
    let vx = 0, vy = 0, step = speed * dt, dir = null;
    const prevX = me.x, prevY = me.y;
    if (me.down) { /* can't move while down */ }
    else if (now < (me.castUntil || 0)) { target = null; vx = vy = 0; }   // praying with the heal staff: stand still
    else if (me.held.size) {
      for (const d of me.held) { vx += VEC[d][0]; vy += VEC[d][1]; }
      dir = [...me.held].pop(); target = null;
    } else if (stick && (stick.vx || stick.vy)) {
      vx = stick.vx; vy = stick.vy; dir = faceOf(vx, vy);
    } else if (target) {
      vx = target.x - me.x; vy = target.y - me.y;
      const dist = Math.hypot(vx, vy);
      if (dist < .5) { target = null; vx = vy = 0; }
      else { dir = faceOf(vx, vy); if (dist < step) step = dist; }
    }
    me.m = vx !== 0 || vy !== 0;
    if (me.m) {
      me.dir = dir;
      const n = Math.hypot(vx, vy), mx = vx / n * step, my = vy / n * step;
      me.aimX = vx / n; me.aimY = vy / n;
      let moved = false;
      if (canStand(me.x + mx, me.y)) { me.x += mx; moved = moved || Math.abs(mx) > 1e-3; }   // per-axis so you slide along the shore
      if (canStand(me.x, me.y + my)) { me.y += my; moved = moved || Math.abs(my) > 1e-3; }
      if (!moved) { me.m = false; if (target) target = null; }
      me.t += dt * (run ? 12 : 8);
    }
    if (!me.m) me.t = 0;
    if (!canStand(me.x, me.y)) { const sp = spawnPoint(me.slot); me.x = sp.x; me.y = sp.y; }   // safety net: never stuck in the sea
    checkExits(prevX, prevY, now);
    camX = Math.round(me.x - VW / 2); camY = Math.round(me.y - 16 - VH / 2);
    if (atkHeld) fire(undefined, undefined, true);
    if (me.castUntil && now < me.castUntil && !atkHeld && !rmbHeld) releaseCast();   // heal staff: let go too early = failed
    if (isHost) {                    // the host runs every place someone is in
      const places = new Set([curScene]);
      for (const sh of shots.values()) places.add(sh.sc || curScene);
      for (const e of enemies.values()) places.add(e.sc);
      for (const sc of places) withMap(sc, () => { stepShots(dt, now); if (mode !== 'pvp') stepEnemies(dt, now); });
    } else stepShots(dt, now);
    if (!isHost) for (const e of enemies.values()) {
      const k = 1 - Math.pow(0.001, dt);
      if (Math.hypot(e.x - e.dx, e.y - e.dy) > 60) { e.dx = e.x; e.dy = e.y; }
      e.dx += (e.x - e.dx) * k; e.dy += (e.y - e.dy) * k;
    }
    $('atk').disabled = me.down;
    const fastLeft = Math.ceil((me.fastUntil - now) / 1000);
    const buffTxt = fastLeft > 0 ? 'はやい！ のこり' + fastLeft + '秒' : '';
    if ($('buff').textContent !== buffTxt) { $('buff').textContent = buffTxt; $('buff').hidden = !buffTxt; }
    interact = null; talkTo = null;
    if (mode === 'story' && !dlgOpen) {
      let best = 30;
      if (KING && Math.hypot(me.x - KING.x, me.y - KING.y) < 36) { interact = 'talk'; talkTo = 'king'; best = 0; }
      for (const n of NPCS) { if (!npcShown(n)) continue; const d = Math.hypot(me.x - n.x, me.y - n.y); if (d < best) { best = d; interact = 'talk'; talkTo = n; } }
      if (WELL && Math.hypot(me.x - WELL.x, me.y - WELL.y) < Math.min(best, 28)) { interact = 'talk'; talkTo = 'well'; }
    }
    const inTown = mode === 'story' && safePlace();
    const wkey = me.w + ':' + me.ammo + ':' + (now < (me.castUntil || 0)) + ':' + interact + ':' + (talkTo === 'well') + ':' + inTown + ':' + dlgOpen + ':' + mode + ':' + save.weapons.length;
    if (wkey !== lastWeaponKey) {
      lastWeaponKey = wkey;
      if (dlgOpen) { $('atk-name').textContent = 'つぎへ'; $('atk-ammo').textContent = ''; }
      else if (inTown) { $('atk-name').textContent = talkTo === 'well' ? 'しらべる' : interact === 'talk' ? 'はなす' : '－'; $('atk-ammo').textContent = interact ? '' : '人に近づく'; }
      else {
        $('atk-name').textContent = (WEAPONS[me.w] || WEAPONS.knife).name;
        $('atk-ammo').textContent = me.w === 'knife' ? '近くだけ' : me.w === 'heal' ? (now < (me.castUntil || 0) ? '祈り中…' : '4秒長押し') : mode === 'story' ? 'ずっと使える' : 'のこり ' + me.ammo;
      }
      $('swap').hidden = !(mode === 'story' && !inTown && save.weapons.length > 0);
    }
    { // the boss's life bar (a real boss in this place only, not a mid-boss)
      let bo = null; for (const e of enemies.values()) if (e.boss && (!isHost || e.sc === curScene)) { bo = e; break; }
      const bkey = bo ? bo.type + ':' + bo.hp + ':' + bo.maxHp + ':' + bo.rage : '';
      if (bkey !== lastBossKey) {
        lastBossKey = bkey; $('bossbar').hidden = !bo;
        if (bo) {
          $('boss-name').textContent = 'BOSS　' + (mode === 'story' || mode === 'coop' ? BOSS_NAMES[bo.type] || ENEMY_TYPES[bo.type].name : ENEMY_TYPES[bo.type].name);
          $('boss-hp').style.width = Math.max(0, Math.round(100 * bo.hp / bo.maxHp)) + '%';
          $('bossbar').classList.toggle('rage', !!bo.rage);
        }
      }
    }

    // smooth other players toward their latest reported position
    for (const o of others.values()) {
      const k = 1 - Math.pow(0.001, dt);
      if (Math.hypot(o.x - o.dx, o.y - o.dy) > 60) { o.dx = o.x; o.dy = o.y; }
      o.dx += (o.x - o.dx) * k; o.dy += (o.y - o.dy) * k;
      o.t = o.m ? o.t + dt * 8 : 0;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = THEME.deep; ctx.fillRect(0, 0, VW, VH);         // open sea beyond the map
    ctx.setTransform(1, 0, 0, 1, -camX, -camY);                       // world space
    ctx.drawImage(world, 0, 0);
    drawWaves(now);
    if (target) {   // destination marker
      const tx = Math.round(target.x), ty = Math.round(target.y), b = (now / 300 | 0) % 2;
      ctx.fillStyle = '#fff6c2';
      ctx.fillRect(tx - 3 - b, ty, 2, 1); ctx.fillRect(tx + 2 + b, ty, 2, 1);
      ctx.fillRect(tx, ty - 2 - b, 1, 2); ctx.fillRect(tx, ty + 1 + b, 1, 2);
    }
    const VD = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const list = [
      { c: me.c, x: me.x, y: me.y, dir: me.dir, f: me.m ? Math.floor(me.t) % 4 : 0, slot: me.slot, me: true, fast: now < me.fastUntil,
        p: { life: me.life, lm: me.lm, down: me.down, inv: me.inv, atkT: me.atkT, ax: me.aimX, ay: me.aimY } },
      ...[...others.values()].filter(o => (o.sc || 'island') === curScene).map(o => ({ c: o.c, x: o.dx, y: o.dy, dir: o.dir, f: o.m ? Math.floor(o.t) % 4 : 0, slot: o.slot, me: false, fast: (o.fs | 0) > 0,
        p: { life: o.life, lm: o.lm, down: o.down, inv: o.inv, atkT: o.atkT, ax: (VD[o.dir] || [0, 1])[0], ay: (VD[o.dir] || [0, 1])[1] } })),
    ].sort((a, b) => a.y - b.y);
    // shots: shadow on the ground, shot at chest height
    for (const sh of shots.values()) {
      if (sh.sc && sh.sc !== curScene) continue;
      const sx = Math.round(sh.x), sy = Math.round(sh.y), ang = Math.atan2(sh.vy, sh.vx);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(sx - 2, sy - 1, 5, 2);
      if (sh.proj === 'arrow' || sh.proj === 'axe') {
        const im = W_IMGS[sh.proj === 'arrow' ? 'arrow' : 'throwing_axe'];
        if (im.complete && im.naturalWidth) {
          ctx.save(); ctx.translate(sx, sy - 12);
          ctx.rotate(sh.proj === 'arrow' ? ang + Math.PI / 2 : sh.spin);
          ctx.drawImage(im, -Math.round(im.width / 2), -Math.round(im.height / 2));
          ctx.restore();
        }
        continue;
      }
      const v = Math.hypot(sh.vx, sh.vy) || 1, ux = sh.vx / v, uy = sh.vy / v;
      const col = sh.proj === 'enemy' ? ENEMY_BULLET : sh.proj === 'orbR' ? '#ff5a4f' : sh.proj === 'orbG' ? '#5fe07a' : (SLOT_COLORS[sh.slot - 1] || '#fff');
      ctx.fillStyle = col;
      ctx.globalAlpha = .45; ctx.fillRect(Math.round(sx - ux * 5) - 1, Math.round(sy - 12 - uy * 5) - 1, 3, 3);
      ctx.globalAlpha = 1;
      ctx.fillRect(sx - 2, sy - 14, 5, 5);
      ctx.fillStyle = '#fff'; ctx.fillRect(sx - 1, sy - 13, 3, 3);
    }
    bossFx = bossFx.filter(b => now - b.t < (b.k === 'mark' ? 1000 : 450));
    for (const b of bossFx) {
      if (b.k === 'mark') {                       // a torch is about to land here
        const q = Math.max(0, Math.min(1, (now - b.t) / 1000));
        ctx.save(); ctx.globalAlpha = .25 + .35 * q + .15 * ((now / 90 | 0) % 2);
        ctx.fillStyle = '#ff5a2a'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 26, 18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(b.x, b.y, 26 * q, 18 * q, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore(); continue;
      }
      const p = Math.max(0, (now - b.t) / 450);
      ctx.save(); ctx.globalAlpha = 1 - p;
      if (b.k === 'boom') {
        for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = 4 + 24 * p; ctx.fillStyle = i % 2 ? '#ffd34a' : '#ff6a2a'; ctx.fillRect(Math.round(b.x + Math.cos(a) * r) - 2, Math.round(b.y - 6 + Math.sin(a) * r * .7) - 2, 4, 4); }
      }
      else if (b.k === 'quake') { ctx.strokeStyle = '#d7ff8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(b.x, b.y, 10 + 40 * p, (10 + 40 * p) * .6, 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (b.k === 'tele' || b.k === 'summon' || b.k === 'rage') {
        ctx.fillStyle = b.k === 'summon' ? '#cfd8ff' : '#c45cff';
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = 6 + 26 * p; ctx.fillRect(Math.round(b.x + Math.cos(a) * r) - 1, Math.round(b.y - 20 + Math.sin(a) * r * .7) - 1, 3, 3); }
      }
      ctx.restore();
    }
    // melee arcs and hammer shockwaves
    fx = fx.filter(f => now - f.t < (f.kind === 'slam' ? WEAPONS[f.w].delay + 260 : f.kind === 'heal' ? WEAPONS[f.w].cast + 350 : 170));
    if (me.castUntil && now >= me.castUntil + 1500) { me.castUntil = 0; me.castId = null; }   // (safety: no word from the host)
    for (const f of fx) {
      if (f.sc && f.sc !== curScene) continue;
      const W = WEAPONS[f.w], k = (now - f.t);
      const o = f.slot === me.slot ? me : otherBySlot(f.slot);
      const follow = (f.kind === 'slam' || f.kind === 'heal') && o;
      const cx = follow ? (o === me ? me.x : o.dx) : f.x, cy = (follow ? (o === me ? me.y : o.dy) : f.y) - 12;
      ctx.save();
      if (f.kind === 'heal') {                       // the healing circle: fills up for 5 seconds, then flashes
        const p = Math.min(1, k / W.cast), done = k >= W.cast, fy = cy + 12;
        if (o && (o === me ? me.down : o.down)) { ctx.restore(); continue; }
        ctx.globalAlpha = done ? Math.max(0, 1 - (k - W.cast) / 350) : 1;
        ctx.fillStyle = done ? 'rgba(255, 190, 220, .45)' : 'rgba(255, 170, 210, ' + (0.08 + 0.1 * p) + ')';
        ctx.beginPath(); ctx.ellipse(cx, fy, W.radius, W.radius * .6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ff9fcf'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.lineDashOffset = -k / 60;
        ctx.beginPath(); ctx.ellipse(cx, fy, W.radius, W.radius * .6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        if (!done) {                                   // how long until it works: a ring over the head
          ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy - 22, 6, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = '#ffd6ea'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy - 22, 6, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
        }
      } else if (f.kind === 'melee') {
        const p = k / 170, r = W.reach * (0.65 + 0.35 * p);
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.w === 'katana' ? '#d8f6ff' : '#ffffff'; ctx.lineWidth = f.w === 'katana' ? 3 : 2;
        const a0 = f.base - W.arc, a1 = f.base - W.arc + (W.arc * 2) * Math.min(1, p * 1.8);
        ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
      } else if (k >= W.delay) {
        const p = (k - W.delay) / 260;
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(cx, cy + 10, W.radius * (0.3 + 0.7 * p), W.radius * (0.3 + 0.7 * p) * .6, 0, 0, Math.PI * 2); ctx.stroke();
      } else {                     // wind-up: hammer raised
        const im = W_IMGS.big_hammer;
        if (im.complete) { ctx.translate(cx, cy - 6); ctx.rotate(-0.6 + k / W.delay * 1.2); ctx.drawImage(im, -5, -30, 10, 37); }
      }
      ctx.restore();
    }
    const drawables = list.map(p => ({ y: p.y, draw: () => { if (p.fast && p.f % 2 === 1) drawSpeedTrail(p.x, p.y, now); drawChar(p.c, p.x, p.y, p.dir, p.f, p.slot, p.me, p.p); } }));
    for (const e of enemies.values()) {
      if (isHost && e.sc !== curScene) continue;
      const ex = isHost ? e.x : e.dx, ey = isHost ? e.y : e.dy;
      drawables.push({ y: ey, draw: () => drawEnemy(e, ex, ey, now) });
    }
    pushObstacleDrawables(drawables);
    if (KING) drawables.push({ y: KING.y, draw: () => {
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(KING.x - 6, KING.y - 1, 12, 2);
      if (KING_IMG.complete && KING_IMG.naturalWidth) ctx.drawImage(KING_IMG, (Math.floor(now / 250) % 4) * 16, 0, 16, 28, KING.x - 8, KING.y - 27, 16, 28);
      if (talkTo === 'king' || !save.talked) { const b = (now / 300 | 0) % 2; ctx.fillStyle = '#fff'; ctx.fillRect(KING.x + 6, KING.y - 38 - b, 9, 7); ctx.fillStyle = '#222'; ctx.fillRect(KING.x + 8, KING.y - 35 - b, 1, 1); ctx.fillRect(KING.x + 10, KING.y - 35 - b, 1, 1); ctx.fillRect(KING.x + 12, KING.y - 35 - b, 1, 1); }
    } });
    if (mode === 'story' && storyPh === 'done' && PORTAL && FIELD_CH[curScene]) drawables.push({ y: PORTAL.y - 8, draw: () => {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const p = ((now / 900) + i / 3) % 1;
        ctx.globalAlpha = 1 - p; ctx.strokeStyle = i % 2 ? '#c9a8ff' : '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(PORTAL.x, PORTAL.y, 6 + 12 * p, (6 + 12 * p) * .55, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = .5; ctx.fillStyle = '#b48cff'; ctx.beginPath(); ctx.ellipse(PORTAL.x, PORTAL.y, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } });
    for (const pk of pickups.values()) if (!pk.sc || pk.sc === curScene) drawables.push({ y: pk.y, draw: () => drawPickup(pk, now) });
    const burning = mode === 'story' && SCENES[curScene].town && storyPh && storyPh !== 'done';
    for (const H of HOUSES) { const im = HOUSE_SPRITES[H.v]; drawables.push({ y: H.y, draw: () => {
      ctx.drawImage(im, Math.round(H.x - 24), H.y - 45);
      if (burning && H.burn) for (let i = 0; i < 7; i++) {            // the town is on fire
        const ph = (now / 120 + i * 1.7) % 6, fx = Math.round(H.x - 14 + i * 4 + Math.sin(now / 200 + i) * 2), fy = Math.round(H.y - 36 - ph * 2);
        ctx.fillStyle = ph < 2 ? '#ffe066' : ph < 4 ? '#ff8a2a' : '#d23a1a'; ctx.fillRect(fx, fy, 3, 4 - (ph / 2 | 0));
        ctx.fillStyle = 'rgba(60, 60, 60, .45)'; ctx.fillRect(fx + 1, Math.round(H.y - 50 - ((now / 60 + i * 13) % 30)), 3, 3);
      }
    } }); }
    if (WELL) drawables.push({ y: WELL.y, draw: () => {
      const x = WELL.x, y = WELL.y, open = save.cleared >= KEY_CH;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 9, y - 1, 18, 2);
      ctx.fillStyle = '#7d8288'; ctx.fillRect(x - 8, y - 10, 16, 10); ctx.fillStyle = '#9ea3aa'; ctx.fillRect(x - 8, y - 10, 16, 2);
      ctx.fillStyle = '#5d6168'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 8 + i * 4, y - 6, 1, 6);
      ctx.fillStyle = open ? ((now / 200 | 0) % 2 ? '#7a3bd1' : '#5a2aa0') : '#1b1d22'; ctx.fillRect(x - 6, y - 12, 12, 3);
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 8, y - 24, 2, 14); ctx.fillRect(x + 6, y - 24, 2, 14); ctx.fillStyle = '#8a3a2a'; ctx.fillRect(x - 10, y - 26, 20, 3);
      if (open) { ctx.fillStyle = 'rgba(190, 120, 255, .55)'; for (let i = 0; i < 4; i++) { const k = (now / 400 + i / 4) % 1; ctx.fillRect(Math.round(x - 4 + i * 3), Math.round(y - 12 - k * 16), 2, 2); } }
      if (talkTo === 'well' || open) { const b = (now / 300 | 0) % 2; ctx.fillStyle = open ? '#e8c547' : '#fff'; ctx.fillRect(x - 1, y - 38 - b, 3, 6); ctx.fillRect(x - 1, y - 30 - b, 3, 2); }
    } });
    for (const n of NPCS) if (npcShown(n)) drawables.push({ y: n.y, draw: () => {
      const im = NPC_IMGS[n.k]; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(n.x - 6, n.y - 1, 12, 2);
      if (im && im.complete && im.naturalWidth) { const fh = im.height; ctx.drawImage(im, (Math.floor(now / 250 + n.tx) % 4) * 16, 0, 16, fh, n.x - 8, n.y - fh + 1, 16, fh); }
      if (talkTo === n) { const b = (now / 300 | 0) % 2, top = n.y - (im && im.height || 28) - 8 - b; ctx.fillStyle = '#fff'; ctx.fillRect(n.x + 4, top, 9, 7); ctx.fillStyle = '#222'; ctx.fillRect(n.x + 6, top + 3, 1, 1); ctx.fillRect(n.x + 8, top + 3, 1, 1); ctx.fillRect(n.x + 10, top + 3, 1, 1); }
    } });
    if (mode === 'story') for (const ex of EXITS) {          // a signpost beside every way out
      if (!ex.ent) continue;
      const ns = ex.side === 'n' || ex.side === 's', side = !ns ? 0 : walkable(ex.ent.x + 30, ex.ent.y) ? 30 : walkable(ex.ent.x + 20, ex.ent.y) ? 20 : walkable(ex.ent.x - 20, ex.ent.y) ? -20 : 0;   // beside the road, never inside a wall
      const sx = Math.round(ex.ent.x + side), sy = Math.round(ex.ent.y + (ns ? 0 : -26));
      const kind = FIELD_CH[ex.to] ? 'boss' : AREA_KIND[ex.to] === 'mid' ? 'mid' : '';   // a boss's place / a mid-boss room get a marked sign
      drawables.push({ y: sy, draw: () => {
        const name = PLACE_NAME[ex.to] || '', locked = ex.need && save.cleared < ex.need;
        ctx.font = 'bold 8px sans-serif'; const label = kind === 'boss' ? '⚠ BOSS' : kind === 'mid' ? '武器の番人' : '', wOf = t => Math.ceil((ctx.measureText(t) || {}).width || t.length * 8);
        const tw = Math.max(34, wOf(name) + 6, label ? wOf(label) + 6 : 0);
        const top = kind ? 10 : 0;                       // marked signs have a second row on top
        ctx.fillStyle = '#5a3d22'; ctx.fillRect(sx - 1, sy - 12, 2, 12);
        ctx.fillStyle = kind === 'boss' ? '#5a1622' : kind === 'mid' ? '#6b3b12' : '#4a321d'; ctx.fillRect(sx - tw / 2 - 1, sy - 24 - top, tw + 2, 13 + top);
        if (kind) {
          ctx.fillStyle = locked ? '#7d6a6a' : kind === 'boss' ? '#c8323f' : '#e07b24'; ctx.fillRect(sx - tw / 2, sy - 23 - top, tw, 10);
          ctx.fillStyle = '#fff3c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, sx, sy - 18 - top);
        }
        ctx.fillStyle = locked ? '#9a8a76' : '#e2c48e'; ctx.fillRect(sx - tw / 2, sy - 23, tw, 11);
        ctx.fillStyle = locked ? '#5d5246' : '#3b2614'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, sx, sy - 17);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      } });
    }
    if (mode === 'story' && !dlgOpen && !me.down) { const gt = guideTarget(); if (gt) {   // the yellow arrow (草原 only): which exit leads to the next place
      const dx = gt.x - me.x, dy = gt.y - me.y, d = Math.hypot(dx, dy);
      if (d > 36) drawables.push({ y: 1e9, draw: () => {
        const a = Math.atan2(dy, dx), b = 26 + Math.sin(now / 160) * 3, ax = me.x + Math.cos(a) * b, ay = me.y - 12 + Math.sin(a) * b;
        ctx.save(); ctx.translate(Math.round(ax), Math.round(ay)); ctx.rotate(a);
        ctx.fillStyle = '#3b2a05'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -7); ctx.lineTo(-2, 0); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -5); ctx.lineTo(-1, 0); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
        ctx.restore();
      } });
    } }
    if (mode === 'story') for (const ex of EXITS) {          // exits: small blinking arrows at every exit, and a fence while locked for you
      const locked = ex.need && save.cleared < ex.need, mx = (ex.x0 + ex.x1) / 2, my = (ex.y0 + ex.y1) / 2;
      if (locked) drawables.push({ y: ex.y1, draw: () => {
        const vertical = ex.side === 'e' || ex.side === 'w', fx0 = ex.side === 'e' ? ex.x0 + 4 : ex.side === 'w' ? ex.x1 - 8 : ex.x0, fy0 = ex.side === 's' ? ex.y0 + 4 : ex.side === 'n' ? ex.y1 - 8 : ex.y0;
        ctx.fillStyle = '#5a3d22';
        if (vertical) { ctx.fillRect(fx0, fy0, 3, ex.y1 - ex.y0); ctx.fillRect(fx0 - 3, fy0 + 8, 9, 2); ctx.fillRect(fx0 - 3, ex.y1 - 12, 9, 2); for (let y = fy0; y < ex.y1; y += 8) { ctx.fillStyle = '#8a6338'; ctx.fillRect(fx0 - 1, y, 5, 6); ctx.fillStyle = '#5a3d22'; } }
        else { ctx.fillRect(fx0, fy0, ex.x1 - ex.x0, 3); for (let x = fx0; x < ex.x1; x += 8) { ctx.fillStyle = '#8a6338'; ctx.fillRect(x, fy0 - 4, 5, 9); ctx.fillStyle = '#5a3d22'; } }
      } });
      else { const b = (now / 400 | 0) % 2, dx = ex.side === 'e' ? 1 : ex.side === 'w' ? -1 : 0, dy = ex.side === 's' ? 1 : ex.side === 'n' ? -1 : 0;
        ctx.fillStyle = 'rgba(255, 248, 200, .8)';
        for (let i = 0; i < 3; i++) { const ax = Math.round(mx + dx * (b * 2) - dx * 6), ay = Math.round(my + dy * (b * 2) - dy * 6); ctx.fillRect(ax + dx * i - Math.abs(dy) * i, ay + dy * i - Math.abs(dx) * i, 1 + Math.abs(dy) * i * 2, 1 + Math.abs(dx) * i * 2); } }
    }
    drawables.sort((a, b) => a.y - b.y).forEach(d => d.draw());
    sparks = sparks.filter(sp => now - sp.t < 300);
    for (const sp of sparks) {
      const k = (now - sp.t) / 300, r = 3 + k * 7;
      ctx.fillStyle = 'rgba(' + (sp.col || '255, 245, 200') + ',' + (1 - k).toFixed(2) + ')';
      for (let a = 0; a < 8; a++) ctx.fillRect(Math.round(sp.x + Math.cos(a * Math.PI / 4) * r) - 1, Math.round(sp.y + Math.sin(a * Math.PI / 4) * r) - 1, 2, 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);                               // screen space
    if (stick) {    // virtual stick
      ctx.save();
      ctx.globalAlpha = .55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .8; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(stick.kx, stick.ky, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  requestAnimationFrame(frame);
}
