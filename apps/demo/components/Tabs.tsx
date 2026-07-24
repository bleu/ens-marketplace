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
    // min-w-0 lets this shrink below its content width inside a flex parent;
    // overflow-x-auto then contains any remaining overflow to this row's own
    // scrollbar instead of blowing out the page's width (same pattern as the
    // domain-listing table's overflow-x-auto wrapper).
    <div className="mb-6 flex min-w-0 gap-2 overflow-x-auto border-b border-[var(--line)]">
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
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
