export type Op = { type: 'eq' | 'del' | 'add'; text: string; a?: number; b?: number };

/** Longest-common-subsequence diff of two token lists (common prefix/suffix trimmed first). */
export function diffTokens(a: string[], b: string[], limit = 2500): Array<{ type: Op['type']; text: string }> {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head = a.slice(0, start).map((text) => ({ type: 'eq' as const, text }));
  const tail = a.slice(endA).map((text) => ({ type: 'eq' as const, text }));
  const ma = a.slice(start, endA);
  const mb = b.slice(start, endB);
  let middle: Array<{ type: Op['type']; text: string }>;
  if (ma.length > limit || mb.length > limit) {
    // Too large for the quadratic table: show it as a block replacement.
    middle = [...ma.map((text) => ({ type: 'del' as const, text })), ...mb.map((text) => ({ type: 'add' as const, text }))];
  } else {
    const n = ma.length;
    const m = mb.length;
    const table = new Uint16Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        table[i * (m + 1) + j] = ma[i] === mb[j] ? table[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(table[(i + 1) * (m + 1) + j]!, table[i * (m + 1) + j + 1]!);
    middle = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && ma[i] === mb[j]) {
        middle.push({ type: 'eq', text: ma[i]! });
        i++;
        j++;
      } else if (j < m && (i >= n || table[i * (m + 1) + j + 1]! >= table[(i + 1) * (m + 1) + j]!)) {
        middle.push({ type: 'add', text: mb[j]! });
        j++;
      } else {
        middle.push({ type: 'del', text: ma[i]! });
        i++;
      }
    }
    // Present deletions before additions within each changed run.
    middle = groupRuns(middle);
  }
  return [...head, ...middle, ...tail];
}

function groupRuns(ops: Array<{ type: Op['type']; text: string }>): Array<{ type: Op['type']; text: string }> {
  const out: Array<{ type: Op['type']; text: string }> = [];
  let dels: typeof out = [];
  let adds: typeof out = [];
  const flush = () => {
    out.push(...dels, ...adds);
    dels = [];
    adds = [];
  };
  for (const op of ops) {
    if (op.type === 'eq') {
      flush();
      out.push(op);
    } else (op.type === 'del' ? dels : adds).push(op);
  }
  flush();
  return out;
}

/** Line diff with 1-based line numbers on each side. */
export function diffLines(before: string, after: string): Op[] {
  const ops = diffTokens(before.split('\n'), after.split('\n'));
  let a = 1;
  let b = 1;
  return ops.map((op) => {
    if (op.type === 'eq') return { ...op, a: a++, b: b++ };
    if (op.type === 'del') return { ...op, a: a++ };
    return { ...op, b: b++ };
  });
}

/** Parses a unified diff (git diff / diff -u) into line ops. Returns the file name if present. */
export function parsePatch(patch: string): { ops: Op[]; file?: string } {
  const ops: Op[] = [];
  let file: string | undefined;
  let a = 1;
  let b = 1;
  for (const line of patch.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.slice(4).replace(/^b\//, '').trim();
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('\\')) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      if (ops.length) ops.push({ type: 'eq', text: '\u0000hunk' });
      a = Number(hunk[1]);
      b = Number(hunk[2]);
      continue;
    }
    if (line.startsWith('+')) ops.push({ type: 'add', text: line.slice(1), b: b++ });
    else if (line.startsWith('-')) ops.push({ type: 'del', text: line.slice(1), a: a++ });
    else if (line.startsWith(' ') || line === '') ops.push({ type: 'eq', text: line.slice(1), a: a++, b: b++ });
  }
  while (ops.length && ops[ops.length - 1]!.type === 'eq' && ops[ops.length - 1]!.text === '') ops.pop();
  return { ops, file };
}

/** Splits two changed lines into common prefix, differing middles and common suffix. */
export function intraLine(a: string, b: string): { prefix: string; aMid: string; bMid: string; suffix: string } | null {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const aMid = a.slice(p, a.length - s);
  const bMid = b.slice(p, b.length - s);
  // Only worth highlighting when most of the line is shared.
  if (p + s < Math.max(a.length, b.length) * 0.35) return null;
  return { prefix: a.slice(0, p), aMid, bMid, suffix: a.slice(a.length - s) };
}
