"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native <dialog> modal: focus trap, Esc to close and inert background for free. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className={`m-auto w-[calc(100%-32px)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-[14px] border border-rule bg-surface p-0 text-ink shadow-2xl backdrop:bg-[#0b1020]/45`}
    >
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <h2 id="dialog-title" className="text-[15px] font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink">
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
