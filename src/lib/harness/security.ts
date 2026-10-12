import { HarnessError } from "./errors";
import type { ApiFormat, Connection } from "./types";

/** Max bytes read from any single provider response (body or whole stream). */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Parse ALLOWED_API_HOSTS. Read on every call; returns null when unset (all hosts allowed). */
export function getAllowedHosts(): string[] | null {
  const raw = process.env.ALLOWED_API_HOSTS?.trim();
  if (!raw) return null;
  const hosts = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length ? hosts : null;
}

export const ALLOWED_HOSTS_WARNING =
  "[model-testing] ALLOWED_API_HOSTS is not set, so this server will forward requests to any host a user enters. " +
  "Set ALLOWED_API_HOSTS (comma-separated) for shared deployments.";

/** Known endpoint suffixes users sometimes paste as part of the base URL. */
const ENDPOINT_SUFFIXES = /\/(chat\/completions|messages|models|embeddings)\/?$/i;

/**
 * Validate a user-supplied base URL and return a normalized form (no trailing slash,
 * known endpoint suffixes removed). Throws HarnessError on invalid or disallowed input.
 */
export function normalizeBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new HarnessError("invalid_input", "API base URL is not a valid URL.", {
      message: "The API base URL isn't a valid web address. It should start with https://",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HarnessError("invalid_input", `Unsupported URL scheme "${url.protocol}". Only http and https are allowed.`, {
      message: "The API base URL must start with http:// or https://",
    });
  }
  if (url.username || url.password) {
    throw new HarnessError("invalid_input", "URLs containing a username or password are not allowed.", {
      message: "Remove the username/password from the API base URL and put the key in the API key field.",
    });
  }
  const allowed = getAllowedHosts();
  if (allowed && !allowed.includes(url.hostname.toLowerCase()) && !allowed.includes(url.host.toLowerCase())) {
    throw new HarnessError("host_not_allowed", `Host "${url.host}" is not in ALLOWED_API_HOSTS (${allowed.join(", ")}).`, {
      message: `This app only allows these model hosts: ${allowed.join(", ")}. Ask whoever runs it to add "${url.hostname}".`,
    });
  }
  if (isHostedDeployment() && isPrivateHost(url.hostname)) {
    throw new HarnessError("host_not_allowed", `Host "${url.host}" is a local or private-network address, which is blocked on hosted deployments.`, {
      message: "This app is running online, so it can't reach local or private-network addresses (like localhost). Use your provider's public API address.",
    });
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "").replace(ENDPOINT_SUFFIXES, "").replace(/\/+$/, "");
  return url;
}

/** True when running on Vercel, where the server is reachable by anyone with the URL. */
export function isHostedDeployment(): boolean {
  return !!process.env.VERCEL;
}

/**
 * Literal loopback, private (RFC 1918 / unique-local), link-local and unspecified addresses,
 * plus localhost names. Only checks the address as written: hostnames that resolve to
 * private IPs are not caught, which is why ALLOWED_API_HOSTS is recommended.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(":")) {
    if (h === "::" || h === "::1") return true;
    if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true;
    const mapped = /^::ffff:(.+)$/.exec(h);
    if (mapped) return mapped[1].includes(".") ? isPrivateHost(mapped[1]) : true;
  }
  return false;
}

export type Endpoint = "chat" | "models" | "embeddings";

/**
 * Build the provider URL for one of the fixed endpoints. These are the only paths the
 * server ever forwards to.
 *  - OpenAI-compatible: {base}/chat/completions, {base}/models, {base}/embeddings
 *    (base usually ends in /v1)
 *  - Anthropic:         {base}/v1/messages, {base}/v1/models     (/v1 added if missing)
 */
export function buildEndpoint(connection: Pick<Connection, "baseUrl" | "format">, endpoint: Endpoint): string {
  const base = normalizeBaseUrl(connection.baseUrl);
  const path = base.pathname.replace(/\/+$/, "");
  const suffix = endpointSuffix(connection.format, endpoint);
  if (connection.format === "anthropic") {
    const withV1 = /\/v1$/i.test(path) ? path : `${path}/v1`;
    base.pathname = `${withV1}${suffix}`;
  } else {
    base.pathname = `${path}${suffix}`;
  }
  return base.toString();
}

function endpointSuffix(format: ApiFormat, endpoint: Endpoint): string {
  if (endpoint === "models") return "/models";
  if (endpoint === "embeddings") return "/embeddings";
  return format === "anthropic" ? "/messages" : "/chat/completions";
}

/** Validate the shape of a connection received from the browser. */
export function validateConnection(input: unknown): Connection {
  const c = (input ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
  const baseUrl = str(c.baseUrl, 2048);
  const apiKey = str(c.apiKey ?? "", 4096);
  const model = str(c.model ?? "", 256);
  const format = c.format === "anthropic" ? "anthropic" : c.format === "openai" ? "openai" : null;
  if (!baseUrl) throw new HarnessError("invalid_input", "baseUrl missing.", { message: "The API base URL is missing." });
  if (apiKey === null) throw new HarnessError("invalid_input", "apiKey invalid.", { message: "The API key is invalid." });
  if (model === null) throw new HarnessError("invalid_input", "model invalid.", { message: "The model name is invalid." });
  if (!format) throw new HarnessError("invalid_input", "format must be 'openai' or 'anthropic'.", { message: "Choose an API format." });
  normalizeBaseUrl(baseUrl);
  return { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(), format };
}
