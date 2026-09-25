// Reset the demo: the same full wipe as the booth's button (runtime.ts wipeRunData). Aborts every live run,
// deletes all referendums and votes, and unsets every incident's finalCall. Content is never deleted.
// Run: pnpm tsx --env-file=../.env.local scripts/reset.ts
import {createRuntime, wipeRunData} from '../runtime'

const runtime = createRuntime({projectId: process.env.SANITY_PROJECT_ID!, token: process.env.SANITY_WRITE_TOKEN!})
console.log(await wipeRunData(runtime))
