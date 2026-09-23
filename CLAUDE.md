# VARdict — project brief for Claude Code

VARdict is an entry for the Sanity Challenge on DEV, **Path Two: Vibe-Code Something Strange**.
Challenge page: https://dev.to/challenges/sanity-2026-09-16
Submissions close **October 4, 2026, 11:59 PM PDT** (08:59 on Oct 5 in Sweden). Aim to publish on Oct 4.

## The concept

The VAR room makes a decision, but the decision only stands if the public confirms it by live vote.
The joke answers VAR's two biggest criticisms: it's often wrong, so we add the crowd (who are wronger),
and it takes too long, so we make it take much longer.

Pitch: "Football fixed VAR. We fixed it with democracy. Now it's slower and less accurate."

## How we work together

- **The repo is created by Henrik.** Everything else (Sanity project, datasets, schemas, deploys) can be
  set up from here. Use the Sanity MCP server for project and dataset setup where it can do the job.
- **Keep the scope tight.** Anything not listed under "In scope" is out unless Henrik asks for it.
- **Sanity docs:** prefer current docs over memory. The full index is at https://www.sanity.io/docs/llms.txt,
  and any docs page has a markdown version if you append `.md` to its URL. Workflows is in early access and
  changes fast, so always check its docs before writing workflow code (index: https://www.sanity.io/docs/workflows.md).
- **Build log:** after every session, append to `BUILD_LOG.md`: what we did, prompts that worked, prompts that
  failed, where you got stuck, and how we course-corrected. The writeup is judged as hard as the app, so be
  honest, including failures.
- **Verify, don't assume.** When an assumption below turns out wrong, stop, tell Henrik, update this file, and
  log it.
- **Never commit secrets.** Tokens go in `.env.local` files, which are gitignored. Provide `.env.example` files.

## Sanity project facts

| Thing | Value |
| --- | --- |
| Account | Henrik's personal account (GitHub login), **not** the Kodamera account |
| Organization | `o7aI6GMzu` ("Henrik Larsson (org)"), plan tier not yet checked, assume Free |
| Project | `t2sbu6uu` ("VARdict") |
| Content dataset | `production` (**public**, needed for the submission's public dataset URL) |
| Workflow dataset | `workflows` (**private**, engine-owned definitions, instances, guards) |
| CORS | `http://localhost:3000`, `:3333`, `:3334` (with credentials) |
| Tokens | Root `.env.local` and `web/.env.local` (gitignored). See `.env.example`. |

## In scope (must ship)

- 5 real, famous VAR incidents as structured content
- Official YouTube clips embedded at exact start and end times, with a text fallback
- One workflow, `peoplesVar`: VAR room, public referendum, extra time, shootout, loop back on overturn
- Control Room (App SDK): the operator's big screen with live bars
- Phone voting page and results pages (Next.js)
- Simulated crowd with fixed personas; every bot vote flagged `simulated: true`
- "Time added by democracy" clock, computed with GROQ (never stored)
- Custom Studio input that previews a clip at the chosen start and end

## Out of scope

Tunable crowd sliders, user accounts or login for voters, animated tactical diagrams, more than 5 incidents,
a Path One entry.

## Repo structure

pnpm workspace (`pnpm-workspace.yaml`), Node 24 (`.nvmrc`).

```
/studio          Sanity Studio (sanity 6.x): schemas + custom clip input
/web             Next.js 16: /vote (phone), /incidents/[slug] (results), /api/tick, /api/vote
/control-room    App SDK app (sanity dev → Dashboard): the big screen
/functions       Sanity Functions: effect drainer + bot crowd (Blueprints)
/workflows       peoplesVar definition, sanity.workflow.ts, tests, scripts/
CLAUDE.md        this file
BUILD_LOG.md     session log for the writeup
```

`web/AGENTS.md` is Next.js's own agent note: Next 16 differs from training data, read
`web/node_modules/next/dist/docs/` before writing Next code.

## Architecture

- All parts share one Sanity project. All writes go through the Content Lake, so every screen updates live.
- Workflow instances live in the `workflows` dataset, next to the `production` content dataset.
- **Verified (session 1):** App SDK apps run inside the Sanity Dashboard iframe. The Dashboard hands the app a
  logged-in Sanity user's token, and redirects to sanity.io/login if nobody is logged in. So anonymous phone
  voters vote through the Next.js `/vote` page, which writes votes via a server route using a write token.
  The App SDK Control Room is only the operator's big screen.

### Workflows facts (verified session 1, packages 0.35.0)

- Workflows is a **library, not a service**. Public early access, no access gate. Packages
  `@sanity/workflow-engine` + `@sanity/workflow-cli`, pinned **exact** and upgraded in lockstep
  (0.x minor = breaking; read release notes first).
- Config: `workflows/sanity.workflow.ts`, deployment `dev`, tag `dev`, `expectedMinReaderModel: 10`
  (required `subject` field needs model 10), `workflowResource: t2sbu6uu.workflows`.
  Deploy: `pnpm --filter workflows deploy` (`sanity-workflows deploy`). Blueprints can't deploy definitions.
- **Cross-dataset:** the subject (incident) lives in `production`, state in `workflows`. The engine only
  accepts refs into `production` if `createEngine({resourceClients})` returns a client for it.
  The CLI has no way to do this, so `sanity-workflows start` with a production subject is rejected.
  Drive instances through the engine API (see `workflows/scripts/smoke.ts` for the working pattern).
- Subject value shape: `{id: 'dataset:t2sbu6uu:production:<docId>', type: '<_type>'}` (published id only).
- Nothing moves on its own: time-based transitions need something to call `engine.tick({instanceId})`;
  queued effects need something to call `engine.drainEffects()`.
- **Guards are advisory** in early access: the Content Lake does not enforce them yet.
- Reset during dev: `pnpm --filter workflows exec sanity-workflows nuke --deployment dev --force`.

## Content model

| Type | Key fields | Notes |
| --- | --- | --- |
| incident | title, slug, match (ref), minute, incidentType, lawsInvolved (refs), originalCall, varRecommendation, finalCall, realDelaySeconds, clip, fallbackText, outcry | Three separate call fields tell the story as data |
| match | homeTeam, awayTeam (refs), competition, date, venue, score | |
| team | name, shortName, primaryColor | Colors used in the voting UI |
| law | number, title, summary | IFAB Laws of the Game, summaries in our own words |
| referendum | incident (ref), round, threshold, windowOpensAt, closesAt, result | Rounds: regular, extraTime, shootout1 to shootout5 |
| vote | referendum (ref), choice, sessionId, simulated, persona, castAt | choice: uphold or overturn. persona only on bot votes |

Objects:
- `clip`: youtubeId, startSeconds, endSeconds, channel, official (boolean), embedAllowed (boolean)
- `outcry`: level (1–5), summary (own words), sources (array of URLs)

Enums:
- incidentType: offside, handball, penalty, redCard, mistakenIdentity, goalLine
- call values: goal, noGoal, penalty, noPenalty, redCard, yellowCard, noFoul

Derived, never stored:
- Democracy clock = sum of all incidents' realDelaySeconds + all closed referendums' window lengths
- Vote split per referendum = counted from vote documents

Validation:
- clip.endSeconds > startSeconds, and the clip is max 30 seconds
- outcry.sources needs at least one URL
- No vote can be created after its referendum's closesAt (enforced in the `/api/vote` route; Studio validation is advisory)

Note: `production` is public, so vote documents (incl. random `sessionId`s) are publicly readable. Never store
anything identifying in a vote.

## Workflow: peoplesVar

One instance per incident. Percentages are the share voting **uphold**.

```
VarRoom --recommend--> Referendum
Referendum: over 55% -> Upheld | under 45% -> VarRoom | 45–55% -> ExtraTime
ExtraTime:  over 55% -> Upheld | under 45% -> VarRoom | 45–55% -> Shootout
Shootout:   wins 3 of 5 rounds -> Upheld | loses 3 of 5 -> VarRoom
VarRoom on 3rd loop -> Abandoned ("match to be replayed")
Upheld, Abandoned: terminal
```

Rules (defaults, may change after the first test):

| Rule | Value |
| --- | --- |
| Regular window | 30 s |
| Extra-time window | 15 s |
| Shootout | 5 rounds of 10 s, best of 5 |
| Quorum | 20 votes per round, else the window extends once by 15 s |
| Loop cap | 3 trips to VarRoom, then Abandoned |

Mapping to Workflows constructs:
- Stages: VarRoom, Referendum, ExtraTime, Shootout, Upheld, Abandoned
- Transitions: `recommend` (human, from the Control Room), `closeVote` (automatic)
- Conditions: the vote split picks which transition `closeVote` takes
- Effects: entering a vote stage creates a referendum document and starts the bot crowd
- Guard: incident.finalCall cannot be set until the workflow reaches Upheld. **Advisory only** (guards not
  lake-enforced in early access); in practice only the Upheld effect writes finalCall.
- **Time (changed session 1):** a Scheduled Function can't close 10–30 s windows. Scheduled Function minimum
  cadence is Free = daily, Growth = hourly, Enterprise = minutely. Instead `POST /api/tick` in `/web`
  (server token) calls `engine.tick()`. Callers: the Control Room when its countdown hits 0, and the bot
  crowd after its final wave. tick is safe to call twice.
- Test every path (including loop, shootout and loop cap) with the Workflows test bench before deploying
  (docs: https://www.sanity.io/docs/workflows/testing.md, in-memory engine with a controllable clock).

## Voting and the simulated crowd

Real and simulated votes go through the same path, so the workflow can't tell them apart.

| Screen | Where | Shows |
| --- | --- | --- |
| Big screen | Control Room (App SDK) | Clip, VAR recommendation, live bars, countdown, democracy clock, current round, QR code to /vote |
| Phone | Next.js /vote | Two huge buttons, Uphold and Overturn, plus round and seconds left |
| Results | Next.js /incidents/[slug] | Final call, every round's split, total delay added |

Crowd personas (fixed, not tunable):

| Persona | Share | Behavior |
| --- | --- | --- |
| Home fans | 35% | Overturn any call against the home team |
| Away fans | 35% | Opposite of home fans |
| Neutrals | 20% | Lean toward the call the outcry level suggests, with noise |
| Pundits | 9% | Vote in one bloc in the last 5 seconds |
| Chaos voter | 1 bot | Always votes with the current minority |

How it runs:
1. A referendum opens and a Document Function fires.
2. The Function releases about 60 bot votes in waves across the window.
3. Each bot vote gets `simulated: true` and its persona.
4. A fixed random seed per incident makes demo runs repeatable. At least one incident must reach the shootout.

Function limits to design around: default timeout 10 s (raise it in the Blueprint; the crowd must outlive a
30 s window), and function chains stop at depth 16, so vote writes must never trigger a function that
writes votes. If a Function can't hold a 30 s window, run the crowd from a Next.js route instead
(Vercel default timeout 300 s). Decide this in the bot crowd milestone.

Abuse protection: one vote per round per sessionId; the vote route is rate-limited.

## Incidents

Five slots, one incident each. Henrik picks the incidents; you can help research them.

| Slot | Look for |
| --- | --- |
| 1. Millimetre offside | A goal ruled out by a toe or armpit |
| 2. Handball | A deflection nobody can explain the law for |
| 3. Soft penalty | A penalty given after a monitor review |
| 4. Wrong call anyway | VAR was used and the call was still judged wrong afterward |
| 5. Longest delay | A review that took famously long |

Clip rules (strict):
- Embed only, using `start` and `end` URL parameters. Never download, cut, convert or re-host footage.
- Official league, club or broadcaster channels only.
- Every incident gets a `fallbackText`. If no official embeddable clip exists, use the fallback. No fan uploads.
- Outcry summaries in our own words, with source links. No copied quotes.

## Milestones

| Date | Milestone | Done when |
| --- | --- | --- |
| Sep 24 | Setup and risk check | ✅ Sep 23: project + datasets created, Workflows proven end to end; App SDK Dashboard check pending Henrik's browser |
| Sep 25 | Schema + Studio | All six types live; clip input previews a clip; 2 incidents entered |
| Sep 27 | Workflow + Functions | peoplesVar passes tests for every path |
| Sep 28 | Bot crowd | Seeded personas move the bars; votes flagged simulated |
| Sep 30 | Control Room + phone page | Big screen and phone voting work live on the same referendum |
| Oct 1 | Content + results | All 5 incidents in; results page and democracy clock done |
| Oct 2 | Deploy + dress rehearsal | Full run of all 5 incidents on deployed apps; seeds chosen |
| Oct 3 | Demo + writeup | Video recorded; post drafted from BUILD_LOG.md |
| Oct 4 | Publish | Post live |

If behind schedule, cut in this order: results page polish, then the clip input, then down to 3 incidents.
Never cut the workflow or the live voting.

## Risks and fallbacks

| Risk | Status | Fallback |
| --- | --- | --- |
| Workflows early access blocks us | Retired: deploy, start, fire-action and cascade work on `t2sbu6uu` | Keep the definition, drive transitions from code directly, log it honestly |
| App SDK needs login | Confirmed: it does | Phone voting stays in Next.js; App SDK is the big screen only |
| Vote windows can't close on time | **New, mitigated** | `/api/tick` driven by Control Room + bot crowd, not a Scheduled Function |
| Workflows 0.x breaking change mid-build | New | Pinned exact at 0.35.0; don't upgrade before Oct 4 unless blocked |
| Clips unavailable | Open | fallbackText plus a link out |
| Vote spam | Open | One vote per round per sessionId; rate-limited route |

## Submission requirements (for the final days)

- Path Two template, in English, tagged #sanitychallenge
- Sanity project ID (`t2sbu6uu`) or public dataset URL (required)
- Deployed links, demo video, "My Build Process" written from BUILD_LOG.md
- Simulated crowd explained openly
- Agent session transcript uploaded, checked for keys and tokens, set to public.
  **Session 1's transcript contains the original project tokens (printed by MCP `create_project`). Rotate
  them before publishing.**
- Testing notes for judges: how to open a referendum and vote
