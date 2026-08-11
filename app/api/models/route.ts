import { publicModelIndex } from "../../../lib/server/model-catalog";
export async function GET() {
  return Response.json(
    { models: publicModelIndex },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
