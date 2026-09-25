import {type SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'
import {Suspense, type ReactNode} from 'react'

import {FullWipe} from './components/FullWipe'
import {IncidentBoard} from './components/IncidentBoard'
import {UnderReview} from './components/UnderReview'
import {VoteFeed} from './components/VoteFeed'
import {WorkflowRail} from './components/WorkflowRail'
import {useNow} from './useNow'
import './App.css'

// The VAR Room: the officials' booth (PGMOL's real hub is at Stockley Park, miles from any ground); /live is the
// stadium. Content from `production`, workflow state from the private `workflows` dataset (readable because
// the Dashboard hands the app a logged-in user's token).
const config: SanityConfig[] = [
  {projectId: 't2sbu6uu', dataset: 'production'},
  {projectId: 't2sbu6uu', dataset: 'workflows'},
]

const Loading = ({children}: {children: ReactNode}) => (
  <Suspense fallback={<section className="muted">Patching in…</section>}>{children}</Suspense>
)

function WallClock() {
  const now = useNow(1000)
  return <span className="mono">{new Date(now).toLocaleTimeString('en-GB')}</span>
}

export default function App() {
  return (
    <SanityApp config={config} fallback={<p className="muted pad">Opening the VAR room…</p>}>
      <main className="booth">
        <header className="chrome">
          <p className="wordmark">
            VAR <span className="accent">Room</span>
            <span className="chrome-note">The officials&apos; booth. The stadium is on /live</span>
          </p>
          <p className="chrome-status">
            <span className="rec">REC</span> <WallClock />
          </p>
        </header>
        <Loading>
          <UnderReview />
        </Loading>
        <Loading>
          <WorkflowRail />
        </Loading>
        <div className="booth-grid">
          <Loading>
            <VoteFeed />
          </Loading>
          <Loading>
            <IncidentBoard />
          </Loading>
        </div>
        <FullWipe />
      </main>
    </SanityApp>
  )
}
