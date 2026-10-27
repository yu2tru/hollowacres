// Title screen, new game, load, settings, pause, loading, fades and ending.
import { h, clear, keyName } from './dom.js';
import { fmtMoney, fmtTime } from '../core/math.js';
import { SLOT_KEYS, slotInfo, deleteSlot } from '../sim/save.js';
import { PRESETS } from '../render/renderer.js';
import { BINDING_LABELS, DEFAULT_BINDINGS, saveSettings } from '../settings.js';

export class Menus {
  constructor(root, app) {
    this.app = app;
    this.root = h('div.menus');
    root.append(this.root);
    this.screen = null;
  }

  clear() { clear(this.root); this.screen = null; }

  set(el, name) { clear(this.root); this.root.append(el); this.screen = name; }

  // ----------------------------------------------------------------- title
  title() {
    const hasSave = SLOT_KEYS.some((k) => slotInfo(k));
    const latest = SLOT_KEYS.map((k) => ({ k, i: slotInfo(k) })).filter((x) => x.i).sort((a, b) => b.i.savedAt - a.i.savedAt)[0];
    const el = h('div.menu-screen.solid.interactive', {},
      h('div.menu-col', {},
        h('h1.title', {}, 'Hollow', h('br'), 'Acres', h('small', {}, 'Corran County · 1987')),
        h('div.tagline', {}, 'By day, build something worth protecting. By night, find out what it costs to keep it.'),
        h('div.menu-list', {},
          latest ? h('button.menu-btn', { onclick: () => this.app.loadGame(latest.k) }, 'Continue', h('span.s', {}, `Day ${latest.i.day} · ${fmtTime(latest.i.minute)} · ${fmtMoney(latest.i.money)}`)) : null,
          h('button.menu-btn', { onclick: () => this.newGame() }, 'New farm'),
          h('button.menu-btn', { disabled: !hasSave, onclick: () => this.load(() => this.title()) }, 'Load'),
          h('button.menu-btn', { onclick: () => this.settings(() => this.title()) }, 'Settings'),
          h('button.menu-btn', { onclick: () => this.about() }, 'How to play'))),
      h('div.menu-foot', {}, 'Best with headphones. Keyboard & mouse.'));
    this.set(el, 'title');
  }

  newGame() {
    const opts = { difficulty: this.app.settings.gameplay.difficulty, dayLength: this.app.settings.gameplay.dayLength };
    const seg = (key, values) => h('div.seg', {}, values.map(([v, label]) => h(`button${opts[key] === v ? '.on' : ''}`, { onclick: (e) => { opts[key] = v; [...e.target.parentNode.children].forEach((b) => b.classList.toggle('on', b === e.target)); } }, label)));
    const el = h('div.menu-screen.solid.interactive', {}, h('div.menu-col', {},
      h('h1.title', { style: { fontSize: '48px' } }, 'A new farm'),
      h('div.tagline', {}, 'You bought the old Hollis place sight unseen. The realtor seemed relieved.'),
      h('div.form-row', {}, h('span', {}, 'Difficulty', h('span.hint', {}, 'Normal is the intended experience.')), seg('difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])),
      h('div.form-row', {}, h('span', {}, 'Day length', h('span.hint', {}, 'Normal ≈ 12 real minutes per day.')), seg('dayLength', [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']])),
      h('div.form-row', {}, h('span', {}, 'Save slot', h('span.hint', {}, 'Autosaves every morning.')), h('span.muted', {}, 'Slot 1')),
      h('div.menu-list', { style: { marginTop: '24px' } },
        h('button.menu-btn', { onclick: () => { this.app.settings.gameplay.difficulty = opts.difficulty; this.app.settings.gameplay.dayLength = opts.dayLength; saveSettings(this.app.settings); this.app.newGame(opts); } }, 'Begin'),
        h('button.menu-btn', { onclick: () => this.title() }, 'Back'))));
    this.set(el, 'new');
  }

  load(back) {
    const rows = SLOT_KEYS.map((k) => {
      const i = slotInfo(k);
      return h('div.form-row', {}, h('span', {}, k === 'autosave' ? 'Autosave' : `Slot ${k.slice(4)}`, h('span.hint', {}, i ? `Day ${i.day} · ${fmtTime(i.minute)} · ${fmtMoney(i.money)} · ${new Date(i.savedAt).toLocaleString()}` : 'Empty')),
        h('span', {}, h('button.btn', { disabled: !i, onclick: () => this.app.loadGame(k) }, 'Load'), ' ', h('button.btn.ghost', { disabled: !i, onclick: () => { if (confirm('Delete this save?')) { deleteSlot(k); this.load(back); } } }, 'Delete')));
    });
    const el = h('div.menu-screen.solid.interactive', {}, h('div.menu-col', { style: { width: 'min(640px, calc(100vw - 64px))' } },
      h('h1.title', { style: { fontSize: '48px' } }, 'Load'), h('div', { style: { marginTop: '24px' } }, rows),
      h('div.menu-list', { style: { marginTop: '24px' } }, h('button.menu-btn', { onclick: back }, 'Back'))));
    this.set(el, 'load');
  }

  save(back) {
    const rows = ['slot1', 'slot2', 'slot3'].map((k) => {
      const i = slotInfo(k);
      return h('div.form-row', {}, h('span', {}, `Slot ${k.slice(4)}`, h('span.hint', {}, i ? `Day ${i.day} · ${fmtTime(i.minute)} · ${fmtMoney(i.money)}` : 'Empty')),
        h('button.btn', { onclick: () => { const err = this.app.saveGame(k); if (!err) this.save(back); } }, i ? 'Overwrite' : 'Save'));
    });
    const el = h('div.menu-screen.interactive', {}, h('div.menu-col', { style: { width: 'min(640px, calc(100vw - 64px))' } },
      h('h1.title', { style: { fontSize: '48px' } }, 'Save'), h('div', { style: { marginTop: '24px' } }, rows),
      h('div.menu-list', { style: { marginTop: '24px' } }, h('button.menu-btn', { onclick: back }, 'Back'))));
    this.set(el, 'save');
  }

  // ----------------------------------------------------------------- pause
  pause() {
    const sim = this.app.sim;
    const el = h('div.menu-screen.interactive', {}, h('div.menu-col', {},
      h('h1.title', { style: { fontSize: '56px' } }, 'Paused'),
      h('div.tagline', {}, `Day ${sim.state.time.day}, ${fmtTime(sim.state.time.minute)}`),
      h('div.menu-list', {},
        h('button.menu-btn', { onclick: () => this.app.resume() }, 'Resume'),
        h('button.menu-btn', { onclick: () => { const err = this.app.canSave(); if (err) this.app.hud.toast(err, 'warn'); else this.save(() => this.pause()); } }, 'Save game', h('span.s', {}, this.app.canSave() || 'Daytime only')),
        h('button.menu-btn', { onclick: () => this.load(() => this.pause()) }, 'Load game'),
        h('button.menu-btn', { onclick: () => this.settings(() => this.pause()) }, 'Settings'),
        h('button.menu-btn', { onclick: () => this.about(() => this.pause()) }, 'Controls & tips'),
        h('button.menu-btn', { onclick: () => { if (confirm('Quit to title? Unsaved progress since the last save will be lost.')) this.app.quitToTitle(); } }, 'Quit to title'))));
    this.set(el, 'pause');
  }

  // --------------------------------------------------------------- settings
  settings(back, tab = 'graphics') {
    const S = this.app.settings;
    const apply = () => { saveSettings(S); this.app.applySettings(); };
    const row = (label, hint, control) => h('div.form-row', {}, h('span', {}, label, hint ? h('span.hint', {}, hint) : null), control);
    const select = (obj, key, opts, after) => h('select', { onchange: (e) => { const v = e.target.value; obj[key] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) || v === '' ? v : +v; after?.(); apply(); } }, opts.map(([v, l]) => h('option', { value: String(v), selected: String(obj[key]) === String(v) }, l)));
    const check = (obj, key) => h('input', { type: 'checkbox', checked: !!obj[key], onchange: (e) => { obj[key] = e.target.checked; apply(); } });
    const range = (obj, key, min, max, step) => h('input', { type: 'range', min, max, step, value: obj[key], oninput: (e) => { obj[key] = +e.target.value; apply(); } });
    const G = S.graphics, C = S.controls, A = S.audio, P = S.gameplay;
    const markCustom = () => { G.preset = 'custom'; };
    let body;
    if (tab === 'graphics') {
      body = [
        row('Quality preset', 'Sets everything below.', select(G, 'preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['epic', 'Epic'], ['custom', 'Custom']], () => { if (PRESETS[G.preset]) Object.assign(G, PRESETS[G.preset]); this.settings(back, 'graphics'); })),
        row('Render scale', 'Lower for more FPS.', select(G, 'renderScale', [[0.5, '50%'], [0.67, '67%'], [0.75, '75%'], [0.9, '90%'], [1, '100%']], markCustom)),
        row('Shadows', null, select(G, 'shadows', [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['epic', 'Epic']], markCustom)),
        row('Ambient occlusion', 'Screen-space GTAO.', select(G, 'ao', [[false, 'Off'], [true, 'On']], markCustom)),
        row('Bloom', null, select(G, 'bloom', [[false, 'Off'], [true, 'On']], markCustom)),
        row('Anti-aliasing', null, select(G, 'aa', [['off', 'Off'], ['fxaa', 'FXAA'], ['smaa', 'SMAA']], markCustom)),
        row('Foliage density', 'Grass and near-tree detail.', select(G, 'foliage', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['epic', 'Epic']], markCustom)),
        row('View distance', null, select(G, 'viewDistance', [['near', 'Near'], ['medium', 'Medium'], ['far', 'Far']], markCustom)),
        row('Effects', 'Particles, rain density.', select(G, 'effects', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], markCustom)),
        row('Texture quality', 'Applies after restarting the game.', select(G, 'textures', [['low', 'Low'], ['high', 'High']])),
        row('Frame rate limit', null, select(G, 'fpsLimit', [[0, 'Unlimited (vsync)'], [30, '30'], [60, '60'], [120, '120']])),
        row('Fullscreen', null, h('button.btn', { onclick: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); } }, 'Toggle')),
        row('Show FPS', null, check(P, 'showFps')),
      ];
    } else if (tab === 'controls') {
      body = [
        row('Mouse sensitivity', null, range(C, 'sensitivity', 0.2, 3, 0.05)),
        row('Invert vertical look', null, check(C, 'invertY')),
        row('Field of view', `${C.fov}°`, range(C, 'fov', 60, 100, 1)),
        row('Head bob', null, check(C, 'headBob')),
        row('Reduce camera motion', 'Less shake, sway and bob.', check(C, 'reduceMotion')),
        row('Reduce flashing', 'Softer lightning & damage flashes.', check(C, 'reduceFlashing')),
        h('div.section-title', { style: { marginTop: '18px' } }, 'Key bindings'),
        Object.keys(DEFAULT_BINDINGS).map((k) => row(BINDING_LABELS[k], null, h('button.btn', { onclick: (e) => this.rebind(k, e.target) }, keyName(C.bindings[k])))),
        h('div.form-row', {}, h('span.muted', {}, 'Hotbar: 1-9 · Use/fire: left mouse · Aim: right mouse · Pause: Esc'), h('button.btn.ghost', { onclick: () => { C.bindings = { ...DEFAULT_BINDINGS }; apply(); this.settings(back, 'controls'); } }, 'Reset keys')),
      ];
    } else if (tab === 'audio') {
      body = [row('Master', null, range(A, 'master', 0, 1, 0.05)), row('Effects', null, range(A, 'sfx', 0, 1, 0.05)), row('Ambience', null, range(A, 'ambience', 0, 1, 0.05)), row('Music', null, range(A, 'music', 0, 1, 0.05)), row('3D audio (HRTF)', 'Best with headphones.', check(A, 'hrtf'))];
    } else {
      body = [
        row('Show objectives & hints', null, check(P, 'hints')),
        row('Default difficulty', 'For new games.', select(P, 'difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])),
        row('Day length', 'Takes effect on next load.', select(P, 'dayLength', [['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']])),
      ];
    }
    const tabs = [['graphics', 'Graphics'], ['controls', 'Controls'], ['audio', 'Audio'], ['gameplay', 'Gameplay']];
    const el = h('div.overlay.interactive', {}, h('div.panel', {},
      h('header', {}, h('h2', {}, 'Settings'), h('span', { style: { marginLeft: 'auto' } }), h('button.close', { onclick: back }, 'Back')),
      h('div.tabs', {}, tabs.map(([id, l]) => h(`button.tab${id === tab ? '.on' : ''}`, { onclick: () => this.settings(back, id) }, l))),
      h('div.body', {}, body)));
    const wrap = h('div.menu-screen' + (this.app.sim ? '' : '.solid'), {}, el);
    this.set(wrap, 'settings');
    this.settingsBack = back;
  }

  rebind(action, btn) {
    btn.textContent = 'Press a key…';
    this.app.input.onKey = (e) => {
      this.app.input.onKey = null;
      if (e.code !== 'Escape') { this.app.settings.controls.bindings[action] = e.code; saveSettings(this.app.settings); }
      btn.textContent = keyName(this.app.settings.controls.bindings[action]);
      return true;
    };
  }

  about(back) {
    const b = this.app.settings.controls.bindings;
    const k = (a) => keyName(b[a]);
    const el = h('div.overlay.interactive', {}, h('div.panel', {},
      h('header', {}, h('h2', {}, 'How to play'), h('span', { style: { marginLeft: 'auto' } }), h('button.close', { onclick: back || (() => this.title()) }, 'Back')),
      h('div.body', {},
        h('div.keyhelp', {},
          [[`${k('forward')}${k('left')}${k('back')}${k('right')}`, 'Move'], [k('sprint'), 'Sprint'], [k('crouch'), 'Crouch (quieter, harder to see)'], [k('jump'), 'Jump'],
            [k('interact'), 'Interact / harvest'], ['LMB', 'Use tool / fire'], ['RMB', 'Aim'], [k('reload'), 'Reload'], [k('flashlight'), 'Flashlight'], [k('cycleSeed'), 'Change seed type'],
            ['1-9', 'Hotbar'], [k('build'), 'Build mode'], [k('ledger'), 'Farm ledger & journal'], [k('map'), 'Map'], [k('tablet'), 'Camera tablet (upgrade)'], ['Esc', 'Pause']].map(([a, b2]) => h('div', {}, h('span', {}, b2), h('kbd', {}, a)))),
        h('div.section-title', { style: { marginTop: '18px' } }, 'The day'),
        h('div.ds', {}, 'Plant seeds on tilled plots, keep them watered (fill the can at the well pump), harvest when ripe, and sell at the shipping bin or through contracts on the laptop. Buy land, tools and supplies at Feed & Supply (laptop, 6 AM - 8 PM). Sleeping in bed skips to 6 PM.'),
        h('div.section-title', {}, 'The night'),
        h('div.ds', {}, 'From 8 PM things come out of the woods. Some eat your crops, some smash lights and machines, some come for you. Keep the generator fuelled - light keeps some of them away and draws others in. Build barricades, traps, floodlights and cameras. At first light they go back to the trees.'),
        h('div.section-title', {}, 'Afterwards'),
        h('div.ds', {}, 'Damage stays. Repair it with the hammer and materials. If you fall at night you wake at dawn with a medical bill while the farm takes the rest of the night\'s damage. Read what the previous owners left behind - it tells you how each creature works, and how this might end.'))));
    this.set(h('div.menu-screen' + (this.app.sim ? '' : '.solid'), {}, el), 'about');
  }

  loading(step, pct) {
    if (this.screen !== 'loading') {
      this.set(h('div.loading', {}, h('div.title', {}, 'Hollow Acres'), h('div.step'), h('div.bar', {}, h('i'))), 'loading');
    }
    this.root.querySelector('.step').textContent = step;
    this.root.querySelector('.bar > i').style.width = `${pct}%`;
  }

  clickToPlay() {
    this.set(h('div.interactive', { style: { position: 'absolute', inset: 0 }, onclick: () => this.app.resume() }, h('div.click-to-play', {}, 'Click to continue', h('div.muted', {}, 'Esc for menu'))), 'click');
  }

  fade(title, text) {
    this.set(h('div.fade-msg', {}, h('h2', {}, title), h('p', {}, text)), 'fade');
  }

  ending(onContinue) {
    const st = this.app.sim.state;
    const el = h('div.fade-msg.interactive', { style: { background: 'radial-gradient(ellipse at center, #2a2418 0%, #050404 80%)' } },
      h('h2', {}, 'The line holds.'),
      h('p', {}, 'The sun comes up over Hollow Acres and nothing walks back into the trees, because nothing is left out there to walk. The stakes are cold iron again. The stone is only a stone.'),
      h('p', {}, `You held the farm for ${st.stats.nights} nights and earned ${fmtMoney(st.earned)}. Elias Hollis wasn't brave enough. You were.`),
      h('p.muted', {}, 'The woods will still be dark at night. Some of what lives there is just hungry. But the account is closed.'),
      h('button.btn.big', { style: { marginTop: '20px' }, onclick: onContinue }, 'Keep farming'));
    this.set(el, 'ending');
  }
}
