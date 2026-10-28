// The farm's fixed buildings, interiors and set dressing.
import * as THREE from 'three';
import { BUILDINGS, FIXTURES, ROAD, PROPS, COMPOUND, PIPE_Y, SHED_ITEMS, roadPosts } from '../data/layout.js';
import { heightAt } from '../sim/terrain.js';
import { worldUV, mergeList, bx, cy, mk, wallGeo, textTexture } from './build-helpers.js';
import { addWind } from './materials.js';
import { truckModel, tractorModel, shippingBinModel, tankLadder } from './models.js';
import { model } from './assets.js';

export function buildEnvironment(scene, M) {
  const refs = { windows: [], lamps: [], screens: {} };
  const root = new THREE.Group();
  root.name = 'environment';
  scene.add(root);
  buildFarmhouse(root, M, refs);
  buildBarn(root, M, refs);
  buildShed(root, M, refs);
  buildProps(root, M, refs);
  return refs;
}

// ---------------------------------------------------------------------------
function buildFarmhouse(root, M, refs) {
  const H = BUILDINGS.farmhouse;
  const g = new THREE.Group();
  const base = H.baseY;
  g.position.set(H.x, base, H.z);
  root.add(g);
  const F = H.floor, W = H.w, D = H.d, WH = H.wallH, T = 0.22;

  // foundation & floor
  g.add(mk(worldUV(bx(W + 0.3, F + 0.6, D + 0.3, 0, (F - 0.6) / 2 - 0.01, 0), 1.6), M.stone));
  g.add(mk(worldUV(bx(W - 0.1, 0.06, D - 0.1, 0, F - 0.03, 0), 1.2), M.wood));

  // walls with openings (door & windows)
  const winW = 1.1, winB = 0.95, winT = 2.25;
  const sides = [
    { name: 'south', len: W, pos: [0, 0, D / 2], ry: 0 },
    { name: 'north', len: W, pos: [0, 0, -D / 2], ry: Math.PI },
    { name: 'east', len: D, pos: [W / 2, 0, 0], ry: Math.PI / 2 },
    { name: 'west', len: D, pos: [-W / 2, 0, 0], ry: -Math.PI / 2 },
  ];
  for (const s of sides) {
    const ops = [];
    if (H.door.side === s.name) ops.push({ offset: s.name === 'south' ? H.door.offset : -H.door.offset, width: H.door.width, bottom: 0, top: 2.25 });
    for (const w of H.windows.filter((q) => q.side === s.name)) ops.push({ offset: s.ry === Math.PI || s.ry === -Math.PI / 2 ? -w.offset : w.offset, width: winW, bottom: winB, top: winT });
    const outer = wallGeo(s.len + T, WH, T, ops);
    const inner = wallGeo(s.len - T, WH, 0.02, ops);
    inner.translate(0, 0, -T / 2 - 0.011);
    const wallGrp = new THREE.Group();
    wallGrp.position.set(s.pos[0], F, s.pos[2]);
    wallGrp.rotation.y = s.ry;
    wallGrp.add(mk(worldUV(outer, 2.4), M.siding));
    wallGrp.add(mk(worldUV(inner, 2.0), M.wallpaper, false, true));
    // trim: corner boards and base board
    wallGrp.add(mk(bx(s.len + T + 0.05, 0.18, T + 0.04, 0, 0.09, 0), M.trim));
    // windows
    for (const o of ops.filter((q) => q.bottom > 0)) {
      const frame = mergeList([
        bx(o.width + 0.16, 0.1, T + 0.08, o.offset, o.bottom - 0.05, 0), bx(o.width + 0.16, 0.12, T + 0.08, o.offset, o.top + 0.06, 0),
        bx(0.08, o.top - o.bottom, T + 0.08, o.offset - o.width / 2 - 0.04, (o.top + o.bottom) / 2, 0),
        bx(0.08, o.top - o.bottom, T + 0.08, o.offset + o.width / 2 + 0.04, (o.top + o.bottom) / 2, 0),
        bx(0.04, o.top - o.bottom, 0.05, o.offset, (o.top + o.bottom) / 2, 0.02),
        bx(o.width, 0.04, 0.05, o.offset, (o.top + o.bottom) / 2, 0.02),
      ]);
      wallGrp.add(mk(frame, M.trim));
      wallGrp.add(mk(bx(o.width, o.top - o.bottom, 0.02, o.offset, (o.top + o.bottom) / 2, 0), M.glass, false));
      const glow = mk(bx(o.width, o.top - o.bottom, 0.01, o.offset, (o.top + o.bottom) / 2, -0.04), M.windowLit, false, false);
      wallGrp.add(glow);
      // shutters
      const sh = mergeList([bx(0.42, o.top - o.bottom + 0.1, 0.04, o.offset - o.width / 2 - 0.3, (o.top + o.bottom) / 2, T / 2 + 0.03),
        bx(0.42, o.top - o.bottom + 0.1, 0.04, o.offset + o.width / 2 + 0.3, (o.top + o.bottom) / 2, T / 2 + 0.03)]);
      wallGrp.add(mk(sh, M.paintGreen));
    }
    g.add(wallGrp);
  }
  // corner posts
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) g.add(mk(bx(0.26, WH, 0.26, x, F + WH / 2, z), M.trim));

  // gable roof, ridge along x
  const RH = H.roofH, ov = 0.45;
  const half = D / 2 + ov;
  const slope = Math.atan2(RH, D / 2);
  const planeLen = Math.hypot(half, RH * (half / (D / 2)));
  for (const sgn of [1, -1]) {
    const roof = bx(W + ov * 2 + 0.3, 0.12, planeLen, 0, 0, 0);
    worldUV(roof, 2.2);
    const m = mk(roof, M.shingles);
    m.position.set(0, F + WH + RH / 2 - 0.02, sgn * (half / 2 - ov / 2 + 0.05));
    m.rotation.x = sgn * slope;
    g.add(m);
  }
  g.add(mk(bx(W + ov * 2 + 0.35, 0.16, 0.22, 0, F + WH + RH + 0.04, 0), M.trimDark)); // ridge cap
  // gable ends (triangles)
  const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, RH)]);
  for (const sgn of [1, -1]) {
    const gg = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false });
    gg.rotateY(Math.PI / 2);
    gg.translate(sgn * W / 2 - T / 2, F + WH, 0);
    worldUV(gg, 2.4);
    g.add(mk(gg, M.siding));
  }
  // ceiling
  g.add(mk(worldUV(bx(W - 0.3, 0.05, D - 0.3, 0, F + WH - 0.02, 0), 1.5), M.wood, false, true));
  // chimney
  g.add(mk(worldUV(bx(0.9, RH + 1.0, 0.9, W / 2 - 1.6, F + WH + (RH + 1.0) / 2, -1.2), 1.2), M.stone));

  // porch
  const PD = H.porch.depth;
  const porch = new THREE.Group();
  porch.position.set(0, 0, D / 2);
  porch.add(mk(worldUV(bx(W, 0.12, PD, 0, F - 0.06, PD / 2), 1.2), M.wood));
  porch.add(mk(worldUV(bx(W, F - 0.12, PD - 0.1, 0, (F - 0.12) / 2 - 0.05, PD / 2), 1.6), M.stone));
  // steps in front of door
  porch.add(mk(worldUV(bx(1.6, 0.18, 0.4, H.door.offset, 0.09, PD + 0.2), 1), M.wood));
  porch.add(mk(worldUV(bx(1.6, 0.36, 0.4, H.door.offset, 0.18, PD - 0.1 + 0.0001), 1), M.wood));
  for (const px of [-W / 2 + 0.3, -0.8, W / 2 - 0.3]) porch.add(mk(bx(0.16, 2.9, 0.16, px, F + 1.45, PD - 0.25), M.trim));
  const pr = bx(W + 0.4, 0.08, PD + 0.4, 0, F + 2.95, PD / 2 - 0.05, 0.14);
  porch.add(mk(worldUV(pr, 2), M.metalRoof));
  // railing
  for (const [x0, x1] of [[-W / 2 + 0.3, H.door.offset - 0.9], [H.door.offset + 0.9, -0.8], [-0.8, W / 2 - 0.3]]) {
    if (x1 - x0 < 0.3) continue;
    porch.add(mk(bx(x1 - x0, 0.07, 0.07, (x0 + x1) / 2, F + 0.9, PD - 0.25), M.trim));
    for (let x = x0 + 0.15; x < x1; x += 0.25) porch.add(mk(bx(0.04, 0.85, 0.04, x, F + 0.47, PD - 0.25), M.trim, false));
  }
  // porch lamp
  const lampPos = new THREE.Vector3(H.door.offset + 0.9, F + 2.3, 0.18);
  porch.add(mk(bx(0.18, 0.28, 0.12, lampPos.x, lampPos.y, lampPos.z), M.darkSteel));
  const bulb = mk(new THREE.SphereGeometry(0.07, 10, 8).translate(lampPos.x, lampPos.y - 0.1, lampPos.z + 0.08), M.lampOn, false, false);
  porch.add(bulb);
  refs.lamps.push({ pos: new THREE.Vector3(H.x + lampPos.x, base + lampPos.y - 0.15, H.z + D / 2 + lampPos.z + 0.25), kind: 'porch' });
  // rocking chair (PROPS.rockingChair, on the porch boards, facing the yard)
  { const c = PROPS.rockingChair, ch = model('rockingchair');
    if (ch) { ch.position.set(c.x - H.x, F, c.z - H.z - D / 2); ch.rotation.y = c.rot; porch.add(ch); }
    else porch.add(mk(mergeList([bx(0.55, 0.06, 0.5, 2.6, F + 0.45, 1.2), bx(0.55, 0.7, 0.06, 2.6, F + 0.8, 0.95, -0.2), bx(0.06, 0.06, 0.8, 2.35, F + 0.1, 1.2), bx(0.06, 0.06, 0.8, 2.85, F + 0.1, 1.2)]), M.wood)); }
  g.add(porch);

  // door (pivot at hinge)
  const doorPivot = new THREE.Group();
  const dW = H.door.width;
  doorPivot.position.set(H.door.offset - dW / 2, F, D / 2);
  const slab = mk(mergeList([bx(dW - 0.04, 2.2, 0.06, dW / 2, 1.1, 0), bx(dW - 0.3, 0.8, 0.02, dW / 2, 1.55, 0.035), bx(dW - 0.3, 0.7, 0.02, dW / 2, 0.55, 0.035)]), M.paintGreen);
  doorPivot.add(slab);
  doorPivot.add(mk(new THREE.SphereGeometry(0.04, 8, 6).translate(dW - 0.14, 1.05, 0.06), M.steel, false));
  g.add(doorPivot);
  refs.houseDoor = doorPivot;
  // door frame
  g.add(mk(mergeList([bx(0.1, 2.3, T + 0.06, H.door.offset - dW / 2 - 0.05, F + 1.15, D / 2), bx(0.1, 2.3, T + 0.06, H.door.offset + dW / 2 + 0.05, F + 1.15, D / 2), bx(dW + 0.2, 0.12, T + 0.06, H.door.offset, F + 2.31, D / 2)]), M.trim));

  // interior
  const I = new THREE.Group();
  g.add(I);
  const L = (x, z) => [x - H.x, z - H.z];
  // rug
  I.add(mk(bx(3.2, 0.012, 2.2, 0.5, F + 0.008, 1.0), M.flannel, false));
  // bed
  {
    const [x, z] = L(FIXTURES.bed.x, FIXTURES.bed.z);
    const bed = model('bed');   // headboard against the north wall (-z)
    if (bed) { bed.position.set(x, F, z); I.add(bed); }
    else {
      I.add(mk(mergeList([bx(2.0, 0.35, 2.3, x, F + 0.25, z), bx(2.0, 0.9, 0.08, x, F + 0.5, z - 1.15), bx(2.0, 0.55, 0.08, x, F + 0.3, z + 1.15)]), M.woodDark));
      I.add(mk(bx(1.85, 0.2, 2.1, x, F + 0.52, z), M.white));
      I.add(mk(bx(1.9, 0.08, 1.5, x, F + 0.64, z + 0.3), M.flannel));
      I.add(mk(bx(0.6, 0.12, 0.35, x - 0.45, F + 0.68, z - 0.8), M.white));
      I.add(mk(bx(0.6, 0.12, 0.35, x + 0.45, F + 0.68, z - 0.8), M.white));
    }
  }
  // desk with laptop & monitor
  {
    const x = 5.2, z = -3.5; // desk body (FURNITURE)
    I.add(mk(mergeList([bx(2.4, 0.06, 0.9, x, F + 0.78, z), bx(0.06, 0.75, 0.8, x - 1.15, F + 0.38, z), bx(0.06, 0.75, 0.8, x + 1.15, F + 0.38, z), bx(0.6, 0.6, 0.8, x + 0.8, F + 0.42, z)]), M.wood));
    const [lx, lz] = L(FIXTURES.desk.x, FIXTURES.desk.z);
    I.add(mk(bx(0.42, 0.025, 0.3, lx, F + 0.83, lz + 0.05), M.darkSteel));
    const scr = new THREE.MeshStandardMaterial({ color: 0x05070a, emissive: 0x8fb4e8, emissiveIntensity: 0.0, roughness: 0.2 });
    const screen = mk(bx(0.4, 0.27, 0.012, lx, F + 0.97, lz - 0.1, -0.25), scr, false);
    I.add(mk(bx(0.42, 0.29, 0.02, lx, F + 0.97, lz - 0.115, -0.25), M.darkSteel));
    I.add(screen);
    refs.screens.laptop = scr;
    const [mx, mz] = L(FIXTURES.monitor.x, FIXTURES.monitor.z);
    I.add(mk(bx(0.5, 0.42, 0.42, mx, F + 1.03, mz - 0.1), M.white));
    const mon = new THREE.MeshStandardMaterial({ color: 0x050a05, emissive: 0x6fe08a, emissiveIntensity: 0.0, roughness: 0.3 });
    I.add(mk(bx(0.4, 0.3, 0.01, mx, F + 1.04, mz + 0.115), mon, false));
    refs.screens.monitor = mon;
    // chair
    I.add(mk(mergeList([bx(0.5, 0.05, 0.5, x - 0.3, F + 0.48, z + 0.8), bx(0.5, 0.6, 0.05, x - 0.3, F + 0.78, z + 1.05)]), M.wood));
  }
  // kitchen table with letter & chairs
  {
    const [x, z] = L(FIXTURES.table.x, FIXTURES.table.z);
    I.add(mk(mergeList([bx(1.6, 0.06, 1.1, x, F + 0.78, z), ...[[-0.7, -0.45], [0.7, -0.45], [-0.7, 0.45], [0.7, 0.45]].map(([a, b]) => bx(0.07, 0.76, 0.07, x + a, F + 0.38, z + b))]), M.wood));
    I.add(mk(bx(0.24, 0.005, 0.32, x + 0.2, F + 0.815, z + 0.1, 0, 0.3), M.paper, false));
    I.add(mk(cy(0.05, 0.04, 0.1, 10, x - 0.3, F + 0.86, z - 0.1), M.white, false));
    for (const dz of [-0.85, 0.85]) I.add(mk(mergeList([bx(0.45, 0.05, 0.45, x, F + 0.46, z + dz), bx(0.45, 0.55, 0.05, x, F + 0.74, z + dz * 1.25)]), M.wood));
  }
  // dresser
  {
    const [x, z] = L(FIXTURES.drawer.x, FIXTURES.drawer.z);
    I.add(mk(bx(0.55, 0.95, 1.2, x - 0.35, F + 0.48, z), M.woodDark));
    for (const yy of [0.3, 0.6]) I.add(mk(bx(0.02, 0.22, 1.05, x - 0.06, F + yy, z), M.wood, false));
    I.add(mk(cy(0.07, 0.1, 0.3, 10, x - 0.35, F + 1.1, z + 0.3), M.white));
    I.add(mk(cy(0.15, 0.2, 0.2, 12, x - 0.35, F + 1.35, z + 0.3), M.paper));
  }
  // stove & cupboards on east wall
  I.add(mk(bx(0.8, 0.9, 0.7, W / 2 - 0.55, F + 0.45, 2.2), M.black));
  I.add(mk(worldUV(bx(0.6, 0.9, 2.4, W / 2 - 0.45, F + 0.45, 0.4), 1), M.wood));
  I.add(mk(worldUV(bx(0.4, 0.7, 2.4, W / 2 - 0.35, F + 2.0, 0.4), 1), M.wood));
  // ceiling lamp
  I.add(mk(cy(0.02, 0.02, 0.5, 6, 0, F + WH - 0.27, -0.5), M.black, false));
  const ceil = mk(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI).translate(0, F + WH - 0.5, -0.5), M.lampOn, false, false);
  I.add(ceil);
  refs.lamps.push({ pos: new THREE.Vector3(H.x, base + F + WH - 0.75, H.z - 0.5), kind: 'house' });
}

// ---------------------------------------------------------------------------
function buildBarn(root, M, refs) {
  const B = BUILDINGS.barn;
  const g = new THREE.Group();
  g.position.set(B.x, B.baseY, B.z);
  root.add(g);
  const W = B.w, D = B.d, WH = B.wallH, RH = B.roofH, T = 0.25;
  g.add(mk(worldUV(bx(W + 0.2, 0.6, D + 0.2, 0, -0.2, 0), 1.6), M.concrete));
  g.add(mk(worldUV(bx(W - 0.2, 0.05, D - 0.2, 0, 0.11, 0), 1.6), M.wood, false, true));
  const dW = B.door.width;
  const walls = [
    { len: D, pos: [-W / 2, 0], ry: -Math.PI / 2, ops: [{ offset: 0, width: dW, bottom: 0, top: 3.9 }, { offset: -5.6, width: 1.2, bottom: 2.0, top: 3.0 }, { offset: 5.6, width: 1.2, bottom: 2.0, top: 3.0 }] },
    { len: D, pos: [W / 2, 0], ry: Math.PI / 2, ops: [{ offset: -4.5, width: 1.4, bottom: 2.2, top: 3.3 }, { offset: 4.5, width: 1.4, bottom: 2.2, top: 3.3 }] },
    { len: W, pos: [0, D / 2], ry: 0, ops: [] },
    { len: W, pos: [0, -D / 2], ry: Math.PI, ops: [] },
  ];
  for (const w of walls) {
    const geo = wallGeo(w.len + T, WH, T, w.ops);
    const m = mk(worldUV(geo, 3.2), M.barn);
    m.position.set(w.pos[0], 0.1, w.pos[1]);
    m.rotation.y = w.ry;
    g.add(m);
    // white trim at top
    const tr = mk(bx(w.len + T + 0.1, 0.22, T + 0.06, 0, WH, 0), M.trim);
    tr.position.copy(m.position); tr.rotation.y = w.ry; g.add(tr);
    // window & door frames, glazing
    const fr = new THREE.Group(); fr.position.copy(m.position); fr.rotation.y = w.ry; g.add(fr);
    for (const o of w.ops) {
      const top = o.top, bot = o.bottom, hw = o.width / 2, z = T / 2 + 0.03;
      fr.add(mk(mergeList([bx(o.width + 0.24, 0.12, 0.06, o.offset, top + 0.06, z), bx(0.12, top - bot, 0.06, o.offset - hw - 0.06, (top + bot) / 2, z), bx(0.12, top - bot, 0.06, o.offset + hw + 0.06, (top + bot) / 2, z)].concat(bot > 0 ? [bx(o.width + 0.24, 0.1, 0.1, o.offset, bot - 0.04, z + 0.02), bx(0.05, top - bot, 0.04, o.offset, (top + bot) / 2, 0), bx(o.width, 0.05, 0.04, o.offset, (top + bot) / 2, 0)] : [])), M.trim));
      if (bot > 0) fr.add(mk(bx(o.width, top - bot, 0.015, o.offset, (top + bot) / 2, -0.02), M.glass, false));
    }
  }
  // gambrel roof (ridge along z)
  const pts = [[-W / 2 - 0.45, WH - 0.1], [-W / 2 * 0.58, WH + RH * 0.66], [0, WH + RH], [W / 2 * 0.58, WH + RH * 0.66], [W / 2 + 0.45, WH - 0.1]];
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const geo = bx(len, 0.12, D + 1.0, 0, 0, 0);
    worldUV(geo, 2.4);
    const m = mk(geo, M.metalRoof);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.06, 0);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    g.add(m);
  }
  // gable ends (pentagon)
  const shape = new THREE.Shape(pts.slice(0).map(([x, y]) => new THREE.Vector2(x * 0.97, y - WH + 0.1)));
  for (const sgn of [1, -1]) {
    const gg = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    gg.translate(0, WH, sgn * D / 2 - T / 2);
    worldUV(gg, 3.2);
    g.add(mk(gg, M.barn));
    // hayloft door
    g.add(mk(mergeList([bx(1.8, 1.8, 0.05, 0, WH + 1.2, sgn * (D / 2 + 0.155))]), M.barn));
    g.add(mk(mergeList([bx(2.0, 0.12, 0.06, 0, WH + 2.15, sgn * (D / 2 + 0.16)), bx(2.0, 0.12, 0.06, 0, WH + 0.25, sgn * (D / 2 + 0.16)), bx(0.12, 2.0, 0.06, -0.95, WH + 1.2, sgn * (D / 2 + 0.16)), bx(0.12, 2.0, 0.06, 0.95, WH + 1.2, sgn * (D / 2 + 0.16)), bx(2.5, 0.1, 0.04, 0, WH + 1.2, sgn * (D / 2 + 0.2), 0, 0, 0.78), bx(2.5, 0.1, 0.04, 0, WH + 1.2, sgn * (D / 2 + 0.21), 0, 0, -0.78)]), M.trim));
  }
  // cupola
  g.add(mk(worldUV(bx(1.4, 1.2, 1.4, 0, WH + RH + 0.55, 0), 1.2), M.barn));
  g.add(mk(new THREE.ConeGeometry(1.15, 0.9, 4).rotateY(Math.PI / 4).translate(0, WH + RH + 1.6, 0), M.metalRoof));
  g.add(mk(cy(0.02, 0.02, 1.2, 4, 0, WH + RH + 2.4, 0), M.darkSteel));
  // sliding doors on track (two leaves)
  const track = mk(bx(0.12, 0.12, dW * 2 + 1, -W / 2 - 0.25, 4.05, 0), M.darkSteel);
  g.add(track);
  const leaves = [];
  for (const sgn of [-1, 1]) {
    const leaf = new THREE.Group();
    const geo = worldUV(bx(0.1, 3.85, dW / 2 + 0.05, 0, 1.98, 0), 3.2);
    leaf.add(mk(geo, M.barn));
    // white frame and X-brace on the OUTSIDE face of the leaf (outside is -x)
    const L2 = dW / 2 + 0.05, diag = Math.hypot(L2 - 0.2, 3.5), ang = Math.atan2(L2 - 0.2, 3.5);
    leaf.add(mk(mergeList([bx(0.06, 0.16, L2, -0.075, 3.82, 0), bx(0.06, 0.16, L2, -0.075, 0.18, 0), bx(0.06, 3.85, 0.14, -0.075, 1.98, L2 / 2 - 0.07), bx(0.06, 3.85, 0.14, -0.075, 1.98, -L2 / 2 + 0.07),
      bx(0.05, diag, 0.14, -0.08, 1.98, 0, ang), bx(0.05, diag, 0.14, -0.085, 1.98, 0, -ang)]), M.trim));
    leaf.add(mk(mergeList([cy(0.07, 0.07, 0.05, 12, 0, 3.98, L2 / 2 - 0.25, 0, Math.PI / 2), cy(0.07, 0.07, 0.05, 12, 0, 3.98, -L2 / 2 + 0.25, 0, Math.PI / 2), bx(0.04, 0.5, 0.04, -0.13, 1.3, sgn > 0 ? -L2 / 2 + 0.25 : L2 / 2 - 0.25)]), M.darkSteel));
    leaf.position.set(-W / 2 - 0.2, 0.1, sgn * dW / 4);
    leaf.userData.closedZ = sgn * dW / 4;
    leaf.userData.openZ = sgn * (dW / 4 + dW / 2);
    g.add(leaf);
    leaves.push(leaf);
  }
  refs.barnDoor = leaves;
  // interior: hay, bins, workbench, crates
  const hayBale = (x, y, z, r = 0) => g.add(mk(bx(1.2, 0.5, 0.55, x, y, z, 0, r), M.hay));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) hayBale(W / 2 - 1.0, 0.36 + j * 0.5, -D / 2 + 1.2 + i * 0.62, 0);
  hayBale(W / 2 - 2.3, 0.36, -D / 2 + 1.2, 0.1);
  // storage bins (FIXTURES.storage)
  const sx = FIXTURES.storage.x - B.x, sz = FIXTURES.storage.z - B.z;
  g.add(mk(worldUV(mergeList([bx(4.8, 0.08, 1.4, sx + 2.5, 0.2, sz + 1.5), bx(4.8, 1.1, 0.08, sx + 2.5, 0.7, sz + 2.2), bx(4.8, 0.7, 0.08, sx + 2.5, 0.5, sz + 0.8), bx(0.08, 1.1, 1.4, sx + 0.1, 0.7, sz + 1.5), bx(0.08, 1.1, 1.4, sx + 1.7, 0.7, sz + 1.5), bx(0.08, 1.1, 1.4, sx + 3.3, 0.7, sz + 1.5), bx(0.08, 1.1, 1.4, sx + 4.9, 0.7, sz + 1.5)]), 1.2), M.wood));
  refs.binFill = [];
  for (let i = 0; i < 3; i++) {
    const fill = mk(bx(1.5, 0.5, 1.2, sx + 0.9 + i * 1.6, 0.45, sz + 1.5), M.hay, false);
    fill.scale.y = 0.01; fill.visible = false;
    g.add(fill); refs.binFill.push(fill);
  }
  // workbench with tools
  const wx = FIXTURES.workbench.x - B.x, wz = FIXTURES.workbench.z - B.z;
  g.add(mk(worldUV(mergeList([bx(2.6, 0.08, 0.9, wx, 0.95, wz - 0.05), bx(0.08, 0.9, 0.8, wx - 1.2, 0.5, wz), bx(0.08, 0.9, 0.8, wx + 1.2, 0.5, wz), bx(2.6, 1.4, 0.05, wx, 1.7, wz - 0.48)]), 1.2), M.wood));
  g.add(mk(mergeList([bx(0.35, 0.18, 0.2, wx - 0.6, 1.08, wz), cy(0.05, 0.05, 0.3, 8, wx + 0.4, 1.05, wz, 0, Math.PI / 2)]), M.paintGreen));
  for (let i = 0; i < 5; i++) g.add(mk(bx(0.05, 0.5, 0.03, wx - 0.9 + i * 0.4, 1.7, wz - 0.44), i % 2 ? M.steel : M.woodDark, false));
  // crates & ledger
  const cx = FIXTURES.ledgerCrate.x - B.x, cz = FIXTURES.ledgerCrate.z - B.z;
  g.add(mk(worldUV(mergeList([bx(0.9, 0.7, 0.9, cx, 0.45, cz), bx(0.9, 0.7, 0.9, cx + 1.0, 0.45, cz - 0.1), bx(0.8, 0.6, 0.8, cx + 0.5, 1.1, cz - 0.05)]), 0.9), M.wood));
  g.add(mk(bx(0.32, 0.06, 0.24, cx, 0.83, cz, 0, 0.4), M.woodDark));
  // lantern hanging
  refs.lamps.push({ pos: new THREE.Vector3(B.x, B.baseY + 3.6, B.z - 2), kind: 'barn' });
  g.add(mk(cy(0.012, 0.012, 1.3, 4, 0, WH - 0.65, -2), M.black, false));
  g.add(mk(new THREE.SphereGeometry(0.12, 10, 8).translate(0, WH - 1.4, -2), M.lampOn, false, false));
}

// ---------------------------------------------------------------------------
function buildShed(root, M) {
  const S = BUILDINGS.shed;
  const g = new THREE.Group();
  g.position.set(S.x, S.baseY, S.z);
  root.add(g);
  const W = S.w, D = S.d, WH = S.wallH, T = 0.18;
  g.add(mk(worldUV(bx(W, 0.3, D, 0, 0, 0), 1.4), M.concrete));
  const walls = [
    { len: W, pos: [0, D / 2], ry: 0, ops: [{ offset: S.door.offset, width: S.door.width, bottom: 0, top: 2.1 }] },
    { len: W, pos: [0, -D / 2], ry: Math.PI, ops: [] },
    { len: D, pos: [W / 2, 0], ry: Math.PI / 2, ops: [] },
    { len: D, pos: [-W / 2, 0], ry: -Math.PI / 2, ops: [] },
  ];
  for (const w of walls) {
    // the lean-to roof is 0.9 m higher at the back: the north wall goes up to meet it
    const m = mk(worldUV(wallGeo(w.len + T, WH + (w.pos[1] < 0 ? 0.9 : 0), T, w.ops), 2), M.wood);
    m.position.set(w.pos[0], 0.15, w.pos[1]); m.rotation.y = w.ry; g.add(m);
  }
  const roof = bx(W + 0.8, 0.08, D + 0.8, 0, WH + 0.6, 0, 0.2);
  g.add(mk(worldUV(roof, 2), M.metalRoof));
  // gable fill (sloped top)
  for (const sgn of [-1, 1]) {
    const sh = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(-D / 2, 0.9)]);
    const gg = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false });
    gg.rotateY(Math.PI / 2); gg.translate(sgn * W / 2 - T / 2, WH + 0.15, 0);
    g.add(mk(worldUV(gg, 2), M.wood));
  }
  // jerrycans & shelf
  const red = new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.5, metalness: 0.2 });
  // jerrycans stand on the slab (top of slab = 0.15)
  for (const c of SHED_ITEMS.cans) g.add(mk(mergeList([bx(0.35, 0.45, 0.17, c.x, 0.15 + 0.225, c.z), bx(0.12, 0.05, 0.04, c.x, 0.15 + 0.475, c.z), bx(0.03, 0.12, 0.03, c.x + 0.12, 0.15 + 0.5, c.z)]), red));
  // shelf unit: four uprights and three boards, standing on the slab
  { const sh = SHED_ITEMS.shelf, y0 = 0.15, parts = [];
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(bx(0.05, sh.h, 0.05, sh.x + dx * (sh.w / 2 - 0.03), y0 + sh.h / 2, sh.z + dz * (sh.d / 2 - 0.03)));
    for (const y of [0.3, 0.95, 1.6]) parts.push(bx(sh.w, 0.04, sh.d, sh.x, y0 + y, sh.z));
    g.add(mk(worldUV(mergeList(parts), 1), M.wood));
    // stock on the shelves: oil cans and a toolbox
    g.add(mk(mergeList([cy(0.08, 0.08, 0.22, 10, sh.x - 0.7, y0 + 1.08, sh.z), cy(0.08, 0.08, 0.22, 10, sh.x - 0.45, y0 + 1.08, sh.z), bx(0.5, 0.2, 0.25, sh.x + 0.5, y0 + 1.07, sh.z), bx(0.4, 0.3, 0.3, sh.x + 0.2, y0 + 0.47, sh.z)]), M.paintGreen)); }
}

// ---------------------------------------------------------------------------
function buildProps(root, M, refs) {
  const at = (x, z) => heightAt(x, z);
  const H = BUILDINGS.farmhouse;
  // ---- water system: tanks, pump house, pipes
  const galv = new THREE.MeshStandardMaterial({ map: M.tex.metal.map, normalMap: M.tex.metal.normalMap, color: 0xb6bcc0, roughness: 0.45, metalness: 0.7 });
  for (const t of PROPS.tanks) {
    const y = at(t.x, t.z);
    const body = new THREE.CylinderGeometry(t.r, t.r, t.h, 28, 1);
    body.translate(t.x, y + t.h / 2, t.z);
    const uv = body.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 2);
    root.add(mk(body, galv));
    root.add(mk(new THREE.ConeGeometry(t.r + 0.1, 0.6, 28).translate(t.x, y + t.h + 0.3, t.z), M.steel));
    root.add(mk(cy(t.r + 0.25, t.r + 0.3, 0.25, 28, t.x, y + 0.1, t.z), M.concrete));
    const lad = tankLadder(t.r, t.h); lad.position.set(t.x, y, t.z); lad.rotation.y = Math.PI / 2; root.add(lad);
    // outlet from the tank wall down into the ground main (x = -23)
    root.add(mk(mergeList([cy(0.07, 0.07, 0.5, 10, t.x - t.r - 0.2, y + PIPE_Y, t.z, 0, Math.PI / 2), cy(0.1, 0.1, 0.08, 10, t.x - t.r + 0.02, y + PIPE_Y, t.z, 0, Math.PI / 2)]), M.steel));
  }
  {
    const p = PROPS.pumpHouse, y = at(p.x, p.z);
    root.add(mk(worldUV(bx(p.w, p.h, p.d, p.x, y + p.h / 2, p.z), 1.6), M.wood));
    root.add(mk(worldUV(bx(p.w + 0.6, 0.08, p.d + 0.6, p.x, y + p.h + 0.15, p.z, 0.12), 1.5), M.metalRoof));
    root.add(mk(bx(0.9, 1.8, 0.05, p.x, y + 0.9, p.z - p.d / 2 - 0.02), M.woodDark));
    // water main from the pond pump to the tanks, laid along the ground on
    // concrete saddles; short straight lengths follow the terrain
    const pipe = [], saddles = [];
    for (const [x0, z0, x1, z1] of PROPS.pipes) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.0));
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const pts = [];
      for (let i = 0; i <= n; i++) { const x = x0 + ux * len * i / n, z = z0 + uz * len * i / n; pts.push(new THREE.Vector3(x, at(x, z) + PIPE_Y, z)); }
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1], d = b.clone().sub(a), L = d.length();
        const g = new THREE.CylinderGeometry(0.09, 0.09, L + 0.02, 10, 1, true);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        pipe.push(g);
        if (i % 2 === 0) saddles.push(bx(0.3, PIPE_Y, 0.22, a.x, at(a.x, a.z) + PIPE_Y / 2 - 0.02, a.z, 0, -Math.atan2(uz, ux) + Math.PI / 2));
      }
      for (const q of [pts[0], pts[n]]) { // flanged ends
        const f = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
        f.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uz)));
        f.translate(q.x, q.y, q.z); pipe.push(f);
      }
    }
    root.add(mk(mergeList(pipe), M.steel));
    root.add(mk(worldUV(mergeList(saddles), 0.8), M.concrete));
  }
  // ---- pump at the pond & trough
  {
    const { x, z } = FIXTURES.well;
    const y = at(x, z);
    root.add(mk(worldUV(mergeList([bx(1.6, 0.08, 0.6, x + 0.2, y + 0.3, z + 1.05), bx(1.6, 0.45, 0.06, x + 0.2, y + 0.5, z + 0.78), bx(1.6, 0.45, 0.06, x + 0.2, y + 0.5, z + 1.32), bx(0.06, 0.45, 0.6, x - 0.58, y + 0.5, z + 1.05), bx(0.06, 0.45, 0.6, x + 0.98, y + 0.5, z + 1.05)]), 1), M.wood));
    const water = new THREE.MeshStandardMaterial({ color: 0x1f2b2a, roughness: 0.05, metalness: 0.1 });
    root.add(mk(bx(1.45, 0.02, 0.48, x + 0.2, y + 0.62, z + 1.05), water, false));
    root.add(mk(cy(0.16, 0.13, 0.3, 12, x - 0.9, y + 0.15, z + 0.4), M.steel));
    // little dock into the pond
    { const d = PROPS.dock; const dk = new THREE.Group(); dk.position.set(d.x, at(d.x, d.z), d.z); dk.rotation.y = d.rot;
      const planks = []; for (let i = 0; i < 12; i++) planks.push(bx(d.w, 0.05, d.d / 12 - 0.03, 0, 0.18, -d.d / 2 + (i + 0.5) * d.d / 12));
      dk.add(mk(worldUV(mergeList(planks), 1.2), M.wood));
      dk.add(mk(mergeList([cy(0.07, 0.07, 1.2, 8, -d.w / 2, -0.35, d.d / 2 - 0.2), cy(0.07, 0.07, 1.2, 8, d.w / 2, -0.35, d.d / 2 - 0.2), cy(0.07, 0.07, 1.2, 8, -d.w / 2, -0.35, -0.5), cy(0.07, 0.07, 1.2, 8, d.w / 2, -0.35, -0.5)]), M.woodDark));
      root.add(dk); }
  }
  // ---- generator yard: gravel pad edging, spare concrete pads, fuel drums
  for (const g of PROPS.genPads) root.add(mk(worldUV(bx(2.6, 0.18, 1.8, g.x, at(g.x, g.z) + 0.04, g.z), 1.3), M.concrete));
  root.add(mk(worldUV(bx(2.6, 0.18, 1.8, 40, at(40, -46) + 0.02, -46), 1.3), M.concrete));
  const drum = new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.5, metalness: 0.4 });
  for (const d of PROPS.drums) root.add(mk(mergeList([cy(0.3, 0.3, 0.9, 18, d.x, at(d.x, d.z) + 0.45, d.z), cy(0.305, 0.305, 0.03, 18, d.x, at(d.x, d.z) + 0.3, d.z), cy(0.305, 0.305, 0.03, 18, d.x, at(d.x, d.z) + 0.6, d.z)]), drum));
  // ---- storage yard: crates, barrels
  for (const c of PROPS.crates) root.add(mk(worldUV(bx(c.w, 1.1, c.d, c.x, at(c.x, c.z) + 0.55, c.z), 0.9), M.wood));
  { const c = PROPS.stackedCrate; root.add(mk(worldUV(bx(c.s, c.h, c.s, c.x, at(41, 8) + 1.1 + c.h / 2, c.z, 0, c.rot), 0.9), M.wood)); }
  const barrel = new THREE.MeshStandardMaterial({ color: 0x31475a, roughness: 0.55, metalness: 0.5 });
  for (const b of PROPS.barrels) root.add(mk(cy(0.32, 0.32, 0.92, 14, b.x, at(b.x, b.z) + 0.46, b.z), barrel));
  // ---- old pickup by the house, rusted tractor by the barn
  { const t = model('truck') || truckModel(); t.position.set(PROPS.truck.x, at(PROPS.truck.x, PROPS.truck.z), PROPS.truck.z); t.rotation.y = PROPS.truck.rot; root.add(t); }
  { const t = tractorModel(); t.position.set(PROPS.tractor.x, at(PROPS.tractor.x, PROPS.tractor.z), PROPS.tractor.z); t.rotation.y = PROPS.tractor.rot; root.add(t); }
  // round hay bales near the pen
  for (const b of PROPS.bales) {
    const bale = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 24, 3); bale.rotateZ(Math.PI / 2);
    const m = mk(bale, M.hay); m.position.set(b.x, at(b.x, b.z) + 0.72, b.z); m.rotation.y = b.rot; root.add(m);
    const wrap = mk(mergeList([cy(0.765, 0.765, 0.04, 24, -0.3, 0, 0, 0, Math.PI / 2), cy(0.765, 0.765, 0.04, 24, 0.3, 0, 0, 0, Math.PI / 2)]), M.cloth, false);
    wrap.position.copy(m.position); wrap.rotation.y = b.rot; root.add(wrap);
  }
  // woodpile against the house
  {
    const parts = [];
    const x0 = PROPS.woodpile.x, z0 = PROPS.woodpile.z;
    for (let r = 0; r < 4; r++) for (let i = 0; i < 7 - r; i++) parts.push(cy(0.11, 0.11, 0.9, 7, x0, 0.12 + r * 0.2, z0 - 0.7 + i * 0.22 + r * 0.1, Math.PI / 2));
    const m = mk(mergeList(parts), M.bark); m.position.y = at(x0, z0); root.add(m);
  }
  // clothesline west of the house
  {
    const x0 = PROPS.clothesline.x, z0 = PROPS.clothesline.z0, z1 = PROPS.clothesline.z1;
    const y = at(x0, z0);
    root.add(mk(mergeList([cy(0.05, 0.06, 2.2, 6, x0, y + 1.1, z0), cy(0.05, 0.06, 2.2, 6, x0, y + 1.1, z1), bx(0.06, 0.06, 1.2, x0, y + 2.1, z0, 0, Math.PI / 2), bx(0.06, 0.06, 1.2, x0, y + 2.1, z1, 0, Math.PI / 2)]), M.woodDark));
    root.add(mk(cy(0.006, 0.006, z1 - z0, 3, x0, y + 2.1, (z0 + z1) / 2, Math.PI / 2), M.black, false));
    const cloth = addWind(new THREE.MeshStandardMaterial({ color: 0xd8d3c4, roughness: 0.9, side: THREE.DoubleSide }), { strength: 1.5, heightScale: -1.2, instanced: false, flutter: 0.04 });
    for (const [zz, w] of [[z0 + 2, 1.4], [z0 + 4.2, 1.2], [z0 + 6.8, 1.6]]) {
      const geo = new THREE.PlaneGeometry(w, 1.1, 6, 6); geo.rotateY(Math.PI / 2); geo.translate(0, -0.55, 0);
      const m = mk(geo, cloth); m.position.set(x0, y + 2.08, zz); root.add(m);
    }
  }
  // fire pit seating logs
  for (const l of PROPS.logs) {
    const m = mk(cy(0.22, 0.24, 1.8, 10, 0, 0, 0, 0, Math.PI / 2), M.bark);
    m.position.set(l.x, at(l.x, l.z) + 0.22, l.z); m.rotation.y = l.rot; root.add(m); // same rotation as its collider
  }
  // shipping bin
  { const { x, z } = FIXTURES.shippingBin; const g = shippingBinModel(M); g.position.set(x, at(x, z), z); g.rotation.y = Math.PI / 2; root.add(g); }
  // mailbox with flag, by the road
  {
    const { x, z } = FIXTURES.mailbox;
    const y = at(x, z);
    root.add(mk(bx(0.1, 1.1, 0.1, x, y + 0.55, z), M.woodDark));
    root.add(mk(mergeList([bx(0.25, 0.22, 0.5, x, y + 1.18, z), cy(0.125, 0.125, 0.5, 12, x, y + 1.29, z, Math.PI / 2)]), M.steel));
    const flag = new THREE.Group(); flag.position.set(x + 0.14, y + 1.2, z + 0.1);
    flag.add(mk(mergeList([bx(0.02, 0.35, 0.03, 0, 0.17, 0), bx(0.02, 0.1, 0.14, 0, 0.3, 0.08)]), new THREE.MeshStandardMaterial({ color: 0xb01a10, roughness: 0.5 })));
    root.add(flag);
    refs.mailFlag = flag;
  }
  // farm sign over the gate posts
  {
    const gx = COMPOUND.gate.x, gz = COMPOUND.z1, hw = COMPOUND.gate.width / 2 + 0.3;
    const y = at(gx, gz);
    const sign = new THREE.MeshStandardMaterial({ map: textTexture(['HOLLOW ACRES'], { w: 1024, h: 200, bg: '#3a2e22', fg: '#d9cba8', font: 'bold 110px Georgia' }), roughness: 0.9 });
    root.add(mk(mergeList([bx(0.24, 3.6, 0.24, gx - hw, y + 1.8, gz), bx(0.24, 3.6, 0.24, gx + hw, y + 1.8, gz), bx(hw * 2 + 0.6, 0.2, 0.2, gx, y + 3.5, gz)]), M.woodDark));
    root.add(mk(bx(4.2, 0.7, 0.08, gx, y + 3.0, gz + 0.15), sign));
    const rs = new THREE.MeshStandardMaterial({ map: textTexture(['CO RD 9'], { w: 256, h: 96, bg: '#1d5a2c', fg: '#e8e8e8', font: 'bold 54px Arial', weathered: false }), roughness: 0.5, metalness: 0.4 });
    const sx = gx + 7, sz = ROAD.county.z - 4.5;
    root.add(mk(cy(0.04, 0.04, 2.4, 6, sx, at(sx, sz) + 1.2, sz), M.steel));
    root.add(mk(bx(0.9, 0.32, 0.03, sx, at(sx, sz) + 2.3, sz), rs));
  }
  // utility line from the county road to the farmhouse
  {
    const poles = PROPS.utilityPoles;
    const pts = [];
    for (const [x, z] of poles) {
      const y = at(x, z);
      root.add(mk(mergeList([cy(0.13, 0.17, 9, 8, x, y + 4.5, z), bx(1.6, 0.12, 0.12, x, y + 8.4, z)]), M.woodDark));
      pts.push(new THREE.Vector3(x - 0.6, y + 8.45, z), new THREE.Vector3(x + 0.6, y + 8.45, z));
    }
    const wire = [];
    const sag = (a, b) => { for (let i = 0; i < 12; i++) { const t0 = i / 12, t1 = (i + 1) / 12; const p0 = a.clone().lerp(b, t0); p0.y -= Math.sin(t0 * Math.PI) * 0.8; const p1 = a.clone().lerp(b, t1); p1.y -= Math.sin(t1 * Math.PI) * 0.8; wire.push(p0, p1); } };
    for (let i = 0; i < poles.length - 1; i++) { sag(pts[i * 2], pts[i * 2 + 2]); sag(pts[i * 2 + 1], pts[i * 2 + 3]); }
    sag(pts[pts.length - 2], new THREE.Vector3(H.x - H.w / 2 + 0.2, H.baseY + H.floor + H.wallH - 0.2, H.z + 2));
    root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x111111 })));
  }
  // road edge posts along the county road
  for (const [x, z] of roadPosts()) root.add(mk(bx(0.1, 0.9, 0.1, x, at(x, z) + 0.45, z), M.white, false));
  // wheelbarrow & buckets by the crop walkway
  root.add(mk(mergeList([cy(0.16, 0.13, 0.3, 14, PROPS.bucket.x, at(PROPS.bucket.x, PROPS.bucket.z) + 0.15, PROPS.bucket.z)]), M.steel));
  {
    const g = new THREE.Group(); g.position.set(PROPS.wheelbarrow.x, at(PROPS.wheelbarrow.x, PROPS.wheelbarrow.z), PROPS.wheelbarrow.z); g.rotation.y = PROPS.wheelbarrow.rot;
    const wb = model('wheelbarrow');
    if (wb) g.add(wb);
    else {
      g.add(mk(mergeList([bx(0.7, 0.3, 0.9, 0, 0.45, 0.3), bx(0.04, 0.04, 1.1, -0.3, 0.45, -0.6), bx(0.04, 0.04, 1.1, 0.3, 0.45, -0.6)]), M.paintGreen));
      g.add(mk(cy(0.2, 0.2, 0.08, 12, 0, 0.2, 0.75, 0, Math.PI / 2), M.rubber));
    }
    root.add(g);
  }
}
