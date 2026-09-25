# Plan 016: Session 5 audit, fixes in priority order

Four read-only audits on 2026-09-25 (workflow + runtime, /live + booth state machine, Sanity content, copy), merged
and spot-checked against the code. P1 = a judge or the recording can hit it.

**Status (Sep 25):** P1 #1-10 done and deployed (commits a8638b0, b626477). #11 (full wipe) waits for the rehearsal. P2-P4 open.

## P1: things a judge or the recording will hit

| # | Problem | Fix | Where |
| --- | --- | --- | --- |
| 1 | A solo judge hits the `/api/start` limit (3/min). Start check → Send → Extra time → Penalty is 4 presses in ~30 s; the 4th gets 429 "Easy. Try again in a minute." | Raise to ~12/min; presses on a live run are cheap | `api/start/route.ts:19` |
| 2 | Votes are accepted during the 5 s kick-off (keyboard behind the overlay, `/api/vote` checks only `closesAt`); `finishEarly` then decides the round before it opens | Reject `now < windowOpensAt` server-side; `closed` + `inert` while counting down; a `kickoff` phase in `runPhase` | `api/vote/route.ts:39`, `run-status.ts`, `live/page.tsx`, `KickOff.tsx` |
| 3 | A parked run (no human voted) polls at 8 s and can sleep to 60 s, so a booth "Send to the people" is missed | Treat any live run as fast, awake | `live/page.tsx:33`, `lib/live.ts` |
| 4 | `/live` holds an old verdict when the booth starts the next check (the recording flow) | Drop the hold when a run for another incident is live | `live/page.tsx:113` |
| 5 | The verdict briefly offers the just-decided incident as "Next incident" (result and finalCall land in separate commits); on the last incident it swaps to "Full time" under the cursor | Exclude the decided incident from `next` while its result is fresh | `live/page.tsx:178`, `queries.ts` |
| 6 | The vote receipt shows "Vote counted" even if the request failed (no catch on fetch) | Catch network errors; roll back with "No connection. Your vote didn't count." | `VoteButtons.tsx:55` |
| 7 | The booth invites a second press while the vote is opening (stage `referendum`, no round yet): unlocked "Start the VAR check" | Lock with "Opening the vote…" | `UnderReview.tsx:82-107` |
| 8 | A "Send" press with nothing live starts a run straight into a vote (skips the VAR check; possibly another incident than the one on screen) | `step:'send'` only recommends a live VAR-room run; with nothing live it answers `nothingToSend` | `runtime.ts:591-615`, `api/start`, both buttons |
| 9 | Content: Pickford's situation says "0–0"; it was 0–1 (Mané, 3') | Patch `situation` | Sanity `58fbf785…` |
| 10 | Pundit lines state old rules: "worth twenty bots" (pundit-10), "the on-field call stands" (pundit-23), "four minutes per decision" (pundit-19) | Rewrite the three lines | Sanity |
| 11 | The stored rounds were decided at ×20; screens now recompute at ×8 and contradict their own verdicts (Pickford 45.6%, Gordon 48.5%) | Full wipe before judging (already planned) | booth |

## P2: correctness and robustness

| # | Problem | Fix | Where |
| --- | --- | --- | --- |
| 12 | Aborted rounds are stored as `noVotes`, so an aborted run looks "back in the VAR room" (booth phase `parked`, then #8) | `result: 'aborted'`, handled in run-status, outcome, booth | `runtime.ts:579` |
| 13 | Full wipe throws past 200 run documents (referendums deleted before the votes that reference them) | Delete votes first, then referendums | `runtime.ts:643` |
| 14 | No cap on noVotes loops: a script can open a round every ~65 s forever (~40k API requests/day; Free plan 250k/month) | Daily round cap (count referendums) | `runtime.ts` startNext |
| 15 | Start lock TTL 15 s vs a ~13 s first press; release doesn't check the owner | TTL 30 s; release only our own lease | `runtime.ts:445,472` |
| 16 | `/live` busy state clears after 15 s, before the first round appears | 30 s, or clear on run-stage change | `live/page.tsx:102` |
| 17 | The VAR-room scene may show `state.next` when it isn't the run's incident | `/api/live` returns the run's incident card | `api/live`, `live/page.tsx:203` |
| 18 | Stale start messages linger ("A vote is already live." under the VAR-room button) | Clear on scene change; word `busy` per stage | `live/page.tsx:52-80` |
| 19 | Booth match day misses a parked run or a running check ("Live" only with an open round) | Read the live run | `IncidentBoard.tsx:28` |
| 20 | The crowd crashes when a wipe deletes its round mid-flight (null fetch) | Guard nulls in `applyWave`/`closeUntilDone` | `runtime.ts:706,751` |
| 21 | Quorum extension can't happen any more (noVotes first; one human + finishEarly always meets quorum) | Remove, or mark test-only | definition, runtime, crowd route |

## P3: wording (one pass, names first)

- **One name per thing.** Second press: **Send to the people** everywhere (`/live` says "Let the fans decide"). Penalty:
  **Penalty** (stage), **Sudden-death penalty** (round), **Take the penalty** (button); drop "Penalties!", "Next penalty",
  "Take the next penalty", the dead "Scored/Saved… First to 1" and "retaken".
- **Say the rule that surprises people:** your vote counts ×8 **and ends the round** (intro, vote screen, WorkflowPath).
  The fine print "against 0 simulated fans" reads wrong early in a round.
- **Humans vs bots:** "No fans voted" → "No humans voted" (bots did vote), in Verdict, incident page, booth.
- **Verdicts:** "The fans backed the VAR. The call stands: {call}." Full time: drop the self-explaining joke
  ("Democracy is complete, and slower." → "The people have spoken. Eventually."), no hard-coded "five".
- **Stale truths:** VoteFeed "the on-field call stands"; WorkflowPath "The people…" vs "fans"; schema descriptions
  (finalCall, ROUNDS shootout1-5, loop 1-3, missing `noVotes`, threshold units); SUBMISSION.md (/vote, QR code,
  "shootout"); design.md + var-room App.tsx "Stockley Park"; CLAUDE.md workflow diagram and rules table.
- **Errors in plain words:** booth "Refused: dailyLimit" etc. → readable; "1 more seconds", "1 fans"; "Run 1" → "Attempt 1";
  "50% open" → "Voting"; "Connecting to the VAR room…" on /live → "Opening the stadium…".
- **The pitch line** ("Football fixed VAR. We fixed it with democracy…") only lives in page metadata: put it on the intro.

## P4: polish and atmosphere

- Whistle when a round opens and full-time whistle on the last verdict (defined, never called); the penalty pundit
  lines (`penaltyScored/Saved`) never fire; the verdict "ooh" plays on entering mid-verdict.
- Accessibility: announce scene changes and the verdict (`role="status"`), move focus to the new scene's heading,
  EnterStadium as a real dialog, the ticker shouldn't be `aria-live`.
- Phones (inferred from code): the calls row, "OVERTURNED" at text-7xl and the no-wrap buttons overflow ~343 px.
- Content: `clip.keySeconds` for each clip (the replay/zoom monitors aim at the midpoint today); team colours readable
  on dark (Newcastle, Spurs, Everton, West Ham); delete the orphan `smoke-1`; page titles per route.
- Code hygiene: shootout/loop/"on-field call" leftovers in comments; the duplicate comment in runtime.ts.

## Suggested order

1. P1 #1-8 (code, one pass, tests for #2, #8), then deploy.
2. P1 #9-10 content (Sanity patch), P3 wording pass, deploy.
3. P2 in one pass (#12-21), with runtime tests for #12-15.
4. Full wipe (#11) right before the Oct 2 rehearsal; P4 as time allows.
