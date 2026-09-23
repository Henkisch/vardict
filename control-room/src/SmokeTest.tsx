import {Suspense} from 'react'
import {useQuery} from '@sanity/sdk-react'

// Session 1 smoke test: proves the App SDK reads the content dataset live inside the Dashboard.
function SmokeDocs() {
  const {data} = useQuery<{_id: string; _type: string; title?: string}[]>({
    query: `*[_type == "smokeTest"]{_id, _type, title}`,
  })
  return (
    <ul>
      {data.map((doc) => (
        <li key={doc._id}>
          {doc.title ?? doc._id} <small>({doc._type})</small>
        </li>
      ))}
    </ul>
  )
}

export function SmokeTest() {
  return (
    <section>
      <h2>Live smoke test</h2>
      <Suspense fallback={<p>Loading…</p>}>
        <SmokeDocs />
      </Suspense>
    </section>
  )
}
