import type { Segment } from "./types";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const TEXT_EXTENSIONS = [
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "yaml", "yml", "log", "ini", "toml", "tex", "rst",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "kt", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php",
  "swift", "scala", "sql", "sh", "bash", "ps1", "r", "css", "scss", "vue", "svelte",
];

/** Value for the file picker's `accept` attribute. */
export const ACCEPT = [".pdf", ".docx", ".html", ".htm", ...TEXT_EXTENSIONS.map((e) => `.${e}`)].join(",");

/** A problem with one file, with a message testers can act on. */
export class FileError extends Error {}

type Kind = "pdf" | "docx" | "html" | "text";

export function kindOf(name: string, mime: string): Kind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "html" || ext === "htm" || mime === "text/html") return "html";
  if (TEXT_EXTENSIONS.includes(ext) || mime.startsWith("text/")) return "text";
  return null;
}

/** Visible text of an HTML document (scripts and styles removed). */
export function htmlToText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, noscript, template").forEach((el) => el.remove());
    // Keep block boundaries as line breaks.
    doc.querySelectorAll("p, div, li, tr, h1, h2, h3, h4, h5, h6, br, section, article").forEach((el) => el.append("\n"));
    return doc.body?.textContent ?? "";
  }
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4000);
  const nul = (sample.match(/\u0000/g) ?? []).length;
  const replacement = (sample.match(/�/g) ?? []).length;
  return nul > 0 || replacement > sample.length * 0.1;
}

async function pdfToSegments(data: ArrayBuffer): Promise<Segment[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") throw new FileError("This PDF is password-protected. Remove the password and attach it again.");
    throw new FileError("This PDF couldn't be read. It may be damaged.");
  }
  try {
    const segments: Segment[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : " ");
      }
      if (text.trim()) segments.push({ text, page: p });
    }
    return segments;
  } finally {
    void task.destroy();
  }
}

async function docxToText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: data });
    return value;
  } catch {
    throw new FileError("This Word file couldn't be read. It may be damaged, or not a real .docx file.");
  }
}

/** Read a file's text in the browser. Throws FileError with a friendly message. */
export async function extractSegments(file: File): Promise<Segment[]> {
  if (file.size > MAX_FILE_BYTES) {
    throw new FileError(`“${file.name}” is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Attach a smaller file.`);
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".doc")) throw new FileError("Old Word .doc files aren't supported. Save it as .docx or PDF and attach that.");
  const kind = kindOf(file.name, file.type);
  if (!kind) throw new FileError(`“${file.name}” isn't a supported file type. Attach PDF, Word (.docx) or text-based files.`);

  let segments: Segment[];
  if (kind === "pdf") segments = await pdfToSegments(await file.arrayBuffer());
  else if (kind === "docx") segments = [{ text: await docxToText(await file.arrayBuffer()) }];
  else {
    const raw = await file.text();
    if (looksBinary(raw)) throw new FileError(`“${file.name}” doesn't look like a text file.`);
    segments = [{ text: kind === "html" ? htmlToText(raw) : raw }];
  }

  if (!segments.some((s) => s.text.trim())) {
    throw new FileError(
      kind === "pdf"
        ? `“${file.name}” has no selectable text. It may be a scanned image, which isn't supported.`
        : `“${file.name}” is empty.`,
    );
  }
  return segments;
}
