"use client";

import { useCallback, useReducer } from "react";
import { run, runRebaseTodo } from "@/engine/run";
import type { EngineEvent, Line, RebaseStep, World } from "@/engine/types";

export interface TermEntry {
  id: number;
  input: string | null;
  lines: Line[];
  ok: boolean;
}

export interface RebaseEditorState {
  onto: string;
  label: string;
  steps: RebaseStep[];
}

interface State {
  world: World;
  initial: World;
  past: World[];
  future: World[];
  entries: TermEntry[];
  rebaseEditor: RebaseEditorState | null;
  lastEvents: EngineEvent[];
  seq: number;
  commandCount: number;
}

type Action =
  | { type: "exec"; line: string }
  | { type: "apply"; world: World; note: string }
  | { type: "todo"; steps: RebaseStep[] }
  | { type: "closeEditor" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; world?: World; note?: string }
  | { type: "note"; lines: Line[] };

const MAX_HISTORY = 200;

function push(state: State, world: World, entry: Omit<TermEntry, "id">, events: EngineEvent[]): State {
  const changed = world !== state.world;
  const clear = events.some((e) => e.type === "clear");
  return {
    ...state,
    world,
    past: changed ? [...state.past.slice(-MAX_HISTORY), state.world] : state.past,
    future: changed ? [] : state.future,
    entries: clear ? [] : [...state.entries, { ...entry, id: state.seq }],
    lastEvents: events,
    seq: state.seq + 1,
  };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "exec": {
      const line = a.line.trim();
      if (!line) return { ...state, entries: [...state.entries, { id: state.seq, input: "", lines: [], ok: true }], seq: state.seq + 1 };
      const r = run(state.world, line);
      const editor = r.events.find((e) => e.type === "open-rebase-editor");
      const next = push(state, r.world, { input: line, lines: r.output, ok: r.ok }, r.events);
      next.commandCount = state.commandCount + 1;
      if (editor?.type === "open-rebase-editor") next.rebaseEditor = { onto: editor.onto, label: editor.upstream, steps: editor.steps };
      return next;
    }
    case "apply":
      return push(state, a.world, { input: null, lines: [{ text: a.note, tone: "muted" }], ok: true }, [{ type: "files", repo: a.world.cwd }]);
    case "todo": {
      const ed = state.rebaseEditor!;
      const r = runRebaseTodo(state.world, ed.onto, a.steps, ed.label);
      const summary = a.steps.map((s) => `${s.action} ${s.id.slice(0, 7)}`).join(", ");
      const next = push(state, r.world, { input: `# rebase todo: ${summary}`, lines: r.output, ok: r.ok }, r.events);
      next.rebaseEditor = r.ok || r.world !== state.world ? null : state.rebaseEditor;
      return next;
    }
    case "closeEditor":
      return {
        ...state,
        rebaseEditor: null,
        entries: [...state.entries, { id: state.seq, input: null, lines: [{ text: "Rebase cancelled — nothing changed.", tone: "muted" }], ok: true }],
        seq: state.seq + 1,
      };
    case "undo": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        world: prev,
        past: state.past.slice(0, -1),
        future: [state.world, ...state.future],
        entries: [...state.entries, { id: state.seq, input: null, lines: [{ text: "↶ Undid the last change (sandbox time travel — real Git has no undo button, see the reflog lesson).", tone: "muted" }], ok: true }],
        seq: state.seq + 1,
        lastEvents: [],
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      const [nextWorld, ...rest] = state.future;
      return { ...state, world: nextWorld, past: [...state.past, state.world], future: rest, lastEvents: [] };
    }
    case "reset": {
      const w = a.world ?? state.initial;
      return {
        ...state,
        world: w,
        initial: w,
        past: [],
        future: [],
        rebaseEditor: null,
        entries: a.note ? [{ id: state.seq, input: null, lines: [{ text: a.note, tone: "muted" }], ok: true }] : [],
        seq: state.seq + 1,
        lastEvents: [],
        commandCount: 0,
      };
    }
    case "note":
      return { ...state, entries: [...state.entries, { id: state.seq, input: null, lines: a.lines, ok: true }], seq: state.seq + 1 };
  }
}

export function useSandbox(initial: World, intro?: string) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    world: initial,
    initial,
    past: [],
    future: [],
    entries: intro ? [{ id: 0, input: null, lines: [{ text: intro, tone: "muted" as const }], ok: true }] : [],
    rebaseEditor: null,
    lastEvents: [],
    seq: 1,
    commandCount: 0,
  }));
  return {
    ...state,
    exec: useCallback((line: string) => dispatch({ type: "exec", line }), []),
    apply: useCallback((world: World, note: string) => dispatch({ type: "apply", world, note }), []),
    runTodo: useCallback((steps: RebaseStep[]) => dispatch({ type: "todo", steps }), []),
    closeEditor: useCallback(() => dispatch({ type: "closeEditor" }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
    reset: useCallback((world?: World, note?: string) => dispatch({ type: "reset", world, note }), []),
    note: useCallback((lines: Line[]) => dispatch({ type: "note", lines }), []),
  };
}

export type Sandbox = ReturnType<typeof useSandbox>;
