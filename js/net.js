// ================================================================================================
// js/net.js — 通信：部屋の親（ホスト）と子のやりとり
// the host decides everything (hits, enemies, items) and sends a snapshot to each player ~15 times a second;
// players send their own position. In story mode each player only gets news of the place they are in
// (loaded 6/12: may use anything from the files loaded before it)
// ================================================================================================
function freeSlot() { const used = new Set([1, ...[...conns.values()].map(v => v.slot)]); for (let s = 1; s <= MAX; s++) if (!used.has(s)) return s; return 0; }
// 親：子が入ってきたとき（P番号を決める・記録を受け取る・子からのメッセージを受け取る）
function onHostConnection(conn) {
  conn.on('open', () => {
    if (!conn.metadata || conn.metadata.v !== VERSION) {
      conn.send({ t: 'version', v: VERSION }); setTimeout(() => conn.close(), 500);
      toast('違う版のページから入ろうとした人がいます。全員ページを再読み込みしてください。'); return;
    }
    const slot = freeSlot();
    if (!slot) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
    const startSc = mode === 'story' ? 'castle' : 'island';
    const sp = withMap(startSc, () => spawnPoint(slot));
    const st = { slot, sc: startSc, c: Math.min(CHARS.length - 1, Math.max(0, (conn.metadata && conn.metadata.c) | 0)), x: sp.x, y: sp.y, dir: 'down', m: false };
    conns.set(conn.peer, { conn, slot, last: performance.now() });
    const stt = freshStat(), sv = conn.metadata.sv || {};
    stt.cleared = Math.max(0, Math.min(LAST_CH, sv.c | 0));
    stt.owned = new Set(['knife', ...(Array.isArray(sv.w) ? sv.w.filter(w => STORY_WEAPONS.includes(w)) : [])]);
    stt.lm = mode === 'story' ? LIFE_MAX + Math.max(0, Math.min(3, sv.h | 0)) : LIFE_MAX; stt.life = stt.lm;   // extra hearts from the forest
    stt.chests = new Set(Array.isArray(sv.k) ? sv.k.filter(k => typeof k === 'string').slice(0, 200) : []);
    stt.sc = startSc;
    stats.set(slot, stt);
    others.set(conn.peer, { ...st, dx: st.x, dy: st.y, t: 0 });
    conn.send({ t: 'welcome', slot, x: st.x, y: st.y, mode, sc: startSc });
    for (const key of roomChests) { conn.send({ t: 'chestgone', key }); stt.chests.add(key); }   // chests already opened in this room
    toast('P' + slot + '（' + (NAMES[st.c] || '？') + '）が入りました');
    renderList();
  });
  conn.on('data', d => {
    const rec = conns.get(conn.peer); if (!rec) return;
    if (d.t === 'atk') {                        // a guest attacked: the host decides with its own weapon record
      const sst = stats.get(rec.slot);
      withMap((sst && sst.sc) || 'island', () => performAttack({ id: String(d.id), slot: rec.slot, w: String(d.w), x: +d.x, y: +d.y, ax: +d.ax || 0, ay: +d.ay || 0 }, conn.peer));
      return;
    }
    if (d.t === 'gift') {                       // story: the mayor of ひだまり町 hands over the heal staff
      const st = stats.get(rec.slot);
      if (mode === 'story' && st && d.w === 'heal' && st.sc === 't1' && (st.cleared || 0) >= 3) st.owned.add('heal');
      return;
    }
    if (d.t === 'castx') { const sst = stats.get(rec.slot); withMap((sst && sst.sc) || 'island', () => cancelCast(rec.slot, 'release')); return; }
    if (d.t === 'equip') {                      // story: switch to a weapon you own
      const st = stats.get(rec.slot);
      if (st && st.owned.has(String(d.w))) { st.weapon = String(d.w); syncFromStats(); }
      return;
    }
    if (d.t !== 's') return;
    rec.last = performance.now();
    const o = others.get(conn.peer);
    const nsc = mode === 'story' ? (SCENES[d.sc] ? d.sc : 'castle') : 'island';
    if (o) Object.assign(o, { c: d.c | 0, x: +d.x, y: +d.y, dir: ROWS[d.dir] !== undefined ? d.dir : 'down', m: !!d.m, sc: nsc });
    const st = stats.get(rec.slot);
    if (st && !(st.scLock > performance.now() && nsc !== st.sc)) { st.sc = nsc; if (o) o.sc = nsc; } else if (st && o) o.sc = st.sc;   // just warped: ignore old news
  });
  const drop = () => { const rec = conns.get(conn.peer); if (conns.delete(conn.peer)) { others.delete(conn.peer); if (rec) { stats.delete(rec.slot); toast('P' + rec.slot + 'が部屋から出ました'); } renderList(); } };
  conn.on('close', drop);
  conn.on('error', drop);
}
// client side: replace the roster with the host's snapshot
function applyAll(ps) {
  const next = new Map();
  for (const p of ps) {
    if (p.slot === me.slot) {
      if (p.life !== undefined) { me.life = p.life; me.lm = p.lm || LIFE_MAX; me.down = !!p.down; me.inv = !!p.inv; me.ko = p.ko | 0; if (WEAPONS[p.w]) { me.w = p.w; me.ammo = p.am | 0; } me.fastUntil = performance.now() + (p.fs | 0); }
      continue;
    }
    const key = 's' + p.slot, prev = others.get(key);
    next.set(key, { ...p, dx: prev ? prev.dx : p.x, dy: prev ? prev.dy : p.y, t: prev ? prev.t : 0, atkT: prev ? prev.atkT : -1e9 });
  }
  const changed = next.size !== others.size || [...next.keys()].some(k => !others.has(k));
  others = next;
  if (changed) renderList(); else refreshListIfChanged();
}
// 自分の位置など（子→親に送る）
function myState() { return { slot: me.slot, c: me.c, x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, dir: me.dir, m: me.m, sc: curScene, ...(isHost ? statOut(me.slot) : {}) }; }
// 親：1人分のライフ・武器などを送る形に
function statOut(slot) { const st = stats.get(slot), now = performance.now(); return st ? { life: st.life, lm: st.lm || LIFE_MAX, down: st.down, inv: now < st.invUntil, ko: st.ko, w: st.weapon, am: st.ammo, fs: Math.max(0, Math.round(st.fastUntil - now)) } : {}; }
// story: news only goes to players in the same place as the action (SC)
function broadcast(msg, exceptPeer) {
  const local = mode === 'story' && msg.t !== 'all';
  if (local) msg = { ...msg, sc: SC };
  for (const [id, { conn }] of conns) {
    if (id === exceptPeer || !conn.open) continue;
    if (local) { const o = others.get(id); if (!o || o.sc !== SC) continue; }
    conn.send(msg);
  }
}
function sendTo(slot, msg) {          // host → one player; false when that player is the host itself
  if (slot === me.slot) return false;
  for (const rec of conns.values()) if (rec.slot === slot && rec.conn.open) rec.conn.send(msg);
  return true;
}
// P番号 → ほかのプレイヤー
function otherBySlot(slot) { for (const o of others.values()) if (o.slot === slot) return o; return null; }
function syncFromStats() {    // host: copy authoritative battle state onto the drawn players
  const mine = statOut(me.slot); Object.assign(me, mine); if (mine.w) { me.w = mine.w; me.ammo = mine.am; me.fastUntil = performance.now() + mine.fs; }
  for (const o of others.values()) Object.assign(o, statOut(o.slot));
  refreshListIfChanged();
}
// 参加者一覧に変化があれば描き直す
function refreshListIfChanged() {
  const sig = [me, ...others.values()].map(p => p.slot + ':' + p.life + ':' + p.down + ':' + p.ko + ':' + (p === me ? me.w : p.w) + ':' + (p === me ? curScene : p.sc)).join('|');
  if (sig !== listSig) { listSig = sig; renderList(); }
}
function sendNote(slot, text) {     // host: a message for one player only
  if (slot === me.slot) { toast(text); return; }
  for (const rec of conns.values()) if (rec.slot === slot && rec.conn.open) rec.conn.send({ t: 'note', text });
}
// 1秒に約15回：親は全員の状態を計算して送る／子は自分の位置を送る
function netTick() {
  if (screen !== 'play' || !peer) return;
  const now = performance.now();
  if (isHost) {
    for (const [id, rec] of conns) if (now - rec.last > TIMEOUT_MS) { rec.conn.close(); conns.delete(id); others.delete(id); stats.delete(rec.slot); toast('P' + rec.slot + 'との通信が途切れました'); renderList(); }
    const hs = stats.get(me.slot); if (hs) hs.sc = curScene;
    for (const [slot, st] of stats) {            // revive downed players (near a living friend in the same place)
      if (!(st.down && now >= st.downUntil)) continue;
      withMap(st.sc || 'island', () => {
        st.down = false; st.life = lifeMaxOf(st); st.invUntil = now + 1500;
        let p = randomLandSpot();
        if (mode !== 'pvp') {
          const mates = alivePlayers().filter(q => q.slot !== slot);
          const m = pickOne(mates);
          if (m) for (let i = 0; i < 20; i++) { const x = m.x + (Math.random() - .5) * 60, y = m.y + (Math.random() - .5) * 40; if (canStand(x, y)) { p = { x, y }; break; } }
        }
        const msg = { t: 'respawn', slot, x: p.x, y: p.y, lm: lifeMaxOf(st) };
        broadcast(msg); onRespawn(msg);
      });
    }
    if (mode === 'coop') withMap('island', () => stepWaves(now));
    else if (mode === 'story') stepAreas(now);
    syncFromStats();
    const places = new Set([...stats.values()].map(st => st.sc || 'island'));
    for (const sc of places) withMap(sc, () => stepPickups(now));
    const ps = [myState(), ...[...others.values()].map(o => ({ slot: o.slot, c: o.c, x: o.x, y: o.y, dir: o.dir, m: o.m, sc: o.sc, ...statOut(o.slot) }))];
    for (const [pid, rec] of conns) {          // everyone gets the news of their own place
      if (!rec.conn.open) continue;
      const o = others.get(pid), sc = (o && o.sc) || 'island';
      rec.conn.send({ t: 'all', ps, g: gameOutFor(sc), en: mode !== 'pvp' ? enemiesOut(sc) : undefined,
        pk: [...pickups.values()].filter(p => p.sc === sc).map(p => [p.id, p.w, Math.round(p.x), Math.round(p.y)]) });
    }
    updateGameUI(gameOutFor(curScene));
  } else if (hostConn) {
    if (now - lastHostMsg > TIMEOUT_MS) { endRoom('親との通信が途切れたため、部屋から出ました。'); return; }
    if (hostConn.open) hostConn.send({ t: 's', ...myState() });
  }
}
(() => {
  let worker = null;
  try {
    const src = 'setInterval(() => postMessage(0), ' + SEND_MS + ');';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = netTick;
  } catch (e) { worker = null; }
  if (!worker) setInterval(netTick, SEND_MS);
})();
