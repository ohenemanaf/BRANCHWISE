/** Line diffs and a three-way (diff3-style) merge for file contents. */

export const toLines = (s: string): string[] => (s === "" ? [] : s.replace(/\n$/, "").split("\n"));
export const fromLines = (lines: string[]): string => (lines.length ? lines.join("\n") + "\n" : "");

/** Longest common subsequence as index pairs [i in a, j in b], increasing in both. */
export function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

export type DiffOp = { type: "eq" | "del" | "add"; line: string };

export function diffLines(a: string[], b: string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...lcsPairs(a, b), [a.length, b.length] as [number, number]]) {
    while (i < pi) ops.push({ type: "del", line: a[i++] });
    while (j < pj) ops.push({ type: "add", line: b[j++] });
    if (pi < a.length) {
      ops.push({ type: "eq", line: a[pi] });
      i++;
      j++;
    }
  }
  return ops;
}

export interface Merge3Result {
  clean: boolean;
  content: string;
}

const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);

/**
 * Classic diff3: base lines matched in BOTH sides are stable anchors; each gap between
 * anchors is resolved as "only one side changed it" or else a conflict.
 */
export function merge3(
  base: string,
  ours: string,
  theirs: string,
  labels: { ours: string; theirs: string },
): Merge3Result {
  const B = toLines(base);
  const A = toLines(ours);
  const T = toLines(theirs);
  const ba = new Map(lcsPairs(B, A));
  const bt = new Map(lcsPairs(B, T));
  const anchors: [number, number, number][] = [];
  for (let i = 0; i < B.length; i++) {
    if (ba.has(i) && bt.has(i)) anchors.push([i, ba.get(i)!, bt.get(i)!]);
  }
  anchors.push([B.length, A.length, T.length]);

  const out: string[] = [];
  let clean = true;
  let b0 = 0;
  let a0 = 0;
  let t0 = 0;
  for (const [b1, a1, t1] of anchors) {
    const bc = B.slice(b0, b1);
    const ac = A.slice(a0, a1);
    const tc = T.slice(t0, t1);
    if (same(ac, bc)) out.push(...tc);
    else if (same(tc, bc)) out.push(...ac);
    else if (same(ac, tc)) out.push(...ac);
    else {
      clean = false;
      out.push(`<<<<<<< ${labels.ours}`, ...ac, "=======", ...tc, `>>>>>>> ${labels.theirs}`);
    }
    if (b1 < B.length) out.push(B[b1]);
    b0 = b1 + 1;
    a0 = a1 + 1;
    t0 = t1 + 1;
  }
  return { clean, content: fromLines(out) };
}

export const hasConflictMarkers = (s: string) => /^<<<<<<< |^=======$|^>>>>>>> /m.test(s);
