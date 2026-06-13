// Best-effort completion of a truncated JSON string.
//
// When a streamed tool_use is cut off mid-flight (stop_reason="max_tokens"), the
// accumulated input is partial: an open array/object with a dangling element. A
// strict JSON.parse throws. This rewinds to the last point where the structure was
// cleanly closable — the end of a completed element — then appends the brackets
// needed to balance the still-open containers, so we can salvage the rows/entities
// that DID stream rather than losing the whole turn.
//
// It is deliberately small and conservative. It scans once, tracking string/escape
// state and a stack of open containers. It remembers `safeEnd`: the index just past
// the last position where every open container could be closed to yield valid JSON
// — that's right after a closed value/container, or right after a separator that
// itself follows a complete element. A trailing partial element (an unterminated
// string, a half-written number, a key with no value) is simply dropped. This is
// not a general JSON repair; it only handles end-truncation of a valid prefix,
// which is exactly the shape the streamed tool input produces on a token cutoff.

export function closeTruncatedJson(raw: string): string {
  const stack: string[] = []; // expected closers, e.g. "}" or "]"
  let inString = false;
  let escaped = false;
  // Index+1 of the last position where every open container could be closed to
  // yield valid JSON — i.e. right after a completed element (a "}"/"]" close, or a
  // separating "," that follows one). Truncated keys, half-written primitives, and
  // unterminated strings sit past this point and get dropped.
  let safeEnd = 0;
  // The closers still open AT the safe point. We must restore this when we rewind:
  // the live `stack` may have grown into the truncated tail (a half-written element
  // pushed a "{" that never closed), and balancing against that would emit a closer
  // for a container we're about to discard.
  let safeStack: string[] = [];

  // Mark index+1 as a clean close point and snapshot the open containers there.
  const markSafe = (i: number) => {
    safeEnd = i + 1;
    safeStack = stack.slice();
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i] as string;

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
    } else if (ch === "}" || ch === "]") {
      // A container just closed — every container still on the stack can be closed
      // cleanly right here. This is the one truly safe rewind point: a *completed*
      // element. (Object-array elements — rows/entities/data — always end on "}",
      // so this captures them exactly.)
      stack.pop();
      markSafe(i);
    } else if (ch === ",") {
      // Separator AFTER a completed element. Only safe if the most recent thing was
      // itself a clean close — which holds iff safeEnd already sits at the prior
      // char run's end. We conservatively mark safe here and trim the comma below;
      // a comma following an incomplete value can't occur in well-formed prefixes.
      if (safeEnd === i) markSafe(i);
    }
    // ":", whitespace, primitive chars, keys: never a safe close point on their own.
    // Trailing primitives/keys in a truncated tail are simply dropped.
  }

  // Rewind to the last clean close point, drop a trailing separator/colon, then
  // balance the containers that were open AT that point (not the live stack, which
  // may have descended into the discarded tail).
  let out = raw.slice(0, safeEnd).replace(/[,:]\s*$/, "");
  for (let i = safeStack.length - 1; i >= 0; i--) out += safeStack[i];
  return out;
}

// Parse `raw`; if that fails, try once more after best-effort closing. Returns the
// parsed value or undefined. Never throws.
export function parseBestEffort(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through to repair */
  }
  try {
    return JSON.parse(closeTruncatedJson(raw));
  } catch {
    return undefined;
  }
}
