// ================================================================================================
// js/lobby.js — 最初の画面（キャラ選び・部屋を作る／入る）と部屋を出るまで
// character select, create / join a room, entering and leaving play, fullscreen, the player list
// (loaded 5/12: may use anything from the files loaded before it)
// ================================================================================================
(() => {
  const box = document.querySelector('#select .cards');
  CHARS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'card'; b.id = 'pick-' + i; b.dataset.i = String(i);
    const cv = document.createElement('canvas'); cv.width = 20; cv.height = 32;
    const sp = document.createElement('span'); sp.textContent = c[1];
    b.append(cv, sp); box.append(b);
  });
})();

// ---- 画面の切りかえとキャラ選び ----------------------------------
// 画面の切りかえ（キャラ選び／ロビー／ゲーム）
function show(name) {
  screen = name;
  $('select').hidden = name !== 'select';
  $('lobby').hidden = name !== 'lobby';
  $('play').hidden = name !== 'play';
}
// ロビーのお知らせ文
function lobbyMsg(text, err) { const el = $('lobby-msg'); el.textContent = text; el.classList.toggle('err', !!err); }
const cardCtx = CHARS.map((_, i) => { const c = document.querySelector('#pick-' + i + ' canvas').getContext('2d'); c.imageSmoothingEnabled = false; return c; });
try { const s = localStorage.getItem('chara'); if (s !== null) $('pick-' + s)?.classList.add('last'); } catch (e) {}
document.querySelectorAll('.card').forEach(b => b.addEventListener('click', () => {
  me.c = Math.min(CHARS.length - 1, Math.max(0, +b.dataset.i | 0));
  try { localStorage.setItem('chara', String(me.c)); } catch (e) {}
  show('lobby'); lobbyMsg('');
  const q = new URLSearchParams(location.search).get('room');
  if (q) { $('code-in').value = q.replace(/\D/g, '').slice(0, 4); $('join').focus(); }
}));
$('back').addEventListener('click', () => show('select'));

// ---- 部屋を作る・入る --------------------------------------------
// 4けたの部屋番号
function randomCode() { let s = ''; for (let i = 0; i < 4; i++) s += pickOne(CODE_CHARS); return s; }
// 部屋づくり中はボタンを押せなくする
function busy(b) { $('create').disabled = b; $('create-coop').disabled = b; $('create-story').disabled = b; $('join').disabled = b; }
// 通信エラーをわかりやすい日本語に
function errorText(type) {
  return ({
    'peer-unavailable': 'その部屋コードの部屋が見つかりません。コードが合っているか、部屋の親がゲーム画面を開いたままか（別のアプリに切り替えると部屋が見えなくなることがあります）を確認してください。',
    'network': '通信サーバーにつながりません。ネットワークを確認してもう一度試してください。',
    'server-error': '通信サーバーでエラーが起きました。少し待ってからもう一度試してください。',
    'browser-incompatible': 'このブラウザは対応していません。Chrome・Safari・Edgeの最新版で開いてください。',
  })[type] || '接続できませんでした（' + type + '）。もう一度試してください。';
}
$('create').addEventListener('click', () => createRoom(0, 'pvp'));
$('create-coop').addEventListener('click', () => createRoom(0, 'coop'));
$('create-story').addEventListener('click', () => createRoom(0, 'story'));
// ロビーに出すストーリーの進み具合と「記録を消す」
function renderSaveInfo() {
  const el = $('story-save'); if (!el) return;
  el.replaceChildren();
  const ws = save.weapons.map(w => WEAPONS[w].name).join('・');
  el.append('あなたのストーリーの記録：' + (save.cleared ? (save.cleared >= LAST_CH ? '全' + LAST_CH + '章クリア！' : '第' + save.cleared + '章までクリア') : 'まだ冒険していません') + (ws ? '／持っている武器：' + ws : '') + '　');
  if (save.cleared || save.weapons.length) {
    const b = document.createElement('button'); b.className = 'link'; b.textContent = '記録を消す';
    let armed = 0;
    b.addEventListener('click', () => {
      if (!armed) { armed = setTimeout(() => { armed = 0; b.textContent = '記録を消す'; }, 4000); b.textContent = '本当に消す？（もう一度押す）'; return; }
      clearTimeout(armed); save = { v: 2, cleared: 0, weapons: [], talked: false, chests: [], hearts: 0 }; writeSave();
    });
    el.append(b);
  }
}
// 部屋を作る（自分が親）。mode: pvp=対戦 / coop=協力 / story=ストーリー
function createRoom(tries, m) {
  busy(true); lobbyMsg('部屋を作っています…');
  const code = randomCode();
  const p = new Peer(ID_PREFIX + code);
  p.on('open', () => {
    peer = p; isHost = true; roomCode = code; me.slot = 1;
    stats.clear(); stats.set(1, freshStat());
    mode = m;
    for (const k in AREAS) delete AREAS[k];
    loadScene(m === 'story' ? 'castle' : 'island');
    const sp = spawnPoint(1); me.x = sp.x; me.y = sp.y;
    stats.get(1).sc = curScene;
    if (m === 'story') { const st = stats.get(1); st.cleared = save.cleared; st.owned = new Set(['knife', ...save.weapons]); st.chests = new Set(save.chests); st.lm = LIFE_MAX + Math.max(0, Math.min(3, save.hearts | 0)); st.life = st.lm; }
    resetGame();
    p.on('connection', onHostConnection);
    enterPlay();
  });
  p.on('error', err => {
    if (err.type === 'unavailable-id' && tries < 8) { p.destroy(); createRoom(tries + 1, m); return; }
    if (peer === p) { console.warn('peer error (room kept)', err.type); return; }   // already hosting: keep the room, 'disconnected' reconnects
    p.destroy(); busy(false); lobbyMsg(errorText(err.type), true);
  });
  p.on('disconnected', () => { if (peer === p) p.reconnect(); });
}
$('join').addEventListener('click', joinRoom);
$('code-in').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
// 部屋番号で部屋に入る（子）。親からのメッセージを受け取る処理もここ
function joinRoom() {
  const code = $('code-in').value.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '');
  if (!/^\d{4}$/.test(code)) { lobbyMsg('部屋コードは4桁の数字です。', true); return; }
  busy(true); lobbyMsg('通信サーバーにつないでいます…');
  const p = new Peer();
  let giveUp = 0, slowMsg = 0;
  p.on('open', () => {
    lobbyMsg('部屋の親につないでいます…');
    const conn = p.connect(ID_PREFIX + code, { reliable: true, metadata: { c: me.c, v: VERSION, sv: { c: save.cleared, w: save.weapons, k: save.chests, h: save.hearts | 0 } } });
    slowMsg = setTimeout(() => { if (!hostConn) lobbyMsg('部屋の親につないでいます…（時間がかかっています。親の画面が開いたままか確認してください）'); }, 8000);
    giveUp = setTimeout(() => {
      if (hostConn) return;
      p.destroy(); busy(false);
      lobbyMsg('部屋に入れませんでした。①部屋の親がゲーム画面を開いたままか（別のアプリに切り替えていないか）②部屋コードが合っているか を確認して、もう一度「入る」を押してください。', true);
    }, JOIN_TIMEOUT_MS);
    conn.on('open', () => lobbyMsg('部屋の親とつながりました。準備中…'));
    conn.on('data', d => {
      if (d.sc && hostConn === conn && ['shot', 'atk', 'pick', 'ehit', 'hit', 'bfx', 'respawn'].includes(d.t) && d.sc !== curScene) return;   // news from another place
      if (d.t === 'full') { clearTimeout(giveUp); clearTimeout(slowMsg); p.destroy(); busy(false); lobbyMsg('この部屋は満員です（最大4人）。', true); return; }
      if (d.t === 'version') {
        clearTimeout(giveUp); clearTimeout(slowMsg); p.destroy(); busy(false);
        lobbyMsg('部屋の親とページの版が違います（親：' + d.v + '／あなた：' + VERSION + '）。親もあなたも、ページを再読み込みしてから入り直してください。', true); return;
      }
      if (d.t === 'welcome') {
        clearTimeout(giveUp); clearTimeout(slowMsg);
        peer = p; isHost = false; roomCode = code; hostConn = conn; me.slot = d.slot; mode = ['coop', 'story'].includes(d.mode) ? d.mode : 'pvp';
        loadScene(d.sc || 'island');
        me.x = d.x; me.y = d.y; lastHostMsg = performance.now();
        enterPlay();
        return;
      }
      if (d.t === 'all') { lastHostMsg = performance.now(); applyAll(d.ps); if (d.en) applyEnemies(d.en); if (d.g) updateGameUI(d.g); if (d.pk) applyPickups(d.pk); }
      else if (d.t === 'shot') addShot(d, true);
      else if (d.t === 'atk') attackFx(d);
      else if (d.t === 'pick') onPick(d);
      else if (d.t === 'ehit') onEhit(d);
      else if (d.t === 'hit') onHit(d);
      else if (d.t === 'respawn') onRespawn(d);
      else if (d.t === 'bfx') onBossFx(d);
      else if (d.t === 'sclear') onStoryClear(d);
      else if (d.t === 'note') toast(String(d.text));
      else if (d.t === 'warp') onWarp(d);
    });
    conn.on('close', () => { if (hostConn === conn) endRoom('親が部屋を閉じたため、部屋が終了しました。'); });
  });
  p.on('error', err => {
    if (peer === p) { console.warn('peer error (still in room)', err.type); return; }  // in room: the host timeout decides
    clearTimeout(giveUp); clearTimeout(slowMsg); p.destroy(); busy(false); lobbyMsg(errorText(err.type), true);
  });
}

// ---- ゲームを始める・やめる --------------------------------------
// ゲーム画面に切りかえる
function enterPlay() {
  busy(false);
  $('room-code').textContent = roomCode;
  $('copy-msg').textContent = '';
  toast(isHost ? 'この部屋コードか招待リンクを、一緒に遊ぶ人に送ってください。（スマホの親は、送ったらすぐこの画面に戻ってください）' : '部屋に入りました。');
  if (isHost || mode !== 'story') updateGameUI(isHost ? gameOutFor(curScene) : { m: mode, w: 1, ph: 'rest', t: 0, left: 0 });
  history.replaceState(null, '', '?room=' + roomCode);
  renderList();
  show('play');
  document.body.style.overflow = 'hidden';
  resize();
}
// 部屋を出る（ロビーに戻る）
function endRoom(msg) {
  const p = peer;
  peer = null; hostConn = null; isHost = false;
  conns.clear(); others = new Map(); me.held.clear(); target = null; stick = null; ptr = null;
  shots.clear(); sparks = []; stats.clear(); atkHeld = false;
  enemies = new Map(); bossFx = []; game.queue = []; game.phase = 'wait'; lastUI = ''; banner(''); $('mode-chip').textContent = '';
  Object.assign(me, { life: LIFE_MAX, lm: LIFE_MAX, down: false, inv: false, ko: 0, w: 'knife', ammo: 0, fastUntil: 0 });
  fx = []; pickups.clear();
  dlgQueue = []; if (dlgTyping) clearInterval(dlgTyping); dlgTyping = 0; clearTimeout(dlgAuto); dlgOpen = false; $('dialog').hidden = true; $('swap').hidden = true;
  storyPh = ''; renderSaveInfo(); $('bossbar').hidden = true; lastBossKey = '';
  if (p) try { p.destroy(); } catch (e) {}
  history.replaceState(null, '', location.pathname);
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  busy(false); show('lobby'); lobbyMsg(msg || '', !!msg);
}
// browser full screen (not available on iPhone; the play view already fills the window)
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (screen === 'play' && peer && Date.now() - hiddenAt > 3000)
    toast(isHost ? '部屋の親が別の画面に切り替えると、全員の通信が止まります。親はこの画面を開いたままにしてください。' : '別の画面に切り替えている間、通信が止まっていました。');
});
const fsBtn = $('fs');
if (!document.documentElement.requestFullscreen) fsBtn.hidden = true;
fsBtn.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => toast('このブラウザでは全画面にできません。'));
});
document.addEventListener('fullscreenchange', () => { fsBtn.textContent = document.fullscreenElement ? '全画面を解除' : '全画面'; setTimeout(resize, 50); });
$('leave').addEventListener('click', () => endRoom(''));
addEventListener('pagehide', () => { if (peer) try { peer.destroy(); } catch (e) {} });
$('copy').addEventListener('click', () => {
  const url = location.origin + location.pathname + '?room=' + roomCode;
  const done = () => { $('copy-msg').textContent = ''; toast('招待リンクをコピーしました'); };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => toast(url));
  else toast(url);
});
// 左上の参加者一覧（ライフ・撃破数・居場所）
function renderList() {
  const all = [{ slot: me.slot, c: me.c, you: true, life: me.life, lm: me.lm, down: me.down, ko: me.ko }, ...[...others.values()]].sort((a, b) => a.slot - b.slot);
  $('count').textContent = all.length + ' / ' + MAX;
  $('plist').replaceChildren(...all.map(p => {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = SLOT_COLORS[p.slot - 1];
    const life = document.createElement('span');
    const lv = p.life === undefined ? lifeMaxOf(p) : p.life;
    life.className = 'life' + (p.down ? ' down' : '');
    life.textContent = p.down ? 'ダウン' : '♥'.repeat(lv) + '♡'.repeat(Math.max(0, lifeMaxOf(p) - lv));
    const wk = p.you ? me.w : p.w;
    const where = mode === 'story' ? '［' + (PLACE_NAME[p.you ? curScene : p.sc] || '') + '］' : '';
    li.append(dot, 'P' + p.slot + '　' + (NAMES[p.c] || '？') + (p.you ? '（あなた）' : '') + (p.slot === 1 ? '・親' : '') + where + '　', life, '　撃破 ' + (p.ko | 0) + (wk && wk !== 'knife' ? '　' + WEAPONS[wk].name : ''));
    return li;
  }));
}
