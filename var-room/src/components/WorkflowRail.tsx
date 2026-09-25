import {useQuery} from '@sanity/sdk-react'

type Instance = {
  _id: string
  currentStage: string
  completedAt?: string
  abortedAt?: string
  stages: {name: string}[]
}

// peoples-var v4 in the order a run walks it; upheld and overturned are the two ends.
const FLOW = ['varRoom', 'referendum', 'extraTime', 'shootout']
const ENDS = ['upheld', 'overturned']

// L4 (design.md): the live run as one thin rail of real stage names, read in real time from the private
// `workflows` dataset. It names stages; it doesn't explain them.
export function WorkflowRail() {
  const {data} = useQuery<Instance | null>({
    projectId: 't2sbu6uu',
    dataset: 'workflows',
    query: `*[_type == "sanity.workflow.instance" && tag == "dev"] | order(startedAt desc)[0]{
      _id, currentStage, completedAt, abortedAt, "stages": stages[]{name}
    }`,
  })
  const live = Boolean(data && !data.completedAt)
  const visits = (name: string) => data?.stages.filter((s) => s.name === name).length ?? 0
  const stage = (name: string) => {
    const current = data?.currentStage === name
    const state = current ? (live ? 'current' : `ended ${name}`) : visits(name) ? 'visited' : ''
    return (
      <li key={name} className={`rail-stage ${state}`} aria-current={current && live ? 'step' : undefined}>
        {name}
        {visits(name) > 1 && <span className="rail-count">×{visits(name)}</span>}
      </li>
    )
  }

  return (
    <section className="rail" aria-label="Workflow">
      <p className="rail-name">
        Workflow <span className="mono">peoples-var</span>
      </p>
      <ol className="rail-flow">
        {FLOW.map(stage)}
        <li className="rail-fork" aria-hidden />
        {ENDS.map(stage)}
      </ol>
      <p className="rail-meta mono">
        {data ? `${data._id.replace('dev.wf-instance.', '#')} · ${live ? 'live' : data.abortedAt ? 'aborted' : 'done'}` : 'no runs yet'}
      </p>
    </section>
  )
}
