import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { VALID_KEY } from "../mock/provider";

const MOCK_URL = "http://127.0.0.1:4011";
const BAD_KEY = "sk-wrong-key-0000111122223333";

function dialog(page: Page) {
  return page.getByRole("dialog", { name: "Connection" });
}

async function fillConnection(page: Page, { key = VALID_KEY, model = "mock-model", remember = false } = {}) {
  const d = dialog(page);
  await d.getByLabel("API base URL").fill(`${MOCK_URL}/v1`);
  await d.getByLabel("API key", { exact: true }).fill(key);
  await d.getByLabel("Model name").fill(model);
  if (remember) await d.getByLabel("Remember on this device").check();
}

async function connect(page: Page, opts: { remember?: boolean } = {}) {
  await page.goto("/");
  await expect(dialog(page)).toBeVisible();
  await fillConnection(page, opts);
  await dialog(page).getByRole("button", { name: "Test connection" }).click();
  await expect(dialog(page).getByText("Connected!")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
}

async function sendMessage(page: Page, text: string) {
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.getByLabel("Message", { exact: true }).press("Enter");
}

async function storageDump(page: Page) {
  return page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
}

test("onboarding: bad key error, good key saves, streaming chat, stop, new chat", async ({ page }) => {
  await page.goto("/");
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  // Inline URL validation
  await d.getByLabel("API base URL").fill("ftp://nope");
  await d.getByLabel("API base URL").blur();
  await expect(d.getByText("Enter a web address starting with https://")).toBeVisible();

  // Bad key -> friendly error naming the field
  await fillConnection(page, { key: BAD_KEY });
  await d.getByRole("button", { name: "Test connection" }).click();
  const error = d.getByTestId("connection-error");
  await expect(error).toContainText("The API key was not accepted");
  await expect(error).toContainText("Likely problem: the API key field");
  await expect(error).not.toContainText(BAD_KEY);
  await expect(d.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  // Good key -> load models, test green, save
  await d.getByLabel("API key", { exact: true }).fill(VALID_KEY);
  await d.getByRole("button", { name: "Load models" }).click();
  await expect(d.getByLabel("Model name")).toHaveValue("mock-model");
  await d.getByRole("button", { name: "Test connection" }).click();
  await expect(d.getByText("Connected!")).toBeVisible();
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d).toBeHidden();

  await expect(page.getByTestId("connection-label")).toHaveText("mock-model · 127.0.0.1:4011");
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "ok");
  await expect(page.locator("header")).not.toContainText(VALID_KEY);

  // Streamed reply
  await sendMessage(page, "Hello there");
  await expect(page.getByTestId("user-message").last()).toContainText("Hello there");
  await expect(page.getByTestId("assistant-message").last()).toContainText("Hello! You said: Hello there");

  // Long reply: see it streaming, then stop it
  await sendMessage(page, "tell me a long story");
  const reply = page.getByTestId("assistant-message").last();
  await expect(reply).toContainText("word3");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(reply).toContainText("Stopped early.");
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
  const stoppedText = await reply.textContent();
  expect(stoppedText).not.toContain("word199");
  await page.waitForTimeout(500);
  expect(await reply.textContent()).toBe(stoppedText); // nothing more arrives after Stop

  // New chat
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByText("What would you like to try?")).toBeVisible();
  await expect(page.getByTestId("conversation-list").getByRole("listitem")).toHaveCount(2);
});

test("conversations persist; key is forgotten when Remember is off", async ({ page, context }) => {
  await connect(page, { remember: false });
  await sendMessage(page, "Remember this chat");
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Remember this chat");

  // A reload in the same tab keeps the session.
  await page.reload();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Remember this chat");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(VALID_KEY);

  // Closing the tab and opening the app again: chats remain, key is gone.
  await page.close();
  const next = await context.newPage();
  await next.goto("/");
  await expect(dialog(next)).toBeVisible();
  await expect(next.getByTestId("conversation-list")).toContainText("Remember this chat");
  expect(await storageDump(next)).not.toContain(VALID_KEY);
});

test("key is kept when Remember is on", async ({ page, context }) => {
  await connect(page, { remember: true });
  await sendMessage(page, "Keep me");
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Keep me");

  await page.close();
  const next = await context.newPage();
  await next.goto("/");
  await expect(next.getByTestId("connection-label")).toHaveText("mock-model · 127.0.0.1:4011");
  await expect(dialog(next)).toBeHidden();
  expect(await next.evaluate(() => localStorage.getItem("model-testing.connection"))).toContain(VALID_KEY);
  await expect(next.getByTestId("conversation-list")).toContainText("Keep me");
});

test("Clear saved connection removes the key and reopens the dialog", async ({ page }) => {
  await connect(page, { remember: true });
  await page.getByRole("button", { name: "Connection settings", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Clear saved connection" }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel("API key", { exact: true })).toHaveValue("");
  await expect(dialog(page).getByRole("button", { name: "Close connection settings" })).toHaveCount(0);
  expect(await storageDump(page)).not.toContain(VALID_KEY);
  await page.reload();
  await expect(dialog(page)).toBeVisible();
});

test("exports include feedback and settings but never the key", async ({ page }) => {
  await connect(page, { remember: true });
  await page.getByRole("button", { name: "Chat settings" }).click();
  await page.getByLabel("System prompt").fill("Be brief.");
  await page.getByLabel("Temperature").fill("0.3");
  await sendMessage(page, "Export me");
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Export me");
  await page.getByRole("button", { name: "Good response" }).click();

  for (const [label, ext] of [["Export as JSON", "json"], ["Export as Markdown", "md"]] as const) {
    await page.getByLabel("Export conversation").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: label }).click()]);
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
  await page.goto("/");
  await fillConnection(page, { model: "missing-model" });
  await dialog(page).getByRole("button", { name: "Save anyway" }).click();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "unknown");

  await page.getByRole("button", { name: /Explain what a large language model is/ }).click();
  const err = page.getByTestId("error-message");
  await expect(err).toContainText("That model name wasn't recognised");
  await expect(err.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-status", "error");
  await err.getByRole("button", { name: "Open connection settings" }).click();
  await expect(dialog(page)).toBeVisible();

  // Fix the model and retry
  await dialog(page).getByLabel("Model name").fill("mock-model");
  await dialog(page).getByRole("button", { name: "Save anyway" }).click();
  await page.getByTestId("error-message").getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Explain what a large language model is");
});

test("works at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await connect(page);
  await sendMessage(page, "Small screen");
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Small screen");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole("button", { name: "Open conversations" }).click();
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
});

test("renders rich output: tables, math, diagrams, SVG, images, HTML — and blocks scripts", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) cspViolations.push(msg.text());
  });
  await connect(page);
  await sendMessage(page, "show me the rich demo");
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
  const reply = page.getByTestId("assistant-message").last();

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

  // Graphic code toggle
  await reply.getByTestId("graphic").first().getByRole("button", { name: "Show code" }).click();
  await expect(reply.getByTestId("graphic").first()).toContainText("A[Start] --> B[Finish]");

  await expect(reply.getByText("bad link")).toBeVisible();
  await expect(reply.getByRole("link", { name: "bad link" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await reply.innerHTML()).not.toMatch(/onerror|<script|javascript:/i);
  expect(cspViolations).toEqual([]);
});

test("reasoning models: shows reasoning and keeps working on later turns", async ({ page }) => {
  await page.goto("/");
  await fillConnection(page, { model: "reasoning-model" });
  await dialog(page).getByRole("button", { name: "Test connection" }).click();
  await expect(dialog(page).getByText("Connected!")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();

  await sendMessage(page, "first question");
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: first question");
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
  const reasoning = page.getByTestId("reasoning").last();
  await reasoning.getByText("Reasoning").click();
  await expect(reasoning).toContainText("Thinking about: first question.");

  // The second turn is the one that failed before: the provider requires the earlier reasoning.
  await sendMessage(page, "second question");
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: second question");
  await expect(page.getByTestId("error-message")).toHaveCount(0);

  // Reasoning survives a reload, so the third turn still works.
  await page.reload();
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden();
  await sendMessage(page, "third question");
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: third question");
  await expect(page.getByTestId("error-message")).toHaveCount(0);
});

test("sends security headers", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("connect-src 'self'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
});
