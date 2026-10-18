// Headless check for js/game/music.js: renders every scene offline, then exercises the runtime path.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/music_check.mjs
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = 8131;
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const tries = [() => require('playwright')];
  tries.push(() => require(path.join(execSync('npm root -g').toString().trim(), 'playwright')));
  tries.push(() => require('/usr/lib/node_modules/playwright'));
  for (const t of tries) {
    try { return t(); } catch { /* next */ }
  }
  throw new Error('playwright node module not found');
}

const { chromium } = loadPlaywright();
const server = spawn('python3', ['serve.py', '--port', String(PORT)], { cwd: root, stdio: 'ignore' });
let failed = [];
const fail = (msg) => { failed.push(msg); console.log('  FAIL: ' + msg); };

try {
  await new Promise((r) => setTimeout(r, 900));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/tools/`);

  // ---------------------------------------------------------------- offline renders
  const scenes = ['menu', 'story', 'practice', 'undercroft', 'midreach', 'summit', 'boss', 'victory', 'defeat'];
  const rows = [];
  for (const name of scenes) {
    const r = await page.evaluate(async (name) => {
      const { Music } = await import('/js/game/music.js');
      const render = async () => {
        const ctx = new OfflineAudioContext(2, 44100 * 12, 44100);
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        const m = new Music(ctx, gain);
        m.setScene(name, { fade: 0.1 });
        m.setIntensity(1);
        m.setBlight(2);
        m._pump(12);
        const buf = await ctx.startRendering();
        const scene = m.scene;
        let maxVox = 0;
        for (const v of m._vox) {
          let n = 0;
          for (const x of m._vox) if (x.s <= v.s && x.e > v.s) n++;
          maxVox = Math.max(maxVox, n);
        }
        const err = m.lastError ? String(m.lastError.message || m.lastError) : null;
        m.dispose();
        return { buf, scene, err, maxVox };
      };
      const { buf, scene, err, maxVox } = await render();
      let peak = 0, sumsq = 0, sum = 0, n = 0, nan = 0;
      const win = 22050, wins = [];
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let w = 0; w + win <= d.length; w += win) {
          let s = 0;
          for (let i = w; i < w + win; i++) s += d[i] * d[i];
          wins[w / win] = Math.max(wins[w / win] || 0, Math.sqrt(s / win));
        }
        for (let i = 0; i < d.length; i++) {
          const v = d[i];
          if (!Number.isFinite(v)) { nan++; continue; }
          const a = Math.abs(v);
          if (a > peak) peak = a;
          sumsq += v * v; sum += v; n++;
        }
      }
      const rms = Math.sqrt(sumsq / n);
      const active = wins.filter((x) => x > 0.002).length / wins.length;
      const tailRms = wins[wins.length - 1];
      // determinism: render again and compare
      const again = await render();
      // Chromium's convolver is not bit exact between runs, so compare with a small tolerance.
      let maxDiff = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const a = buf.getChannelData(ch), b = again.buf.getChannelData(ch);
        for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
      }
      return { name, peak, rms, active, nan, tailRms, scene, err, maxVox, dc: sum / n, deterministic: maxDiff < 2e-3 };
    }, name);
    rows.push(r);
  }

  console.log('\nscene        peak     peakdB   rms      active  tailRMS  voices');
  for (const r of rows) {
    console.log(`${r.name.padEnd(12)} ${r.peak.toFixed(3)}   ${(20 * Math.log10(r.peak)).toFixed(1).padStart(6)}   ${r.rms.toFixed(4)}   ${(r.active * 100).toFixed(0).padStart(3)}%    ${r.tailRms.toFixed(4)}   ${r.maxVox}`);
    if (r.err) fail(`${r.name}: exception ${r.err}`);
    if (r.nan) fail(`${r.name}: ${r.nan} NaN samples`);
    if (!(r.peak < 1.0)) fail(`${r.name}: peak ${r.peak.toFixed(3)} not below 1.0`);
    if (!(r.peak > 0.02)) fail(`${r.name}: peak ${r.peak.toFixed(3)} not above 0.02`);
    if (!(r.rms > 0.003)) fail(`${r.name}: rms ${r.rms.toFixed(4)} not above 0.003`);
    if (Math.abs(r.dc) > 0.02) fail(`${r.name}: DC offset ${r.dc.toFixed(3)}`);
    if (r.maxVox > 30) fail(`${r.name}: ${r.maxVox} simultaneous voices`);
    if (!r.deterministic) fail(`${r.name}: two renders differ (not deterministic)`);
    if ((r.name === 'victory' || r.name === 'defeat')) {
      if (r.scene !== 'silence') fail(`${r.name}: scene is "${r.scene}" after the stinger, expected "silence"`);
      if (!(r.tailRms < 0.003)) fail(`${r.name}: stinger does not fall to silence (tail rms ${r.tailRms.toFixed(4)})`);
    }
  }

  // before-start safety and API smoke on an offline context
  const smoke = await page.evaluate(async () => {
    const { Music } = await import('/js/game/music.js');
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const g = ctx.createGain(); g.connect(ctx.destination);
    const m = new Music(ctx, g);
    m._pump(1); m.pause(); m.resume(); m.duck(); m.setIntensity(0.3); m.setBlight(4); m.setScene('silence');
    m.setScene('nonsense');
    m.stop(0.1); m.dispose(); m.setScene('menu'); m.dispose();
    return { scene: m.scene };
  });
  if (smoke.scene !== 'silence') fail('smoke: scene after dispose is not silence');

  // ---------------------------------------------------------------- runtime path
  const rt = await page.evaluate(async () => {
    const { Music } = await import('/js/game/music.js');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ctx = new AudioContext();
    await ctx.resume();
    const gain = ctx.createGain();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    gain.connect(an);
    gain.connect(ctx.destination);
    const m = new Music(ctx, gain);
    const t0 = ctx.currentTime;
    m.setScene('undercroft');
    let peak = 0;
    const buf = new Float32Array(an.fftSize);
    for (let i = 0; i < 12; i++) {
      await sleep(250);
      an.getFloatTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
    }
    m.setIntensity(0.2); await sleep(200);
    m.setIntensity(1); await sleep(200);
    m.setBlight(3); await sleep(200);
    m.duck(); await sleep(200);
    m.pause(); await sleep(400);
    m.resume(); await sleep(300);
    const mid = m._debugCounts();
    m.setScene('boss', { fade: 0.5 }); await sleep(600);
    m.setScene('victory', { fade: 0.3 }); await sleep(300);
    m.stop(0.2); await sleep(400);
    const sceneAfterStop = m.scene;
    // let everything fade, get reaped and be released
    await sleep(3500);
    const end = m._debugCounts();
    const advanced = ctx.currentTime - t0;
    const lastError = m.lastError ? String(m.lastError.message || m.lastError) : null;
    m.dispose();
    await ctx.close();
    return { state: 'ok', advanced, peak, mid, end, sceneAfterStop, lastError };
  });
  console.log(`\nruntime: ctx advanced ${rt.advanced.toFixed(2)} s, analyser peak ${rt.peak.toFixed(3)}, scene after stop "${rt.sceneAfterStop}"`);
  console.log(`  alive mid-run: ${JSON.stringify(rt.mid)}`);
  console.log(`  alive after stop + 3.5 s: ${JSON.stringify(rt.end)}`);
  if (!(rt.advanced > 3)) fail(`runtime: ctx.currentTime advanced only ${rt.advanced}`);
  if (rt.lastError) fail('runtime: ' + rt.lastError);
  if (rt.sceneAfterStop !== 'silence') fail('runtime: scene not silence after stop');
  if (!(rt.peak > 0.001)) fail(`runtime: analyser heard nothing (peak ${rt.peak})`);
  if (rt.end.scenes !== 0 || rt.end.srcs !== 0 || rt.end.blight !== 0 || rt.end.timer) fail('runtime: nodes or timer leaked after stop');
  if (pageErrors.length) fail('page/console errors: ' + pageErrors.join(' | '));

  await browser.close();
} catch (e) {
  fail('script error: ' + (e && e.stack ? e.stack : e));
} finally {
  server.kill();
}

console.log('\n' + (failed.length ? `FAIL (${failed.length} problem${failed.length > 1 ? 's' : ''})` : 'PASS'));
process.exit(failed.length ? 1 : 0);
