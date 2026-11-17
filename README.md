# herdr-layout-crmux

A [crmux](https://github.com/maedana/crmux)-style layout for the Herdr desktop app (herdr-app):
a card list of your coding agents on the left, live previews of their terminals on the right,
and a vim-like Normal / Insert mode.

- `layouts/crmux.json` — the layout (`crmux`): a header row, then list | preview, then a footer
- `mods/crmux-tabs/` — the tab bar (full-width header row)
- `mods/crmux-list/` — the agent cards and Normal-mode keys
- `mods/crmux-footer/` — mode and key hints
- `mods/crmux-title/` — the title row above each preview terminal

## What you see

- A tab bar in a full-width header row at the top of the window (above the list and the preview), with the number of agents in each tab:
  `All(N)`, `Marked(N)` (only while something is marked), `@space(N)` (one per space, only with 2+ spaces),
  `+project(N)` (one per project). Tabs are drawn as rounded boxes and the current one is filled; when the bar is too wide it
  scrolls horizontally to keep the current tab visible. Click a tab to switch to it (like `h` / `l`);
  clicking a tab while a terminal has the keyboard (Insert) returns to Normal.
  (crmux shows the count only in a heading for the current tab; here the tabs carry it and there is no heading.)
- One card per agent in the current tab, sorted by project (the name of its git
  repository; agents in git worktrees are grouped under the original repository, and outside git
  the folder's basename is used): the program's icon (as in the preview's title row: an agent's or the shell's) and `> N.project/branch` on top (a worktree agent without a branch
  shows `N.project/worktree`, and its title is drawn in cyan), then the terminal title (prefixed with a green `* ` when marked),
  and at the bottom the git diff summary on the left and a status icon with the time since the
  status changed on the right (`⚡` working, `⚠` waiting for you, `💤` idle/done).
- The git diff summary is read from each agent's folder every 5 seconds:
  `+N` staged files (green), `~N` modified files (yellow), `(+added -deleted)` lines (staged and
  unstaged together), or `no changes`. Nothing is shown outside a git repository.
- Card colors follow the theme (`working` / `blocked` / `idle`). Waiting cards pulse; a card that
  was working pulses for 5–15 seconds after it stops.
- Plain shells are listed too: every live terminal shown in a pane that is not an agent (no status). That is both the
  shell an agent leaves behind when it exits and a shell that never ran an agent (e.g. one opened with `n` to start a
  server); crmux does not tell them apart. They are dimmed cards (`muted`) without the state and elapsed time at the bottom
  right (those are for agents), grouped by project like the agents (so a `+project` tab shows that repository's agents and shells together).
  Selecting one shows the shell in the preview; `x` closes its terminal (and its pane, or its tab if it was the last pane).
- The right side shows real terminals. `v` cycles the arrangement:
  MainV → Single → Grid → EvenH → EvenV → MainH (Main* put the selected agent in the main slot).
  Only the agents in the current tab are shown, numbered and navigated.
  Clicking a preview selects it in place without rearranging; selecting from the list (keys, a card, a title row, a tab switch) brings that agent to the main pane.
- Each preview terminal has a 30px title row above it, in the look of herdr-app's own pane header: the program's icon,
  `N.project/branch` (the card's label; cyan for a worktree agent, dimmed for a shell), the terminal title (dimmed),
  and the status on the right (a spinner while working, a "Needs you" badge while blocked, a dot when done, nothing when idle).
  The selection is shown by the preview's border. In Single the row follows the selection.
  Click a title row to select that agent (like clicking its card; in Insert it returns to Normal first).

## Borders

The list and every preview have a 1px border. Each preview is one rounded frame around its title row and terminal,
like herdr-app's own panes. The accent (blue) border is where the keys go: the list in Normal / Scroll, the preview you are
typing into in Insert. The preview frames follow the list's mode rather than the layout's `focus` border (which does not
light up for a terminal inside the frame's column), so entering or leaving Insert, or selecting another agent in Insert,
re-sets the layout to move the accent. The list is a mod block, which does not honor `focus` either, so it draws its own border.
In a multi-pane arrangement the selected preview has a light border in Normal (so you can still see which one `i` will
enter), and the others are gray. The frames stay 1px whatever their color, so nothing resizes. Clicking a preview moves the
keyboard there, so it is treated as Insert: that agent becomes the selection (the footer shows `-- INSERT --`). Click the
list or press `Esc` to go back to Normal.

## Keys

Normal (the list has the keyboard):

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | select next / previous (wraps) |
| `1`–`9` | select by number |
| `t` | toggle with the previous selection |
| `h` / `←`, `l` / `→` | previous / next tab (wraps); the selection stays if the agent is in the new tab, else the first one |
| `Space` | mark / unmark the selected agent (unmarking the last one on the `Marked` tab goes back to `All`) |
| `n` | open a plain shell in a new background tab of the selected one's space, in its folder, then select it and enter Insert (to run a server or a command outside the agents) |
| `x` | close the selected shell's terminal (no confirmation) and select the next card; does nothing on a live agent, or while something other than the shell runs in front (vim, a server, an agent starting up) |
| `i` | Insert: move the keyboard to the selected agent's terminal |
| `v` | next arrangement |
| `ctrl-u` / `g g` | scroll the preview half a page up / to the top and enter Scroll |
| `ctrl-d` / `G` | scroll the preview half a page down / to the bottom |
| `q` | switch to the `main` layout and focus the agent's pane |
| `Esc` | right after leaving Insert: send `Esc Esc` to the agent and go back to Insert |

Scroll (the preview is scrolled up; `-- SCROLL --` in the footer):

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | scroll the preview one line down / up (reaching the bottom returns to Normal) |
| `ctrl-u` / `ctrl-d` | scroll the preview half a page up / down (reaching the bottom returns to Normal) |
| `g g` / `G` | scroll the preview to the top / to the bottom and back to Normal |
| `i` | back to the bottom and Insert |
| `Esc` | back to the bottom and Normal |

Other keys do nothing in Scroll. Selecting another agent (e.g. clicking a card) also puts the preview back at the bottom.

Insert (a terminal has the keyboard): `Esc` returns to Normal (needs the `keys.json` entry below).
Plain `Esc` therefore no longer reaches the program in this layout; press `Esc` twice to send it.

Moving between panes with the main layout's `ctrl-t h/j/k/l` (`pane.go` does not work from a layout terminal block, so they
are bound to `crmux-list.go-left` etc. in the `keys.json` entries below; other keys can be bound the same way): in Insert, the keyboard moves to the preview next
to the one being typed into (it is selected in place and stays Insert), and going left from the leftmost one (or in Single)
returns to the list (Normal). In Normal, right enters the selected preview (like `i`).

The same actions can be run from a shell while the layout is shown, e.g.
`herdr-app do crmux-list.arrange`, `crmux-list.down`, `crmux-list.select-2`, `crmux-list.normal`,
`crmux-list.mark`, `crmux-list.tab-next`, `crmux-list.tab-prev`, `crmux-list.tab-<n>` (0 = the first tab; what a tab click sends), `crmux-list.scroll-up`, `crmux-list.line-down`, `crmux-list.close`, `crmux-list.shell`, `crmux-list.go-left` (`-right`, `-up`, `-down`).

## Install

```sh
./install.sh   # copies layouts/ and mods/ into ~/.config/herdr-app (or $HERDR_APP_HOME)
```

Add to `~/.config/herdr-app/keys.json`:

```json
{
  "global": {
    "ctrl-t a": "layout.switch:crmux",
    "ctrl-t m": "layout.switch:main"
  },
  "layout:crmux": {
    "escape": "crmux-list.normal",
    "ctrl-t h": "crmux-list.go-left",
    "ctrl-t j": "crmux-list.go-down",
    "ctrl-t k": "crmux-list.go-up",
    "ctrl-t l": "crmux-list.go-right"
  }
}
```

Note: changing the arrangement uses `layout.set`, which rewrites
`~/.config/herdr-app/layouts/crmux.json`. Running `./install.sh` resets it to the initial
(Single) layout; the list restores your arrangement the next time it starts.
State (selection, arrangement, status times, marks, current tab, the tab bar's labels) is kept in Herdr's shared state
(`crmux.*`), so it survives switching layouts. Marks of agents that are gone are dropped.

## Development

```sh
node --test                                   # pure logic: mods/crmux-list/{cards,arrange,tabs,diff}.js, crmux-tabs/tabbar.js, footer
./install.sh && for m in crmux-list crmux-tabs crmux-footer; do herdr-app check ~/.config/herdr-app/mods/$m; done
```

## License

MIT, see [LICENSE](LICENSE).
