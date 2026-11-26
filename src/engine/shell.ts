import { fail } from "./repo";

export interface ShellCommand {
  argv: string[];
  redirect: { op: ">" | ">>"; file: string } | null;
}

/** Split a command line into commands joined by `&&` or `;`, honoring quotes and redirects. */
export function parseLine(line: string): ShellCommand[] {
  const commands: ShellCommand[] = [];
  let argv: string[] = [];
  let redirect: ShellCommand["redirect"] = null;
  let pendingRedirect: ">" | ">>" | null = null;
  let cur = "";
  let has = false;
  let quote: '"' | "'" | null = null;

  const pushWord = () => {
    if (!has) return;
    if (pendingRedirect) {
      redirect = { op: pendingRedirect, file: cur };
      pendingRedirect = null;
    } else argv.push(cur);
    cur = "";
    has = false;
  };
  const endCommand = () => {
    pushWord();
    if (pendingRedirect) fail("bash: syntax error near unexpected token `newline'");
    if (argv.length) commands.push({ argv, redirect });
    argv = [];
    redirect = null;
  };

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < line.length && '"\\$`n'.includes(line[i + 1])) {
        const n = line[++i];
        cur += n === "n" ? "\n" : n;
      } else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === "\\" && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else if (c === " " || c === "\t") pushWord();
    else if (c === ">") {
      pushWord();
      if (line[i + 1] === ">") {
        i++;
        pendingRedirect = ">>";
      } else pendingRedirect = ">";
    } else if (c === "&" && line[i + 1] === "&") {
      i++;
      endCommand();
    } else if (c === ";") endCommand();
    else {
      cur += c;
      has = true;
    }
  }
  if (quote) fail("bash: unexpected EOF while looking for matching quote");
  endCommand();
  return commands;
}

export interface ParsedArgs {
  flags: Record<string, string[] | true>;
  pos: string[];
  /** Arguments after a bare `--`. */
  paths: string[];
  has(name: string): boolean;
  value(name: string): string | undefined;
  values(name: string): string[];
}

export interface ArgSpec {
  bool?: string[];
  value?: string[];
  /** alias -> canonical name, e.g. { "-u": "--set-upstream" } */
  alias?: Record<string, string>;
  /** Flags whose value is optional and must be attached (`--force-with-lease=main`). */
  optionalValue?: string[];
}

export function parseArgs(argv: string[], spec: ArgSpec, cmd = "git"): ParsedArgs {
  const bool = new Set(spec.bool ?? []);
  const value = new Set(spec.value ?? []);
  const optional = new Set(spec.optionalValue ?? []);
  const alias = spec.alias ?? {};
  const canon = (f: string) => alias[f] ?? f;
  const known = (f: string) => bool.has(canon(f)) || value.has(canon(f)) || optional.has(canon(f));
  const flags: Record<string, string[] | true> = {};
  const pos: string[] = [];
  const paths: string[] = [];
  const setValue = (f: string, v: string) => {
    const prev = flags[f];
    flags[f] = Array.isArray(prev) ? [...prev, v] : [v];
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      paths.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--") && a.includes("=")) {
      const [f, ...rest] = a.split("=");
      const c = canon(f);
      if (!value.has(c) && !optional.has(c)) fail(`error: unknown option \`${f.slice(2)}'`);
      setValue(c, rest.join("="));
      continue;
    }
    if (a.startsWith("-") && a.length > 1 && !/^-\d+$/.test(a)) {
      if (known(a)) {
        const c = canon(a);
        if (value.has(c)) {
          if (i + 1 >= argv.length) fail(`error: switch \`${a.replace(/^-+/, "")}' requires a value`);
          setValue(c, argv[++i]);
        } else flags[c] = true;
        continue;
      }
      // combined short flags: -am "msg", -fd
      if (/^-[a-zA-Z]{2,}$/.test(a)) {
        const chars = a.slice(1).split("");
        for (let k = 0; k < chars.length; k++) {
          const f = canon("-" + chars[k]);
          if (bool.has(f)) flags[f] = true;
          else if (value.has(f)) {
            const rest = chars.slice(k + 1).join("");
            if (rest) setValue(f, rest);
            else {
              if (i + 1 >= argv.length) fail(`error: switch \`${chars[k]}' requires a value`);
              setValue(f, argv[++i]);
            }
            break;
          } else fail(`error: unknown switch \`${chars[k]}'`);
        }
        continue;
      }
      fail(
        a.startsWith("--") ? `error: unknown option \`${a.slice(2)}'` : `error: unknown switch \`${a.slice(1)}'`,
        `usage: see '${cmd} --help' — or open the Cheat codes tab`,
      );
    }
    pos.push(a);
  }
  return {
    flags,
    pos,
    paths,
    has: (n) => canon(n) in flags,
    value: (n) => {
      const v = flags[canon(n)];
      return Array.isArray(v) ? v[v.length - 1] : undefined;
    },
    values: (n) => {
      const v = flags[canon(n)];
      return Array.isArray(v) ? v : [];
    },
  };
}
