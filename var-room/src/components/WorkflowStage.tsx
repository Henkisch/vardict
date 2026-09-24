import {useQuery} from '@sanity/sdk-react'

type Instance = {_id: string; currentStage: string; startedAt: string; visits: number; title?: string}

const STAGES: Record<string, string> = {
  varRoom: 'In the VAR room',
  referendum: 'Referendum',
  extraTime: 'Extra time',
  shootout: 'Shootout',
}

// The live peoples-var run, read from the private workflows dataset.
export function WorkflowStage() {
  const {data} = useQuery<Instance | null>({
    dataset: 'workflows',
    projectId: 't2sbu6uu',
    query: `*[_type == "sanity.workflow.instance" && !defined(completedAt)] | order(startedAt desc)[0]{
      _id, currentStage, startedAt, "visits": count(stages[name == "varRoom"])}`,
  })
  if (!data) return <p className="stage idle">No run live. The pitch is quiet.</p>
  return (
    <p className="stage live">
      <span className="dot" /> {STAGES[data.currentStage] ?? data.currentStage}
      <span className="muted"> · VAR room visit {data.visits} of 3 · {data._id.replace('dev.wf-instance.', '#')}</span>
    </p>
  )
}
