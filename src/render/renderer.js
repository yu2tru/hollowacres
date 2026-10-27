// Rendering front-end: owns the three.js renderer, scene, post chain and all
// view modules. Reads simulation state each frame; never mutates gameplay.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { getMaterials, U } from './materials.js';
import { createTerrain, createPond } from './terrain-view.js';
import { SkySystem } from './sky.js';
import { buildEnvironment } from './environment.js';
import { buildLandmarks } from './landmarks.js';
import { Vegetation } from './vegetation-view.js';
import { CropsView } from './crops-view.js';
import { StructuresView, Ghost } from './structures-view.js';
import { CreaturesView } from './creatures-view.js';
import { AnimalsView } from './animals-view.js';
import { ViewModel } from './viewmodel.js';
import { FX } from './fx.js';
import { WeatherView } from './weather-view.js';
import { LightPool } from './lights.js';
import { GradeShader } from './grade.js';
import { eyePos, viewDir, currentTool } from '../sim/player.js';
import { heightAt } from '../sim/terrain.js';
import { lightAt } from '../sim/structures.js';
import { clamp, lerp } from '../core/math.js';

class TogglePass extends Pass {
  constructor(fn) { super(); this.fn = fn; this.needsSwap = false; }
  render() { this.fn(); }
}

export const PRESETS = {
  low:    { renderScale: 0.75, shadows: 'low', ao: false, bloom: false, aa: 'fxaa', foliage: 'low', viewDistance: 'near', effects: 'low' },
  medium: { renderScale: 0.9, shadows: 'medium', ao: false, bloom: true, aa: 'fxaa', foliage: 'medium', viewDistance: 'medium', effects: 'medium' },
  high:   { renderScale: 1.0, shadows: 'high', ao: true, bloom: true, aa: 'smaa', foliage: 'high', viewDistance: 'far', effects: 'high' },
  epic:   { renderScale: 1.0, shadows: 'epic', ao: true, bloom: true, aa: 'smaa', foliage: 'epic', viewDistance: 'far', effects: 'high' },
};
const VIEW = { near: 380, medium: 700, far: 1400 };

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    const g = settings.graphics;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(settings.controls.fov || 75, 1, 0.08, VIEW[g.viewDistance] || 700);
    this.scene.add(this.camera);
    this.cctvCam = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 400);
    this.mode = 'player';
    this.shake = 0; this.hurt = 0; this.chill = 0; this.fade = 0; this.landDip = 0;
    this.time = 0;
  }

  // Heavy construction (textures, meshes). `progress(label)` reports steps.
  async build(sim, progress = () => {}) {
    const g = this.settings.graphics;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    this.sim = sim;
    progress('Generating materials'); await tick();
    this.M = getMaterials(g.textures || 'high');
    progress('Shaping the land'); await tick();
    this.sky = new SkySystem(this.scene, g.shadows);
    const terr = createTerrain(this.M, g.foliage === 'low' ? 'low' : g.foliage === 'medium' ? 'medium' : 'high');
    this.scene.add(terr.mesh, terr.ringMesh);
    this.scene.add(createPond(this.M));
    progress('Raising the farm'); await tick();
    this.env = buildEnvironment(this.scene, this.M);
    this.landmarks = buildLandmarks(this.scene, this.M);
    progress('Planting the woods'); await tick();
    this.veg = new Vegetation(this.scene, this.M, g.foliage);
    this.crops = new CropsView(this.scene, this.M, sim);
    this.structs = new StructuresView(this.scene, this.M, this.env);
    this.ghost = new Ghost(this.scene, this.M);
    this.creatures = new CreaturesView(this.scene);
    this.animals = new AnimalsView(this.scene);
    this.fx = new FX(this.scene, g.effects);
    this.weather = new WeatherView(this.scene, g.effects);
    this.lights = new LightPool(this.scene, g.shadows);
    this.vm = new ViewModel(this.M);
    // flashlight
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 42, 0.36, 0.45, 1.5);
    this.flashlight.position.set(0.15, -0.12, 0);
    this.flashlight.target.position.set(0, -0.3, -10);
    this.flashlight.castShadow = g.shadows === 'high' || g.shadows === 'epic';
    if (this.flashlight.castShadow) { this.flashlight.shadow.mapSize.set(1024, 1024); this.flashlight.shadow.bias = -0.0008; this.flashlight.shadow.camera.near = 0.3; }
    this.camera.add(this.flashlight, this.flashlight.target);
    this.flashSpill = new THREE.PointLight(0xfff4e0, 0, 4, 2);
    this.camera.add(this.flashSpill);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envT = 999;
    progress('Lighting'); await tick();
    this.buildComposer();
    this.hookEvents(sim);
    this.structs.sync(sim);
    this.structs.rebuildWires(sim);
    this.resize();
    // compile shaders up front to avoid hitches
    this.updateCamera(0);
    this.veg.update(this.camera.position, true);
    this.renderer.compile(this.scene, this.camera);
  }

  buildComposer() {
    const g = this.settings.graphics;
    const r = this.renderer;
    this.composer?.dispose?.();
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(r, rt);
    this.mainPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.mainPass);
    this.aoPass = null;
    if (g.ao) {
      const hideList = () => [this.veg.grass?.mesh, ...Object.values(this.veg.kinds).map((k) => k.crown)].filter(Boolean);
      this.composer.addPass(new TogglePass(() => { for (const o of hideList()) o.visible = false; }));
      this.aoPass = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.aoPass.blendIntensity = 0.85;
      this.aoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
      this.composer.addPass(this.aoPass);
      this.composer.addPass(new TogglePass(() => { for (const o of hideList()) o.visible = true; }));
    }
    this.vmPass = new RenderPass(this.vm.scene, this.vm.camera);
    this.vmPass.clear = false;
    this.vmPass.clearDepth = true;
    this.composer.addPass(this.vmPass);
    this.bloomPass = null;
    if (g.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 1.6);
      this.composer.addPass(this.bloomPass);
    }
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());
    this.aaPass = null;
    if (g.aa === 'smaa') { this.aaPass = new SMAAPass(size.x, size.y); this.composer.addPass(this.aaPass); }
    else if (g.aa === 'fxaa') { this.aaPass = new ShaderPass(FXAAShader); this.composer.addPass(this.aaPass); }
    this.resize();
  }

  applyGraphics(settings) {
    const prev = this.settings.graphics;
    this.settings = settings;
    const g = settings.graphics;
    this.camera.far = VIEW[g.viewDistance] || 700;
    this.camera.fov = settings.controls.fov || 75;
    this.camera.updateProjectionMatrix();
    this.sky.setShadowQuality(g.shadows);
    this.renderer.shadowMap.enabled = g.shadows !== 'off';
    this.renderer.shadowMap.needsUpdate = true;
    if (prev.ao !== g.ao || prev.bloom !== g.bloom || prev.aa !== g.aa || prev.renderScale !== g.renderScale) this.buildComposer();
    if (prev.foliage !== g.foliage) {
      this.scene.remove(this.veg.group); if (this.veg.grass.mesh) this.scene.remove(this.veg.grass.mesh);
      this.veg = new Vegetation(this.scene, this.M, g.foliage);
      this.veg.update(this.camera.position, true);
    }
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * (this.settings.graphics.renderScale || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vm?.setAspect(w / h);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      if (this.aaPass?.material?.uniforms?.resolution) this.aaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
      this.gradePass.uniforms.uAspect.value = w / h;
    }
    this.fx?.setScale(h * pr);
  }

  hookEvents(sim) {
    const E = sim.events;
    E.on('shot', (e) => {
      this.vm.trigger('fire');
      this.lights.muzzleFlash(new THREE.Vector3(e.origin.x, e.origin.y, e.origin.z));
      this.shake = Math.max(this.shake, e.weapon === 'shotgun' ? 0.5 : 0.25);
      for (const h of e.hits) if (!h.hit) this.fx.emit('impact', h.end.x, h.end.y, h.end.z, { n: 4 });
    });
    E.on('creatureHit', (e) => this.fx.emit('ichor', e.x ?? e.c.x, e.y ?? e.c.y + 1, e.z ?? e.c.z, { n: e.head ? 18 : 10 }));
    E.on('reload', () => this.vm.trigger('reload'));
    E.on('swing', () => this.vm.trigger('swing'));
    E.on('equip', () => {});
    E.on('flareThrown', (e) => { this.vm.trigger('throw'); });
    E.on('hollowDisperse', (e) => this.fx.emit('hollow', e.c.x, e.c.y + 1.3, e.c.z, { n: 12 }));
    E.on('hollowBanished', (e) => this.fx.emit('hollow', e.c.x, e.c.y + 1.3, e.c.z, { n: 40 }));
    E.on('structureDestroyed', ({ s }) => this.fx.emit(['floodlight', 'generator', 'camera'].includes(s.type) ? 'spark' : 'splinter', s.x, heightAt(s.x, s.z) + 1, s.z, { n: 24 }));
    E.on('playerHurt', (e) => { this.hurt = Math.min(1, this.hurt + e.amount / 30); this.shake = Math.max(this.shake, 0.6); if (e.chill) this.chill = Math.min(1, this.chill + 0.2); });
    E.on('sfx', (e) => {
      if (e.id === 'water') { const d = viewDir(sim.state.player); this.fx.emit('water', e.x, heightAt(e.x, e.z) + 0.6, e.z, { n: 25, dx: d.x * 0.5, dz: d.z * 0.5 }); this.vm.trigger('use'); }
      if (e.id === 'plant') { this.fx.emit('seed', e.x, heightAt(e.x, e.z) + 0.5, e.z, { n: 12 }); this.vm.trigger('use'); }
      if (e.id === 'harvest') this.fx.emit('chaff', e.x, heightAt(e.x, e.z) + 0.5, e.z, { n: 18 });
      if (e.id === 'dig') this.fx.emit('soil', e.x, heightAt(e.x, e.z) + 0.2, e.z, { n: 16 });
      if (e.id === 'hammer') this.vm.trigger('hammer');
      if (e.id === 'bulb_pop') this.fx.emit('spark', e.x, heightAt(e.x, e.z) + 5, e.z, { n: 20 });
      if (e.id === 'smash') this.fx.emit('splinter', e.x, heightAt(e.x, e.z) + 0.9, e.z, { n: 6 });
      if (e.id === 'crash') { this.fx.emit('dust', e.x, heightAt(e.x, e.z) + 0.5, e.z, { n: 14 }); const p = sim.state.player; if (Math.hypot(p.x - e.x, p.z - e.z) < 25) this.shake = Math.max(this.shake, 0.4); }
      if (e.id === 'land') this.landDip = 0.12;
    });
    E.on('structureAdded', () => { this.structs.sync(sim); });
    E.on('structureRemoved', () => { this.structs.sync(sim); });
    E.on('structureChanged', (s) => {
      if (s.type === 'fence') { this.structs.fenceDirty = true; return; }
      const it = this.structs.items.get(s.id); if (it) this.structs.applyState(it, s, sim);
    });
    E.on('powerUpdated', () => { this.structs.sync(sim); this.structs.rebuildWires(sim); });
    E.on('seedChanged', (id) => this.vm.setSeed(id));
  }

  updateCamera(dt) {
    const sim = this.sim, p = sim.state.player, rt = sim.rt.player;
    const eye = eyePos(sim);
    const reduce = this.settings.controls.reduceMotion;
    this.bobT = (this.bobT || 0) + dt * (rt.sprinting ? 12 : 8.5) * (rt.grounded && rt.speed > 0.5 ? 1 : 0);
    const bobAmt = (this.settings.controls.headBob === false || reduce) ? 0 : Math.min(1, rt.speed / 4) * (rt.sprinting ? 0.05 : 0.03);
    this.landDip = Math.max(0, this.landDip - dt * 0.6);
    this._eyeY = this._eyeY == null ? eye.y : lerp(this._eyeY, eye.y, Math.min(1, dt * 18));
    this.camera.position.set(eye.x, this._eyeY + Math.abs(Math.sin(this.bobT)) * bobAmt - this.landDip, eye.z);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = reduce ? this.shake * 0.25 : this.shake;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = p.yaw + (Math.random() - 0.5) * sh * 0.02;
    this.camera.rotation.x = p.pitch + (Math.random() - 0.5) * sh * 0.02;
    this.camera.rotation.z = Math.sin(this.bobT * 0.5) * bobAmt * 0.15;
    // aim zoom
    const baseFov = this.settings.controls.fov || 75;
    const aimFov = sim.rt.aiming && ['revolver', 'shotgun'].includes(currentTool(sim)) ? baseFov * 0.8 : baseFov;
    if (Math.abs(this.camera.fov - aimFov) > 0.1) { this.camera.fov = lerp(this.camera.fov, aimFov, Math.min(1, dt * 12)); this.camera.updateProjectionMatrix(); }
  }

  setCCTV(cam) {
    this.cctvTarget = cam;
    this.mode = cam ? 'cctv' : 'player';
    this.mainPass.camera = cam ? this.cctvCam : this.camera;
    if (this.aoPass) this.aoPass.camera = cam ? this.cctvCam : this.camera;
    this.vmPass.enabled = !cam;
    this.creatures.setCCTV(this.sim, !!cam);
  }

  render(dt, ui = {}) {
    const sim = this.sim, st = sim.state;
    this.time += dt;
    U.uTime.value = this.time;
    U.uWind.value = lerp(U.uWind.value, st.weather.wind || 0.3, dt * 0.5);
    U.uWet.value = st.weather.wetness || 0;
    this.updateCamera(dt);
    const focus = this.camera.position;
    const env = this.sky.update(st.time.minute, st.weather, focus, dt);
    // exposure: a little adaptation at night so it isn't pitch black
    const targetExp = lerp(1.45, 1.0, env.day) * (sim.playerIndoors() && sim.rt.housePowered ? 0.9 : 1);
    this.renderer.toneMappingExposure = lerp(this.renderer.toneMappingExposure, targetExp, Math.min(1, dt * 1.5));
    // environment lighting refresh
    this.envT += dt;
    if (this.envT > (this.settings.graphics.shadows === 'low' ? 8 : 3)) {
      this.envT = 0;
      const sp = this.sky.sky.position.clone(), cp = this.sky.clouds.position.clone();
      this.sky.sky.position.set(0, 0, 0); this.sky.clouds.position.set(0, 0, 0);
      const envScene = new THREE.Scene(); envScene.add(this.sky.sky); envScene.add(this.sky.clouds);
      const rtEnv = this.pmrem.fromScene(envScene, 0.04, 1, 5000);
      this.scene.add(this.sky.sky); this.scene.add(this.sky.clouds);
      this.sky.sky.position.copy(sp); this.sky.clouds.position.copy(cp);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rtEnv;
      this.scene.environment = rtEnv.texture;
    }
    this.scene.environmentIntensity = lerp(0.04, 0.45, env.day);
    // emissives tied to power
    const lit = sim.rt.housePowered;
    this.M.windowLit.emissiveIntensity = lit ? lerp(0.6, 2.6, env.night) : 0;
    this.M.lampOn.emissiveIntensity = lit ? 3 : 0;
    this.env.screens.laptop.emissiveIntensity = lit ? 0.8 : 0;
    this.env.screens.monitor.emissiveIntensity = lit ? 0.6 : 0;
    if (this.env.mailFlag) this.env.mailFlag.rotation.z = st.lore.unread.length ? 0 : -Math.PI / 2;
    // barn bins fill with stored produce
    const stored = Object.values(st.barn.produce).reduce((a, b) => a + b, 0);
    this.env.binFill.forEach((m, i) => { const f = clamp(stored / sim.barnCapacity() * 3 - i, 0, 1); m.visible = f > 0.02; m.scale.y = Math.max(0.01, f); m.position.y = 0.2 + f * 0.25; });
    // landmark details
    for (const [id, stake] of Object.entries(this.landmarks.stakes)) {
      const driven = !!st.lore.stakes[id];
      stake.rotation.z += ((driven ? 0 : 0.35) - stake.rotation.z) * Math.min(1, dt * 4);
      stake.userData.y0 ??= stake.position.y;
      stake.position.y += ((driven ? stake.userData.y0 - 0.45 : stake.userData.y0) - stake.position.y) * Math.min(1, dt * 4);
    }
    this.landmarks.chimes.forEach((c, i) => { c.rotation.z = Math.sin(this.time * (1.1 + i * 0.17) + i) * 0.1 * (0.4 + U.uWind.value); });

    // world views
    this.veg.update(focus);
    this.crops.update();
    if (this.structs.fenceDirty) this.structs.rebuildFences(sim);
    this.structs.update(dt, sim, this.time, env.night);
    this.creatures.update(sim, dt, { night: env.night > 0.5, cctv: this.mode === 'cctv' });
    this.animals.update(sim, dt, this.time);
    for (const f of st.structures) if (f.type === 'firepit' && f.lit) {
      const y = heightAt(f.x, f.z);
      if (Math.random() < dt * 40) this.fx.emit('fire', f.x, y + 0.2, f.z, { n: 1 });
      if (Math.random() < dt * 5) this.fx.emit('smoke', f.x, y + 1.0, f.z, { n: 1, wind: U.uWind.value });
    }
    // flares fx
    const fl = new Set();
    for (const f of sim.rt.flares) { const id = `${f.x.toFixed(2)},${f.z.toFixed(2)}`; fl.add(id); if (!this.fx.flares.has(id)) this.fx.addFlare(id, f.x, f.z); }
    for (const id of [...this.fx.flares.keys()]) if (!fl.has(id)) this.fx.removeFlare(id);
    // generator smoke
    for (const it of this.structs.items.values()) {
      if (it.running && Math.random() < dt * 3) this.fx.emit('smoke', it.s.x + 0.65, heightAt(it.s.x, it.s.z) + 0.8, it.s.z, { n: 1, wind: U.uWind.value });
      if (it.damaged && (it.s.type === 'generator') && Math.random() < dt * 2) this.fx.emit('smoke', it.s.x, heightAt(it.s.x, it.s.z) + 1.0, it.s.z, { n: 1 });
    }
    this.fx.update(dt, U.uWind.value);
    this.weather.update(dt, focus, st.weather, (bolt) => { this.sky.flash(bolt.strength); ui.onThunder?.(bolt); });
    this.lights.update(sim, this.structs, this.env, focus, env.night, dt);

    // flashlight
    const p = st.player;
    const on = p.flashlight && sim.playerAlive && this.mode === 'player';
    const focusBeam = st.owned.focus;
    const bat = clamp(p.battery / 25, 0.35, 1);
    const flicker = p.battery < 10 && Math.random() < 0.08 ? 0.3 : 1;
    this.flashlight.intensity = on ? (focusBeam ? 190 : 120) * bat * flicker : 0;
    this.flashlight.angle = focusBeam ? 0.3 : 0.38;
    this.flashlight.distance = focusBeam ? 55 : 42;
    this.flashSpill.intensity = on ? 0.5 : 0;

    // build ghost
    if (ui.ghost) { this.ghost.set(ui.ghost.type); this.ghost.update(ui.ghost.x, ui.ghost.z, ui.ghost.rot, ui.ghost.ok); }
    else this.ghost.set(null);

    // viewmodel
    const tool = currentTool(sim);
    this.vm.setTool(sim.playerAlive ? tool : null);
    const ambientAtPlayer = Math.min(1, lightAt(sim, p.x, p.z));
    this.vm.update(dt, {
      speed: sim.rt.player.speed, grounded: sim.rt.player.grounded, sprint: sim.rt.player.sprinting,
      lookDX: ui.lookDX || 0, lookDY: ui.lookDY || 0, flashlight: on, aiming: sim.rt.aiming,
      ambient: Math.max(0.05, ambientAtPlayer * (env.day > 0.5 ? 1 : 0.8)), sun: this.sky.sun.intensity * 0.5,
      hemiColor: this.sky.hemi.color, reduceMotion: this.settings.controls.reduceMotion,
    });
    if (sim.rt.player.repairTarget && sim.rt.player.repairT > 0 && Math.random() < dt * 4) this.vm.trigger('hammer');

    // CCTV camera placement
    if (this.mode === 'cctv' && this.cctvTarget) {
      const s = this.cctvTarget;
      this.cctvCam.position.set(s.x + Math.sin(s.rot) * 0.4, heightAt(s.x, s.z) + 3.3, s.z + Math.cos(s.rot) * 0.4);
      this.cctvCam.rotation.order = 'YXZ';
      this.cctvCam.rotation.set(-0.25, s.rot + Math.PI, 0);
      this.cctvCam.aspect = this.camera.aspect; this.cctvCam.updateProjectionMatrix();
    }

    // grading
    this.hurt = Math.max(0, this.hurt - dt * 0.8);
    this.chill = Math.max(0, this.chill - dt * 0.35);
    const gp = this.gradePass.uniforms;
    gp.uTime.value = this.time;
    gp.uHurt.value = this.settings.controls.reduceFlashing ? this.hurt * 0.4 : this.hurt;
    gp.uChill.value = this.chill;
    gp.uLowHealth.value = clamp((40 - p.health) / 40, 0, 1);
    gp.uFade.value = ui.fade ?? 0;
    gp.uCCTV.value = this.mode === 'cctv' ? 1 : 0;
    gp.uNV.value = this.mode === 'cctv' ? lerp(7, 1.2, env.day) : 1;
    gp.uExposure.value = 1;
    gp.uGrain.value = lerp(0.05, 0.015, env.day);
    gp.uVignette.value = lerp(0.5, 0.28, env.day);
    gp.uSat.value = lerp(0.72, 1.04, env.day) - env.cloud * 0.1;
    gp.uTint.value = [lerp(0.86, 1.02, env.day), lerp(0.94, 1.0, env.day), lerp(1.12, 0.96, env.day)];
    if (this.bloomPass) this.bloomPass.strength = lerp(0.45, 0.22, env.day);

    this.renderer.info.reset();
    this.composer.render(dt);
    this.stats = { calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles };
  }

  screenshotDataURL() { return this.canvas.toDataURL('image/jpeg', 0.85); }
}
