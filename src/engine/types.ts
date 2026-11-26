/**
 * The simulated Git world. Everything the UI shows is derived from these types,
 * and every command is `World -> World` (see run.ts), so state is never mutated
 * in place from the outside.
 */

export type Id = string;

/** A snapshot of files: path -> content. Paths use forward slashes, no leading slash. */
export type Tree = Record<string, string>;

export interface Commit {
  id: Id;
  parents: Id[];
  message: string;
  tree: Tree;
  author: string;
  /** Logical time (world clock), used for ordering and hashing. */
  time: number;
  /** Set on synthetic commits the UI may draw differently. */
  kind?: "stash";
}

export type Head = { kind: "branch"; name: string } | { kind: "detached"; id: Id };

export interface ReflogEntry {
  id: Id;
  prev: Id | null;
  message: string;
}

export interface ConflictVersions {
  base: string | null;
  ours: string | null;
  theirs: string | null;
}

/** A merge, rebase, cherry-pick or revert that stopped part-way. */
export type Operation =
  | {
      kind: "merge";
      theirs: Id;
      /** git merge --squash: concluding commit gets one parent. */
      squash: boolean;
      label: string;
      message: string;
      unmerged: string[];
      versions: Record<string, ConflictVersions>;
    }
  | {
      kind: "rebase";
      /** Branch being rebased, or null when rebasing a detached HEAD. */
      branch: string | null;
      origHead: Id;
      onto: Id;
      todo: RebaseStep[];
      /** The step that stopped with conflicts, if any. */
      current: RebaseStep | null;
      unmerged: string[];
      versions: Record<string, ConflictVersions>;
    }
  | {
      kind: "cherry-pick" | "revert";
      commit: Id;
      remaining: Id[];
      message: string;
      unmerged: string[];
      versions: Record<string, ConflictVersions>;
    };

export type RebaseAction = "pick" | "reword" | "squash" | "fixup" | "drop";

export interface RebaseStep {
  action: RebaseAction;
  id: Id;
  /** New message for reword, or the combined message for squash. */
  message?: string;
}

export interface StashEntry {
  /** Synthetic commit id so the graph can draw it. */
  id: Id;
  base: Id;
  branch: string;
  message: string;
  index: Tree;
  workdir: Tree;
}

export interface BisectState {
  bad: Id | null;
  good: Id[];
  origHead: Head;
  current: Id | null;
}

export interface Repo {
  /** Display name, e.g. "you/project" or "local". */
  name: string;
  initialized: boolean;
  bare: boolean;
  commits: Record<Id, Commit>;
  branches: Record<string, Id>;
  tags: Record<string, Id>;
  /** remote name -> branch -> id (remote-tracking refs, e.g. origin/main). */
  remoteRefs: Record<string, Record<string, Id>>;
  /** remote name -> URL */
  remotes: Record<string, string>;
  /** local branch -> its upstream */
  upstream: Record<string, { remote: string; branch: string }>;
  head: Head;
  index: Tree;
  workdir: Tree;
  /** "HEAD" and branch names -> newest-first entries. */
  reflog: Record<string, ReflogEntry[]>;
  stash: StashEntry[];
  op: Operation | null;
  bisect: BisectState | null;
  config: Record<string, string>;
  /** ORIG_HEAD, set by reset/merge/rebase like real Git. */
  origHead: Id | null;
}

export interface BranchProtection {
  requirePullRequest: boolean;
  requireApproval: boolean;
  requireChecks: boolean;
}

export interface GhRepo {
  /** World key of the Repo holding this repo's objects. */
  key: string;
  owner: string;
  name: string;
  forkOf: string | null;
  defaultBranch: string;
  protection: Record<string, BranchProtection>;
}

export type ReviewState = "approved" | "changes_requested" | "commented";

export interface Review {
  author: string;
  state: ReviewState;
  body: string;
}

export type MergeMethod = "merge" | "squash" | "rebase";

export interface PullRequest {
  number: number;
  /** GitHub repo key (base side). */
  repo: string;
  base: string;
  headRepo: string;
  head: string;
  title: string;
  body: string;
  author: string;
  state: "open" | "merged" | "closed";
  reviews: Review[];
  mergedAs: Id | null;
  method: MergeMethod | null;
}

export interface RunStep {
  name: string;
  command: string | null;
  status: "success" | "failure" | "skipped";
  log: string[];
}

export interface ActionRun {
  id: number;
  repo: string;
  branch: string;
  sha: Id;
  workflow: string;
  event: "push" | "pull_request";
  status: "success" | "failure";
  steps: RunStep[];
}

export interface GitHub {
  /** keyed by world repo key */
  repos: Record<string, GhRepo>;
  prs: PullRequest[];
  runs: ActionRun[];
}

/** What a test command (npm test) checks, so bisect and Actions have something to run. */
export interface TestRule {
  path: string;
  /** The test fails when the file contains this text. */
  failsWhen: string;
}

export interface World {
  repos: Record<string, Repo>;
  /** Repo key the terminal is "in". */
  cwd: string;
  github: GitHub;
  clock: number;
  user: { name: string; email: string; login: string };
  testRule: TestRule | null;
  /** Who reviews / pushes when the lesson simulates a teammate. */
  teammate: string;
}

export type Tone = "normal" | "error" | "hint" | "success" | "muted" | "warn";

export interface Line {
  text: string;
  tone: Tone;
}

export type EngineEvent =
  | { type: "commit"; repo: string; id: Id }
  | { type: "ref"; repo: string; ref: string; from: Id | null; to: Id | null }
  | { type: "head"; repo: string }
  | { type: "conflict"; repo: string; paths: string[] }
  | { type: "transfer"; from: string; to: string; ids: Id[] }
  | { type: "pr"; number: number; action: "opened" | "reviewed" | "merged" | "closed" }
  | { type: "run"; id: number }
  | { type: "files"; repo: string }
  | { type: "open-rebase-editor"; repo: string; upstream: string; onto: Id; steps: RebaseStep[] }
  | { type: "clear" };

export interface RunResult {
  world: World;
  output: Line[];
  events: EngineEvent[];
  ok: boolean;
}
