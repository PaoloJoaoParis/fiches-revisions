import * as Sentry from "@sentry/nextjs";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { envoyerNotification } from "@/lib/email";
import { genererFiche } from "@/lib/generer-fiche";
import { ErreurIA, messageErreurIA } from "@/lib/ia";
import { NOMBRE_REESSAIS } from "@/lib/qstash";
import { creerClientAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

type ClientAdmin = ReturnType<typeof creerClientAdmin>;

function estReessayable(erreur: unknown): boolean {
  if (erreur instanceof ErreurIA) {
    return erreur.status === 429 || erreur.status >= 500;
  }
  // Délai dépassé, panne réseau ou erreur inattendue : une nouvelle tentative peut réussir
  return true;
}

// Effet secondaire : un échec d'envoi est journalisé, mais ne fait jamais échouer le traitement
async function notifier(
  supabase: ClientAdmin,
  fiche: { id: string; titre: string; user_id: string },
  statut: "prete" | "erreur",
  messageErreur?: string
) {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(fiche.user_id);
    const destinataire = data.user?.email;

    if (error || !destinataire) {
      throw new Error("Adresse e-mail de l'auteur introuvable.");
    }

    await envoyerNotification({
      destinataire,
      ficheId: fiche.id,
      titre: fiche.titre,
      statut,
      messageErreur,
    });
  } catch (erreur) {
    console.error("Échec de l'envoi de la notification :", erreur);
    Sentry.captureException(erreur, {
      level: "warning",
      tags: { tache: "notification-email" },
      extra: { ficheId: fiche.id },
    });
  }
}

async function traiter(request: Request) {
  const { ficheId } = await request.json();
  const tentative = Number(request.headers.get("Upstash-Retried") ?? "0");

  // Le worker n'a pas d'utilisateur connecté : il utilise le client administrateur
  const supabase = creerClientAdmin();

  const { data: fiche } = await supabase
    .from("fiches")
    .select("id, titre, texte_source, statut, user_id")
    .eq("id", ficheId)
    .maybeSingle();

  // Idempotence : une fiche absente ou déjà traitée n'est pas générée une seconde fois
  if (!fiche || fiche.statut !== "en_attente") {
    return Response.json({ resultat: "ignoré" });
  }

  Sentry.setUser({ id: fiche.user_id });

  try {
    const resultat = await genererFiche(fiche.titre, fiche.texte_source, {
      id: fiche.id,
      nom: "generation-fiche",
      userId: fiche.user_id,
      metadata: { tentativeQStash: tentative + 1 },
    });

    await supabase
      .from("fiches")
      .update({
        synthese: resultat.synthese,
        questions: resultat.questions,
        modele: process.env.AI_MODEL,
        statut: "prete",
      })
      .eq("id", fiche.id);

    await notifier(supabase, fiche, "prete");

    return Response.json({ resultat: "prête" });
  } catch (erreur) {
    console.error(`Échec de la génération (tentative ${tentative + 1}) :`, erreur);
    Sentry.captureException(erreur, {
      tags: { tache: "generation-fiche", tentative: String(tentative + 1) },
      extra: { ficheId: fiche.id },
    });

    // Erreur passagère et tentatives restantes : on demande à QStash de réessayer
    if (estReessayable(erreur) && tentative < NOMBRE_REESSAIS) {
      return Response.json({ resultat: "nouvelle tentative" }, { status: 500 });
    }

    // Erreur définitive ou dernière tentative : on enregistre l'échec et on prévient l'auteur
    const message = messageErreurIA(erreur);

    await supabase
      .from("fiches")
      .update({ statut: "erreur", message_erreur: message })
      .eq("id", fiche.id);

    await notifier(supabase, fiche, "erreur", message);

    return Response.json({ resultat: "erreur" });
  }
}

export const POST = verifySignatureAppRouter(traiter);
