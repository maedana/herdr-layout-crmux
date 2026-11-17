// Pure functions for the git diff summary (crmux state.rs parse_numstat / ui.rs git_diff_line)

const toInt = (s) => {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
};

// Output of `git diff --numstat` -> { files, ins, del }. Binary files ("-\t-\t...") count only toward the file count
export function parseNumstat(text) {
  let files = 0;
  let ins = 0;
  let del = 0;
  for (const line of text.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    files += 1;
    ins += toInt(parts[0]);
    del += toInt(parts[1]);
  }
  return { files, ins, del };
}

// Display parts for the card's bottom-left (crmux ui.rs git_diff_line). color is a role name: add (green) / mod (yellow) / del (red) / dim (faint).
// staged / unstaged are parseNumstat results. null if staged is null (not a git repository); a null unstaged is treated as 0
export function diffSummary(staged, unstaged) {
  if (!staged) return null;
  const u = unstaged ?? { files: 0, ins: 0, del: 0 };
  if (staged.files === 0 && u.files === 0) return [{ text: "no changes", color: "dim" }];
  const parts = [];
  if (staged.files > 0) parts.push({ text: `+${staged.files}`, color: "add" }, { text: " " });
  if (u.files > 0) parts.push({ text: `~${u.files}`, color: "mod" }, { text: " " });
  parts.push(
    { text: "(", color: "dim" },
    { text: `+${staged.ins + u.ins}`, color: "add" },
    { text: " ", color: "dim" },
    { text: `-${staged.del + u.del}`, color: "del" },
    { text: ")", color: "dim" },
  );
  return parts;
}

// Key for looking up results (machine + cwd): the cwd on this machine, "machine:cwd" on another (a cwd starts with "/",
// so they never collide). No NUL: keys kept in shared are cut at one
export const diffKey = (machine, cwd) => (machine ? `${machine}:${cwd}` : cwd);

// Repositories to keep in shared: the known ones for the keys still in use, plus the new [key, repo] answers
// (dropping the rest keeps the persisted map from growing with every folder ever visited)
export function keepRepos(repos, keys, answered) {
  const kept = keys.filter((k) => Object.hasOwn(repos, k)).map((k) => [k, repos[k]]);
  return Object.fromEntries([...kept, ...answered]);
}

// Targets to run git diff on: the same cwd on the same machine only once. Skipped when there is no cwd
export function diffTargets(list) {
  const byKey = new Map();
  for (const { cwd, machine } of list) {
    if (!cwd) continue;
    const key = diffKey(machine, cwd);
    if (!byKey.has(key)) byKey.set(key, { key, cwd, machine: machine ?? null });
  }
  return [...byKey.values()];
}
