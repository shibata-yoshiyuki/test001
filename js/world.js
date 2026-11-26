// ================================================================================================
// js/world.js — マップを作る・当たり判定
// one map per place (built from a fixed seed so everyone gets the same one), the host can switch
// between places with withMap(); coastlines, the maze, villages, the castle; trees/rocks sprites;
// collision (canStand / canStandE) and finding free spots
// (loaded 4/12: may use anything from the files loaded before it)
// ================================================================================================
// host side
function spawnPoint(slot) {          // in the map that is active right now (SC)
  if (ENTS && ENTS.start) return { x: ENTS.start.x + (slot - 2.5) * 20, y: ENTS.start.y };
  return { x: WORLD_W / 2 + (slot - 2.5) * 28, y: WORLD_H / 2 + (SCENES[SC] && SCENES[SC].lair ? 22 : 0) };
}
// 敵がその位置に立てるか（r＝体の大きさ）
function canStandE(x, y, r) { return walkable(x - r, y) && walkable(x + r, y) && walkable(x - r, y - 3) && walkable(x + r, y - 3); }
// 近くで立てる場所を探す
function standableNear(x, y, r) {
  if (canStandE(x, y, r)) return { x, y };
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, px = x + Math.cos(a) * 20, py = y + Math.sin(a) * 14; if (canStandE(px, py, r)) return { x: px, y: py }; }
  return null;
}
function randomLandSpot() {          // somewhere walkable in the active map (SC)
  for (let i = 0; i < 500; i++) {
    const x = (Math.random() * WORLD_W) | 0, y = (Math.random() * WORLD_H) | 0;
    const ty = Math.floor(y / TILE), tx = Math.floor(x / TILE);
    if (ty >= 0 && tx >= 0 && ty < MAP_H && tx < MAP_W && land[ty][tx] && !beach[ty][tx] && reach[ty][tx] && canStand(x, y)) return { x, y };
  }
  return { x: WORLD_W / 2, y: WORLD_H / 2 };
}
// maps are built from a fixed seed per scene, so every player sees the same one
let land = [], beach = [], obst = [], reach = [];     // obst: 0 none, 1 low (rock...), 2 tall (tree...), 3 invisible block
const world = document.createElement('canvas');
let curScene = '', THEME = THEMES.grass, LAIR = null, KING = null, DOOR = null, PORTAL = null;
let SC = 'island', EXITS = [], ENTS = {}, NPCS = [], HOUSES = [], WELL = null, CHEST_SPOTS = [];   // SC = the place being drawn or simulated right now
// every place's map is kept as data so the host can run several places at once
const MAPS = {};

// ---- 場所ごとのマップ --------------------------------------------
// 今のマップの中身をまとめて取り出す／戻す（親がほかの場所を動かすときに使う）
function mapState() { return { land, beach, obst, reach, MAP_W, MAP_H, WORLD_W, WORLD_H, LAIR, KING, DOOR, PORTAL, EXITS, ENTS, NPCS, HOUSES, WELL, CHEST_SPOTS, THEME, SC }; }
function setMapState(M) { ({ land, beach, obst, reach, MAP_W, MAP_H, WORLD_W, WORLD_H, LAIR, KING, DOOR, PORTAL, EXITS, ENTS, NPCS, HOUSES, WELL, CHEST_SPOTS, THEME, SC } = M); }
// その場所のマップ（なければ作って覚えておく）
function getMap(sc) {
  if (!SCENES[sc]) sc = 'island';
  if (!MAPS[sc]) { const keep = mapState(); buildWorld(sc, false); MAPS[sc] = mapState(); setMapState(keep); }
  return MAPS[sc];
}
// その場所のマップに一時的に切りかえて fn を実行（親が全員の場所をまとめて動かす）
function withMap(sc, fn) { const keep = mapState(); setMapState(getMap(sc)); try { return fn(); } finally { setMapState(keep); } }
function loadScene(sc) {              // show this place (and make it the active map)
  if (!SCENES[sc]) sc = 'island';
  buildWorld(sc, true); MAPS[sc] = mapState(); curScene = sc;
  fx = []; bossFx = []; target = null; sparks = [];
  if (!isHost) { shots.clear(); pickups.clear(); enemies = new Map(); }
}

// ---- マップを作る ------------------------------------------------
function addExits(sc, carve, bridge, short) {   // exits on the map edge toward other places (+ a road to the middle)
  const L = LINKS[sc]; if (!L) return;
  const cx = MAP_W / 2 | 0, cy = MAP_H / 2 | 0;
  for (const [side, to, need, pos0] of L) {
    const pos = pos0 === undefined ? .5 : pos0, ns = side === 'n' || side === 's';
    const px = ns ? Math.round(MAP_W * pos) : cx, py = ns ? cy : Math.round(MAP_H * pos);
    let rect, ent; const cells = [];
    if (side === 'w') { rect = [0, (py - 1) * TILE, 2 * TILE, (py + 2) * TILE]; ent = { x: 3.5 * TILE, y: py * TILE + 10 }; for (let x = 0; x <= cx; x++) for (let y = py - 1; y <= py + 1; y++) cells.push([x, y]); }
    if (side === 'e') { rect = [(MAP_W - 2) * TILE, (py - 1) * TILE, MAP_W * TILE, (py + 2) * TILE]; ent = { x: (MAP_W - 3.5) * TILE, y: py * TILE + 10 }; for (let x = cx; x < MAP_W; x++) for (let y = py - 1; y <= py + 1; y++) cells.push([x, y]); }
    if (side === 'n') { rect = [(px - 1) * TILE, 0, (px + 1) * TILE, 2 * TILE]; ent = { x: px * TILE, y: 3.5 * TILE }; for (let y = 0; y <= cy; y++) for (let x = px - 1; x <= px; x++) cells.push([x, y]); }
    if (side === 's') { rect = [(px - 1) * TILE, (MAP_H - 2) * TILE, (px + 1) * TILE, MAP_H * TILE]; ent = { x: px * TILE, y: (MAP_H - 3.5) * TILE }; for (let y = cy; y < MAP_H; y++) for (let x = px - 1; x <= px; x++) cells.push([x, y]); }
    if (ns && px !== cx) for (let x = Math.min(px, cx) - 1; x <= Math.max(px, cx); x++) for (let y = cy - 1; y <= cy + 1; y++) cells.push([x, y]);   // bend toward the middle
    if (!ns && py !== cy) for (let y = Math.min(py, cy) - 1; y <= Math.max(py, cy) + 1; y++) for (let x = cx - 1; x <= cx; x++) cells.push([x, y]);
    if (carve) for (const [x, y] of cells) {
      if (short && Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y) > 1) continue;   // the maze: only through the border
      if (bridge && !land[y][x]) bridge.set(x + ',' + y, ns ? 'v' : 'h');                         // over the water: a stone bridge
      land[y][x] = true; beach[y][x] = false; obst[y][x] = 0; carve.add(x + ',' + y);
    }
    EXITS.push({ x0: rect[0], y0: rect[1], x1: rect[2], y1: rect[3], to, need, side, ent });
    ENTS[to] = ent;
  }
}
// マップを作る：海に囲まれた島（ふち・木・岩）、出口への道と石の橋、武器の番人の広場。paint=true で絵も描く
function buildWorld(sc, paint) {
  const S = SCENES[sc];
  SC = sc; THEME = THEMES[S.theme];
  MAP_W = S.w; MAP_H = S.h; WORLD_W = MAP_W * TILE; WORLD_H = MAP_H * TILE;
  land = []; beach = []; obst = []; reach = [];
  LAIR = KING = DOOR = null; PORTAL = { x: WORLD_W / 2, y: WORLD_H / 2 - 4 * TILE };
  EXITS = []; ENTS = {}; NPCS = []; HOUSES = []; WELL = null; CHEST_SPOTS = [];
  if (paint) { world.width = WORLD_W; world.height = WORLD_H; }
  if (S.hall) { buildHall(S, paint); return; }
  if (S.village) { buildVillage(sc, S, paint); return; }
  let seed = S.seed; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // value noise for a ragged coastline
  const G = 6, gw = Math.ceil(MAP_W / G) + 2, gh = Math.ceil(MAP_H / G) + 2, grid = [];
  for (let i = 0; i < gw * gh; i++) grid.push(rnd());
  const sm = t => t * t * (3 - 2 * t);
  const noiseOf = gr => (x, y) => {
    const gx = x / G, gy = y / G, ix = Math.floor(gx), iy = Math.floor(gy), fx = sm(gx - ix), fy = sm(gy - iy);
    const v = (a, b) => gr[(iy + b) * gw + (ix + a)];
    return (v(0, 0) * (1 - fx) + v(1, 0) * fx) * (1 - fy) + (v(0, 1) * (1 - fx) + v(1, 1) * fx) * fy;
  };
  const noise = noiseOf(grid);
  const isLand = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && land[y][x];
  let s2 = S.oseed; const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
  let start = [MAP_W / 2 | 0, MAP_H / 2 | 0];
  if (S.maze) start = buildMaze(r2);
  else {
  for (let y = 0; y < MAP_H; y++) {
    land.push([]); beach.push([]);
    for (let x = 0; x < MAP_W; x++) {
      const d = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
      land[y].push(d >= 4 + noise(x, y) * 5);
    }
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    let nearSea = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isLand(x + dx, y + dy)) nearSea = true;
    beach[y].push(land[y][x] && nearSea);
  }
  // trees and rocks: own seed so the ground pattern above stays the same
  const fgrid = []; for (let i = 0; i < gw * gh; i++) fgrid.push(r2());
  const forest = noiseOf(fgrid);
  for (let y = 0; y < MAP_H; y++) {
    obst.push([]);
    for (let x = 0; x < MAP_W; x++) {
      let o = 0;
      if (land[y][x] && !beach[y][x] && Math.hypot(x - MAP_W / 2, y - MAP_H / 2) > 6) {
        const pTree = forest(x, y) > S.fth ? S.pT : S.pTl, r = r2();
        if (r < pTree) o = 2; else if (r < pTree + S.pR) o = 1;
      }
      obst[y].push(o);
    }
  }
  }
  const road = new Set(), bridge = new Map();
  addExits(sc, road, bridge, S.maze);
  const flood = () => {             // which tiles can be reached on foot from the middle
    reach = [];
    for (let y = 0; y < MAP_H; y++) reach.push(new Array(MAP_W).fill(false));
    const [cx, cy] = start, q = [[cx, cy]]; reach[cy][cx] = true;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || reach[ny][nx] || !land[ny][nx] || obst[ny][nx]) continue;
        reach[ny][nx] = true; q.push([nx, ny]);
      }
    }
  };
  flood();
  if (S.lair) {                     // the side-quest clearing where the mid-bosses guard their chests
    const cand = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const d = Math.hypot(x - MAP_W / 2, y - MAP_H / 2);
      if (d >= 14 && d <= 20 && reach[y][x] && !beach[y][x] && Math.abs(y - (MAP_H / 2 | 0)) > 4) cand.push([x, y]);
    }
    const [lx, ly] = S.lairCenter ? [MAP_W / 2 | 0, (MAP_H / 2 | 0) - 2] : cand.length ? cand[r2() * cand.length | 0] : [MAP_W / 2 + 15 | 0, MAP_H / 2 - 8 | 0];
    for (let y = ly - 3; y <= ly + 3; y++) for (let x = lx - 3; x <= lx + 3; x++) if (y >= 0 && x >= 0 && y < MAP_H && x < MAP_W && Math.hypot(x - lx, y - ly) <= 3.2) obst[y][x] = 0;
    LAIR = { x: lx * TILE + 8, y: ly * TILE + 10 };
    flood();
  }
  if (!paint) return;
  const T = THEME, f = world.getContext('2d');
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const px = x * TILE, py = y * TILE;
    if (bridge.has(x + ',' + y)) {   // stone bridge over the water
      const k = (dx, dy) => road.has((x + dx) + ',' + (y + dy)), vert = bridge.get(x + ',' + y) === 'v';
      f.fillStyle = T.shal; f.fillRect(px, py, TILE, TILE);
      f.fillStyle = '#9a9286'; f.fillRect(px, py, TILE, TILE);
      f.fillStyle = '#857d71';
      if (vert) for (let i = 0; i < 4; i++) f.fillRect(px, py + i * 4 + ((x & 1) * 2), TILE, 1);
      else for (let i = 0; i < 4; i++) f.fillRect(px + i * 4 + ((y & 1) * 2), py, 1, TILE);
      f.fillStyle = '#b3ab9e'; f.fillRect(px + 3, py + 5, 2, 1); f.fillRect(px + 10, py + 11, 2, 1);
      const rail = (rx, ry, rw, rh) => { f.fillStyle = '#5f5a52'; f.fillRect(rx, ry, rw, rh); f.fillStyle = '#c9c2b4'; f.fillRect(rx, ry, rw, 1); };
      if (vert) { if (!k(-1, 0)) rail(px, py, 3, TILE); if (!k(1, 0)) rail(px + TILE - 3, py, 3, TILE); }
      else { if (!k(0, -1)) rail(px, py, TILE, 3); if (!k(0, 1)) rail(px, py + TILE - 3, TILE, 3); }
      continue;
    }
    if (!land[y][x]) {
      let shallow = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isLand(x + dx, y + dy)) shallow = true;
      f.fillStyle = shallow ? T.shal : T.deep; f.fillRect(px, py, TILE, TILE);
      if (shallow) {   // foam along the shore
        f.fillStyle = T.foam;
        if (isLand(x, y - 1)) f.fillRect(px, py, TILE, 1);
        if (isLand(x, y + 1)) f.fillRect(px, py + TILE - 1, TILE, 1);
        if (isLand(x - 1, y)) f.fillRect(px, py, 1, TILE);
        if (isLand(x + 1, y)) f.fillRect(px + TILE - 1, py, 1, TILE);
      }
      continue;
    }
    if (beach[y][x] || road.has(x + ',' + y)) {
      f.fillStyle = T.b; f.fillRect(px, py, TILE, TILE);
      for (let k = 0; k < 4; k++) { f.fillStyle = rnd() > .5 ? T.bs[0] : T.bs[1]; f.fillRect(px + (rnd() * 15 | 0), py + (rnd() * 15 | 0), 1, 1); }
      continue;
    }
    f.fillStyle = (x + y) % 2 ? T.g[0] : T.g[1]; f.fillRect(px, py, TILE, TILE);
    if (T.deco === 'cracks') { f.fillStyle = 'rgba(0,0,0,.25)'; f.fillRect(px, py + 15, TILE, 1); f.fillRect(px + 15, py, 1, TILE); }
    for (let k = 0; k < 3; k++) { f.fillStyle = rnd() > .5 ? T.sp[0] : T.sp[1]; f.fillRect(px + (rnd() * 14 | 0), py + (rnd() * 14 | 0), 2, 1); }
    const r = rnd();
    const fx = px + 3 + (rnd() * 9 | 0), fy = py + 3 + (rnd() * 9 | 0);
    if (T.deco === 'flowers') {
      if (r < .06) { f.fillStyle = ['#f2e15c', '#f5f5f5', '#e98aa6'][rnd() * 3 | 0]; f.fillRect(fx, fy, 1, 1); f.fillRect(fx + 3, fy + 2, 1, 1); }
      else if (r < .09) { f.fillStyle = '#6a9a5c'; f.fillRect(fx, fy, 1, 3); f.fillRect(fx + 2, fy + 1, 1, 2); f.fillRect(fx - 2, fy + 1, 1, 2); }
    } else if (T.deco === 'mushrooms' && r < .05) {
      f.fillStyle = '#e0e0d0'; f.fillRect(fx + 1, fy + 2, 1, 2); f.fillStyle = rnd() > .5 ? '#d9534f' : '#c99a5b'; f.fillRect(fx, fy, 3, 2);
    } else if (T.deco === 'bones' && r < .05) {
      f.fillStyle = '#d8d4c4'; f.fillRect(fx, fy, 4, 1); f.fillRect(fx - 1, fy - 1, 1, 1); f.fillRect(fx + 4, fy + 1, 1, 1);
    } else if (T.deco === 'cracks' && r < .06) {
      f.fillStyle = '#6b2a1a'; f.fillRect(fx, fy, 3, 1); f.fillRect(fx + 2, fy + 1, 2, 1);
    }
    if (obst[y][x]) { f.fillStyle = T.shadow; f.fillRect(px + 2, py + 12, 12, 3); f.fillRect(px + 4, py + 15, 8, 1); }
  }
  if (LAIR) {                       // dark clearing with a ring of stones
    f.fillStyle = 'rgba(0, 0, 0, .16)'; f.beginPath(); f.ellipse(LAIR.x, LAIR.y, 46, 32, 0, 0, Math.PI * 2); f.fill();
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2, sx = Math.round(LAIR.x + Math.cos(a) * 46), sy = Math.round(LAIR.y + Math.sin(a) * 32);
      f.fillStyle = '#5d6168'; f.fillRect(sx - 2, sy - 1, 4, 3); f.fillStyle = '#9ea3aa'; f.fillRect(sx - 1, sy - 1, 2, 1);
    }
  }
}
function buildMaze(rnd) {             // 迷いの森: corridors 3 tiles wide between walls of trees
  const P = 5, C = (MAP_W - 2) / P | 0, R = (MAP_H - 2) / P | 0;
  for (let y = 0; y < MAP_H; y++) { land.push(new Array(MAP_W).fill(true)); beach.push(new Array(MAP_W).fill(false)); obst.push(new Array(MAP_W).fill(4)); }
  const open = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) obst[y][x] = 0; };
  const X = i => 2 + i * P, Y = j => 2 + j * P;
  const seen = [], deg = []; for (let j = 0; j < R; j++) { seen.push(new Array(C).fill(false)); deg.push(new Array(C).fill(0)); }
  const ei = C / 2 | 0, ej = R - 1; seen[ej][ei] = true; open(X(ei), Y(ej), X(ei) + 2, Y(ej) + 2);
  const join = (i, j, a, b) => { deg[j][i]++; deg[b][a]++; open(Math.min(X(i), X(a)), Math.min(Y(j), Y(b)), Math.max(X(i), X(a)) + 2, Math.max(Y(j), Y(b)) + 2); };
  const N4 = (i, j) => [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < C && b < R);
  // randomized Prim: grows outward in every direction, so there are many forks and side paths
  const front = []; const addFront = (i, j) => { for (const [a, b] of N4(i, j)) if (!seen[b][a] && !front.some(f => f[0] === a && f[1] === b)) front.push([a, b]); };
  addFront(ei, ej);
  while (front.length) {
    const [a, b] = front.splice(rnd() * front.length | 0, 1)[0];
    const done = N4(a, b).filter(([i, j]) => seen[j][i]);
    const [i, j] = done[rnd() * done.length | 0];
    seen[b][a] = true; join(i, j, a, b); addFront(a, b);
  }
  // a few extra openings make loops, so there is more than one way through
  const wallOpen = (i, j, a, b) => obst[(Y(j) + Y(b)) / 2 + 1 | 0][(X(i) + X(a)) / 2 + 1 | 0] === 0;
  for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) for (const [a, b] of [[i + 1, j], [i, j + 1]])
    if (a < C && b < R && !wallOpen(i, j, a, b) && deg[j][i] > 1 && deg[b][a] > 1 && rnd() < .12) join(i, j, a, b);
  const a0 = -1, a1 = -1;            // (no clearing inside: the boss and the mid-boss are in rooms past the two far exits)
  PORTAL = null;
  const dist = []; for (let j = 0; j < R; j++) dist.push(new Array(C).fill(-1));
  const q = [[ei, ej]]; dist[ej][ei] = 0;
  const linked = (i, j, a, b) => obst[(Y(j) + Y(b)) / 2 + 1 | 0][(X(i) + X(a)) / 2 + 1 | 0] === 0;
  while (q.length) {
    const [i, j] = q.shift();
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (a >= 0 && b >= 0 && a < C && b < R && dist[b][a] < 0 && linked(i, j, a, b)) { dist[b][a] = dist[j][i] + 1; q.push([a, b]); }
  }
  const best = null;
  const ends = [];                     // dead ends get small treasure chests: one in each third of the forest
  for (let j = 0; j < R; j++) for (let i = 0; i < C; i++)
    if (deg[j][i] === 1 && !(i === ei && j === ej) && !(j === 0 && (i === 2 || i === 8))) ends.push([dist[j][i], i, j]);
  ends.sort((p, q) => q[0] - p[0]);
  const picks = [];
  for (let band = 0; band < 3; band++) { const inBand = ends.filter(([, i]) => (i * 3 / C | 0) === band), far = inBand.slice(0, Math.max(1, Math.ceil(inBand.length / 2))); if (far.length) picks.push(far[rnd() * far.length | 0]); }   // somewhere in the farther half of each third
  for (const e of ends) if (picks.length < 3 && !picks.includes(e)) picks.push(e);
  CHEST_SPOTS = picks.map(([, i, j]) => ({ x: (X(i) + 1.5) * TILE, y: (Y(j) + 1.5) * TILE + 4 }));
  const far = picks.reduce((b, p, k) => p[0] > picks[b][0] ? k : b, 0);
  if (CHEST_SPOTS[far]) CHEST_SPOTS[far].heart = true;   // the farthest chest holds a heart (one more life)
  return [X(ei) + 1, Y(ej) + 1];
}
function buildVillage(sc, S, paint) {  // houses, a road, villagers; trees all around
  const w = S.w, h = S.h, cx = w / 2 | 0, cy = h / 2 | 0, ox = (w - 32) / 2 | 0, oy = (h - 22) / 2 | 0;   // the 32x22 village sits in a forest
  let ts = S.seed * 7 + 1; const tr = () => (ts = (ts * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < h; y++) {
    land.push([]); beach.push([]); obst.push([]); reach.push([]);
    for (let x = 0; x < w; x++) {
      const outer = x < ox + 2 || y < oy + 2 || x >= ox + 30 || y >= oy + 20;
      const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2 || (outer && tr() < .6);
      land[y].push(true); beach[y].push(false); obst[y].push(edge ? 2 : 0); reach[y].push(!edge);
    }
  }
  const road = new Set(), paved = new Set();
  for (let x = 2; x < w - 2; x++) for (let y = cy - 1; y <= cy + 1; y++) road.add(x + ',' + y);
  addExits(sc, paved);
  for (const k of paved) { road.add(k); const [x, y] = k.split(',').map(Number); if (!(x < ox + 2 || y < oy + 2 || x >= ox + 30 || y >= oy + 20)) paved.delete(k); }   // stone path through the woods
  for (const k of road) { const [x, y] = k.split(',').map(Number); obst[y][x] = 0; reach[y][x] = true; }
  const houses = S.houses || [];
  houses.forEach(([hx0, hy0], i) => {
    const hx = hx0 + ox, hy = hy0 + oy;
    for (let y = hy + 1; y <= hy + 2; y++) for (let x = hx; x <= hx + 2; x++) { obst[y][x] = 3; reach[y][x] = false; }
    HOUSES.push({ x: (hx + 1.5) * TILE, y: (hy + 3) * TILE - 1, v: (i + S.seed) % 3, burn: S.town && i % 3 !== 1 });
  });
  for (const d0 of NPC_DEFS[sc] || []) {
    const d = { ...d0, tx: d0.tx + ox, ty: d0.ty + oy };
    if (!d.hide) { obst[d.ty][d.tx] = 3; reach[d.ty][d.tx] = false; }
    NPCS.push({ ...d, x: d.tx * TILE + 8, y: d.ty * TILE + 14 });
  }
  if (S.well) {                       // the old well: the secret way to the demon castle
    const wx = S.well[0] + ox, wy = S.well[1] + oy;
    obst[wy][wx] = 3; reach[wy][wx] = false;
    WELL = { x: wx * TILE + 8, y: wy * TILE + 14 }; ENTS.f4 = { x: WELL.x, y: WELL.y + 22 };
  }
  ENTS.start = { x: cx * TILE, y: cy * TILE + 8 };
  PORTAL = null;
  if (!paint) return;
  let seed = S.seed; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const T = THEME, f = world.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x * TILE, py = y * TILE;
    if (paved.has(x + ',' + y)) {     // cobblestones
      f.fillStyle = '#8d877c'; f.fillRect(px, py, TILE, TILE);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { f.fillStyle = (r + c + x + y) % 3 ? '#a8a194' : '#b8b1a3'; f.fillRect(px + c * 8 + (r % 2) * 4 - 3, py + r * 4 + 1, 7, 3); }
      continue;
    }
    if (road.has(x + ',' + y)) {
      f.fillStyle = T.b; f.fillRect(px, py, TILE, TILE);
      for (let k = 0; k < 4; k++) { f.fillStyle = rnd() > .5 ? T.bs[0] : T.bs[1]; f.fillRect(px + (rnd() * 15 | 0), py + (rnd() * 15 | 0), 1, 1); }
      continue;
    }
    f.fillStyle = (x + y) % 2 ? T.g[0] : T.g[1]; f.fillRect(px, py, TILE, TILE);
    for (let k = 0; k < 3; k++) { f.fillStyle = rnd() > .5 ? T.sp[0] : T.sp[1]; f.fillRect(px + (rnd() * 14 | 0), py + (rnd() * 14 | 0), 2, 1); }
    const r = rnd(), fx = px + 3 + (rnd() * 9 | 0), fy = py + 3 + (rnd() * 9 | 0);
    if (r < .1) { f.fillStyle = ['#f2e15c', '#f5f5f5', '#e98aa6', '#9fc5ff'][rnd() * 4 | 0]; f.fillRect(fx, fy, 1, 1); f.fillRect(fx + 3, fy + 2, 1, 1); f.fillRect(fx + 1, fy + 3, 1, 1); }
    if (obst[y][x] === 2) { f.fillStyle = T.shadow; f.fillRect(px + 2, py + 12, 12, 3); }
  }
  for (const H of HOUSES) { f.fillStyle = T.shadow; f.fillRect(H.x - 26, H.y - 2, 52, 4); }
}
function buildHall(S, paint) {      // the castle throne room (story start)
  const w = S.w, h = S.h, cx = w / 2 | 0;
  for (let y = 0; y < h; y++) {
    land.push([]); beach.push([]); obst.push([]); reach.push([]);
    for (let x = 0; x < w; x++) {
      const inside = x >= 2 && x <= w - 3 && y >= 3 && y <= h - 3;
      const doorway = y === h - 2 && (x === cx - 1 || x === cx);
      land[y].push(inside || doorway); beach[y].push(false); obst[y].push(0); reach[y].push(inside || doorway);
    }
  }
  for (const py of [6, 10, 14]) for (const px of [5, w - 6]) obst[py][px] = 2;   // pillars
  obst[4][cx - 1] = obst[4][cx] = 3; obst[5][cx - 1] = obst[5][cx] = 3;         // throne + king
  KING = { x: cx * TILE, y: 5 * TILE + 14 };
  DOOR = { x: cx * TILE, y: (h - 2) * TILE + 6 };
  PORTAL = null;
  EXITS.push({ x0: (cx - 1) * TILE, y0: (h - 2) * TILE + 2, x1: (cx + 1) * TILE, y1: h * TILE, to: 'v1', need: 0, side: 's' });
  ENTS.v1 = { x: cx * TILE, y: (h - 4) * TILE }; ENTS.start = { x: cx * TILE, y: (h - 4) * TILE };
  ENTS.portal = ENTS.portal4 = { x: cx * TILE, y: 9 * TILE };
  for (const d of NPC_DEFS.castle) { obst[d.ty][d.tx] = 3; NPCS.push({ ...d, x: d.tx * TILE + 8, y: d.ty * TILE + 14 }); }
  if (!paint) return;
  const f = world.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x * TILE, py = y * TILE;
    if (land[y][x]) {
      f.fillStyle = (x + y) % 2 ? '#8b8478' : '#857e72'; f.fillRect(px, py, TILE, TILE);
      f.fillStyle = 'rgba(40, 30, 30, .25)'; f.fillRect(px, py + 15, TILE, 1); f.fillRect(px + 15, py, 1, TILE);
      if ((x === cx - 1 || x === cx) && y >= 6) {                                // red carpet
        f.fillStyle = '#9e2b2b'; f.fillRect(px, py, TILE, TILE);
        f.fillStyle = '#d7a945'; if (x === cx - 1) f.fillRect(px, py, 2, TILE); else f.fillRect(px + 14, py, 2, TILE);
      }
    } else if (y < 3) {                                                            // back wall with bricks
      f.fillStyle = '#4b4458'; f.fillRect(px, py, TILE, TILE);
      f.fillStyle = '#3a3446'; f.fillRect(px, py + 7, TILE, 1); f.fillRect(px, py + 15, TILE, 1); f.fillRect(px + ((y % 2) ? 4 : 12), py, 1, 7); f.fillRect(px + ((y % 2) ? 12 : 4), py + 8, 1, 7);
      if (y === 2) { f.fillStyle = '#6a6278'; f.fillRect(px, py + 14, TILE, 2); }
    } else { f.fillStyle = '#221d2b'; f.fillRect(px, py, TILE, TILE); }
  }
  for (const bx of [4, 8, w - 9, w - 5]) {                                       // banners
    const px = bx * TILE + 3, py = 1 * TILE - 6;
    f.fillStyle = '#b3242c'; f.fillRect(px, py, 10, 26); f.fillStyle = '#7a1a20'; f.fillRect(px + 9, py, 1, 26);
    f.fillStyle = '#e8c547'; f.fillRect(px + 3, py + 8, 4, 4); f.fillRect(px, py + 24, 2, 3); f.fillRect(px + 4, py + 24, 2, 3); f.fillRect(px + 8, py + 24, 2, 3);
  }
  { const px = (cx - 1) * TILE + 2, py = 3 * TILE - 4;                           // throne
    f.fillStyle = '#7a1a20'; f.fillRect(px + 4, py, 20, 26); f.fillStyle = '#d7a945'; f.fillRect(px + 2, py - 4, 24, 4); f.fillRect(px + 2, py, 3, 30); f.fillRect(px + 23, py, 3, 30);
    f.fillStyle = '#b3242c'; f.fillRect(px + 7, py + 3, 14, 18); f.fillStyle = '#e8c547'; f.fillRect(px + 12, py - 8, 4, 4); }
  { const px = (cx - 1) * TILE, py = (h - 2) * TILE;                              // the gate (door out)
    f.fillStyle = '#2b1d12'; f.fillRect(px - 4, py - 6, 40, 22); f.fillStyle = '#6b4a2b'; f.fillRect(px, py - 2, 32, 18);
    f.fillStyle = '#4a321d'; f.fillRect(px + 15, py - 2, 2, 18); f.fillRect(px, py + 6, 32, 1);
    f.fillStyle = '#ffd36b'; f.fillRect(px - 4, py - 7, 40, 1); f.fillRect(px - 5, py - 6, 1, 22); f.fillRect(px + 36, py - 6, 1, 22); }
}

// ---- 木・岩・柱・家の絵 ------------------------------------------
// pixel-art sprites for trees (2 kinds) and rocks (2 kinds), drawn once
function makeSprite(w, h, paint) { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')); return c; }
// 木の葉っぱなど、丸いかたまりを描く
function blobPaint(g, blobs, w, h, colors) {
  const inside = (x, y) => blobs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    const lit = -(x - colors.lx) * .6 - (y - colors.ly) * .8;
    g.fillStyle = edge ? colors.edge : lit > 6 ? colors.hi : lit > 0 ? colors.mid : (y > colors.lowY ? colors.low : colors.base);
    if (!edge && lit > 3 && lit <= 6 && (x + y) % 2) g.fillStyle = colors.hi;   // dither
    g.fillRect(x, y, 1, 1);
  }
}
const TREE_SPRITES = [
  [[13, 12, 10], [7, 16, 7], [19, 16, 7], [13, 6, 6]],
  [[13, 11, 9], [8, 15, 6], [18, 15, 6], [13, 18, 6]],
].map(blobs => makeSprite(26, 34, g => {
  g.fillStyle = '#4a321d'; g.fillRect(10, 22, 6, 12);
  g.fillStyle = '#6b4a2b'; g.fillRect(11, 22, 4, 11);
  g.fillStyle = '#8a6338'; g.fillRect(11, 23, 1, 9);
  blobPaint(g, blobs, 26, 26, { edge: '#22401f', hi: '#78b55a', mid: '#4f8a42', base: '#3c6e35', low: '#305a2c', lx: 13, ly: 11, lowY: 19 });
}));
const ROCK_SPRITES = [false, true].map(moss => makeSprite(16, 13, g => {
  blobPaint(g, [[8, 8, 6], [5, 9, 4], [11, 9, 4]], 16, 13, { edge: '#474c52', hi: '#bfc4c9', mid: '#959aa1', base: '#7b8087', low: '#666b72', lx: 7, ly: 6, lowY: 9 });
  if (moss) { g.fillStyle = '#6e8f4e'; [[6, 3], [7, 3], [8, 3], [5, 4], [9, 4], [7, 4]].forEach(([x, y]) => g.fillRect(x, y, 1, 1)); }
}));
const DARK_TREES = [
  [[13, 12, 10], [7, 16, 7], [19, 16, 7], [13, 6, 6]],
  [[13, 11, 9], [8, 15, 6], [18, 15, 6], [13, 18, 6]],
].map(blobs => makeSprite(26, 34, g => {
  g.fillStyle = '#3a2717'; g.fillRect(10, 22, 6, 12); g.fillStyle = '#583c23'; g.fillRect(11, 22, 4, 11);
  blobPaint(g, blobs, 26, 26, { edge: '#152a14', hi: '#4f8a42', mid: '#356a30', base: '#2a5527', low: '#1f421d', lx: 13, ly: 11, lowY: 19 });
}));
const DEAD_TREES = [0, 1].map(v => makeSprite(26, 34, g => {
  const c1 = '#4a3d33', c2 = '#6e5c4c';
  g.fillStyle = c1; g.fillRect(11, 12, 4, 22); g.fillStyle = c2; g.fillRect(12, 12, 1, 21);
  const br = v ? [[13, 14, -1, -1, 8], [13, 18, 1, -1, 9], [13, 10, 1, -1, 5]] : [[13, 13, 1, -1, 9], [13, 17, -1, -1, 9], [13, 9, -1, -1, 5]];
  for (const [x0, y0, dx, dy, n] of br) for (let i = 0; i < n; i++) { g.fillStyle = i % 3 ? c1 : c2; g.fillRect(x0 + dx * i, y0 + dy * Math.floor(i / 2), 2, 2); }
}));
const TOMBS = [0, 1].map(v => makeSprite(14, 18, g => {
  g.fillStyle = '#3e4246'; g.fillRect(1, 3, 12, 15); g.fillRect(3, 1, 8, 2);
  g.fillStyle = v ? '#8a8f95' : '#7d8288'; g.fillRect(2, 3, 10, 14); g.fillRect(4, 2, 6, 1);
  g.fillStyle = '#a9aeb3'; g.fillRect(3, 4, 2, 10);
  g.fillStyle = '#4f5459'; if (v) { g.fillRect(6, 5, 2, 8); g.fillRect(4, 7, 6, 2); } else { g.fillRect(4, 7, 6, 1); g.fillRect(4, 10, 6, 1); }
}));
// お城の柱の絵
const PILLAR = (c) => makeSprite(26, 34, g => {
  g.fillStyle = c.edge; g.fillRect(6, 2, 14, 4); g.fillRect(8, 6, 10, 24); g.fillRect(6, 29, 14, 5);
  g.fillStyle = c.base; g.fillRect(7, 3, 12, 2); g.fillRect(9, 6, 8, 23); g.fillRect(7, 30, 12, 3);
  g.fillStyle = c.hi; g.fillRect(10, 6, 2, 23); g.fillStyle = c.low; g.fillRect(15, 6, 2, 23);
});
const PILLARS = [PILLAR({ edge: '#3a3446', base: '#a59d8f', hi: '#c9c1b2', low: '#7d766a' }), PILLAR({ edge: '#3a3446', base: '#a59d8f', hi: '#c9c1b2', low: '#7d766a' })];
const DARK_PILLARS = [PILLAR({ edge: '#140f1a', base: '#4a3f58', hi: '#6a5c7c', low: '#33293f' }), PILLAR({ edge: '#140f1a', base: '#4a3f58', hi: '#6a5c7c', low: '#33293f' })];
const DARK_ROCKS = [0, 1].map(v => makeSprite(16, 13, g => {
  blobPaint(g, [[8, 8, 6], [5, 9, 4], [11, 9, 4]], 16, 13, { edge: '#140f1a', hi: '#7b6a8f', mid: '#54486a', base: '#3f3550', low: '#2e2640', lx: 7, ly: 6, lowY: 9 });
  if (v) { g.fillStyle = '#ff7a2a'; g.fillRect(7, 6, 1, 3); g.fillRect(8, 8, 1, 2); }
}));
const OB_SPRITES = {
  grass: { 1: ROCK_SPRITES, 2: TREE_SPRITES },
  forest: { 1: [ROCK_SPRITES[1], ROCK_SPRITES[1]], 2: DARK_TREES },
  grave: { 1: TOMBS, 2: DEAD_TREES },
  demon: { 1: DARK_ROCKS, 2: DARK_PILLARS },
  castle: { 1: ROCK_SPRITES, 2: PILLARS },
  village: { 1: ROCK_SPRITES, 2: TREE_SPRITES },
};
const HOUSE_SPRITES = [['#b3463c', '#7a2a24'], ['#3f6fb0', '#26467a'], ['#4f8a42', '#2f5a2a']].map(([roof, dark]) => makeSprite(48, 46, g => {
  g.fillStyle = '#5a4630'; g.fillRect(3, 20, 42, 26);                       // walls
  g.fillStyle = '#e8d8b0'; g.fillRect(4, 21, 40, 24);
  g.fillStyle = '#d4c294'; g.fillRect(4, 40, 40, 5);
  for (let y = 0; y < 20; y++) {                                              // roof
    const inset = Math.max(0, 14 - y);
    g.fillStyle = dark; g.fillRect(1 + inset, 2 + y, 46 - inset * 2, 1);
    g.fillStyle = roof; g.fillRect(2 + inset, 2 + y, 44 - inset * 2, 1);
    if (y % 4 === 3) { g.fillStyle = dark; g.fillRect(2 + inset, 2 + y, 44 - inset * 2, 1); }
  }
  g.fillStyle = '#6b4a2b'; g.fillRect(20, 31, 9, 15); g.fillStyle = '#4a321d'; g.fillRect(20, 31, 9, 1); g.fillStyle = '#e8c547'; g.fillRect(26, 38, 1, 1);  // door
  for (const wx of [8, 33]) { g.fillStyle = '#5a4630'; g.fillRect(wx, 26, 8, 8); g.fillStyle = '#9fd3ee'; g.fillRect(wx + 1, 27, 6, 6); g.fillStyle = '#5a4630'; g.fillRect(wx + 3, 27, 1, 6); g.fillRect(wx + 1, 29, 6, 1); }
}));

// ---- 当たり判定 --------------------------------------------------
// blocking boxes inside a tile (x0, y0, x1, y1)
const OB_BOX = { 1: [1, 4, 15, 15], 2: [4, 8, 12, 16], 3: [0, 0, 16, 16], 4: [0, 0, 16, 16] };   // 4: a maze wall of trees (no squeezing between them)
// その位置にある木・岩・壁（なければ 0）
function obstacleAt(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const o = obst[ty][tx]; if (!o) return false;
  const b = OB_BOX[o], lx = px - tx * TILE, ly = py - ty * TILE;
  return lx >= b[0] && lx < b[2] && ly >= b[1] && ly < b[3];
}
// その位置が陸で、木や岩がないか
function walkable(px, py) {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && land[ty][tx] && !obstacleAt(px, py);
}
function canStand(x, y) {   // small box around the feet
  return walkable(x - 5, y) && walkable(x + 5, y) && walkable(x - 5, y - 4) && walkable(x + 5, y - 4);
}
