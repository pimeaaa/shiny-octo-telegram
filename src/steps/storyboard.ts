import fs from "node:fs/promises";
import path from "node:path";
import { openai } from "../lib/openai.js";
import {
  JobSchema,
  StoryboardSchema,
  StoryboardSceneSchema,
  type Storyboard,
  type StoryboardScene,
} from "../types/job.js";
import { loadCharacterProfile } from "../config/character.js";
import { hashObject } from "../lib/hash.js";
import { ensureJobCache, ensureItemCache } from "../lib/jobCache.js";
import { extractHookObjects } from "../lib/hookObjects.js";

type ScriptStyle = "fear" | "curiosity" | "educational" | "conspiracy";

/** Strip markdown code fences so we can parse JSON from model output. */
function stripJsonCodeFences(text: string): string {
  let s = text.trim();
  const open = s.startsWith("```");
  if (open) {
    s = s.slice(3);
    if (s.startsWith("json")) s = s.slice(4);
    s = s.replace(/^\s*\n/, "");
  }
  if (s.endsWith("```")) s = s.slice(0, -3).trimEnd();
  return s;
}

/** Word count from voiceover script for adaptive scene count. */
function getWordCount(script: string): number {
  return script
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0).length;
}

/** Adaptive scene count from script length; clamp to [min, max]. */
function getAdaptiveSceneCount(
  wordCount: number,
  minScenes: number,
  maxScenes: number
): number {
  let n: number;
  if (wordCount <= 70) n = 3;
  else if (wordCount <= 95) n = 4;
  else if (wordCount <= 125) n = 5;
  else if (wordCount <= 160) n = 6;
  else n = 7;
  n = Math.min(8, n);
  return Math.max(minScenes, Math.min(maxScenes, n));
}

function getStyleGuidance(style: ScriptStyle): string {
  if (style === "curiosity") return "Tone: curious, fast, intriguing, playful suspense.";
  if (style === "educational") return "Tone: clear, confident, fascinating, simple explanations.";
  if (style === "conspiracy") return "Tone: secretive, intense, suspicious, but still grounded.";
  return "Tone: visceral, dramatic, slightly ominous.";
}

function clampBeatsCount(min: number, max: number): { beatsMin: number; beatsMax: number } {
  const clampedMin = Math.max(3, Math.min(9, min));
  const clampedMax = Math.max(3, Math.min(9, max));
  return {
    beatsMin: Math.min(clampedMin, clampedMax),
    beatsMax: Math.max(clampedMin, clampedMax),
  };
}

function normalizeSceneMotion(m: unknown): "none" | "zoomIn" | "zoomSlow" {
  if (m === "none" || m === "zoomIn" || m === "zoomSlow") return m;
  return "none";
}

/** Normalize raw AI scenes to schema; ensure exactly N scenes with valid fields. */
function normalizeScenesToSchema(args: {
  rawScenes: unknown[];
  sceneCount: number;
  defaultMotion: "none" | "zoomIn" | "zoomSlow";
}): StoryboardScene[] {
  const { rawScenes, sceneCount, defaultMotion } = args;
  const arr = Array.isArray(rawScenes) ? rawScenes : [];

  const normalized: StoryboardScene[] = arr.slice(0, sceneCount).map((s: unknown, idx: number) => {
    const o = (s as Record<string, unknown>) ?? {};
    return {
      sceneId: idx + 1,
      shot: normalizeShot(o?.shot) as "wide" | "medium" | "close",
      intensity: normalizeIntensity(o?.intensity),
      visual: String(o?.visual ?? "").trim() || "Nico on white background",
      nicoAction: String(o?.nicoAction ?? "").trim() || "neutral",
      props: Array.isArray(o?.props) ? (o.props as string[]).map(String).slice(0, 4) : [],
      weight: typeof o?.weight === "number" && o.weight > 0 ? o.weight : 1,
      motion: normalizeSceneMotion(o?.motion ?? defaultMotion),
      priority: (o?.priority === "must" || o?.priority === "should" || o?.priority === "could"
        ? o.priority
        : undefined) as "must" | "should" | "could" | undefined,
    };
  });

  while (normalized.length < sceneCount) {
    const last = normalized[normalized.length - 1];
    normalized.push({
      sceneId: normalized.length + 1,
      shot: last?.shot ?? "medium",
      intensity: last?.intensity ?? "medium",
      visual: last?.visual ?? "Nico on white background",
      nicoAction: last?.nicoAction ?? "neutral",
      props: last?.props ?? [],
      weight: last?.weight ?? 1,
      motion: last?.motion ?? defaultMotion,
      priority: last?.priority,
    });
  }

  return normalized.slice(0, sceneCount).map((s, i) => ({ ...s, sceneId: i + 1 }));
}

function ensureValidPanelIndex(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(9, Math.round(n)));
}

function normalizeShot(shot: unknown): "wide" | "medium" | "close" {
  if (shot === "wide" || shot === "medium" || shot === "close") return shot;
  return "medium";
}

function normalizeIntensity(intensity: unknown): "low" | "medium" | "high" {
  if (intensity === "low" || intensity === "medium" || intensity === "high") return intensity;
  if (intensity === "very low") return "low";
  if (intensity === "very high" || intensity === "extreme") return "high";
  return "medium";
}

function normalizeMotion(motion: unknown): "none" | "zoomIn" | "zoomOut" {
  if (motion === "none" || motion === "zoomIn" || motion === "zoomOut") return motion;
  return "none";
}

type NormalizedBeat = {
  beatId: number;
  panelIndex: number;
  shot: "wide" | "medium" | "close";
  intensity: "low" | "medium" | "high";
  visual: string;
  nicoAction: string;
  props: string[];
  weight?: number;
  motion: "none" | "zoomIn" | "zoomOut";
};

function normalizeBeatsToSchema(args: {
  beats: unknown[];
  beatsMin: number;
  beatsMax: number;
  defaultMotion: "none" | "zoomIn" | "zoomOut";
}): NormalizedBeat[] {
  const { beatsMin, beatsMax, defaultMotion } = args;
  const beats = Array.isArray(args.beats) ? args.beats : [];

  const cleaned: NormalizedBeat[] = beats
    .slice(0, 9)
    .map((b: unknown, idx: number) => {
      const o = b as Record<string, unknown>;
      return {
        beatId: typeof o?.beatId === "number" ? o.beatId : idx + 1,
        panelIndex: ensureValidPanelIndex((o?.panelIndex as number) ?? idx + 1),
        shot: normalizeShot(o?.shot),
        intensity: normalizeIntensity(o?.intensity),
        visual: String(o?.visual ?? "").trim(),
        nicoAction: String(o?.nicoAction ?? "").trim(),
        props: Array.isArray(o?.props) ? (o.props as string[]).map(String).slice(0, 4) : [],
        weight: typeof o?.weight === "number" ? o.weight : undefined,
        motion: normalizeMotion(o?.motion ?? defaultMotion),
      };
    })
    .filter((b) => b.visual.length >= 3 && b.nicoAction.length >= 3) as NormalizedBeat[];

  let result = cleaned;

  if (result.length > beatsMax) {
    result = result.slice(0, beatsMax);
  }

  while (result.length < beatsMin) {
    const last = result[result.length - 1];
    if (!last) break;
    const duplicated: NormalizedBeat = {
      ...last,
      beatId: result.length + 1,
      panelIndex: ensureValidPanelIndex(result.length + 1),
      intensity: "medium",
      motion: last.motion,
    };
    if (last.weight !== undefined) duplicated.weight = last.weight;
    result = [...result, duplicated];
  }

  return result.map((b, i) => ({ ...b, beatId: i + 1 }));
}

function buildStoryboardPromptV2(args: {
  topic?: string;
  subjectName: string;
  hook: string;
  voiceoverScript: string;
  iconIdea: string;
  style: ScriptStyle;
  beatsMin: number;
  beatsMax: number;
  defaultMotion: "none" | "zoomIn" | "zoomOut";
}): string {
  const {
    topic,
    subjectName,
    hook,
    voiceoverScript,
    iconIdea,
    style,
    beatsMin,
    beatsMax,
    defaultMotion,
  } = args;

  const topicLine = topic ? `Overarching topic: ${topic}\n` : "";
  const styleGuidance = getStyleGuidance(style);

  return `
You are a storyboard director for a 3x3 comic grid explainer video.

${topicLine}
Subject: ${subjectName}

Global rules for every panel:
- Pure white background only, absolutely no scenery and no environments.
- Do not mention sky, stars, space backdrops, galaxies as backgrounds, cityscapes, rooms, landscapes, or any "scene".
- Every panel must feel like it was drawn on blank white paper.
- No text anywhere, no speech bubbles, no captions.
- Do not use letters, numbers, punctuation, emojis, or readable symbols (no question marks, no alphanumeric glyphs).
- Nico must appear in every single panel.
- Props must be minimal and symbolic (simple shapes, icons, silhouettes), never text-like.
- Thin black borders between panels (handled later), you only describe what is inside panels.

You will create between ${beatsMin} and ${beatsMax} beats, each beat maps to one grid panel.
Panels are numbered 1 to 9, left-to-right, top-to-bottom.
Use unique panelIndex for each beat in increasing order starting at 1.

Rhythm mapping, follow this structure strictly:
1) Beat 1: Intro plus hook moment, match the hook energy.
2) Beat 2: Clear definition visual.
3) Beats 3 to 5: Contrast escalation examples, each beat should intensify.
4) Beat 6: Scientific or psychological explanation visual.
5) Final beat: Diagnostic test moment tied directly to this icon idea: "${iconIdea}"

${styleGuidance}

Shot guidance:
- Start medium or wide, then go closer as intensity rises.
- Use shots: wide, medium, close.

Motion guidance:
- motion can be "none", "zoomIn", or "zoomOut"
- Default motion should be "${defaultMotion}"
- Use zoomIn on higher intensity beats sparingly.

Intensity guidance:
- low for beat 1 to 2
- medium for escalation beats
- high for the final beat

Weights:
- weight is a number that controls timing.
- Give weight 1 to quick beats, 2 to normal, 3 to emphasized beats.
- Make the final beat weight 3.

Voiceover script for context, do not repeat it verbatim:
${voiceoverScript}

Return STRICT JSON only in this format:
{
  "grid": { "rows": 3, "cols": 3 },
  "beats": [
    {
      "beatId": 1,
      "panelIndex": 1,
      "shot": "medium",
      "intensity": "low",
      "visual": "Short description of what we see",
      "nicoAction": "What Nico does or reacts like",
      "props": ["optional", "props"],
      "weight": 2,
      "motion": "none"
    }
  ]
}

Important:
- Make sure beats count is between ${beatsMin} and ${beatsMax}.
- Use panelIndex sequentially starting at 1.
- Nico must appear in every beat.
- Props must never include punctuation or text-like marks. Use abstract mystery shapes instead of question marks.
- In returned JSON string values, do not use parentheses or brackets, and do not include any text-like symbols as props.
`.trim();
}

/** V2 Scene Engine: prompt for variable-length scenes (one image per scene). */
function buildStoryboardPromptScenesV3(args: {
  topic?: string;
  subjectName: string;
  hook: string;
  voiceoverScript: string;
  iconIdea: string;
  style: ScriptStyle;
  sceneCount: number;
  defaultMotion: "none" | "zoomIn";
}): string {
  const {
    topic,
    subjectName,
    hook,
    voiceoverScript,
    iconIdea,
    style,
    sceneCount,
    defaultMotion,
  } = args;

  const topicLine = topic ? `Overarching topic: ${topic}\n` : "";
  const styleGuidance = getStyleGuidance(style);

  return `
You are a storyboard director for a short explainer video. Each scene will become ONE full-screen image (no grid).

${topicLine}
Subject: ${subjectName}

Global rules for every scene:
- Pure white background only. No scenery, no environments, no sky, stars, cityscapes, rooms, or landscapes.
- Every scene must feel like a single panel on blank white paper.
- No text anywhere. No letters, numbers, punctuation, emojis, or readable symbols.
- Nico must appear in every scene.
- Props: minimal and symbolic (simple shapes, silhouettes). Never text-like. No diagrams, no charts.
- Use "floating props" only; avoid clutter.

You will create exactly ${sceneCount} scenes. Each scene will be rendered as one image.

Rhythm:
1) Scene 1: Intro + hook moment.
2) Scene 2: Clear definition visual.
3) Scenes 3 to ${Math.max(3, sceneCount - 2)}: Escalation (contrast / examples). Intensify as you go.
4) Final scene: Tied to this icon idea: "${iconIdea}"

${styleGuidance}

Shot: wide | medium | close. Start medium or wide, go closer as intensity rises.
Motion: "none" or "zoomIn". Default "${defaultMotion}". Use zoomIn sparingly on high-intensity scenes.
Weight: number for timing (1 = quick, 2 = normal, 3 = emphasized). Give the final scene weight 3.
Priority: "must" | "should" | "could" (use "must" for key scenes).

Return STRICT JSON only:
{
  "scenes": [
    {
      "sceneId": 1,
      "shot": "medium",
      "intensity": "low",
      "visual": "Short description of what we see",
      "nicoAction": "What Nico does or reacts like",
      "props": ["optional", "prop"],
      "weight": 2,
      "motion": "none",
      "priority": "must"
    }
  ]
}

Rules:
- Exactly ${sceneCount} scenes. sceneId 1 to ${sceneCount}.
- No parentheses or brackets in string values. No text-like symbols in props.
- Nico in every scene. White background only.
`.trim();
}

/** Phase A: V4 prompt with white compositing, scale, safe area, escalation, hook object enforcement. */
function buildStoryboardPromptScenesV4(args: {
  topic?: string;
  subjectName: string;
  hook: string;
  voiceoverScript: string;
  iconIdea: string;
  style: ScriptStyle;
  sceneCount: number;
  defaultMotion: "none" | "zoomIn" | "zoomSlow";
  hookObjects: string[];
}): string {
  const {
    topic,
    subjectName,
    hook,
    voiceoverScript,
    iconIdea,
    style,
    sceneCount,
    defaultMotion,
    hookObjects,
  } = args;

  const topicLine = topic ? `Overarching topic: ${topic}\n` : "";
  const styleGuidance = getStyleGuidance(style);

  const escalationGuidance =
    style === "fear"
      ? "Escalation: normal object → uncomfortable → worse → peak. Visually more intense over scenes."
      : style === "educational" || style === "curiosity"
        ? "Escalation: visually more informative or more complex over scenes, not scarier."
        : "Escalation: build visual progression across scenes; vary intensity and complexity.";

  const hookObjectLine =
    hookObjects.length > 0
      ? `\nHOOK OBJECT ENFORCEMENT: Scene 1 MUST include at least one of these concrete objects in props and visual: ${hookObjects.join(", ")}. Set priority="must" for scene 1.`
      : `\nUse iconIdea "${iconIdea}" as the primary hook visual for scene 1 if no specific object is named.`;

  return `
You are a storyboard director for a short explainer video. Each scene will become ONE full-screen image (no grid).

${topicLine}
Subject: ${subjectName}

WHITE COMPOSITING BACKGROUND (every scene):
- Canvas base is pure white (#FFFFFF). No gray gradients, no vignette, no textured paper, no studio backdrop gradients.
- Any minimal environment elements must dissolve softly into white at the edges (soft fade). No hard rectangular background edges.

CHARACTER SCALE:
- shot="close": Nico occupies 80–90% of frame height.
- shot="medium": 60–70% of frame height. Keep feet visible when possible.
- shot="wide": 40–60% of frame height. Keep feet visible when possible.
- Keep proportions consistent across all scenes.

SAFE AREA:
- All important elements (Nico, key props) must stay within the central 70% of the frame. Maintain white margins; do not place key props near borders.

OBJECT ESCALATION:
- Do not repeat the same abstract prop (e.g. circles) in every scene. Use an escalation sequence.
- Include at least 2 distinct concrete props across the scenes (unless script provides none).
${escalationGuidance}
${hookObjectLine}

Other rules: No text. No letters, numbers, punctuation, emojis. Nico in every scene. Props: minimal, never text-like.

You will create exactly ${sceneCount} scenes.

Rhythm:
1) Scene 1: Intro + hook moment. Include hook object if specified above.
2) Scene 2: Clear definition visual.
3) Scenes 3 to ${Math.max(3, sceneCount - 2)}: Escalation. Vary concrete props and intensity.
4) Final scene: Tied to icon idea "${iconIdea}"

${styleGuidance}

Shot: wide | medium | close. Motion: "none", "zoomIn", or "zoomSlow" (subtle slow zoom). Default "${defaultMotion}". Weight: 1–3. Priority: "must" for scene 1 and key beats, "should"/"could" elsewhere.

Return STRICT JSON only:
{
  "scenes": [
    {
      "sceneId": 1,
      "shot": "medium",
      "intensity": "low",
      "visual": "Short description",
      "nicoAction": "What Nico does",
      "props": ["concrete", "prop"],
      "weight": 2,
      "motion": "zoomSlow",
      "priority": "must"
    }
  ]
}

Rules: Exactly ${sceneCount} scenes. sceneId 1 to ${sceneCount}. No parentheses/brackets in string values. Nico in every scene.
`.trim();
}

function buildStoryboardPrompt(args: {
  index: number;
  name: string;
  iconIdea: string;
  script: string;
  styleLock: string;
  characterName: string;
}) {
  const { index, name, iconIdea, script, styleLock, characterName } = args;

  return `
You are a storyboard generator for an explainer video.

You must output ONLY valid JSON, with no markdown, no commentary, no extra text, no code fences.

We are creating a single 3x3 grid comic image (9 panels) for:
Number ${index}: ${name}

Icon idea:
${iconIdea}

Voiceover script:
${script}

Storyboard requirements:
- Produce 6 to 9 beats.
- Each beat maps to a panelIndex 1 to 9 (no duplicates preferred, but allowed if needed).
- Each beat must show ${characterName} and their reaction.
- Keep props minimal (3-4 max per item, prefer variations of the same theme rather than unrelated objects).
- Keep backgrounds pure white.
- No text anywhere.

Return JSON exactly in this shape:
{
  "grid": { "rows": 3, "cols": 3 },
  "beats": [
    {
      "beatId": 1,
      "panelIndex": 1,
      "shot": "wide|medium|close",
      "intensity": "low|medium|high",
      "visual": "what is happening in the panel (short)",
      "nicoAction": "what Nico is doing/feeling (short)",
      "props": ["prop1", "prop2"]
    }
  ]
}

Hard constraints:
${styleLock}
`;
}

const FORMAT_LOCK = `
NON-NEGOTIABLE OUTPUT FORMAT:
- Output EXACTLY 9 panels.
- Layout MUST be a 3 columns x 3 rows grid.
- Landscape canvas.
- All panels must be equal size.
- Thin black border around each panel AND around the full grid.
- Add a white padding margin inside the outer border so the panel borders do not touch the outer border (about 2 to 4% of the canvas).
- Pure white inside all panels (no backgrounds, no scenery).
- ABSOLUTELY NO TEXT anywhere.
- Do not draw punctuation marks as symbols, no question marks, no letters, no numbers.

FAIL CONDITIONS (do not do these):
- Do NOT output 6 panels.
- Do NOT output a portrait poster.
- Do NOT merge panels.
- Do NOT add titles, labels, numbers, sound effects, speech bubbles.
`;

function buildImagePrompt(args: {
  index: number;
  name: string;
  storyboard: Storyboard;
  styleLock: string;
  characterName: string;
}) {
  const { index, name, storyboard, styleLock, characterName } = args;
  const beats = storyboard.beats ?? [];
  if (!beats.length) return "";

  const lines = beats
    .map((b) => {
      const props = b.props.length ? ` Props: ${b.props.join(", ")}.` : "";
      return `Panel ${b.panelIndex} (${b.shot}, ${b.intensity}): ${b.visual}. ${characterName}: ${b.nicoAction}.${props}`;
    })
    .join("\n");

  return `
${FORMAT_LOCK}

Create a single 3x3 comic grid image (9 panels) in LANDSCAPE.

${styleLock}

Panels:
${lines}
`;
}

async function generateStoryboard(args: {
  index: number;
  name: string;
  iconIdea: string;
  script: string;
  styleLock: string;
  characterName: string;
}): Promise<Storyboard> {
  const prompt = buildStoryboardPrompt(args);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const content = response?.choices[0]?.message?.content?.trim() ?? "";

    try {
      const parsed = JSON.parse(content);
      return StoryboardSchema.parse(parsed);
    } catch (err) {
      if (attempt === 2) {
        throw new Error(`Storyboard JSON parse failed. Raw output:\n${content}`);
      }
    }
  }

  throw new Error("Unreachable");
}

export async function storyboardJob(jobPath: string, limit?: number, force?: boolean) {
  const raw = await fs.readFile(jobPath, "utf8");
  const job = JobSchema.parse(JSON.parse(raw));

  ensureJobCache(job);

  const style = (job.settings?.script?.style ?? "fear") as ScriptStyle;
  const promptStyle = job.settings?.script?.promptStyle ?? "shorts_ominous_v1";

  const normalizedTopic =
    job.topic && job.topic.trim() && job.topic.trim() !== "--"
      ? job.topic.trim()
      : job.seriesTitle?.trim() || "";

  const beatsMinRaw = job.settings?.storyboard?.beatsMin ?? 6;
  const beatsMaxRaw = job.settings?.storyboard?.beatsMax ?? 9;
  const { beatsMin, beatsMax } = clampBeatsCount(beatsMinRaw, beatsMaxRaw);

  const defaultMotion = (job.settings?.storyboard?.defaultMotion ?? "zoomSlow") as
    | "none"
    | "zoomIn"
    | "zoomOut"
    | "zoomSlow";

  const characterProfile = await loadCharacterProfile(job.character.profilePath);

  const jobDir = path.dirname(jobPath);
  const scenesMin = job.settings?.storyboard?.scenesMin ?? beatsMin;
  const scenesMax = Math.min(8, job.settings?.storyboard?.scenesMax ?? beatsMax);

  const items =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? job.items.slice(0, limit)
      : job.items;

  for (const item of items) {
    const itemCache = ensureItemCache(job, item.id);

    // Resolve script for word count (voiceover or scripts/<id>.txt)
    let script = item.voiceoverScript;
    if (!script) {
      const scriptPath = path.join(jobDir, "scripts", `${item.id}.txt`);
      try {
        script = await fs.readFile(scriptPath, "utf8");
      } catch {
        // ignore
      }
    }
    if (!script || !script.trim()) {
      throw new Error(
        `[storyboard] Missing voiceoverScript for item ${item.id}. Run write-scripts first.`
      );
    }
    const wordCount = getWordCount(script);
    const sceneCount = getAdaptiveSceneCount(wordCount, scenesMin, scenesMax);

    const hookObjects = extractHookObjects(item.hook, script, 28);
    const stepHash = hashObject({
      step: "storyboard@v4",
      id: item.id,
      name: item.name,
      hook: item.hook,
      iconIdea: item.iconIdea,
      voiceoverScript: script,
      hookObjects,
      topic: normalizedTopic || null,
      style,
      sceneCount,
      settingsStoryboard: {
        beatsMin,
        beatsMax,
        scenesMin,
        scenesMax,
        defaultMotion,
      },
      model: "gpt-4o-mini",
      temperature: 0.7,
    });

    const prevHash = itemCache.storyboard;

    if (!force && prevHash === stepHash && item.storyboard?.scenes?.length) {
      console.log(`[storyboard] skip ${item.id}, unchanged`);
      continue;
    }

    console.log(`Storyboarding ${item.name} (${sceneCount} scenes, ${wordCount} words)...`);

    const prompt = buildStoryboardPromptScenesV4({
      ...(normalizedTopic ? { topic: normalizedTopic } : {}),
      subjectName: item.name,
      hook: item.hook,
      voiceoverScript: script,
      iconIdea: item.iconIdea,
      style,
      sceneCount,
      defaultMotion: defaultMotion === "zoomOut" ? "none" : defaultMotion,
      hookObjects,
    });

    let rawScenes: unknown[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });
      let content = response?.choices[0]?.message?.content?.trim() ?? "";
      content = stripJsonCodeFences(content);
      try {
        const parsed = JSON.parse(content) as { scenes?: unknown[] };
        rawScenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
        break;
      } catch {
        if (attempt === 2) {
          throw new Error(`Storyboard JSON parse failed. Raw output:\n${content}`);
        }
      }
    }

    const normalizedScenes = normalizeScenesToSchema({
      rawScenes,
      sceneCount,
      defaultMotion: defaultMotion === "zoomOut" ? "none" : defaultMotion,
    });

    const storyboard: Storyboard = {
      scenes: normalizedScenes,
    };
    item.storyboard = StoryboardSchema.parse(storyboard);
    // V2: we do not set imagePrompt; gen-images builds per-scene prompts from storyboard.scenes
    itemCache.storyboard = stepHash;
  }

  await fs.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");

  console.log("Storyboard step complete.");
}
