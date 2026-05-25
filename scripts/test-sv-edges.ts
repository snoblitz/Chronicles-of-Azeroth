import { parseSavedVariables } from '../src/lib/luaSavedVariables';

const cases: { name: string; src: string; check: (v: any) => boolean }[] = [
  { name: 'short string + escapes', src: 'X = "a\\tb\\n\\"c\\\\d"', check: v => v.X === 'a\tb\n"c\\d' },
  { name: 'long string [[ ]]', src: 'X = [[hello\nworld]]', check: v => v.X === 'hello\nworld' },
  { name: 'long string [=[ ]=]', src: 'X = [=[has ]] inside]=]', check: v => v.X === 'has ]] inside' },
  { name: 'line comment', src: '-- comment\nX = 5', check: v => v.X === 5 },
  { name: 'block comment', src: 'X = --[[ skip me ]] 7', check: v => v.X === 7 },
  { name: 'negative number', src: 'X = -3.14', check: v => v.X === -3.14 },
  { name: 'scientific notation', src: 'X = 1.5e3', check: v => v.X === 1500 },
  { name: 'hex number', src: 'X = 0xFF', check: v => v.X === 255 },
  { name: 'bool + nil', src: 'A = true\nB = false\nC = nil', check: v => v.A === true && v.B === false && v.C === null },
  { name: 'array', src: 'X = {"a","b","c"}', check: v => Array.isArray(v.X) && v.X[2] === 'c' },
  { name: 'numeric key sequence', src: 'X = {[1]="a",[2]="b",[3]="c"}', check: v => Array.isArray(v.X) && v.X[1] === 'b' },
  { name: 'bare ident keys', src: 'X = { foo = 1, bar = 2 }', check: v => v.X.foo === 1 && v.X.bar === 2 },
  { name: 'mixed array+hash', src: 'X = { "first", "second", name="zed" }', check: v => v.X['1'] === 'first' && v.X['2'] === 'second' && v.X.name === 'zed' },
  { name: 'trailing comma', src: 'X = { 1, 2, 3, }', check: v => v.X.length === 3 },
  { name: 'multi top-level', src: 'A = 1\nB = "x"\nC = {1,2}', check: v => v.A === 1 && v.B === 'x' && v.C[0] === 1 },
  { name: 'nested deep', src: 'X = { a = { b = { c = "deep" } } }', check: v => v.X.a.b.c === 'deep' },
];

let pass = 0, fail = 0;
for (const c of cases) {
  try {
    const v = parseSavedVariables(c.src);
    if (c.check(v)) { pass++; console.log('OK   ' + c.name); }
    else { fail++; console.log('FAIL ' + c.name + ' -> ' + JSON.stringify(v)); }
  } catch (e: any) {
    fail++; console.log('ERR  ' + c.name + ' -> ' + e.message);
  }
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
