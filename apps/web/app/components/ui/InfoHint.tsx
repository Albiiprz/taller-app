'use client';

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

type InfoHintProps = {
  title?: string;
  text: string;
  className?: string;
};

export default function InfoHint({ title = "Ayuda", text, className = "" }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(ev: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-label={title}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-700 active:scale-[0.98]"
      >
        <Icon name="info" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border-2 border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700 shadow-lg">
          <p className="font-extrabold text-slate-900">{title}</p>
          <p className="mt-1 leading-snug">{text}</p>
        </div>
      )}
    </div>
  );
}
