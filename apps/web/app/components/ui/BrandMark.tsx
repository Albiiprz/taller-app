'use client';

import React from "react";

type Props = {
  compact?: boolean;
  className?: string;
};

// Placeholder brand mark. If you have the official logo, replace this component
// to render <img src="/brand/logo.svg" ... /> (or similar).
export default function BrandMark({ compact, className }: Props) {
  return (
    <div className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      <span
        aria-hidden="true"
        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-navy)] text-white shadow-sm"
        style={{
          boxShadow: "0 10px 20px rgba(11, 42, 74, 0.18)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 16V8a2 2 0 0 1 2-2h8l3 3h3a2 2 0 0 1 2 2v5" />
          <path d="M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
          <path d="M17 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
          <path d="M9 20h6" />
        </svg>
      </span>

      <div className="leading-tight">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-extrabold tracking-[0.14em] text-[color:var(--brand-navy)] uppercase">
            Talleres
          </span>
          {!compact ? (
            <span className="rounded-full bg-[color:var(--brand-orange-soft)] px-2 py-1 text-[10px] font-extrabold text-[color:var(--brand-orange-ink)]">
              App
            </span>
          ) : null}
        </div>
        <div className="text-lg font-black text-slate-900">
          MALU
          <span className="ml-1 text-[color:var(--brand-orange)]">+</span>
        </div>
      </div>
    </div>
  );
}

