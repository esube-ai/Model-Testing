import { embed, HarnessError } from "@/lib/harness";
import { errorResponse, keyOf, parseConnection, readBody } from "@/lib/server/api";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INPUTS = 256;
const MAX_INPUT_CHARS = 8000;

/** POST { connection, model, inputs: string[] } -> { vectors: number[][] } */
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> | undefined;
  try {
    body = await readBody(request);
    const connection = parseConnection(body);
    const model = typeof body.model === "string" ? body.model : "";
    const inputs = body.inputs;
    if (
      !Array.isArray(inputs) ||
      inputs.length === 0 ||
      inputs.length > MAX_INPUTS ||
      !inputs.every((s) => typeof s === "string" && s.length > 0 && s.length <= MAX_INPUT_CHARS)
    ) {
      throw new HarnessError("invalid_input", `inputs must be 1-${MAX_INPUTS} non-empty strings of at most ${MAX_INPUT_CHARS} characters.`);
    }
    const vectors = await embed(connection, model, inputs as string[], { signal: request.signal });
    return Response.json({ vectors }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e, keyOf(body), "api/embeddings");
  }
}
