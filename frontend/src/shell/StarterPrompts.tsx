import { useMemo } from "react";

// A pool of starter prompts for the blank conversation page. On each mount we
// sample a handful at random, so a fresh page feels different every time. The
// prompts deliberately span Aether's render modes — graph, timeline, diagram,
// comparison, map, plain prose — so whatever surfaces hints at the range of
// what can land beside the chat.
const POOL = [
  "The Odyssey, its characters, and their relationships to Jungian archetypes",
  "History of bowling",
  "Structure of the atom",
  "Timeline of the Apollo program",
  "How does a CPU execute an instruction?",
  "Compare the great apes",
  "The water cycle, explained",
  "Major schools of Greek philosophy and how they connect",
  "Rise and fall of the Roman Republic",
  "How does a transformer neural network work?",
  "The Medici family and their influence on the Renaissance",
  "Compare the inner and outer planets of the solar system",
  "A timeline of jazz, from ragtime to fusion",
  "How does photosynthesis turn light into sugar?",
  "The characters of Hamlet and how they betray one another",
  "Causes of the First World War",
  "How do vaccines train the immune system?",
  "The geological eras and the life that defined each",
  "Norse mythology: the gods and their kinships",
  "How does the stock market actually work?",
  "Compare the four classical elements across cultures",
  "The life cycle of a star",
  "Key battles of the American Civil War, in order",
  "How does the internet route a packet across the world?",
  "The plays of Shakespeare grouped by genre",
  "Evolution of the English language",
  "How does a refrigerator make things cold?",
  "The major world religions and what they share",
  "Tectonic plates and why earthquakes happen",
  "Compare democracy, oligarchy, and monarchy",
  "The Silk Road and the goods and ideas it carried",
  "How does DNA encode a living thing?",
  "Famous unsolved problems in mathematics",
  "The history of human flight, Kitty Hawk to the Moon",
  "How does a vinyl record store and play sound?",
  "The Cold War, told as a timeline of crises",
  "Compare the works of Mozart, Beethoven, and Bach",
  "What causes the seasons?",
  "The branches and powers of the US government",
  "How does fermentation turn grapes into wine?",
  "The dynasties of imperial China",
  "Black holes, from event horizon to singularity",
  "How does GPS know where you are?",
  "The major art movements of the 20th century",
  "Why is the sky blue and sunsets red?",
  "The Founding Fathers and their rivalries",
  "How does a jet engine produce thrust?",
  "Mythological creatures across world cultures",
  "The history of the English monarchy",
  "How does caffeine affect the brain?",
];

const SAMPLE_SIZE = 5;

function sample<T>(items: readonly T[], n: number): T[] {
  // Fisher–Yates partial shuffle on a copy — picks n distinct items at random.
  const copy = items.slice();
  for (let i = copy.length - 1; i > copy.length - 1 - n && i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Read sides asserted: both indices are provably in-bounds (i is loop-guarded,
    // j ∈ [0, i]), but under noUncheckedIndexedAccess a tuple-destructuring swap
    // assigns T | undefined back into T slots — which tsc -b rejects. A plain
    // three-step swap with non-null reads sidesteps that.
    // biome-ignore lint/style/noNonNullAssertion: provably in-bounds (see above)
    const tmp = copy[i]!;
    // biome-ignore lint/style/noNonNullAssertion: provably in-bounds (see above)
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(Math.max(0, copy.length - n));
}

interface StarterPromptsProps {
  onPick: (text: string) => void;
  disabled?: boolean;
}

export function StarterPrompts({ onPick, disabled }: StarterPromptsProps) {
  // Pick once per mount so the pills don't reshuffle on every render.
  const prompts = useMemo(() => sample(POOL, SAMPLE_SIZE), []);

  return (
    <div className="flex flex-wrap justify-center gap-2 max-md:px-2">
      {prompts.map((prompt, i) => (
        <button
          key={prompt}
          type="button"
          disabled={disabled}
          onClick={() => onPick(prompt)}
          style={{ "--i": i } as React.CSSProperties}
          className="starter-pill rounded-full border border-border bg-surface px-4 py-2 text-sm text-content transition-colors hover:border-transparent hover:bg-gradient-to-r hover:from-brand-pink hover:to-brand-violet hover:text-white disabled:pointer-events-none disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
