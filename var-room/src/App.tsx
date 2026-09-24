import {type SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'
import {Suspense} from 'react'

import {IncidentList} from './components/IncidentList'
import {LiveRound} from './components/LiveRound'
import {WorkflowStage} from './components/WorkflowStage'
import './App.css'

// The VAR Room: Henrik's private operator console. Content from `production`, workflow state from the private
// `workflows` dataset (readable because the Dashboard hands the app a logged-in user's token).
const config: SanityConfig[] = [
  {projectId: 't2sbu6uu', dataset: 'production'},
  {projectId: 't2sbu6uu', dataset: 'workflows'},
]

export default function App() {
  return (
    <SanityApp config={config} fallback={<p className="muted pad">Opening the VAR room…</p>}>
      <main className="room">
        <header className="room-header">
          <h1>
            VAR <span className="accent">Room</span>
          </h1>
          <Suspense fallback={<p className="muted">Checking the workflow…</p>}>
            <WorkflowStage />
          </Suspense>
        </header>
        <div className="room-grid">
          <section>
            <h2>Incidents</h2>
            <Suspense fallback={<p className="muted">Loading incidents…</p>}>
              <IncidentList />
            </Suspense>
          </section>
          <section>
            <h2>Live round</h2>
            <Suspense fallback={<p className="muted">Loading the round…</p>}>
              <LiveRound />
            </Suspense>
          </section>
        </div>
      </main>
    </SanityApp>
  )
}
