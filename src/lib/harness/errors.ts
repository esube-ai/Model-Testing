import { redact } from "./redact";

export type HarnessErrorCode =
  | "auth"
  | "bad_url"
  | "rate_limit"
  | "timeout"
  | "model_not_found"
  | "network"
  | "bad_format"
  | "server_error"
  | "bad_request"
  | "response_too_large"
  | "host_not_allowed"
  | "invalid_input"
  | "cancelled";

/** Which connection field is most likely wrong, so the UI can point at it. */
export type ConnectionField = "baseUrl" | "apiKey" | "format" | "model";

const USER_MESSAGES: Record<HarnessErrorCode, string> = {
  auth: "The API key was not accepted. Check that it is correct and still active.",
  bad_url: "Couldn't find the model API at that address. Check the API base URL.",
  rate_limit: "The model is busy right now, please try again in a minute.",
  timeout: "The model took too long to respond. Please try again.",
  model_not_found: "That model name wasn't recognised by the provider. Check the model name.",
  network: "Couldn't reach the model server. Check the API base URL and your internet connection.",
  bad_format:
    "The server replied in an unexpected format. Check that the API format (OpenAI-compatible or Anthropic) matches your provider.",
  server_error: "The model service is having trouble right now. Please try again in a minute.",
  bad_request: "The provider rejected the request. Try different chat settings or check the model name.",
  response_too_large: "The response was too large to handle.",
  host_not_allowed: "This app is set up to only allow certain model hosts, and this address isn't one of them.",
  invalid_input: "Some connection details are missing or invalid.",
  cancelled: "Stopped.",
};

const FIELDS: Partial<Record<HarnessErrorCode, ConnectionField>> = {
  auth: "apiKey",
  bad_url: "baseUrl",
  network: "baseUrl",
  host_not_allowed: "baseUrl",
  model_not_found: "model",
  bad_format: "format",
};

export interface HarnessErrorJSON {
  code: HarnessErrorCode;
  message: string;
  detail: string;
  field?: ConnectionField;
  status?: number;
}

export class HarnessError extends Error {
  readonly code: HarnessErrorCode;
  /** Technical detail for debugging. Always redacted. */
  readonly detail: string;
  readonly field?: ConnectionField;
  readonly status?: number;

  constructor(code: HarnessErrorCode, detail: string, opts: { apiKey?: string; status?: number; message?: string } = {}) {
    super(opts.message ?? USER_MESSAGES[code]);
    this.name = "HarnessError";
    this.code = code;
    this.detail = redact(detail, opts.apiKey);
    this.field = FIELDS[code];
    this.status = opts.status;
  }

  toJSON(): HarnessErrorJSON {
    return { code: this.code, message: this.message, detail: this.detail, field: this.field, status: this.status };
  }
}

export function isHarnessError(e: unknown): e is HarnessError {
  return e instanceof HarnessError;
}

/** Map an HTTP error status + body text from the provider to a typed error. */
export function errorFromStatus(status: number, body: string, apiKey: string): HarnessError {
  const snippet = body.slice(0, 500);
  const detail = `Provider responded with HTTP ${status}: ${snippet || "(empty body)"}`;
  const mentionsModel = /model/i.test(body);
  if (status === 401 || status === 403) return new HarnessError("auth", detail, { apiKey, status });
  if (status === 404) {
    return new HarnessError(mentionsModel ? "model_not_found" : "bad_url", detail, { apiKey, status });
  }
  if (status === 405) return new HarnessError("bad_url", detail, { apiKey, status });
  if (status === 429) return new HarnessError("rate_limit", detail, { apiKey, status });
  if (status === 408 || status === 504) return new HarnessError("timeout", detail, { apiKey, status });
  if (status >= 500) return new HarnessError("server_error", detail, { apiKey, status });
  if (status === 400 || status === 422) {
    if (mentionsModel && /not.?found|does not exist|unknown|invalid model|no such/i.test(body)) {
      return new HarnessError("model_not_found", detail, { apiKey, status });
    }
    return new HarnessError("bad_request", detail, { apiKey, status });
  }
  if (status === 413) return new HarnessError("bad_request", detail, { apiKey, status, message: "The conversation is too long for this model. Start a new chat." });
  return new HarnessError("bad_request", detail, { apiKey, status });
}
