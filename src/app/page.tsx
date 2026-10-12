"use client";

import dynamic from "next/dynamic";

// The app keeps all state in browser storage, so it renders on the client only.
const ChatApp = dynamic(() => import("@/components/ChatApp").then((m) => m.ChatApp), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>,
});

export default function Home() {
  return <ChatApp />;
}
