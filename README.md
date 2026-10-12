# Model Testing

A simple ChatGPT-style app for trying out a hosted language model. You enter the connection details your model provider gave you, then chat with the model, rate its answers with 👍 / 👎, and export conversations to share with your team.

Nothing is installed on a server for you and there are no accounts. Your conversations are kept in your own browser.

---

## Starting the app

You need [Node.js](https://nodejs.org) version 20 or newer.

1. Open a terminal in this folder.
2. Run `npm install` (only needed the first time).
3. Run `npm run dev`.
4. Open the link it prints, usually **http://localhost:3000**.
5. The **Connection** window opens. Fill it in (see below), click **Test connection**, then **Save**.

You can now chat. To change the connection later, click the ⚙️ gear icon in the top-right corner, or click the coloured status dot next to it.

---

## The Connection fields

| Field | What it means | Where to find it |
|---|---|---|
| **API base URL** | The web address of your model provider's API. | Your provider's documentation or the message they sent you. For OpenAI-compatible providers it usually ends in `/v1`, e.g. `https://api.example.com/v1`. For Anthropic use `https://api.anthropic.com`. |
| **API key** | A secret code, like a password, that proves you are allowed to use the model. | Your provider's dashboard, usually under "API keys". Leave it blank if your provider (for example a model running on your own computer) doesn't need one. |
| **API format** | The "language" the provider's API speaks. | Pick **OpenAI-compatible** for most providers (OpenAI, Azure-style gateways, vLLM, Ollama, LM Studio, OpenRouter, and many others). Pick **Anthropic** only for Anthropic's API. If you're not sure, try OpenAI-compatible first. |
| **Model name** | Which model to chat with. | Click **Load models** to pick from your provider's list. If your provider doesn't offer a list, type the exact model name from their documentation. |

**Test connection** sends one tiny message to check everything works. If something is wrong, it tells you which field is most likely the problem. **Save** stays greyed out until the test passes. If you know what you're doing, **Save anyway** skips the test.

**Clear saved connection** removes the saved key and connection details from this browser.

### What "Remember on this device" means

- **Off (default):** your key is kept only until you close the browser tab. Reloading the page keeps it; closing the tab forgets it. This is the safest choice.
- **On:** your key stays in this browser until you click **Clear saved connection**. **Anyone who uses this browser could see it**, so only turn it on for a computer that only you use.

Your key is never shown on screen (not even partly) and is never included in exported conversations. Conversations are saved separately from the key.

---

## Using the chat

- **Enter** sends your message. **Shift+Enter** starts a new line.
- **Stop** appears while the model is replying. Click it to stop the reply early.
- Under each reply you can **copy** it, give it a 👍 or 👎, or **regenerate** the latest reply.
- Click the pencil under your last message to **edit and resend** it.
- **Chat settings** (above the message box) let you set:
  - **System prompt:** background instructions the model follows for the whole chat.
  - **Temperature:** lower means more focused and predictable, higher means more creative. Leave it blank to use the provider's default.
  - **Max tokens:** the longest reply allowed. Leave it blank to use the default.
- **Export** (top right) downloads the current conversation as Markdown (easy to read) or JSON (for tools). Exports include your 👍 / 👎 ratings, chat settings, model name, host and timestamps. They never include your API key.
- In the left sidebar you can start a **New chat**, switch between chats, and rename or delete them. On a phone, tap ☰ to open it.

### Attaching files

Click the 📎 paperclip next to the message box, or drag files onto the chat, to let the model answer questions about your documents.

- **Supported files:** PDF, Word (.docx), and text-based files such as .txt, .md, .csv, .json, .html and code. Each file can be up to 20 MB, and a chat can hold up to 20 files.
- **Which chat they belong to:** files belong to the chat you attach them in. **New chat** starts without them, and deleting a chat deletes its files. Click ✕ on a file to remove it.
- **How it works:** when you ask a question, the app picks the parts of your files that best match it and sends them along with your question. Small files are sent whole, so "summarize this file" works too. The model is asked to cite the parts it used, like [1], and you can open **Sources from your files** under each answer to see exactly which parts were sent, with page numbers for PDFs.
- **Smarter matching (optional):** by default the app matches on keywords. If your provider offers embeddings (most OpenAI-compatible ones do), open **Chat settings** and enter an embedding model name, such as `text-embedding-3-small`. The app then also matches by meaning, so "car upkeep" finds "automobile maintenance". If that model doesn't work, you'll see a note and keyword matching is used instead.
- **Privacy:** files are read and stored only in your browser, never saved on the server. Only the parts picked for each question are sent to the model provider, through this app's server.
- **Not supported:** scanned PDFs without selectable text, password-protected PDFs, and old .doc files. Save those as a text-based PDF or .docx first.

### What replies can show

| The model writes… | You see… |
|---|---|
| Markdown: headings, lists, **bold**, links, quotes | Formatted text |
| Tables, ~~strikethrough~~, task lists `- [x]`, footnotes | GitHub-style tables, crossed-out text, checkboxes and footnotes |
| Code in ``` fences | Highlighted code with a **Copy** button |
| Math such as `$E = mc^2$` or `$$ … $$` blocks | Properly typeset formulas |
| A ```` ```mermaid ```` block | A drawn diagram (flowcharts, sequence diagrams, charts…). It appears once the reply finishes; **Show code** switches to the source. |
| SVG code (in a ```` ```svg ```` block or raw `<svg>…</svg>`) | The picture itself, with **Show code** to see the source |
| Images `![description](https://…)` or `data:image/…` | The image |
| Simple HTML such as `<details>`, `<kbd>`, `<sub>`, `<b>` | Rendered as HTML |

For safety, anything that could run code is removed before display: `<script>`, event handlers such as `onerror`, `<iframe>`, inline styles and `javascript:` links. SVG pictures are shown as images, so scripts inside them can't run. Images load straight from the web address the model wrote, so that site can see your IP address, as with any web image.

---

## Restricting which hosts can be used (for shared deployments)

The app's server passes your messages on to whatever API address is entered. On your own computer that's fine. If you put the app somewhere other people can reach it, limit which providers it will talk to, so nobody can misuse it as a relay:

1. Copy `.env.example` to a new file named `.env.local`.
2. List the allowed hosts, separated by commas:

   ```
   ALLOWED_API_HOSTS=api.openai.com,api.anthropic.com
   ```

3. Restart the app.

Any other address is then rejected with a clear message. When `ALLOWED_API_HOSTS` is not set, all hosts are allowed and the server prints a one-time warning when it starts.

Other protections that are always on: only `http://` and `https://` addresses are accepted. The server only ever calls the provider's chat, messages and models endpoints. Responses are limited to 5 MB. Redirects are not followed. The key is replaced with `[REDACTED]` in anything the server logs.

---

## Putting it online with Vercel

[Vercel](https://vercel.com) can host this app. Nothing in the code needs changing. The free Hobby plan is for personal, non-commercial use; for testing inside a company, Vercel's terms require a Pro (paid) team.

### One-time setup

1. Push this project to a GitHub repository. It's already set up to ignore secrets and build files.
2. Sign in at [vercel.com](https://vercel.com) with your GitHub account and click **Add New… → Project**.
3. Pick the repository and click **Import**. Vercel detects Next.js automatically; leave the build settings as they are.
4. Open **Environment Variables** and add:
   - **Name:** `ALLOWED_API_HOSTS`
   - **Value:** the provider host(s) your testers use, e.g. `api.openai.com` or `api.example.com,api.anthropic.com`

   Strongly recommended: without it, anyone who finds your link could use your deployment to relay requests to any website.
5. Click **Deploy**. After a minute or two you get a link like `https://model-testing-yourname.vercel.app`. Share it with your testers.

Every later push to the main branch redeploys automatically. Other branches get their own preview links.

Prefer the command line? Run `npx vercel` in this folder and answer the questions, then `npx vercel --prod`. Set `ALLOWED_API_HOSTS` with `npx vercel env add ALLOWED_API_HOSTS`.

### Keeping the deployment private (recommended)

The app has no login. Anyone with the link can open it, although they still need their own API key to chat. To restrict who can open it, use your project's **Settings → Deployment Protection** in Vercel. **Vercel Authentication** makes visitors sign in with a Vercel account on your team; **Password Protection** adds a shared password. Which deployments can be protected, and whether a password is available, depends on your Vercel plan.

### Good to know

- **Each tester enters their own connection.** Keys stay in the tester's browser and are sent to the server only to forward each request. The server never stores them. There is nothing to configure on Vercel besides `ALLOWED_API_HOSTS`.
- **Local models don't work from Vercel.** The hosted server can't reach `localhost`, `192.168.x.x` or other private-network addresses, and blocks them on purpose. To test a model running on your own machine, run the app locally with `npm run dev`.
- **Reply length limit.** Each reply can stream for up to 5 minutes, the most the Hobby plan allows. Very long replies are cut off at that point; ask for shorter answers or set **Max tokens**. On a Pro plan you can raise `maxDuration` in `src/app/api/chat/route.ts`. If a deploy fails with an error about `maxDuration`, turn on **Fluid Compute** under project **Settings → Functions** (it's on by default for new projects), or lower the value to 60.
- **Message size.** Vercel accepts requests up to 4.5 MB and this app caps a conversation at 2 MB. If a chat gets too long, start a new one.
- **Logs.** Server logs (Vercel → your project → **Logs**) show errors with the key replaced by `[REDACTED]`.
- **Security headers.** Every page is served with a Content Security Policy that only lets the browser talk to this app itself, plus `X-Frame-Options: DENY`, `nosniff` and `Referrer-Policy: no-referrer`.

---

## Troubleshooting

| What you see | What to try |
|---|---|
| "The API key was not accepted" | Copy the key again from your provider's dashboard. Check that it hasn't expired and that there are no extra spaces. |
| "Couldn't find the model API at that address" | Check the API base URL. For OpenAI-compatible providers it usually needs to end in `/v1`. |
| "Couldn't reach the model server" | Check the address for typos and check your internet connection. If the model runs on your own computer, make sure it's running. |
| "That model name wasn't recognised" | Click **Load models** and pick from the list, or copy the exact name from your provider's docs. |
| "The server replied in an unexpected format" | Switch the **API format** (OpenAI-compatible ↔ Anthropic). |
| "The model is busy right now, please try again in a minute" | You've hit the provider's rate limit. Wait a minute and click **Retry**. |
| "The model took too long to respond" | Try again. If it keeps happening, try a shorter message or a smaller **Max tokens**. |
| "This app only allows these model hosts" | The person running the app set `ALLOWED_API_HOSTS`. Ask them to add your provider. On Vercel: project → **Settings → Environment Variables**, then redeploy. |
| "This app is running online, so it can't reach local or private-network addresses" | You're using the hosted version with a model on your own computer or office network. Use the provider's public address, or run the app locally with `npm run dev`. |
| "This model needs the reasoning from earlier replies, which this chat doesn't have" | The chat was started before the app saved reasoning, or the reply was stopped early. Start a **New chat**. |
| "isn't a supported file type" / "has no selectable text" | Attach PDF, Word (.docx) or text files. For a scanned PDF, use a version with selectable text (try selecting text in your PDF viewer). |
| The answer ignores your file | Open **Sources from your files** under the answer to see what was sent. Try using words that appear in the document, or set a **Semantic search model** in Chat settings. |
| "Semantic search didn't work" | The embedding model name in Chat settings is wrong, or your provider has no embeddings. Fix the name or clear the field to use keyword search. |
| "Your browser is blocking storage" | Private browsing or strict privacy settings are on. The app still works, but chats and the connection are lost when you reload. |

---

## For developers

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests for the model harness (against a local mock provider) |
| `npm run test:e2e` | Playwright browser tests (needs Node 22.18+; builds the app and starts a local mock provider; run `npx playwright install chromium` once first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium) |

The tests never contact a real model API. `tests/mock/provider.ts` is a local server that speaks both formats.

### Layout

- `src/lib/harness/`: server-side model client. `streamChat(connection, messages, options)` yields `{type:"text"}` chunks followed by one `{type:"done", metadata}`. There are also `testConnection` and `listModels`. Connection details arrive with every request and are never stored on the server.
  - `adapters/openai.ts`, `adapters/anthropic.ts`: all format-specific code. To add a third format, implement `ProviderAdapter` (`adapters/types.ts`) and register it in `index.ts`.
  - `http.ts`: timeout, cancellation, retries (429/5xx, 3 attempts, exponential backoff, honours `Retry-After`), SSE parsing, size limits.
  - `errors.ts`: typed `HarnessError` (`code`, friendly `message`, redacted `detail`, likely `field`).
  - `security.ts`: URL validation, `ALLOWED_API_HOSTS`, fixed endpoint paths.
- `src/app/api/{chat,test-connection,models}/route.ts`: the app's own server routes. The browser only talks to these.
- `src/components/`: the UI. `src/lib/client/`: browser storage, API calls, export.
- `src/lib/rag/`: attached files and retrieval, all in the browser.
  - `extract.ts`: reads text from PDF (pdf.js), .docx (mammoth), HTML and text files. The two libraries are loaded only when needed.
  - `chunk.ts`: splits text into chunks of about 1,200 characters, with 150 characters of overlap, keeping PDF page numbers.
  - `store.ts`: IndexedDB storage, separate from conversations and credentials, with an in-memory fallback.
  - `bm25.ts`, `select.ts`: chooses which chunks to send. If a chat's files total 12,000 characters or less, all of it is sent. Otherwise up to 8 chunks are chosen within that budget, ranked by BM25 keyword score, merged with embedding similarity (Reciprocal Rank Fusion) when a semantic search model is set.
  - `prompt.ts`: builds the message: numbered excerpts inside `<files>…</files>`, an instruction to cite them, and an instruction not to follow instructions found inside them.
- `src/app/api/embeddings/route.ts`: the server route for embeddings. It is stateless like the others; vectors are cached in IndexedDB per host and model.

### Assumptions about provider APIs

These follow the public OpenAI and Anthropic documentation. Providers that differ may need adjusting:

- **Endpoints.** OpenAI-compatible: `POST {base}/chat/completions` and `GET {base}/models`. The base URL is used as given, so it normally includes `/v1`. Anthropic: `POST {base}/v1/messages` and `GET {base}/v1/models`; `/v1` is added if it's missing. If someone pastes a full endpoint URL (ending in `/chat/completions`, `/messages` or `/models`), that suffix is removed.
- **Auth headers.** OpenAI-compatible uses `Authorization: Bearer <key>`. Anthropic uses `x-api-key: <key>` plus `anthropic-version: 2023-06-01`. No auth header is sent when the key is blank.
- **Streaming.** OpenAI-compatible: SSE `data:` lines with `choices[0].delta.content`, ending with `data: [DONE]`. Anthropic: `message_start`, `content_block_delta` (`text_delta`), `message_delta`, `message_stop`, and `error` events. If a provider answers a streaming request with plain JSON, that is accepted too.
- **Max tokens.** OpenAI-compatible requests send `max_tokens`, and only when you set it. Some newer OpenAI models expect `max_completion_tokens` instead; leave Max tokens blank for those. Anthropic requires `max_tokens`, so 4096 is used when it's blank.
- **Usage.** Token counts for OpenAI-compatible streams are shown only if the provider includes `usage` in the stream. `stream_options` is not sent, because some compatible servers reject unknown fields.
- **Connection test.** It sends "Reply with the single word: OK". For Anthropic it caps the reply at 8 tokens. For OpenAI-compatible it sends no cap, because some models reject `max_tokens`.
- **Reasoning models.** Reasoning (`reasoning_content`, or `reasoning` on some servers) is read from OpenAI-compatible replies, shown under a collapsible "Reasoning" heading and saved with the message. On later turns it is sent back as `reasoning_content` on earlier assistant messages, because some reasoning models require it. Providers disagree here, so if the provider rejects the request:
  - if the error says `reasoning_content` is missing or required, the app retries once, sending it on every earlier assistant message (empty where none was saved);
  - otherwise, if the error mentions `reasoning_content`, it retries once without it.

  Anthropic requests never include it.
- **Error mapping.** 401/403 → bad key. 404 → model not found if the error mentions "model", otherwise wrong URL. 429 → rate limit. 5xx → provider trouble. A reply that doesn't match the selected format → wrong API format.
- **Embeddings.** Semantic search uses `POST {base}/embeddings` with `{ model, input: string[], encoding_format: "float" }` and reads `data[].embedding` (OpenAI format), 32 inputs per request. The Anthropic API has no embeddings endpoint, so only keyword search is used with that format.
- **Rendering.** GitHub-flavoured Markdown (`remark-gfm`), LaTeX math (`remark-math` + KaTeX, `$…$` and `$$…$$` delimiters), raw HTML (`rehype-raw`, then `rehype-sanitize` with GitHub's allow-list), Mermaid diagrams (loaded on demand, `securityLevel: "strict"`), and SVG shown via `<img>` data URLs. Images are allowed from `http(s)` and `data:image/(png|jpeg|gif|webp|avif|svg+xml)` only. `package.json` overrides nested `katex` copies to the patched 0.19 release.
