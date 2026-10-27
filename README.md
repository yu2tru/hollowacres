# Hollow Acres

A first-person farming tycoon by day and survival horror by night.

You've bought the old Hollis farm in Corran County. During the day you plant, water, harvest and sell crops, take delivery contracts, buy land, tools and supplies, and build up the property. At 8 PM things come out of the woods. Some eat your crops, some smash your lights and machinery, and some come for you. Damage stays until you repair it. The previous owners left papers around the property that explain what's happening, and how it might end.

## Running it

Requirements: Node 18+ and a desktop browser with WebGL 2 (current Chrome, Edge, Firefox or Safari). Keyboard and mouse. Headphones recommended (3D audio).

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # production build in dist/ (static files, host anywhere)
npm run preview    # serve the production build
```

`dist/` is a self-contained static site with no external assets or network calls. Every texture, mesh and sound is generated procedurally at load time.

## Controls

| Action | Default |
|---|---|
| Move / sprint / crouch / jump | WASD / Shift / Ctrl (or C) / Space |
| Interact, harvest | E |
| Use tool, fire | Left mouse |
| Aim | Right mouse |
| Hotbar | 1-9 or mouse wheel |
| Reload | R |
| Flashlight | F |
| Change seed type | Q |
| Build mode | B (LMB place, R or wheel rotate, 1-0 choose, RMB/B/Esc exit) |
| Farm ledger (inventory, property, journal, bestiary, map) | Tab |
| Map | M |
| Camera tablet (upgrade) | V |
| Pause | Esc |

All keys can be rebound in Settings → Controls. Mouse sensitivity, invert Y, FOV, head bob, reduced camera motion and reduced flashing are also there.

## The game

**Day.** Six crops (wheat, potatoes, corn, tomatoes, strawberries, pumpkins), each with its own growth time, water needs, yield, price and regrowth. Plants only grow while watered. Rain waters for you, and sprinklers automate it. Market prices move each morning within ±25%, with one crop in demand each day. Contracts pay well above market. Farm level rises with lifetime earnings and unlocks crops, items and land. Three extra parcels add 123 plots, and more ground to defend. Tool upgrades (galvanized can, push seeder, sickle) let you work whole rows at once. Time pauses while you browse menus during the day, and sleeping skips to 6 PM.

**Night.** Five creature types across three categories share one AI framework (navigation grid + A*, perception with sight cones, light and line of sight, hearing, memory). Each has its own brain:

| Creature | Category | Behaviour | Counters |
|---|---|---|---|
| Gnawer | Animal | Packs that raid crops, prefer potatoes and pumpkins. Each eats its fill and leaves. Avoids light and scarecrows unless the pack is big or starving. | Floodlights, scarecrows, traps (instant kill), flares |
| Drifter | Humanoid | Drawn to light, running generators and noise. Smashes them, breaks barricades and doors, chases you when it sees you. | Headshots, traps pin them, radio decoys pull them away |
| The Antlered | Animal | Rams generators, the barn, barricades and fences in straight-line charges, then is dazed. Ignores light. | Sidestep the charge, shotgun while dazed, traps stun |
| The Pale Farmhand | Humanoid | Hunts you, not the farm. Only moves while unobserved and won't walk into floodlight. Hit-and-run attacks. Breaks into a dark house. | Keep your eyes and light on it, stay lit, wound it to drive it off |
| The Hollow | Supernatural | Nearly invisible to the eye but plain on camera. Snuffs powered lights, mimics knocks, footsteps and whispers. Bullets pass through. | Hold the flashlight beam on it (3 times = gone for the night), iron chimes |

Nights escalate with days survived and with how much the farm has grown (the "tithe" owed). Rare nights change the rhythm (quiet nights, processions, hunger, blackouts). At first light everything retreats to the treeline.

**Defense.** Barricades (upgradeable to reinforced), floodlights (upgradeable to halogen), power poles, generators, security cameras with motion alerts, leg-hold traps, scarecrows, sprinklers, radio decoys and iron chimes (unlocked by lore). Power is a real network: generators burn fuel in proportion to load, poles extend range, overloads trip the breaker, and a destroyed or empty generator darkens everything it feeds. Weapons are a shovel, revolver, shotgun (upgrade) and road flares.

**Consequences.** Crops have health, and damaged crops yield less. Ruined plots must be cleared. Structures have HP, and a destroyed barricade or door becomes a real gap in navigation. Repairs cost lumber, spare parts and money, and restore actual function. If you fall at night, you wake at dawn with a medical bill while the farm takes the rest of the night's damage. A county relief parcel and capped bills keep recovery possible after a disaster.

**Mystery.** Nine documents (house, barn, a cabin, a chapel ruin, a dry well, a survey marker, the Tithe Stone, and letters that arrive by mail) reveal the 1891 covenant, the bestiary weaknesses and the way out: drive the four iron boundary stakes home, offer a pumpkin at the Tithe Stone, and survive the Last Harvest. Then the game continues in a calmer free-play mode.

## Architecture

```
src/
  core/      rng, math, noise, event bus
  data/      crops, items, buildables, creatures, lore, world layout (single source of truth)
  sim/       pure gameplay simulation, no DOM or three.js:
             game (orchestrator), clock & weather, farming, economy, structures & power,
             world (collision), nav (A* grid), player, interact, director, creatures/, save
  render/    three.js presentation: terrain, sky, vegetation, buildings, crops, structures,
             creatures, viewmodel, particles, weather, light pool, post-processing
  audio/     procedural WebAudio: HRTF spatial SFX, ambience beds, adaptive score
  ui/        HUD, panels, menus (plain DOM)
  input/     keyboard/mouse, pointer lock, rebinding
  app.js     session lifecycle, main loop, build mode, sim→UI/audio glue
```

The simulation emits events (sounds, hits, alerts) and the renderer, audio and UI subscribe. Because it never depends on them, the whole game (AI, combat, power, economy, multi-day nights) runs headless in Node for testing.

Saves are versioned JSON in `localStorage` (three slots plus an autosave every morning and when you sleep). Runtime-only data (colliders, nav grid, AI) is rebuilt on load. Loads are validated and migrated, and corrupt or future-version saves are rejected with a message. Saving is disabled at night.

## Graphics settings

Presets are Low, Medium, High and Epic (auto-detected on first run), plus individual controls: render scale, shadows (off to 4K cascade-free sun shadow), GTAO ambient occlusion, bloom, FXAA/SMAA, foliage density, view distance, effects, texture quality, frame-rate cap and fullscreen. Lighting includes a physical sky with moving sun and moon, an image-based environment refreshed from the sky, exponential fog tied to time and weather, a fixed-size pool of real spot/point lights assigned to the nearest active floodlights, windows and flares, a shadow-casting flashlight, fake volumetric light cones, ACES tone mapping with night exposure adaptation, and a grading pass (vignette, grain, damage/chill overlays, CCTV night-vision for cameras).

### Compromises (and why)

- **Engine.** The brief suggested Unreal Engine 5. It can't run, build or be tested in this headless Linux environment, and delivering an untestable UE5 project would break the "test before claiming done" requirement. Three.js + Vite gives real-time 3D, a fully testable simulation and a game that runs on any PC with a browser.
- **No ray tracing.** WebGL has no hardware RT. The "advanced lighting" equivalents are GTAO, sky-driven image-based lighting, PCF soft shadows and bloom. The core look doesn't depend on any of them.
- **Procedural assets.** No art assets were available, so all materials, meshes and sounds are generated. They share one palette and material strategy so the world stays coherent, but they are stylised compared with photoscanned content. This is the biggest gap against "photorealistic", and swapping in authored glTF models and textures is the natural next step. The data/layout and view modules are structured for it.
- **Creature animation** is procedural (gait cycles on simple rigs), not mocap.

## Testing

```bash
npm test                                   # 27 unit tests: farming, economy, structures, power, nav, AI, combat, save/load
node tests/sim/playthrough.mjs 12 diligent # 12-day headless playthrough: active farmer who builds, repairs and fights
node tests/sim/playthrough.mjs 12 neglect  # 12-day run of a farmer who never defends (checks there's no death spiral)
npm run build && node tests/e2e/smoke.mjs --shots   # real browser (headless Chromium): loads the game, renders day/dusk/night, spawns creatures, fails on any page error
```

The playthrough script save/load round-trips the whole game every evening, so persistence is exercised under real multi-night conditions.

Performance has only been measured with software rendering (SwiftShader) in CI-style headless Chromium. There the Low preset runs at about 30 ms/frame, which suggests large headroom on real GPUs, but no frame-rate target is promised for specific hardware. Turn on the FPS counter (Settings → Graphics → Show FPS) to measure on your own machine.
