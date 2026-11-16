import { test } from "node:test";
import assert from "node:assert/strict";
import { formatElapsed, statusKind, shouldPulse, trackStatuses, projectName, sortByProject, cardLabel, statusIcon, cycle, pickSelected } from "../mods/crmux-list/cards.js";

test("60 秒未満は秒を 2 桁右寄せで表す", () => {
  assert.equal(formatElapsed(5), " 5s");
});

test("60 秒以上 1 時間未満は分", () => {
  assert.equal(formatElapsed(60), " 1m");
  assert.equal(formatElapsed(3599), "59m");
});

test("1 時間以上は時間、99h が上限", () => {
  assert.equal(formatElapsed(3600), " 1h");
  assert.equal(formatElapsed(100 * 3600), "99h");
});

test("秒の端数は切り捨て、負の値は 0 秒", () => {
  assert.equal(formatElapsed(59.9), "59s");
  assert.equal(formatElapsed(-3), " 0s");
});

test("見た目の状態: done と idle はどちらも idle、working と blocked はそのまま", () => {
  assert.equal(statusKind("working"), "working");
  assert.equal(statusKind("blocked"), "blocked");
  assert.equal(statusKind("done"), "idle");
  assert.equal(statusKind("idle"), "idle");
});

test("入力待ちは経過時間や作業歴に関係なく常にパルス", () => {
  assert.equal(shouldPulse("blocked", 0, false), true);
  assert.equal(shouldPulse("blocked", 1000, true), true);
});

test("作業中を経験したエージェントは待機・完了になって 5〜15 秒だけパルス", () => {
  assert.equal(shouldPulse("idle", 4, true), false);
  assert.equal(shouldPulse("idle", 5, true), true);
  assert.equal(shouldPulse("done", 15, true), true);
  assert.equal(shouldPulse("done", 16, true), false);
});

test("作業中を経験していなければ待機でもパルスしない", () => {
  assert.equal(shouldPulse("idle", 10, false), false);
});

test("作業中はパルスしない", () => {
  assert.equal(shouldPulse("working", 10, true), false);
});

test("初めて見るエージェントは見えた時刻（seenAt）から数え、作業中なら作業歴ありにする", () => {
  const r = trackStatuses({}, [
    { address: "t1", status: "working", seenAt: 1000 },
    { address: "t2", status: "idle", seenAt: 2000 },
  ], 5000);
  assert.deepEqual(r, {
    t1: { kind: "working", since: 1000, hasWorked: true },
    t2: { kind: "idle", since: 2000, hasWorked: false },
  });
});

test("seenAt が無ければ今から数える", () => {
  const r = trackStatuses({}, [{ address: "t1", status: "blocked", seenAt: null }], 5000);
  assert.deepEqual(r, { t1: { kind: "blocked", since: 5000, hasWorked: false } });
});

test("状態が変われば今から数え直し、作業中になったら作業歴を残す", () => {
  const prev = { t1: { kind: "idle", since: 1000, hasWorked: false } };
  const working = trackStatuses(prev, [{ address: "t1", status: "working", seenAt: 0 }], 3000);
  assert.deepEqual(working, { t1: { kind: "working", since: 3000, hasWorked: true } });
  const done = trackStatuses(working, [{ address: "t1", status: "done", seenAt: 0 }], 4000);
  assert.deepEqual(done, { t1: { kind: "idle", since: 4000, hasWorked: true } });
});

test("done から idle（見た目は同じ Idle）では数え直さない", () => {
  const prev = { t1: { kind: "idle", since: 1000, hasWorked: true } };
  assert.equal(trackStatuses(prev, [{ address: "t1", status: "idle", seenAt: 0 }], 9000), prev);
});

test("何も変わらなければ同じオブジェクトを返す（shared に書かないで済む）", () => {
  const prev = { t1: { kind: "working", since: 1000, hasWorked: true } };
  assert.equal(trackStatuses(prev, [{ address: "t1", status: "working", seenAt: 0 }], 9000), prev);
});

test("いなくなったエージェントの記録は消す", () => {
  const prev = { t1: { kind: "working", since: 1000, hasWorked: true }, t2: { kind: "idle", since: 1, hasWorked: false } };
  assert.deepEqual(trackStatuses(prev, [{ address: "t1", status: "working", seenAt: 0 }], 9000), {
    t1: { kind: "working", since: 1000, hasWorked: true },
  });
});

test("project 名は cwd の最後の要素", () => {
  assert.equal(projectName("/home/me/src/crmux"), "crmux");
  assert.equal(projectName("/home/me/src/crmux/"), "crmux");
});

test("cwd が無ければ project 名は空文字、ルートは /", () => {
  assert.equal(projectName(null), "");
  assert.equal(projectName("/"), "/");
});

test("project 名の昇順に並べ、同名は元の順を保つ", () => {
  const list = [
    { address: "t1", project: "zeta" },
    { address: "t2", project: "alpha" },
    { address: "t3", project: "zeta" },
    { address: "t4", project: "beta" },
  ];
  assert.deepEqual(sortByProject(list).map((a) => a.address), ["t2", "t4", "t1", "t3"]);
});

test("並べ替えは元の配列を変えない", () => {
  const list = [{ project: "b" }, { project: "a" }];
  sortByProject(list);
  assert.deepEqual(list.map((a) => a.project), ["b", "a"]);
});

test("カード上辺: 選択中は > 、番号は 1 から、branch は / で続ける", () => {
  assert.equal(cardLabel({ selected: true, index: 0, project: "crmux", branch: "main" }), "> 1.crmux/main");
  assert.equal(cardLabel({ selected: false, index: 2, project: "dotfiles", branch: null }), "3.dotfiles");
});

test("カード上辺: 10 番目以降は番号を付けない（1〜9 キーで選べないので）", () => {
  assert.equal(cardLabel({ selected: false, index: 9, project: "x", branch: "b" }), "x/b");
});

test("状態アイコン: 作業中 ⚡、入力待ち ⚠、待機・完了 💤", () => {
  assert.equal(statusIcon("working"), "⚡");
  assert.equal(statusIcon("blocked"), "⚠");
  assert.equal(statusIcon("done"), "💤");
  assert.equal(statusIcon("idle"), "💤");
});

test("選択移動は端で反対側に回る", () => {
  assert.equal(cycle(0, 1, 3), 1);
  assert.equal(cycle(2, 1, 3), 0);
  assert.equal(cycle(0, -1, 3), 2);
});

test("選択移動: 一覧が空なら 0", () => {
  assert.equal(cycle(0, 1, 0), 0);
});

test("選択の決め方: 覚えている選択が一覧にあればそれ", () => {
  assert.equal(pickSelected(["t1", "t2"], "t2", "t1"), "t2");
});

test("選択の決め方: 覚えている選択が無ければ herdr の focused agent、それも無ければ先頭", () => {
  assert.equal(pickSelected(["t1", "t2"], "t9", "t2"), "t2");
  assert.equal(pickSelected(["t1", "t2"], null, "t9"), "t1");
  assert.equal(pickSelected([], "t1", "t1"), null);
});
