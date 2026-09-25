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
// Plain words first (Henrik); the real stage name sits small underneath.
const PLAIN: Record<string, string> = {
  varRoom: 'VAR room',
  referendum: 'Fans vote',
  extraTime: 'Extra time',
  shootout: 'Penalty',
  upheld: 'Upheld',
  overturned: 'Overturned',
}

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
  // An aborted run (a wipe, or an operator pick) has nothing to show: the rail goes back to idle.
  const shown = data && !data.abortedAt ? data : undefined
  const visits = (name: string) => shown?.stages.filter((s) => s.name === name).length ?? 0
  const stage = (name: string) => {
    const current = shown?.currentStage === name
    const state = current ? (live ? 'current' : `ended ${name}`) : visits(name) ? 'visited' : ''
    return (
      <li key={name} className={`rail-stage ${state}`} aria-current={current && live ? 'step' : undefined}>
        <span className="rail-plain">
          {PLAIN[name]}
          {visits(name) > 1 && <span className="rail-count">×{visits(name)}</span>}
        </span>
        <span className="rail-code mono">{name}</span>
      </li>
    )
  }

  return (
    <section className="rail" aria-label="Workflow">
      <p className="rail-name">
        The workflow
        <span className="rail-code mono">peoples-var</span>
      </p>
      <ol className="rail-flow">
        {FLOW.map(stage)}
        <li className="rail-fork" aria-hidden />
        <li>
          <ol className="rail-ends" aria-label="Either ending">
            {ENDS.map(stage)}
          </ol>
        </li>
      </ol>
      <p className="rail-meta mono">
        {shown ? `${shown._id.replace('dev.wf-instance.', '#')} · ${live ? 'running' : 'finished'}` : 'No match running'}
      </p>
    </section>
  )
}
