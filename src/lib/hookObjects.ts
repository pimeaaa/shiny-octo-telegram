/**
 * Extract concrete objects from hook and early script for storyboard/enforcement.
 * Used so Scene 1 can include literal hook objects (e.g. "sponge" for Trypophobia).
 */

const ABSTRACT_WORDS = new Set([
  "fear", "mind", "instinct", "reaction", "thing", "something", "feeling", "feelings",
  "anxiety", "phobia", "panic", "stress", "emotion", "thought", "thoughts", "idea",
  "sense", "brain", "body", "people", "person", "someone", "everyone", "nothing",
  "everything", "anything", "way", "reason", "cause", "effect", "result", "kind",
  "type", "form", "level", "degree", "moment", "time", "life", "world", "reality",
  "truth", "fact", "myth", "the", "a", "an", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "must", "can", "this", "that", "these",
  "those", "it", "its", "they", "them", "we", "our", "you", "your", "he", "she",
  "his", "her", "their", "what", "which", "who", "when", "where", "why", "how",
]);

/** Take first N words from script (no punctuation in tokenization). */
function firstWords(text: string, n: number): string {
  const tokens = text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((s) => s.length > 0);
  return tokens.slice(0, n).join(" ");
}

/**
 * Extract concrete noun-like tokens from hook + first part of script.
 * Filters abstract words; returns lowercased unique list suitable for "MUST include" in scene 1.
 */
export function extractHookObjects(
  hook: string,
  voiceoverScript?: string,
  firstWordCount: number = 28
): string[] {
  const combined = voiceoverScript
    ? `${hook} ${firstWords(voiceoverScript, firstWordCount)}`
    : hook;
  const lower = combined.toLowerCase();
  const words = lower
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((s) => s.length > 1 && !ABSTRACT_WORDS.has(s));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const clean = w.replace(/^['-]+|['-]+$/g, "");
    if (clean.length < 2) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.slice(0, 3);
}
