import {useDocumentProjection, useQuery} from '@sanity/sdk-react'
import {Suspense} from 'react'

type Instance = {
  _id: string
  currentStage: string
  startedAt: string
  completedAt?: string
  abortedAt?: string
  stages: {name: string; enteredAt: string}[]
  subject?: string
}

// peoples-var v4, in the order a run can walk it. Upheld and overturned are the two ends.
const FLOW = [
  {name: 'varRoom', title: 'VAR room', line: 'The officials make the call'},
  {name: 'referendum', title: 'Referendum', line: '20 s: over 55% keeps it, under 45% overturns'},
  {name: 'extraTime', title: 'Extra time', line: '10 s, same thresholds'},
  {name: 'shootout', title: 'Penalty', line: 'Sudden death, 8 s'},
]
const ENDS = [
  {name: 'upheld', title: 'Upheld', line: "The VAR's call stands"},
  {name: 'overturned', title: 'Overturned', line: 'The on-field call stands'},
]

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB')

// The live peoples-var run, read in real time from the private `workflows` dataset: the stage it's in, and every
// stage it has walked through. The public never sees this dataset.
export function WorkflowGraph() {
  const {data} = useQuery<Instance | null>({
    projectId: 't2sbu6uu',
    dataset: 'workflows',
    query: `*[_type == "sanity.workflow.instance" && tag == "dev"] | order(startedAt desc)[0]{
      _id, currentStage, startedAt, completedAt, abortedAt,
      "stages": stages[]{name, enteredAt},
      "subject": fields[name == "subject"][0].value.id
    }`,
  })
  const live = data && !data.completedAt
  const visits = (name: string) => data?.stages.filter((s) => s.name === name).length ?? 0
  const node = (step: {name: string; title: string; line: string}, end = false) => {
    const current = data?.currentStage === step.name
    const state = current ? (live ? 'current' : 'done-here') : visits(step.name) ? 'visited' : 'idle'
    return (
      <div key={step.name} className={`node ${state} ${end ? `end ${step.name}` : ''}`}>
        <span className="node-name">{step.name}</span>
        <strong>{step.title}</strong>
        <span className="node-line">{step.line}</span>
        {visits(step.name) > 1 && <span className="node-count">×{visits(step.name)}</span>}
      </div>
    )
  }

  return (
    <section className="panel graph">
      <header className="panel-head">
        <h2>Workflow · peoples-var v4</h2>
        {data ? (
          <p className="mono small">
            <span className={`lamp ${live ? 'on' : ''}`} /> {live ? 'RUN LIVE' : data.abortedAt ? 'ABORTED' : 'RUN COMPLETE'} ·{' '}
            {data._id.replace('dev.wf-instance.', '#')} · started {time(data.startedAt)}
            {data.subject && (
              <Suspense fallback={null}>
                {' · '}
                <Subject id={data.subject} />
              </Suspense>
            )}
          </p>
        ) : (
          <p className="mono small muted">NO RUNS YET · the pitch is quiet</p>
        )}
      </header>
      <div className="flow">
        {FLOW.map((step, i) => (
          <div key={step.name} className="flow-step">
            {i > 0 && <span className="arrow">▶</span>}
            {node(step)}
          </div>
        ))}
        <span className="arrow">▶</span>
        <div className="ends">{ENDS.map((step) => node(step, true))}</div>
      </div>
      {data && (
        <p className="path mono small">
          <span className="muted">PATH</span>{' '}
          {data.stages.map((s, i) => (
            <span key={`${s.name}-${s.enteredAt}`}>
              {i > 0 && <span className="muted"> → </span>}
              <span className={i === data.stages.length - 1 && live ? 'accent' : ''}>{s.name}</span>
              <span className="muted"> {time(s.enteredAt)}</span>
            </span>
          ))}
          <span className="muted"> · no human vote in a round sends it back to varRoom</span>
        </p>
      )}
    </section>
  )
}

// The run's subject lives in `production`; the instance only holds its global reference.
function Subject({id}: {id: string}) {
  const {data} = useDocumentProjection<{title: string}>({
    documentId: id.split(':').at(-1)!,
    documentType: 'incident',
    projectId: 't2sbu6uu',
    dataset: 'production',
    projection: '{title}',
  })
  return <span className="accent">{data?.title}</span>
}
