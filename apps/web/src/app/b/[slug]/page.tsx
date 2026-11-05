export default async function NegocioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Negócio: {slug}</h1>
      <p className="mt-2 text-neutral-600">Página pública de agendamento (em construção).</p>
    </main>
  );
}
