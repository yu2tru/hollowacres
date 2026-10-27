// Detailed procedural models for key props: generator, pickup truck, tractor,
// shipping bin, water tank ladder. Built from shaped parts (profiles, rounded
// boxes, tubes) rather than bare primitives so each reads clearly in first
// person. Dimensions in metres; each model sits on y = 0, faces +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeList, bx, cy, mk, worldUV, textTexture } from './build-helpers.js';

const rbox = (w, h, d, r, x = 0, y = 0, z = 0) => { const g = new RoundedBoxGeometry(w, h, d, 3, r); g.translate(x, y, z); return g; };
const tube = (pts, r, seg = 24, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', 0.1), seg, r, 8, closed);
const std = (color, rough, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    frame: std(0x1c1d1f, 0.55, 0.6), yellow: std(0xd9a21b, 0.42, 0.25), engine: std(0x3a3d40, 0.5, 0.7),
    alu: std(0x9aa0a6, 0.35, 0.85), chrome: std(0xd8dcdf, 0.12, 1.0), rubber: std(0x151515, 0.9),
    black: std(0x0c0c0c, 0.6), panel: std(0x232527, 0.5, 0.4), red: std(0x8e1f12, 0.45, 0.25),
    tractorRed: std(0x9a2a14, 0.5, 0.3), tractorRust: std(0x6a3a22, 0.85, 0.3), seat: std(0x262422, 0.7),
    truckPaint: std(0x55707e, 0.38, 0.45), truckRust: std(0x6b4630, 0.85, 0.2), glass: std(0x1a242b, 0.06, 0.2, { transparent: true, opacity: 0.55, envMapIntensity: 2, side: THREE.DoubleSide }),
    lamp: std(0xf2efe0, 0.1, 0.0, { emissive: 0x000000 }), tail: std(0x7a0d0a, 0.3, 0.1), hub: std(0xb8bcc0, 0.3, 0.9),
  };
  return MATS;
}

// ---------------------------------------------------------------- generator
// Open-frame portable generator, ~1.5 x 1.05 x 0.9 m. Returns { group, panel }.
export function generatorModel(M) {
  const C = mats();
  const g = new THREE.Group();
  const L = 0.78, W = 0.46, H = 1.0; // half length, half width, height
  // tubular frame: two rounded side loops plus cross members
  const loop = (z) => tube([[-L, 0.08, z], [-L, H - 0.12, z], [-L + 0.1, H, z], [L - 0.1, H, z], [L, H - 0.12, z], [L, 0.08, z], [L - 0.1, 0.02, z], [-L + 0.1, 0.02, z]], 0.024, 64, true);
  g.add(mk(mergeList([loop(-W), loop(W), cy(0.022, 0.022, W * 2, 8, -L + 0.1, H, 0, Math.PI / 2), cy(0.022, 0.022, W * 2, 8, L - 0.1, H, 0, Math.PI / 2), cy(0.022, 0.022, W * 2, 8, 0, 0.03, 0, Math.PI / 2)]), C.frame));
  // fuel tank on top
  const body = new THREE.Group();
  body.add(mk(rbox(1.05, 0.26, 0.74, 0.07, -0.05, 0.84, 0), C.yellow));
  body.add(mk(mergeList([cy(0.06, 0.065, 0.06, 16, 0.22, 1.0, 0.12), cy(0.07, 0.07, 0.015, 16, 0.22, 1.035, 0.12)]), C.black));
  body.add(mk(cy(0.045, 0.045, 0.012, 16, -0.25, 0.975, 0.18), C.chrome)); // fuel gauge
  // engine (left): crankcase, finned cylinder, recoil starter, air filter
  body.add(mk(rbox(0.5, 0.42, 0.5, 0.05, -0.36, 0.36, 0), C.engine));
  const fins = [];
  for (let i = 0; i < 6; i++) fins.push(bx(0.26, 0.012, 0.3, -0.36, 0.6 + i * 0.022, -0.05, 0, 0, 0));
  body.add(mk(mergeList(fins), C.alu));
  body.add(mk(mergeList([cy(0.17, 0.17, 0.09, 24, -0.63, 0.4, 0, 0, Math.PI / 2), cy(0.11, 0.11, 0.02, 20, -0.68, 0.4, 0, 0, Math.PI / 2)]), C.red));
  body.add(mk(mergeList([cy(0.012, 0.012, 0.12, 6, -0.71, 0.47, 0.08), bx(0.025, 0.025, 0.1, -0.71, 0.53, 0.08)]), C.black)); // pull handle
  body.add(mk(rbox(0.2, 0.18, 0.2, 0.03, -0.25, 0.58, 0.28), C.black)); // air filter
  // alternator (right): drum with vented end cap
  body.add(mk(cy(0.2, 0.2, 0.4, 28, 0.32, 0.36, 0, 0, Math.PI / 2), C.yellow));
  const vents = [];
  for (let i = 0; i < 5; i++) vents.push(cy(0.205, 0.205, 0.012, 28, 0.2 + i * 0.05, 0.36, 0, 0, Math.PI / 2));
  body.add(mk(mergeList(vents), C.black));
  body.add(mk(cy(0.16, 0.18, 0.05, 28, 0.55, 0.36, 0, 0, Math.PI / 2), C.engine));
  // control panel facing +z, angled
  const panelG = new THREE.Group();
  panelG.position.set(0.32, 0.5, 0.3); panelG.rotation.x = -0.35;
  panelG.add(mk(rbox(0.46, 0.3, 0.04, 0.012), C.panel));
  const outlets = [];
  for (const x of [-0.15, -0.03]) outlets.push(rbox(0.07, 0.09, 0.02, 0.008, x, -0.05, 0.025));
  outlets.push(cy(0.04, 0.04, 0.02, 16, 0.12, -0.05, 0.025, Math.PI / 2));
  panelG.add(mk(mergeList(outlets), C.black));
  panelG.add(mk(mergeList([bx(0.035, 0.05, 0.02, -0.15, 0.08, 0.025), bx(0.035, 0.05, 0.02, -0.1, 0.08, 0.025)]), C.red)); // breakers
  const lamp = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x30ff60, emissiveIntensity: 0 });
  panelG.add(mk(cy(0.018, 0.018, 0.02, 12, 0.1, 0.08, 0.025, Math.PI / 2), lamp, false));
  panelG.add(mk(cy(0.05, 0.05, 0.015, 20, 0.02, 0.08, 0.025, Math.PI / 2), C.chrome)); // voltmeter
  body.add(panelG);
  // muffler with perforated heat shield and exhaust tip
  body.add(mk(cy(0.09, 0.09, 0.32, 18, 0.05, 0.62, -0.28, 0, Math.PI / 2), C.engine));
  const shield = [];
  for (let i = 0; i < 6; i++) shield.push(cy(0.105, 0.105, 0.025, 18, -0.08 + i * 0.05, 0.62, -0.28, 0, Math.PI / 2));
  body.add(mk(mergeList(shield), C.frame));
  body.add(mk(cy(0.025, 0.025, 0.16, 10, 0.25, 0.62, -0.32, 0, Math.PI / 2), C.alu));
  g.add(body);
  // wheels at the alternator end, handle and feet at the engine end
  for (const z of [-W - 0.07, W + 0.07]) {
    g.add(mk(mergeList([cy(0.15, 0.15, 0.09, 20, L - 0.12, 0.15, z, Math.PI / 2)]), C.rubber));
    g.add(mk(cy(0.07, 0.07, 0.095, 16, L - 0.12, 0.15, z, Math.PI / 2), C.hub));
  }
  g.add(mk(cy(0.018, 0.018, W * 2 + 0.2, 8, L - 0.12, 0.15, 0, Math.PI / 2), C.alu));
  g.add(mk(tube([[-L, H - 0.15, -W], [-L - 0.22, H - 0.05, -W + 0.05], [-L - 0.22, H - 0.05, W - 0.05], [-L, H - 0.15, W]], 0.018, 24), C.frame));
  g.add(mk(mergeList([bx(0.06, 0.12, 0.06, -L + 0.05, 0.06, -W), bx(0.06, 0.12, 0.06, -L + 0.05, 0.06, W)]), C.rubber));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, body, panel: lamp };
}

// ---------------------------------------------------------------- pickup truck
export function truckModel() {
  const C = mats();
  const g = new THREE.Group();
  const W = 1.9;
  // side profile (z forward): bumper, hood, windscreen, roof, back of cab
  const prof = new THREE.Shape();
  const pts = [[2.45, 0.55], [2.5, 0.95], [2.42, 1.1], [1.25, 1.18], [0.75, 1.88], [-0.25, 1.92], [-0.42, 1.85], [-0.45, 0.55]];
  prof.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) prof.lineTo(p[0], p[1]);
  prof.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: W - 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 });
  bodyGeo.translate(0, 0, -(W - 0.12) / 2);
  bodyGeo.rotateY(-Math.PI / 2); // profile x -> world z
  worldUV(bodyGeo, 2);
  g.add(mk(bodyGeo, C.truckPaint));
  // glass: windscreen and side windows sit just proud of the body
  const ws = new THREE.PlaneGeometry(W - 0.3, 0.86);
  const wsm = mk(ws, C.glass, false); wsm.position.set(0, 1.53, 1.0 + 0.04); wsm.rotation.x = -0.62; g.add(wsm);
  for (const s of [-1, 1]) {
    const sw = new THREE.Shape([new THREE.Vector2(-0.25, 1.22), new THREE.Vector2(0.95, 1.22), new THREE.Vector2(0.62, 1.8), new THREE.Vector2(-0.2, 1.82)]);
    const sg = new THREE.ShapeGeometry(sw); sg.rotateY(-Math.PI / 2);
    const m = mk(sg, C.glass, false); m.position.x = s * (W / 2 + 0.005); g.add(m);
    // door seam & handle
    g.add(mk(mergeList([bx(0.01, 0.62, 0.012, s * (W / 2 + 0.008), 0.92, -0.32), bx(0.01, 0.62, 0.012, s * (W / 2 + 0.008), 0.92, 0.92), bx(0.02, 0.025, 0.14, s * (W / 2 + 0.012), 1.1, -0.15)]), C.black, false));
    g.add(mk(mergeList([bx(0.05, 0.12, 0.08, s * (W / 2 + 0.1), 1.42, 0.82), cy(0.012, 0.012, 0.12, 6, s * (W / 2 + 0.04), 1.4, 0.82, 0, Math.PI / 2)]), C.chrome)); // mirrors
  }
  // bed
  const bed = [bx(W, 0.08, 2.15, 0, 0.62, -1.55), bx(0.07, 0.48, 2.15, -W / 2 + 0.035, 0.9, -1.55), bx(0.07, 0.48, 2.15, W / 2 - 0.035, 0.9, -1.55), bx(W, 0.48, 0.07, 0, 0.9, -2.62)];
  g.add(mk(worldUV(mergeList(bed), 1.5), C.truckPaint));
  g.add(mk(mergeList([bx(W - 0.16, 0.02, 2.0, 0, 0.67, -1.55)]), C.truckRust, false)); // rusty bed floor
  g.add(mk(mergeList([bx(0.09, 0.05, 2.17, -W / 2 + 0.035, 1.15, -1.55), bx(0.09, 0.05, 2.17, W / 2 - 0.035, 1.15, -1.55)]), C.chrome));
  // chassis, wheel arches & wheels
  g.add(mk(mergeList([bx(1.1, 0.16, 4.6, 0, 0.42, -0.05)]), C.frame));
  for (const [z, front] of [[1.62, true], [-1.72, false]]) for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.13);
    const tire = new THREE.TorusGeometry(0.29, 0.11, 10, 24); tire.rotateY(Math.PI / 2); tire.translate(x, 0.4, z);
    g.add(mk(mergeList([tire, cy(0.3, 0.3, 0.2, 24, x, 0.4, z, 0, Math.PI / 2)]), C.rubber));
    g.add(mk(mergeList([cy(0.17, 0.17, 0.02, 20, x + s * 0.11, 0.4, z, 0, Math.PI / 2), cy(0.05, 0.05, 0.04, 12, x + s * 0.12, 0.4, z, 0, Math.PI / 2)]), C.hub));
    const arch = new THREE.TorusGeometry(0.46, 0.04, 6, 16, Math.PI); arch.rotateY(Math.PI / 2); arch.translate(s * (W / 2 + 0.01), 0.42, z);
    g.add(mk(arch, C.black));
  }
  // front: grille, headlights, bumper; rear: tail lights, bumper
  g.add(mk(mergeList([bx(1.3, 0.34, 0.04, 0, 0.82, 2.5)]), C.black));
  const bars = []; for (let i = 0; i < 5; i++) bars.push(bx(1.26, 0.025, 0.05, 0, 0.68 + i * 0.07, 2.52));
  bars.push(bx(0.04, 0.34, 0.05, 0, 0.82, 2.52));
  g.add(mk(mergeList(bars), C.chrome));
  for (const s of [-1, 1]) {
    g.add(mk(cy(0.11, 0.11, 0.06, 20, s * 0.72, 0.84, 2.49, Math.PI / 2), C.chrome));
    g.add(mk(cy(0.09, 0.09, 0.02, 20, s * 0.72, 0.84, 2.53, Math.PI / 2), C.lamp, false));
    g.add(mk(bx(0.14, 0.2, 0.04, s * 0.82, 0.92, -2.64), C.tail, false));
  }
  g.add(mk(mergeList([rbox(2.0, 0.17, 0.16, 0.05, 0, 0.55, 2.6), rbox(2.0, 0.15, 0.14, 0.05, 0, 0.55, -2.7)]), C.chrome));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- tractor
export function tractorModel() {
  const C = mats();
  const g = new THREE.Group();
  // rear wheels with tread lugs
  for (const s of [-1, 1]) {
    const x = s * 0.82;
    const tire = new THREE.TorusGeometry(0.58, 0.18, 12, 32); tire.rotateY(Math.PI / 2); tire.translate(x, 0.76, -0.75);
    const lugs = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const l = new THREE.BoxGeometry(0.34, 0.07, 0.1); l.rotateY(0.45 * (i % 2 ? 1 : -1)); l.rotateX(a); l.translate(x, 0.76 + Math.sin(a) * 0.75, -0.75 + Math.cos(a) * 0.75);
      lugs.push(l);
    }
    g.add(mk(mergeList([tire, cy(0.6, 0.6, 0.3, 28, x, 0.76, -0.75, 0, Math.PI / 2), ...lugs]), C.rubber));
    g.add(mk(mergeList([cy(0.42, 0.42, 0.32, 24, x, 0.76, -0.75, 0, Math.PI / 2), cy(0.12, 0.14, 0.4, 12, x, 0.76, -0.75, 0, Math.PI / 2)]), C.tractorRust));
    // fender
    const f = new THREE.CylinderGeometry(0.86, 0.86, 0.42, 24, 1, true, -Math.PI * 0.1, Math.PI * 0.75); f.rotateZ(Math.PI / 2); f.translate(x, 0.76, -0.75);
    g.add(mk(f, new THREE.MeshStandardMaterial({ color: 0x9a2a14, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide })));
    // front wheels
    const ft = new THREE.TorusGeometry(0.28, 0.1, 10, 24); ft.rotateY(Math.PI / 2); ft.translate(s * 0.55, 0.38, 1.35);
    g.add(mk(mergeList([ft, cy(0.29, 0.29, 0.18, 20, s * 0.55, 0.38, 1.35, 0, Math.PI / 2)]), C.rubber));
    g.add(mk(cy(0.16, 0.16, 0.2, 16, s * 0.55, 0.38, 1.35, 0, Math.PI / 2), C.tractorRust));
  }
  // axle, transmission, long hood with grille
  g.add(mk(mergeList([cy(0.08, 0.08, 1.7, 10, 0, 0.76, -0.75, 0, Math.PI / 2), cy(0.06, 0.06, 1.2, 10, 0, 0.38, 1.35, 0, Math.PI / 2)]), C.frame));
  g.add(mk(rbox(0.62, 0.62, 1.1, 0.08, 0, 0.82, -0.55), C.tractorRed));
  g.add(mk(rbox(0.56, 0.58, 1.75, 0.1, 0, 1.0, 0.75), C.tractorRed));
  g.add(mk(mergeList([bx(0.5, 0.5, 0.04, 0, 0.98, 1.63)]), C.black));
  const gr = []; for (let i = 0; i < 6; i++) gr.push(bx(0.46, 0.022, 0.05, 0, 0.78 + i * 0.08, 1.65));
  g.add(mk(mergeList(gr), C.alu));
  g.add(mk(mergeList([bx(0.04, 0.06, 1.4, 0.29, 1.22, 0.75), bx(0.04, 0.06, 1.4, -0.29, 1.22, 0.75)]), C.alu)); // hood trim
  // exhaust stack, air intake
  g.add(mk(mergeList([cy(0.045, 0.045, 1.0, 10, 0.18, 1.75, 1.0), cy(0.06, 0.05, 0.08, 10, 0.18, 2.27, 1.0)]), C.frame));
  g.add(mk(cy(0.06, 0.06, 0.4, 10, -0.18, 1.48, 1.2), C.frame));
  // seat on spring post, steering wheel on column
  g.add(mk(mergeList([cy(0.04, 0.04, 0.35, 8, 0, 1.25, -0.95)]), C.frame));
  g.add(mk(mergeList([rbox(0.5, 0.08, 0.42, 0.04, 0, 1.45, -0.95), rbox(0.5, 0.35, 0.08, 0.04, 0, 1.62, -1.15)]), C.seat));
  g.add(mk(cy(0.03, 0.03, 0.75, 8, 0, 1.45, -0.25, 0.75), C.frame));
  const wheel = new THREE.TorusGeometry(0.2, 0.022, 8, 24); wheel.rotateX(Math.PI / 2 - 0.6); wheel.translate(0, 1.72, -0.45);
  g.add(mk(mergeList([wheel, bx(0.36, 0.02, 0.02, 0, 1.72, -0.45)]), C.black));
  // headlights and drawbar
  for (const s of [-1, 1]) g.add(mk(mergeList([cy(0.07, 0.07, 0.08, 14, s * 0.32, 1.28, 1.3, Math.PI / 2)]), C.chrome));
  g.add(mk(mergeList([bx(0.12, 0.06, 0.6, 0, 0.42, -1.45)]), C.frame));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- shipping bin
export function shippingBinModel(M) {
  const g = new THREE.Group();
  const C = mats();
  const boards = [];
  // plank sides with gaps, corner posts, slanted lid
  for (let i = 0; i < 4; i++) {
    const y = 0.14 + i * 0.2;
    boards.push(bx(1.6, 0.17, 0.04, 0, y, 0.53), bx(1.6, 0.17, 0.04, 0, y, -0.53), bx(0.04, 0.17, 1.06, 0.78, y, 0), bx(0.04, 0.17, 1.06, -0.78, y, 0));
  }
  boards.push(bx(1.56, 0.04, 1.02, 0, 0.06, 0));
  g.add(mk(worldUV(mergeList(boards), 0.9), M.wood));
  g.add(mk(worldUV(mergeList([bx(0.09, 0.9, 0.09, 0.79, 0.45, 0.54), bx(0.09, 0.9, 0.09, -0.79, 0.45, 0.54), bx(0.09, 0.9, 0.09, 0.79, 0.45, -0.54), bx(0.09, 0.9, 0.09, -0.79, 0.45, -0.54)]), 0.9), M.woodDark));
  const lid = new THREE.Group(); lid.position.set(0, 0.92, -0.55); lid.rotation.x = -0.12;
  lid.add(mk(worldUV(mergeList([bx(1.7, 0.05, 1.18, 0, 0.0, 0.59), bx(1.7, 0.08, 0.06, 0, -0.03, 1.15)]), 0.9), M.woodDark));
  lid.add(mk(mergeList([bx(0.06, 0.012, 1.0, -0.5, 0.032, 0.55), bx(0.06, 0.012, 1.0, 0.5, 0.032, 0.55)]), C.frame));
  g.add(lid);
  g.add(mk(mergeList([bx(1.62, 0.04, 0.012, 0, 0.3, 0.552), bx(1.62, 0.04, 0.012, 0, 0.7, 0.552)]), C.frame, false)); // straps
  const sign = new THREE.MeshStandardMaterial({ map: textTexture(['SHIPPING'], { font: 'bold 80px Georgia' }), roughness: 0.9 });
  g.add(mk(bx(1.0, 0.28, 0.01, 0, 0.5, 0.56), sign, false));
  return g;
}

// Ladder up the side of a round tank (radius r, height h)
export function tankLadder(r, h) {
  const C = mats();
  const parts = [cy(0.02, 0.02, h + 0.4, 6, -0.2, (h + 0.4) / 2, r + 0.12), cy(0.02, 0.02, h + 0.4, 6, 0.2, (h + 0.4) / 2, r + 0.12)];
  for (let y = 0.3; y < h + 0.2; y += 0.3) parts.push(cy(0.014, 0.014, 0.4, 6, 0, y, r + 0.12, 0, Math.PI / 2));
  parts.push(bx(0.05, 0.05, 0.14, -0.2, h - 0.2, r + 0.05), bx(0.05, 0.05, 0.14, 0.2, h - 0.2, r + 0.05), bx(0.05, 0.05, 0.14, -0.2, 0.6, r + 0.05), bx(0.05, 0.05, 0.14, 0.2, 0.6, r + 0.05));
  return mk(mergeList(parts), C.alu);
}
