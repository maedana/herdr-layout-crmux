# herdr-layout-crmux

A [crmux](https://github.com/maedana/crmux)-style layout for the Herdr desktop app (herdr-app):
a card list of your coding agents on the left, live previews of their terminals on the right,
and a vim-like Normal / Insert mode.

- `layouts/crmux.json` — the layout (`crmux`): list | preview, with a footer
- `mods/crmux-list/` — the agent cards and Normal-mode keys
- `mods/crmux-footer/` — mode and key hints

## What you see

- One card per agent, sorted by project (the basename of its folder):
  `> N.project/branch` on top, the terminal title in the middle, a status icon and the time
  since the status changed at the bottom right (`⚡` working, `⚠` waiting for you, `💤` idle/done).
- Card colors follow the theme (`working` / `blocked` / `idle`). Waiting cards pulse; a card that
  was working pulses for 5–15 seconds after it stops.
- The right side shows real terminals. `v` cycles the arrangement:
  MainV → Single → Grid → EvenH → EvenV → MainH (Main* put the selected agent in the main slot).

## Keys

Normal (the list has the keyboard):

| Key | Action |
|---|---|
| `j` / `↓`, `k` / `↑` | select next / previous (wraps) |
| `1`–`9` | select by number |
| `t` | toggle with the previous selection |
| `i` | Insert: move the keyboard to the selected agent's terminal |
| `v` | next arrangement |
| `ctrl-u` / `ctrl-d` | scroll the preview half a page up / down |
| `g g` / `G` | scroll the preview to top / bottom |
| `q` | switch to the `main` layout and focus the agent's pane |
| `Esc` | right after leaving Insert: send `Esc Esc` to the agent and go back to Insert |

Insert (a terminal has the keyboard): `Esc` returns to Normal (needs the `keys.json` entry below).
Plain `Esc` therefore no longer reaches the program in this layout; press `Esc` twice to send it.

The same actions can be run from a shell while the layout is shown, e.g.
`herdr-app do crmux-list.arrange`, `crmux-list.down`, `crmux-list.select-2`, `crmux-list.normal`.

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
State (selection, arrangement, status times) is kept in Herdr's shared state (`crmux.*`).

## Development

```sh
node --test                                   # pure logic: mods/crmux-list/{cards,arrange}.js, footer
./install.sh && herdr-app check ~/.config/herdr-app/mods/crmux-list
```
