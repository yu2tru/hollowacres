// Procedural WebAudio engine. Everything is synthesised: positional sound
// effects (HRTF), layered day/night ambience, creature signatures and a
// sparse adaptive score. No audio files needed.
const rand = (a, b) => a + Math.random() * (b - a);

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.loops = new Map();
    this.tension = 0;
    this.listener = { x: 0, y: 0, z: 0 };
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.bus = {};
    for (const k of ['sfx', 'amb', 'music', 'ui']) { this.bus[k] = ctx.createGain(); this.bus[k].connect(this.master); }
    // a shared reverb for outdoor space
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.5);
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.28;
    this.reverbSend.connect(this.reverb).connect(this.bus.sfx);
    this.makeNoise();
    this.applyVolumes();
    this.startAmbience();
    this.startMusic();
    this.ready = true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const v = this.settings.audio;
    this.master.gain.value = v.master;
    this.bus.sfx.gain.value = v.sfx;
    this.bus.amb.gain.value = v.ambience;
    this.bus.music.gain.value = v.music;
    this.bus.ui.gain.value = v.sfx * 0.8;
  }

  impulse(sec, decay) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  makeNoise() {
    const sr = this.ctx.sampleRate, len = sr * 3;
    const mk = (fn) => { const b = this.ctx.createBuffer(1, len, sr); fn(b.getChannelData(0)); return b; };
    this.white = mk((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.pink = mk((d) => { let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } });
    this.brown = mk((d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    // Karplus-Strong plucks for the daytime guitar motif
    this.plucks = {};
    for (const f of [98, 110, 123.5, 146.8, 164.8, 196, 220, 246.9, 293.7]) {
      const n = Math.floor(sr * 2.2), p = Math.floor(sr / f);
      const b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      const buf = new Float32Array(p);
      for (let i = 0; i < p; i++) buf[i] = Math.random() * 2 - 1;
      for (let i = 0; i < n; i++) { const j = i % p; const nx = (j + 1) % p; const v = buf[j]; buf[j] = 0.498 * (buf[j] + buf[nx]); d[i] = v * 0.6; }
      this.plucks[f] = b;
    }
  }

  // positional output node chain
  out(x, z, y = 1, opts = {}) {
    const ctx = this.ctx;
    if (x == null) { const g = ctx.createGain(); g.connect(opts.bus || this.bus.sfx); return g; }
    const pan = ctx.createPanner();
    pan.panningModel = this.settings.audio.hrtf === false ? 'equalpower' : 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = opts.ref || 3;
    pan.rolloffFactor = opts.rolloff || 1.1;
    pan.maxDistance = 400;
    pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z;
    pan.connect(opts.bus || this.bus.sfx);
    if (opts.reverb !== false) {
      const s = ctx.createGain(); s.gain.value = opts.wet ?? 0.5; pan.connect(s); s.connect(this.reverbSend);
    }
    const g = ctx.createGain();
    g.connect(pan);
    g._panner = pan;
    return g;
  }

  noiseBurst(dest, { type = 'white', dur = 0.2, gain = 0.5, filter = 'lowpass', freq = 2000, q = 1, attack = 0.002, freqEnd = null, at = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this[type];
    src.loopStart = 0; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  tone(dest, { type = 'sine', freq = 440, freqEnd = null, dur = 0.2, gain = 0.3, attack = 0.005, at = 0, detune = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // ---- listener -------------------------------------------------------------
  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    this.listener = pos;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  // ---- one-shot effects ---------------------------------------------------
  play(id, e = {}) {
    if (!this.ready) return;
    const near = e.x == null;
    const o = (opts) => this.out(e.x, e.z, e.y ?? 1, opts);
    switch (id) {
      case 'footstep': {
        const s = e.surface;
        const g = this.out(null);
        const vol = (e.sprint ? 0.32 : e.crouch ? 0.08 : 0.18);
        if (s === 'wood') { this.noiseBurst(g, { dur: 0.09, gain: vol, filter: 'bandpass', freq: 380, q: 2 }); this.tone(g, { freq: 120, freqEnd: 70, dur: 0.08, gain: vol * 0.5 }); }
        else if (s === 'gravel') this.noiseBurst(g, { dur: 0.14, gain: vol * 1.1, filter: 'highpass', freq: 1800, q: 0.7 });
        else if (s === 'dirt' || s === 'mud') this.noiseBurst(g, { type: 'pink', dur: 0.12, gain: vol, filter: 'lowpass', freq: s === 'mud' ? 500 : 900 });
        else this.noiseBurst(g, { type: 'pink', dur: 0.13, gain: vol * 0.8, filter: 'bandpass', freq: 2500, q: 0.6 });
        break;
      }
      case 'revolver': case 'shotgun': {
        const g = this.out(null);
        const big = id === 'shotgun';
        this.noiseBurst(g, { dur: big ? 0.5 : 0.35, gain: big ? 1.0 : 0.8, filter: 'lowpass', freq: 5000, freqEnd: 300 });
        this.tone(g, { freq: big ? 90 : 140, freqEnd: 40, dur: 0.25, gain: 0.8, type: 'sine' });
        const r = this.ctx.createGain(); r.gain.value = 0.9; r.connect(this.reverbSend);
        this.noiseBurst(r, { dur: 1.2, gain: 0.5, filter: 'lowpass', freq: 1200, at: 0.02 });
        break;
      }
      case 'dryfire': this.tone(this.out(null), { type: 'square', freq: 1800, dur: 0.03, gain: 0.08 }); break;
      case 'reload': { const g = this.out(null); for (let i = 0; i < 3; i++) this.noiseBurst(g, { dur: 0.04, gain: 0.15, filter: 'bandpass', freq: 3000, q: 4, at: 0.3 + i * 0.4 }); break; }
      case 'shell_in': this.noiseBurst(this.out(null), { dur: 0.05, gain: 0.18, filter: 'bandpass', freq: 2200, q: 3 }); break;
      case 'swing': this.noiseBurst(this.out(null), { type: 'pink', dur: 0.25, gain: 0.2, filter: 'bandpass', freq: 600, freqEnd: 1800, q: 1 }); break;
      case 'hit': { const g = o({ ref: 4 }); this.noiseBurst(g, { dur: 0.12, gain: 0.5, filter: 'lowpass', freq: 900 }); this.tone(g, { freq: 90, freqEnd: 50, dur: 0.12, gain: 0.4 }); break; }
      case 'hitmarker': this.tone(this.out(null, { bus: this.bus.ui }), { freq: e.kill ? 520 : 900, dur: 0.06, gain: 0.08, type: 'triangle' }); break;
      case 'water': { const g = o({ ref: 2 }); this.noiseBurst(g, { type: 'pink', dur: 0.9, gain: 0.25, filter: 'bandpass', freq: 1400, q: 0.8, attack: 0.08 }); break; }
      case 'plant': case 'dig': { const g = o({ ref: 2 }); this.noiseBurst(g, { type: 'brown', dur: 0.25, gain: 0.35, filter: 'lowpass', freq: 700 }); break; }
      case 'harvest': { const g = o({ ref: 2 }); this.noiseBurst(g, { type: 'pink', dur: 0.3, gain: 0.3, filter: 'bandpass', freq: 2200, q: 0.8 }); this.tone(g, { freq: 160, freqEnd: 90, dur: 0.1, gain: 0.2 }); break; }
      case 'hammer': { const g = o({ ref: 3 }); this.noiseBurst(g, { dur: 0.06, gain: 0.5, filter: 'bandpass', freq: 1500, q: 3 }); this.tone(g, { freq: 230, dur: 0.08, gain: 0.25, type: 'triangle' }); break; }
      case 'pump': { const g = o({ ref: 3 }); for (let i = 0; i < 3; i++) this.tone(g, { type: 'sawtooth', freq: 620, freqEnd: 480, dur: 0.18, gain: 0.05, at: i * 0.35 }); this.noiseBurst(g, { type: 'pink', dur: 1.2, gain: 0.3, filter: 'bandpass', freq: 900, at: 0.4, attack: 0.1 }); break; }
      case 'door_open': case 'door_close': {
        const g = o({ ref: 3 });
        if (e.big) { this.noiseBurst(g, { type: 'brown', dur: 1.4, gain: 0.5, filter: 'lowpass', freq: 400, attack: 0.2 }); this.tone(g, { type: 'sawtooth', freq: 70, dur: 1.2, gain: 0.05 }); break; }
        if (id === 'door_open') this.tone(g, { type: 'sawtooth', freq: rand(380, 520), freqEnd: rand(250, 320), dur: 0.6, gain: 0.04, attack: 0.1 });
        this.noiseBurst(g, { dur: 0.12, gain: 0.4, filter: 'lowpass', freq: 600, at: id === 'door_close' ? 0 : 0.5 });
        break;
      }
      case 'trap_set': this.noiseBurst(o({ ref: 2 }), { dur: 0.08, gain: 0.4, filter: 'bandpass', freq: 2500, q: 4 }); break;
      case 'trap_snap': { const g = o({ ref: 6 }); this.noiseBurst(g, { dur: 0.15, gain: 1, filter: 'highpass', freq: 1500 }); this.tone(g, { type: 'square', freq: 900, freqEnd: 300, dur: 0.15, gain: 0.25 }); break; }
      case 'smash': { const g = o({ ref: 6 }); this.noiseBurst(g, { dur: 0.25, gain: 0.8, filter: 'lowpass', freq: 1800, freqEnd: 400 }); this.tone(g, { freq: 70, freqEnd: 40, dur: 0.2, gain: 0.5 }); break; }
      case 'crash': { const g = o({ ref: 10 }); this.noiseBurst(g, { type: 'brown', dur: 0.9, gain: 1.2, filter: 'lowpass', freq: 600 }); this.noiseBurst(g, { dur: 0.4, gain: 0.6, filter: 'bandpass', freq: 1200, q: 0.8 }); break; }
      case 'bulb_pop': { const g = o({ ref: 5 }); this.noiseBurst(g, { dur: 0.05, gain: 0.8, filter: 'highpass', freq: 3000 }); for (let i = 0; i < 5; i++) this.tone(g, { freq: rand(3000, 6000), dur: 0.08, gain: 0.05, at: 0.05 + i * 0.04 }); break; }
      case 'gen_stop': { const g = o({ ref: 5 }); this.tone(g, { type: 'sawtooth', freq: 60, freqEnd: 15, dur: 1.5, gain: 0.3 }); break; }
      case 'click': this.tone(this.out(null, { bus: this.bus.ui }), { type: 'square', freq: 2400, dur: 0.02, gain: 0.05 }); break;
      case 'battery': case 'medkit': this.noiseBurst(this.out(null), { dur: 0.3, gain: 0.2, filter: 'bandpass', freq: 2000, q: 2 }); break;
      case 'land': this.noiseBurst(this.out(null), { type: 'brown', dur: 0.15, gain: 0.5, filter: 'lowpass', freq: 300 }); break;
      case 'hen': { const g = o({ ref: 4 }); for (let i = 0; i < 4; i++) this.tone(g, { type: 'square', freq: rand(700, 1100), freqEnd: rand(400, 600), dur: 0.12, gain: 0.05, at: i * 0.14 }); break; }
      case 'cluck': { const g = o({ ref: 2, rolloff: 1.5 }); for (let i = 0; i < 2; i++) this.tone(g, { type: 'triangle', freq: rand(380, 520), freqEnd: rand(300, 360), dur: 0.08, gain: 0.05, at: i * 0.18 }); break; }
      case 'fire_light': { const g = o({ ref: 3 }); this.noiseBurst(g, { type: 'pink', dur: 1.2, gain: 0.5, filter: 'lowpass', freq: 400, freqEnd: 2000, attack: 0.3 }); break; }
      case 'stake': { const g = this.out(null); for (let i = 0; i < 3; i++) this.tone(g, { type: 'triangle', freq: 180, freqEnd: 170, dur: 1.5, gain: 0.3, at: i * 0.5 }); break; }
      case 'flare': { const g = o({ ref: 3 }); this.noiseBurst(g, { dur: 2.5, gain: 0.25, filter: 'highpass', freq: 2500, attack: 0.05 }); break; }
      // ---- creatures ----
      case 'gnaw': { const g = o({ ref: 2.5, rolloff: 1.4 }); for (let i = 0; i < 3; i++) this.noiseBurst(g, { dur: 0.05, gain: 0.35, filter: 'bandpass', freq: rand(1500, 3000), q: 5, at: i * 0.09 }); break; }
      case 'gnawer_call': { const g = o({ ref: 6 }); this.tone(g, { type: 'sawtooth', freq: rand(900, 1300), freqEnd: rand(1600, 2200), dur: 0.35, gain: 0.08 }); this.tone(g, { type: 'square', freq: rand(1800, 2400), freqEnd: 900, dur: 0.25, gain: 0.03, at: 0.3 }); break; }
      case 'drifter_moan': {
        const g = o({ ref: 5 });
        const src = this.ctx.createOscillator(); src.type = 'sawtooth'; const t = this.ctx.currentTime;
        const f0 = rand(85, 120); src.frequency.setValueAtTime(f0, t); src.frequency.linearRampToValueAtTime(f0 * 0.8, t + 1.6);
        const f1 = this.ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = rand(450, 700); f1.Q.value = 6;
        const env = this.ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.25, t + 0.4); env.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        src.connect(f1).connect(env).connect(g); src.start(t); src.stop(t + 1.9);
        break;
      }
      case 'antler_snort': { const g = o({ ref: 8 }); this.noiseBurst(g, { dur: 0.5, gain: 0.7, filter: 'bandpass', freq: 500, q: 1.5, attack: 0.05 }); this.noiseBurst(g, { dur: 0.4, gain: 0.5, filter: 'bandpass', freq: 400, q: 1.5, at: 0.55 }); break; }
      case 'antler_charge': case 'antler_bellow': { const g = o({ ref: 12 }); this.tone(g, { type: 'sawtooth', freq: 70, freqEnd: 140, dur: 1.4, gain: 0.35, attack: 0.2 }); this.tone(g, { type: 'sawtooth', freq: 105, freqEnd: 190, dur: 1.4, gain: 0.2, attack: 0.2, detune: 20 }); this.noiseBurst(g, { type: 'brown', dur: 1.2, gain: 0.5, filter: 'lowpass', freq: 400 }); break; }
      case 'pale_click': { const g = o({ ref: 3, rolloff: 1.6 }); for (let i = 0; i < rand(3, 7); i++) this.noiseBurst(g, { dur: 0.02, gain: 0.4, filter: 'bandpass', freq: rand(2500, 4000), q: 8, at: i * rand(0.07, 0.14) }); break; }
      case 'pale_step': { const g = o({ ref: 2, rolloff: 1.5 }); this.noiseBurst(g, { type: 'pink', dur: 0.1, gain: 0.25, filter: 'lowpass', freq: 700 }); break; }
      case 'pale_hiss': { const g = o({ ref: 4 }); this.noiseBurst(g, { dur: 1.0, gain: 0.5, filter: 'highpass', freq: 3500, attack: 0.05 }); break; }
      case 'pale_vanish': { const g = o({ ref: 8 }); this.noiseBurst(g, { type: 'pink', dur: 1.2, gain: 0.25, filter: 'bandpass', freq: 300, freqEnd: 3000, attack: 0.9 }); break; }
      case 'hollow_burn': { const g = o({ ref: 4 }); this.noiseBurst(g, { dur: 0.25, gain: 0.25, filter: 'bandpass', freq: rand(4000, 7000), q: 2 }); break; }
      case 'hollow_banish': { const g = o({ ref: 10 }); [220, 233, 311, 330].forEach((f, i) => this.tone(g, { type: 'sine', freq: f, freqEnd: f * 0.5, dur: 2.5, gain: 0.12, attack: 0.05, at: i * 0.02 })); this.noiseBurst(g, { dur: 2, gain: 0.3, filter: 'bandpass', freq: 3000, freqEnd: 200 }); break; }
      case 'mimic': {
        const g = o({ ref: 2.5 });
        if (e.variant === 0) { for (let i = 0; i < 3; i++) { this.noiseBurst(g, { dur: 0.08, gain: 0.7, filter: 'lowpass', freq: 500, at: i * 0.32 }); this.tone(g, { freq: 110, freqEnd: 70, dur: 0.08, gain: 0.3, at: i * 0.32 }); } }
        else if (e.variant === 1) { for (let i = 0; i < 6; i++) this.noiseBurst(g, { type: 'pink', dur: 0.12, gain: 0.3, filter: 'lowpass', freq: 800, at: i * 0.55 }); }
        else { const t = this.ctx.currentTime; const n = this.ctx.createBufferSource(); n.buffer = this.pink; const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1400, t + 0.4); f.frequency.linearRampToValueAtTime(700, t + 0.9); const env = this.ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.6, t + 0.1); env.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); n.connect(f).connect(env).connect(g); n.start(t); n.stop(t + 1.2); }
        break;
      }
      case 'thunder': {
        const g = this.out(null, { bus: this.bus.amb });
        const d = (e.dist || 800) / 343;
        this.noiseBurst(g, { type: 'brown', dur: 4, gain: Math.min(1.2, 1600 / (e.dist + 200)), filter: 'lowpass', freq: 300, attack: 0.3, at: d });
        this.noiseBurst(g, { dur: 0.6, gain: Math.min(0.4, 400 / (e.dist + 100)), filter: 'lowpass', freq: 1500, at: d });
        break;
      }
      case 'ui': this.tone(this.out(null, { bus: this.bus.ui }), { type: 'triangle', freq: e.f || 660, dur: 0.07, gain: 0.07 }); break;
      case 'coin': { const g = this.out(null, { bus: this.bus.ui }); this.tone(g, { type: 'triangle', freq: 1320, dur: 0.12, gain: 0.07 }); this.tone(g, { type: 'triangle', freq: 1760, dur: 0.18, gain: 0.06, at: 0.07 }); break; }
      case 'alert': { const g = this.out(null, { bus: this.bus.ui }); this.tone(g, { type: 'sine', freq: 880, dur: 0.15, gain: 0.06 }); this.tone(g, { type: 'sine', freq: 660, dur: 0.2, gain: 0.06, at: 0.16 }); break; }
      case 'hurt': this.noiseBurst(this.out(null), { type: 'brown', dur: 0.25, gain: 0.6, filter: 'lowpass', freq: 400 }); break;
      case 'heartbeat': { const g = this.out(null, { bus: this.bus.ui }); this.tone(g, { freq: 55, freqEnd: 40, dur: 0.12, gain: 0.5 }); this.tone(g, { freq: 50, freqEnd: 38, dur: 0.12, gain: 0.35, at: 0.22 }); break; }
      case 'sting': { const g = this.out(null, { bus: this.bus.music }); [146.8, 155.6, 207.7].forEach((f) => this.tone(g, { type: 'sawtooth', freq: f, dur: 2.5, gain: 0.05, attack: 0.01 })); this.noiseBurst(g, { dur: 1.5, gain: 0.2, filter: 'bandpass', freq: 2500, freqEnd: 500 }); break; }
      case 'dawn': { const g = this.out(null, { bus: this.bus.music }); [196, 246.9, 293.7, 392].forEach((f, i) => this.tone(g, { type: 'sine', freq: f, dur: 6, gain: 0.05, attack: 1.5, at: i * 0.4 })); break; }
      case 'night': { const g = this.out(null, { bus: this.bus.music }); [73.4, 110, 116.5].forEach((f) => this.tone(g, { type: 'sawtooth', freq: f, dur: 7, gain: 0.04, attack: 2.5 })); break; }
    }
  }

  // ---- continuous loops ---------------------------------------------------
  startAmbience() {
    const ctx = this.ctx;
    const loop = (buf, filterType, freq, q, bus) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(bus || this.bus.amb);
      src.start(0, Math.random() * 2);
      return { src, f, g };
    };
    this.wind = loop(this.brown, 'lowpass', 500, 0.7);
    this.windHi = loop(this.pink, 'bandpass', 900, 0.6);
    this.rain = loop(this.pink, 'highpass', 900, 0.3);
    this.rainLow = loop(this.brown, 'lowpass', 300, 0.5);
    this.crickets = []; this.birdT = 1; this.critterT = 3; this.plinkT = 20;
    // cricket chorus: amplitude-modulated high sines
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.frequency.value = 4200 + i * 380;
      const am = ctx.createOscillator(); am.frequency.value = 18 + i * 5;
      const amG = ctx.createGain(); amG.gain.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0;
      const vca = ctx.createGain(); vca.gain.value = 0.5;
      am.connect(amG).connect(vca.gain);
      const pan = ctx.createStereoPanner(); pan.pan.value = (i - 1) * 0.7;
      o.connect(vca).connect(g).connect(pan).connect(this.bus.amb);
      o.start(); am.start();
      this.crickets.push({ g, slow: Math.random() * 10 });
    }
  }

  startMusic() {
    const ctx = this.ctx;
    this.drone = [];
    for (const [f, type] of [[55, 'sawtooth'], [82.4, 'sine'], [58.3, 'sawtooth']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rand(0.05, 0.12);
      const lg = ctx.createGain(); lg.gain.value = 3; lfo.connect(lg).connect(o.detune);
      const f1 = ctx.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(f1).connect(g).connect(this.bus.music); o.start(); lfo.start();
      this.drone.push({ g, f: f1 });
    }
    // high dissonant tension layer
    this.high = [];
    for (const f of [622, 659, 698]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const trem = ctx.createOscillator(); trem.frequency.value = rand(4, 7);
      const tg = ctx.createGain(); tg.gain.value = 0.5;
      const vca = ctx.createGain(); vca.gain.value = 0.5;
      trem.connect(tg).connect(vca.gain);
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(vca).connect(g).connect(this.bus.music); o.start(); trem.start();
      this.high.push(g);
    }
  }

  // positional continuous loops keyed by id (generators, decoys, hollow)
  setLoop(id, kind, x, z, active) {
    if (!this.ready) return;
    let L = this.loops.get(id);
    if (!active) { if (L) { L.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); if (!L.dying) { L.dying = true; setTimeout(() => { try { L.stop(); } catch {} this.loops.delete(id); }, 1500); } } return; }
    if (!L || L.dying) {
      const ctx = this.ctx;
      const out = this.out(x, z, 0.8, { ref: kind === 'generator' ? 4 : 3, rolloff: 1.2, wet: 0.2 });
      const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
      const nodes = [];
      if (kind === 'generator') {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
        const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 96.5;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
        const og = ctx.createGain(); og.gain.value = 0.15;
        o.connect(f); o2.connect(og).connect(f); f.connect(g);
        const n = ctx.createBufferSource(); n.buffer = this.brown; n.loop = true; const ng = ctx.createGain(); ng.gain.value = 0.6; n.connect(ng).connect(g);
        o.start(); o2.start(); n.start(); nodes.push(o, o2, n);
        g.gain.setTargetAtTime(0.22, ctx.currentTime, 0.4);
      } else if (kind === 'decoy') {
        const n = ctx.createBufferSource(); n.buffer = this.white; n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
        const ng = ctx.createGain(); ng.gain.value = 0.15; n.connect(f).connect(ng).connect(g);
        const notes = [196, 246.9, 293.7, 246.9, 220, 293.7];
        const o = ctx.createOscillator(); o.type = 'square';
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1100; f2.Q.value = 1;
        const og = ctx.createGain(); og.gain.value = 0.08; o.connect(f2).connect(og).connect(g);
        const t = ctx.currentTime;
        for (let i = 0; i < 180; i++) o.frequency.setValueAtTime(notes[i % notes.length], t + i * 0.5);
        n.start(); o.start(); nodes.push(n, o);
        g.gain.setTargetAtTime(0.5, ctx.currentTime, 0.1);
      } else if (kind === 'fire') {
        const n = ctx.createBufferSource(); n.buffer = this.pink; n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        n.connect(f).connect(g); n.start(); nodes.push(n);
        const c = ctx.createBufferSource(); c.buffer = this.white; c.loop = true;
        const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 3000;
        const cg = ctx.createGain(); cg.gain.value = 0;
        const t0 = ctx.currentTime;
        for (let i = 0; i < 400; i++) { const tt = t0 + i * 0.3 + Math.random() * 0.25; cg.gain.setValueAtTime(Math.random() < 0.5 ? 0.8 : 0, tt); cg.gain.setValueAtTime(0, tt + 0.02); }
        c.connect(cf).connect(cg).connect(g); c.start(); nodes.push(c);
        g.gain.setTargetAtTime(0.18, ctx.currentTime, 0.5);
      } else if (kind === 'hollow') {
        const n = ctx.createBufferSource(); n.buffer = this.white; n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 3;
        n.connect(f).connect(g);
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 41;
        const og = ctx.createGain(); og.gain.value = 0.8; o.connect(og).connect(g);
        n.start(); o.start(); nodes.push(n, o);
        g.gain.setTargetAtTime(0.25, ctx.currentTime, 1);
      }
      L = { g, out, stop: () => nodes.forEach((n) => n.stop()), kind };
      this.loops.set(id, L);
    }
    const p = L.out._panner;
    if (p) { p.positionX.value = x; p.positionZ.value = z; }
  }

  // per-frame: ambience mix and adaptive music
  update(dt, s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const day = s.day, night = 1 - day;
    // insects fall silent when something is close: a learnable cue
    const hush = s.hush || 0;
    this.wind.g.gain.setTargetAtTime(0.12 + s.wind * 0.35, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(300 + s.wind * 500 + Math.sin(t * 0.3) * 120, t, 0.5);
    this.windHi.g.gain.setTargetAtTime(s.wind * 0.06 * (0.6 + 0.4 * Math.sin(t * 0.21)), t, 0.8);
    this.rain.g.gain.setTargetAtTime(s.rain * (s.indoors ? 0.12 : 0.35), t, 0.6);
    this.rainLow.g.gain.setTargetAtTime(s.rain * 0.3, t, 0.6);
    this.crickets.forEach((c, i) => {
      c.slow += dt;
      const pulse = 0.5 + 0.5 * Math.sin(c.slow * (0.8 + i * 0.3));
      c.g.gain.setTargetAtTime(night * (1 - hush) * (1 - s.rain) * 0.012 * pulse, t, 0.4);
    });
    // birds by day
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = rand(0.8, 4) / Math.max(0.2, day);
      if (day > 0.4 && s.rain < 0.5 && !s.indoors) this.bird(s);
    }
    // distant critters at dusk/night (owls, dogs, ambiguous calls)
    this.critterT -= dt;
    if (this.critterT <= 0) {
      this.critterT = rand(14, 40);
      if (night > 0.6) this.nightCall(s);
    }
    // daytime: occasional quiet guitar phrase
    this.plinkT -= dt;
    if (this.plinkT <= 0) {
      this.plinkT = rand(70, 140);
      if (day > 0.7 && s.tension < 0.1) this.phrase();
    }
    // adaptive layers
    this.tension += (s.tension - this.tension) * Math.min(1, dt * 0.8);
    const dr = night * 0.03 + this.tension * 0.06;
    this.drone.forEach((d, i) => { d.g.gain.setTargetAtTime(dr * (i === 1 ? 0.6 : 1), t, 1.5); d.f.frequency.setTargetAtTime(150 + this.tension * 500, t, 1); });
    this.high.forEach((g, i) => g.gain.setTargetAtTime(Math.max(0, this.tension - 0.45) * 0.02, t, 1));
    // heartbeat at low health
    this.hbT = (this.hbT || 0) - dt;
    if (s.health < 35 && this.hbT <= 0) { this.hbT = 0.6 + s.health / 60; this.play('heartbeat'); }
  }

  bird(s) {
    const a = Math.random() * Math.PI * 2, r = rand(15, 50);
    const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
    const g = this.out(x, z, rand(4, 12), { ref: 6, bus: this.bus.amb, wet: 0.3 });
    const kind = Math.floor(Math.random() * 3);
    const base = rand(2200, 4200);
    const n = kind === 0 ? 3 : kind === 1 ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const at = i * (kind === 1 ? 0.09 : 0.18);
      this.tone(g, { type: 'sine', freq: base * (kind === 2 ? 1 : rand(0.9, 1.15)), freqEnd: base * (kind === 0 ? 1.4 : kind === 2 ? 0.7 : 1.2), dur: kind === 2 ? 0.35 : 0.08, gain: 0.05, at });
    }
  }

  nightCall(s) {
    const a = Math.random() * Math.PI * 2, r = rand(80, 160);
    const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
    const g = this.out(x, z, 3, { ref: 10, bus: this.bus.amb, wet: 0.8 });
    const k = Math.random();
    if (k < 0.4) { // owl
      this.tone(g, { type: 'sine', freq: 380, freqEnd: 360, dur: 0.35, gain: 0.08, attack: 0.05 });
      this.tone(g, { type: 'sine', freq: 360, freqEnd: 340, dur: 0.6, gain: 0.07, attack: 0.08, at: 0.45 });
    } else if (k < 0.65) { // distant dog
      for (let i = 0; i < 3; i++) this.noiseBurst(g, { dur: 0.15, gain: 0.25, filter: 'bandpass', freq: 700, q: 3, at: i * 0.35 });
    } else { // something that isn't quite a coyote
      this.tone(g, { type: 'sawtooth', freq: 600, freqEnd: 1100, dur: 1.2, gain: 0.04, attack: 0.3 });
      this.tone(g, { type: 'sawtooth', freq: 620, freqEnd: 300, dur: 1.4, gain: 0.03, attack: 0.3, at: 1.0 });
    }
  }

  phrase() {
    const notes = [[146.8, 0], [196, 0.5], [246.9, 1.0], [220, 1.6], [196, 2.4], [164.8, 3.2], [146.8, 4.2]];
    const g = this.out(null, { bus: this.bus.music });
    const now = this.ctx.currentTime;
    for (const [f, at] of notes) {
      const src = this.ctx.createBufferSource(); src.buffer = this.plucks[f] || this.plucks[146.8];
      const gg = this.ctx.createGain(); gg.gain.value = 0.22;
      src.connect(gg).connect(g); src.start(now + at);
    }
  }
}

