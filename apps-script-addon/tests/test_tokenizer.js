// Harness: loads Python.gs into a sandbox and checks tokenizer output.
const fs = require('fs');
const vm = require('vm');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../Python.gs', 'utf8'), sandbox);
const { tokenizeLine, normalizeCodeText, stripLineNumber, THEMES } = sandbox;

/** Render a line as a per-character type map, exactly as the doc would be painted. */
function render(line, state) {
  const tokens = tokenizeLine(line, state);
  const map = new Array(line.length).fill('.');
  for (const t of tokens) {
    if (t.end <= t.start) continue;
    if (t.start < 0 || t.end > line.length) {
      throw new Error(`token out of bounds on "${line}": ${JSON.stringify(t)}`);
    }
    const ch = { comment: 'C', string: 'S', number: 'N', keyword: 'K',
                 builtin: 'B', defname: 'D', decorator: '@', self: 'F' }[t.type];
    for (let i = t.start; i < t.end; i++) map[i] = ch;
  }
  return map.join('');
}

let pass = 0, fail = 0;
function check(label, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}\n  got  ${got}\n  want ${want}`);
}

// --- single lines -----------------------------------------------------------
const st = () => ({ inTriple: null, pendingDefName: false });

let s = st();
check('def line',
  render('def greet(name):', s),
  'KKK.DDDDD.......');   // def=keyword, greet=defname, name=plain

s = st();
check('keyword+builtin',
  render('print(len(x))', s),
  'BBBBB.BBB....');

s = st();
check('comment',
  render('x = 1  # set x', s),
  '....N..CCCCCCC');

s = st();
check('string with escape',
  render("msg = 'it\\'s ok'", s),
  '......SSSSSSSSSS');

s = st();
check('decorator',
  render('@property', s),
  '@@@@@@@@@');

s = st();
check('self',
  render('self.x = 0', s),
  'FFFF.....N');

s = st();
check('hex + float',
  render('a = 0xFF + 1.5e3', s),
  '....NNNN...NNNNN');

// --- triple-quoted string spanning lines ------------------------------------
s = st();
const l1 = render('"""Docstring start', s);
const l2 = render('still inside', s);
const l3 = render('end."""', s);
const l4 = render('x = 1', s);
check('triple line 1', l1, 'SSSSSSSSSSSSSSSSSS');
check('triple line 2', l2, 'SSSSSSSSSSSS');
check('triple line 3', l3, 'SSSSSSS');
check('after triple', l4, '....N');

// --- normalization ----------------------------------------------------------
check('smart quotes',
  normalizeCodeText('x = “hello”'), 'x = "hello"');
check('smart apostrophe',
  normalizeCodeText('it’s'), "it's");
check('em dash',
  normalizeCodeText('a — b'), 'a - b');
check('nbsp',
  normalizeCodeText('a b'), 'a b');
check('tab to 4 spaces',
  normalizeCodeText('\tx'), '    x');
check('ellipsis',
  normalizeCodeText('x…'), 'x...');
check('zero width stripped',
  normalizeCodeText('a​b'), 'ab');

// --- line-number strip is idempotent ----------------------------------------
check('strip lineno',   stripLineNumber(' 12 │ x = 1'), 'x = 1');
check('strip noop',     stripLineNumber('x = 1'), 'x = 1');
check('strip once only',stripLineNumber(stripLineNumber('  3 │ y = 2')), 'y = 2');

// --- every theme defines every token colour ---------------------------------
const needed = ['bg','fg','comment','string','number','keyword','builtin','defname','decorator','self','lineno'];
for (const [name, theme] of Object.entries(THEMES)) {
  for (const key of needed) {
    if (!theme[key]) { console.log(`FAIL theme ${name} missing ${key}`); fail++; }
    else if (!/^#[0-9A-Fa-f]{6}$/.test(theme[key])) {
      console.log(`FAIL theme ${name}.${key} not a hex colour: ${theme[key]}`); fail++;
    } else pass++;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
