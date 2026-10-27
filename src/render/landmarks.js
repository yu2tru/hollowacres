// Ruins and story locations in the woods. Shapes match sim/world.js colliders.
import * as THREE from 'three';
import { LANDMARKS } from '../data/layout.js';
import { LANDMARK_SHAPES } from '../sim/world.js';
import { heightAt } from '../sim/terrain.js';
import { worldUV, mergeList, bx, cy, mk, textTexture } from './build-helpers.js';
import { noiseDisplace } from './geo-utils.js';

export function buildLandmarks(scene, M) {
  const L = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
  const refs = { stakes: {}, chimes: [] };
  const root = new THREE.Group();
  root.name = 'landmarks';
  scene.add(root);
  const paperNote = (x, z, y, rot = 0) => root.add(mk(bx(0.22, 0.01, 0.3, x, y, z, 0, rot), M.paper, false));

  // --- Hollis cabin: log walls, collapsed roof, door hanging open
  {
    const l = L.cabin, S = LANDMARK_SHAPES.cabin;
    const cx = l.x + S.dx, cz = l.z + S.dz, g0 = heightAt(cx, cz);
    const g = new THREE.Group(); g.position.set(cx, g0, cz); root.add(g);
    const logs = [];
    for (let i = 0; i < 9; i++) {
      const y = 0.15 + i * 0.28;
      logs.push(cy(0.15, 0.15, S.w + 0.4, 8, 0, y, -S.d / 2, 0, Math.PI / 2));
      logs.push(cy(0.15, 0.15, S.d + 0.4, 8, -S.w / 2, y, 0, Math.PI / 2));
      if (i < 7) logs.push(cy(0.15, 0.15, S.d + 0.4, 8, S.w / 2, y, 0, Math.PI / 2));
      const side = (S.w - S.doorW) / 2;
      if (i < 8) {
        logs.push(cy(0.15, 0.15, side, 8, -S.w / 2 + side / 2, y, S.d / 2, 0, Math.PI / 2));
        logs.push(cy(0.15, 0.15, side, 8, S.w / 2 - side / 2, y, S.d / 2, 0, Math.PI / 2));
      }
    }
    g.add(mk(mergeList(logs), M.bark));
    // collapsed roof: one side intact, other fallen in
    g.add(mk(worldUV(bx(S.w + 0.8, 0.1, S.d * 0.62, 0, 3.0, -S.d * 0.22, 0.5), 1.6), M.wood));
    g.add(mk(worldUV(bx(S.w * 0.7, 0.1, S.d * 0.5, -0.8, 1.6, S.d * 0.18, -0.9, 0.2), 1.6), M.wood));
    // door hanging from one hinge
    g.add(mk(worldUV(bx(S.doorW - 0.1, 1.9, 0.08, S.doorW * 0.5, 1.0, S.d / 2 + 0.6, 0, -1.1, 0.12), 1), M.woodDark));
    // crate with diary pages in front of the doorway (lore point)
    root.add(mk(worldUV(bx(0.7, 0.6, 0.6, l.x, heightAt(l.x, l.z) + 0.3, l.z), 0.8), M.wood));
    paperNote(l.x + 0.05, l.z, heightAt(l.x, l.z) + 0.61, 0.4);
    paperNote(l.x - 0.12, l.z + 0.1, heightAt(l.x, l.z) + 0.615, -0.3);
  }

  // --- Chapel ruin: broken stone walls, iron chimes, lectern with parish book
  {
    const l = L.chapel, S = LANDMARK_SHAPES.chapel;
    const cx = l.x + S.dx, cz = l.z + S.dz, g0 = heightAt(cx, cz);
    const g = new THREE.Group(); g.position.set(cx, g0, cz); root.add(g);
    const T = 0.6;
    const walls = [];
    walls.push(bx(S.w, S.h, T, 0, S.h / 2, -S.d / 2));
    walls.push(bx(T, S.h * 0.8, S.d - 3, -S.w / 2, S.h * 0.4, -1.5));
    walls.push(bx(T, S.h * 0.55, S.d - 2, S.w / 2, S.h * 0.27, 1));
    const side = (S.w - S.frontGap) / 2;
    walls.push(bx(side, S.h * 0.45, T, -S.w / 2 + side / 2, S.h * 0.22, S.d / 2));
    // gable remnant on the back wall
    const tri = new THREE.Shape([new THREE.Vector2(-S.w / 2, 0), new THREE.Vector2(S.w / 2, 0), new THREE.Vector2(0, 2.4)]);
    const gg = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false }); gg.translate(0, S.h, -S.d / 2 - T / 2);
    walls.push(gg);
    g.add(mk(worldUV(mergeList(walls), 1.6), M.stone));
    // fallen blocks
    for (let i = 0; i < 7; i++) {
      const b = new THREE.DodecahedronGeometry(0.35 + (i % 3) * 0.12, 0);
      b.translate(S.w / 2 + 0.6 + (i % 3) * 0.5, 0.2, -2 + i * 0.9);
      g.add(mk(b, M.stone));
    }
    // beam with iron chimes
    g.add(mk(mergeList([bx(0.2, 0.2, S.w - 1, 0, S.h - 0.3, -S.d / 2 + 1.2, 0, Math.PI / 2)]), M.woodDark));
    for (let i = 0; i < 5; i++) {
      const chime = new THREE.Group();
      chime.position.set(-1.6 + i * 0.8, g0 + S.h - 0.4, cz - S.d / 2 + 1.2);
      chime.position.x += cx;
      chime.add(mk(cy(0.03, 0.03, 0.6 + (i % 3) * 0.2, 8, 0, -0.4 - (i % 3) * 0.1, 0), M.ironRust, false));
      chime.add(mk(cy(0.004, 0.004, 0.3, 3, 0, -0.08, 0), M.black, false));
      root.add(chime);
      refs.chimes.push(chime);
    }
    // lectern with the parish book (lore point at landmark centre)
    root.add(mk(mergeList([bx(0.5, 1.0, 0.4, l.x, heightAt(l.x, l.z) + 0.5, l.z), bx(0.6, 0.06, 0.5, l.x, heightAt(l.x, l.z) + 1.02, l.z, 0.3)]), M.woodDark));
    root.add(mk(bx(0.4, 0.06, 0.3, l.x, heightAt(l.x, l.z) + 1.08, l.z, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.8 })));
    // grave markers outside
    for (let i = 0; i < 6; i++) {
      const x = cx + 6 + (i % 3) * 1.6, z = cz - 3 + Math.floor(i / 3) * 2.2;
      root.add(mk(worldUV(bx(0.5, 0.75 + (i % 2) * 0.2, 0.12, x, heightAt(x, z) + 0.3, z, 0.08 * (i - 2.5), 0.1 * i, 0.1 * (i % 3 - 1)), 0.6), M.stone));
    }
  }

  // --- Dry well with a tin box
  {
    const l = L.oldwell, S = LANDMARK_SHAPES.oldwell;
    const x = l.x + S.dx, z = l.z + S.dz, y = heightAt(x, z);
    const ring = new THREE.CylinderGeometry(S.r, S.r + 0.1, 1.0, 20, 1, true);
    ring.translate(x, y + 0.4, z);
    root.add(mk(worldUV(ring, 0.8), new THREE.MeshStandardMaterial({ map: M.stone.map, normalMap: M.stone.normalMap, side: THREE.DoubleSide, roughness: 0.9 })));
    root.add(mk(new THREE.CircleGeometry(S.r - 0.05, 20).rotateX(-Math.PI / 2).translate(x, y - 0.6, z), M.black, false));
    root.add(mk(mergeList([bx(0.12, 2.0, 0.12, x - S.r, y + 1.0, z), bx(0.12, 2.0, 0.12, x + S.r, y + 1.0, z), bx(S.r * 2 + 0.3, 0.12, 0.12, x, y + 1.95, z), cy(0.08, 0.08, 1.6, 8, x, y + 1.7, z, 0, Math.PI / 2)]), M.woodDark));
    const ty = heightAt(l.x, l.z);
    root.add(mk(worldUV(bx(0.6, 0.5, 0.5, l.x, ty + 0.25, l.z), 0.8), M.wood));
    root.add(mk(bx(0.32, 0.12, 0.22, l.x, ty + 0.56, l.z, 0, 0.5), M.steel));
  }

  // --- Survey marker: concrete post, tripod, notebook
  {
    const l = L.survey, y = heightAt(l.x, l.z);
    root.add(mk(mergeList([bx(0.25, 0.6, 0.25, l.x + 1.2, y + 0.3, l.z)]), M.concrete));
    root.add(mk(cy(0.08, 0.08, 0.02, 12, l.x + 1.2, y + 0.61, l.z), M.paintYellow));
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09;
      root.add(mk(cy(0.02, 0.025, 1.6, 5, l.x - 0.8 + Math.cos(a) * 0.3, y + 0.75, l.z + Math.sin(a) * 0.3, Math.sin(a) * 0.25, -Math.cos(a) * 0.25), M.woodDark));
    }
    root.add(mk(cy(0.5, 0.55, 0.6, 10, l.x, y + 0.3, l.z), M.bark));
    paperNote(l.x, l.z, y + 0.61, 0.6);
    const tape = new THREE.MeshStandardMaterial({ color: 0xd8461c, roughness: 0.7 });
    root.add(mk(bx(0.04, 0.3, 0.02, l.x + 1.2, y + 0.9, l.z), tape, false));
  }

  // --- The Tithe Stone: a carved standing stone ringed by rotten offerings
  {
    const l = L.stone, S = LANDMARK_SHAPES.stone;
    const x = l.x + S.dx, z = l.z + S.dz, y = heightAt(x, z);
    const geo = new THREE.CylinderGeometry(0.75, S.r, S.h, 10, 6);
    noiseDisplace(geo, 0.12, 9, 2.0);
    geo.scale(1.15, 1, 0.65);
    geo.translate(x, y + S.h / 2 - 0.2, z);
    const carved = new THREE.MeshStandardMaterial({ map: M.stone.map, normalMap: M.stone.normalMap, color: 0x8c8c86, roughness: 0.95 });
    root.add(mk(worldUV(geo, 1.2), carved));
    const ins = new THREE.MeshStandardMaterial({ map: textTexture(['WHAT GROWS WITHIN', 'IS YOURS', 'A TENTH IS OURS'], { w: 512, h: 512, bg: '#5d5d58', fg: '#2a2a28', font: 'bold 46px Georgia' }), roughness: 1, transparent: true, opacity: 0.85 });
    root.add(mk(new THREE.PlaneGeometry(1.2, 1.2).translate(x, y + 1.7, z + 0.62), ins, false));
    // offerings: rotten pumpkins & bundles
    const rot = new THREE.MeshStandardMaterial({ color: 0x4a3418, roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const a = -0.6 + i * 0.32, r = 2.0 + (i % 2) * 0.4;
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      const s = new THREE.SphereGeometry(0.22 + (i % 3) * 0.06, 10, 8); s.scale(1, 0.7, 1);
      s.translate(px, heightAt(px, pz) + 0.12, pz);
      root.add(mk(s, i % 3 ? rot : M.hay));
    }
    // ring of small stones
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = 4.2;
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      const b = new THREE.DodecahedronGeometry(0.25, 0); b.translate(px, heightAt(px, pz) + 0.1, pz);
      root.add(mk(b, M.stone));
    }
  }

  // --- Boundary stones with iron stakes
  for (const id of ['stake_n', 'stake_e', 'stake_s', 'stake_w']) {
    const l = L[id];
    const px = l.x, pz = l.z - 0.9, y = heightAt(px, pz);
    root.add(mk(worldUV(cy(0.28, 0.36, 0.85, 8, px, y + 0.42, pz), 0.6), M.stone));
    const stake = new THREE.Group();
    stake.position.set(px, y + 0.85, pz);
    stake.add(mk(mergeList([cy(0.035, 0.02, 1.0, 6, 0, 0.0, 0), cy(0.07, 0.07, 0.05, 8, 0, 0.5, 0)]), M.ironRust));
    stake.rotation.z = 0.35; stake.position.y += 0.3;
    root.add(stake);
    refs.stakes[id] = stake;
  }
  return refs;
}
