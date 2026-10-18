// Story, rewards and save checks. Every quest of every Tier goes through accept, progress and turn-in; every reward
// table is rolled; a snapshot is restored and must then play out identically. Run with: node tools/story_check.mjs
import { readFileSync } from "node:fs";
import { Sim } from "../js/sim/sim.js";
import { emptyInput } from "../js/sim/types.js";
import { WEAPON_ICONS, REWARD_ICONS } from "../js/data/gear.js";
import { NPCS, QUESTS, REWARDS, DIALOGUE, CUTSCENES, TIER_QUESTS } from "../js/data/story.js";

const manifest = JSON.parse(readFileSync(new URL("../assets/manifest.json", import.meta.url)));
const icons = new Set(Object.keys(manifest.icons.names));
let failed = 0;
const ok = (cond, msg) => {
  if (!cond) {
    failed++;
    console.log(`FAIL ${msg}`);
  }
  return cond;
};
let checks = 0;
const check = (cond, msg) => {
  checks++;
  return ok(cond, msg);
};

// Data integrity.
for (const i of [...Object.values(WEAPON_ICONS).flat(), ...Object.values(REWARD_ICONS)]) check(icons.has(i), `icon ${i} exists in the sheet`);
for (const [id, n] of Object.entries(NPCS)) check(manifest.sprites[n.sprite], `NPC ${id}: sprite ${n.sprite} exists`);
for (const [id, d] of Object.entries(DIALOGUE)) {
  check(d.nodes[d.start({ status: "offered" })] || d.start({ status: "offered" }), `dialogue ${id} has a start node`);
  for (const [nid, node] of Object.entries(d.nodes)) for (const c of node.choices ?? []) if (c.next) check(d.nodes[c.next], `dialogue ${id}.${nid} -> ${c.next} exists`);
}
for (const [id, c] of Object.entries(CUTSCENES)) check(c.beats.length > 0, `cutscene ${id} has beats`);
for (const tierList of Object.values(TIER_QUESTS)) for (const q of tierList) check(QUESTS[q], `quest ${q} defined`);

// Every quest, every Tier, several seeds.
for (const tier of [1, 2, 3]) {
  for (const seed of ["a", "b", "c", "d"]) {
    const s = new Sim({ seed, tier, character: "knight" });
    const qs = Object.keys(s.story.quests);
    check(qs.length >= 1, `T${tier} ${seed}: has quests`);
    for (const q of qs) {
      check(s.story.accept(q), `T${tier} ${seed}: accept ${q}`);
      const g = QUESTS[q].goal;
      if (g.type === "item") s.story.note("item", { id: q });
      else if (g.type === "talk") for (const n of s.story.npcs.filter((n) => n.id === "wisp")) s.talk(n.uid);
      else if (g.type === "rest_new") for (let i = 0; i < g.n; i++) s.story.note("rest", { room: 100 + i });
      else for (let i = 0; i < g.n; i++) s.story.note(g.type === "elite" ? "kill" : g.type, { elite: true });
      check(s.story.state(q).status === "ready", `T${tier} ${seed}: ${q} reaches ready`);
      const r = s.story.turnIn(q);
      check(r && r.title && icons.has(r.icon), `T${tier} ${seed}: ${q} gives a reward with a real icon`);
    }
    // A snapshot restores to the same story, and both copies then play out identically.
    const snap = JSON.parse(JSON.stringify(s.snapshot()));
    const r2 = Sim.restore({ seed, tier, character: "knight" }, snap);
    check(JSON.stringify(r2.story.snapshot()) === JSON.stringify(s.story.snapshot()), `T${tier} ${seed}: story snapshot round trip`);
    check(r2.player.level === s.player.level && r2.ichor === s.ichor, `T${tier} ${seed}: carry round trip`);
  }
}

// Determinism: same seed, same inputs, same result. A restored sim keeps pace with the original.
const walk = (sim, n) => {
  for (let i = 0; i < n; i++) {
    const f = emptyInput();
    f.held.right = f.held[i % 90 < 45 ? "right" : "left"] = true;
    f.pressed.jump = i % 50 === 0;
    f.held.jump = i % 50 < 20;
    f.pressed.attack = f.held.attack = i % 30 === 0;
    sim.step(f);
  }
};
for (const character of ["gino", "knight", "mage"]) {
  const a = new Sim({ seed: "det", tier: 2, character });
  const b = new Sim({ seed: "det", tier: 2, character });
  walk(a, 900);
  walk(b, 900);
  check(JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot()), `${character}: same seed and inputs give the same state`);
  // Checkpoints are taken at a Sanctuary, so restore from a fresh sim's snapshot and compare 600 ticks of play.
  const fresh = new Sim({ seed: "det", tier: 2, character });
  const c = Sim.restore({ seed: "det", tier: 2, character }, JSON.parse(JSON.stringify(fresh.snapshot())));
  walk(fresh, 600);
  walk(c, 600);
  check(fresh.player.cx === c.player.cx && fresh.player.hp === c.player.hp && fresh.kills === c.kills, `${character}: restored sim plays out like the original (x ${fresh.player.cx} vs ${c.player.cx})`);
}

// Reward tables: every table, many rolls, no bad icons or empty titles.
for (const id of Object.keys(REWARDS)) {
  const s = new Sim({ seed: "x", tier: 2, character: "mage" });
  for (let i = 0; i < 60; i++) {
    const r = s.story.grant(id, `t${i}`);
    check(r && r.title && icons.has(r.icon), `${id} roll ${i} is valid`);
  }
}

console.log(failed ? `${failed} FAILED of ${checks}` : `all clear (${checks} checks)`);
process.exit(failed ? 1 : 0);
