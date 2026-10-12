import type { Conversation } from "./conversations";

/**
 * Exports contain the conversation, feedback, chat settings, model name, host and
 * timestamps. They are built from an explicit allow-list of fields, so the API key
 * (which is never stored with conversations anyway) cannot end up in them.
 */
export interface ExportContext {
  model: string;
  host: string;
}

export function conversationToJson(c: Conversation, ctx: ExportContext): string {
  return JSON.stringify(
    {
      title: c.title,
      exportedAt: new Date().toISOString(),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      model: ctx.model,
      host: ctx.host,
      chatSettings: {
        systemPrompt: c.settings.systemPrompt,
        temperature: c.settings.temperature,
        maxTokens: c.settings.maxTokens,
      },
      messages: c.messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        ...(m.role === "assistant"
          ? {
              feedback: m.feedback ?? null,
              model: m.model ?? null,
              host: m.host ?? null,
              stopped: m.stopped ?? false,
              reasoning: m.reasoning ?? null,
              usage: m.metadata?.usage ?? null,
              latencyMs: m.metadata?.latencyMs ?? null,
              error: m.error ? m.error.message : null,
            }
          : {}),
      })),
    },
    null,
    2,
  );
}

export function conversationToMarkdown(c: Conversation, ctx: ExportContext): string {
  const s = c.settings;
  const lines = [
    `# ${c.title}`,
    "",
    `- Model: ${ctx.model}`,
    `- Host: ${ctx.host}`,
    `- Created: ${c.createdAt}`,
    `- Exported: ${new Date().toISOString()}`,
    `- System prompt: ${s.systemPrompt ? s.systemPrompt.replace(/\n/g, " ") : "(none)"}`,
    `- Temperature: ${s.temperature ?? "default"}`,
    `- Max tokens: ${s.maxTokens ?? "default"}`,
    "",
  ];
  for (const m of c.messages) {
    if (m.role === "user") {
      lines.push(`## You — ${m.createdAt}`, "", m.content, "");
    } else {
      const meta = [m.model, m.host].filter(Boolean).join(" · ");
      lines.push(`## Assistant${meta ? ` (${meta})` : ""} — ${m.createdAt}`, "");
      if (m.error) lines.push(`> Error: ${m.error.message}`, "");
      else lines.push(m.content, "");
      if (m.stopped) lines.push("_(stopped early)_", "");
      if (m.feedback) lines.push(`Feedback: ${m.feedback === "up" ? "👍 thumbs up" : "👎 thumbs down"}`, "");
    }
  }
  return lines.join("\n");
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title: string): string {
  return title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "conversation";
}
