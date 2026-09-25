# Design — VARdict

The locked design system for VARdict's two screens: **/live** (the stadium, Next.js in `web/`) and **Stockley Park**
(the officials' booth, App SDK in `var-room/`). Every redesign reads this first. Extend this file; don't override
it per page. Written with Henrik in session 5 (Hallmark redesign).

**Brief.** Audience: judges watching a screen recording at 1080p, a few seconds per cut. The eye hits the footage
first, then the one button. Tone: broadcast, like Sky Sports at night: confident TV-graphics hierarchy, thin quiet
chrome, loud content. Henrik: "really important to get a clear view of what incident currently is being reviewed".

## Genre

Atmospheric (dark canvas, floodlight glow, one warm accent), in a broadcast register.

## The hierarchy ladder (the core rule)

Every screen has exactly these levels, loudest first. Nothing may be louder than the level above it.

| Level | What | How it looks |
| --- | --- | --- |
| L1 Subject | **The incident under review**: the scorebug + its title. /live: the footage sits next to it. | Scorebug (team colour chips, short names, minute) + title in display 800. On screen in every step. |
| L2 Now | The one thing happening: "VAR check", "Fans vote · 14", "Upheld". | One lower-third: accent tab + display text. One per screen. |
| L3 Action | The one next press. | The only filled-accent element on the screen. |
| L4 Evidence | The vote split, the calls, the workflow stage. | Ink on paper-2, display 700 numbers, no borders. |
| L5 Chrome | Wordmark, sound, results link, clocks, ticker, feed timestamps. | Body 400 at `--text-sm`, `--color-ink-2`. No boxes, no uppercase tracking. |

## Composition

- **/live** (macrostructure: Photographic, adapted to an app): the footage or the verdict fills the stage. The
  incident rides on the left rail as a scorebug; the decision strip under it reads referee → VAR → you.
- **Stockley Park** (macrostructure: Map / Diagram, adapted): an "Under review" band on top (L1 + L2 + L3), the
  workflow as a single thin rail under it, then the vote swing + live feed and the match-day list. The workflow
  rail is the diagram; it names stages, it doesn't explain them.
- One surface step per region: the stage sits on `--color-paper-2`, nothing inside it gets its own border.
  Borders only mark a *state* (the current stage, the VAR's call).
- Eyebrows: none by default. Labels are sentence case, `--text-sm`, `--color-ink-2`. The only uppercase is the
  display face.

## Theme (tokens)

Floodlit night. Anchor hue 155 (pitch green). Values mirror the original hex palette, in OKLCH.

- `--color-paper`    oklch(15% 0.012 155): the night
- `--color-paper-2`  oklch(20% 0.030 158): the pitch (stage surfaces)
- `--color-surface`  oklch(17% 0.020 157): quiet panels below the stage (booth feed, match day)
- `--color-paper-3`  oklch(25% 0.032 158): raised (a hovered row, the current stage)
- `--color-rule`     oklch(33% 0.035 160): dividers, only where a list needs one
- `--color-rule-soft` oklch(22% 0.025 158): row separators inside a surface
- `--color-ink`      oklch(95% 0.010 140): chalk
- `--color-ink-2`    oklch(76% 0.030 155): secondary text
- `--color-accent`   oklch(81% 0.165 80): VAR amber. L3 fill, the current stage, the VAR's call. ≤ 3% of a view
- `--color-uphold`   oklch(71% 0.160 152): vote colour only
- `--color-overturn` oklch(63% 0.195 24): vote colour only (plus the live/REC dot)
- `--color-focus`    = ink, 3 px ring

Red and green always come with a word ("Uphold 52%"), never colour alone.

## Typography

- Display: Barlow Condensed 800 (L1 title, L2, L3), 700 (numbers). Roman, uppercase, tracking 0.01em.
- Body: Barlow 400/500.
- Mono: JetBrains Mono 400, booth only, for timestamps and run ids (L5).
- Numbers: `tabular-nums` everywhere.
- Scale: sm 0.875rem · base 1rem · lg 1.25rem · xl 1.6rem · 2xl 2.2rem · display 3.2rem (clamp to 2.4rem on phones).

## Spacing

4-point: 1 · 2 · 3 · 4 · 6 · 8 · 12 (× 0.25rem). Regions separate by `--space-6`; items in a region by `--space-3`.

## Motion

- Easing `--ease-out` cubic-bezier(0.2, 0.8, 0.2, 1). Durations 150 / 300 / 600 ms.
- Only transform + opacity (the vote bar's width is the one exception: it *is* the data).
- The current stage pulses once when it changes, not forever. The REC dot is the one loop.
- Reduced motion: opacity only, ≤ 150 ms.

## Microinteractions

Silent success. A press shows its busy label on the button itself ("Opening the vote…"); errors are one line under
it. No toasts, no confirm dialogs (the Full wipe uses a typed WIPE inline).

## Components shared by both screens

- **Scorebug**: `[■ BHA] v [■ MUN]  97'` (team `primaryColor` chips) above the incident title. Both screens.
- **Lower-third (L2)**: accent tab + label. "VAR check · possible handball", "Fans vote · 14", "Upheld".
- **Calls pair**: "Referee: No penalty → VAR: Penalty" (the VAR's call in accent).
- **Split bar**: uphold/overturn with the 45/55 markers, the words on the bar ends.

## Stamp

`/* Hallmark · genre: atmospheric · macrostructure: <name> · design-system: design.md · designed-as-app */`
