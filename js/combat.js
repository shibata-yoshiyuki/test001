// ================================================================================================
// js/combat.js — 攻撃・弾・ダメージ・落ちている物（武器・アイテム・宝箱）
// attacks for every weapon, shots flying, hitting enemies / players, picking things up
// (loaded 7/12: may use anything from the files loaded before it)
// ================================================================================================

// ---- 攻撃 --------------------------------------------------------
function addShot(d, trusted) {
  const id = String(d.id), slot = d.slot | 0;
  if (shots.has(id)) return null;
  let W;
  if (slot === 0) { if (!trusted) return null; W = { spd: +d.spd || 80, rng: +d.rng || 200, dmg: 1, proj: 'enemy' }; }
  else { if (!(slot >= 1 && slot <= MAX)) return null; W = WEAPONS[d.w]; if (!W || W.kind !== 'shot') return null; }
  const v = Math.hypot(+d.vx, +d.vy) || 1;
  const sh = { id, sc: d.sc || SC, slot, w: slot === 0 ? 'enemy' : d.w, x: +d.x, y: +d.y, vx: d.vx / v * W.spd, vy: d.vy / v * W.spd, dist: 0,
    spd: W.spd, rng: W.rng, dmg: W.dmg, pierce: !!W.pierce, homing: !!W.homing, boom: !!W.boomerang, back: false, hits: new Set(), proj: W.proj, spin: 0 };
  if (!isFinite(sh.x) || !isFinite(sh.y)) return null;
  shots.set(id, sh);
  return sh;
}
// draw / spawn what an attack looks like (everyone runs this; the host also decides the hits)
function attackFx(a) {
  const W = WEAPONS[a.w]; if (!W) return;
  const now = performance.now(), base = Math.atan2(a.ay, a.ax);
  if (a.slot !== me.slot) { const o = otherBySlot(a.slot); if (o) o.atkT = now; }
  if (W.kind === 'shot') {
    (W.spread || [0]).forEach((da, i) => {
      const c = Math.cos(base + da), sn = Math.sin(base + da);
      addShot({ id: a.id + ':' + a.w + ':' + i, slot: a.slot, w: a.w, x: a.x + c * 8, y: a.y + sn * 6, vx: c, vy: sn });
    });
  } else fx.push({ kind: W.kind, w: a.w, slot: a.slot, x: a.x, y: a.y, base, t: now, sc: SC });
}
// 攻撃ボタン（会話中は文を進める／村では話しかける）
function fire(aimX, aimY, held) {
  if (dlgOpen) { if (!held) nextLine(); return; }                 // reading: the button turns pages
  if (mode === 'story' && safePlace()) { if (!held && interact) doInteract(); return; }   // no fighting in the castle or villages
  const now = performance.now();
  const W = WEAPONS[me.w] || WEAPONS.knife;
  if (screen !== 'play' || !peer || me.down || now - me.lastShot < W.cd || now < (me.castUntil || 0)) return;
  if (W.kind === 'heal' && held) return;            // the heal staff starts only on a new press
  if (aimX !== undefined) {
    const n = Math.hypot(aimX, aimY);
    if (n > 0.5) { me.aimX = aimX / n; me.aimY = aimY / n; me.dir = faceOf(aimX, aimY); }
  }
  me.lastShot = now; me.atkT = now;
  if (W.kind === 'heal') { me.castUntil = now + W.cast; me.castId = me.slot + '-' + (shotSeq + 1) + '-' + (now | 0); target = null; }   // praying: keep the button down, stand still
  const a = { id: me.slot + '-' + (++shotSeq) + '-' + (now | 0), slot: me.slot, w: me.w, x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, ax: me.aimX, ay: me.aimY };
  if (isHost) performAttack(a, null);
  else {
    attackFx(a);                                   // show it right away
    if (me.w !== 'knife' && mode !== 'story') { me.ammo--; if (me.ammo <= 0) { me.w = 'knife'; me.ammo = 0; } }
    if (hostConn && hostConn.open) hostConn.send({ t: 'atk', ...a });
  }
}
// host: resolve an attack with the weapon the host has on record
function performAttack(a, fromPeer) {
  const st = stats.get(a.slot), now = performance.now();
  if (!st || st.down) return;
  const wk = WEAPONS[st.weapon] ? st.weapon : 'knife', W = WEAPONS[wk];
  if (now - st.lastAtk < W.cd * 0.75) return;      // too fast: ignore
  st.lastAtk = now;
  if (wk !== 'knife' && mode !== 'story') { st.ammo--; if (st.ammo <= 0) { st.weapon = 'knife'; st.ammo = 0; } }   // story weapons never run out
  const att = { ...a, w: wk };
  broadcast({ t: 'atk', ...att }, wk === a.w ? fromPeer : null);   // the attacker already drew it, unless the weapon differs
  attackFx(att);
  if (W.kind === 'melee') resolveMelee(att, W, now);
  else if (W.kind === 'slam') { const sc = SC; setTimeout(() => withMap(sc, () => resolveSlam(att, W)), W.delay); }
  else if (W.kind === 'heal') { const sc = SC; st.castUntil = now + W.cast; st.castId = att.id; setTimeout(() => withMap(sc, () => resolveHeal(att, W)), W.cast); }
  syncFromStats();
}
// いやしの杖：祈り終わったとき、丸の中で生きている仲間（自分も）をライフ1回復
function resolveHeal(att, W) {
  const st = stats.get(att.slot);
  if (!st || st.down || st.castId !== att.id) return;   // let go of the button, or got hit: the prayer failed
  st.castId = null; st.castUntil = 0;
  const me_ = playerTargets().find(p => p.slot === att.slot); if (!me_) return;
  const healed = [];
  for (const p of alivePlayers()) {
    if (Math.hypot(p.x - me_.x, (p.y - me_.y) / .6) > W.radius) continue;
    const s2 = stats.get(p.slot);
    if (s2 && !s2.down && s2.life < lifeMaxOf(s2)) { s2.life++; healed.push(p.slot); }
  }
  const m = { t: 'heal', slot: att.slot, x: Math.round(me_.x), y: Math.round(me_.y), healed };
  broadcast(m); if (SC === curScene) onHealFx(m);
  syncFromStats();
}
// 親：祈りが途切れた（ボタンを離した／攻撃を受けた）
function cancelCast(slot, why) {
  const st = stats.get(slot);
  if (!st || !st.castId) return;
  st.castId = null; st.castUntil = 0;
  const m = { t: 'castx', slot, why };
  broadcast(m); if (SC === curScene) onCastX(m);
}
// 祈りが途切れたときの表示（全員のブラウザで動く）
function onCastX(d) {
  fx = fx.filter(f => !(f.kind === 'heal' && f.slot === d.slot));
  if (d.slot === me.slot) { me.castUntil = 0; me.castId = null; }   // (no message: the circle just disappears)
}
// 子：自分でボタンを離した → 親に知らせる（親なら自分で取り消す）
function releaseCast() {
  if (!me.castUntil) return;
  if (isHost) withMap(curScene, () => cancelCast(me.slot, 'release'));
  else { onCastX({ slot: me.slot, why: 'release' }); if (hostConn && hostConn.open) hostConn.send({ t: 'castx' }); }
}
// 回復したときの表示（全員のブラウザで動く）
function onHealFx(d) {
  if (d.slot === me.slot) { me.castUntil = 0; me.castId = null; }
  const now = performance.now(), healed = Array.isArray(d.healed) ? d.healed : [];
  for (const sl of healed) {
    const p = sl === me.slot ? me : otherBySlot(sl);
    if (p) for (let i = 0; i < 6; i++) sparks.push({ x: (p === me ? me.x : p.dx) + (Math.random() - .5) * 14, y: (p === me ? me.y : p.dy) - 12 - Math.random() * 14, t: now + i * 40, col: '255, 160, 200' });
  }
  if (healed.includes(me.slot)) toast(d.slot === me.slot ? 'いやしの杖：' + healed.length + '人のライフが1回復した' : slotName(d.slot) + 'のいやしの杖でライフが1回復した');
}
// ナイフ・刀：前の扇形に当たったか
function resolveMelee(att, W, now) {
  const ox = att.x, oy = att.y - 12, base = Math.atan2(att.ay, att.ax);
  const inArc = (tx, ty, rad) => {
    const dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy);
    if (d > W.reach + rad) return false;
    return d < rad + 3 || angleDiff(Math.atan2(dy, dx), base) <= W.arc;
  };
  if (mode !== 'pvp') {
    for (const e of [...enemies.values()]) { if (e.sc !== SC) continue; const D = eDims(e); if (inArc(e.x, e.y - D.hh / 2, D.hw)) hitEnemy(e, att.slot, W.dmg, '', true); }
  } else {
    for (const t of playerTargets()) if (t.slot !== att.slot && inArc(t.x, t.y - 12, 7)) damagePlayer(t.slot, t.x - att.x, t.y - att.y, att.slot, '', now, true);
  }
}
// 大ハンマー：周りの円に当たったか
function resolveSlam(att, W) {
  if (!isHost) return;
  const st = stats.get(att.slot); if (!st || st.down) return;
  const p = att.slot === me.slot ? me : otherBySlot(att.slot); if (!p) return;
  const now = performance.now(), cx = p.x, cy = p.y - 8;
  if (mode !== 'pvp') {
    for (const e of [...enemies.values()]) { if (e.sc !== SC) continue; const D = eDims(e); if (Math.hypot(e.x - cx, e.y - D.hh / 2 - cy) <= W.radius + D.hw) hitEnemy(e, att.slot, W.dmg, '', true); }
  } else {
    for (const t of playerTargets()) if (t.slot !== att.slot && Math.hypot(t.x - cx, t.y - 12 - cy) <= W.radius + 6) damagePlayer(t.slot, t.x - cx, t.y - cy, att.slot, '', now, true);
  }
}
// 敵にダメージ（倒れたら撃破数・落とし物・武器の番人の武器）
function hitEnemy(e, by, dmg, shotId, keep) {
  const T = ENEMY_TYPES[e.type];
  e.hp = Math.round((e.hp - dmg) * 100) / 100;      // half-damage weapons: keep the numbers tidy
  if (shotId && !keep) shots.delete(shotId);
  const st = stats.get(by);
  if (T.mid && !e.aggro) wakeMids(e);
  if (e.hp <= 0) {
    enemies.delete(e.id); if (st) st.ko++;
    if (T.mid) {                         // drops a weapon to keep (one per person per visit)
      const pool = CH_POOL[MID_CH[SC]] || PICK_WEAPONS, kst = stats.get(by), fresh = pool.filter(k => !kst || !kst.owned.has(k));
      const list = fresh.length ? fresh : pool, w = pickOne(list);
      spawnPickup(w, e.x, e.y, { keep: 1 });
      if (SC === curScene) toast(slotName(by) + 'が' + T.name + 'を倒した！ ' + WEAPONS[w].name + 'を落とした！');
    }
    else if (e.boss && mode === 'story') { toast(slotName(by) + 'が' + (BOSS_NAMES[e.type] || 'ボス') + 'を倒した！'); dropItem('food', e.x, e.y); }
    else if (e.boss) { toast(slotName(by) + 'が' + (BOSS_NAMES[e.type] || 'ボス') + 'を倒した！'); dropWeapon(e.x - 12, e.y); dropWeapon(e.x + 12, e.y); }
    else if (mode === 'story') {                  // story: small enemies never drop weapons
      const r = Math.random();
      if (r < 0.08) dropItem('food', e.x, e.y); else if (r < 0.14) dropItem('drink', e.x, e.y);
    } else {
      const r = Math.random();
      if (r < 0.06) dropWeapon(e.x, e.y);
      else if (r < 0.14) dropItem('food', e.x, e.y);
      else if (r < 0.20) dropItem('drink', e.x, e.y);
    }
  }
  const msg = { t: 'ehit', id: shotId || '', keep: !!keep, eid: e.id, hp: e.hp, x: e.x, y: e.y - eDims(e).hh * .6 };
  broadcast(msg); if (SC === curScene) onEhit(msg); syncFromStats();
}
function nearestFoe(sh, maxD) {    // for homing shots
  let best = null, bd = maxD;
  if (mode !== 'pvp') {
    for (const e of enemies.values()) { if (isHost && e.sc !== SC) continue; const x = isHost ? e.x : e.dx, y = isHost ? e.y : e.dy, d = Math.hypot(x - sh.x, y - sh.y); if (d < bd) { bd = d; best = { x, y }; } }
  } else {
    const cand = [{ slot: me.slot, x: me.x, y: me.y, down: me.down }, ...[...others.values()].filter(o => (o.sc || 'island') === SC).map(o => ({ slot: o.slot, x: o.dx, y: o.dy, down: o.down }))];
    for (const c of cand) { if (c.slot === sh.slot || c.down) continue; const d = Math.hypot(c.x - sh.x, c.y - sh.y); if (d < bd) { bd = d; best = c; } }
  }
  return best;
}

// ---- 弾 ----------------------------------------------------------
// 飛んでいる弾を動かして、当たりを調べる（親）
function stepShots(dt, now) {
  for (const sh of shots.values()) {
    if (sh.sc && sh.sc !== SC) continue;        // the host runs each place separately
    if (sh.homing) {
      const f = nearestFoe(sh, 140);
      if (f) {
        const cur = Math.atan2(sh.vy, sh.vx), want = Math.atan2(f.y - sh.y, f.x - sh.x);
        let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        const na = cur + Math.max(-4.5 * dt, Math.min(4.5 * dt, d));
        sh.vx = Math.cos(na) * sh.spd; sh.vy = Math.sin(na) * sh.spd;
      }
    }
    if (sh.boom && sh.back) {      // fly back to the thrower
      const o = sh.slot === me.slot ? me : otherBySlot(sh.slot);
      const ox = o ? (o === me ? me.x : o.dx) : sh.x, oy = o ? (o === me ? me.y : o.dy) : sh.y, d = Math.hypot(ox - sh.x, oy - sh.y);
      if (!o || d < 10) { shots.delete(sh.id); continue; }
      sh.vx = (ox - sh.x) / d * sh.spd; sh.vy = (oy - sh.y) / d * sh.spd;
    }
    sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.dist += sh.spd * dt; sh.spin += dt * 18;
    if (obstacleAt(sh.x, sh.y)) {  // trees and rocks stop shots
      if (sh.boom && !sh.back) { sh.back = true; sh.hits.clear(); } else { shots.delete(sh.id); continue; }
    }
    if (sh.dist > sh.rng) {
      if (sh.boom && !sh.back) { sh.back = true; sh.hits.clear(); }
      else if (!sh.boom || sh.dist > sh.rng * 3.5) { shots.delete(sh.id); continue; }
    }
    if (!isHost) continue;                      // only the host decides hits
    const oy = sh.y - 12;                       // where the shot is drawn
    if (sh.slot !== 0 && mode !== 'pvp') {      // co-op / story: player shots hit enemies only
      for (const e of [...enemies.values()]) {
        if (e.sc !== SC || sh.hits.has('e' + e.id)) continue;
        const D = eDims(e);
        if (Math.abs(sh.x - e.x) <= D.hw + 3 && oy >= e.y - D.hh - 6 && oy <= e.y + 4) {
          sh.hits.add('e' + e.id);
          hitEnemy(e, sh.slot, sh.dmg, sh.id, sh.pierce);
          if (!sh.pierce) break;
        }
      }
      continue;
    }
    for (const t of playerTargets()) {
      if (t.slot === sh.slot || sh.hits.has('p' + t.slot)) continue;
      if (Math.abs(sh.x - t.x) <= 9 && oy >= t.y - 30 && oy <= t.y + 2) {
        if (damagePlayer(t.slot, sh.vx, sh.vy, sh.slot, sh.id, now, sh.pierce)) { sh.hits.add('p' + t.slot); if (!sh.pierce) break; }
      }
    }
  }
}

// ---- 落ちている物 ------------------------------------------------
// 親：宝箱があけられた → この部屋では二度と出さず、部屋にいる全員の記録にも「あけた」と残す
const roomChests = new Set();
function chestGone(key) {
  if (!key) return;
  roomChests.add(key);
  for (const st of stats.values()) st.chests.add(key);
  const m = { t: 'chestgone', key };
  for (const { conn } of conns.values()) if (conn.open) conn.send(m);
  onChestGone(m);
}
// 宝箱がなくなったことを自分の記録に残す（全員のブラウザで動く）
function onChestGone(d) {
  const k = String(d.key || '');
  if (k && mode === 'story' && !save.chests.includes(k)) { save.chests.push(k); writeSave(); }
}
// 地面に物を置く（武器・アイテム・宝箱）
function spawnPickup(w, x, y, extra) {
  const here = [...pickups.values()].filter(p => p.sc === SC);   // at most 10 things on the ground per place; chests and kept weapons stay
  if (here.length >= 10) { const old = here.find(p => p.w !== 'tchest' && !p.keep); if (old) pickups.delete(old.id); }
  const id = ++pickSeq; pickups.set(id, { id, w, x, y, sc: SC, ...(extra || {}) }); return id;
}
// ランダムな武器
function randomWeapon() { return pickOne(PICK_WEAPONS); }
// 敵が倒れた場所に落とし物
function dropAt(key, x, y) {
  for (let i = 0; i < 12; i++) { const px = x + (Math.random() - .5) * 24 * (i > 0), py = y + (Math.random() - .5) * 16 * (i > 0); if (canStand(px, py)) { spawnPickup(key, px, py); return; } }
}
function dropWeapon(x, y) { dropAt(randomWeapon(), x, y); }
function dropItem(key, x, y) { dropAt(key, x, y); }
function stepPickups(now) {      // host
  if (mode === 'pvp' && now >= nextPickSpawn) {
    nextPickSpawn = now + 9000;
    if ([...pickups.values()].filter(p => WEAPONS[p.w]).length < 3) { const p = randomLandSpot(); spawnPickup(randomWeapon(), p.x, p.y); }
  }
  if (mode === 'pvp' && now >= nextItemSpawn) {
    nextItemSpawn = now + 12000;
    if ([...pickups.values()].filter(p => ITEMS[p.w]).length < 2) { const p = randomLandSpot(); spawnPickup(Math.random() < .5 ? 'food' : 'drink', p.x, p.y); }
  }
  for (const pk of [...pickups.values()]) {
    if (pk.sc !== SC) continue;
    for (const t of alivePlayers()) {
      if (Math.abs(t.x - pk.x) < 11 && Math.abs(t.y - pk.y) < 9) {
        const st = stats.get(t.slot);
        let w = pk.w, chest = 0;
        if (pk.w === 'tchest') {             // a treasure chest: whoever opens it first gets it, then it is gone for everyone
          pickups.delete(pk.id);
          chestGone(pk.key);
          if (pk.heart) {                    // the heart chest: one more life, for good (saved by the opener)
            st.lm = lifeMaxOf(st) + 1; st.life = st.lm;
            const m = { t: 'pick', id: pk.id, slot: t.slot, w: 'tchest', item: 'heart', key: pk.key };
            broadcast(m); if (SC === curScene) onPick(m); syncFromStats();
            break;
          }
          const item = Math.random() < .5 ? 'food' : 'drink';
          spawnPickup(item, pk.x, pk.y + 14);
          const m = { t: 'pick', id: pk.id, slot: t.slot, w: 'tchest', item, key: pk.key };
          broadcast(m); if (SC === curScene) onPick(m);
          break;
        }
        if (pk.w === 'food') { if (st.life >= lifeMaxOf(st)) continue; st.life++; }     // full life: leave the cake for someone else
        else if (pk.w === 'drink') st.fastUntil = now + FAST_MS;
        else if (pk.keep) {                    // story: a mid-boss's weapon, kept forever (one per person per visit)
          const ckey = SC + ':' + areaOf(SC).inst;
          if (st.chestSq === ckey) { if (!st.chestHint) { st.chestHint = true; sendNote(t.slot, 'ここの武器はもう1つ拾いました。残りは仲間のぶんです'); } continue; }
          st.chestSq = ckey; st.chestHint = false;
          st.owned.add(w); st.weapon = w; st.ammo = 0; chest = 1;
        }
        else { st.weapon = pk.w; st.ammo = WEAPON_USES; }
        const msg = { t: 'pick', id: pk.id, slot: t.slot, w, chest };
        pickups.delete(pk.id);
        broadcast(msg); if (SC === curScene) onPick(msg); syncFromStats();
        break;
      }
    }
  }
}
// 拾ったときの表示（全員のブラウザで動く）
function onPick(d) {
  pickups.delete(d.id);
  if (d.w === 'tchest') {
    sparks.push({ x: d.x || me.x, y: me.y - 14, t: performance.now(), col: '255, 215, 90' });
    if (d.item === 'heart') {
      if (d.slot === me.slot) {
        banner('いのちのハート！<small>ライフの上限が1つ増えた（ずっと続きます）</small>', 3500);
        save.hearts = (save.hearts | 0) + 1;
        if (d.key && !save.chests.includes(d.key)) save.chests.push(String(d.key));
        writeSave();
      } else toast(slotName(d.slot) + 'が宝箱から「いのちのハート」を見つけた！');
      refreshListIfChanged();
      return;
    }
    if (d.slot === me.slot) {
      toast('宝箱をあけた！ ' + (ITEMS[d.item] ? ITEMS[d.item].name : '') + 'が出てきた');
      if (d.key && !save.chests.includes(d.key)) { save.chests.push(String(d.key)); writeSave(); }
    }
    return;
  }
  const it = ITEMS[d.w];
  if (it) {
    const p = d.slot === me.slot ? me : otherBySlot(d.slot);
    if (p) sparks.push({ x: p === me ? me.x : p.dx, y: (p === me ? me.y : p.dy) - 14, t: performance.now(), col: d.w === 'food' ? '255, 120, 140' : '120, 240, 140' });
    if (d.slot === me.slot) {
      if (d.w === 'food') me.life = Math.min(lifeMaxOf(me), me.life + 1); else me.fastUntil = performance.now() + FAST_MS;
      toast(it.name + '：' + it.text);
    } else if (p && d.w === 'drink') p.fs = FAST_MS;
    refreshListIfChanged();
    return;
  }
  const W = WEAPONS[d.w]; if (!W) return;
  if (d.chest) {
    const p = d.slot === me.slot ? me : otherBySlot(d.slot);
    if (p) sparks.push({ x: p === me ? me.x : p.dx, y: (p === me ? me.y : p.dy) - 14, t: performance.now(), col: '255, 215, 90' });
    if (d.slot === me.slot) {
      me.w = d.w; me.ammo = 0;
      if (!save.weapons.includes(d.w)) save.weapons.push(d.w);
      writeSave();
      banner(W.name + 'を手に入れた！<small>威力 ' + W.dmg + '（ナイフは1）／ずっと使える／「持ちかえ」かQキーで切りかえ</small>', 3500);
    } else { const o = otherBySlot(d.slot); if (o) o.w = d.w; toast(slotName(d.slot) + 'が' + W.name + 'を手に入れた！'); }
    refreshListIfChanged();
    return;
  }
  if (d.slot === me.slot) { me.w = d.w; me.ammo = WEAPON_USES; toast(W.name + 'を手に入れた！（' + WEAPON_USES + '回使えます）'); }
  else { const o = otherBySlot(d.slot); if (o) o.w = d.w; }
  refreshListIfChanged();
}
// 子：親から届いた地面の物の一覧
function applyPickups(list) {
  pickups.clear();
  for (const [id, w, x, y] of list) if (WEAPONS[w] || ITEMS[w] || w === 'chest' || w === 'tchest') pickups.set(id, { id, w, x, y, sc: curScene });
}

// ---- プレイヤーへのダメージ --------------------------------------
function playerTargets() {            // players standing in the map being simulated (SC)
  const L = [];
  if (curScene === SC) L.push({ slot: me.slot, x: me.x, y: me.y });
  for (const o of others.values()) if ((o.sc || 'island') === SC) L.push({ slot: o.slot, x: o.x, y: o.y });
  return L;
}
// host: one point of damage. by = shooter slot, 0 = enemy. Returns true if it landed.
function damagePlayer(slot, kx, ky, by, shotId, now, keep) {
  const st = stats.get(slot);
  if (!st || st.down || now < st.invUntil) return false;
  st.life = Math.max(0, st.life - 1); st.invUntil = now + INV_MS;
  if (st.castId) cancelCast(slot, 'hit');              // praying with the heal staff: a hit breaks it
  if (st.life === 0) {
    st.down = true;
    st.downUntil = mode !== 'pvp' ? Infinity : now + DOWN_MS;     // co-op / story: revive when the wave is cleared
    const bySt = stats.get(by); if (by && bySt) bySt.ko++;
  }
  const v = Math.hypot(kx, ky) || 1;
  const msg = { t: 'hit', id: shotId || '', keep: !!keep, victim: slot, by, life: st.life, kx: kx / v, ky: ky / v };
  broadcast(msg); if (SC === curScene) onHit(msg); syncFromStats();
  return true;
}
// プレイヤーに当たったときの表示とノックバック
function onHit(d) {
  if (!d.keep) shots.delete(String(d.id));
  const victim = d.victim === me.slot ? me : otherBySlot(d.victim);
  if (victim) sparks.push({ x: victim === me ? me.x : victim.dx, y: (victim === me ? me.y : victim.dy) - 12, t: performance.now() });
  if (d.victim === me.slot) {
    me.life = d.life; me.inv = true;
    if (me.castUntil) { me.castUntil = 0; me.castId = null; }   // (the host sends the 'failed' news too)
    const kx = me.x + d.kx * 10, ky = me.y + d.ky * 10;      // knockback
    if (canStand(kx, ky)) { me.x = kx; me.y = ky; }
    target = null;
    if (d.life <= 0) { me.down = true; toast((d.by ? slotName(d.by) : '敵') + 'にやられた！ ' + (mode === 'pvp' ? '3秒後に復活します' : mode === 'story' && AREA_KIND[curScene] ? '仲間が生きていれば8秒後に復活します' : 'ウェーブを倒しきると復活します')); }
  } else if (victim) {
    victim.life = d.life; victim.inv = true;
    if (d.life <= 0) { victim.down = true; toast(!d.by ? slotName(d.victim) + 'がやられた！' : d.by === me.slot ? slotName(d.victim) + 'を倒した！' : slotName(d.by) + 'が' + slotName(d.victim) + 'を倒した'); }
  }
  refreshListIfChanged();
}
// 復活の表示
function onRespawn(d) {
  if (d.slot === me.slot) {
    me.x = d.x; me.y = d.y; me.down = false; me.life = d.lm || lifeMaxOf(me); target = null; me.castUntil = 0;
    toast('復活しました');
  } else {
    const o = otherBySlot(d.slot);
    if (o) { o.x = o.dx = d.x; o.y = o.dy = d.y; o.down = false; o.life = d.lm || lifeMaxOf(o); }
  }
  refreshListIfChanged();
}
// 敵に当たったときの表示
function onEhit(d) {
  if (!d.keep) shots.delete(String(d.id));
  sparks.push({ x: +d.x, y: +d.y, t: performance.now() });
  const e = enemies.get(d.eid);
  if (e) { e.hp = d.hp; e.flash = performance.now(); if (d.hp <= 0 && !isHost) enemies.delete(d.eid); }
}
// 今の場所で生きているプレイヤー
function alivePlayers() {
  return playerTargets().filter(t => { const st = stats.get(t.slot); return st && !st.down; });
}
