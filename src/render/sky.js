// Sky dome (physical scattering), clouds, stars, moon, sun & moon lights,
// fog and hemisphere light, all driven by time of day and weather.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { sunState } from '../sim/clock.js';
import { WEATHER_TYPES } from '../sim/clock.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { U } from './materials.js';
import { glowTexture } from './textures.js';

const C = (h) => new THREE.Color(h);

export class SkySystem {
  constructor(scene, quality) {
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    this.sky.material.depthWrite = false;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    // cloud layer dome
    this.cloudUniforms = {
      uTime: U.uTime, uCover: { value: 0.2 }, uSunDir: { value: new THREE.Vector3() },
      uLight: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.5, 0.5, 0.55) }, uOpacity: { value: 1 },
      uWind: U.uWind,
    };
    const cg = new THREE.SphereGeometry(4000, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const cm = new THREE.ShaderMaterial({
      uniforms: this.cloudUniforms, transparent: true, depthWrite: false, side: THREE.BackSide,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform float uTime, uCover, uOpacity, uWind; uniform vec3 uSunDir, uLight, uShade;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
        void main(){
          if (vDir.y <= 0.0) discard;
          vec2 uv = vDir.xz / (vDir.y + 0.12) * 1.6;
          vec2 drift = vec2(uTime * 0.004 * (0.5 + uWind), uTime * 0.0015);
          float d = fbm(uv + drift);
          float d2 = fbm(uv * 2.3 - drift * 1.7);
          float dens = smoothstep(1.0 - uCover - 0.15, 1.0 - uCover + 0.35, d * 0.75 + d2 * 0.35);
          float sunFacing = max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))));
          vec3 col = mix(uLight, uShade, smoothstep(0.3, 1.0, dens) * 0.8);
          col += uLight * pow(sunFacing, 6.0) * 0.25 * (1.0 - dens);
          float horizon = smoothstep(0.0, 0.18, vDir.y);
          gl_FragColor = vec4(col, dens * horizon * uOpacity);
        }`,
    });
    this.clouds = new THREE.Mesh(cg, cm);
    this.clouds.renderOrder = -1;
    scene.add(this.clouds);

    // stars
    const n = 2200, sp = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, y = Math.random() * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(a) * r * 3800; sp[i * 3 + 1] = y * 3800; sp[i * 3 + 2] = Math.sin(a) * r * 3800;
      sz[i] = Math.random() < 0.05 ? 3.2 : 1.4 + Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float size; varying float vS; uniform float uTime; void main(){ vS = size; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * (0.9 + 0.2*sin(uTime*3.0 + position.x)); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uOpacity; varying float vS; void main(){ vec2 c = gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(c)); gl_FragColor = vec4(vec3(0.85,0.9,1.0), a*uOpacity); }`,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -2;
    scene.add(this.stars);

    // moon disc + halo
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(128, 6), color: 0xdfe6ff, transparent: true, depthWrite: false, fog: false }));
    this.moon.scale.setScalar(130);
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(128, 1.5), color: 0x6b7da8, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.moonHalo.scale.setScalar(900);
    scene.add(this.moon, this.moonHalo);

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 0.6);
    scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0xaabbcc, 0.004);
    scene.fog = this.fog;
    this.sunDir = new THREE.Vector3();
    this.lightning = 0;
    this.setShadowQuality(quality);
  }

  setShadowQuality(q) {
    const size = { off: 0, low: 1024, medium: 2048, high: 2048, epic: 4096 }[q] ?? 2048;
    this.sun.castShadow = size > 0;
    if (size) {
      this.sun.shadow.mapSize.set(size, size);
      const ext = q === 'epic' ? 70 : q === 'high' ? 60 : 45;
      const cam = this.sun.shadow.camera;
      cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = 1; cam.far = 400;
      cam.updateProjectionMatrix();
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
  }

  // minute: game time; weather: state.weather; focus: player pos
  update(minute, weather, focus, dt) {
    const s = sunState(minute);
    const elev = s.elevation; // ~-0.95..0.95
    const az = s.azimuth;
    const sunPhi = elev * Math.PI * 0.5; // elevation angle
    const sx = Math.sin(az) * Math.cos(sunPhi), sy = Math.sin(sunPhi), sz = -Math.cos(az) * Math.cos(sunPhi) * 0.6 - 0.25;
    this.sunDir.set(sx, sy, sz).normalize();
    const wDef = WEATHER_TYPES[weather.current] || WEATHER_TYPES.clear;
    const wPrev = WEATHER_TYPES[weather.prev] || wDef;
    const b = clamp(weather.blend ?? 1, 0, 1);
    const cloud = lerp(wPrev.cloud, wDef.cloud, b);
    const fogW = lerp(wPrev.fog, wDef.fog, b);
    const day = smoothstep(-0.1, 0.18, elev);
    const golden = smoothstep(0.35, 0.02, elev) * smoothstep(-0.12, 0.05, elev);

    // sky shader
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    u.turbidity.value = lerp(4, 14, cloud);
    u.rayleigh.value = lerp(1.2, 0.4, cloud) + golden * 0.8;
    this.sky.material.uniforms.mieCoefficient.value = lerp(0.003, 0.012, cloud);

    // clouds
    const cu = this.cloudUniforms;
    cu.uCover.value = lerp(0.18, 0.95, cloud);
    cu.uSunDir.value.copy(this.sunDir);
    const lightCol = new THREE.Color().setRGB(1, 0.97, 0.92).lerp(C(0xffa266), golden * 0.8).multiplyScalar(lerp(0.08, 1.0, day));
    cu.uLight.value.copy(lightCol).lerp(C(0x9aa0a8).multiplyScalar(lerp(0.06, 0.8, day)), cloud * 0.6);
    cu.uShade.value.copy(lightCol).multiplyScalar(0.45).lerp(C(0x3a3e44).multiplyScalar(lerp(0.05, 0.7, day)), cloud);
    cu.uOpacity.value = lerp(0.55, 1.0, cloud);
    this.clouds.position.copy(focus);
    this.sky.position.copy(focus);

    // stars & moon
    const night = 1 - smoothstep(-0.2, 0.05, elev);
    this.starMat.uniforms.uOpacity.value = night * (1 - cloud * 0.9);
    this.stars.position.copy(focus);
    const md = new THREE.Vector3(-this.sunDir.x * 0.6 + 0.3, Math.max(0.35, -this.sunDir.y * 0.8 + 0.25), -this.sunDir.z * 0.6 - 0.45).normalize();
    this.moonDir = md;
    this.moon.position.copy(focus).addScaledVector(md, 3200);
    this.moonHalo.position.copy(this.moon.position);
    this.moon.material.opacity = night * (1 - cloud * 0.85);
    this.moonHalo.material.opacity = night * 0.22 * (1 - cloud * 0.5);

    // sun / moon light (single shadowed directional)
    const useMoon = elev < -0.04;
    const dir = useMoon ? md : this.sunDir;
    this.sun.position.copy(focus).addScaledVector(dir, 150);
    this.sun.target.position.copy(focus);
    // snap shadow camera to texels to avoid shimmering
    const sunInt = lerp(0, 3.6, smoothstep(-0.02, 0.3, elev)) * (1 - cloud * 0.72);
    const moonInt = 0.32 * night * (1 - cloud * 0.6);
    this.sun.intensity = useMoon ? moonInt : sunInt;
    this.sun.color.copy(useMoon ? C(0x8fa6d8) : C(0xfff3e2).lerp(C(0xff9c5a), golden));

    // hemisphere ambient
    const skyCol = C(0xa7c3e8).lerp(C(0xffb07a), golden * 0.5).lerp(C(0x9ba3ad), cloud * 0.7);
    const nightSky = C(0x1a2438);
    this.hemi.color.copy(nightSky).lerp(skyCol, day);
    this.hemi.groundColor.copy(C(0x0d0c0b)).lerp(C(0x5a4c38), day);
    this.hemi.intensity = lerp(0.42, 0.62, day) * (1 - cloud * 0.15) + this.lightning * 4;

    // fog
    const fogDay = C(0xb4c4d4).lerp(C(0xe0b48c), golden * 0.6).lerp(C(0xa7adb3), cloud * 0.8);
    const fogNight = C(0x0b0f17).lerp(C(0x161a20), fogW);
    this.fog.color.copy(fogNight).lerp(fogDay, day);
    if (this.lightning > 0) this.fog.color.lerp(C(0xbfc8ff), this.lightning * 0.6);
    const base = lerp(0.0016, 0.0045, cloud) + fogW * lerp(0.016, 0.032, 1 - day * 0.4);
    this.fog.density = base + night * 0.012 + golden * 0.0015;
    this.lightning = Math.max(0, this.lightning - dt * 6);

    this.daylight = day;
    this.night = night;
    this.cloud = cloud;
    this.golden = golden;
    return { day, night, cloud, golden, useMoon };
  }

  flash(strength = 1) { this.lightning = Math.max(this.lightning, strength); }
}
