export const REDACTED = "[REDACTED]";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove an API key from text. Also removes partially-masked echoes such as
 * "sk-abc1****wxyz" that some providers include in auth error messages, and
 * anything that looks like an Authorization / x-api-key header value.
 */
export function redact(text: string, apiKey?: string): string {
  let out = text;
  const key = apiKey?.trim();
  if (key) {
    out = out.split(key).join(REDACTED);
    if (key.length >= 12) {
      // Prefix of the key followed by more non-space characters (masked echoes).
      out = out.replace(new RegExp(escapeRegExp(key.slice(0, 6)) + "\\S*", "g"), REDACTED);
      // Suffix of the key preceded by mask characters.
      out = out.replace(new RegExp("\\S*" + escapeRegExp(key.slice(-6)), "g"), REDACTED);
    }
  }
  out = out.replace(/(authorization["']?\s*[:=]\s*["']?(?:bearer\s+)?)[^\s"',}]+/gi, `$1${REDACTED}`);
  out = out.replace(/(x-api-key["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, `$1${REDACTED}`);
  out = out.replace(/(api key provided:\s*)\S+/gi, `$1${REDACTED}`);
  return out;
}

/** Log through console with the key removed. The only logger the server uses. */
export function safeLog(level: "warn" | "error" | "info", apiKey: string | undefined, ...parts: unknown[]): void {
  const text = parts.map((p) => (typeof p === "string" ? p : safeStringify(p))).join(" ");
  console[level](redact(text, apiKey));
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
