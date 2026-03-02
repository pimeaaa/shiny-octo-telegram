import { openai } from "./openai.js";

export type GeneratedItem = {
  id: string;
  name: string;
  hook: string;
  iconIdea: string;
};

export async function generateItemsFromTopic(args: {
  topic: string;
  count: number;
}): Promise<GeneratedItem[]> {
  const { topic, count } = args;

  const prompt = `
You are an expert viral content strategist.

Generate ${count} short-form video topics for the theme: "${topic}"

Each item must include:
- name: short title (1–4 words)
- hook: curiosity-driven, viral hook sentence
- iconIdea: simple visual metaphor idea

Rules:
- Hooks must feel shocking, intriguing, or emotionally engaging.
- Avoid generic phrases.
- Keep icon ideas visually clear and minimal.
- No numbering inside text fields.
- No emojis.

Return STRICT JSON array format like:

[
  { "name": "...", "hook": "...", "iconIdea": "..." }
]
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.9,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.choices?.[0]?.message?.content ?? "[]";

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Failed to parse AI items JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("AI items output is not an array");
  }

  return parsed.map((item: unknown, index: number) => {
    const o = item as Record<string, unknown>;
    const name = typeof o?.name === "string" ? o.name : "";
    const hook = typeof o?.hook === "string" ? o.hook : "";
    const iconIdea = typeof o?.iconIdea === "string" ? o.iconIdea : "";
    if (!name || !hook || !iconIdea) {
      throw new Error(
        `Invalid AI item at index ${index}. Required: name, hook, iconIdea`
      );
    }
    return {
      id: String(index + 1).padStart(2, "0"),
      name,
      hook,
      iconIdea,
    };
  });
}
