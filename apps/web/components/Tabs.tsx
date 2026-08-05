import { ScrollHint } from "./ScrollHint";

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    // ScrollHint gives this strip the same fade+chevron affordance as the
    // listing tables when it's wider than the viewport (previously only a
    // thin scrollbar hinted at the overflow). The active tab is additionally
    // pinned via sticky positioning so its underline stays on-screen at the
    // scroll container's left edge instead of disappearing once scrolled
    // past, which otherwise left no visible active-state cue at all.
    // `no-scrollbar` hides the native scrollbar track/thumb here specifically —
    // with the chevron already signaling overflow, a plain gray scrollbar sitting
    // directly beneath the short salmao active-tab underline read as a second,
    // duplicated (and broken-looking) underline. Scrolling still works via
    // touch/trackpad/arrow keys, just without the visible track.
    <ScrollHint outerClassName="mb-6 min-w-0 flex-1" className="no-scrollbar border-b border-[var(--line)]">
      <div className="flex min-w-0 gap-2">
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            onClick={() => !t.disabled && onChange(t.id)}
            title={t.disabled ? "Coming soon" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 px-5 py-3 font-sans text-[15px] font-medium ${
              t.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
            }`}
            style={{
              color: active === t.id ? "var(--fg)" : "var(--fg-muted)",
              borderColor: active === t.id ? "var(--brand)" : "transparent",
              ...(active === t.id ? { position: "sticky", left: 0, background: "var(--bg)", zIndex: 10 } : {}),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </ScrollHint>
  );
}
