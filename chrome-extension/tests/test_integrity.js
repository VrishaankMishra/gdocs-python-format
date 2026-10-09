// Guards the two projects against drift, and checks the extension is loadable.
const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..');
const ADDON = path.join(EXT, '..', 'apps-script-addon');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; return; }
  fail++; console.log(`FAIL ${label}${detail ? '\n  ' + detail : ''}`);
};

// --- shared tokenizer must not drift ---------------------------------------
{
  const gs = fs.readFileSync(path.join(ADDON, 'Python.gs'), 'utf8');
  const js = fs.readFileSync(path.join(EXT, 'python.js'), 'utf8');
  check('python.js starts with Python.gs verbatim', js.startsWith(gs),
    'The shared tokenizer has drifted. Re-copy Python.gs over python.js and ' +
    're-append the export footer.');
  const tail = js.slice(gs.length);
  check('python.js adds only the export footer',
    tail.includes('module.exports') && !tail.includes('function tokenizeLine'));
}

// --- manifest ---------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
check('manifest v3', manifest.manifest_version === 3);
check('declares side panel', !!(manifest.side_panel && manifest.side_panel.default_path));
check('declares service worker', !!(manifest.background && manifest.background.service_worker));
check('no host_permissions needed', !manifest.host_permissions);
check('permissions are minimal',
  JSON.stringify(manifest.permissions.slice().sort()) ===
  JSON.stringify(['clipboardRead', 'sidePanel', 'storage']),
  JSON.stringify(manifest.permissions));

// --- every referenced file exists ------------------------------------------
const refs = [
  manifest.side_panel.default_path,
  manifest.background.service_worker,
  ...Object.values(manifest.icons || {}),
];
refs.forEach(r => check(`manifest references ${r}`, fs.existsSync(path.join(EXT, r))));

const html = fs.readFileSync(path.join(EXT, manifest.side_panel.default_path), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
check('side panel references assets', assets.length >= 4, JSON.stringify(assets));
assets.forEach(a => check(`sidepanel references ${a}`, fs.existsSync(path.join(EXT, a))));

// --- MV3 CSP: no inline script or handlers ---------------------------------
check('no inline <script> body', !/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(html));
check('no inline on* handlers', !/\son[a-z]+\s*=/i.test(html));

// --- every element the panel script touches exists in the markup -----------
{
  const js = fs.readFileSync(path.join(EXT, 'sidepanel.js'), 'utf8');
  const ids = new Set([...js.matchAll(/el\('([A-Za-z0-9_]+)'\)/g)].map(m => m[1]));
  const present = new Set([...html.matchAll(/id="([A-Za-z0-9_]+)"/g)].map(m => m[1]));
  const missing = [...ids].filter(id => !present.has(id));
  check('every el() id exists in the markup', missing.length === 0,
    'missing: ' + missing.join(', '));
}

// --- icons are real PNGs ----------------------------------------------------
Object.entries(manifest.icons).forEach(([size, rel]) => {
  const buf = fs.readFileSync(path.join(EXT, rel));
  const sig = buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  check(`icon ${size} is a ${size}x${size} PNG`,
    sig && w === Number(size) && h === Number(size), `${w}x${h}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
