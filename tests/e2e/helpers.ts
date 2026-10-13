import { expect, type Page } from "@playwright/test";
import { VALID_KEY } from "../mock/provider";

export const MOCK_URL = "http://127.0.0.1:4011";
export const BAD_KEY = "sk-wrong-key-0000111122223333";

export function connectionDialog(page: Page) {
  return page.getByTestId("connection-dialog");
}

export interface ConnOpts {
  name?: string;
  key?: string;
  model?: string;
  format?: "openai" | "anthropic";
  remember?: boolean;
  /** Test then Save (default), or "Save anyway" without testing. */
  test?: boolean;
}

/** Fill the connection form that is currently open. */
export async function fillConnection(page: Page, { name, key = VALID_KEY, model = "mock-model", format = "openai", remember = false }: ConnOpts = {}) {
  const d = connectionDialog(page);
  if (name) await d.getByLabel("Name (optional)").fill(name);
  await d.getByLabel("API base URL").fill(format === "openai" ? `${MOCK_URL}/v1` : MOCK_URL);
  await d.getByLabel("API key", { exact: true }).fill(key);
  if (format === "anthropic") await d.getByLabel("API format").selectOption("anthropic");
  await d.getByLabel("Model name").fill(model);
  if (remember) await d.getByLabel("Remember on this device").check();
}

export async function saveConnection(page: Page, test = true) {
  const d = connectionDialog(page);
  if (test) {
    await d.getByRole("button", { name: "Test connection" }).click();
    await expect(d.getByText("Connected!")).toBeVisible();
    await d.getByRole("button", { name: "Save", exact: true }).click();
  } else {
    await d.getByRole("button", { name: "Save anyway" }).click();
  }
}

/** First launch: complete onboarding with one connection. */
export async function connect(page: Page, opts: ConnOpts = {}) {
  await page.goto("/");
  await expect(connectionDialog(page)).toBeVisible();
  await fillConnection(page, opts);
  await saveConnection(page, opts.test ?? true);
  await expect(connectionDialog(page)).toBeHidden();
}

/** Add another connection through the model picker's "Manage connections…". */
export async function addConnection(page: Page, opts: ConnOpts) {
  await page.getByTestId("model-picker").click();
  await page.getByRole("menuitem", { name: "Manage connections…" }).click();
  await connectionDialog(page).getByRole("button", { name: "Add connection" }).click();
  await fillConnection(page, opts);
  await saveConnection(page, opts.test ?? true);
  await page.getByRole("button", { name: "Close Connections" }).click();
  await expect(connectionDialog(page)).toBeHidden();
}

export function composer(page: Page) {
  return page.getByLabel("Message", { exact: true });
}

export async function sendMessage(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

/** Wait until no reply is streaming. */
export async function waitIdle(page: Page) {
  await expect(page.getByRole("button", { name: "Stop" })).toBeHidden({ timeout: 20_000 });
}

export async function ask(page: Page, text: string) {
  await sendMessage(page, text);
  await waitIdle(page);
  return page.getByTestId("assistant-message").last();
}

export async function storageDump(page: Page) {
  return page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
}

/** Sidebar chat actions live in each chat's "…" menu. */
export async function chatMenu(page: Page, title: string, action: string | RegExp) {
  await page.getByRole("button", { name: `More options for "${title}"` }).first().click();
  await page.getByRole("menuitem", { name: action }).click();
}

/** A 1x1 PNG. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
