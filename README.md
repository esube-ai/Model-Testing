# Model Testing

A full-featured chat app for trying out hosted language models. Connect one or more model providers, chat the way you would in a consumer chat app, compare several models side by side on the same question, and export conversations with your 👍 / 👎 ratings to share with your team.

There are no accounts. Your conversations, files and pictures are kept in your own browser; the app's server only passes each message on to the model provider.

**Highlights:**
- Several connections at once, with a model picker in the message box.
- **Compare** mode: send one message to up to four models at once.
- Photos from your camera, picture uploads and file attachments (PDF, Word, text) that the model can answer questions about.
- Voice dictation.
- Projects with shared instructions and files.
- Chat search and pinning, a library of reusable prompts, and keyboard shortcuts.

---

## Starting the app

You need [Node.js](https://nodejs.org) version 20 or newer.

1. Open a terminal in this folder.
2. Run `npm install` (only needed the first time).
3. Run `npm run dev`.
4. Open the link it prints, usually **http://localhost:3000**.
5. The **Connect a model** window opens. Fill it in (see below), click **Test connection**, then **Save**.

You can now chat. To add more providers or change one later, click **Connections** at the bottom of the sidebar, or choose **Manage connections…** in the model picker.

---

## Connections

A connection is one model provider: an address, a key, and the models you want to use from it. You can add as many as you like (for example your company's server and a public API) and switch between their models at any time.

| Field | What it means | Where to find it |
|---|---|---|
| **Name** (optional) | How the connection is labelled in the model picker. | Anything you like, e.g. "OpenAI" or "Office server". |
| **API base URL** | The web address of your model provider's API. | Your provider's documentation or the message they sent you. For OpenAI-compatible providers it usually ends in `/v1`, e.g. `https://api.example.com/v1`. For Anthropic use `https://api.anthropic.com`. |
| **API key** | A secret code, like a password, that proves you are allowed to use the model. | Your provider's dashboard, usually under "API keys". Leave it blank if your provider (for example a model running on your own computer) doesn't need one. |
| **API format** | The "language" the provider's API speaks. | Pick **OpenAI-compatible** for most providers (OpenAI, Azure-style gateways, vLLM, Ollama, LM Studio, OpenRouter, and many others). Pick **Anthropic** only for Anthropic's API. If you're not sure, try OpenAI-compatible first. |
| **Models** | Which models from this provider appear in the model picker. | Click **Load models** and tick the ones you want. If your provider doesn't offer a list, type the exact model name and click **Add**. |

**Test connection** sends one tiny message (to the first model) to check everything works. If something is wrong, it tells you which field is most likely the problem. **Save** stays greyed out until the test passes; **Save anyway** skips the test.

In the **Connections** window, the coloured dot next to each connection shows whether its last request worked: green for working, red for a problem, grey for not tested yet. You can edit or remove a connection there. **Clear saved connections** removes every saved key from this browser.

### What "Remember on this device" means

- **Off (default):** your keys are kept only until you close the browser tab. Reloading the page keeps them; closing the tab forgets them. This is the safest choice.
- **On:** your keys stay in this browser until you clear them. **Anyone who uses this browser could see them**, so only turn this on for a computer that only you use.

Your keys are never shown on screen (not even partly) and are never included in exported conversations. Conversations are saved separately from the keys.

---

## Using the chat

- **Enter** sends your message. **Shift+Enter** starts a new line.
- **Stop** (■) appears while a reply is being written. Click it, or press **Esc**, to stop early.
- Under each reply you can **copy** it, give it a 👍 or 👎, or **regenerate** the latest reply. The small label shows which model wrote it.
- Hover over your last message and click the pencil to **edit and resend** it.
- **Chat settings** (the sliders icon, top right, or **+ → Chat settings**) apply to the current chat:
  - **System prompt:** background instructions the model follows for the whole chat.
  - **Temperature:** lower means more focused and predictable, higher means more creative. Leave it blank to use the provider's default.
  - **Max tokens:** the longest reply allowed. Leave it blank to use the default.
  - **Semantic search model:** see "Attaching files" below.
- **Export** (download icon, top right) saves the conversation as Markdown (easy to read) or JSON (for tools). Exports include your 👍 / 👎 ratings, chat settings, model names, hosts and timestamps. They never include your API keys.

### Choosing and comparing models

Click the model name in the message box to open the **model picker**. Models are grouped by connection, each with a coloured status dot.

- **Pick one model** to use it for this chat. You can switch at any point; each reply is labelled with the model that wrote it.
- **Compare models:** turn on the switch at the top and tick up to **four** models. Each message is then sent to all of them at once, and their replies appear side by side, or swipeable cards on a phone.
  - **Each card** has its own copy, 👍 / 👎 and regenerate buttons.
  - **Separate threads:** every model continues its own conversation thread, so each sees its own earlier answers.
  - **Continue with this model** on a card switches the chat back to just that model.

### Pictures and the camera

Click **+** next to the message box:
- **Upload files or photos:** pictures (PNG, JPEG, WebP, GIF and others) are added to your message. Documents become chat files (see below). You can also paste a picture into the message box, or drag it onto the chat.
- **Take a photo:** opens your camera. Click **Capture**, then **Retake** or **Use photo**. On phones, **Switch** flips between the front and back camera. Your browser asks for permission the first time.

You can send up to 4 pictures per message. Large pictures are scaled down (to at most 1,568 pixels on the long side) before sending, which keeps requests fast and matches what most vision models use. Pictures are stored in your browser with the chat.

Only **vision-capable** models can look at pictures. If a model can't, you'll see "It may not accept images": pick a vision model or send the message without the picture.

### Voice dictation

Click the 🎤 microphone to speak instead of typing. Your words appear in the message box; click it again to stop, then edit and send as usual. Dictation uses your browser's built-in speech recognition (Chrome, Edge and Safari support it; the button is hidden in browsers that don't). In some browsers, such as Chrome, the audio is processed by the browser maker's speech service. It is never sent to your model provider.

### Projects

**Projects** (in the sidebar) group chats that share the same setup:
- **Project instructions** are added to every chat in the project, before each chat's own system prompt.
- **Project files** can be searched by every chat in the project, just like files attached to a single chat.

Create a project, add instructions and files, then type in the project's message box to start a chat inside it. A chat's header shows which project it belongs to. To move an existing chat into a project, use its **…** menu in the sidebar. Deleting a project deletes its files but keeps its chats.

### Organizing chats

- **Search** (sidebar, or **Ctrl/⌘+K**) looks through every chat's title and messages.
- The sidebar groups chats by **Today**, **Yesterday**, **Previous 7 days** and so on.
- Each chat's **…** menu can **Pin** it to the top, **Rename** it, **Move to project…**, or **Delete** it.
- On a phone, tap ☰ to open the sidebar. On a computer, the panel icon (or **Ctrl/⌘+B**) collapses it to a slim bar.

### Prompt library

Save prompts you use often, such as "Summarize this in five bullet points", under **Prompt library** in the sidebar. To use one, type **/** at the start of the message box, then type part of the prompt's name, and press **Enter** (or click it). A few examples are included to start with.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl/⌘+Shift+O | New chat |
| Ctrl/⌘+K | Search chats |
| Ctrl/⌘+B | Show or hide the sidebar |
| Shift+Esc | Focus the message box |
| Esc | Stop generating |
| / | Saved prompts (at the start of the message box) |
| Ctrl/⌘+/ | Show all shortcuts |

### Attaching files

Click **+ → Upload files or photos**, or drag files onto the chat, to let the model answer questions about your documents.

- **Supported files:** PDF, Word (.docx), and text-based files such as .txt, .md, .csv, .json, .html and code. Each file can be up to 20 MB, and a chat can hold up to 20 files.
- **Which chat they belong to:** files belong to the chat you attach them in (or to a project; see above). **New chat** starts without them, and deleting a chat deletes its files. Click ✕ on a file to remove it.
- **How it works:** when you ask a question, the app picks the parts of your files that best match it and sends them along with your question. Small files are sent whole, so "summarize this file" works too. The model is asked to cite the parts it used, like [1], and you can open **Sources from your files** under each answer to see exactly which parts were sent, with page numbers for PDFs. In Compare mode, every model gets the same parts.
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
- **Message size.** Vercel accepts requests up to 4.5 MB, and this app caps each request at 4 MB. Pictures are scaled down, and only the most recent 8 pictures in a chat are sent with each message. If a chat gets too long, start a new one.
- **Camera and microphone** need the site to be served over https, which Vercel does automatically. The app's `Permissions-Policy` header allows them only for the app itself.
- **Logs.** Server logs (Vercel → your project → **Logs**) show errors with the key replaced by `[REDACTED]`.
- **Security headers.** Every page is served with a Content Security Policy that only lets the browser talk to this app itself, plus `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, and a `Permissions-Policy` allowing the camera and microphone only for this app.

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
| "It may not accept images" | The model you picked can't look at pictures. Choose a vision-capable model in the model picker, or send the message without the picture. |
| "Camera access was blocked" / no microphone button | Allow the camera or microphone for this site in your browser's settings (usually the icon at the left of the address bar). The camera needs an https address (or `localhost`). The microphone button only appears in browsers with speech recognition (Chrome, Edge, Safari). |
| "This model's connection was removed" | The chat used a model from a connection you deleted. Pick another model in the model picker and click **Retry**. |
| "Your browser is blocking storage" | Private browsing or strict privacy settings are on. The app still works, but chats and the connection are lost when you reload. |

---

## For developers

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests: the model harness (against a local mock provider), retrieval, rendering, and the data layer |
| `npm run test:e2e` | Playwright browser tests (needs Node 22.18+; builds the app and starts a local mock provider; run `npx playwright install chromium` once first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium) |

The tests never contact a real model API. `tests/mock/provider.ts` is a local server that speaks both formats.

### Layout

- `src/lib/harness/`: server-side model client. `streamChat(connection, messages, options)` yields `{type:"text"}` and `{type:"reasoning"}` chunks followed by one `{type:"done", metadata}`. User messages may carry `images` (base64 PNG/JPEG/WebP/GIF). There are also `testConnection`, `listModels` and `embed`. Connection details arrive with every request and are never stored on the server.
  - `adapters/openai.ts`, `adapters/anthropic.ts`: all format-specific code. To add a third format, implement `ProviderAdapter` (`adapters/types.ts`) and register it in `index.ts`.
  - `http.ts`: timeout, cancellation, retries (429/5xx, 3 attempts, exponential backoff, honours `Retry-After`), SSE parsing, size limits.
  - `errors.ts`: typed `HarnessError` (`code`, friendly `message`, redacted `detail`, likely `field`).
  - `security.ts`: URL validation, `ALLOWED_API_HOSTS`, fixed endpoint paths.
- `src/app/api/{chat,test-connection,models}/route.ts`: the app's own server routes. The browser only talks to these.
- `src/components/`: the UI.
  - `ChatApp.tsx`: the app shell and the generation engine. One message can run several streams in parallel, one per model in Compare mode.
  - `ModelPicker`, `Composer` (with **+** menu, "/" prompts, dictation and picture thumbnails), `CameraDialog`, `ConnectionsDialog`, `Sidebar`, `ProjectViews`, `SearchDialog`, `PromptLibraryDialog`, `ShortcutsDialog` and `ChatSettingsDialog`.
- `src/lib/client/`: browser-side data.
  - `connections.ts`: multiple connections; migrates the old single-connection format.
  - `conversations.ts`, `history.ts`: per-model history for Compare.
  - `images.ts`: scaling and storage.
  - `projects.ts`, `prompts.ts`, `organize.ts` (search and date groups), `dictation.ts` (Web Speech API), `api.ts` and `export.ts`.
- **Browser storage:** conversations, projects and prompts are in localStorage. Keys are in sessionStorage (or localStorage with Remember on). Files, chunks and pictures are in IndexedDB.
- `src/lib/rag/`: attached files and retrieval, all in the browser.
  - `extract.ts`: reads text from PDF (pdf.js), .docx (mammoth), HTML and text files. The two libraries are loaded only when needed.
  - `chunk.ts`: splits text into chunks of about 1,200 characters, with 150 characters of overlap, keeping PDF page numbers.
  - `store.ts`: IndexedDB storage, separate from conversations and credentials, with an in-memory fallback.
  - `bm25.ts`, `select.ts`: chooses which chunks to send. If a chat's files total 12,000 characters or less, all of it is sent. Otherwise up to 8 chunks are chosen within that budget, ranked by BM25 keyword score, merged with embedding similarity (Reciprocal Rank Fusion) when a semantic search model is set.
  - `prompt.ts`: builds the message: numbered excerpts inside `<files>…</files>`, an instruction to cite them, and an instruction not to follow instructions found inside them.
- `src/app/api/embeddings/route.ts`: the server route for embeddings. It is stateless like the others; vectors are cached in IndexedDB per host and model.
- `tests/e2e/`: `app.spec.ts` (core flows), `features.spec.ts` (compare, pictures, camera, dictation, projects, search, prompts and shortcuts) and `files.spec.ts` (attachments). The camera test uses Chromium's built-in fake camera; the dictation test substitutes a fake speech-recognition object.

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
- **Images.** OpenAI-compatible: user `content` becomes `[{type:"image_url", image_url:{url:"data:<mime>;base64,…"}}, {type:"text", text}]`. Anthropic: `[{type:"image", source:{type:"base64", media_type, data}}, {type:"text", text}]`, with the images first and no empty text block. A rejected request (HTTP 400) that contained images gets the "may not accept images" hint. The server accepts PNG, JPEG, WebP and GIF, up to 4 per message and 12 per request.
- **Compare history.** Each model gets its own earlier replies. Where it didn't answer a turn, it gets the first good reply from another model, without that model's reasoning.
- **Embeddings.** Semantic search uses `POST {base}/embeddings` with `{ model, input: string[], encoding_format: "float" }` and reads `data[].embedding` (OpenAI format), 32 inputs per request. The Anthropic API has no embeddings endpoint, so only keyword search is used with that format.
- **Rendering.** GitHub-flavoured Markdown (`remark-gfm`), LaTeX math (`remark-math` + KaTeX, `$…$` and `$$…$$` delimiters), raw HTML (`rehype-raw`, then `rehype-sanitize` with GitHub's allow-list), Mermaid diagrams (loaded on demand, `securityLevel: "strict"`), and SVG shown via `<img>` data URLs. Images are allowed from `http(s)` and `data:image/(png|jpeg|gif|webp|avif|svg+xml)` only. `package.json` overrides nested `katex` copies to the patched 0.19 release.
