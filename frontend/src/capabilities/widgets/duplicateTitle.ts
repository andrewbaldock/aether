// Append "(copy)" to a spec title for a duplicated widget. Safe on undefined (an
// untitled widget stays untitled). Used by every capability's duplicateEntry so the
// copy reads as a distinct card until the user regenerates it.
export function copyTitle(title: string | undefined): string | undefined {
  if (!title) return title;
  return `${title} (copy)`;
}
