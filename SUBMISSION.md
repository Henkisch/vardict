<!--
DEV.to submission DRAFT (Path Two template). Written from BUILD_LOG.md in session 3; Henrik edits and publishes.
Before publishing: fill the TODOs, check CLAUDE.md "Submission requirements", tag #sanitychallenge, add a cover image,
rotate the session-1 tokens, make the agent session public.
-->

*This is a submission for the [Sanity Challenge, Path Two: Vibe-Code Something Strange](https://dev.to/challenges/sanity-2026-09-16)*

## What I Built

**VARdict. Football fixed VAR. We fixed it with democracy. Now it's slower and less accurate.**

VAR gets two complaints: it's often wrong, and it takes forever. VARdict answers both, in the wrong direction. The
VAR room makes its call, but the call only stands if the public confirms it in a live vote:

- **Over 55% uphold:** the VAR's call stands.
- **Under 45%:** the fans overturn it, and their call is final. Sometimes that's the referee's call, sometimes a
  decision nobody made on the day (Pickford gets his red card).
- **In between:** 30 seconds of extra time, then one sudden-death penalty.
- **Nobody human votes:** no decision. Back to the VAR room.

A "Time added by democracy" clock keeps score of how much longer football now takes.

It's built on five real Premier League VAR decisions, picked because they still split people:

- **Pickford on Van Dijk (2020):** VAR only checked offside.
- **Maupay (2020):** a penalty given after the final whistle.
- **Gordon v Arsenal (2023):** three checks, one verdict.
- **West Ham v Forest (2025):** the record 374-second check.
- **Luis Díaz at Tottenham (2023), the control case:** the VAR said "check complete" by mistake and the referees'
  body admitted it. Does the crowd still get it wrong?

Real people are rare at a demo, so a **simulated crowd** votes too, and I'm upfront about it:

- **60 bots per round,** each with a fixed persona: home fans, away fans, neutrals who lean on how loud the
  real-world outcry was, a bloc of pundits who all vote at the end, and one chaos voter who always sides with the
  minority.
- **Seeded,** so demo runs are repeatable.
- **Stored separately** from human votes and labelled on every screen.
- **Outweighed by humans:** one human vote counts ×8 and ends the round. Vote with the crowd and you settle it;
  vote against it and you drag it into extra time. Democracy, but some votes count more.

## Demo

- Big screen: **https://live-vardict.vercel.app/live**
- Results, one page per incident, for example https://live-vardict.vercel.app/incidents/luis-diaz-tottenham-liverpool-2023

**Testing it (no login needed):**
1. Open `/live`, enter the stadium and press **Start the VAR check**: the monitor wall plays the incident.
2. Press **Send to the people**, then vote Uphold or Overturn (60 seconds, or until you vote).
3. Watch the verdict. Vote against the crowd's lean to force extra time and a sudden-death penalty.

There's a cap of one live vote at a time and 40 runs a day, so if the button says the VAR room is busy, somebody
else is voting.

<!-- TODO: demo video: /live on a big screen, the VAR Room console starting the check and sending it to the people,
     one incident reaching the sudden-death penalty, the control-case result. -->
<!-- TODO: screenshots: waiting screen, VAR room monitor wall, live vote + receipt, verdict with the workflow path,
     results page, VAR Room console (Dashboard). -->

## Code

<!-- TODO: make https://github.com/Henkisch/vardict public (or link it) -->
A pnpm monorepo: `studio` (Sanity Studio), `web` (Next.js 16: the public site and API routes), `var-room`
(an App SDK app, my private operator console), `workflows` (the `peoples-var` workflow, its runtime, the bot
crowd and tests).

## My Build Process

I built VARdict with **Claude Code**, in long sessions where I steered and the agent did the typing, research,
testing and deploying. The whole time I kept a brief (`CLAUDE.md`) and a brutally honest build log. That log is
where this section comes from.

**Workflows is the heart of it.** The workflow, `peoples-var`, has six stages: VAR room, referendum, extra time,
shootout, upheld and abandoned. The only human action is `recommend`, and everything else is automatic. Some of the
fun came from finding out where our plan and the engine disagreed:
- **The brief wanted a Scheduled Function to close the vote windows.** The docs said two things: Workflows is a
  library, not a service ("nothing moves unless your code calls `tick()`"), and Scheduled Functions run at most
  daily on the Free plan. Our windows are 10 to 30 seconds. So the web app has a `/api/tick` route, and the
  screens themselves call it when their countdown hits zero.
- **Workflow conditions can't read vote documents.** They only see the instance snapshot. So the tick route counts
  the votes and hands the split to the workflow as action parameters, and the workflow still makes every routing
  decision.
- **Operations can't branch.** A shootout round needs "won" or "lost", so there are two actions and the caller picks
  one.
- **The shootout is a stage that loops into itself,** one visit per round. The loop cap counts VAR-room visits in the
  instance's own stage history.
- **The first `defineWorkflow` call failed with six validation errors,** all useful: a name grammar, unique effect
  names, and "a terminal stage can't run actions". So the final call is written from the stage that decides the
  vote.
- **The in-memory test bench let me test every path before deploying:** loops, shootouts, a second shootout, the loop
  cap, quorum extensions. 14 tests. The first live run against the real project worked end to end.

**App SDK:** the **VAR Room** is my operator console inside the Sanity Dashboard. It shows the five incidents, a "Send
to the people" button for each one, and the live round with the crowd broken down by persona, which is the view the
public doesn't get. It also reads the workflow's stage straight from the private workflows dataset, using my login.
The Dashboard only lets logged-in org members in, which is why everything public lives in Next.js instead. That was
a day-one finding that changed the architecture.

**What went wrong (the honest part):**
- **Clips.** oEmbed said every official World Cup clip was fine. A real YouTube player said error 150: FIFA blocks
  embedding. The agent can't watch video, so it read YouTube's storyboard thumbnails as contact sheets to find the
  moments. It turned out that our Cucurella "clip" was a still photo and our Iran v Egypt clip was a slideshow. I
  switched to all-Premier-League incidents and chose them for clip clarity. The two best clips are PGMOL releases of
  the VAR audio, which are perfect for a show about the VAR room.
- **The first deploy:** my screens stayed empty while the agent's showed a live vote, because I had opened the page
  before the domain was added as a CORS origin, and it never retried. Then a bot crowd died halfway through a round
  on Vercel (55 of 60 votes, all the pundits missing) and left the run stuck. The fix gives each round's crowd its
  own request, and any open screen can close a finished window.
- **Cost:** I asked for a cost review, and the agent found its own leak. Its fix for the empty screens polled without
  a cache every 3 seconds, about 1,200 requests an hour per open tab. And every bot vote was a document, so we'd hit
  the Free plan's 10k-document limit after about 25 runs. I asked "can we count votes in some smarter way?", and the
  answer was that bots don't need to be documents at all. Each wave is now one atomic increment on the referendum.
  Humans stay documents, because the document ID is what enforces one vote per phone per round.

**Prompts that worked:** "Verify, don't assume" in the brief. Plan mode before big changes. And short, blunt nudges
from my phone: "a good collection of clips is key here", "human vote needs quite huge impact", "APP SDK IS THE VAR
ROOM!!".

## Sanity Project Details

- **Project ID:** `t2sbu6uu`
- **Public dataset:** `production`. Try
  `https://t2sbu6uu.api.sanity.io/v2025-02-19/data/query/production?query=*[_type=="incident"]`
- **Content model:**
  - `incident`: three separate call fields tell the story as data (on the pitch, VAR recommendation, final call),
    plus the clip with exact start/end, the outcry with sources, the situation line and the control-case flag.
  - `match`, `team` and `law` (IFAB Laws of the Game, in our own words).
  - `referendum`: one per round, with the simulated crowd as counters.
  - `vote`: humans only.
- The democracy clock is computed with GROQ, never stored. The workflow's instances live in a second, private
  `workflows` dataset.

## Agent Session

<!-- TODO: upload the curated Claude Code transcript at https://dev.to/agent_sessions/new, check it for keys and
     tokens (rotate the session-1 project tokens first), press Make Public, embed here. -->

<!-- Cover image: TODO -->
