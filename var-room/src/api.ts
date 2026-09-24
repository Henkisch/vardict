// The VAR Room drives the workflow through the public web app's routes, which hold the server-side runtime.
const WEB_URL = process.env.SANITY_APP_WEB_URL ?? 'https://live-vardict.vercel.app'

export type StartResult = {status: string; instanceId?: string; stage?: string; retryInSeconds?: number}

// Proves this request comes from the VAR Room, so /api/start will honor a picked incidentId instead of
// silently falling back to "next in line". Shared with the web app via VARDICT_OPERATOR_KEY.
const OPERATOR_KEY = process.env.SANITY_APP_OPERATOR_KEY

export async function sendToThePeople(incidentId?: string): Promise<StartResult> {
  const response = await fetch(`${WEB_URL}/api/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(OPERATOR_KEY ? {'x-operator-key': OPERATOR_KEY} : {}),
    },
    body: JSON.stringify(incidentId ? {incidentId} : {}),
  })
  return response.json().catch(() => ({status: `http ${response.status}`}))
}

export async function closeWindow() {
  const response = await fetch(`${WEB_URL}/api/tick`, {method: 'POST'})
  return response.json().catch(() => ({status: `http ${response.status}`}))
}

// Must match workflows/shared.ts CALL_LABELS. Not imported: adding a `workflows` workspace dependency here
// widened the pnpm lockfile diff well beyond that one link (next/styled-jsx/eslint-config-next peer
// resolution churn, plan 011), so this stays a copy until that's worth untangling.
export const CALL_LABELS: Record<string, string> = {
  goal: 'Goal',
  noGoal: 'No goal',
  penalty: 'Penalty',
  noPenalty: 'No penalty',
  redCard: 'Red card',
  yellowCard: 'Yellow card',
  noFoul: 'No foul',
}

// Must match workflows/shared.ts HUMAN_VOTE_WEIGHT (see comment on CALL_LABELS above for why this isn't an import).
export const HUMAN_VOTE_WEIGHT = 20
