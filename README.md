# herdr-layout-crmux

A [crmux](https://github.com/maedana/crmux)-style layout for the Herdr desktop app (herdr-app):
a card list of your coding agents on the left, live previews of their terminals on the right,
and a vim-like Normal / Insert mode.

- `layouts/crmux.json` — the layout (`crmux`): list | preview, with a footer
- `mods/crmux-list/` — the agent cards and Normal-mode keys
- `mods/crmux-footer/` — mode and key hints

## What you see

- A heading with the current tab and its count (`All Sessions (N)`, `Marked (N)`,
  `Workspace @space (N)`, `Project name (N)`), and a tab bar under it:
  `All`, `Marked` (only while something is marked), `@space` (one per space, only with 2+ spaces),
  `+project` (one per project). The current tab is shown as `[name]`; when the bar is too wide it
  scrolls to keep the current tab in the middle and shows `<` / `>`.
- One card per agent in the current tab, sorted by project (the basename of its folder):
  `> N.project/branch` on top, then the terminal title (prefixed with a green `* ` when marked),
  and at the bottom the git diff summary on the left and a status icon with the time since the
  status changed on the right (`⚡` working, `⚠` waiting for you, `💤` idle/done).
- The git diff summary is read from each agent's folder every 5 seconds:
  `+N` staged files (green), `~N` modified files (yellow), `(+added -deleted)` lines (staged and
  unstaged together), or `no changes`. Nothing is shown outside a git repository.
- Card colors follow the theme (`working` / `blocked` / `idle`). Waiting cards pulse; a card that
  was working pulses for 5–15 seconds after it stops.
- The right side shows real terminals. `v` cycles the arrangement:
  MainV → Single → Grid → EvenH → EvenV → MainH (Main* put the selected agent in the main slot).
  Only the agents in the current tab are shown, numbered and navigated.

## Keys

Normal (the list has the keyboard):

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | select next / previous (wraps) |
| `1`–`9` | select by number |
| `t` | toggle with the previous selection |
| `h` / `←`, `l` / `→` | previous / next tab (wraps); the selection stays if the agent is in the new tab, else the first one |
| `Space` | mark / unmark the selected agent (unmarking the last one on the `Marked` tab goes back to `All`) |
| `i` | Insert: move the keyboard to the selected agent's terminal |
| `v` | next arrangement |
| `ctrl-u` / `ctrl-d` | scroll the preview half a page up / down |
| `g g` / `G` | scroll the preview to top / bottom |
| `q` | switch to the `main` layout and focus the agent's pane |
| `Esc` | right after leaving Insert: send `Esc Esc` to the agent and go back to Insert |

Insert (a terminal has the keyboard): `Esc` returns to Normal (needs the `keys.json` entry below).
Plain `Esc` therefore no longer reaches the program in this layout; press `Esc` twice to send it.

The same actions can be run from a shell while the layout is shown, e.g.
`herdr-app do crmux-list.arrange`, `crmux-list.down`, `crmux-list.select-2`, `crmux-list.normal`,
`crmux-list.mark`, `crmux-list.tab-next`, `crmux-list.tab-prev`.

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
    "escape": "crmux-list.normal"
  }
}
```

Note: changing the arrangement uses `layout.set`, which rewrites
`~/.config/herdr-app/layouts/crmux.json`. Running `./install.sh` resets it to the initial
(Single) layout; the list restores your arrangement the next time it starts.
State (selection, arrangement, status times, marks, current tab) is kept in Herdr's shared state
(`crmux.*`), so it survives switching layouts. Marks of agents that are gone are dropped.

## Development

```sh
node --test                                   # pure logic: mods/crmux-list/{cards,arrange,tabs,diff}.js, footer
./install.sh && herdr-app check ~/.config/herdr-app/mods/crmux-list
```

## License

MIT, see [LICENSE](LICENSE).
