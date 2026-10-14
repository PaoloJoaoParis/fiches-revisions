import { CONTROLES } from "@/lib/controles";
import { executerControle, type Statut } from "@/lib/statut";

export const dynamic = "force-dynamic";

export async function GET() {
  const services = await Promise.all(CONTROLES.map(executerControle));

  let statutGlobal: Statut = "operationnel";
  if (services.some((s) => s.statut === "degrade")) statutGlobal = "degrade";
  if (services.some((s) => s.statut === "en_panne")) statutGlobal = "en_panne";

  return Response.json({
    verifieLe: new Date().toISOString(),
    statutGlobal,
    services,
  });
}
