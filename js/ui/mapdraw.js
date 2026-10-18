// The map screen's canvas drawing: explored rooms, Sanctuaries, ability gates and the player's dropped Ichor.
import { GEN } from "../gen/index.js";
import { ABILITY_COLORS } from "../data/palette.js";

export function drawMap(cv, s) {
  const ctx = cv.getContext("2d");
  const m = s.map;
  const seen = new Set(s.visited);
  const outline = new Set();
  for (const e of m.edges) {
    if (seen.has(e.a) && !seen.has(e.b) && e.kind !== "secret") outline.add(e.b);
    if (seen.has(e.b) && !seen.has(e.a) && e.kind !== "secret") outline.add(e.a);
  }
  let x0 = 99;
  let y0 = 99;
  let x1 = 0;
  let y1 = 0;
  for (const r of m.rooms) {
    if (!seen.has(r.id) && !outline.has(r.id)) continue;
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  const cw = Math.min(cv.width / Math.max(1, x1 - x0) / 1.05, (cv.height / Math.max(1, y1 - y0) / 1.05) * (GEN.cellW / GEN.cellH));
  const ch = cw * (GEN.cellH / GEN.cellW);
  const ox = (cv.width - (x1 - x0) * cw) / 2 - x0 * cw;
  const oy = (cv.height - (y1 - y0) * ch) / 2 - y0 * ch;
  ctx.fillStyle = "#0f0c0d";
  ctx.fillRect(0, 0, cv.width, cv.height);
  const npcRooms = new Set(s.story.npcs.filter((n) => s.story.met.has(n.quest) || !n.quest).map((n) => n.room));
  for (const r of m.rooms) {
    const vis = seen.has(r.id);
    if (!vis && !outline.has(r.id)) continue;
    const x = ox + r.x * cw + 2;
    const y = oy + r.y * ch + 2;
    const w = r.w * cw - 4;
    const h = r.h * ch - 4;
    if (vis) {
      ctx.fillStyle = s.roomConsumed(r) ? "#3a2650" : r.id === s.currentRoom ? "#4a3d2a" : "#2c2627";
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeStyle = r.role === "herald" ? "#b2434b" : r.role === "gate" || r.role === "warden" ? "#c9a24a" : vis ? "#6a5d50" : "#3a2f2c";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (vis && r.sanctuary) {
      ctx.fillStyle = s.lit.has(r.id) ? "#e8c45a" : "#7a6640";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (vis && npcRooms.has(r.id) && !s.practiceMode) {
      ctx.fillStyle = "#8ec5ff";
      ctx.beginPath();
      ctx.arc(x + 9, y + 9, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (r.id === s.currentRoom) {
      const px = ox + (s.player.cx / GEN.cellW) * cw;
      const py = oy + (s.player.cy / GEN.cellH) * ch;
      ctx.fillStyle = "#f2efe6";
      ctx.fillRect(px - 3, py - 3, 6, 6);
    }
  }
  if (s.dropped && seen.has(s.dropped.room)) {
    const px = ox + (s.dropped.x / GEN.cellW) * cw;
    const py = oy + (s.dropped.y / GEN.cellH) * ch;
    ctx.fillStyle = "#a57ae0";
    ctx.fillRect(px - 4, py - 6, 8, 8);
    ctx.fillStyle = "#e7dcc8";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${s.dropped.amount}`, px + 7, py);
  }
  for (const e of m.edges) {
    if (e.kind !== "gate" || !e.ability) continue;
    if (!seen.has(e.a) && !seen.has(e.b)) continue;
    const [dx, dy] = e.dir === "R" ? [1, 0.5] : e.dir === "L" ? [0, 0.5] : e.dir === "D" ? [0.5, 1] : [0.5, 0];
    const x = ox + (e.cx + dx) * cw;
    const y = oy + (e.cy + dy) * ch;
    ctx.fillStyle = s.abilities.has(e.ability) ? ABILITY_COLORS[e.ability] : "#4a403a";
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 7);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#0f0c0d";
    ctx.stroke();
  }
}
