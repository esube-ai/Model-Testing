import { expect, test } from "@playwright/test";
import { addConnection, ask, chatMenu, composer, connect, PNG, sendMessage, waitIdle } from "./helpers";

test("compare mode: one message, several models side by side, then continue with one", async ({ page }) => {
  await connect(page, { name: "Mock OpenAI" });
  await addConnection(page, { name: "Mock Anthropic", format: "anthropic", model: "mock-model-large" });

  await page.getByTestId("model-picker").click();
  await page.getByRole("menuitemcheckbox", { name: /Compare models/ }).click();
  await page.getByRole("menuitemcheckbox", { name: "mock-model-large" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("model-picker")).toContainText("2 models");

  await sendMessage(page, "Who are you?");
  await waitIdle(page);
  const row = page.getByTestId("compare-row");
  await expect(row.getByTestId("assistant-message")).toHaveCount(2);
  await expect(row.getByRole("article", { name: "Reply from mock-model · Mock OpenAI" })).toContainText("You said: Who are you?");
  await expect(row.getByRole("article", { name: "Reply from mock-model-large · Mock Anthropic" })).toContainText("You said: Who are you?");

  // Rate and regenerate one card without touching the other.
  const second = row.getByRole("article", { name: /mock-model-large/ });
  await second.getByRole("button", { name: "Good response" }).click();
  await expect(second.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true");
  await row.getByRole("article", { name: /Mock OpenAI/ }).getByRole("button", { name: "Regenerate response" }).click();
  await waitIdle(page);
  await expect(second.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true");

  // Continue with one model: back to single replies.
  await second.getByRole("button", { name: "Continue with this model" }).click();
  await expect(page.getByTestId("model-picker")).toContainText("mock-model-large");
  await sendMessage(page, "Just you now");
  await waitIdle(page);
  await expect(page.getByTestId("compare-row")).toHaveCount(1);
  await expect(page.getByTestId("assistant-message").last()).toContainText("You said: Just you now");
  await expect(page.getByTestId("assistant-message").last()).toContainText("mock-model-large · Mock Anthropic");
});

test("pictures: upload, send to the model, and a clear hint when a model can't see images", async ({ page }) => {
  await connect(page);
  await page.getByTestId("file-input").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("image-thumb")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove picture dot.png" }).click();
  await expect(page.getByTestId("image-thumb")).toHaveCount(0);

  await page.getByTestId("file-input").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("image-thumb")).toHaveCount(1);
  const reply = await ask(page, "What is this?");
  await expect(reply).toContainText("You said: What is this? [I see 1 image]");
  await expect(page.getByTestId("user-message").getByTestId("image-thumb")).toHaveCount(1);

  // Pictures stay with the chat after a reload.
  await page.reload();
  await expect(page.getByTestId("user-message").getByTestId("image-thumb").locator("img")).toBeVisible();

  // A text-only model gets a plain-language explanation.
  await page.getByRole("navigation").getByRole("button", { name: "Connections" }).click();
  await page.getByTestId("connection-list").getByRole("button", { name: /^Edit / }).click();
  await page.getByLabel("Model name").fill("text-only");
  await page.getByRole("button", { name: "Save anyway" }).click();
  await page.getByRole("button", { name: "Close Connections" }).click();
  await page.getByTestId("model-picker").click();
  await page.getByRole("menuitemradio", { name: "text-only" }).click();
  await page.getByTestId("file-input").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("image-thumb").last()).toBeVisible();
  await sendMessage(page, "And this?");
  await waitIdle(page);
  await expect(page.getByTestId("error-message")).toContainText("may not accept images");
});

test("camera: take a photo and send it", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "Add files, photos and more" }).click();
  await page.getByRole("menuitem", { name: "Take a photo" }).click();
  const camera = page.getByTestId("camera-dialog");
  await expect(camera.getByRole("button", { name: "Capture" })).toBeEnabled();
  await camera.getByRole("button", { name: "Capture" }).click();
  await camera.getByRole("button", { name: "Retake" }).click();
  await camera.getByRole("button", { name: "Capture" }).click();
  await camera.getByRole("button", { name: "Use photo" }).click();
  await expect(camera).toBeHidden();
  await expect(page.getByTestId("image-thumb")).toHaveCount(1);
  await expect(await ask(page, "Describe the photo")).toContainText("[I see 1 image]");
});

test("voice dictation types what you say", async ({ page }) => {
  // Stand-in for the browser's speech service: "hears" a phrase as soon as it starts.
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "hello from my voice" } }] });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    // Replace both names: Chromium has the standard and the prefixed one.
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      Object.defineProperty(window, name, { value: FakeRecognition, configurable: true, writable: true });
    }
  });
  await connect(page);
  await page.getByRole("button", { name: "Dictate (speech to text)" }).click();
  await expect(composer(page)).toHaveValue("hello from my voice");
  await expect(await ask(page, "hello from my voice")).toContainText("You said: hello from my voice");
});

test("projects: instructions and files shared by the project's chats", async ({ page }) => {
  await connect(page);
  await page.getByRole("navigation").getByRole("button", { name: "Projects" }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Office handbook");
  await page.getByRole("button", { name: "Create project" }).click();
  const view = page.getByTestId("project-view");
  await expect(view.getByLabel("Project name")).toHaveValue("Office handbook");

  await view.getByLabel("Project instructions").fill("Answer like a friendly office manager.");
  await view.getByLabel("Project instructions").blur();
  await view.getByTestId("project-file-input").setInputFiles({ name: "wifi.txt", mimeType: "text/plain", buffer: Buffer.from("The office wifi password is BLUE-CACTUS-77.") });
  await expect(view.getByTestId("attachment")).toContainText("wifi.txt");

  await composer(page).fill("What is the wifi password?");
  await composer(page).press("Enter");
  await waitIdle(page);
  // The chat opens inside the project and uses the project's file.
  await expect(page.getByRole("button", { name: /Office handbook/ })).toBeVisible();
  await expect(page.getByTestId("assistant-message").last()).toContainText("BLUE-CACTUS-77");
  await page.getByTestId("assistant-message").last().getByTestId("sources").getByText(/Sources/).click();
  await expect(page.getByTestId("sources")).toContainText("wifi.txt");

  await page.getByRole("button", { name: /Office handbook/ }).click();
  await expect(page.getByTestId("project-chats")).toContainText("What is the wifi password?");
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "Projects" }).click();
  await expect(page.getByTestId("projects-view")).toContainText("1 chat");
});

test("search, pin, rename, move and delete chats", async ({ page }) => {
  await connect(page);
  await ask(page, "Bananas are yellow");
  await page.getByRole("navigation").getByRole("button", { name: "New chat" }).first().click();
  await ask(page, "Apples are red");

  // Search from the keyboard
  await page.keyboard.press("Control+k");
  const search = page.getByTestId("search-dialog");
  const searchBox = search.getByRole("textbox", { name: "Search chats" });
  await searchBox.fill("banana");
  await expect(search.getByRole("option")).toHaveCount(1);
  await searchBox.press("Enter");
  await expect(search).toBeHidden();
  await expect(page.getByTestId("chat-title")).toHaveText("Bananas are yellow");

  await chatMenu(page, "Bananas are yellow", "Pin");
  const list = page.getByTestId("conversation-list");
  await expect(list.getByRole("heading", { name: "Pinned" })).toBeVisible();

  await chatMenu(page, "Bananas are yellow", "Rename");
  await page.getByLabel("Conversation name").fill("Fruit facts");
  await page.getByLabel("Conversation name").press("Enter");
  await expect(list).toContainText("Fruit facts");

  page.once("dialog", (d) => void d.accept());
  await chatMenu(page, "Apples are red", "Delete");
  await expect(list).not.toContainText("Apples are red");
});

test("prompt library: insert with / and save your own", async ({ page }) => {
  await connect(page);
  await composer(page).fill("/proof");
  await expect(page.getByRole("listbox", { name: "Saved prompts" }).getByRole("option", { name: /Proofread/ })).toBeVisible();
  await composer(page).press("Enter");
  await expect(composer(page)).toHaveValue(/^Proofread this text/);

  await page.getByRole("navigation").getByRole("button", { name: "Prompt library" }).click();
  await page.getByRole("button", { name: "New prompt" }).click();
  await page.getByLabel("Title").fill("Haiku");
  await page.getByLabel("Prompt", { exact: true }).fill("Write a haiku about ");
  await page.getByRole("button", { name: "Save prompt" }).click();
  await expect(page.getByTestId("prompt-dialog")).toContainText("Haiku");
  await page.getByRole("button", { name: "Close Prompt library" }).click();

  await composer(page).fill("/hai");
  await page.getByRole("option", { name: /Haiku/ }).click();
  await expect(composer(page)).toHaveValue("Write a haiku about ");
});

test("keyboard shortcuts: help, new chat, stop", async ({ page }) => {
  await connect(page);
  await page.keyboard.press("Control+/");
  await expect(page.getByTestId("shortcuts-dialog")).toContainText("Search chats");
  await page.keyboard.press("Escape");

  await sendMessage(page, "tell me a long story");
  await expect(page.getByTestId("assistant-message").last()).toContainText("word2");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("assistant-message").last()).toContainText("Stopped early.");

  await page.keyboard.press("Control+Shift+O");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Good|Working late/);
  await expect(page.getByTestId("conversation-list").getByRole("listitem")).toHaveCount(2);
});
