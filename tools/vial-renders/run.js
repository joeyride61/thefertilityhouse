const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const mime = { '.html':'text/html', '.js':'text/javascript', '.woff2':'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': mime[path.extname(f)]||'application/octet-stream'}); r.end(d); } }); }).listen(8765);
(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2]));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); p.on('console', m => m.type()==='error' && console.log('ERR', m.text())); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8765/render.html'); await p.waitForFunction('window.ready', null, { timeout: 60000 });
  for (const j of jobs) { const t = Date.now(); const d = await p.evaluate(j => window.render(j), j);
    fs.writeFileSync(j.out, Buffer.from(d.split(',')[1], 'base64')); console.log(j.out, Date.now()-t, 'ms'); }
  await b.close(); srv.close();
})();
