export default async function IncidentPage({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">{slug}</h1>
      <p>Results coming soon.</p>
    </main>
  )
}
