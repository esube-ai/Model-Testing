import { testConnection } from "@/lib/harness";
import { safeLog } from "@/lib/harness/redact";
import { errorResponse, keyOf, parseConnection, readBody } from "@/lib/server/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { connection } -> { ok: true, latencyMs, model } | { ok: false, error } */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> | undefined;
  try {
    body = await readBody(request);
    const connection = parseConnection(body);
    const result = await testConnection(connection, { signal: request.signal });
    if (!result.ok) safeLog("warn", connection.apiKey, `[api/test-connection] ${result.error.code}: ${result.error.detail}`);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e, keyOf(body), "api/test-connection");
  }
}
