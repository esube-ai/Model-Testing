"use client";

import { isValidElement, memo, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import hljs from "highlight.js/lib/common";
import "katex/dist/katex.min.css";
import { CopyButton } from "./CopyButton";
import { GraphicFrame } from "./GraphicFrame";
import { MermaidBlock } from "./MermaidBlock";

/**
 * Model output is untrusted. Raw HTML is parsed (rehype-raw) and then sanitized with
 * GitHub's allow-list, so <script>, event handlers, iframes, styles and javascript: URLs
 * are removed. KaTeX runs after sanitizing so its own markup is kept. SVG is only ever
 * shown through <img>, where scripts cannot run.
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [["className", /^language-./, "math-inline", "math-display"]],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ["http", "https", "data"],
  },
};

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;

export function isSafeImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src) || SAFE_DATA_IMAGE.test(src);
}

/** react-markdown drops data: URLs by default; keep them for images only. */
function urlTransform(url: string, key: string): string {
  if (key === "src" && SAFE_DATA_IMAGE.test(url)) return url;
  return defaultUrlTransform(url);
}

type MdNode = { type: string; value?: string; lang?: string | null; children?: MdNode[] };

const isSvgMarkup = (v: string) => /^\s*<svg[\s>]/i.test(v) && /<\/svg>\s*$/i.test(v);

/**
 * Turn raw `<svg>…</svg>` HTML into ```svg code blocks so it renders as an image. It can
 * arrive as an HTML block, or (when written on one line) as a paragraph of inline HTML.
 */
function remarkSvgBlocks() {
  const walk = (node: MdNode) => {
    node.children?.forEach((child, i) => {
      let raw: string | null = null;
      if (child.type === "html" && child.value) raw = child.value;
      else if (child.type === "paragraph" && child.children?.every((c) => c.type === "html" || c.type === "text")) {
        raw = child.children.map((c) => c.value ?? "").join("");
      }
      if (raw !== null && isSvgMarkup(raw)) node.children![i] = { type: "code", lang: "svg", value: raw.trim() };
      else walk(child);
    });
  };
  return (tree: MdNode) => walk(tree);
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const html = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      return hljs.highlightAuto(code).value;
    } catch {
      return null;
    }
  }, [code, language]);

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <span>{language || "code"}</span>
        <CopyButton text={code} label="Copy code" showText />
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-normal">
        {html !== null ? <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /> : <code className="hljs">{code}</code>}
      </pre>
    </div>
  );
}

function SvgBlock({ code, streaming }: { code: string; streaming: boolean }) {
  if (streaming) return <CodeBlock code={code} language="xml" />;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`;
  return (
    <GraphicFrame label="svg" code={code}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="SVG graphic from the model" className="mx-auto max-h-[32rem] max-w-full" />
    </GraphicFrame>
  );
}

function SafeImage({ src, alt, title }: { src?: unknown; alt?: string; title?: string }) {
  const [failed, setFailed] = useState(false);
  if (typeof src !== "string" || !isSafeImageSrc(src) || failed) {
    return <span className="text-sm text-zinc-600 italic dark:text-zinc-400">[image{alt ? `: ${alt}` : ""}{failed ? " — couldn't load" : ""}]</span>;
  }
  return (
    // Images can come from any web address the model writes, so next/image isn't usable here.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ""} title={title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="my-2 inline-block max-h-[32rem] max-w-full rounded-lg" />
  );
}

function makeComponents(streaming: boolean): Components {
  return {
    pre({ children }) {
      const child = Array.isArray(children) ? children[0] : children;
      const className = isValidElement<{ className?: string }>(child) ? (child.props.className ?? "") : "";
      const language = /language-([\w+#-]+)/.exec(className)?.[1]?.toLowerCase();
      const code = textOf(children).replace(/\n$/, "");
      if (language === "mermaid") return <MermaidBlock code={code} streaming={streaming} />;
      if (language === "svg" || (language === "xml" && isSvgMarkup(code))) {
        return <SvgBlock code={code} streaming={streaming} />;
      }
      return <CodeBlock code={code} language={language} />;
    },
    a({ children, href }) {
      // Unsafe URLs (e.g. javascript:) arrive here emptied by urlTransform: show plain text.
      if (!href) return <span>{children}</span>;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
        </a>
      );
    },
    img({ src, alt, title }) {
      return <SafeImage src={src} alt={alt} title={title} />;
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      );
    },
  };
}

const remarkPlugins = [remarkGfm, remarkMath, remarkSvgBlocks];
const rehypePlugins = [rehypeRaw, [rehypeSanitize, schema], [rehypeKatex, { throwOnError: false, strict: "ignore" }]] as const;

/**
 * Renders model output: GitHub-flavoured Markdown (tables, task lists, strikethrough,
 * autolinks, footnotes), sanitized HTML, LaTeX math, images, SVG and Mermaid diagrams.
 */
export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const components = useMemo(() => makeComponents(streaming), [streaming]);
  return (
    <div className="prose-chat">
      <ReactMarkdown urlTransform={urlTransform} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins as never} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
