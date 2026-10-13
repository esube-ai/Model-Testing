import { expect, test, type Page } from "@playwright/test";
import { filler, makeDocx, makePdf } from "../fixtures/files";
import { ask, connect as connectHelper } from "./helpers";

const connect = (page: Page) => connectHelper(page, { test: false });

async function attach(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.getByTestId("file-input").setInputFiles(files);
}

const txt = (name: string, text: string) => ({ name, mimeType: "text/plain", buffer: Buffer.from(text) });

/** A two-page PDF with lots of filler and one fact on page 2, plus a Word doc with another fact. */
function largeFiles() {
  // About 60 wrapped lines fit on a page; ~16k characters in total, more than is sent whole.
  const pdf = makePdf([filler("gardening", 30), [...filler("gardening", 15), "The rocket launch code is PURPLE-ELEPHANT-42.", ...filler("gardening", 10)]]);
  const docx = makeDocx([...filler("cooking", 40), "The project budget is 4.2 million dollars."]);
  return [
    { name: "handbook.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "plan.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx },
  ];
}

test("small text file: whole file is used and cited", async ({ page }) => {
  await connect(page);
  await attach(page, [txt("notes.txt", "Team notes.\n\nThe office wifi password is BLUE-CACTUS-77.")]);
  const chip = page.getByTestId("attachment");
  await expect(chip).toContainText("notes.txt");
  await expect(chip).toContainText("1 section");

  const reply = await ask(page, "What is the wifi password?");
  // The mock model echoes what it was sent, so the file text must have been included.
  await expect(reply).toContainText("BLUE-CACTUS-77");
  await reply.getByTestId("sources").getByText(/Sources from your files/).click();
  await expect(reply.getByTestId("sources")).toContainText("[1] notes.txt");
  await expect(page.getByTestId("user-message").last()).toHaveText(/What is the wifi password\?/);
});

test("PDF and Word files: retrieval finds the right section, with page numbers", async ({ page }) => {
  await connect(page);
  await attach(page, largeFiles());
  await expect(page.getByTestId("attachment")).toHaveCount(2);
  await expect(page.getByTestId("attachment").first()).toContainText("handbook.pdf");

  const reply = await ask(page, "What is the rocket launch code?");
  await expect(reply).toContainText("PURPLE-ELEPHANT-42");
  const sources = reply.getByTestId("sources");
  await sources.getByText(/Sources from your files/).click();
  await expect(sources).toContainText("handbook.pdf, page 2");
  await expect(sources).not.toContainText("plan.docx");

  const reply2 = await ask(page, "What is the project budget?");
  await expect(reply2).toContainText("4.2 million dollars");
  await reply2.getByTestId("sources").getByText(/Sources from your files/).click();
  await expect(reply2.getByTestId("sources")).toContainText("plan.docx");
  await expect(reply2).not.toContainText("PURPLE-ELEPHANT-42");
});

test("semantic search finds text with different wording, and falls back when it fails", async ({ page }) => {
  await connect(page);
  await attach(page, [txt("guide.txt", [...filler("gardening", 60), "Automobile maintenance schedule: change the oil every 5000 km.", ...filler("gardening", 20)].join("\n\n"))]);
  await expect(page.getByTestId("attachment")).toContainText("guide.txt");

  // Keyword search alone can't connect "car upkeep" to "automobile maintenance".
  const keyword = await ask(page, "car upkeep?");
  await expect(keyword).not.toContainText("5000 km");

  const setEmbedding = async (model: string) => {
    await page.getByRole("button", { name: "Chat settings" }).click();
    await page.getByLabel("Semantic search model (optional)").fill(model);
    await page.getByRole("button", { name: "Close Chat settings" }).click();
  };
  await setEmbedding("embed-model");
  const semantic = await ask(page, "car upkeep?");
  await expect(semantic).toContainText("5000 km");

  await setEmbedding("missing-embed");
  const fallback = await ask(page, "car upkeep?");
  await expect(fallback).toContainText("Semantic search didn't work");
  await expect(fallback).toContainText("keyword search was used");
});

test("files persist, can be removed, reject unsupported types, and go away with the chat", async ({ page }) => {
  await connect(page);
  await attach(page, [txt("keep.md", "# Keep\n\nKeep this."), txt("drop.txt", "Drop this."), { name: "archive.zip", mimeType: "application/zip", buffer: Buffer.from([0x50, 0x4b, 3, 4]) }]);
  await expect(page.getByTestId("attachment")).toHaveCount(2);
  await expect(page.getByRole("alert").filter({ hasText: "archive.zip" })).toContainText("isn't a supported file type");

  await page.getByRole("button", { name: "Remove drop.txt" }).click();
  await expect(page.getByTestId("attachment")).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId("attachment")).toHaveCount(1);
  await expect(page.getByTestId("attachment")).toContainText("keep.md");

  // A chat with files isn't "empty": New chat starts a fresh one without them.
  await page.getByRole("navigation").getByRole("button", { name: "New chat" }).first().click();
  await expect(page.getByTestId("attachment")).toHaveCount(0);
  await page.getByTestId("conversation-list").getByRole("button", { name: "New chat", exact: true }).last().click();
  await expect(page.getByTestId("attachment")).toHaveCount(1);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: 'More options for "New chat"' }).last().click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const remaining = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("model-testing-files");
        req.onsuccess = () => {
          const count = req.result.transaction("docs").objectStore("docs").count();
          count.onsuccess = () => resolve(count.result);
        };
      }),
  );
  expect(remaining).toBe(0);
});
