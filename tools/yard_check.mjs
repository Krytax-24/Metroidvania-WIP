// Checks the Training Yard: every "reach" drill goal is reachable on foot with the right abilities, then a bot plays the
// combat drills for each lead. Run with: node tools/yard_check.mjs
import { Sim } from "../js/sim/sim.js";
import { ReachGraph, STAND } from "../js/gen/reach.js";
import { CONSERVATIVE } from "../js/gen/physics.js";
import { ABILITY_IDS } from "../js/gen/config.js";
import { buildPracticeMap } from "../js/gen/practiceMap.js";
import { emptyInput } from "../js/sim/types.js";
import { KIT_ORDER } from "../js/data/kits.js";
import { ticks } from "../js/data/tunables.js";

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failed++;
};

// 1. Reachability, room by room, from the left door's standing cell.
const map = buildPracticeMap();
for (const room of map.rooms) {
  const t = room.tiles;
  const hooks = t.entities.filter((e) => e.kind === "hook");
  const g = new ReachGraph(t.fg, t.w, t.h, new Set(ABILITY_IDS), CONSERVATIVE, hooks);
  const start = room.id === 0 ? { x: 6, y: 17 } : { x: 2, y: 17 };
  const reach = g.reach([g.key(start.x, start.y, STAND)]);
  for (const e of t.entities.filter((e) => e.kind === "marker")) {
    const near = [-1, 0, 1].some((dx) => [STAND, 1, 2, 3].some((k) => reach.has(g.key(e.x + dx, e.y, k))));
    ok(near, `room ${room.id}: marker ${e.id} reachable`);
  }
}

// 2. A bot per combat drill. It teleports beside a post and presses the right keys.
const press = (sim, keys, held = []) => {
  const f = emptyInput();
  for (const k of keys) f.pressed[k] = f.held[k] = true;
  for (const k of held) f.held[k] = true;
  sim.step(f);
};
const idle = (sim, n) => {
  for (let i = 0; i < n; i++) sim.step(emptyInput());
};
const place = (sim, x) => {
  const p = sim.player;
  p.body.x = x - p.body.w / 2;
  p.body.vx = 0;
  p.body.vy = 0;
  idle(sim, 3);
};
const done = (sim, id) => sim.practice.drills.find((d) => d.id === id)?.done;
const post = (sim, type) => sim.enemies.find((e) => e.def.id === type);

for (const lead of KIT_ORDER) {
  const sim = new Sim({ seed: "yard", tier: 1, character: lead, practice: true, allAbilities: true });
  const dummy = sim.enemies.find((e) => e.def.id === "dummy");
  // Chain and heavy on the near post.
  place(sim, dummy.body.x + 0.5 + 1.6);
  sim.player.facing = -1;
  for (let rep = 0; rep < 6 && !done(sim, "chain"); rep++) {
    for (let i = 0; i < 3; i++) {
      press(sim, ["attack"]);
      idle(sim, 14);
    }
    idle(sim, 40);
  }
  ok(done(sim, "chain"), `${lead}: three hit chain`);
  for (let rep = 0; rep < 4 && !done(sim, "heavy"); rep++) {
    for (let i = 0; i < 70; i++) press(sim, i === 0 ? ["heavy"] : [], ["heavy"]);
    idle(sim, 60);
  }
  ok(done(sim, "heavy"), `${lead}: heavy hit`);
  for (let i = 0; i < 4; i++) {
    press(sim, ["dodge"]);
    idle(sim, 50);
  }
  ok(done(sim, "dodge"), `${lead}: dodge three times`);
  // Parry the gold sweep: press parry a little before the swing lands.
  const gold = post(sim, "drill_gold");
  place(sim, gold.body.x + 0.5 + 2);
  sim.player.facing = -1;
  for (let i = 0; i < 1800 && !done(sim, "parry"); i++) {
    const lead6 = ticks(gold.attack?.startupMs ?? 650) - 6;
    press(sim, gold.state === "windup" && gold.t >= lead6 ? ["parry"] : []);
  }
  ok(done(sim, "parry"), `${lead}: parry the gold sweep (${sim.practice.drills.find((d) => d.id === "parry").progress}/3)`);
  // Dodge the red lunge and the white grab: roll just before the strike.
  for (const [type, id, goalTele] of [["drill_red", "evade", "unparryable"], ["drill_grab", "grab", "grab"]]) {
    const post0 = post(sim, type);
    place(sim, post0.body.x + 0.5 + 1.8);
    sim.player.facing = -1;
    for (let i = 0; i < 2400 && !done(sim, id); i++) {
      const lead = ticks(post0.attack?.startupMs ?? 750) - 9;
      press(sim, post0.state === "windup" && post0.t >= lead ? ["dodge"] : []);
    }
    ok(done(sim, id), `${lead}: ${goalTele} evade (${id})`);
  }
  // Parry, then riposte on the stagger.
  place(sim, gold.body.x + 0.5 + 2);
  sim.player.facing = -1;
  for (let i = 0; i < 1800 && !done(sim, "riposte"); i++) {
    const lead6 = ticks(gold.attack?.startupMs ?? 650) - 6;
    if (gold.state === "stagger") press(sim, ["attack"]);
    else press(sim, gold.state === "windup" && gold.t >= lead6 ? ["parry"] : []);
  }
  ok(done(sim, "riposte"), `${lead}: riposte`);
  // Skill, Ultimate and Flask.
  place(sim, dummy.body.x + 0.5 + 3);
  sim.player.facing = -1;
  idle(sim, 90);
  for (let tries = 0; tries < 5 && !done(sim, "skill"); tries++) {
    sim.player.fervor = 100;
    press(sim, ["skill"]);
    idle(sim, 90);
  }
  ok(done(sim, "skill"), `${lead}: skill`);
  sim.player.resolve = 100;
  press(sim, ["ultimate"]);
  idle(sim, 120);
  ok(done(sim, "ultimate"), `${lead}: ultimate`);
  sim.player.hp = sim.player.maxHp * 0.5;
  press(sim, ["flask"]);
  idle(sim, 120);
  ok(done(sim, "flask"), `${lead}: flask`);
  // Lead specific drills.
  const farPost = sim.enemies.filter((e) => e.def.id === "dummy").sort((a, b) => b.body.x - a.body.x)[0];
  const skillOn = (x, tries = 6) => {
    for (let t = 0; t < tries; t++) {
      place(sim, x);
      sim.player.facing = 1;
      idle(sim, 40);
      sim.player.fervor = 100;
      press(sim, ["skill"]);
      idle(sim, 120);
    }
  };
  const meleeChain = (fast) => {
    place(sim, dummy.body.x + 0.5 + 1.6);
    sim.player.facing = -1;
    for (let rep = 0; rep < 8; rep++) {
      for (let i = 0; i < 3; i++) {
        press(sim, ["attack"]);
        idle(sim, fast ? 7 : 14);
      }
      idle(sim, 40);
    }
  };
  if (lead === "gino") {
    place(sim, farPost.body.x + 0.5 - 7);
    sim.player.facing = 1;
    skillOn(farPost.body.x + 0.5 - 7);
    ok(done(sim, "gino_dagger"), "gino: dagger from afar");
    meleeChain(true);
    ok(done(sim, "gino_fast"), "gino: fast chain");
  }
  if (lead === "mage") {
    place(sim, farPost.body.x + 0.5 - 5.6);
    sim.player.facing = 1;
    for (let i = 0; i < 6 && !done(sim, "mage_reach"); i++) {
      press(sim, ["attack"]);
      idle(sim, 40);
    }
    ok(done(sim, "mage_reach"), "mage: strike from a distance");
    skillOn(dummy.body.x + 0.5 - 4);
    idle(sim, 240);
    ok(done(sim, "mage_cloud"), "mage: arcane cloud ticks");
  }
  if (lead === "knight") {
    place(sim, gold.body.x + 0.5 + 2);
    sim.player.facing = -1;
    for (let i = 0; i < 4000 && !done(sim, "knight_wall"); i++) {
      const lead6 = ticks(gold.attack?.startupMs ?? 650) - 6;
      press(sim, gold.state === "windup" && gold.t >= lead6 ? ["parry"] : []);
    }
    ok(done(sim, "knight_wall"), "knight: five parries");
    place(sim, dummy.body.x + 0.5 + 1.6);
    sim.player.facing = -1;
    for (let t = 0; t < 12 && !done(sim, "knight_bash"); t++) {
      sim.player.fervor = 100;
      press(sim, ["skill"]);
      idle(sim, 60);
    }
    ok(done(sim, "knight_bash"), "knight: shield bash breaks a stance");
  }
  ok(sim.player.state !== "dead", `${lead}: alive after drills`);
}
console.log(failed ? `${failed} FAILED` : "all clear");
process.exit(failed ? 1 : 0);
