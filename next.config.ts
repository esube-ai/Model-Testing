import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. Model output is untrusted, so on top of sanitizing it:
 * - connect-src 'self': the browser can only talk to this app's own server routes,
 *   never to a model provider or anywhere else.
 * - img-src allows any https/data image, because replies may contain images.
 * - 'unsafe-inline' scripts are needed by Next.js hydration without a nonce setup;
 *   'unsafe-eval' only in development (React dev tooling).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: http: data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // Camera (photos) and microphone (dictation) for this app only; nothing else.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
