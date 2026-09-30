# The deck

*Code is cheap now. Attention isn't.* The 45-minute talk that goes with the
game: principles, a full run for the room, then a debrief built on what they
just did. [PRESENTATION.md](../PRESENTATION.md) is the plan for the session
itself, its timings and what to check beforehand.

**To present it:** open <https://flow-state.mschrenk.workers.dev/deck/>, the
copy served beside the game (since 2026-09-29). Offline, open
[`deck.html`](./deck.html) from a checkout instead: paste its full path as a
`file://` URL, or run `xdg-open docs/deck/deck.html`. It is one file with
nothing to install.

| Key | Does |
|---|---|
| → / Space, ← | Next, previous |
| N | Speaker notes |
| F | Full screen |
| Ctrl/Cmd+P | A PDF, one slide a page |

It loads its typefaces from Google Fonts and falls back to system fonts
offline. `deck.html#agents` opens at a slide.

## Where it lives

The deck was written as a claude.ai Slides artifact,
<https://claude.ai/artifact/USk8xhe7uwjvDmVEsbfB2G>, which is private until
shared from its Share menu. Brought into the repo 2026-09-28, so the talk is
versioned alongside the game it describes and checked by the same rules
(CLAUDE.md, *Keep the docs true*).

- **`project/`** is the source. `deck.json` holds the title, the slide
  order, the sections and the typefaces. `slides/<id>.html` is one slide each,
  a `<section>` on a 1920×1080 canvas with inline styles, and its `<aside>` is
  the speaker notes. These are the same files, in the same format, that the
  artifact holds, so the two copies can be compared and moved either way.
- **`deck.html`** is built from them by `pnpm deck` (`build.mjs`). Don't
  edit it. `pnpm test` fails if it is out of date, if a slide file and the
  order disagree, or if a slide uses an icon the build cannot draw.

## Changing it

Edit the slide files here, run `pnpm deck`, and commit both. Merging to
`main` also updates the copy at `/deck/`. **The repo is the copy of record.** To bring the claude.ai deck up to date, ask Claude Code
to publish the changed files in `docs/deck/project/` to the artifact URL
above. They go up at the same paths. If the deck was edited in claude.ai
instead, ask for its files to be pulled into `docs/deck/project/`, and run
`pnpm deck`.

Numbers on the slides come from the sims, and they move when the tuning
does. The debrief slides (`wip`, `agents`) cite the session's rate, four
items a day, from [HIRING_AND_ATTENTION.md](../HIRING_AND_ATTENTION.md) §10.
Free play's figures, where the work never runs out, are in the speaker notes
for comparison. `agenda` and `play` quote the run length, and they change
with `SESSION_TICKS`.

## Still to fill in

The bracketed placeholders are yours: `[Your name]`, `[Event]` and `[Date]`
on `cover`, `[Your name]` and `[contact]` on `close`, and the three prompts on
`mine`, which is for your own team's experience this year. The speaker notes
on `changed` and `amazon` each have one bracketed note to act on before
quoting. `[CODE]` on `join` is the session code, which the presenter tab
shows.
