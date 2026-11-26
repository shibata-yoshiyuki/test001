// ================================================================================================
// js/story.js — ストーリーの進み方：場所ごとの戦い・会話・移動・案内の矢印
// what happens in each place (waves / maze / boss room / mid-boss room / 草原), clears and wipe-outs,
// the top chip and banners, dialogs, talking to people, walking between places, the guide arrow
// (loaded 9/12: may use anything from the files loaded before it)
// ================================================================================================

// ---- 場所ごとの進行（親だけが動かす） ----------------------------
// each chapter place runs on its own: starts when someone walks in, resets when everyone has left
const AREAS = {};
// 場所ごとの進み具合（phase: idle→intro→fight/rest→boss→done など）
function areaOf(sc) { return AREAS[sc] || (AREAS[sc] = { phase: 'idle', inst: 0, visitors: new Set(), waveIdx: 0, queue: [], until: 0, nextSpawn: 0, bossName: '', emptySince: 0 }); }
// その場所の敵と敵の弾を消す
function clearPlace(sc, keepMids) {
  for (const e of [...enemies.values()]) if (e.sc === sc && (!keepMids || !ENEMY_TYPES[e.type].mid)) enemies.delete(e.id);
  for (const [id, sh] of [...shots]) if (sh.sc === sc && sh.slot === 0) shots.delete(id);
}
// 1つの場所を1回分進める。種類（AREA_KIND）ごとに：草原=弱い敵が少し / 迷路=敵がわき続ける / 武器の番人の部屋 / ボス部屋 / それ以外=WAVE→ボス
function stepAreas(now) {             // host, story
  for (const sc of AREA_PLACES) {
    const A = areaOf(sc);
    const inside = [...stats.entries()].filter(([, st]) => st.sc === sc);
    if (!inside.length) {
      if (A.phase !== 'idle') {
        if (!A.emptySince) A.emptySince = now;
        else if (now - A.emptySince > 5000) {
          clearPlace(sc); for (const pk of [...pickups.values()]) if (pk.sc === sc) pickups.delete(pk.id);
          A.phase = 'idle'; A.visitors = new Set(); A.queue = [];
        }
      }
      continue;
    }
    A.emptySince = 0;
    withMap(sc, () => stepArea(sc, A, FIELD_CH[sc] || 0, inside, now));
  }
}
// 次のWAVEを始める
function startWaveA(A, ch, n, now) {
  const types = CH_WAVES[ch][A.waveIdx]; A.waveIdx++;
  const count = Math.round((3 + ch + A.waveIdx * 2) * (1 + 0.5 * (n - 1)));
  A.queue = []; for (let i = 0; i < count; i++) A.queue.push({ type: pickOne(types), mult: 1 });
  A.phase = 'fight'; A.nextSpawn = now;
}
function creditClear(sc, A, ch, inside, now) {   // plan A: everybody here gets the clear
  A.phase = 'done'; A.peaceful = false; reviveAll(now);
  for (const [sl, st] of inside) {
    if (!st.down) st.life = Math.min(lifeMaxOf(st), st.life + 1);
    st.cleared = Math.max(st.cleared || 0, ch);
    const m = { t: 'sclear', ch }; if (!sendTo(sl, m)) onStoryClear(m);
  }
}
function wipeOut(sc, A, inside, now) {   // wiped out: wake up in the village before this place
  const back = FIELD_BACK[sc] || 'castle';
  for (const [sl, st] of inside) {
    st.down = false; st.downUntil = 0; st.life = lifeMaxOf(st); st.invUntil = now + 1500; st.sc = back; st.scLock = now + 2000;
    const o = otherBySlot(sl); if (o) o.sc = back;
    const m = { t: 'warp', sc: back, from: sc, msg: '全滅……気がつくと' + PLACE_NAME[back] + 'にいた' };
    if (!sendTo(sl, m)) setTimeout(() => onWarp(m), 0);
  }
  clearPlace(sc); A.phase = 'idle'; A.visitors = new Set(); A.queue = [];
}
function stepArea(sc, A, ch, inside, now) {
  const kind = AREA_KIND[sc] || 'waves';
  const fresh = ([, st]) => (st.cleared || 0) < ch;
  const alive = inside.filter(([, st]) => !st.down);
  if (A.phase === 'over') { if (now >= A.until) wipeOut(sc, A, inside, now); return; }
  if (!['idle', 'done'].includes(A.phase) && !alive.length) { A.phase = 'over'; A.until = now + 4000; A.queue = []; clearPlace(sc, true); return; }
  if (kind !== 'waves')                           // no waves to wait for: a downed player gets up after a while
    for (const [, st] of inside) if (st.down && st.downUntil > now + 60000) st.downUntil = now + 8000;
  if (kind === 'hub' || kind === 'maze') {        // 草原: a few weak monsters / 迷いの森: they keep coming
    if (A.phase === 'idle') {
      A.phase = kind; A.inst++; A.nextSpawn = now + (kind === 'maze' ? 1500 : 2500);
      CHEST_SPOTS.forEach((c, k) => {       // only chests that someone here has not opened yet
        const key = sc + ':' + k;
        if (inside.some(([, st]) => !st.chests.has(key))) spawnPickup('tchest', c.x, c.y, c.heart ? { key, heart: 1 } : { key });
      });
    }
    const lv = Math.max(0, ...inside.map(([, st]) => st.cleared || 0));
    const types = kind === 'maze' ? [0, 1, 1] : lv >= 2 ? [0, 1, 1] : lv >= 1 ? [0, 0, 1] : [0];
    if (now >= A.nextSpawn) {
      A.nextSpawn = now + (kind === 'maze' ? 2200 : 3500);
      if (mainLeft(sc) < (kind === 'maze' ? 3 : 2) + inside.length) spawnEnemy(pickOne(types), 1);
    }
    return;
  }
  if (kind === 'mid') {                           // the side room: one sleeping mid-boss per visitor, each drops a weapon chest
    if (A.phase === 'idle') { A.phase = 'mid'; A.inst++; A.visitors = new Set(); }
    for (const [sl] of inside) if (!A.visitors.has(sl)) { A.visitors.add(sl); spawnMids(MID_CH[sc], 1, A.visitors.size - 1); }
    return;
  }
  if (A.phase === 'idle') {
    A.inst++; A.waveIdx = 0; A.queue = []; A.bossName = ''; A.visitors = new Set();
    A.peaceful = !inside.some(fresh);                // everyone here has beaten it already: no attack, just passing through
    if (A.peaceful) A.phase = 'done'; else { A.phase = 'intro'; A.until = now + (kind === 'bossroom' ? 4000 : 6000); }
  }
  if (A.phase === 'done' && A.peaceful && inside.some(fresh)) { A.peaceful = false; A.phase = 'intro'; A.until = now + 4000; }   // a newcomer: the enemies come back
  const spawnBoss = () => { const bt = CH_BOSS[ch]; spawnEnemy(bt, 1 + 0.5 * (inside.length - 1), true, ch, kind === 'bossroom' ? { x: WORLD_W / 2, y: WORLD_H / 2 - 5 * TILE } : null); A.phase = 'boss'; A.bossName = BOSS_NAMES[bt]; };
  if (A.phase === 'intro' && now >= A.until) { if (kind === 'bossroom') spawnBoss(); else startWaveA(A, ch, inside.length, now); }
  else if (A.phase === 'fight') {
    if (A.queue.length && now >= A.nextSpawn && enemiesIn(sc) < MAX_ALIVE) { const q = A.queue.shift(); spawnEnemy(q.type, q.mult); A.nextSpawn = now + 600; }
    if (!A.queue.length && !mainLeft(sc)) {
      reviveAll(now);
      if (A.waveIdx < CH_WAVES[ch].length) { A.phase = 'rest'; A.until = now + 3000; }
      else spawnBoss();
    }
  } else if (A.phase === 'rest' && now >= A.until) startWaveA(A, ch, inside.length, now);
  else if (A.phase === 'boss' && !mainLeft(sc)) creditClear(sc, A, ch, inside, now);
  else if (A.phase === 'done') { if (!alive.length) reviveAll(now); }
}
// 章クリアを記録する（クリアした本人のブラウザ）
function onStoryClear(d) {
  const ch = d.ch | 0;
  if (ch > save.cleared) { save.cleared = Math.min(LAST_CH, ch); }
  writeSave();
  toast('記録しました：第' + ch + '章クリア！' + (ch === KEY_CH ? ' 魔王城への入り口がわかった！' : ch < LAST_CH ? ' 新しい道の柵がひらいた' : ''));
}
// 全滅してお城に戻されたとき
function onWarp(d) {
  goTo(d.sc, d.from);
  me.down = false; me.life = lifeMaxOf(me);
  if (d.msg) setTimeout(() => toast(String(d.msg)), 400);
}
function gameOutFor(sc) {             // what one player needs to know about the place they are in
  if (mode !== 'story') return { ...gameOut(), sc: 'island' };
  const ch = FIELD_CH[sc] || 0, A = ch ? areaOf(sc) : null;
  return { m: 'story', sc, ch, ph: A ? A.phase : AREA_KIND[sc] || 'safe', w: A ? A.waveIdx : 0, nw: ch ? CH_WAVES[ch].length : 0, left: A ? A.queue.length + mainLeft(sc) : 0, bn: A ? A.bossName : '' };
}
function ensureScene(g) {           // co-op / battle: everybody is on the island
  if (isHost || !g.sc || mode === 'story') return;
  if (g.sc !== curScene) { loadScene(g.sc); const p = spawnPoint(me.slot); me.x = p.x; me.y = p.y; }
}

// ---- 上の表示とバナー --------------------------------------------
// 上の表示（章・WAVE・次の目的地）、バナー、章の始まり・終わりの会話
function storyUI(g) {
  if (g.sc !== curScene) return;                     // old news from before we walked on
  const C = CH[g.ch], place = PLACE_NAME[g.sc] || '', goal = storyGoal();
  const chip = (!g.ch ? 'ストーリー　' + place : 'ストーリー　第' + g.ch + '章 ' + place +
    (g.ph === 'fight' ? '　WAVE ' + g.w + '/' + g.nw + '　残り ' + g.left : g.ph === 'boss' ? '　ボス戦：' + g.bn : g.ph === 'done' ? '　クリア！' : '')) +
    (goal === 'castle' ? '　▶ 王様に話しかけよう' : goal && goal !== g.sc ? '　▶ 次の目的地：' + PLACE_NAME[goal] : '');
  if ($('mode-chip').textContent !== chip) $('mode-chip').textContent = chip;
  storyPh = g.ph;
  const key = g.sc + ':' + g.ph + ':' + g.w;
  if (key === lastUI) return;
  const arrived = !lastUI.startsWith(g.sc + ':');
  lastUI = key;
  if (!g.ch) {
    if (arrived) {
      banner(place, 1800);
      if (g.sc === 'castle' && !save.talked) toast('王様に近づいて「はなす」を押してみよう');
      else if (g.sc[0] === 'v') toast('村の人に話しかけると、冒険のヒントが聞けるかも');
      else if (AREA_KIND[g.sc] === 'maze') toast('迷路だ！ 敵がどんどんわいてくる。奥の出口を目指そう');
      else if (AREA_KIND[g.sc] === 'mid') toast('武器の番人が眠っている。近づくと目を覚ますぞ（倒さなくても先へ進めます）');
    }
    return;
  }
  if (arrived) {
    banner('第' + g.ch + '章<small>' + C.title + (g.ph === 'done' ? '（クリア済み）' : '') + '</small>', 3000);
    if (g.ph === 'idle' || g.ph === 'intro') say(C.intro);
    if (g.ph === 'done') return;
  }
  if (g.ph === 'intro') banner('第' + g.ch + '章<small>敵がやってくる！</small>', 2500);
  else if (g.ph === 'fight') banner('WAVE ' + g.w + ' / ' + g.nw, 1500);
  else if (g.ph === 'rest') banner('WAVE ' + g.w + ' クリア！<small>次の敵が来る……</small>', 2500);
  else if (g.ph === 'boss' && C) { bossBanner(g.bn); say([{ n: g.bn, t: C.bossLine }]); }
  else if (g.ph === 'done' && C) { banner('第' + g.ch + '章 クリア！', 4000); say(C.outro); }
  else if (g.ph === 'over') banner('全滅……', 3500);
}
// 上の表示の更新（モードごと）
function updateGameUI(g) {
  ensureScene(g);
  if (g.m === 'story') { mode = 'story'; storyUI(g); return; }
  mode = g.m === 'coop' ? 'coop' : 'pvp';
  if (mode !== 'coop') { $('mode-chip').textContent = '対戦'; return; }
  const chip = (g.ph === 'win' ? '協力　ゲームクリア！' : '協力　WAVE ' + g.w + ' / ' + LAST_WAVE) + (g.ph === 'fight' ? '　残り ' + g.left + '　→ ボス' : g.ph === 'boss' ? '　ボス戦：' + g.bn : g.ph === 'rest' ? '　まもなく開始' : '');
  if ($('mode-chip').textContent !== chip) $('mode-chip').textContent = chip;
  const key = g.ph + ':' + g.w;
  if (key === lastUI) { if (g.ph === 'rest') banner('WAVE ' + g.w + '<small>' + (g.t || 1) + '秒後に開始</small>'); return; }
  lastUI = key;
  if (g.ph === 'rest') banner('WAVE ' + g.w + '<small>' + (g.t || 1) + '秒後に開始</small>');
  else if (g.ph === 'fight') banner('WAVE ' + g.w + '<small>スタート！</small>', 1500);
  else if (g.ph === 'boss') bossBanner(g.bn);
  else if (g.ph === 'clear') banner('WAVE ' + g.w + ' クリア！<small>倒れた仲間が復活／ライフ＋1／武器が落ちた！</small>', 4000);
  else if (g.ph === 'over') banner('全滅…<small>WAVE ' + g.w + ' まで到達。もう一度 WAVE 1 から</small>', 5500);
  else if (g.ph === 'win') banner('ゲームクリア！<small>' + (g.bn || '魔王') + 'をやっつけた！<br>' + (g.res || '') + '<br>15秒後に WAVE 1 からもう一度</small>', 14000);
}

// ---- 会話 --------------------------------------------------------
let dlgQueue = [], dlgOpen = false, dlgDone = null, dlgTyping = 0, dlgFull = '', interact = null, dlgAuto = 0;
function dlgWait() { clearTimeout(dlgAuto); dlgAuto = setTimeout(() => { if (dlgOpen) nextLine(); }, 1600 + dlgFull.length * 90); }   // read time, then the next line
// 会話を出す（lines: [{n:名前, t:文}]、onDone: 終わったら）。文は自動で進む
function say(lines, onDone) {
  if (!lines || !lines.length) return;
  dlgQueue = lines.slice(); dlgDone = onDone || null; dlgOpen = true; $('dialog').hidden = false; nextLine(true);
}
// 会話の次の文へ（文字が出ている途中なら全部出す）
function nextLine(first) {
  clearTimeout(dlgAuto);
  if (!first && dlgTyping) { clearInterval(dlgTyping); dlgTyping = 0; $('dlg-text').textContent = dlgFull; dlgWait(); return; }
  const l = dlgQueue.shift();
  if (!l) { dlgOpen = false; $('dialog').hidden = true; const f = dlgDone; dlgDone = null; if (f) f(); return; }
  if (dlgTyping) clearInterval(dlgTyping);
  $('dlg-name').textContent = l.n || ''; dlgFull = l.t; $('dlg-text').textContent = '';
  let i = 0;
  dlgTyping = setInterval(() => { i += 2; $('dlg-text').textContent = dlgFull.slice(0, i); if (i >= dlgFull.length) { clearInterval(dlgTyping); dlgTyping = 0; dlgWait(); } }, 28);
}
$('dialog').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); nextLine(); });

// ---- 話しかける --------------------------------------------------
// 「はなす」「しらべる」を押したとき（王様・村人・古井戸）
function doInteract() {
  if (interact !== 'talk' || !talkTo) return;
  if (talkTo === 'well') {
    if (save.cleared >= KEY_CH) say([{ n: '', t: '古井戸に、はしごがかかっている。地下道は魔王城へ続いているようだ……' }, { n: '', t: '井戸の中へおりていく！' }], () => goTo('f4', 'v2'));
    else say([{ n: '', t: 'ふるい井戸だ。のぞいても真っ暗で、底が見えない……' }]);
    return;
  }
  if (talkTo === 'king') {
    say(kingLines(save.cleared));
    if (!save.talked) { save.talked = true; writeSave(); }
  } else say(talkTo.lines.map(t => ({ n: talkTo.n, t })));
}

// ---- 移動と案内（矢印） ------------------------------------------
let talkTo = null, exitCool = 0, lockMsgAt = 0;
// 戦う場所か（章の場所・草原・迷路・武器の番人の部屋）
function fightPlace() { return !!FIELD_CH[curScene] || !!AREA_KIND[curScene]; }
function safePlace() { return !fightPlace() || (SCENES[curScene].village && storyPh === 'done'); }   // a saved town is safe again
// the guide: which place to head for next (shown in the top chip everywhere), and which exit the yellow arrow on 草原 points to
function storyGoal() { return !save.talked ? 'castle' : save.cleared >= LAST_CH ? '' : CH_PLACE[save.cleared + 1]; }
// 次の目的地へ行くには、どの場所に進めばよいか
function nextHop(goal) {
  if (!goal || goal === curScene) return '';
  const edges = sc => (LINKS[sc] || []).map(l => l[1]).concat(sc === 'v2' && save.cleared >= KEY_CH ? ['f4'] : []);
  const prev = { [curScene]: null }, q = [curScene];
  while (q.length) { const a = q.shift(); if (a === goal) break; for (const b of edges(a)) if (!(b in prev)) { prev[b] = a; q.push(b); } }
  if (!(goal in prev)) return '';
  let n = goal; while (prev[n] !== curScene) n = prev[n];
  return n;
}
function guideTarget() {             // the arrow only shows on the 草原 crossroads
  if (mode !== 'story' || curScene !== 'f1') return null;
  const goal = storyGoal();
  if (goal === 'castle' && curScene === 'castle') return KING ? { x: KING.x, y: KING.y } : null;
  const hop = nextHop(goal); if (!hop) return null;
  if (hop === 'f4' && WELL) return { x: WELL.x, y: WELL.y };
  const ex = EXITS.find(e => e.to === hop); return ex ? { x: (ex.x0 + ex.x1) / 2, y: (ex.y0 + ex.y1) / 2 } : null;
}
// 村人を表示するか（町の人は町を救うまで家に隠れている）
function npcShown(n) { return !n.hide || storyPh === 'done'; }
// walk into another place (everyone's own browser does this for itself)
function goTo(sc, from) {
  loadScene(sc);
  const p = (ENTS && ENTS[from]) || spawnPoint(me.slot);
  me.x = p.x + (me.slot - 2.5) * 6; me.y = p.y;
  if (!canStand(me.x, me.y)) { me.x = p.x; me.y = p.y; }
  me.held.clear(); target = null; stick = null; lastUI = ''; storyPh = '';
  if (isHost) { const st = stats.get(me.slot); if (st) st.sc = sc; }
  exitCool = performance.now() + 500;
  renderList();
  if (from === 'portal4') say(ENDING, () => banner('おしまい<small>遊んでくれてありがとう！ また何度でも冒険に出られます</small>', 7000));
}
// 出口に入ったら次の場所へ（柵が閉まっていれば押し戻す）、光る門でお城へ
function checkExits(px, py, now) {
  if (mode !== 'story' || now < exitCool || dlgOpen) return;
  for (const ex of EXITS) {
    if (me.x < ex.x0 || me.x >= ex.x1 || me.y < ex.y0 || me.y >= ex.y1) continue;
    if (ex.need && save.cleared < ex.need) {          // the fence: beat this chapter's boss first
      me.x = px; me.y = py; target = null;
      if (now > lockMsgAt) { toast('柵でふさがれている。' + BOSS_NAMES[CH_BOSS[ex.need]] + 'を倒すと通れるようになる'); lockMsgAt = now + 2500; }
      return;
    }
    goTo(ex.to, curScene);
    return;
  }
  if (FIELD_CH[curScene] && storyPh === 'done' && PORTAL && !SCENES[curScene].village && Math.hypot(me.x - PORTAL.x, me.y - PORTAL.y) < 14)
    goTo('castle', FIELD_CH[curScene] === LAST_CH ? 'portal4' : 'portal');
}

// ---- 武器の持ちかえ ----------------------------------------------
// 持っている武器の一覧
function ownedWeapons() { return ['knife', ...save.weapons]; }
// 「持ちかえ」：持っている武器を順番に切りかえ
function cycleWeapon() {
  if (mode !== 'story' || safePlace()) return;
  const list = ownedWeapons(); if (list.length < 2) { toast('まだ持ちかえる武器がありません。ダンジョンの先にいる武器の番人を倒そう'); return; }
  const w = list[(list.indexOf(me.w) + 1) % list.length];
  me.w = w;
  if (isHost) { const st = stats.get(me.slot); if (st && st.owned.has(w)) st.weapon = w; syncFromStats(); }
  else if (hostConn && hostConn.open) hostConn.send({ t: 'equip', w });
  toast(WEAPONS[w].name + 'に持ちかえた');
}
$('swap').addEventListener('click', cycleWeapon);
