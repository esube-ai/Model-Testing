export type ApiFormat = "openai" | "anthropic";

/** Connection details supplied per request by the user. Never persisted on the server. */
export interface Connection {
  baseUrl: string;
  apiKey: string;
  format: ApiFormat;
  model: string;
}

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

/** A picture sent with a user message (for vision models). `data` is base64, no data: prefix. */
export interface ImagePart {
  mime: ImageMime;
  data: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** User only: pictures sent with the message. */
  images?: ImagePart[];
  /** Assistant only: the model's reasoning, if it returned any. Some models require it back. */
  reasoning?: string;
}

export interface ChatOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Defaults to true. When false, the whole reply arrives as a single text chunk. */
  stream?: boolean;
  /** Abort to cancel the request (e.g. the user pressed Stop). */
  signal?: AbortSignal;
  /** Max wait for the provider to respond, and max silence between stream chunks. */
  timeoutMs?: number;
  /** Base delay for exponential backoff between retries. */
  retryBaseMs?: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatMetadata {
  model?: string;
  finishReason?: string;
  usage: Usage;
  latencyMs: number;
  format: ApiFormat;
}

export type ChatEvent =
  | { type: "text"; text: string }
  /** The model's reasoning ("thinking"), streamed separately from the reply. */
  | { type: "reasoning"; text: string }
  | { type: "done"; metadata: ChatMetadata };
