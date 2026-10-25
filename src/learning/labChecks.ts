// Tiny safe expression evaluator for Lab "reach_state" checks, e.g. "puneGauge > mumbaiGauge" or
// "H < 40 && mumbaiGauge > 0 && gaugeDiffRatio <= 0.2". No eval(). Identifiers read from the sim's metrics.

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };
export type Node =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'bin'; op: string; l: Node; r: Node };

const OPS = ['&&', '||', '>=', '<=', '==', '!=', '>', '<'];

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const two = src.slice(i, i + 2);
    if (OPS.includes(two)) { out.push({ k: 'op', v: two }); i += 2; continue; }
    if (ch === '>' || ch === '<') { out.push({ k: 'op', v: ch }); i++; continue; }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num && (out.length === 0 || out[out.length - 1].k === 'op')) { out.push({ k: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { out.push({ k: 'id', v: id[0] }); i += id[0].length; continue; }
    return null;
  }
  return out;
}

const PREC: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4 };

export function parseCheck(src: string): Node | null {
  const toks = tokenize(src);
  if (!toks || toks.length === 0) return null;
  let p = 0;
  const atom = (): Node | null => {
    const t = toks[p++];
    if (!t) return null;
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'id') return { t: 'id', v: t.v };
    return null;
  };
  const expr = (minPrec: number): Node | null => {
    let left = atom();
    if (!left) return null;
    while (p < toks.length) {
      const t = toks[p];
      if (t.k !== 'op') return null;
      const prec = PREC[t.v];
      if (prec === undefined || prec < minPrec) break;
      p++;
      const right = expr(prec + 1);
      if (!right) return null;
      left = { t: 'bin', op: t.v, l: left, r: right };
    }
    return left;
  };
  const node = expr(1);
  return node && p === toks.length ? node : null;
}

function ev(n: Node, m: Record<string, number>): number {
  switch (n.t) {
    case 'num': return n.v;
    case 'id': return m[n.v] ?? 0;
    case 'bin': {
      const a = ev(n.l, m); const b = ev(n.r, m);
      switch (n.op) {
        case '&&': return a && b ? 1 : 0;
        case '||': return a || b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '<': return a < b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
      }
    }
  }
  return 0;
}

export function evalCheck(src: string, metrics: Record<string, number>): boolean {
  const node = parseCheck(src);
  return node ? ev(node, metrics) === 1 : false;
}

export function identifiersIn(src: string): string[] {
  const out: string[] = [];
  const walk = (n: Node) => { if (n.t === 'id') out.push(n.v); else if (n.t === 'bin') { walk(n.l); walk(n.r); } };
  const node = parseCheck(src);
  if (node) walk(node);
  return out;
}
