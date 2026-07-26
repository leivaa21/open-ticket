/** A small legend so status is legible without relying on colour alone (accessibility, D3-06). */
const ITEMS: readonly { label: string; className: string }[] = [
  { label: "available", className: "border-line bg-panel" },
  { label: "your hold", className: "border-mine bg-mine/20" },
  { label: "held", className: "border-held/60 bg-held/20" },
  { label: "sold", className: "border-sold/50 bg-sold/20" },
];

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            className={`inline-block h-3.5 w-3.5 rounded-sm border ${item.className}`}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
