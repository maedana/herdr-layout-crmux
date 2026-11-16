// git diff 要約の純粋関数（crmux state.rs parse_numstat / ui.rs git_diff_line）

const toInt = (s) => {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
};

// `git diff --numstat` の出力 → { files, ins, del }。バイナリ（"-\t-\t…"）はファイル数だけ数える
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

// カード下辺左の表示部品（crmux ui.rs git_diff_line）。color は役割名: add（緑）/ mod（黄）/ del（赤）/ dim（薄い色）。
// staged / unstaged は parseNumstat の結果。staged が null（git リポジトリでない）なら null、unstaged の null は 0 扱い
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

// 結果を引くための key（マシン + cwd）
export const diffKey = (machine, cwd) => `${machine ?? ""}\0${cwd}`;

// git diff を取る先: 同じマシンの同じ cwd はまとめて 1 回。cwd が無ければ取らない
export function diffTargets(list) {
  const byKey = new Map();
  for (const { cwd, machine } of list) {
    if (!cwd) continue;
    const key = diffKey(machine, cwd);
    if (!byKey.has(key)) byKey.set(key, { key, cwd, machine: machine ?? null });
  }
  return [...byKey.values()];
}
