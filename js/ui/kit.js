// Small HTML builders shared by every screen. Each returns a string; screens combine them into a panel.
// Anything that came from the player (seed text, names) goes through esc().
import { BOONS, RARITIES, RELICS, RELIC_SLOTS, TEMPER, WEAPON_ICONS } from "../data/gear.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** A button. `data` becomes data-* attributes. `sub` is a dimmer second line. */
export function btn({ id = "", label, cls = "", disabled = false, data = {}, autofocus = false, sub = "", type = "button" }) {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join("");
  return `<button type="${type}" class="btn ${cls}"${id ? ` id="${id}"` : ""}${attrs}${disabled ? " disabled" : ""}${autofocus ? " autofocus" : ""}>${label}${sub ? `<span class="btn-sub">${sub}</span>` : ""}</button>`;
}

/** A labelled range input. `fmt` shows the current value to the right. */
export function slider({ id, label, min, max, step, value, fmt = (v) => `${Math.round(v * 100)}%` }) {
  return `<label class="field slider" for="${id}"><span class="field-label">${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" /><output for="${id}">${fmt(value)}</output></label>`;
}

export function toggle({ id, label, checked, hint = "" }) {
  return `<label class="field check" for="${id}"><input type="checkbox" id="${id}" ${checked ? "checked" : ""} /><span class="field-label">${label}</span>${hint ? `<small>${hint}</small>` : ""}</label>`;
}

export function select({ id, label, options, value }) {
  return `<label class="field select" for="${id}"><span class="field-label">${label}</span><select id="${id}">${options
    .map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`)
    .join("")}</select></label>`;
}

export function panel({ title, sub = "", body, cls = "" }) {
  return `<div class="panel ${cls}">${title ? `<h2>${title}</h2>` : ""}${sub ? `<p class="sub">${sub}</p>` : ""}${body}</div>`;
}

/** Label and value pairs in the stats grid. */
export function statList(rows) {
  return `<dl class="stats">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

/** An item icon from the shared sheet. `assets` supplies the sprite-sheet geometry. */
export function icon(assets, name, px = 32, cls = "") {
  return `<span class="ico ${cls}" style="${assets.iconStyle(name, px)}" role="img" aria-label="${esc(name)}"></span>`;
}

/** Icon, title and description on one row. Used by rewards, gear lists and the Boon choice. */
export function itemRow(assets, { icon: name, title, desc = "" }, px = 32) {
  return `<span class="item">${icon(assets, name, px)}<span class="item-text"><b>${esc(title)}</b>${desc ? `<span>${esc(desc)}</span>` : ""}</span></span>`;
}

/** What the player carries: weapon, relics and Boons, with icons. */
export function gearSummary(assets, sim) {
  const w = sim.gear.weapon;
  const weapon = w
    ? itemRow(assets, { icon: WEAPON_ICONS[sim.character]?.[Math.max(0, RARITIES.findIndex((r) => r.id === w.rarity))] ?? "long sword", title: w.name, desc: `${w.label}${w.temper ? `, tempered ${w.temper}/${TEMPER.max}` : ""}, +${Math.round((w.damage + w.temper * TEMPER.perLevel) * 100)}% damage` }, 28)
    : `<p class="dim">No weapon yet</p>`;
  const list = (ids, table, empty) => (ids.length ? ids.map((id) => itemRow(assets, { icon: table[id].icon, title: table[id].name, desc: table[id].desc }, 24)).join("") : `<p class="dim">${empty}</p>`);
  return `<div class="gear">
    <div><h3>Weapon</h3>${weapon}<p class="dim">Bone Dust ${sim.boneDust}</p></div>
    <div><h3>Relics ${sim.gear.relics.length}/${RELIC_SLOTS}</h3>${list(sim.gear.relics, RELICS, "None found")}</div>
    <div><h3>Boons</h3>${list(sim.gear.boons, BOONS, "Defeat a Herald")}</div>
  </div>`;
}

/** The legend for telegraph colors, used on the controls screen and the Yard board. */
export const TELEGRAPH_LEGEND = `<p class="legend-line"><span class="t-gold">Gold</span> parry it. <span class="t-red">Red</span> dodge it. <span class="t-violet">Violet</span> leave the area. <span class="t-white">White</span> grab: dodge only.</p>`;
