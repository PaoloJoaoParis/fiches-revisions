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
    .select("id, titre, synthese, questions, created_at, fichier_chemin")
    .eq("id", id)
    .maybeSingle<FicheEnregistree & { fichier_chemin: string | null }>();

  if (!fiche) {
    notFound();
  }

  let lienPdf: string | null = null;
  if (fiche.fichier_chemin) {
    const { data } = await supabase.storage
      .from("cours")
      .createSignedUrl(fiche.fichier_chemin, 300);
    lienPdf = data?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/fiches" className="text-blue-600 underline">
        ← Retour à mes fiches
      </Link>
      <p className="mt-4 text-sm text-gray-500">
        Créée le {new Date(fiche.created_at).toLocaleDateString("fr-FR")}
      </p>
      {lienPdf && (
        <p className="mt-2 text-sm">
          <a href={lienPdf} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            Télécharger le cours d'origine (PDF)
          </a>
        </p>
      )}
      <AffichageFiche fiche={fiche} />
    </main>
  );
}
