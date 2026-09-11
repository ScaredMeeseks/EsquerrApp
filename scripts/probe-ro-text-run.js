/* Drive scripts/probe-ro-text-scale.js's page and print what layout really did.
 *
 *   node scripts/probe-ro-text-scale.js .     # prints a temp directory
 *   node scripts/probe-ro-text-run.js <that directory>
 *
 * See the header of the other file, and the v258 entry in CONTEXT.md.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = path.resolve(process.argv[2] || '.');
const url = 'file:///' + path.join(HERE, 'probe-text.html').replace(/\\/g, '/');
const board = fs.readFileSync(path.join(HERE, 'probe-board.json'), 'utf8');

const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=' + port, '--no-first-run',
  '--user-data-dir=' + HERE + '/probe.profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/list');
      target = (await r.json()).filter((t) => t.type === 'page')[0];
    } catch (e) { /* not up */ }
  }
  if (!target) { console.error('chrome never came up'); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(2500);
  const r = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__probe(' + board + '), null, 1)',
    returnByValue: true
  });
  console.log(r.result.value || JSON.stringify(r.result));
  const shot = await send('Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: true });
  if (shot && shot.data) {
    fs.writeFileSync(path.join(HERE, 'probe-text.png'), Buffer.from(shot.data, 'base64'));
    console.log('shot: probe-text.png');
  }
  ws.close(); chrome.kill(); process.exit(0);
})();
