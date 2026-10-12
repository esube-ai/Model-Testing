import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, isSafeImageSrc } from "@/components/Markdown";

const render = (text: string, streaming = false) => renderToStaticMarkup(<Markdown text={text} streaming={streaming} />);

describe("Markdown rendering", () => {
  it("renders GitHub-flavoured Markdown: tables, strikethrough, task lists, autolinks, footnotes", () => {
    const html = render(
      ["| Name | Score |", "|---|---|", "| A | 1 |", "", "~~old~~", "", "- [x] done", "- [ ] todo", "", "Visit https://example.com", "", "Note[^1]", "", "[^1]: A footnote."].join("\n"),
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<del>old</del>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("A footnote.");
  });

  it("renders safe inline HTML", () => {
    const html = render('<details><summary>More</summary>Hidden <b>bold</b> <kbd>Ctrl</kbd></details>\n\nH<sub>2</sub>O');
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>More</summary>");
    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<kbd>Ctrl</kbd>");
    expect(html).toContain("<sub>2</sub>");
  });

  it("strips scripts, event handlers, iframes, styles and javascript: links", () => {
    const html = render(
      [
        '<script>alert(1)</script>',
        '<img src="x" onerror="alert(2)">',
        '<iframe src="https://evil.example"></iframe>',
        '<div style="position:fixed" onclick="alert(3)">box</div>',
        "[click](javascript:alert(4))",
        '<a href="javascript:alert(5)">bad</a>',
      ].join("\n\n"),
    );
    expect(html).not.toMatch(/<script|onerror|onclick|<iframe|style=|javascript:/i);
    expect(html).toContain("box");
  });

  it("renders LaTeX math with KaTeX (inline and display)", () => {
    const html = render("Inline $E = mc^2$ and\n\n$$\n\\int_0^1 x\\,dx\n$$");
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
  });

  it("renders images from http(s) and data:image URLs and blocks other schemes", () => {
    const html = render("![a cat](https://example.com/cat.png)\n\n![dot](data:image/png;base64,iVBORw0KGgo=)\n\n![x](javascript:alert(1))");
    expect(html).toContain('src="https://example.com/cat.png"');
    expect(html).toContain('alt="a cat"');
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).not.toContain("javascript:");
    expect(isSafeImageSrc("data:text/html,<script>")).toBe(false);
    expect(isSafeImageSrc("data:image/svg+xml;utf8,<svg/>")).toBe(true);
  });

  it("renders SVG (fenced or raw) as an image so embedded scripts cannot run", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><circle r="5"/></svg>';
    for (const text of ["```svg\n" + svg + "\n```", svg]) {
      const html = render(text);
      expect(html).toContain('src="data:image/svg+xml;charset=utf-8,');
      expect(html).not.toContain("<circle"); // the SVG itself isn't in the page, only as an image
      expect(html).not.toContain("<script");
    }
  });

  it("shows SVG as code while the reply is still streaming", () => {
    const html = render("```svg\n<svg><circle r=\"5\"/></svg>\n```", true);
    expect(html).not.toContain("data:image/svg+xml");
    expect(html).toContain("circle");
    expect(html).not.toContain("<circle");
  });

  it("shows mermaid source until the diagram is drawn in the browser", () => {
    const html = render("```mermaid\ngraph TD; A-->B\n```");
    expect(html).toContain("mermaid diagram");
    expect(html).toContain("A--&gt;B");
  });

  it("highlights fenced code", () => {
    const html = render("```python\ndef f():\n    return 1\n```");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("Copy code");
  });
});
