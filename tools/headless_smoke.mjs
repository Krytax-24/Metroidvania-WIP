// Headless check: generate Tiers, run the simulation with random input, report problems.
import { generateTier } from '../js/gen/index.js';
import { Sim } from '../js/sim/sim.js';
import { ACTIONS, emptyInput } from '../js/sim/types.js';

const seeds = process.argv.slice(2, 3).length ? [process.argv[2]] : ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
const ticksPerRun = Number(process.argv[3] ?? 3600);
let problems = 0;
for (const seed of seeds) {
  for (const character of ['gino', 'knight', 'mage']) {
  for (const tier of [1, 2, 3]) {
    const t0 = performance.now();
    let sim;
    try {
      sim = new Sim({ seed, tier, character, allAbilities: true });
    } catch (e) {
      console.log(`FAIL generate ${seed} T${tier}: ${e.message}`);
      problems++;
      continue;
    }
    const genMs = Math.round(performance.now() - t0);
    let s = 12345 + seed.length * 7 + tier;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const held = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    try {
      for (let i = 0; i < ticksPerRun; i++) {
        const inp = emptyInput();
        for (const a of ACTIONS) {
          const was = held[a];
          if (rnd() < 0.04) held[a] = !held[a];
          inp.held[a] = held[a];
          inp.pressed[a] = held[a] && !was;
          inp.released[a] = !held[a] && was;
        }
        sim.step(inp);
        sim.drainEvents();
      }
      const p = sim.player;
      console.log(`ok   ${seed} ${character} T${tier}: gen ${genMs} ms, rooms ${sim.map.rooms.length}, ${ticksPerRun} ticks, hp ${Math.round(p.hp)}, room ${sim.currentRoom}, kills ${sim.kills}`);
    } catch (e) {
      console.log(`FAIL run ${seed} T${tier}: ${e.stack}`);
      problems++;
    }
  }
  }
}
console.log(problems ? `${problems} problem(s)` : 'all clear');
process.exit(problems ? 1 : 0);
