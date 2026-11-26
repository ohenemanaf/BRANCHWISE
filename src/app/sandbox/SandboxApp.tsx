"use client";

import { useEffect, useRef, useState } from "react";
import { run } from "@/engine/run";
import { PRESETS, presetById } from "@/content/worlds";
import { useSandbox } from "@/lib/useSandbox";
import { Workbench } from "@/components/workbench/Workbench";

function encode(preset: string, lines: string[]) {
  const json = JSON.stringify({ p: preset, c: lines });
  return btoa(unescape(encodeURIComponent(json)));
}
function decode(s: string): { p: string; c: string[] } | null {
  try {
    const v = JSON.parse(decodeURIComponent(escape(atob(s))));
    return typeof v.p === "string" && Array.isArray(v.c) ? v : null;
  } catch {
    return null;
  }
}

export function SandboxApp() {
  const [presetId, setPresetId] = useState("started");
  const [first] = useState(() => presetById("started"));
  const [initialWorld] = useState(() => first.build());
  const sb = useSandbox(initialWorld, `Preset: ${first.name}. ${first.blurb} ${first.hint}`);
  const [copied, setCopied] = useState(false);
  const loaded = useRef(false);

  // ?preset=team or #s=<shared session>
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const url = new URL(window.location.href);
    const shared = url.hash.startsWith("#s=") ? decode(url.hash.slice(3)) : null;
    const id = shared?.p ?? url.searchParams.get("preset");
    if (!id) return;
    const p = presetById(id);
    let w = p.build();
    const notes: string[] = [];
    for (const line of shared?.c ?? []) {
      const r = run(w, line);
      w = r.world;
      notes.push(line);
    }
    // The URL (incl. #hash, which never reaches the server) is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresetId(p.id);
    sb.reset(w, shared ? `Loaded a shared session: preset "${p.name}" plus ${notes.length} command${notes.length === 1 ? "" : "s"}:\n  ${notes.join("\n  ")}` : `Preset: ${p.name}. ${p.hint}`);
  }, [sb]);

  const choose = (id: string) => {
    const p = presetById(id);
    setPresetId(id);
    sb.reset(p.build(), `Preset: ${p.name}. ${p.blurb} ${p.hint}`);
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("preset", id);
    window.history.replaceState(null, "", url);
  };

  const share = async () => {
    const lines = sb.entries.map((e) => e.input).filter((x): x is string => !!x && !x.startsWith("#"));
    const url = new URL(window.location.href);
    url.searchParams.delete("preset");
    url.hash = "s=" + encode(presetId, lines);
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Sandbox</h1>
          <p className="text-[13px] text-ink-2">Type real Git and GitHub CLI commands. Nothing here touches a real repository.</p>
        </div>
      </div>
      <Workbench
        sb={sb}
        terminalHeight="h-[min(46dvh,420px)] min-h-56"
        toolbar={
          <>
            <label htmlFor="preset" className="sr-only">
              Starting point
            </label>
            <select
              id="preset"
              value={presetId}
              onChange={(e) => choose(e.target.value)}
              className="h-7 max-w-[56vw] rounded-md border border-rule-strong bg-surface px-1.5 text-[12.5px]"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id} title={p.blurb}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => choose(presetId)} className="h-7 rounded-md px-2 text-[12px] text-ink-2 hover:bg-surface-2">
              Start over
            </button>
            <button type="button" onClick={share} className="h-7 rounded-md px-2 text-[12px] text-ink-2 hover:bg-surface-2" title="Copies a link that replays your commands">
              {copied ? "Link copied" : "Share"}
            </button>
          </>
        }
      />
    </div>
  );
}
