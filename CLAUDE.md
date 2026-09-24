# VARdict — project brief for Claude Code

VARdict is an entry for the Sanity Challenge on DEV, **Path Two: Vibe-Code Something Strange**.
Challenge page: https://dev.to/challenges/sanity-2026-09-16
Submissions close **October 4, 2026, 11:59 PM PDT** (08:59 on Oct 5 in Sweden). Aim to publish on Oct 4.

> **v2 changes (session 3):** Public screens moved from the App SDK to Next.js, because App SDK apps only run inside
> the Sanity Dashboard for logged-in org members, so voters and judges can't open them. The App SDK app (formerly
> "Control Room") is now the private **VAR Room** operator console; the public big screen is `/live` in Next.js.
> Clip clarity now decides the 5 incidents (an all-Premier-League set is fine), including one control case.

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
- **Git (session 3):** work on `main`. Vercel project `henrik-larsson/vardict` is connected to GitHub
  (`Henkisch/vardict`): **a push to `main` is a production deploy** of https://live-vardict.vercel.app, so ask
  Henrik before pushing. Commit locally freely.
- **Never commit secrets.** Tokens go in `.env.local` files, which are gitignored. Provide `.env.example` files.
  The write token must never reach browser code.

## Sanity project facts

| Thing | Value |
| --- | --- |
| Account | Henrik's personal account (GitHub login), **not** the Kodamera account |
| Organization | `o7aI6GMzu` ("Henrik Larsson (org)"), Free tier (Henrik is on the Sanity Pioneer builder track, no paid plan). No Scheduled Functions: daily cadence is useless here |
| Project | `t2sbu6uu` ("VARdict") |
| Content dataset | `production` (**public**, needed for the submission's public dataset URL) |
| Workflow dataset | `workflows` (**private**, engine-owned definitions, instances, guards) |
| CORS | `http://localhost:3000`, `:3333`, `:3334` (with credentials) |
| Tokens | Root `.env.local` and `web/.env.local` (gitignored). See `.env.example`. |

## In scope (must ship)

- 5 real Premier League VAR incidents as structured content (4 that split opinion + 1 control case)
- Official YouTube clips embedded at exact start and end times, with a text fallback
- One workflow, `peoplesVar`: VAR room, public referendum, extra time, shootout, loop back on overturn
- VAR Room (App SDK): Henrik's private operator console
- Public Next.js site: phone voting (`/vote`), live big screen (`/live`), results pages
- Simulated crowd with fixed personas, kept apart as counters on the referendum (`botVotes`), shown openly
- "Time added by democracy" clock, computed with GROQ (never stored)
- Custom Studio input that previews a clip at the chosen start and end

## Out of scope

Tunable crowd sliders, user accounts or login for voters, animated tactical diagrams, more than 5 incidents,
a Path One entry.

## Repo structure

pnpm workspace (`pnpm-workspace.yaml`), Node 24 (`.nvmrc`).

```
/studio          Sanity Studio (sanity 6.x): schemas + custom clip input
/web             Next.js 16: /vote, /live, /incidents, /incidents/[slug],
                 /api/vote, /api/tick, /api/start, /api/crowd, /api/live
/var-room        App SDK app (sanity dev → Dashboard): Henrik's private operator console
/functions       Not used (see functions/README.md) - the bot crowd runs from /web's /api/crowd instead
/workflows       peoplesVar definition, shared constants, runtime, tests, scripts/
CLAUDE.md        this file
BUILD_LOG.md     session log for the writeup
SUBMISSION.md    DEV post draft (Path Two template), filled in from BUILD_LOG.md
```

`web/AGENTS.md` is Next.js's own agent note: Next 16 differs from training data, read
`web/node_modules/next/dist/docs/` before writing Next code.

## Architecture: who sees what

App SDK apps run inside the Sanity Dashboard, which loads them in an iframe and hands them a logged-in user's
token (verified session 1: it redirects to sanity.io/login if nobody is logged in). Deployed apps land in the
organization dashboard, not on a public URL. So:

| Part | Built with | Audience | Job |
| --- | --- | --- | --- |
| VAR Room | App SDK | Henrik only (org member) | Pick an incident, start a referendum, perform the human `recommend` transition, watch votes and bot waves live, restart a referendum |
| /vote | Next.js | Public, phones | Redirects to `/live` - voting happens there (Henrik, session 3: one page is both the big screen and where you vote) |
| /live | Next.js | Public, big screen | "Send to the people" button (starts a referendum, see Judge testing), clip with the situation line under it, VAR recommendation, live bars, countdown, round, democracy clock, QR code to /vote |
| /incidents | Next.js | Public | Results overview: every incident's fixture, VAR call and outcome, plus the shared democracy clock (plan 010) |
| /incidents/[slug] | Next.js | Public | Final call, every round's split, total delay added, control-case headline |
| /api/vote | Next.js server route | Called by /vote | Validates and writes votes with a server-only token |
| /api/start | Next.js server route | Called by /live's "Send to the people" button and the VAR Room | Starts the next incident's referendum (engine API + `recommend`), one at a time, with a cooldown; only an operator (shared secret) may pick a specific incident |
| /api/tick | Next.js server route | Called by /live, the VAR Room and the bot crowd | Calls `closeWindow` (wraps `engine.fireAction` + `drainEffects`) so vote windows close on time; idempotent |
| /api/crowd | Next.js server route | Called by the server itself when a round opens (`workflows/runtime.ts`'s `open` effect) | Runs one referendum's bot crowd (`runCrowd`) in the background, guarded by an HMAC key derived from the write token |
| /api/live | Next.js server route | Polled by /live, /incidents and /incidents/[slug] | The one GROQ read every public screen shares, cached at Vercel's CDN (`?q=live\|incident\|incidents`) |
| Studio | Sanity Studio | Henrik | Edit incidents, laws, matches; custom clip input |

All writes go through the Content Lake. Every public screen reads through `/api/live` (see below), not a
live subscription; the VAR Room reads the Content Lake directly with `useQuery`, which is real time. The VAR
Room still covers the challenge bonus for the App SDK with real-time data; it is shown to judges through the
demo video and screenshots, since they can't log in.

### How a vote travels

1. The phone taps Uphold and POSTs to `/api/vote` with `referendumId`, `choice` and a `sessionId`
   (random ID the browser generates once and keeps in `localStorage`).
2. The route checks that the referendum is open (`now < closesAt`), that this `sessionId` hasn't voted in
   this round (`_id = vote-<referendum>-<session>` is the lock), and rate-limits by IP and by per-round /
   per-day vote caps.
3. The route creates the `vote` document using the write token (server-only env var).
4. `/live`, `/incidents` and `/incidents/[slug]` pick it up on their next poll of `/api/live` (3 s while a round
   is live, slower otherwise - see "Still to verify" below). `/vote` itself just redirects to `/live`. The VAR
   Room, which reads the Content Lake directly, sees it immediately.
5. Bot votes never become `vote` documents: they're atomic increments on the referendum's `botVotes`
   counters, applied by the same server (`/api/crowd` → `runCrowd`). The workflow's vote count adds the two
   sources together (`workflows/shared.ts`'s `weightedCount`), so a human vote and a bot wave both move the
   same number.

### Still to verify

- ~~Real-time on /live~~: tried a Live Content API subscription, dropped it (session 3) - its events matched
  our sync tags but arrived 5-20 s late, most of a 30 s window. Every public screen instead polls `/api/live`
  (plan 007): 3 s while a round is voting/counting/between, 8 s idle, up to 60 s after 5 minutes with no
  input, hidden tabs don't poll. Not yet fully verified: a phone view once showed a stale round after two
  newer ones existed (see "Investigate next"); watch for a repeat.
- **Dataset visibility:** `production` is public, so anyone can read votes (fine, they're anonymous). Confirm
  that writes still require the token.
- ~~App SDK auth~~: verified session 1, the VAR Room reads live data from the Dashboard.

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
  Drive instances through the engine API (see `workflows/runtime.ts`, or `workflows/scripts/live-run.ts` for
  a script that drives a full run).
- Subject value shape: `{id: 'dataset:t2sbu6uu:production:<docId>', type: '<_type>'}` (published id only).
- Nothing moves on its own: time-based transitions need something to call `engine.tick({instanceId})`;
  queued effects need something to call `engine.drainEffects()`.
- **Guards are advisory** in early access: the Content Lake does not enforce them yet.
- Reset during dev: `pnpm --filter workflows exec sanity-workflows nuke --deployment dev --force`.

## Content model

| Type | Key fields | Notes |
| --- | --- | --- |
| incident | title, slug, match (ref), minute, incidentType, lawsInvolved (refs), situation, originalCall, varRecommendation, recommendationFavours, finalCall, realDelaySeconds, clip, fallbackText, outcry, controlCase, crowdSeed | Three separate call fields tell the story as data. situation = ≤140-char context line shown with the clip during the vote. controlCase marks the one clear-cut incident |
| match | homeTeam, awayTeam (refs), competition, date, venue, score | |
| team | name, shortName, primaryColor | Colors used in the voting UI |
| law | number, title, summary | IFAB Laws of the Game, summaries in our own words |
| referendum | incident (ref), round, loop, threshold, windowOpensAt, closesAt, result, workflowInstanceId, botVotes | Rounds: regular, extraTime, shootout1 to shootout5. **botVotes = the simulated crowd as counters** (uphold, overturn, waves, byPersona.*), one atomic `inc` per wave |
| vote | referendum (ref), choice, sessionId, simulated, castAt | **Human votes only** (session 3). choice: uphold or overturn. `_id = vote-<referendum>-<session>` is the one-vote lock |

Objects:
- `clip`: youtubeId, startSeconds, endSeconds, channel, official (boolean), embedAllowed (boolean)
- `outcry`: level (1–5), summary (own words), sources (array of URLs)

Enums:
- incidentType: offside, handball, penalty, redCard, mistakenIdentity, goalLine
- call values: goal, noGoal, penalty, noPenalty, redCard, yellowCard, noFoul

Derived, never stored:
- Democracy clock = sum of all incidents' realDelaySeconds + all closed referendums' window lengths
- Vote split per referendum = referendum.botVotes counters + human vote documents × humanVoteWeight

Validation:
- clip.endSeconds > startSeconds, and the clip is max 30 seconds
- outcry.sources needs at least one URL
- No vote can be created after its referendum's closesAt (enforced in `/api/vote`; Studio validation is
  advisory). Bots never create vote documents at all - see "Simulated crowd" below.

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
| Human vote weight | 1 human vote = 20 bot votes (Henrik, session 3: few real voters; one human = 25% of a 60-bot round). Quorum counts heads; the split counts weight. Shown on /live and /vote |
| Loop cap | 3 trips to VarRoom, then Abandoned |

Human vote weight, shootout-rounds-to-win and loop cap live in one place, `workflows/shared.ts` (plan 011): a
dependency-free module so browser-imported code (`web/src/lib/queries.ts`, `run-status.ts`, `outcome.ts`) can
use the same numbers as `RULES` in `peoplesVar.ts` without pulling `@sanity/workflow-engine/define` into the
client bundle.

Built and bench-tested in session 3: `workflows/definitions/peoplesVar.ts` (deployed name **`peoples-var`**, names
must be lowercase-dash). 52 tests across three files (`pnpm --filter workflows test`): `peoplesVar.test.ts`
(every routing path incl. loop, shootout, second shootout, loop cap, quorum extension, single run per
incident), `crowd.test.ts` (persona shares and choices) and `runtime.test.ts` (effect handlers, closing,
idempotency). v1 deployed to `dev`.

How it maps to Workflows (learned the hard way, see BUILD_LOG session 3):
- **Conditions can't read vote documents.** They only see the instance snapshot (instance + subject). So the tick
  route counts votes with GROQ when a window closes and fires a caller action with params `{upholdPct, votes}`:
  `closeVote` in referendum/extraTime, `roundWon`/`roundLost` in the shootout (ops can't branch, so the route picks:
  over 50% uphold wins the round). Under quorum it fires `extend` instead (once per stage visit).
- Transitions route on the recorded fields, in declaration order: upheld → overturned (back to `varRoom`) → too close.
- **Shootout = one stage visit per round**: the stage transitions into itself. The score (`shootoutWon/Lost`) is
  workflow-scoped; extra time's `closeVote` resets it to 0–0.
- **Loop cap** reads stage history from the raw snapshot: `count(*[_id == $self][0].stages[name == "varRoom"]) > 3`,
  i.e. the 3rd trip back abandons.
- `recommend` is the one human action (VAR Room, or `/api/start` for judges). `singleSubject` start requirement: one
  live run per incident.
- **Effects** (names must be unique per definition, so one per stage; the runtime maps each kind to one handler):
  `open-{referendum,extra-time,shootout-round}` creates the referendum doc and starts the bots, and should write
  `referendumId` + `closesAt` back as stage fields. `extend-*` pushes `closesAt` by 15 s. `finalize-*` writes
  `incident.finalCall`. It fires in the deciding stage because a terminal stage can't run actions. Effect params
  carry `incidentId` as a GDR (`dataset:t2sbu6uu:production:<id>`): strip to the last segment.
- Guard on finalCall: still advisory only, not declared yet.
- **Time:** a Scheduled Function can't close 10–30 s windows (Free = daily, Growth = hourly, Enterprise = minutely).
  `POST /api/tick` in `/web` (server token) counts the votes and fires the close action. Callers: `/live` when its
  countdown hits 0, the VAR Room, and the bot crowd after its final wave. It must be idempotent: skip if the stage
  already has a result.
- Subjects must be **published** incidents (published session 3).
- **Runtime:** `workflows/runtime.ts` exports `createRuntime`, `sendToThePeople(incidentId)` (start + `recommend` +
  drain), `startNext(runtime, pick?)` ("Send to the people": next-in-line or a parked run, with a start lock,
  cooldown and daily cap) and `closeWindow(instanceId)` (tally, pick the action, idempotency key per referendum,
  drain). `/api/start` and `/api/tick` are thin wrappers around these. Live check: `pnpm tsx --env-file=../.env.local
  scripts/live-run.ts <incidentId> 50,50,70,30,70,70` (cleans up after itself). The `open` effect handler's
  `onOpened` callback starts the bot crowd: in production it POSTs to `/web`'s own `/api/crowd` (one request
  per round, so one dying function can't strand the rest of the run), guarded by an HMAC key derived from the
  write token; scripts run it in-process instead.
- Deploy shares definitions with Sanity by default (`--no-share-defs` to opt out). Nothing secret in ours.
- **New season (plan 009):** when every published incident already has a `finalCall`, the next "Send to the
  people" press clears every incident's `finalCall` and starts again (`startNext`'s `newSeason` branch). Round
  history is never deleted, so `/incidents` and `/incidents/[slug]` derive the current outcome from an
  incident's rounds instead of trusting `finalCall` directly (`web/src/lib/outcome.ts`'s `incidentOutcome`,
  reusing `run-status.ts`'s `runPhase`) - otherwise a new season would make every past verdict look undecided.

## Simulated crowd

Crowd personas (fixed, not tunable):

| Persona | Share | Behavior |
| --- | --- | --- |
| Home fans | 35% | Overturn any call against the home team |
| Away fans | 35% | Opposite of home fans |
| Neutrals | 20% | Lean toward the call the outcry level suggests, with noise |
| Pundits | 9% | Vote in one bloc in the last 5 seconds |
| Chaos voter | 1 bot | Always votes with the current minority |

How it runs (decided in the bot crowd milestone: not a Sanity Function - Free plan's 10 s default timeout and
16-deep function chains don't fit a 30 s window well, and a Next.js route defaults to 300 s):
1. A referendum opens; the workflow's `open` effect handler starts the crowd by calling `/web`'s own
   `/api/crowd` (in production) or running it in-process (scripts).
2. `runCrowd` (`workflows/runtime.ts`) plans and releases about 60 bot votes (`workflows/crowd.ts`'s
   `planCrowd`) in waves across the window.
3. Each wave is one atomic `inc` on `referendum.botVotes` (totals + per persona), guarded by a wave counter and
   `ifRevisionId`, retried up to 3 times. **Changed session 3 (Henrik):** bots used to be one document each
   (~60 per round); counters cost 1 document per round and let screens read a number instead of counting
   documents. Trade-off: bots are never `vote` documents, so they don't go through `/api/vote` at all - the
   workflow only sees a weighted total (`workflows/shared.ts`'s `weightedCount`), never real vs. simulated.
4. A fixed random seed per incident makes demo runs repeatable. At least one incident must reach the shootout.
5. After its last wave, the crowd calls `closeWindow` itself (`closeUntilDone`, retried) so the round closes
   even if no screen is open to poll `/api/tick`.

Abuse protection: one human vote per round per sessionId; `/api/vote` is rate-limited and capped per round
(`RULES.maxHumanVotesPerRound`) and per day (`RULES.maxHumanVotesPerDay`).

## Incidents

**All Premier League (Henrik, session 3), picked by clip clarity.** Tournament footage failed: FIFA blocks embeds,
and the other official uploads were stills or studio talk. Five incidents for now, maybe six later; narrow down after
the dress rehearsal. Facts verified session 3; seed: `studio/seed/incidents.py` (drafts, idempotent).

| # | Incident | Why it splits | Clip (all embed) |
| --- | --- | --- | --- |
| 1 | **Control case:** Luis Díaz, Tottenham–Liverpool, 30 Sep 2023, 34'. Onside goal disallowed after the VAR said "check complete" by mistake | Nothing to debate; PGMOL admitted the error. `controlCase: true`. Does the crowd still get it wrong? | TNT `BnSo_5MTcGY` 18–48 (PGMOL audio, 2D lines) |
| 2 | Maupay handball, Brighton–Man Utd, 26 Sep 2020, 90+7'. Penalty given after the full-time whistle | Strict 2020 handball law; Brighton hit the woodwork five times | TNT `_2t489AY06k` 134–164 |
| 3 | Pickford on Van Dijk, Everton–Liverpool, 17 Oct 2020, 6'. VAR checked only offside: no foul, no card | Referee later said it should have been red; Van Dijk out for the season | TNT `6XQJSG-IWLU` 64–94 |
| 4 | Gordon goal, Newcastle–Arsenal, 4 Nov 2023, 64'. Three checks (ball out, offside, push), goal stands, 246 s | Arteta called it a disgrace; panel backed it 4–1 | The Telegraph `9nSgsgq46aI` 120–150 (PGMOL audio) |
| 5 | Milenkovic goal, West Ham–Forest, 18 May 2025, 61'. Record 374 s offside check, goal stands | The wait, not the call: lines drawn by hand, VAR headset failed | West Ham `fawYYhtE1yg` 60–90 (**check it shows the right goal**) |

Estimates, not sourced: Maupay `realDelaySeconds` 150 (whistle to kick), Pickford 60. Díaz facts from session 2.
Dropped in session 3 (no clear embeddable clip): Perišić, Cucurella, Japan–Spain, Khalilzadeh.
Spare if we go to six: Llorente (UCL, not PL), Tottenham–Chelsea Nov 2023, Firmino armpit offside (weak clip).

Bonus material for the writeup (not an incident): Norway, where fans protested VAR with fish cakes, a match
was abandoned, clubs voted to scrap VAR, and the federation's congress voted to keep it anyway. The people
voted and VAR won. Sweden rejected introducing VAR in 2024.

Clip rules (strict):
- **The clip is the product (Henrik, session 3).** Every window must show the situation itself: live angle plus
  replays, ideally the VAR angle or offside lines. No studio talk, pundit faces, celebrations or press conferences.
  Compilations are mostly fan uploads, so find one official single-incident clip per incident.
- Embed only, using `start` and `end` URL parameters. Never download, cut, convert or re-host footage.
- Official league, club or broadcaster channels only (The Telegraph OK, Henrik session 3). No fan uploads.
- Every incident gets a `fallbackText`. If no official embeddable clip exists, use the fallback.
- **FIFA blocks embedding of all its World Cup footage** (IFrame API error 150), one reason we went all-PL. When `clip.embedAllowed` is false,
  the frontend shows `fallbackText` plus a link to `youtube.com/watch?v=<id>&t=<startSeconds>`. Test embeddability in a
  real player; oEmbed returning 200 proves nothing.
- Every YouTube iframe needs `referrerPolicy="strict-origin-when-cross-origin"`. Without a referrer YouTube shows
  error 153 ("video player configuration error"), and the Studio's page policy strips it by default.
- Outcry summaries in our own words, with source links. No copied quotes.

## Milestones

| Date | Milestone | Done when |
| --- | --- | --- |
| Sep 24 | Setup and risk check | ✅ Sep 23: project + datasets created, Workflows proven end to end, App SDK reads live in the Dashboard |
| Sep 25 | Schema + Studio | All six types live; clip input previews a clip; 2 incidents entered |
| Sep 27 | Workflow + Functions | ✅ Sep 24: peoplesVar passes tests for every path; v2 deployed; runtime (`workflows/runtime.ts`) ran a full live shootout on `t2sbu6uu`. Routes /api/start + /api/tick still to do |
| Sep 28 | Bot crowd | ✅ Sep 24: seeded crowd (`workflows/crowd.ts`), runs via Next `after()` (decided: not a Sanity Function), chains rounds |
| Sep 30 | VAR Room + /vote + /live | ✅ Sep 24: live on https://live-vardict.vercel.app; VAR Room console built (`pnpm dev:var-room`, not deployed to the Dashboard yet) |
| Oct 1 | Content + results | ✅ Sep 24: 5 incidents in; `/incidents/[slug]` (live) with every round, clock, outcry, control-case line |
| Oct 2 | Deploy + dress rehearsal | Full run of all 5 incidents on deployed apps; seeds chosen |
| Oct 3 | Demo + writeup | Video recorded; post drafted from BUILD_LOG.md |
| Oct 4 | Publish | Post live |

If behind schedule, cut in this order: results page polish, then the clip input, then down to 3 incidents.
Never cut the workflow, /vote or /live.

## Risks and fallbacks

| Risk | Status | Fallback |
| --- | --- | --- |
| Workflows early access blocks us | Retired: deploy, start, fire-action and cascade work on `t2sbu6uu` | Keep the definition, drive transitions from code directly, log it honestly |
| App SDK needs login | Confirmed: it does | Everything public lives in Next.js; the VAR Room is Henrik's console only |
| Judges can't open the VAR Room | Expected | Show it in the demo video and screenshots |
| /live real-time is harder than expected | Open | Short-interval polling as a stopgap, noted honestly in the build log |
| Vote windows can't close on time | Mitigated | `/api/tick` driven by /live, the VAR Room and the bot crowd, not a Scheduled Function |
| Workflows 0.x breaking change mid-build | Open | Pinned exact at 0.35.0; don't upgrade before Oct 4 unless blocked |
| Clips unavailable | Open | fallbackText plus a link out |
| Vote spam | Open | One vote per round per sessionId; rate-limited /api/vote |

## Experience v3 (decided with Henrik, session 4)

Plans 001–011 are merged and deployed (status in `plans/README.md`). The walkthrough started from the top and
turned into a direction change. Henrik: **"it feels like there are so much stuff happening automagically, I want
it to be a controlled workflow, step by step"**, and "I want a stadium feeling in there". The goal: a fun, cool
atmosphere that holds up in a screen recording, because that's how most judges will see it.

**The story:** `/live` is **the stadium**. The App SDK console is **Stockley Park**, the officials' booth
(PGMOL's real VAR hub is there, miles from the ground). The demo video cuts between them.

Decisions:

| Topic | Decision |
| --- | --- |
| Pacing | **Step by step.** Every voting stage waits for a press: Send to the people → vote → verdict screen → "Go to extra time" / "Start the shootout" / "Take the next penalty" / "Back to the VAR room". Bots vote only inside a round someone started. Needs a new workflow version (a kick-off action per voting stage) |
| Who presses | **Anyone on `/live`** (built for one judge alone at a desk; their vote counts ×20). Stockley Park can press the same buttons for the recording |
| Monitor wall | On `/live`, in the VAR-room phase: **main monitor (1×) + three small ones: slow-mo 0.25×, rewind loop of the key second, zoomed crop.** Four players of the same official clip, controlled via the YouTube IFrame API (this also fixes the clip running past `endSeconds` onto YouTube's end screen). Keep zoom subtle, logo visible (YouTube terms: don't hide the player or branding) |
| Vibe | **All four, one per act.** VAR check = TV broadcast (scorebug, "VAR CHECK: POSSIBLE FOUL" banner, the monitor wall). Vote = the stands (jumbotron bars, crowd swelling). Verdict = the reveal (roar/groan; democracy clock on retro split-flap digits; maybe a Teletext-style results page) |
| Look | **Floodlit night match**: dark stadium, floodlight glare, glowing jumbotron |
| First screen | **"Enter the stadium"**: full-screen match-day intro (the fixture list of the 5 incidents, one line of pitch); the click also unlocks audio |
| Sound | **Reacts to the vote**: ambient murmur that swells as the bars move, a whistle when a round opens, a roar or groan on the verdict. **CC0 recordings**, credited in the post. Video stays muted |
| Humour | **Pundit banter**: a commentary ticker. Lines are **Sanity content** (a `punditLine` type: text, pundit persona, trigger such as round opens / bots swing it / too close / overturned / shootout / abandoned, optional incident) |
| Phone | **A fan in the stands**: big Uphold/Overturn like holding up a card, a haptic buzz, the vote showing up in the crowd on the big screen |
| Stockley Park | The App SDK console as the booth: live workflow stage, bot waves and human votes arriving in real time, making the VAR call, picking the next incident. Carries the App SDK story in the video |

**Must-haves (Henrik): all four:** the step-by-step flow, the monitor wall, stadium + sound, the Stockley Park console.
Nice-to-have if time allows: the phone as a fan (the vote in the crowd), split-flap digits, the Teletext results page.

Proposed order (10 days to Oct 4): step-by-step flow (the foundation, touches the workflow) → monitor wall + clip
control → stadium intro, look, sound, jumbotron, pundit ticker → Stockley Park → Oct 2 reset and rehearsal → Oct 3
video and post → Oct 4 publish. If behind, cut in this order: the Teletext page, split-flap, the phone flag in the
crowd, the zoomed monitor, the pundit ticker. Never cut the step-by-step flow.

Still open: loose ends in `plans/README.md` (season reset vs results wording, a clean slate before judging).

## Cost guards (cost review, session 3)

What we're on: **Sanity Free**, which has hard caps and no overage, so it can't cost money. At a cap the API returns 402
and the demo stops loading until the 1st (UTC): 250k API requests, 1M CDN requests, 10k documents, 1k live
connections per dataset, 100 GB bandwidth. **Vercel team `henrik-larsson` is on Pro**, which bills overage, so this is
where money can go.

In code:
- **Screens** read through `/api/live` (plan 007), the one GROQ read every screen shares, cached at Vercel's CDN:
  `s-maxage` 1 s for the live round while voting/counting/between, 5 s otherwise, 10 s for the incident and
  incidents-overview reads. A Live Content API subscription was tried and dropped (see "Still to verify"): its
  events matched our sync tags but arrived 5-20 s late. Clients poll while the tab is visible only: 3 s fast,
  8 s idle, up to 60 s after 5 minutes with no input.
- **Bots are counters**, one document per round instead of ~60.
- **Caps read from data (`RULES` in `workflows/definitions/peoplesVar.ts`):** 40 runs per rolling 24 h
  (`maxRunsPerDay`), 300 human votes per round (`maxHumanVotesPerRound`), 3000 human votes per rolling 24 h
  (`maxHumanVotesPerDay`, kept far from the Free plan's 10k document cap), one live run, a 10 s cooldown.
  There's also an in-memory per-IP limit (weak on serverless, kept as a speed bump).
- **Request bodies (plan 008):** `readJson` (`web/src/lib/runtime.ts`) rejects anything over 1 KB or not
  declared `application/json` before it's parsed; `/api/start` allows an empty body too (the /live button's
  POST sends neither). Errors come back as clean JSON with CORS headers, not a stack trace.
- **Kill switch:** `VARDICT_PAUSED=1` in Vercel env makes `/api/start`, `/api/vote` and `/api/crowd` answer 503. Ticks
  still close open windows.
- A round costs roughly 30 server-side API requests (11 waves × read + patch, plus closing).

**Open decision (parked by Henrik, session 3): cap Vercel spend.** Spend Management is per *team* and its Pause
action pauses **every** project on the team, and Henrik runs other projects on `henrik-larsson`. The account can't
create Hobby teams (new teams are always Pro). Leaning towards: **move VARdict to a separate Vercel account (Hobby,
no billing)**. If so: transfer the project, re-link the CLI, check env vars, domain, CORS, the git connection and
Hobby's function duration limit (our maxDuration is 300/90 s). Alternatives: a spend webhook that pauses only
VARdict, or alerts only plus `VARDICT_PAUSED`. Don't turn on "Pause Production Deployments" on `henrik-larsson`.

Henrik to do in dashboards (can't be done from code):
- Optional: a Vercel Firewall rate-limit rule on `/api/start` and `/api/vote`.
- Sanity sends usage emails at 80% and 100% to admins automatically.

## Investigate next (parked by Henrik, session 3: "loads of weird stuff going on")

Collect Henrik's list first. Known so far:
- **Screens miss new rounds.** Measured: Live Content API events *do* match our sync tags, but arrive 5–20 s late
  (the CDN lags too). The stream-based "skip polling" logic from the cost review therefore left `/live` blind. The
  fix (now committed, `/api/live` route + `web/src/lib/live.ts`, plan 007): a short-`s-maxage` CDN read instead of
  a subscription, polled 3 s during a vote, 8 s idle, visible tabs only, and a 30 s fast boost after pressing Send
  to the people. **Not fully verified**: whether `/api/live` is actually served `x-vercel-cache: HIT` in
  production (check after the next deploy - see `plans/README.md` "Loose ends"), and the specific stale-phone-view
  report (an older "last verdict" showing while newer rounds existed) hasn't been reproduced since.
- **A start through a redirected page** (`/vote` → `/live` mid-request) left a fresh instance parked in `varRoom`
  without `recommend`, and the next press recommended it. Check whether an aborted client request can cut a route short.
- Gordon has now been overturned twice (loop 3 is next). A third overturn abandons it: expected, but check the
  abandoned copy on screen.

## Judge testing (decided session 3)

Judges test on their own time and can't log in to the Dashboard, so the VAR Room can't be the only way to start a
referendum. `/live` gets a public **"Send to the people"** button. It calls `/api/start`, which starts the next
incident's referendum through the engine and fires `recommend`, and the bot crowd joins. Guards: only one
referendum at a time (the button is disabled while one runs), a cooldown between starts, rate limit by IP. The
VAR Room keeps full operator control (pick any incident, restart). No credentials are given out.

## Demo video checklist

- /live on a big screen with moving bars
- Henrik's phone in frame voting on /vote alongside the bot crowd
- The VAR Room performing `recommend` and starting a referendum
- One incident reaching the shootout, and the control-case result

## Submission requirements (for the final days)

Rules: https://dev.to/challenges/sanity-2026-09-16 ("How To Participate").

- Path Two template, in English, tagged #sanitychallenge. We only submit Path Two (each path needs its own post).
- **Required:** Sanity project ID (`t2sbu6uu`) or a public dataset URL, so Sanity can see the content model. Give
  both, e.g. `https://t2sbu6uu.api.sanity.io/v2025-02-19/data/query/production?query=*[_type=="incident"]`
  (drafts aren't public: publish the incidents first). Without it the submission may count as incomplete.
- Deployed links to /live, /vote and results; demo video; "My Build Process" written from BUILD_LOG.md
- Simulated crowd explained openly
- Login: the public app needs none. Say so, and explain the VAR Room needs a Sanity login, which is why it's in the
  video and why `/live` has its own start button.
- Testing notes for judges: open /live, press "Send to the people", scan the QR code, vote
- Agent session (optional, encouraged): upload through DEV's Agent Sessions uploader, curate/slice the parts worth
  showing, check for keys and sensitive data, then press **Make Public** (uploads are unlisted by default, and judges
  can't open them otherwise).
  **Session 1's transcript contains the original project tokens (printed by MCP `create_project`). Rotate
  them before publishing.**
