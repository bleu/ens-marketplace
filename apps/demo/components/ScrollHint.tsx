"use client";

import { useEffect, useRef, useState } from "react";

/// Wraps a horizontally-scrollable table (see /domains and /subnames listing
/// tables) with a fading edge + chevron hint on whichever side still has
/// content to reveal. Without this, the only affordance a wider-than-viewport
/// table gives is the thin native scrollbar track beneath the rows — easy to
/// miss, so users never discover columns like Highest offer / Last sale /
/// Status that only exist off-screen to the right.
///
/// Reads scroll position via a ref instead of hard-coding visibility, so the
/// hint disappears once there's nothing left to scroll to in that direction
/// (e.g. a viewport wide enough that the table already fits) rather than
/// permanently overlaying the last column.
export function ScrollHint({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <div ref={ref} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
      {canScrollLeft && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-10"
          style={{ background: "linear-gradient(90deg, var(--bg), transparent)" }}
        />
      )}
      {canScrollRight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end"
          style={{ background: "linear-gradient(270deg, var(--bg), transparent)" }}
        >
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="mr-1">
            <path d="M1 1l5 5-5 5" stroke="var(--fg-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
