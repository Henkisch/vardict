# Demo video script

About 35 seconds, cut between the VAR Room (the booth) and `/live` (the stadium): cause, then effect. No split
screen: every shot is full screen.

## Why Maupay

The first incident in line, and the seeded crowd takes it all the way to the penalty (checked with
`workflows/scripts/crowd-odds.ts`, read-only):

- Regular time, vote **Overturn** → 46% uphold → extra time
- Extra time, vote **Overturn** → 49% uphold → too close → penalty
- The penalty: over 50% uphold is upheld, else overturned

The crowd is seeded, so every take ends the same way. A human vote ends the round at once, so there are no
60-second waits.

## Before recording

- [ ] `keySeconds` set for Maupay in Studio (the rewind and zoom monitors aim at the midpoint until then)
- [ ] Full wipe in the VAR Room, so Maupay is next and the results are empty
- [ ] Browser: bookmarks bar hidden, notifications off, zoom so `/live` fills the screen without scrolling
- [ ] `/live`: press **Enter the stadium** first (it unlocks the sound)
- [ ] Record system audio (crowd, whistle, roar)
- [ ] Two recordings of the same run: the VAR Room and `/live` in separate windows or on two screens. Or
      record them in separate runs (wipe in between): the seed gives the same result each time

## The cut

| # | Length | Shot | Action | Caption / note |
|---|---|---|---|---|
| 1 | 2 s | Cover card | "VAR was supposed to end the arguments. It didn't." | |
| 2 | 1 s | VAR Room | Click **Start the VAR check** | Zoom on the button |
| 3 | 4 s | Stadium | Monitor wall lights up, "VAR CHECK · POSSIBLE HANDBALL" | The TV moment |
| 4 | 1 s | VAR Room | Click **Send to the people** | |
| 5 | 3 s | Stadium | Vote **Overturn** → bars swing → 46% | "Extra time" |
| 6 | 1 s | VAR Room | Click **Go to extra time** | |
| 7 | 3 s | Stadium | Vote **Overturn** → 49% | "Too close" |
| 8 | 1 s | VAR Room | Click **Take the penalty** | Whistle |
| 9 | 5 s | Stadium | The penalty vote → the verdict, roar | "Sudden death". Real time: the one slow moment |
| 10 | 3 s | VAR Room | The workflow graph with the path it walked | "Every step is a Sanity Workflow stage" |
| 11 | 3 s | Stadium | The path strip on the verdict screen | |
| 12 | 3 s | End card | "Power to the people." + live-vardict.vercel.app/live | |

## Editing

- **Cut on the click.** The VAR Room shot ends the moment the button is pressed, and the stadium shot starts
  mid-reaction. Cut out the kick-off countdown and the "counting" waits.
- **One continuous crowd bed** under every shot, so the cuts don't feel choppy. The whistle on the booth →
  stadium cuts.
- **Two worlds:** the booth is calm and grey, the stadium loud and floodlit. The contrast makes each cut read as
  "the booth decides, the crowd reacts".
- **Captions only on beats 5, 7 and 9.** The screens say the rest.
- Record each step twice and keep the cleanest take.

Left out on purpose (screenshots in the post instead): Enter the stadium, the results page, the control case
(Díaz), the phone.
