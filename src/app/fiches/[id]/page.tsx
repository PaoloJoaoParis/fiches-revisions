import Link from "next/link";
import { notFound } from "next/navigation";
import AffichageFiche from "@/components/AffichageFiche";
import type { FicheEnregistree } from "@/lib/fiche";
import { creerClientServeur } from "@/lib/supabase/server";

export default async function DetailFiche({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await creerClientServeur();
  const { data: fiche } = await supabase
    .from("fiches")
    .select("id, titre, synthese, questions, created_at")
    .eq("id", id)
    .maybeSingle<FicheEnregistree>();

  if (!fiche) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/fiches" className="text-blue-600 underline">
        ← Retour à mes fiches
      </Link>
      <p className="mt-4 text-sm text-gray-500">
        Créée le {new Date(fiche.created_at).toLocaleDateString("fr-FR")}
      </p>
      <AffichageFiche fiche={fiche} />
    </main>
  );
}
