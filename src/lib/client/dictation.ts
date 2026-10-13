"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal typing for the Web Speech API (not in TypeScript's DOM library). */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it for this site in your browser's settings.",
  "service-not-allowed": "Your browser's speech service isn't available.",
  "no-speech": "No speech was heard. Try again.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection.",
};

/**
 * Speech-to-text with the browser's built-in recognition. Some browsers (e.g. Chrome) send
 * the audio to their own speech service; it never goes to the model provider.
 */
export function useDictation(onFinalText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const callback = useRef(onFinalText);

  useEffect(() => {
    callback.current = onFinalText;
  }, [onFinalText]);

  useEffect(() => {
    // Detect support after mounting, so server and client render the same markup.
    setSupported(!!getRecognition()); // eslint-disable-line react-hooks/set-state-in-effect
    return () => rec.current?.stop();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (finalText) callback.current(finalText.trim());
      setInterim(interimText);
    };
    r.onerror = (e) => setError(ERRORS[e.error] ?? "Dictation stopped because of an error.");
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  }, []);

  return { supported, listening, interim, error, start, stop, clearError: () => setError(null) };
}
