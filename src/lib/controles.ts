import "server-only";
import type { Controle } from "@/lib/statut";
import { creerClientAdmin } from "@/lib/supabase/admin";

import { redis } from "@/lib/limitation";

const controleVercel: Controle = {
  service: "Vercel",
  description: "Hébergement et fonctions serverless",
  verifier: async () => {
    const environnement = process.env.VERCEL_ENV ?? "local";
    const region = process.env.VERCEL_REGION ?? "poste du développeur";
    const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "aucun";
    return `Environnement : ${environnement} · Région : ${region} · Commit : ${commit}`;
  },
};

const controleIA: Controle = {
  service: "Modèle d'IA",
  description: "Génération des fiches (API compatible OpenAI)",
  verifier: async () => {
    const baseUrl = process.env.AI_BASE_URL;
    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL;

    if (!baseUrl || !apiKey || !model) {
      throw new Error("Variables AI_BASE_URL, AI_API_KEY ou AI_MODEL manquantes");
    }

    const reponse = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!reponse.ok) {
      throw new Error(`L'API a répondu avec le statut ${reponse.status}`);
    }

    const donnees = await reponse.json();
    const modeleDisponible = donnees.data?.some(
      (m: { id: string }) => m.id === model
    );

    if (!modeleDisponible) {
      throw new Error(`Le modèle ${model} n'est pas disponible chez ce fournisseur`);
    }

    return `Modèle ${model} disponible sur ${new URL(baseUrl).host}`;
  },
};

const controleBase: Controle = {
  service: "Supabase Database",
  description: "Base de données des fiches",
  verifier: async () => {
    const supabase = creerClientAdmin();
    const { count, error } = await supabase
      .from("fiches")
      .select("id", { count: "exact", head: true });

    if (error) {
      throw new Error(error.message);
    }

    return `${count ?? 0} fiche(s) enregistrée(s)`;
  },
};

const controleAuth: Controle = {
  service: "Supabase Auth",
  description: "Connexion des utilisateurs",
  verifier: async () => {
    const supabase = creerClientAdmin();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (error) {
      throw new Error(error.message);
    }

    return "Service d'authentification joignable";
  },
};

const controleStockage: Controle = {
  service: "Supabase Storage",
  description: "Stockage des cours en PDF",
  verifier: async () => {
    const supabase = creerClientAdmin();
    const { data, error } = await supabase.storage.getBucket("cours");

    if (error || !data) {
      throw new Error(error?.message ?? "Bucket « cours » introuvable");
    }

    if (data.public) {
      throw new Error("Le bucket « cours » est public : les cours sont exposés à tous");
    }

    const limiteMo = data.file_size_limit
      ? `${Math.round(data.file_size_limit / 1024 / 1024)} Mo`
      : "aucune";

    return `Bucket « cours » privé · Taille maximale : ${limiteMo}`;
  },
};

const controleRedis: Controle = {
  service: "Upstash Redis",
  description: "Limitation du nombre de générations",
  verifier: async () => {
    const reponse = await redis.ping();

    if (reponse !== "PONG") {
      throw new Error(`Réponse inattendue : ${reponse}`);
    }

    const nombreCles = await redis.dbsize();
    return `Base joignable · ${nombreCles} clé(s) en mémoire`;
  },
};

export const CONTROLES: Controle[] = [
  controleVercel,
  controleIA,
  controleBase,
  controleAuth,
  controleStockage,
  controleRedis,
];
