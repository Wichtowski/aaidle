import { database } from "../../../lib/db/client";
export async function GET() {
  const DB = database();
  const models = (
    await DB.prepare(
      `SELECT m.id,m.name,p.name AS providerName,COALESCE(f.name,'Unknown') AS familyName FROM models m JOIN providers p ON p.id=m.provider_id LEFT JOIN model_families f ON f.id=m.family_id WHERE m.is_guessable=1 AND p.is_active=1 AND m.status IN ('active','preview') ORDER BY m.name`,
    ).all<{ id: string; name: string; providerName: string; familyName: string }>()
  ).results;
  const aliases = (
    await DB.prepare("SELECT model_id,alias FROM model_aliases").all<{
      model_id: string;
      alias: string;
    }>()
  ).results;
  return Response.json(
    {
      models: models.map((model) => ({
        ...model,
        aliases: aliases.filter((alias) => alias.model_id === model.id).map((alias) => alias.alias),
      })),
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
