import { createNewState } from '../../src/sim/state.js';
import { GameSim } from '../../src/sim/game.js';

export function newSim(opts = {}) {
  const st = createNewState({ seed: opts.seed ?? 1234, difficulty: opts.difficulty });
  if (opts.minute != null) st.time.minute = opts.minute;
  const sim = new GameSim(st, { headless: true, ...opts.simOpts });
  return sim;
}
export function step(sim, seconds, input = {}, dt = 0.1) {
  for (let t = 0; t < seconds; t += dt) sim.update(dt, input);
}
