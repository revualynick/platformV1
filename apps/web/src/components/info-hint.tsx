"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

interface InfoHintProps {
  /** A glossary key — the definition renders from lib/glossary.ts. */
  entry?: GlossaryKey;
  /** Or literal text, for one-off hints. */
  text?: string;
  /** Optional heading override; defaults to the glossary term. */
  label?: string;
}

/**
 * Small ⓘ affordance that opens an accessible popover with a plain-
 * language definition. Place next to any metric or term a first-time
 * user wouldn't already know.
 */
export function InfoHint({ entry, text, label }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  const glossary = entry ? GLOSSARY[entry] : null;
  const heading = label ?? glossary?.term;
  const short = text ?? glossary?.short ?? "";
  const long = glossary && "long" in glossary ? glossary.long : undefined;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!short) return null;

  return (
    <span ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={heading ? `What is ${heading}?` : "More information"}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-stone-300 text-[10px] font-semibold text-stone-400 hover:border-forest hover:text-forest"
      >
        i
      </button>
      {open && (
        <span
          id={popoverId}
          role="tooltip"
          className="absolute left-1/2 top-6 z-40 w-64 -translate-x-1/2 rounded-xl border border-stone-200/80 bg-surface p-3 text-left shadow-lg"
        >
          {heading && (
            <span className="mb-1 block text-xs font-semibold text-stone-800">
              {heading}
            </span>
          )}
          <span className="block text-xs font-normal normal-case tracking-normal text-stone-600">
            {short}
          </span>
          {long && (
            <span className="mt-1.5 block text-xs font-normal normal-case tracking-normal text-stone-500">
              {long}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
