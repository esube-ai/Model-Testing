import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { VALID_KEY } from "../mock/provider";
import { ask, BAD_KEY, chatMenu, composer, connect, connectionDialog, fillConnection, saveConnection, sendMessage, storageDump } from "./helpers";

test("onboarding: bad key error, good key saves, streaming chat, stop, new chat", async ({ page }) => {
  await page.goto("/");
  const d = connectionDialog(page);
  await expect(d.getByRole("heading", { name: "Connect a model" })).toBeVisible();
  await expect(d.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(d.getByRole("button", { name: /^Close/ })).toHaveCount(0);

  // Inline URL validation
  await d.getByLabel("API base URL").fill("ftp://nope");
  await d.getByLabel("API base URL").blur();
  await expect(d.getByText("Enter a web address starting with https://")).toBeVisible();

  // Bad key -> friendly error naming the field, never the key
  await fillConnection(page, { key: BAD_KEY });
  await d.getByRole("button", { name: "Test connection" }).click();
  const error = d.getByTestId("connection-error");
  await expect(error).toContainText("The API key was not accepted");
  await expect(error).toContainText("Likely problem: the API key field");
  await expect(error).not.toContainText(BAD_KEY);
  await expect(d.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  // Good key -> load models, test green, save
  await d.getByLabel("API key", { exact: true }).fill(VALID_KEY);
  await d.getByLabel("Model name").fill("");
  await d.getByRole("button", { name: "Load models" }).click();
  await expect(d.getByRole("checkbox", { name: "mock-model", exact: true })).toBeChecked();
  await d.getByRole("button", { name: "Test connection" }).click();
  await expect(d.getByText("Connected!")).toBeVisible();
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d).toBeHidden();

  await expect(page.getByTestId("model-picker")).toContainText("mock-model");
  await expect(page.locator("body")).not.toContainText(VALID_KEY);

  // Streamed reply
  const reply = await ask(page, "Hello there");
  await expect(page.getByTestId("user-message").last()).toContainText("Hello there");
  await expect(reply).toContainText("Hello! You said: Hello there");
  await expect(page.getByTestId("chat-title")).toHaveText("Hello there");

  // Long reply: see it streaming, then stop it
  await sendMessage(page, "tell me a long story");
  const long = page.getByTestId("assistant-message").last();
  await expect(long).toContainText("word3");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(long).toContainText("Stopped early.");
  const stoppedText = await long.textContent();
  expect(stoppedText).not.toContain("word199");
  await page.waitForTimeout(500);
  expect(await long.textContent()).toBe(stoppedText);

  // New chat
  await page.getByRole("navigation").getByRole("button", { name: "New chat" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good|Working late/);
  await expect(page.getByTestId("conversation-list").getByRole("listitem")).toHaveCount(2);
});

test("conversations persist; key is forgotten when Remember is off", async ({ page, context }) => {
  await connect(page);
  await ask(page, "Remember this chat");

  await page.reload();
  await expect(connectionDialog(page)).toBeHidden();
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Remember this chat");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(VALID_KEY);

  // Closing the tab and opening the app again: chats remain, key is gone.
  await page.close();
  const next = await context.newPage();
  await next.goto("/");
  await expect(connectionDialog(next)).toBeVisible();
  await expect(next.getByTestId("conversation-list")).toContainText("Remember this chat");
  expect(await storageDump(next)).not.toContain(VALID_KEY);
});

test("key is kept when Remember is on, and an old single connection is migrated", async ({ page, context }) => {
  await connect(page, { remember: true });
  await ask(page, "Keep me");
  await page.close();
  const next = await context.newPage();
  await next.goto("/");
  await expect(next.getByTestId("model-picker")).toContainText("mock-model");
  await expect(connectionDialog(next)).toBeHidden();
  expect(await next.evaluate(() => localStorage.getItem("model-testing.connections"))).toContain(VALID_KEY);

  // A connection saved by the previous version of the app is converted automatically.
  await next.evaluate(
    ([key]) => {
      localStorage.clear();
      localStorage.setItem("model-testing.connection", JSON.stringify({ baseUrl: "http://127.0.0.1:4011/v1", apiKey: key, format: "openai", model: "mock-model" }));
    },
    [VALID_KEY],
  );
  await next.reload();
  await expect(connectionDialog(next)).toBeHidden();
  await expect(next.getByTestId("model-picker")).toContainText("mock-model");
  await expect(await ask(next, "Migrated?")).toContainText("You said: Migrated?");
});

test("Clear saved connections removes every key and reopens onboarding", async ({ page }) => {
  await connect(page, { remember: true });
  await page.getByRole("navigation").getByRole("button", { name: "Connections" }).click();
  await connectionDialog(page).getByRole("button", { name: "Clear saved connections" }).click();
  await expect(connectionDialog(page).getByRole("heading", { name: "Connect a model" })).toBeVisible();
  await expect(connectionDialog(page).getByLabel("API key", { exact: true })).toHaveValue("");
  expect(await storageDump(page)).not.toContain(VALID_KEY);
  await page.reload();
  await expect(connectionDialog(page)).toBeVisible();
});

test("exports include feedback and settings but never the key", async ({ page }) => {
  await connect(page, { remember: true });
  await page.getByRole("button", { name: "Chat settings" }).click();
  await page.getByLabel("System prompt").fill("Be brief.");
  await page.getByLabel("Temperature").fill("0.3");
  await page.getByRole("button", { name: "Close Chat settings" }).click();
  await ask(page, "Export me");
  await page.getByRole("button", { name: "Good response" }).click();

  for (const [label, ext] of [["Export as JSON", "json"], ["Export as Markdown", "md"]] as const) {
    await page.getByRole("button", { name: "Export conversation" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: label }).click()]);
    expect(download.suggestedFilename()).toBe(`Export-me.${ext}`);
    const content = await readFile((await download.path())!, "utf8");
    expect(content).not.toContain(VALID_KEY);
    expect(content).toContain("mock-model");
    expect(content).toContain("127.0.0.1:4011");
    expect(content).toContain("Be brief.");
    if (ext === "json") {
      const json = JSON.parse(content);
      expect(json.chatSettings).toEqual({ systemPrompt: "Be brief.", temperature: 0.3, maxTokens: null });
      expect(json.messages[1]).toMatchObject({ role: "assistant", feedback: "up", model: "mock-model" });
      expect(json.messages[0].createdAt).toBeTruthy();
    } else {
      expect(content).toContain("thumbs up");
    }
  }
});

test("errors show in the thread with Retry and a link to connection settings", async ({ page }) => {
  await connect(page, { model: "missing-model", test: false });
  await page.getByRole("button", { name: /Explain what a large language model is/ }).click();
  const err = page.getByTestId("error-message");
  await expect(err).toContainText("That model name wasn't recognised");
  await expect(err.getByRole("button", { name: "Retry" })).toBeVisible();
  await err.getByRole("button", { name: "Open connection settings" }).click();

  // The connection's own form opens; swap the model and retry.
  const d = connectionDialog(page);
  await d.getByRole("button", { name: "Remove model missing-model" }).click();
  await d.getByLabel("Model name").fill("mock-model");
  await saveConnection(page);
  await expect(d).toBeHidden();
  await page.getByTestId("model-picker").click();
  await page.getByRole("menuitemradio", { name: "mock-model" }).click();
  await page.getByTestId("error-message").getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Explain what a large language model is");
});

test("works at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await connect(page);
  await expect(await ask(page, "Small screen")).toContainText("You said: Small screen");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole("button", { name: "Open conversations" }).click();
  await expect(page.getByRole("navigation").getByRole("button", { name: "New chat" })).toBeVisible();
  await chatMenu(page, "Small screen", "Pin");
  await expect(page.getByTestId("conversation-list")).toContainText("Pinned");
});

test("renders rich output: tables, math, diagrams, SVG, images, HTML — and blocks scripts", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) cspViolations.push(msg.text());
  });
  await connect(page);
  const reply = await ask(page, "show me the rich demo");

  await expect(reply.getByRole("heading", { name: "Rich demo" })).toBeVisible();
  await expect(reply.getByRole("cell", { name: "Alpha" })).toBeVisible();
  await expect(reply.locator("del")).toHaveText("wrong");
  await expect(reply.getByRole("checkbox")).toHaveCount(2);
  await expect(reply.locator(".katex").first()).toBeVisible();
  await expect(reply.locator(".katex-display")).toBeVisible();
  await expect(reply.getByTestId("mermaid").locator("svg")).toBeVisible({ timeout: 20_000 });
  await expect(reply.getByTestId("mermaid")).toContainText("Finish");

  const svgImage = reply.getByRole("img", { name: "SVG graphic from the model" });
  await expect(svgImage).toBeVisible();
  expect(await svgImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const pixel = reply.getByRole("img", { name: "tiny pixel" });
  expect(await pixel.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1);

  await reply.getByText("Click for more").click();
  await expect(reply.getByText("details", { exact: true })).toBeVisible();

  await reply.getByTestId("graphic").first().getByRole("button", { name: "Show code" }).click();
  await expect(reply.getByTestId("graphic").first()).toContainText("A[Start] --> B[Finish]");

  await expect(reply.getByText("bad link")).toBeVisible();
  await expect(reply.getByRole("link", { name: "bad link" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await reply.innerHTML()).not.toMatch(/onerror|<script|javascript:/i);
  expect(cspViolations).toEqual([]);
});

test("reasoning models: shows reasoning and keeps working on later turns", async ({ page }) => {
  await connect(page, { model: "reasoning-model" });
  await ask(page, "first question");
  const reasoning = page.getByTestId("reasoning").last();
  await reasoning.getByText("Reasoning").click();
  await expect(reasoning).toContainText("Thinking about: first question.");

  // The provider requires the earlier reasoning on later turns.
  await expect(await ask(page, "second question")).toContainText("You said: second question");
  await expect(page.getByTestId("error-message")).toHaveCount(0);

  await page.reload();
  await expect(composer(page)).toBeVisible();
  await expect(await ask(page, "third question")).toContainText("You said: third question");
  await expect(page.getByTestId("error-message")).toHaveCount(0);
});

test("sends security headers, allowing the camera and microphone only for this app", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("connect-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["permissions-policy"]).toBe("camera=(self), microphone=(self), geolocation=()");
  expect(h["x-powered-by"]).toBeUndefined();
});
