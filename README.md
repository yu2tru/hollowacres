# Hollow Acres

A first-person farming tycoon by day and survival horror by night.

You've bought the old Hollis farm in Corran County. During the day you plant, water, harvest and sell crops, take delivery contracts, buy land, tools and supplies, and build up the property. At 8 PM things come out of the woods. Some eat your crops, some smash your lights and machinery, and some come for you. Damage stays until you repair it. The previous owners left papers around the property that explain what's happening, and how it might end.

## Running it

**Quickest:** download `HollowAcres.html` from this repo and double-click it. It's the whole game in one file and works offline in a desktop browser with WebGL 2 (current Chrome, Edge, Firefox or Safari). Keyboard and mouse. Headphones recommended (3D audio).

Don't open the project's root `index.html` directly. That's the development page and only works through the dev server.

From source (Node 18+):

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # single-file build: dist/index.html (works from disk or any host)
npm run package    # build and refresh HollowAcres.html in the repo root
npm run preview    # serve the production build
```

The build is one self-contained HTML file (about 7.5 MB) with no external assets or network calls. Six authored 3D models (generator, truck, bed, hand pump, rocking chair, wheelbarrow) are embedded in it; every other texture, mesh and sound is generated procedurally at load time.

## First time?

A new farm opens with a short intro and the controls, then offers a tutorial: twelve steps played in the real game (move, read the letter, plant, water, how growth works, harvest and sell, buy an upgrade, fuel the generator, build a defence, survive the first night, repair, free play). Each step completes only when you've actually done it, a waypoint points to where to go, and progress is saved with the game. You can skip it and pick it back up from the pause menu.

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

## The farm

The property is a fenced compound in a clearing in the woods (north is up on the map):

| Area | Where | What it's for |
|---|---|---|
| Farmhouse | North-west | Home base: bed (sleep/save), laptop (shop, market, contracts, fields), security monitor, the first letters |
| Crop area | North-centre | Four blocks split by walkways. You start with the home field; the other three are cleared and tilled as you level up |
| Generator yard | North-east, fenced, gravel | Main generator, fuel shed, spare concrete pads for more generators |
| Storage barn | East | Storage bins, workbench, crate yard and shipping bin out front |
| Courtyard & fire pit | Centre | Paths meet here. The fire pit burns lumber for light all night without power |
| Animal pen | West, fenced | Coop and laying hens: eggs every morning |
| Water system | South-west, fenced | Pond, hand pump (fills the watering can), tanks, pump house |
| Solar field | South-east, fenced | Four panel rows that charge by day and feed the grid at night. Two start wrecked |
| Perimeter & main gate | All round / south | The first line of defence. The gate opens onto the driveway, county road and mailbox |

There's a 25-30 m clearing between the fence and the treeline, so at night you can see things coming, and decide where to light, trap and barricade.

## The game

**Day.** Six crops (wheat, potatoes, corn, tomatoes, strawberries, pumpkins), each with its own growth time, water needs, yield, price and regrowth. Plants only grow while watered. Rain waters for you, and sprinklers automate it. Market prices move each morning within ±25%, with one crop in demand each day. Contracts pay well above market. Farm level rises with lifetime earnings and unlocks crops, items and more fields. Three extra crop blocks add 113 plots, and more crops to defend. Hens lay eggs every morning (collect them at the coop), and more can be bought. Tool upgrades (galvanized can, push seeder, sickle) let you work whole rows at once. Time pauses while you browse menus during the day, and sleeping skips to 6 PM.

**Night.** Five creature types across three categories share one AI framework (navigation grid + A*, perception with sight cones, light and line of sight, hearing, memory). Each has its own brain:

| Creature | Category | Behaviour | Counters |
|---|---|---|---|
| Gnawer | Animal | Packs that raid crops, prefer potatoes and pumpkins. Each eats its fill and leaves. Avoids light and scarecrows unless the pack is big or starving. | Floodlights, scarecrows, traps (instant kill), flares |
| Drifter | Humanoid | Drawn to light, running generators and noise. Smashes them, breaks barricades and doors, chases you when it sees you. | Headshots, traps pin them, radio decoys pull them away |
| The Antlered | Animal | Rams generators, the barn, barricades and fences in straight-line charges, then is dazed. Ignores light. | Sidestep the charge, shotgun while dazed, traps stun |
| The Pale Farmhand | Humanoid | Hunts you, not the farm. Only moves while unobserved and won't walk into floodlight. Hit-and-run attacks. Breaks into a dark house. | Keep your eyes and light on it, stay lit, wound it to drive it off |
| The Hollow | Supernatural | Nearly invisible to the eye but plain on camera. Snuffs powered lights, mimics knocks, footsteps and whispers. Bullets pass through. | Hold the flashlight beam on it (3 times = gone for the night), iron chimes |

Nights escalate with days survived and with how much the farm has grown (the "tithe" owed). Rare nights change the rhythm (quiet nights, processions, hunger, blackouts). At first light everything retreats to the treeline.

**Defense.** The perimeter fence (Gnawers chew through it, Drifters and the Antlered smash it, the Hollow drifts through) and a main gate you can close. Barricades (upgradeable to reinforced), floodlights (upgradeable to halogen), power poles, generators, security cameras with motion alerts, leg-hold traps, scarecrows, sprinklers, radio decoys and iron chimes (unlocked by lore). Power is a real network: generators burn fuel in proportion to load, solar rows charge by day (less under cloud) and drain at night, poles extend range, overloads trip the breaker, and a destroyed, empty or flat power source darkens everything it feeds. The fire pit is unpowered light the Hollow can't put out. Weapons are a shovel, revolver, shotgun (upgrade) and road flares.

**Consequences.** Crops have health, hens can be taken from a broken coop, and damaged crops yield less. Ruined plots must be cleared. Structures have HP, and a destroyed barricade or door becomes a real gap in navigation. Repairs cost lumber, spare parts and money, and restore actual function. If you fall at night, you wake at dawn with a medical bill while the farm takes the rest of the night's damage. A county relief parcel and capped bills keep recovery possible after a disaster.

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
- **Mostly procedural assets.** Apart from six authored glTF models, all materials, meshes and sounds are generated. They share one palette and material strategy so the world stays coherent, but they are stylised compared with photoscanned content. More authored models can be added the same way: put the source .glb in a release, add it to `tools/optimize-models.mjs` (simplifies meshes, converts textures to WebP, meshopt-compresses geometry into `src/assets/models/`), then give it a size in `src/render/assets.js` and a matching collider in `src/data/layout.js`. If a model fails to load, the built-in one is used.
- **Creature animation** is procedural (gait cycles on simple rigs), not mocap.

## Testing

```bash
npm test                                   # 68 unit tests: farming, economy, structures, power, nav, AI, combat, save/load,
                                           # collision against every solid prop and building, jumping, the full tutorial played through
node tests/sim/playthrough.mjs 12 diligent # 12-day headless playthrough: active farmer who builds, repairs and fights
node tests/sim/playthrough.mjs 12 neglect  # 12-day run of a farmer who never defends (checks there's no death spiral)
node tests/e2e/tour.mjs barn,crops         # screenshot tour of named viewpoints into tests/e2e/tour/
node tests/e2e/collider-audit.mjs          # samples every visible surface and lists any no collider covers
npm run build && node tests/e2e/smoke.mjs --shots   # real browser (headless Chromium): loads the game, goes through the intro and tutorial start, renders day/dusk/night, spawns creatures, fails on any page error
```

The playthrough script save/load round-trips the whole game every evening, so persistence is exercised under real multi-night conditions.

Performance has only been measured with software rendering (SwiftShader) in CI-style headless Chromium. There the Low preset runs at about 30 ms/frame, which suggests large headroom on real GPUs, but no frame-rate target is promised for specific hardware. Turn on the FPS counter (Settings → Graphics → Show FPS) to measure on your own machine.
