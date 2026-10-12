import { listModels } from "@/lib/harness";
import { errorResponse, keyOf, parseConnection, readBody } from "@/lib/server/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { connection } -> { models: string[] | null } (null = provider has no model list) */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> | undefined;
  try {
    body = await readBody(request);
    const models = await listModels(parseConnection(body), { signal: request.signal });
    return Response.json({ models }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e, keyOf(body), "api/models");
  }
}
