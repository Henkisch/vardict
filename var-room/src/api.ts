// The VAR Room drives the workflow through the public web app's routes, which hold the server-side runtime.
const WEB_URL = process.env.SANITY_APP_WEB_URL ?? 'https://live-vardict.vercel.app'

export type StartResult = {status: string; instanceId?: string; stage?: string; retryInSeconds?: number}

export async function sendToThePeople(incidentId?: string): Promise<StartResult> {
  const response = await fetch(`${WEB_URL}/api/start`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(incidentId ? {incidentId} : {}),
  })
  return response.json().catch(() => ({status: `http ${response.status}`}))
}

export async function closeWindow() {
  const response = await fetch(`${WEB_URL}/api/tick`, {method: 'POST'})
  return response.json().catch(() => ({status: `http ${response.status}`}))
}

export const CALL_LABELS: Record<string, string> = {
  goal: 'Goal',
  noGoal: 'No goal',
  penalty: 'Penalty',
  noPenalty: 'No penalty',
  redCard: 'Red card',
  yellowCard: 'Yellow card',
  noFoul: 'No foul',
}

export const HUMAN_VOTE_WEIGHT = 20
