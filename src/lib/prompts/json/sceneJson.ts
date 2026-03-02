import type { StoryboardScene } from "../../../types/job.js";
import type { JobItem, Job, JobSettings } from "../../../types/job.js";
import { extractHookObjects } from "../../hookObjects.js";

/**
 * Provider-agnostic unified JSON scene prompt.
 * Used by OpenAI (stringify to text) and Nano Banana (send JSON).
 */
export interface SceneImageJsonPrompt {
  subject: string;
  composition: {
    shot: "wide" | "medium" | "close";
    characterFrameHeightPercent: number;
    safeMarginsPercent: number;
    description: string;
  };
  character: {
    name: string;
    styleLock: string;
    action: string;
  };
  props: string[];
  environment: {
    baseColor: string;
    rules: string[];
    groundShadow?: string;
  };
  lighting: string;
  style: string;
  constraints: string[];
  negative_constraints: string[];
}

const WHITE_COMPOSITING_RULES = [
  "Background base color = pure white RGB(255,255,255)",
  "No paper texture, no off-white, no beige wash",
  "No vignette, no gradient across full frame",
  "If environment context needed: white-dominant, elements fade softly to white at edges, no hard borders",
  "Ground shadow: very soft light gray under feet only, low opacity",
];

const SHOT_PRESETS: Record<
  "wide" | "medium" | "close",
  { frameHeightPercent: number; description: string }
> = {
  wide: {
    frameHeightPercent: 70,
    description: "Full body visible, character ~70% frame height",
  },
  medium: {
    frameHeightPercent: 55,
    description: "Knees or waist up, character ~55% frame height",
  },
  close: {
    frameHeightPercent: 45,
    description: "Shoulders up, face dominant",
  },
};

/**
 * Build unified JSON scene prompt for both OpenAI and Nano Banana.
 * Scene 1: enforces primary hook object in props/subject when extractHookObjects finds one.
 */
export function buildSceneImageJsonPrompt(
  scene: StoryboardScene,
  item: JobItem,
  job: Job,
  characterName: string,
  styleLock: string
): SceneImageJsonPrompt {
  const hookObjects = extractHookObjects(item.hook, item.voiceoverScript, 28);
  const isScene1 = scene.sceneId === 1;
  const primaryHookObject = isScene1 && hookObjects[0] ? hookObjects[0] : null;

  const shotPreset = SHOT_PRESETS[scene.shot];
  const props = [...scene.props];
  if (primaryHookObject && !props.some((p) => p.toLowerCase().includes(primaryHookObject))) {
    props.unshift(primaryHookObject);
  }

  const subject = primaryHookObject && isScene1
    ? `${scene.visual} Primary subject must include: ${primaryHookObject}.`
    : scene.visual;

  return {
    subject,
    composition: {
      shot: scene.shot,
      characterFrameHeightPercent: shotPreset.frameHeightPercent,
      safeMarginsPercent: 10,
      description: shotPreset.description,
    },
    character: {
      name: characterName,
      styleLock,
      action: scene.nicoAction,
    },
    props,
    environment: {
      baseColor: "RGB(255,255,255)",
      rules: WHITE_COMPOSITING_RULES,
      groundShadow: "Very soft light gray under feet only, low opacity",
    },
    lighting: "Soft, even. White-dominant. No dramatic shadows except optional soft ground shadow.",
    style: "Same illustration style across all scenes. Consistent character proportions.",
    constraints: [
      "All content inside 10% safe margins from edges",
      "Character scale consistent with shot type",
    ],
    negative_constraints: [
      "NO text, NO letters, NO numbers, NO words",
      "NO speech bubbles or captions",
      "NO punctuation or symbols",
      "NO vignette or borders",
      "NO off-white, beige, or textured background",
    ],
  };
}

/**
 * Stringify JSON prompt into a single text prompt.
 * Re-ordered to front-load the character, action, and subject for optimal Gemini indexing.
 */
export function sceneJsonToTextPrompt(json: SceneImageJsonPrompt): string {
  const lines: string[] = [
    "A single-panel digital illustration. LANDSCAPE.",
    "",
    // Front-load the character and action so the model anchors on it immediately
    `CHARACTER: ${json.character.name}. ${json.character.action}`,
    json.character.styleLock,
    "",
    `SUBJECT & CONTEXT: ${json.subject}`,
    `PROPS: ${json.props.length ? json.props.join(", ") : "none"}`,
    "",
    "COMPOSITION:",
    `- ${json.composition.description}`,
    `- Character is ${json.composition.characterFrameHeightPercent}% of frame height.`,
    `- All content inside ${json.composition.safeMarginsPercent}% safe margins.`,
    "",
    "ENVIRONMENT / BACKGROUND:",
    ...json.environment.rules.map((r) => "- " + r),
    json.environment.groundShadow ? "- " + json.environment.groundShadow : "",
    "",
    `LIGHTING: ${json.lighting}`,
    `STYLE: ${json.style}`,
    "",
    "CRITICAL CONSTRAINTS (DO NOT INCLUDE THESE):",
    ...json.negative_constraints.map((c) => "- " + c),
  ];
  return lines.filter((s) => s !== "").join("\n");
}

/** Legacy: build scene JSON for Nano Banana (compact shape). */
export function buildSceneImagePromptJson(
  scene: StoryboardScene,
  characterName: string,
  styleLock: string
): ScenePromptJson {
  return {
    character: { name: characterName, styleLock },
    framing: { shot: scene.shot, intensity: scene.intensity },
    background: {
      type: "white_compositing",
      rules: [
        "Canvas base pure white (#FFFFFF). No gray gradients, vignette, or textured paper.",
        "Any elements dissolve softly into white at edges. No hard rectangular edges.",
      ],
    },
    safeArea: {
      description: "All important elements within central 70% of frame. 10% safe margins.",
    },
    props: scene.props.map((p) => {
      const entry: { name: string; priority?: "must" | "should" | "could" } = { name: p };
      if (scene.priority) entry.priority = scene.priority;
      return entry;
    }),
    visualSummary: scene.visual,
    nicoAction: scene.nicoAction,
    negative: [
      "no text",
      "no letters",
      "no numbers",
      "no punctuation",
      "no symbols",
    ],
  };
}

export interface ScenePromptJson {
  character: { name: string; styleLock: string };
  framing: { shot: "wide" | "medium" | "close"; intensity: "low" | "medium" | "high" };
  background: { type: string; rules: string[] };
  safeArea: { description: string };
  props: Array<{ name: string; priority?: "must" | "should" | "could" }>;
  visualSummary: string;
  nicoAction: string;
  negative: string[];
}

/** Icon: item concept only, NO character. Cinematic, pure white compositing. */
export interface IconPromptJson {
  subject: string;
  composition: string;
  environment: { type: string; rules: string[] };
  lighting: string;
  style: string;
  negative: string[];
}

export function buildIconPromptJson(
  item: { iconIdea: string },
  hookObjects: string[],
  _characterName: string,
  _styleLock: string,
  _jobSettings?: JobSettings
): IconPromptJson {
  const primaryConcept = hookObjects.length > 0 && hookObjects[0] !== undefined ? hookObjects[0] : item.iconIdea;
  return {
    subject: primaryConcept,
    composition: "Centered or dramatic close framing. Strong focal object. Interesting perspective.",
    environment: {
      type: "pure_white_studio",
      rules: [
        "Pure white RGB(255,255,255) background. No gradients or vignette.",
        "Elements soften into white at edges.",
      ],
    },
    lighting: "Soft cinematic lighting.",
    style: "Same illustration style as main scenes. Concept only — no character in frame.",
    negative: ["no text", "no letters", "no numbers", "no punctuation", "no character", "no person"],
  };
}