/**
 * Lua SavedVariables parser (browser-compatible).
 *
 * Parses the subset of Lua emitted by WoW's SavedVariables serializer:
 *   - top-level assignments `IDENT = value` (multiple per file)
 *   - tables `{ key = value, ... }` with mixed array/hash style + trailing commas
 *   - keys: bare identifiers, ["string keys"], [numeric keys]
 *   - strings: short `"..."` and long `[[ ... ]]` / `[=[ ... ]=]`
 *   - numbers: int / float / scientific / negative / hex (0x...)
 *   - booleans, nil
 *   - `--` line comments and `--[[ ]]` block comments
 *
 * Tables with only integer keys 1..N produce a JS array; otherwise an
 * object. `nil` values are skipped from objects entirely. The output is
 * a flat `{ [varName]: parsedValue }` ready for downstream consumers.
 *
 * No `eval`, no Function constructor -- safe to run on untrusted SVs.
 */

export type LuaValue =
  | string
  | number
  | boolean
  | null
  | LuaValue[]
  | { [key: string]: LuaValue };

export type ParsedSavedVariables = Record<string, LuaValue>;

export class LuaParseError extends Error {
  constructor(message: string, public line: number, public col: number) {
    super(`Lua parse error at ${line}:${col} -- ${message}`);
    this.name = 'LuaParseError';
  }
}

type Tok =
  | { kind: 'punct'; value: '{' | '}' | '[' | ']' | '=' | ','; line: number; col: number }
  | { kind: 'ident'; value: string; line: number; col: number }
  | { kind: 'string'; value: string; line: number; col: number }
  | { kind: 'number'; value: number; line: number; col: number }
  | { kind: 'bool'; value: boolean; line: number; col: number }
  | { kind: 'nil'; line: number; col: number };

function tokenize(src: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = src.length;

  function advance(count: number) {
    for (let k = 0; k < count; k++) {
      if (src[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  }

  function err(msg: string): never {
    throw new LuaParseError(msg, line, col);
  }

  while (i < n) {
    const c = src[i];

    // Whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance(1);
      continue;
    }

    // Comments
    if (c === '-' && src[i + 1] === '-') {
      advance(2);
      // Block comment?
      if (src[i] === '[') {
        // count = signs
        let eqStart = i + 1;
        let eqCount = 0;
        while (src[eqStart + eqCount] === '=') eqCount++;
        if (src[eqStart + eqCount] === '[') {
          // long bracket block comment
          const closer = ']' + '='.repeat(eqCount) + ']';
          advance(1 + eqCount + 1);
          const close = src.indexOf(closer, i);
          if (close < 0) err('unterminated block comment');
          advance(close - i + closer.length);
          continue;
        }
      }
      // Line comment
      while (i < n && src[i] !== '\n') advance(1);
      continue;
    }

    // Punctuation
    if (c === '{' || c === '}' || c === '[' || c === ']' || c === '=' || c === ',') {
      // Special-case: `[` followed by `[` or `=...=[` is a long string, not punct
      if (c === '[') {
        let eqCount = 0;
        while (src[i + 1 + eqCount] === '=') eqCount++;
        if (src[i + 1 + eqCount] === '[') {
          const startLine = line;
          const startCol = col;
          advance(2 + eqCount);
          // Lua spec: skip first newline immediately after opening
          if (src[i] === '\r') advance(1);
          if (src[i] === '\n') advance(1);
          const closer = ']' + '='.repeat(eqCount) + ']';
          const close = src.indexOf(closer, i);
          if (close < 0) throw new LuaParseError('unterminated long string', startLine, startCol);
          const value = src.slice(i, close);
          advance(close - i + closer.length);
          tokens.push({ kind: 'string', value, line: startLine, col: startCol });
          continue;
        }
      }
      tokens.push({ kind: 'punct', value: c as any, line, col });
      advance(1);
      continue;
    }

    // Short string
    if (c === '"' || c === "'") {
      const quote = c;
      const startLine = line;
      const startCol = col;
      advance(1);
      let out = '';
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          advance(1);
          const esc = src[i];
          switch (esc) {
            case 'n': out += '\n'; advance(1); break;
            case 't': out += '\t'; advance(1); break;
            case 'r': out += '\r'; advance(1); break;
            case '"': out += '"'; advance(1); break;
            case "'": out += "'"; advance(1); break;
            case '\\': out += '\\'; advance(1); break;
            case 'a': out += '\x07'; advance(1); break;
            case 'b': out += '\b'; advance(1); break;
            case 'f': out += '\f'; advance(1); break;
            case 'v': out += '\v'; advance(1); break;
            case '0': case '1': case '2': case '3': case '4':
            case '5': case '6': case '7': case '8': case '9': {
              let num = '';
              for (let k = 0; k < 3 && /[0-9]/.test(src[i] ?? ''); k++) {
                num += src[i];
                advance(1);
              }
              out += String.fromCharCode(parseInt(num, 10));
              break;
            }
            case 'x': {
              advance(1);
              const h = src.slice(i, i + 2);
              if (!/^[0-9a-fA-F]{2}$/.test(h)) err('bad \\x escape');
              out += String.fromCharCode(parseInt(h, 16));
              advance(2);
              break;
            }
            case '\n':
              out += '\n';
              advance(1);
              break;
            default:
              out += esc ?? '';
              if (esc) advance(1);
          }
        } else {
          out += src[i];
          advance(1);
        }
      }
      if (src[i] !== quote) throw new LuaParseError('unterminated string', startLine, startCol);
      advance(1);
      tokens.push({ kind: 'string', value: out, line: startLine, col: startCol });
      continue;
    }

    // Number (incl. negative)
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const startLine = line;
      const startCol = col;
      let raw = '';
      if (c === '-') { raw += '-'; advance(1); }
      // Hex?
      if (src[i] === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        raw += src[i]; raw += src[i + 1]; advance(2);
        while (i < n && /[0-9a-fA-F]/.test(src[i])) { raw += src[i]; advance(1); }
        tokens.push({ kind: 'number', value: parseInt(raw, 16), line: startLine, col: startCol });
        continue;
      }
      while (i < n && /[0-9]/.test(src[i])) { raw += src[i]; advance(1); }
      if (src[i] === '.') { raw += '.'; advance(1); while (/[0-9]/.test(src[i] ?? '')) { raw += src[i]; advance(1); } }
      if (src[i] === 'e' || src[i] === 'E') {
        raw += src[i]; advance(1);
        if (src[i] === '+' || src[i] === '-') { raw += src[i]; advance(1); }
        while (/[0-9]/.test(src[i] ?? '')) { raw += src[i]; advance(1); }
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) throw new LuaParseError(`bad number ${raw}`, startLine, startCol);
      tokens.push({ kind: 'number', value: num, line: startLine, col: startCol });
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_]/.test(c)) {
      const startLine = line;
      const startCol = col;
      let id = '';
      while (i < n && /[A-Za-z0-9_]/.test(src[i])) { id += src[i]; advance(1); }
      if (id === 'true') tokens.push({ kind: 'bool', value: true, line: startLine, col: startCol });
      else if (id === 'false') tokens.push({ kind: 'bool', value: false, line: startLine, col: startCol });
      else if (id === 'nil') tokens.push({ kind: 'nil', line: startLine, col: startCol });
      else tokens.push({ kind: 'ident', value: id, line: startLine, col: startCol });
      continue;
    }

    err(`unexpected character ${JSON.stringify(c)}`);
  }

  return tokens;
}

function isPunct(t: Tok | undefined, v: string): boolean {
  return !!t && t.kind === 'punct' && t.value === v;
}

class Parser {
  pos = 0;
  constructor(private toks: Tok[]) {}

  peek(): Tok | undefined { return this.toks[this.pos]; }

  consume(): Tok {
    const t = this.toks[this.pos];
    if (!t) throw new LuaParseError('unexpected end of input', 0, 0);
    this.pos++;
    return t;
  }

  expectPunct(v: string): Tok {
    const t = this.consume();
    if (t.kind !== 'punct' || t.value !== v) {
      throw new LuaParseError(`expected '${v}' but got ${describe(t)}`, t.line, t.col);
    }
    return t;
  }

  parseValue(): LuaValue {
    const t = this.peek();
    if (!t) throw new LuaParseError('expected value, got end of input', 0, 0);
    switch (t.kind) {
      case 'string': this.consume(); return t.value;
      case 'number': this.consume(); return t.value;
      case 'bool': this.consume(); return t.value;
      case 'nil': this.consume(); return null;
      case 'punct':
        if (t.value === '{') return this.parseTable();
        throw new LuaParseError(`unexpected '${t.value}'`, t.line, t.col);
      case 'ident':
        // Bare identifiers are not values in SV output. Reject.
        throw new LuaParseError(`unexpected identifier '${t.value}'`, t.line, t.col);
    }
  }

  parseTable(): LuaValue {
    this.expectPunct('{');
    const hash: Record<string, LuaValue> = {};
    const arr: LuaValue[] = [];
    const intKeys = new Map<number, LuaValue>();
    let hasNonInt = false;

    while (true) {
      const t = this.peek();
      if (!t) throw new LuaParseError('unterminated table', 0, 0);
      if (isPunct(t, '}')) { this.consume(); break; }

      let key: string | number | null = null;

      // [expr] = value
      if (isPunct(t, '[')) {
        this.consume();
        const k = this.consume();
        if (k.kind === 'string') key = k.value;
        else if (k.kind === 'number') key = k.value;
        else throw new LuaParseError('table key must be string or number', k.line, k.col);
        this.expectPunct(']');
        this.expectPunct('=');
        const val = this.parseValue();
        if (typeof key === 'number' && Number.isInteger(key) && !hasNonInt) {
          intKeys.set(key, val);
        } else {
          hasNonInt = true;
          hash[String(key)] = val;
        }
      }
      // IDENT = value
      else if (t.kind === 'ident' && this.toks[this.pos + 1]?.kind === 'punct' && (this.toks[this.pos + 1] as any).value === '=') {
        this.consume();
        this.expectPunct('=');
        const val = this.parseValue();
        hasNonInt = true;
        hash[t.value] = val;
      }
      // bare value -> sequence
      else {
        const val = this.parseValue();
        arr.push(val);
      }

      // Optional trailing comma / semicolon
      const sep = this.peek();
      if (isPunct(sep, ',') || (sep && sep.kind === 'punct' && (sep.value as any) === ';')) {
        this.consume();
      }
    }

    // Merge intKeys + arr into result
    if (!hasNonInt) {
      // pure sequence (either from `arr` or from [n] keys)
      if (intKeys.size > 0) {
        const max = Math.max(...intKeys.keys());
        const out: LuaValue[] = [];
        for (let i = 1; i <= max; i++) out.push(intKeys.get(i) ?? null);
        return [...arr, ...out];
      }
      return arr;
    }
    // mixed: dump intKeys back into hash as string keys, append arr as 1..N
    for (const [k, v] of intKeys) hash[String(k)] = v;
    arr.forEach((v, idx) => { hash[String(idx + 1)] = v; });
    return hash;
  }
}

function describe(t: Tok): string {
  switch (t.kind) {
    case 'punct': return `'${t.value}'`;
    case 'ident': return `identifier '${t.value}'`;
    case 'string': return 'string';
    case 'number': return 'number';
    case 'bool': return String(t.value);
    case 'nil': return 'nil';
  }
}

/**
 * Parse a SavedVariables file. Returns an object keyed by each top-level
 * variable name found in the file.
 */
export function parseSavedVariables(src: string): ParsedSavedVariables {
  const toks = tokenize(src);
  const p = new Parser(toks);
  const out: ParsedSavedVariables = {};

  while (p.peek()) {
    const t = p.consume();
    if (t.kind !== 'ident') {
      throw new LuaParseError(`expected top-level identifier, got ${describe(t)}`, t.line, t.col);
    }
    p.expectPunct('=');
    out[t.value] = p.parseValue();
  }

  return out;
}
