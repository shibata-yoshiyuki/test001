// ================================================================================================
// js/enemies.js — 敵・中ボス・ボスの動き、協力モードのウェーブ
// enemy spawning and moving, mid-bosses that sleep until you come near, each boss's attack pattern,
// and the co-op wave mode
// (loaded 8/12: may use anything from the files loaded before it)
// ================================================================================================
function spawnWaveRewards() {   // co-op: one weapon per player when a wave is cleared
  const ps = alivePlayers().length ? alivePlayers() : playerTargets();
  for (let i = 0; i < stats.size; i++) {
    const p = ps[i % ps.length];
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, x = p.x + Math.cos(a) * (24 + Math.random() * 24), y = p.y + Math.sin(a) * (18 + Math.random() * 18);
      if (canStand(x, y)) { spawnPickup(randomWeapon(), x, y); break; }
    }
  }
}

// ---- 敵の出現と動き ----------------------------------------------
// 敵の弾を撃つ
function enemyShot(e, vx, vy, spd, rng) {
  const d = { id: 'e-' + (++shotSeq), slot: 0, x: e.x, y: e.y - (e.boss ? 6 : 0), vx, vy, spd, rng };
  if (addShot(d, true)) broadcast({ t: 'shot', ...d });
}
// 敵を出す（at を指定するとその場所に）
function spawnEnemy(type, mult, boss, lv, at) {
  const T = ENEMY_TYPES[type], ps = alivePlayers();
  let spot = at ? (standableNear(at.x, at.y, 8) || at) : null;
  for (let i = 0; i < 400 && !spot; i++) {
    const p = randomLandSpot();
    const dmin = ps.length ? Math.min(...ps.map(q => Math.hypot(q.x - p.x, q.y - p.y))) : 999;
    if (dmin > 170 && dmin < 340 && canStandE(p.x, p.y, boss ? 10 : 4)) spot = p;
  }
  if (!spot) spot = randomLandSpot();
  const hp = Math.ceil((boss ? BOSS_HP[type] : T.hp) * mult);
  const e = { id: ++enemySeq, sc: SC, type, boss: !!boss, lv: lv || 1, x: spot.x, y: spot.y, hp, maxHp: hp, face: 1, cd: boss ? 2 : 1.5 + Math.random(), wx: 0, wy: 0, wt: 0, pat: 0 };
  enemies.set(e.id, e);
  return e;
}
// 敵を動かす（木や岩をよける）
function moveEnemy(e, D, vx, vy, spd, dt, noDetour) {
  const n = Math.hypot(vx, vy);
  if (!n) return false;
  if (!noDetour && e.detT > 0) { e.detT -= dt; vx = e.detX; vy = e.detY; }       // walking around a tree / rock
  const nn = Math.hypot(vx, vy) || 1;
  const sp = spd * dt * Math.min(1, n), mx = vx / nn * sp, my = vy / nn * sp;
  const ox = e.x, oy = e.y;
  if (canStandE(e.x + mx, e.y, D.r)) e.x += mx;
  if (canStandE(e.x, e.y + my, D.r)) e.y += my;
  const blocked = Math.hypot(e.x - ox, e.y - oy) < sp * .3;
  if (blocked && !noDetour) {
    e.stuck = (e.stuck || 0) + dt;
    if (e.stuck > .25 && !(e.detT > 0)) { const sg = Math.random() < .5 ? 1 : -1; e.detX = -vy / nn * sg; e.detY = vx / nn * sg; e.detT = .7; e.stuck = 0; }
  } else e.stuck = 0;
  if (Math.abs(vx) > .05) e.face = vx < 0 ? -1 : 1;
  return blocked;
}
// ボスの演出（地ひびき・ワープなど）を全員に
function sendBossFx(k, x, y) { const m = { t: 'bfx', k, x: Math.round(x), y: Math.round(y) }; broadcast(m); if (SC === curScene) onBossFx(m); }
// ボスの演出の表示
function onBossFx(d) {
  bossFx.push({ k: d.k, x: d.x, y: d.y, t: performance.now() });
  if (d.k === 'rage') toast('魔王が怒った！ 攻撃が激しくなる！');
  if (d.k === 'wake') toast('中ボスが目を覚ました！ 倒すと武器を落とす');
}

// ---- 中ボス ------------------------------------------------------
// 中ボスが目を覚ます
function wakeMids(src) {
  let woke = false;
  for (const o of enemies.values()) if (o.sc === SC && ENEMY_TYPES[o.type].mid && !o.aggro) { o.aggro = true; woke = true; }
  if (woke) sendBossFx('wake', src.x, src.y);
}
function spawnMids(ch, n, start) {     // one mid-boss per visitor, around the stone ring
  if (!LAIR || !MID_FOR_CH[ch]) return;
  const type = MID_FOR_CH[ch], T = ENEMY_TYPES[type];
  for (let k = 0; k < n; k++) {
    const i = (start || 0) + k, a = i * 1.7, s = standableNear(LAIR.x + Math.cos(a) * 24, LAIR.y + Math.sin(a) * 16, 8) || LAIR;
    const e = { id: ++enemySeq, sc: SC, type, boss: false, aggro: false, lv: ch, x: s.x, y: s.y, hp: T.hp, maxHp: T.hp, face: i % 2 ? -1 : 1, cd: 1.5 + i * .4, wx: 0, wy: 0, wt: 0, pat: 0 };
    enemies.set(e.id, e);
  }
}
// 中ボスの動き（ねぐらから離れすぎない）
function midStep(e, T, dt, now, tgt, best, ux, uy, ps) {
  if (!e.aggro) { if (tgt && best < 120) wakeMids(e); return { stop: true }; }
  e.stT = (e.stT || 0) - dt;
  if (LAIR && Math.hypot(e.x - LAIR.x, e.y - LAIR.y) > 230) {      // stays near its treasure
    const d = Math.hypot(LAIR.x - e.x, LAIR.y - e.y) || 1;
    return { vx: (LAIR.x - e.x) / d, vy: (LAIR.y - e.y) / d, spd: T.spd * 1.3 };
  }
  if (!tgt) return { stop: true };
  if (e.act === 1) {
    if (e.stT <= 0) {
      e.act = 0;
      const b = Math.atan2(uy, ux);
      if (T.key === 'ogre') { sendBossFx('quake', e.x, e.y); for (const p of ps) if (Math.hypot(p.x - e.x, (p.y - e.y) * 1.4) < 42) damagePlayer(p.slot, p.x - e.x, p.y - e.y, 0, '', now); ringShots(e, 6, 60); }
      else if (T.key === 'masked_orc') { for (const da of [-.25, 0, .25]) enemyShot(e, Math.cos(b + da), Math.sin(b + da), 130, 170); }
      else if (T.key === 'big_zombie') ringShots(e, 10, 65);
      else for (const da of [-.5, -.25, 0, .25, .5]) enemyShot(e, Math.cos(b + da), Math.sin(b + da), 95, 220);
    }
    return { stop: true };
  }
  e.cd -= dt;
  if (e.cd <= 0 && best < 200) { e.act = 1; e.stT = .5; e.cd = T.key === 'masked_orc' ? 1.8 : 2.6; return { stop: true }; }
  if (T.shooter) { if (best < 80) return { vx: -ux, vy: -uy, spd: T.spd }; if (best > 130) return { vx: ux, vy: uy, spd: T.spd }; return { vx: -uy * .6, vy: ux * .6, spd: T.spd }; }
  return { vx: ux, vy: uy, spd: T.spd };
}
// ボスが手下を呼ぶ
function spawnMinion(type, near, lv) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, x = near.x + Math.cos(a) * 30, y = near.y + Math.sin(a) * 20;
    if (canStandE(x, y, 4)) { const T = ENEMY_TYPES[type], e = { id: ++enemySeq, sc: SC, type, boss: false, lv, x, y, hp: T.hp, maxHp: T.hp, face: 1, cd: 1.5, wx: 0, wy: 0, wt: 0, pat: 0 }; enemies.set(e.id, e); return; }
  }
}
// 円形に弾を撃つ
function ringShots(e, n, spd, off) { for (let a = 0; a < n; a++) { const r = (a + (off || 0)) / n * Math.PI * 2; enemyShot(e, Math.cos(r), Math.sin(r), spd, 230); } }

// ---- ボス --------------------------------------------------------
// ボスが地面に投げた物（たいまつ・隕石）：赤い丸の予告から1秒後にはじけてダメージ
function stepBombs(e, ps, now) {
  if (!e.bombs || !e.bombs.length) return;
  for (const b of e.bombs) if (now >= b.t) {
    sendBossFx('boom', b.x, b.y);
    for (const p of ps) if (Math.hypot(p.x - b.x, (p.y - b.y) * 1.4) < 26) damagePlayer(p.slot, p.x - b.x, p.y - b.y, 0, '', now);
  }
  e.bombs = e.bombs.filter(b => now < b.t);
}
// each boss has its own moves. act: 0 walk, 1 wind-up (warning), 2 attack, 3 recover. Returns how to move this frame.
function bossStep(e, T, dt, now, tgt, best, ux, uy, ps) {
  e.stT = (e.stT || 0) - dt;
  const rage = e.hp <= e.maxHp / 2;
  if (T.key === 'swampy') {                      // キングスライム: leap + quake, splits when hurt
    for (let k = (e.splits || 0); k < 2; k++) if (e.hp <= e.maxHp * (2 - k) / 3) { e.splits = k + 1; for (let i = 0; i < 3; i++) spawnMinion(0, e, e.lv); }
    if (e.act === 2) {
      e.jp = Math.min(1, e.jp + dt / 0.9);
      e.x = e.jx0 + (e.jx1 - e.jx0) * e.jp; e.y = e.jy0 + (e.jy1 - e.jy0) * e.jp;
      if (e.jp >= 1) {
        e.act = 3; e.stT = 0.7;
        sendBossFx('quake', e.x, e.y);
        for (const p of ps) if (Math.hypot(p.x - e.x, (p.y - e.y) * 1.4) < 44) damagePlayer(p.slot, p.x - e.x, p.y - e.y, 0, '', now);
        ringShots(e, 8, 60);
      }
      return { stop: true, noContact: true };
    }
    if (e.act === 1) { if (e.stT <= 0) { e.act = 2; e.jp = 0; } return { stop: true }; }
    if (e.act === 3) { if (e.stT <= 0) e.act = 0; return { stop: true }; }
    e.cd -= dt;
    if (tgt && e.cd <= 0 && best < 230) {
      const land = standableNear(tgt.x, tgt.y, 10);
      if (land) { e.act = 1; e.stT = 0.55; e.jx0 = e.x; e.jy0 = e.y; e.jx1 = land.x; e.jy1 = land.y; e.cd = 2.4; }
    }
    return { vx: ux, vy: uy, spd: 16 };
  }
  if (T.key === 'goblin') {                      // ゴブリンキング: warned dash, dizzy afterwards, then daggers
    if (e.act === 1) { if (e.stT <= 0) { e.act = 2; e.stT = 0.75; } return { stop: true }; }
    if (e.act === 2) { if (e.stT <= 0) { e.act = 3; e.stT = 1.1; } return { vx: e.dux, vy: e.duy, spd: 210, noDetour: true, dash: true }; }
    if (e.act === 3) {
      if (e.stT <= 0) {
        e.act = 0;
        if (tgt) { const b = Math.atan2(uy, ux); for (const da of rage ? [-.4, -.2, 0, .2, .4] : [-.25, 0, .25]) enemyShot(e, Math.cos(b + da), Math.sin(b + da), 150, 170); }
      }
      return { stop: true };
    }
    e.cd -= dt;
    if (tgt && e.cd <= 0 && best < 200) { e.act = 1; e.stT = 0.6; e.dux = ux; e.duy = uy; e.ang = Math.atan2(uy, ux); e.cd = rage ? 1.4 : 2.2; }
    return { vx: ux, vy: uy, spd: 36 };
  }
  if (T.key === 'skelet') {                      // ガイコツ大将: spiral barrage, calls skeletons
    e.sumT = (e.sumT === undefined ? 5 : e.sumT) - dt;
    if (e.sumT <= 0) {
      e.sumT = 11;
      if ([...enemies.values()].filter(o => o.sc === SC && !o.boss).length < 4) { sendBossFx('summon', e.x, e.y); spawnMinion(2, e, e.lv); spawnMinion(2, e, e.lv); }
    }
    if (e.act === 2) {
      e.fireT = (e.fireT || 0) - dt;
      while (e.fireT <= 0) {
        e.fireT += 0.12; e.spin = (e.spin || 0) + 0.4;
        const arms = rage ? 3 : 2;
        for (let k = 0; k < arms; k++) { const a = e.spin + k * Math.PI * 2 / arms; enemyShot(e, Math.cos(a), Math.sin(a), 75, 230); }
      }
      if (e.stT <= 0) { e.act = 0; e.cd = 2.6; }
      return { stop: true };
    }
    if (e.act === 1) { if (e.stT <= 0) { e.act = 2; e.stT = 2.4; e.fireT = 0; } return { stop: true }; }
    e.cd -= dt;
    if (tgt && e.cd <= 0 && best < 240) { e.act = 1; e.stT = 0.5; }
    return { vx: ux, vy: uy, spd: 16 };
  }
  if (T.key === 'big_demon') {                   // 北の魔王: 6 moves in turn, faster bullets; enraged under half life
    if (rage && !e.rage) { e.rage = true; e.cd = Math.min(e.cd, .6); sendBossFx('rage', e.x, e.y); }
    stepBombs(e, ps, now);
    if (e.burst > 0) {                           // aimed volley: quick shots straight at someone
      e.burstT = (e.burstT || 0) - dt;
      if (e.burstT <= 0 && tgt) { e.burst--; e.burstT = .14; const b = Math.atan2(uy, ux); enemyShot(e, Math.cos(b), Math.sin(b), rage ? 210 : 180, 280); }
    }
    if (e.act === 1) {                           // fading out before a teleport, then a ring where it lands
      if (e.stT <= 0) {
        const p = pickOne(ps);
        if (p) for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2, spot = standableNear(p.x + Math.cos(a) * 80, p.y + Math.sin(a) * 56, 10);
          if (spot) { sendBossFx('tele', e.x, e.y); e.x = spot.x; e.y = spot.y; sendBossFx('tele', e.x, e.y); break; }
        }
        e.act = 0; ringShots(e, rage ? 14 : 10, 95);
        if (rage) e.burst = 3;
      }
      return { stop: true, noContact: true };
    }
    if (e.act === 2) {                           // spiral: arms of bullets turning around it
      e.spT = (e.spT || 0) - dt;
      if (e.spT <= 0) {
        e.spT = .09; e.spA = (e.spA || 0) + .32;
        const arms = rage ? 4 : 3;
        for (let k = 0; k < arms; k++) { const r = e.spA + k / arms * Math.PI * 2; enemyShot(e, Math.cos(r), Math.sin(r), rage ? 110 : 95, 240); }
      }
      if (e.stT <= 0) e.act = 0;
      return { stop: true };
    }
    e.cd -= dt;
    if (tgt && e.cd <= 0) {
      e.cd = rage ? 1.3 : 2.0; e.pat = ((e.pat || 0) + 1) % 6;
      const b = Math.atan2(uy, ux);
      if (e.pat === 0) { ringShots(e, 18, 95); if (rage) ringShots(e, 18, 75, .5); }                    // double ring
      else if (e.pat === 1) { const fan = rage ? [-.5, -.3, -.15, 0, .15, .3, .5] : [-.4, -.2, 0, .2, .4]; for (const da of fan) enemyShot(e, Math.cos(b + da), Math.sin(b + da), rage ? 170 : 145, 260); }   // fan at you
      else if (e.pat === 2) { e.act = 2; e.stT = rage ? 2.0 : 1.6; e.spT = 0; }                          // spiral
      else if (e.pat === 3) {                                                                              // meteors where you stand
        e.bombs = e.bombs || [];
        for (const p of ps) for (let i = 0; i < (rage ? 3 : 2); i++) {
          const x = p.x + (i ? (Math.random() - .5) * 90 : 0), y = p.y + (i ? (Math.random() - .5) * 60 : 0);
          e.bombs.push({ x, y, t: now + 1000 }); sendBossFx('mark', x, y);
        }
      }
      else if (e.pat === 4) e.burst = rage ? 7 : 5;                                                        // aimed volley
      else { e.act = 1; e.stT = 0.7; }                                                                     // teleport
      if (rage && e.pat !== 4 && e.pat !== 5) {                                                            // angry: calls help now and then
        e.sumT = (e.sumT || 0) - 1;
        if (e.sumT <= 0 && [...enemies.values()].filter(o => o.sc === SC && !o.boss).length < 4) { e.sumT = 4; sendBossFx('summon', e.x, e.y); spawnMinion(3, e, e.lv); spawnMinion(2, e, e.lv); }
      }
    }
    return { vx: ux, vy: uy, spd: rage ? 30 : 20 };
  }
  if (T.key === 'orc_warrior') {                 // オーク隊長: torches that burst where you stand, calls soldiers
    e.sumT = (e.sumT === undefined ? 4 : e.sumT) - dt;
    if (e.sumT <= 0) {
      e.sumT = 10;
      if ([...enemies.values()].filter(o => o.sc === SC && !o.boss).length < 5) { sendBossFx('summon', e.x, e.y); spawnMinion(9, e, e.lv); spawnMinion(9, e, e.lv); }
    }
    stepBombs(e, ps, now);
    if (e.act === 1) {
      if (e.stT <= 0) {
        e.act = 0; e.bombs = e.bombs || [];
        for (const p of ps) for (let i = 0; i < (rage ? 2 : 1); i++) {
          const x = p.x + (i ? (Math.random() - .5) * 70 : 0), y = p.y + (i ? (Math.random() - .5) * 46 : 0);
          e.bombs.push({ x, y, t: now + 1000 }); sendBossFx('mark', x, y);
        }
      }
      return { stop: true };
    }
    e.cd -= dt;
    if (tgt && e.cd <= 0 && best < 260) { e.act = 1; e.stT = 0.5; e.cd = rage ? 2 : 3; }
    return { vx: ux, vy: uy, spd: rage ? 30 : 22 };
  }
  // fallback: chase and alternate ring / 3-way
  e.cd -= dt;
  if (tgt && e.cd <= 0) { e.cd = 3.2; e.pat = ((e.pat || 0) + 1) % 2; if (e.pat) ringShots(e, 10, 70); else { const b = Math.atan2(uy, ux); for (const da of [-.3, 0, .3]) enemyShot(e, Math.cos(b + da), Math.sin(b + da), 95, 240); } }
  return { vx: ux, vy: uy, spd: T.spd * .85 };
}
// 親：今の場所の敵を全部動かす
function stepEnemies(dt, now) {
  const ps = alivePlayers(), list = [...enemies.values()].filter(e => e.sc === SC);
  for (const e of list) {
    if (!enemies.has(e.id)) continue;
    const T = ENEMY_TYPES[e.type], D = eDims(e);
    let tgt = null, best = 1e9;
    for (const p of ps) { const d = Math.hypot(p.x - e.x, p.y - e.y); if (d < best) { best = d; tgt = p; } }
    const ux = tgt ? (tgt.x - e.x) / (best || 1) : 0, uy = tgt ? (tgt.y - e.y) / (best || 1) : 0;
    let mv;
    if (e.boss) mv = bossStep(e, T, dt, now, tgt, best, ux, uy, ps);
    else if (T.mid) mv = midStep(e, T, dt, now, tgt, best, ux, uy, ps);
    else if (tgt) {
      if (T.shooter) {             // keep some distance and shoot
        let vx, vy;
        if (best < 70) { vx = -ux; vy = -uy; } else if (best > 115) { vx = ux; vy = uy; } else { vx = -uy * .6; vy = ux * .6; }
        e.cd -= dt;
        if (e.cd <= 0 && best < 180) { e.cd = 2.4; enemyShot(e, ux, uy, 85, 210); }
        mv = { vx, vy, spd: T.spd };
      } else mv = { vx: ux, vy: uy, spd: T.spd };
    } else {                       // nobody to chase: wander
      e.wt -= dt;
      if (e.wt <= 0) { const r = Math.random() * Math.PI * 2; e.wx = Math.cos(r); e.wy = Math.sin(r); e.wt = 1.5 + Math.random() * 2; }
      mv = { vx: e.wx * .5, vy: e.wy * .5, spd: T.spd };
    }
    if (!mv.stop) {
      let vx = mv.vx, vy = mv.vy;
      if (!mv.dash) for (const o of list) {        // don't pile up
        if (o === e || !enemies.has(o.id)) continue;
        const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < 12) { vx += dx / d * .8; vy += dy / d * .8; }
      }
      const blocked = moveEnemy(e, D, vx, vy, mv.spd, dt, mv.noDetour);
      if (mv.dash && blocked) e.stT = 0;           // dash stops at a tree / rock / the sea
    }
    if (!mv.noContact) {           // touching a player hurts
      for (const p of ps) {
        if (Math.abs(p.x - e.x) < D.hw + 5 && Math.abs(p.y - e.y) < (e.boss ? 16 : 8)) damagePlayer(p.slot, p.x - e.x, p.y - e.y, 0, '', now);
      }
    }
  }
}

// ---- 協力モードのWAVE ----------------------------------------
// 協力モード：そのWAVEで出す敵のリスト
function waveQueue(w, nPlayers) {
  const mult = 1 + 0.5 * (nPlayers - 1), tier = 1 + Math.floor((w - 1) / 5) * 0.5;
  const q = [];
  const pool = [0]; if (w >= 2) pool.push(1); if (w >= 3) pool.push(2); if (w >= 4) pool.push(3);
  const count = Math.round((3 + w * 2) * mult);
  for (let i = 0; i < count; i++) q.push({ type: pickOne(pool), mult: tier });
  return q;
}
// 協力モードの最初の状態
function resetGame() {
  enemies.clear(); game.queue = []; game.banner = '';
  for (const id of [...shots.keys()]) if (shots.get(id).slot === 0) shots.delete(id);
  if (mode === 'story') { game.phase = 'story'; return; }
  if (mode === 'coop') { game.wave = 1; game.phase = 'rest'; game.until = performance.now() + 4000; game.startAt = performance.now(); }
  else { game.wave = 0; game.phase = 'wait'; }
}
function reviveAll(now) {            // players downed in this place (SC) come back
  for (const [slot, st] of stats) if (st.down && (st.sc || 'island') === SC) st.downUntil = now;
}
function stepWaves(now) {        // host, co-op only
  const nPlayers = stats.size;
  if (game.phase === 'rest' && now >= game.until) {
    game.phase = 'fight'; game.queue = waveQueue(game.wave, nPlayers); game.nextSpawn = now;
  } else if (game.phase === 'fight' || game.phase === 'boss') {
    if (game.phase === 'fight' && game.queue.length && now >= game.nextSpawn && enemies.size < MAX_ALIVE) {
      const q = game.queue.shift(); spawnEnemy(q.type, q.mult); game.nextSpawn = now + 600;
    }
    const anyAlive = [...stats.values()].some(st => !st.down);
    if (!anyAlive && nPlayers) {
      game.phase = 'over'; game.until = now + 6000; game.queue = []; enemies.clear(); pickups.clear();
      for (const st of stats.values()) { st.weapon = 'knife'; st.ammo = 0; }
      for (const id of [...shots.keys()]) if (shots.get(id).slot === 0) shots.delete(id);
    } else if (game.phase === 'fight' && !game.queue.length && !enemies.size) {
      // all normal enemies gone: the boss comes out alone
      const mult = 1 + 0.5 * (nPlayers - 1), tier = 1 + Math.floor((game.wave - 1) / 5) * 0.5, bt = bossTypeFor(game.wave);
      spawnEnemy(bt, mult * tier, true, game.wave);
      game.phase = 'boss'; game.bossName = BOSS_NAMES[bt];
    } else if (game.phase === 'boss' && !enemies.size && game.wave >= LAST_WAVE) {
      // the last boss is down: game clear
      game.phase = 'win'; game.until = now + 15000;
      const secs = Math.round((now - (game.startAt || now)) / 1000);
      const rows = [...stats.entries()].sort((a, b) => a[0] - b[0]).map(([sl, st]) => 'P' + sl + ' ' + st.ko + '体');
      game.result = 'クリアタイム ' + Math.floor(secs / 60) + '分' + String(secs % 60).padStart(2, '0') + '秒 ／ 撃破数 ' + rows.join('・');
      for (const id of [...shots.keys()]) if (shots.get(id).slot === 0) shots.delete(id);
      reviveAll(now);
    } else if (game.phase === 'boss' && !enemies.size) {
      game.phase = 'clear'; game.until = now + 5000;
      for (const st of stats.values()) if (!st.down) st.life = Math.min(LIFE_MAX, st.life + 1);   // small heal between waves
      reviveAll(now);
      spawnWaveRewards();
    }
  } else if (game.phase === 'clear' && now >= game.until) {
    game.wave++; game.phase = 'rest'; game.until = now + 2000;
  } else if ((game.phase === 'over' || game.phase === 'win') && now >= game.until) {
    // start a new run from WAVE 1
    reviveAll(now); game.wave = 1; game.phase = 'rest'; game.until = now + 3000; game.startAt = now; pickups.clear();
    for (const st of stats.values()) { st.ko = 0; st.weapon = 'knife'; st.ammo = 0; st.life = LIFE_MAX; }
  }
}
// その場所の敵の数
function enemiesIn(sc) { let n = 0; for (const e of enemies.values()) if (e.sc === sc) n++; return n; }
// その場所の、中ボス以外の敵の数
function mainLeft(sc) { let n = 0; for (const e of enemies.values()) if (e.sc === (sc || SC) && !ENEMY_TYPES[e.type].mid) n++; return n; }
// 協力モードの進み具合（親→子）
function gameOut() {
  if (mode !== 'coop') return { m: 'pvp' };
  return { m: 'coop', w: game.wave, ph: game.phase, t: Math.max(0, Math.ceil((game.until - performance.now()) / 1000)), left: game.queue.length + enemies.size, bn: game.bossName || '', res: game.phase === 'win' ? game.result : '' };
}
// 敵の一覧を送る形に（その場所の分だけ）
function enemiesOut(sc) { return [...enemies.values()].filter(e => !sc || e.sc === sc).map(e => [e.id, e.type, Math.round(e.x), Math.round(e.y), e.hp, e.face, e.maxHp, e.boss ? 1 : 0, e.act || 0, e.act === 2 && e.jp !== undefined ? Math.round(e.jp * 100) : Math.round((e.ang || 0) * 100), e.rage ? 1 : 0, Math.round(e.jx1 || 0), Math.round(e.jy1 || 0), e.aggro ? 1 : 0]); }
function applyEnemies(list) {     // guest: follow the host's enemies
  const next = new Map();
  for (const [id, type, x, y, hp, face, maxHp, boss, act, p, rage, jx1, jy1, aggro] of list) {
    const prev = enemies.get(id);
    next.set(id, { id, type, x, y, hp, face, maxHp, boss: !!boss, act: act | 0, jp: (p | 0) / 100, ang: (p | 0) / 100, rage: !!rage, jx1, jy1, aggro: !!aggro, dx: prev ? prev.dx : x, dy: prev ? prev.dy : y, flash: prev ? prev.flash : 0 });
  }
  enemies = next;
}
