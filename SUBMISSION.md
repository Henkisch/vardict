<!--
DEV.to submission DRAFT v2 (Path Two template). Rewritten from BUILD_LOG.md sessions 1-5 on Sep 25.
Henrik edits and publishes. Plan: paste into an unpublished DEV draft ~Sep 28 to check rendering,
publish Oct 3 evening, freeze before Oct 4 23:59 PDT (08:59 Oct 5 in Sweden).

Before publishing:
- [x] Session-1 project tokens rotated Sep 28 (old ones deleted in Sanity)
- [x] Repo https://github.com/Henkisch/vardict is public; history scanned Sep 28, no token or operator key in it
- [ ] Full wipe in the VAR Room before judging (plan 016 #11), then one clean run so the results aren't empty?
- [ ] Clip keySeconds set in Studio (replay + zoom monitors aim at the midpoint until then)
- [ ] Demo video recorded and embedded
- [ ] Screenshots (list below)
- [ ] Cover image
- [ ] Tags: #sanitychallenge (+ e.g. #devchallenge #webdev #nextjs, check the template)
- [ ] Agent session uploaded, curated, checked for keys, **Make Public** pressed
- [ ] Every number below re-checked against workflows/shared.ts + peoplesVar.ts RULES
-->

<!-- DEV title: VARdict - uphold or overturn a VAR room's decision. Tags: #devchallenge #sanitychallenge #sanity #ai -->

*This is a submission for the [Sanity Challenge, Path Two: Vibe-Code Something Strange](https://dev.to/challenges/sanity-2026-09-16)*

## What I Built

**VAR was supposed to end the arguments. It didn't. So VARdict hands the final call to the people. Power to the people.**

VAR promised the right decision and never quite delivered: the calls are still argued about, only now they take longer, and fans are no happier than before it. VARdict makes it slower, and no more right. The VAR room makes its call, but the call only stands if the people confirm it in a live vote:

- **Over 55% uphold:** the VAR's call stands.
- **Under 45%:** the fans overturn it, and their call is final. Sometimes that's the referee's original call, and sometimes it's a decision nobody made on the day (Pickford finally gets his red card).
- **In between:** 30 seconds of extra time, then one sudden-death penalty.
- **No human votes:** no decision. Back to the VAR room.

A **"Time added by democracy"** clock keeps score of how much longer football now takes.

It's built on five real Premier League VAR decisions, picked because they still split people:

- **Pickford on Van Dijk (2020):** the VAR only checked offside. No foul, no card, Van Dijk out for the season.
- **Maupay (2020):** a penalty given after the final whistle.
- **Gordon v Arsenal (2023):** three checks, one verdict, one furious Arteta.
- **West Ham v Forest (2025):** the record 374-second offside check.
- **Luis Díaz at Tottenham (2023), the control case:** the VAR said "check complete" by mistake and the referees' body admitted it. Nothing to debate. Does the crowd still get it wrong?

It plays like a match night, one step at a time. `/live` is **the stadium**: floodlights, crowd noise, a jumbotron, and a wall of four monitors replaying the same official clip (normal speed, slow motion, a rewind loop and a zoom). The private **VAR Room** is the officials' booth, an App SDK app in the Sanity Dashboard ("miles from the stadium", like PGMOL's real hub at Stockley Park).

Real people are rare at a demo, so a **simulated crowd** votes too, and I'm upfront about it:

- **60 bots per round,** each with a fixed persona: home fans, away fans, neutrals who lean on how loud the real-world outcry was, a bloc of pundits who all vote at the end, and one chaos voter who always sides with the minority.
- **Seeded,** so demo runs are repeatable.
- **Stored apart** from human votes (counters, not documents) and labelled on every screen.
- **Outweighed by humans:** one human vote counts ×8 and ends the round. Vote with the crowd's lean and you settle it; vote against it and you drag it into extra time. Democracy, but some votes count more.

<!-- Bonus material: Norway, where fans protested VAR by throwing fish cakes, a match was abandoned, clubs voted to
     scrap VAR, and the federation's congress voted to keep it anyway. The people voted and VAR won. Sweden
     rejected VAR in 2024. Use as an aside or cut. -->

## Demo

- The stadium (big screen, also where you vote): **https://live-vardict.vercel.app/live**
- Results: **https://live-vardict.vercel.app/incidents**, one page per incident, for example https://live-vardict.vercel.app/incidents/luis-diaz-tottenham-liverpool-2023

**Testing it (no login needed):**
1. Open `/live` and press **Enter the stadium** (this also turns the sound on).
2. Press **Start the VAR check**: the monitor wall replays the incident.
3. Press **Send to the people**, then vote Uphold or Overturn. The buttons say what each choice means (e.g. Overturn → Red card). You have 60 seconds, and your vote ends the round.
4. Watch the verdict and the path it took through the workflow. Vote against the crowd's lean to force extra time and a sudden-death penalty.
5. After all five: **Full time**, with the night in numbers on the Results page.

One match runs at a time, with a cap of 40 runs a day, so if the button says the VAR room is busy, someone else is voting. Wait a minute and it's yours.

<!-- TODO: demo video (embed): /live on a big screen, my phone voting, the VAR Room console starting the check and
     sending it to the people, one incident reaching the sudden-death penalty, the control-case result. -->
<!-- TODO: screenshots: Enter the stadium, monitor wall, live vote + receipt, verdict with the workflow path,
     Results with the night in numbers, VAR Room console in the Dashboard. -->

## Code

{% embed https://github.com/Henkisch/vardict %}

A pnpm monorepo:
- `studio`: Sanity Studio, with the schema and a custom input that previews the clip at its start and end.
- `web`: Next.js 16. The public screens (`/live`, `/incidents`) and the API routes that talk to Sanity with a server-only token.
- `var-room`: the App SDK app, my private operator console in the Dashboard.
- `workflows`: the `peoples-var` workflow definition, its runtime, the bot crowd and 62 tests.

## How it uses Sanity

**Workflows is the referee.** One `peoples-var` instance per incident, with the incident as its subject:

```
VAR room --Send to the people--> Fans vote (60 s)
Fans vote:   > 55% → Upheld | < 45% → Overturned | 45–55% → Extra time | no human vote → VAR room
Extra time:  > 55% → Upheld | < 45% → Overturned | 45–55% → Penalty    | no human vote → VAR room
Penalty:     one sudden-death kick (15 s): > 50% → Upheld, else Overturned
```

Every voting stage waits for a person to press, and the final call is written back to the incident by the workflow's effects.

**App SDK is the VAR Room.** It reads the workflow's own state live from a private `workflows` dataset: a graph of `peoples-var` with the current stage lit, the path so far with times, a live feed that turns each bot wave and each fan vote into a line as it lands, the match-day list, and a Full wipe for run data (content can't be wiped).

**The content model tells the story as data:**
- `incident`: three separate call fields, `originalCall` (on the pitch), `varRecommendation` and `overturnedCall` (what the fans get if they overturn it, which isn't always the referee's call). Plus the clip with exact start and end seconds, a ≤140-character `situation` line shown during the vote, `realDelaySeconds`, the `outcry` (level 1–5, a summary in our own words, and at least one source link), and the `controlCase` flag.
- `match`, `team` (colours used in the voting UI) and `law` (IFAB Laws of the Game, in our own words).
- `referendum`: one per round, with the simulated crowd as counters (`botVotes.uphold`, `.overturn`, per persona).
- `vote`: humans only. The document ID `vote-<referendum>-<session>` is the one-vote-per-phone-per-round lock.
- `punditLine`: the commentary ticker's lines, each with a fictional pundit and a trigger ("round opens", "too close", "overturned"…).
- **Derived, never stored:** the democracy clock (every incident's real delay plus every closed round's window) and every vote split, computed with GROQ.

## My Build Process

I built VARdict with **Claude Code** over a week and a half of long sessions: I steered, often from my phone, and the agent did the typing, research, testing and deploying. From the first hour I kept a brief (`CLAUDE.md`) with one rule in bold, **"Verify, don't assume"**, and a build log that had to include the failures. This section is written from that log.

### Day one: the plan meets the platform

Three things in my plan were wrong, and we found them by checking instead of building:

- **The App SDK needs a login.** My first idea had the public big screen as an App SDK app. The Dashboard sends anyone not logged in to sanity.io/login, so judges could never open it. Everything public moved to Next.js, and the App SDK app became the private VAR Room. (When the agent's plan led with "the public screen moves out", I replied "APP SDK IS THE VAR ROOM!!". Same substance, wrong framing, and it rewrote the plan.)
- **Scheduled Functions can't close a 60-second vote.** On the Free plan they run at most daily. And Workflows is a library, not a service: nothing moves unless your code calls `tick()`. So a `/api/tick` route closes the windows, called by the screens, the booth and the bot crowd itself, and it's idempotent so they can all call it.
- **Workflow conditions can't read vote documents.** They only see the instance snapshot. The tick route counts the votes with GROQ and hands the split to the workflow as action parameters; the workflow still makes every routing decision. And since operations can't branch, the penalty has two actions (`roundWon`, `roundLost`) and the caller picks one.

The first `defineWorkflow` call failed with six validation errors, all useful (a name grammar, unique effect names, "a terminal stage can't run actions"). The in-memory test bench let us test every path before deploying, and the first live run against the real project worked end to end.

### The clips were the hardest part

The clip is the product, so every vote window has to show the situation itself. oEmbed said every official World Cup clip was fine. A real YouTube player said error 150: FIFA blocks embedding. The agent can't watch video, so it read YouTube's storyboard thumbnails as contact sheets. That's how we found our Cucurella "clip" was a still photo and our Iran v Egypt clip was a slideshow. I told it "a good collection of clips is key here", then "only Premier League clips are fine too", and that unblocked everything. The two best clips are PGMOL releases of the VAR audio, close to perfect for a show about the VAR room. Everything is embedded at exact start and end times from official channels; nothing is downloaded or re-hosted.

### The first deploy broke in instructive ways

- My screens stayed empty while the agent's showed a live vote: I'd opened the page before the domain was a CORS origin, and it never retried.
- A bot crowd died halfway through a round on Vercel (55 of 60 votes, exactly the five pundits missing) and left the run stuck. All rounds had been chained in one request. Now each round's crowd gets its own request, and any open screen can close a finished window.
- The Live Content API's events matched our sync tags but arrived 5 to 20 seconds late, most of a vote window. We dropped it for one shared, CDN-cached read that every screen polls.

### A cost review that found the agent's own leak

I asked for a cost review. Its fix for the empty screens polled with no cache every 3 seconds, about 1,200 requests an hour per open tab, enough to use a month's Free quota in nine days. And every bot vote was a document, so we'd hit the 10k-document cap after about 25 runs. I asked "can we count votes in some smarter way?", and the answer was that bots don't need to be documents at all. Each wave is now one atomic `inc` on the referendum. Humans stay documents, because the document ID is what enforces one vote per phone.

### "So much stuff happening automagically"

Halfway through, I played it and didn't like it: one press set off a two-minute cascade of rounds I couldn't follow. I asked the agent to question me about the vibe before building anything, and a few rounds of multiple-choice questions turned into a new direction: a step-by-step match where every stage waits for a press, the monitor wall, a floodlit stadium with real crowd sound, a pundit ticker whose lines are Sanity content, and the App SDK booth.

Then I cut while playing: "we cant do 5 fkin penalties" became one sudden-death penalty. "The fans' call is final" removed the loops and the "abandoned" state. The windows went from 20 to 60 seconds so people can watch the clip twice. The workflow went through six versions in three days.

### Checking with numbers, not intuition

- **The human weight.** One human vote first counted ×20. Then I asked whether extra time was even possible. A script replayed each incident's seeded crowd: at ×20 a lone vote always landed outside 45–55%, so extra time never happened. At ×8, voting against the crowd's lean forces it on all five.
- **A content bug only a football fan would catch:** "for van dijk, if decision is overturned, should be penalty and red card right?!" Overturning used to restore the referee's call, but in four of five incidents the VAR had backed the referee, so "overturned" changed nothing. New field, `overturnedCall`, checked against the facts: Pickford gets a red card but no penalty, because Van Dijk was offside first.

### How we kept it honest

- **An audit, then plans for other agents.** I had the agent audit its own code, and it wrote 16 self-contained plans. Separate executor agents ran each one in its own worktree, and the main session reviewed every diff. Reviews caught real mistakes in the plans: "JSON only" would have broken the judges' start button, which posts with no body.
- **Guardrails I didn't expect to appreciate:** Claude Code's permission check blocked the agent's production deploys and a smoke test against the live wipe endpoint. Pushing to `main` became my job, which was right.
- **A test for "don't wipe anything important"**: the Full wipe works from an allowlist and a test seeds a match, team, law and pundit line and checks they survive.

**Prompts that worked:** "Verify, don't assume" in the brief. Plan mode before big changes. "Question me about the vibe first". And short, blunt nudges from my phone.

**What didn't work:** screenshotting video frames from a headless player (12 identical black frames), a synthesised Web Audio crowd ("doesn't sound like a crowd, and when muting, still sounds 😂"), and plans of mine that the reviews had to fix.

## Credits

- Crowd sound: excerpts of "WWS FootballAustriavs.Sweden" (Austria v Sweden, Ernst Happel Stadium, 2014) by Work With Sounds / Torsten Nilsson, via Wikimedia Sverige on Wikimedia Commons, [CC BY 4.0](https://commons.wikimedia.org/wiki/File:WWS_FootballAustriavs.Sweden.ogg).
- Whistle: "Referee whistle blow, gymnasium" by SpliceSound, [CC0](https://commons.wikimedia.org/wiki/File:218318_splicesound_referee-whistle-blow-gymnasium.wav).
- Clips: embedded from official channels (TNT Sports, The Telegraph, West Ham United) at exact start and end times.
- Outcry summaries are in my own words, with links to the sources.

## Sanity Project Details

- **Project ID:** `t2sbu6uu`
- **Public dataset:** `production`. Try `https://t2sbu6uu.api.sanity.io/v2025-02-19/data/query/production?query=*[_type=="incident"]`

## Agent Session

Two Claude Code sessions, public on DEV:

- [Day one: checking the plan against Sanity before building](https://dev.to/agent_sessions/vardict-day-one-checking-the-plan-against-sanity-before-building-yxlajq): the App SDK login, Scheduled Functions and Workflows findings from "Day one" above.
- [From "automagically" to a step-by-step match](https://dev.to/agent_sessions/vardict-from-automagically-to-a-step-by-step-match-civrmf): the good part starts at "Im on my mac, but I want to take it from the beginning alll together."

<!-- Cover image: TODO -->
