import "server-only";
import { Resend } from "resend";

const EXPEDITEUR = "Fiches de révision <onboarding@resend.dev>";

// Remplace les caractères spéciaux HTML : une donnée saisie par l'utilisateur
// ne doit jamais pouvoir injecter de balises dans l'e-mail
function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Notification = {
  destinataire: string;
  ficheId: string;
  titre: string;
  statut: "prete" | "erreur";
  messageErreur?: string;
};

export async function envoyerNotification(notification: Notification) {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) {
    throw new Error("La variable RESEND_API_KEY n'est pas définie.");
  }

  const resend = new Resend(cle);
  const lien = `${process.env.APP_URL}/fiches/${notification.ficheId}`;
  const titreHtml = echapperHtml(notification.titre);

  const prete = notification.statut === "prete";

  const sujet = prete
    ? `Votre fiche « ${notification.titre} » est prête`
    : `La génération de votre fiche « ${notification.titre} » a échoué`;

  const html = prete
    ? `<p>Bonjour,</p>
       <p>Votre fiche de révision <strong>${titreHtml}</strong> est prête.</p>
       <p><a href="${lien}">Consulter la fiche</a></p>`
    : `<p>Bonjour,</p>
       <p>La génération de votre fiche <strong>${titreHtml}</strong> a échoué :
       ${echapperHtml(notification.messageErreur ?? "erreur inconnue")}.</p>
       <p>Vous pouvez réessayer depuis l'application.</p>`;

  const texte = prete
    ? `Votre fiche de révision « ${notification.titre} » est prête : ${lien}`
    : `La génération de votre fiche « ${notification.titre} » a échoué. Vous pouvez réessayer depuis l'application.`;

  const { error } = await resend.emails.send({
    from: EXPEDITEUR,
    to: [notification.destinataire],
    subject: sujet,
    html,
    text: texte,
  });

  if (error) {
    throw new Error(`Envoi refusé par Resend : ${error.message}`);
  }
}
