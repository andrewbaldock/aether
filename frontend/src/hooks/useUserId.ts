import { useState } from "react";

const STORAGE_KEY = "aether_user_id";

// Returns a stable anonymous UUID for this browser. Creates one on first visit
// and persists it in localStorage so it survives page refreshes.
export function useUserId(): string {
  const [userId] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  });
  return userId;
}
