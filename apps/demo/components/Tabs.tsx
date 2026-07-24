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
    <div className="mb-6 flex gap-2 border-b border-[var(--line)]">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={t.disabled}
          onClick={() => !t.disabled && onChange(t.id)}
          title={t.disabled ? "Coming soon" : undefined}
          className={`border-b-2 px-5 py-3 font-sans text-[15px] font-medium ${
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
