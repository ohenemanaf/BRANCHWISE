import type { Id, Tree } from "./types";

/** FNV-1a over a string with a seed, 32-bit. */
function fnv(str: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // final avalanche (murmur3 fmix32)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic 40-hex id. Not cryptographic, only stable and well-spread. */
export function hashString(str: string): Id {
  let out = "";
  for (let i = 0; i < 5; i++) out += fnv(str, i * 0x9e3779b9).toString(16).padStart(8, "0");
  return out;
}

export function stableTree(tree: Tree): [string, string][] {
  return Object.keys(tree)
    .sort()
    .map((k) => [k, tree[k]]);
}

export function commitId(parts: {
  parents: Id[];
  message: string;
  tree: Tree;
  author: string;
  time: number;
}): Id {
  return hashString(
    JSON.stringify([parts.parents, parts.message, stableTree(parts.tree), parts.author, parts.time]),
  );
}

export const short = (id: Id) => id.slice(0, 7);
