// プレビューの並べ方（crmux の LayoutMode）と crmux layout のツリーを作る純粋関数

// v で回す順（crmux state.rs LayoutMode::next）
export const ARRANGES = ["MainV", "Single", "Grid", "EvenH", "EvenV", "MainH"];

export function nextArrange(arrange) {
  return ARRANGES[(ARRANGES.indexOf(arrange) + 1) % ARRANGES.length];
}

// 右側（id "preview"）のツリー。addresses は一覧の順、selected は選択中のアドレス
const GAP = 4;

const single = () => ({ id: "preview", type: "block", content: { agent: "focused" } });

// 1 エージェント分のターミナルブロック。選択中は accent の枠
function cell(address, selected, extra = {}) {
  return {
    id: `pv-${address.replace(/[^A-Za-z0-9_-]/g, "_")}`, type: "block", ...extra,
    border: { width: 1, color: address === selected ? "accent" : "border" },
    content: { terminal: address },
  };
}

const split = (type, children, extra = {}) => ({ type, gap: GAP, ...extra, children });

export function previewTree(arrange, addresses, selected) {
  if (arrange === "Single" || addresses.length <= 1) return single();
  const cells = addresses.map((a) => cell(a, selected));
  if (arrange === "EvenH") return split("row", cells, { id: "preview" });
  if (arrange === "EvenV") return split("column", cells, { id: "preview" });
  if (arrange === "MainV" || arrange === "MainH") return mainTree(arrange, addresses, selected);
  if (arrange === "Grid") return gridTree(cells);
  return single();
}

// MainV / MainH: 選択中をメインに（crmux は選択中を先頭へ並べ替える）。メインの割合は
// crmux の MainV が内容幅から 60〜80% を選ぶところ、ここでは内容幅が分からないので 70% 固定。MainH は 60%
const MAIN = {
  MainV: { type: "row", rest: "column", main: 7, other: 3 },
  MainH: { type: "column", rest: "row", main: 6, other: 4 },
};

function mainTree(arrange, addresses, selected) {
  const m = MAIN[arrange];
  const main = addresses.includes(selected) ? selected : addresses[0];
  const rest = addresses.filter((a) => a !== main).map((a) => cell(a, selected));
  return split(m.type, [
    cell(main, selected, { size: { weight: m.main } }),
    split(m.rest, rest, { id: "pv-rest", size: { weight: m.other } }),
  ], { id: "preview" });
}

// Grid: crmux は最小 80 列で列数を決めるが、ここでは幅が分からないので ceil(sqrt(n)) 列。
// 行を上から埋め、最後の行に余り（crmux ui.rs grid_row_items）
function gridTree(cells) {
  const cols = Math.ceil(Math.sqrt(cells.length));
  const rows = [];
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(split("row", cells.slice(i, i + cols), { id: `pv-row-${rows.length}` }));
  }
  return split("column", rows, { id: "preview" });
}

// layout.set に渡す crmux layout 全体（preview だけ差し替える）。layouts/crmux.json は Single のこれと同じ
export function crmuxLayout(preview) {
  return {
    id: "root", type: "column", titlebar: "none", traffic_lights: [12, 16],
    background: "canvas", terminal_padding: [14, 12], divider: { width: 1, color: "border" },
    children: [
      {
        id: "body", type: "row",
        children: [
          { id: "list", type: "block", size: { px: 280 }, background: "chrome", window_drag: true, content: { mod: "crmux-list" } },
          preview,
        ],
      },
      { id: "footer", type: "block", size: { px: 28 }, background: "chrome", content: { mod: "crmux-footer" } },
    ],
  };
}

// layout ツリーから id のノードを探す
export function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// キーの順に依らずに同じ中身か（layout() が返すツリーと作ったツリーを比べる）
export function sameTree(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => sameTree(a[k], b[k]));
}
