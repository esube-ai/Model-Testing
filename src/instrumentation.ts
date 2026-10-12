import { ALLOWED_HOSTS_WARNING, getAllowedHosts } from "@/lib/harness/security";

/** Runs once when the server starts. */
export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs" && !getAllowedHosts()) console.warn(ALLOWED_HOSTS_WARNING);
}
