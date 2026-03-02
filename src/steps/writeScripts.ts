import fs from "node:fs/promises";
import path from "node:path";
import { openai } from "../lib/openai.js";
import { JobSchema, type Job } from "../types/job.js";
import { ensureDir, fileExists } from "../lib/fs.js";
import { hashObject } from "../lib/hash.js";
import { ensureJobCache, ensureItemCache } from "../lib/jobCache.js";

function numberToWord(n: number): string {
  const map: Record<number, string> = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten",
    11: "eleven",
    12: "twelve",
  };
  return map[n] ?? String(n);
}

function pickContrastVariant(itemId: string): 0 | 1 | 2 {
  const n = Number.parseInt(itemId, 10);
  const idx = Number.isFinite(n) ? (n - 1) % 3 : 0;
  return (idx === 0 ? 0 : idx === 1 ? 1 : 2) as 0 | 1 | 2;
}

function getContrastTemplate(variant: 0 | 1 | 2): string {
  const templates = [
    `We're not talking about [normal thing]; we're talking about [extreme thing 1], [extreme thing 2], or [extreme thing 3].`,
    `This isn't just [normal thing]. It's [extreme thing 1], [extreme thing 2], and [extreme thing 3].`,
    `Forget [normal thing]. Think [extreme thing 1], [extreme thing 2], or [extreme thing 3].`,
  ] as const;
  return templates[variant];
}

function buildScriptPrompt(args: {
  itemId: string;
  introLine: string;
  hook: string;
  name: string;
  iconIdea: string;
  topic?: string;
  promptStyle: string;
  style: "fear" | "curiosity" | "educational" | "conspiracy";
}) {
  const { introLine, hook, name, iconIdea, topic, promptStyle, style, itemId } = args;

  const topicLine = topic ? ` The overarching topic is: ${topic}.` : "";

  const styleGuidance =
    style === "curiosity"
      ? "Tone: curious, fast, intriguing, playful suspense."
      : style === "educational"
        ? "Tone: clear, confident, fascinating, simple explanations."
        : style === "conspiracy"
          ? "Tone: secretive, intense, suspicious, but still factual sounding."
          : "Tone: visceral, dramatic, slightly ominous.";

  const contrastVariant = pickContrastVariant(itemId);
  const contrastTemplate = getContrastTemplate(contrastVariant);

  if (promptStyle === "shorts_viral_v2") {
    return `
You are an elite viral Shorts/TikTok scriptwriter.${topicLine}

Write a single paragraph voiceover script designed for maximum retention.

Opening must start exactly with:
"${introLine}"

Immediately after, deliver this hook:
"${hook}"

Structure:
1. Pattern interrupt + emotional tension
2. Clear definition in one sentence
3. Use this exact contrast structure for the examples:
"${contrastTemplate}"
4. Fascinating psychological or scientific insight
5. Personal trigger or diagnostic ending tied to:
"${iconIdea}"

${styleGuidance}

Language:
- Use strong sensory verbs
- Create curiosity gaps
- Avoid filler words

Rules:
- 80–110 words
- No emojis
- No markdown
- No bullet points
- No stage directions
- Final output must not contain any brackets or parentheses characters.

Return only the paragraph.
`;
  }

  // Default: shorts_ominous_v1 (existing behavior)
  return `
You are a dramatic, highly engaging scriptwriter for viral YouTube Shorts/TikToks.${topicLine}

Write a voiceover script as a single paragraph.

Opening must start exactly with:
"${introLine}"

Immediately deliver this hook:
"${hook}"

Define clearly in one sentence.

Use this exact contrast structure for the examples:
"${contrastTemplate}"

Provide a psychological or scientific explanation.

End with a punchy diagnostic line related to:
"${iconIdea}"

${styleGuidance}

Rules:
- 80–100 words
- No emojis
- No markdown
- No bullet points
- Final output must not contain any brackets or parentheses characters.

Return only the paragraph.
`;
}

async function generateScript(args: {
  itemId: string;
  index: number;
  name: string;
  hook: string;
  iconIdea: string;
  topic: string;
  intro: "name" | "numberAndName";
  promptStyle: string;
  style: "fear" | "curiosity" | "educational" | "conspiracy";
}) {
  const { itemId, index, name, hook, iconIdea, topic, intro, promptStyle, style } = args;
  const numberWord = numberToWord(index);
  const introLine =
    intro === "numberAndName" ? `Number ${numberWord}, ${name}.` : `${name}.`;

  const prompt = buildScriptPrompt({
    itemId,
    introLine,
    hook,
    name,
    iconIdea,
    topic,
    promptStyle,
    style,
  });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
  });

  return response?.choices[0]?.message?.content?.trim() ?? "";
}

export async function writeScripts(
  jobPath: string,
  limit?: number,
  force?: boolean,
) {
  const raw = await fs.readFile(jobPath, "utf8");
  const job: Job = JobSchema.parse(JSON.parse(raw));

  const scriptIntro = job.settings?.script?.intro ?? "name";
  const promptStyle = job.settings?.script?.promptStyle ?? "shorts_ominous_v1";
  const scriptStyle = job.settings?.script?.style ?? "fear";
  const normalizedTopic =
    job.topic && job.topic.trim() && job.topic.trim() !== "--"
      ? job.topic.trim()
      : job.seriesTitle?.trim() || "";

  const scriptsDir = path.join(path.dirname(jobPath), "scripts");
  await ensureDir(scriptsDir);

  ensureJobCache(job);

  const itemsToProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? job.items.slice(0, limit)
      : job.items;

  for (const item of itemsToProcess) {
    const scriptPath = path.join(scriptsDir, `${item.id}.txt`);
    const itemCache = ensureItemCache(job, item.id);

    const stepHash = hashObject({
      step: "writeScripts@6",
      promptStyle,
      intro: scriptIntro,
      style: scriptStyle,
      id: item.id,
      name: item.name,
      hook: item.hook,
      iconIdea: item.iconIdea,
      topic: normalizedTopic || null,
      model: "gpt-4o-mini",
      temperature: 0.8,
    });

    const prevHash = itemCache.writeScripts;
    const scriptExists = await fileExists(scriptPath);

    if (!force && prevHash === stepHash && scriptExists) {
      if (!item.voiceoverScript) {
        // Recover from disk if cache matches but field is missing
        const fromDisk = await fs.readFile(scriptPath, "utf8");
        item.voiceoverScript = fromDisk;
        console.log(`Recovered script for ${item.name} from disk (cache hit).`);
      } else {
        console.log(`Skipping script for ${item.name}, cache hit.`);
      }
      continue;
    }

    console.log(`Generating script for ${item.name}...`);

    const script = await generateScript({
      itemId: item.id,
      index: parseInt(item.id, 10),
      name: item.name,
      hook: item.hook,
      iconIdea: item.iconIdea,
      topic: normalizedTopic,
      intro: scriptIntro,
      promptStyle,
      style: scriptStyle,
    });

    item.voiceoverScript = script;
    await fs.writeFile(scriptPath, script, "utf8");

    itemCache.writeScripts = stepHash;
  }

  await fs.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");

  console.log("All scripts generated.");
}
