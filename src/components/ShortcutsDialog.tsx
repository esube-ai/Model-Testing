"use client";

import { Modal, shortcutLabel } from "./ui";

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Mod+Shift+O", action: "New chat" },
  { keys: "Mod+K", action: "Search chats" },
  { keys: "Mod+B", action: "Show or hide the sidebar" },
  { keys: "Shift+Esc", action: "Focus the message box" },
  { keys: "Esc", action: "Stop generating" },
  { keys: "Enter", action: "Send message" },
  { keys: "Shift+Enter", action: "New line" },
  { keys: "/", action: "Saved prompts (at the start of the message box)" },
  { keys: "Mod+/", action: "Show keyboard shortcuts" },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width="28rem" testId="shortcuts-dialog">
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} className="border-b border-line last:border-0">
              <td className="py-2 pr-4">{s.action}</td>
              <td className="py-2 text-right">
                <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-sans text-xs">{shortcutLabel(s.keys)}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
