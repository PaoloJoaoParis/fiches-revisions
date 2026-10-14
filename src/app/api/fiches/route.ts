import { LIMITES } from "@/lib/fiche";
import { genererFiche } from "@/lib/generer-fiche";
import { ErreurIA } from "@/lib/ia";
import { limiteurGenerations } from "@/lib/limitation";
import { extraireTextePdf } from "@/lib/pdf";
import { creerClientServeur } from "@/lib/supabase/server";

export async function POST(request: Request) {
  // 0. Vérification de la session
  const supabase = await creerClientServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { erreur: "Votre session a expiré. Reconnectez-vous pour générer une fiche." },
      { status: 401 }
    );
  }

  const body = await request.json();
  const titre = typeof body.titre === "string" ? body.titre.trim() : "";

  if (!titre || titre.length > LIMITES.titreMax) {
    return Response.json(
      { erreur: `Le titre est obligatoire (${LIMITES.titreMax} caractères maximum).` },
      { status: 400 }
    );
  }

  // 1. Récupération du texte : saisi directement ou extrait d'un PDF
  let texte: string;
  let cheminFichier: string | null = null;

  if (typeof body.cheminFichier === "string") {
    const chemin: string = body.cheminFichier;

    if (!chemin.startsWith(`${user.id}/`) || !chemin.endsWith(".pdf")) {
      return Response.json({ erreur: "Fichier invalide." }, { status: 400 });
    }

    cheminFichier = chemin;

    try {
      texte = await extraireTextePdf(supabase, chemin);
    } catch (erreur) {
      console.error("Erreur lors de la lecture du PDF :", erreur);
      return Response.json(
        { erreur: "Impossible de lire ce PDF. Vérifiez qu'il n'est pas endommagé." },
        { status: 422 }
      );
    }
  } else {
    texte = typeof body.texte === "string" ? body.texte.trim() : "";
  }

  if (texte.length < LIMITES.texteMin || texte.length > LIMITES.texteMax) {
    const origine = cheminFichier ? "Le texte extrait du PDF" : "Le texte";
    const conseil =
      cheminFichier && texte.length < LIMITES.texteMin
        ? " S'il s'agit d'un document scanné, il ne contient pas de texte lisible."
        : "";

    return Response.json(
      {
        erreur: `${origine} doit contenir entre ${LIMITES.texteMin} et ${LIMITES.texteMax} caractères (actuellement ${texte.length}).${conseil}`,
      },
      { status: 400 }
    );
  }

  // 2. Vérification du quota de l'utilisateur
  const enTetesQuota: Record<string, string> = {};

  try {
    const quota = await limiteurGenerations.limit(user.id);

    enTetesQuota["X-RateLimit-Limit"] = String(quota.limit);
    enTetesQuota["X-RateLimit-Remaining"] = String(quota.remaining);

    if (!quota.success) {
      const secondes = Math.max(1, Math.ceil((quota.reset - Date.now()) / 1000));
      const minutes = Math.ceil(secondes / 60);

      return Response.json(
        {
          erreur: `Vous avez atteint votre quota de ${quota.limit} fiches par heure. Réessayez dans ${minutes} minute(s).`,
        },
        { status: 429, headers: { ...enTetesQuota, "Retry-After": String(secondes) } }
      );
    }
  } catch (erreur) {
    // Si Redis est indisponible, on laisse passer la requête plutôt que de bloquer
    // tous les utilisateurs : c'est un choix « fail open ».
    console.error("Limitation de débit indisponible :", erreur);
  }

  // 3. Génération de la fiche par le modèle d'IA
  let fiche;
  try {
    fiche = await genererFiche(titre, texte);
  } catch (erreur) {
    return reponseErreurIA(erreur);
  }

  // 4. Enregistrement de la fiche, au nom de l'utilisateur connecté
  try {
    const { data, error } = await supabase
      .from("fiches")
      .insert({
        titre: fiche.titre,
        texte_source: texte,
        synthese: fiche.synthese,
        questions: fiche.questions,
        modele: process.env.AI_MODEL,
        fichier_chemin: cheminFichier,
      })
      .select("id, titre, synthese, questions, created_at")
      .single();

    if (error) throw error;

    return Response.json(data, { status: 201, headers: enTetesQuota });
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de la fiche :", erreur);
    return Response.json(
      { erreur: "La fiche a été générée mais n'a pas pu être enregistrée. Réessayez plus tard." },
      { status: 500 }
    );
  }
}

function reponseErreurIA(erreur: unknown) {
  if (erreur instanceof ErreurIA && erreur.status === 429) {
    return Response.json(
      { erreur: "Le quota du service d'IA est atteint. Réessayez dans quelques instants." },
      { status: 429 }
    );
  }

  if (erreur instanceof ErreurIA && erreur.status === 413) {
    return Response.json(
      { erreur: "Le texte est trop volumineux pour le service d'IA. Réduisez-le et réessayez." },
      { status: 413 }
    );
  }

  if (erreur instanceof Error && erreur.name === "TimeoutError") {
    return Response.json(
      { erreur: "Le service d'IA met trop de temps à répondre. Réessayez plus tard." },
      { status: 504 }
    );
  }

  console.error(erreur);
  return Response.json(
    { erreur: "La génération de la fiche a échoué. Réessayez plus tard." },
    { status: 502 }
  );
}