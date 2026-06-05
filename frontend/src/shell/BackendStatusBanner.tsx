import { useHealth } from "../hooks/useHealth";

// Dev-only visual cue when the backend can't be reached, so you don't have to have
// the console open to notice the sidebar is empty because the API is down. Hidden
// entirely in production (where a real outage is a different conversation).
export function BackendStatusBanner() {
  const { isError } = useHealth();

  if (!import.meta.env.DEV || !isError) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-50 bg-red-600 px-4 py-1.5 text-center text-xs font-medium text-white shadow-md"
    >
      ⚠ Backend unreachable on :8000 — run{" "}
      <code className="rounded bg-black/20 px-1">bun run dev</code> in{" "}
      <code className="rounded bg-black/20 px-1">backend/</code>
    </div>
  );
}
