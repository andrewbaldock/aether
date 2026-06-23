import { ROLE_COLOR, type Role } from "./nodes";

// A small key so the diagram reads on its own — what the colours mean. The pills
// are always fully legible; whichever role is currently lit in the loop gains a
// glow, mirroring the active node(s) below.
const ITEMS: { role: Role; label: string }[] = [
  { role: "frontend", label: "Frontend" },
  { role: "backend", label: "Backend" },
  { role: "claude", label: "Chosen LLM" },
  { role: "external", label: "External data" },
  { role: "tool", label: "Tool" },
  { role: "done", label: "Done" },
];

export function Legend({ activeRoles }: { activeRoles: Set<Role> }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2 text-[11px]">
      {ITEMS.map((item) => {
        const active = activeRoles.has(item.role);
        const color = ROLE_COLOR[item.role];
        return (
          <span
            key={item.role}
            className="flex items-center gap-1.5 text-content transition-all duration-200"
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full transition-all duration-200"
              style={{
                backgroundColor: color,
                boxShadow: active ? `0 0 8px ${color}` : "none",
              }}
            />
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
