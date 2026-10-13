"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import type { ImageRef } from "@/lib/client/conversations";
import { useDictation } from "@/lib/client/dictation";
import { imageUrl, isImageFile, MAX_IMAGES_PER_MESSAGE } from "@/lib/client/images";
import { filterPrompts, type SavedPrompt } from "@/lib/client/prompts";
import { ACCEPT } from "@/lib/rag/extract";
import { CameraDialog } from "./CameraDialog";
import { ArrowUpIcon, BookIcon, CameraIcon, CloseIcon, MicIcon, PaperclipIcon, PlusIcon, SlidersIcon, StopIcon } from "./Icons";
import { cls, useDismiss } from "./ui";

/** Lets the page hand dropped files to the message box. */
export interface ComposerHandle {
  addFiles: (files: File[]) => void;
  focus: () => void;
}

interface Props {
  handleRef?: Ref<ComposerHandle>;
  generating: boolean;
  /** No connection yet: typing is disabled. */
  disabled: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSend: (text: string, images: ImageRef[]) => void;
  onStop: () => void;
  /** Store a picture for the current chat and return its reference. */
  onAddPicture: (picture: Blob, name: string) => Promise<ImageRef>;
  /** Documents (PDF, Word, text) go to the chat's files. */
  onAttachFiles: (files: File[]) => void;
  prompts: SavedPrompt[];
  onManagePrompts: () => void;
  onOpenSettings?: () => void;
  /** The model picker element, shown in the bottom bar. */
  picker: ReactNode;
  /** Attached files strip, shown above the text. */
  attachments?: ReactNode;
}

/** A thumbnail of a stored picture, with an optional remove button. */
export function ImageThumb({ image, onRemove, size = "h-16 w-16" }: { image: ImageRef; onRemove?: () => void; size?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let current: string | null = null;
    let cancelled = false;
    void imageUrl(image.id).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
      } else {
        current = u;
        setUrl(u);
      }
    });
    return () => {
      cancelled = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [image.id]);
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-lg border border-line bg-raised ${size}`} data-testid="image-thumb">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={image.name} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center text-xs text-muted">…</span>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove picture ${image.name}`} className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80">
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

export function Composer(props: Props) {
  const { generating, disabled, onSend, onStop, onAddPicture, onAttachFiles, prompts } = props;
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageRef[]>([]);
  const [busyImages, setBusyImages] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [camera, setCamera] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const [promptMenuClosed, setPromptMenuClosed] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const closePlus = useCallback(() => setPlusOpen(false), []);
  useDismiss(plusRef, plusOpen, closePlus);

  const appendDictation = useCallback((t: string) => setText((prev) => (prev && !/\s$/.test(prev) ? `${prev} ${t}` : prev + t)), []);
  const dictation = useDictation(appendDictation);

  // Grow with content, up to a limit.
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 280)}px`;
  }, [text]);

  // "/" at the start opens the saved-prompt menu, filtered by what follows.
  const slash = /^\/(\S*)$/.exec(text);
  const promptMatches = slash && !promptMenuClosed ? filterPrompts(prompts, slash[1]).slice(0, 8) : [];
  const promptMenuOpen = !!slash && !promptMenuClosed;

  async function addFiles(files: File[]) {
    const pictures = files.filter(isImageFile);
    const docs = files.filter((f) => !isImageFile(f));
    if (docs.length) onAttachFiles(docs);
    if (!pictures.length) return;
    const room = MAX_IMAGES_PER_MESSAGE - images.length - busyImages;
    if (room <= 0 || pictures.length > room) setImageError(`You can send up to ${MAX_IMAGES_PER_MESSAGE} pictures per message.`);
    for (const p of pictures.slice(0, Math.max(0, room))) {
      setBusyImages((n) => n + 1);
      try {
        const ref = await onAddPicture(p, p.name || "photo.jpg");
        setImages((list) => [...list, ref]);
      } catch (e) {
        setImageError((e as Error).message || "That picture couldn't be added.");
      } finally {
        setBusyImages((n) => n - 1);
      }
    }
  }

  function submit() {
    if (generating || disabled || busyImages) return;
    if (!text.trim() && images.length === 0) return;
    dictation.stop();
    onSend(text.trim(), images);
    setText("");
    setImages([]);
    setImageError(null);
  }

  function choosePrompt(p: SavedPrompt) {
    setText(p.content);
    setPromptMenuClosed(true);
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (promptMenuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = promptMatches.length + 1; // + "Manage prompts…"
        setPromptIndex((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (promptIndex < promptMatches.length) choosePrompt(promptMatches[promptIndex]);
        else props.onManagePrompts();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPromptMenuClosed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.files].filter(isImageFile);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  // A stable handle (created once) that always calls the latest addFiles.
  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });
  useImperativeHandle(props.handleRef, () => ({ addFiles: (files: File[]) => void addFilesRef.current(files), focus: () => ref.current?.focus() }), []);

  const canSend = !disabled && !busyImages && (!!text.trim() || images.length > 0);

  return (
    <div className="relative">
      {promptMenuOpen && (
        <div role="listbox" aria-label="Saved prompts" className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <p className="px-3 pt-1 pb-1 text-xs font-medium text-muted">Saved prompts</p>
          {promptMatches.length === 0 && <p className="px-3 py-2 text-sm text-muted">No saved prompt matches “{slash?.[1]}”.</p>}
          {promptMatches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === promptIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choosePrompt(p)}
              className={`${cls.menuItem} ${i === promptIndex ? "bg-raised" : ""}`}
            >
              <BookIcon />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.title}</span>
                <span className="block truncate text-xs text-muted">{p.content}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={promptIndex === promptMatches.length}
            onMouseDown={(e) => e.preventDefault()}
            onClick={props.onManagePrompts}
            className={`${cls.menuItem} ${promptIndex === promptMatches.length ? "bg-raised" : ""} text-muted`}
          >
            Manage prompts…
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-2xl border border-line bg-surface p-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] focus-within:border-muted"
      >
        {props.attachments}
        {(images.length > 0 || busyImages > 0) && (
          <div className="mb-2 flex flex-wrap gap-2 px-1" aria-label="Pictures to send">
            {images.map((img) => (
              <ImageThumb key={img.id} image={img} onRemove={() => setImages((list) => list.filter((x) => x.id !== img.id))} />
            ))}
            {Array.from({ length: busyImages }, (_, i) => (
              <div key={`busy-${i}`} className="flex h-16 w-16 animate-pulse items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">
                …
              </div>
            ))}
          </div>
        )}
        {imageError && (
          <p role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {imageError}
            <button type="button" onClick={() => setImageError(null)} aria-label="Dismiss" className="rounded p-0.5">
              <CloseIcon />
            </button>
          </p>
        )}
        <label htmlFor="composer" className="sr-only">
          Message
        </label>
        <textarea
          id="composer"
          ref={ref}
          rows={1}
          value={text}
          autoFocus={props.autoFocus}
          onChange={(e) => {
            setText(e.target.value);
            setPromptMenuClosed(false);
            setPromptIndex(0);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={disabled ? "Add a connection to start chatting" : (props.placeholder ?? "How can I help you today?")}
          disabled={disabled}
          aria-describedby="composer-hint"
          className="block max-h-72 min-h-[2.75rem] w-full resize-none bg-transparent px-2 py-2 text-base text-ink placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />
        <p id="composer-hint" className="sr-only">
          Enter to send, Shift+Enter for a new line. Type / for saved prompts.
        </p>
        {dictation.listening && (
          <p className="px-2 pb-1 text-sm text-muted" role="status">
            Listening…{dictation.interim ? ` ${dictation.interim}` : ""}
          </p>
        )}
        {dictation.error && (
          <p role="alert" className="px-2 pb-1 text-sm text-red-700 dark:text-red-400">
            {dictation.error}
          </p>
        )}

        <div className="flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={`${ACCEPT},image/*`}
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) void addFiles(files);
            }}
          />
          <div ref={plusRef} className="relative">
            <button
              type="button"
              onClick={() => setPlusOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={plusOpen}
              aria-label="Add files, photos and more"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <PlusIcon />
            </button>
            {plusOpen && (
              <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                <button
                  type="button"
                  role="menuitem"
                  className={cls.menuItem}
                  onClick={() => {
                    setPlusOpen(false);
                    fileRef.current?.click();
                  }}
                >
                  <PaperclipIcon /> Upload files or photos
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cls.menuItem}
                  onClick={() => {
                    setPlusOpen(false);
                    setCamera(true);
                  }}
                >
                  <CameraIcon /> Take a photo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cls.menuItem}
                  onClick={() => {
                    setPlusOpen(false);
                    setText("/");
                    setPromptMenuClosed(false);
                    ref.current?.focus();
                  }}
                >
                  <BookIcon /> Use a saved prompt
                </button>
                {props.onOpenSettings && (
                  <button
                    type="button"
                    role="menuitem"
                    className={cls.menuItem}
                    onClick={() => {
                      setPlusOpen(false);
                      props.onOpenSettings?.();
                    }}
                  >
                    <SlidersIcon /> Chat settings
                  </button>
                )}
              </div>
            )}
          </div>
          {dictation.supported && (
            <button
              type="button"
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Stop dictation" : "Dictate (speech to text)"}
              title={dictation.listening ? "Stop dictation" : "Dictate — your browser converts speech to text"}
              disabled={disabled}
              className={`flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${dictation.listening ? "animate-pulse bg-accent-soft text-accent" : "text-muted hover:bg-raised hover:text-ink"}`}
            >
              <MicIcon />
            </button>
          )}
          <div className="flex-1" />
          {props.picker}
          {generating ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              title="Stop (Esc)"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-canvas hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-ink hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </form>
      {camera && (
        <CameraDialog
          onClose={() => setCamera(false)}
          onCapture={(blob) => void addFiles([new File([blob], `photo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`, { type: "image/jpeg" })])}
        />
      )}
    </div>
  );
}
