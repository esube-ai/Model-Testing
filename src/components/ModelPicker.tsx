"use client";

import { useCallback, useRef, useState } from "react";
import { hostOf, sameRef, type ConnectionsState, type ModelRef } from "@/lib/client/connections";
import type { ConnectionStatus } from "./ConnectionsDialog";
import { CheckIcon, ChevronDownIcon, ColumnsIcon, SlidersIcon } from "./Icons";
import { cls, useDismiss } from "./ui";

export const MAX_COMPARE = 4;

interface Props {
  state: ConnectionsState;
  statuses: Record<string, ConnectionStatus>;
  selected: ModelRef[];
  onChange: (refs: ModelRef[]) => void;
  onManage: () => void;
  /** Open upward (composer at the bottom) or downward (composer in the middle). */
  placement?: "up" | "down";
}

const dot: Record<ConnectionStatus, string> = { ok: "bg-green-600", error: "bg-red-600", unknown: "bg-zinc-400" };

export function ModelPicker({ state, statuses, selected, onChange, onManage, placement = "up" }: Props) {
  const [open, setOpen] = useState(false);
  const [compareToggle, setCompareToggle] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const compare = compareToggle || selected.length > 1;
  const label = selected.length > 1 ? `${selected.length} models` : selected[0]?.model ?? "Choose a model";

  function pick(r: ModelRef) {
    if (!compare) {
      onChange([r]);
      setOpen(false);
      return;
    }
    const isOn = selected.some((s) => sameRef(s, r));
    if (isOn) {
      if (selected.length > 1) onChange(selected.filter((s) => !sameRef(s, r)));
    } else if (selected.length < MAX_COMPARE) {
      onChange([...selected, r]);
    }
  }

  function toggleCompare() {
    if (compare) {
      setCompareToggle(false);
      onChange(selected.slice(0, 1));
    } else setCompareToggle(true);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${label}. Change model`}
        data-testid="model-picker"
        className={`flex max-w-[14rem] items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink ${cls.focus}`}
      >
        {selected.length > 1 && <ColumnsIcon />}
        <span className="truncate">{label}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Models"
          className={`absolute right-0 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-1.5 shadow-xl ${placement === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <button type="button" role="menuitemcheckbox" aria-checked={compare} onClick={toggleCompare} className={cls.menuItem}>
            <ColumnsIcon />
            <span className="flex-1">
              <span className="block font-medium">Compare models</span>
              <span className="block text-xs text-muted">Send each message to up to {MAX_COMPARE} models side by side</span>
            </span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${compare ? "bg-accent" : "bg-raised ring-1 ring-line"}`} aria-hidden="true">
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${compare ? "left-[1.125rem]" : "left-0.5"}`} />
            </span>
          </button>
          <div className="my-1 border-t border-line" />
          <div className="max-h-72 overflow-y-auto">
            {state.connections.length === 0 && <p className="px-3 py-2 text-sm text-muted">No connections yet.</p>}
            {state.connections.map((c) => (
              <div key={c.id} role="group" aria-label={c.name} className="py-1">
                <p className="flex items-center gap-2 px-3 pt-1 pb-0.5 text-xs font-medium text-muted">
                  <span className={`h-2 w-2 rounded-full ${dot[statuses[c.id] ?? "unknown"]}`} aria-hidden="true" />
                  <span className="truncate">
                    {c.name}
                    {c.name !== hostOf(c.baseUrl) ? ` · ${hostOf(c.baseUrl)}` : ""}
                  </span>
                </p>
                {c.models.length === 0 && <p className="px-3 py-1 text-xs text-muted">No models — add some in Manage connections.</p>}
                {c.models.map((model) => {
                  const r = { connectionId: c.id, model };
                  const on = selected.some((s) => sameRef(s, r));
                  const full = compare && !on && selected.length >= MAX_COMPARE;
                  return (
                    <button
                      key={model}
                      type="button"
                      role={compare ? "menuitemcheckbox" : "menuitemradio"}
                      aria-checked={on}
                      disabled={full}
                      onClick={() => pick(r)}
                      className={`${cls.menuItem} disabled:opacity-40`}
                    >
                      <span className="min-w-0 flex-1 truncate">{model}</span>
                      {on && <CheckIcon />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
            className={cls.menuItem}
          >
            <SlidersIcon /> Manage connections…
          </button>
        </div>
      )}
    </div>
  );
}
