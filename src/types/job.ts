import { z } from "zod";

export const StoryboardBeatSchema = z.object({
  beatId: z.number().int().min(1),
  panelIndex: z.number().int().min(1).max(9),
  shot: z.enum(["wide", "medium", "close"]),
  intensity: z.enum(["low", "medium", "high"]),
  visual: z.string().min(3),
  nicoAction: z.string().min(3),
  props: z.array(z.string()).max(4),
  weight: z.number().optional(),
  motion: z.enum(["none", "zoomIn", "zoomOut"]).optional(),
});

/** V2 Scene Engine: one scene = one image, variable count per item. */
export const StoryboardSceneSchema = z.object({
  sceneId: z.number().int().min(1),
  shot: z.enum(["wide", "medium", "close"]),
  intensity: z.enum(["low", "medium", "high"]),
  visual: z.string().min(3),
  nicoAction: z.string().min(3),
  props: z.array(z.string()).max(4),
  weight: z.number(),
  motion: z.enum(["none", "zoomIn", "zoomSlow"]),
  priority: z.enum(["must", "should", "could"]).optional(),
});
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;

export const StoryboardSchema = z.object({
  grid: z
    .object({
      rows: z.literal(3),
      cols: z.literal(3),
    })
    .optional(),
  beats: z.array(StoryboardBeatSchema).min(0).max(9).optional(),
  scenes: z.array(StoryboardSceneSchema).min(1).max(12).optional(),
});

export const ItemSchema = z.object({
  id: z.string(), // "01".."12"
  name: z.string(),
  hook: z.string(),
  iconIdea: z.string(),

  voiceoverScript: z.string().optional(),
  panelPlan: z.array(z.string()).optional(),
  imagePrompt: z.string().optional(),

  imagePath: z.string().optional(),
  /** V2: paths to per-scene images (e.g. images/01_s01.png, 01_s02.png). */
  sceneImagePaths: z.array(z.string()).optional(),
  audioPath: z.string().optional(),
  clipPath: z.string().optional(),

  storyboard: StoryboardSchema.optional(),
});

export const JobCacheSchema = z.object({
  version: z.literal(1),
  items: z.record(
    z.string(),
    z.object({
      writeScripts: z.string().optional(),
      storyboard: z.string().optional(),
      genImages: z.string().optional(),
      genAudioElevenlabs: z.string().optional(),
      genAudioLocal: z.string().optional(),
      renderClips: z.string().optional(),
    })
  ),
  compile: z.string().optional(),
});

export const ScriptIntroSchema = z.enum(["name", "numberAndName"]);

export const ScriptStyleSchema = z.enum([
  "fear",
  "curiosity",
  "educational",
  "conspiracy",
]);

export const StoryboardMotionSchema = z.enum(["none", "zoomIn", "zoomOut", "zoomSlow"]);

export const JobStoryboardSettingsSchema = z.object({
  beatsMin: z.number().int().min(3).max(9).optional(),
  beatsMax: z.number().int().min(3).max(9).optional(),
  /** V2: override min/max scene count (defaults from beatsMin/beatsMax). */
  scenesMin: z.number().int().min(3).max(9).optional(),
  scenesMax: z.number().int().min(3).max(9).optional(),
  defaultMotion: StoryboardMotionSchema.optional(),
});

export const JobRenderSettingsSchema = z.object({
  useIconIntro: z.boolean().optional(),
  iconIntroSeconds: z.number().min(0.2).max(2).optional(),
  panelScale: z.number().min(0.4).max(1).optional(),
});

export const ImageProviderSchema = z.enum(["openai", "gemini"]);
export type ImageProvider = z.infer<typeof ImageProviderSchema>;

export const GeminiImageModelSchema = z.enum([
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image",
]);
export type GeminiImageModel = z.infer<typeof GeminiImageModelSchema>;

export const JobImagesSettingsSchema = z.object({
  provider: ImageProviderSchema.optional(),
  geminiModel: GeminiImageModelSchema.optional(),
});
export type JobImagesSettings = z.infer<typeof JobImagesSettingsSchema>;

export const JobSettingsSchema = z.object({
  script: z
    .object({
      intro: ScriptIntroSchema.optional(),
      promptStyle: z.string().optional(),
      style: ScriptStyleSchema.optional(),
    })
    .optional(),

  storyboard: JobStoryboardSettingsSchema.optional(),

  render: JobRenderSettingsSchema.optional(),

  images: JobImagesSettingsSchema.optional(),
});

export const JobSchema = z.object({
  jobId: z.string(),
  createdAt: z.string(), // ISO
  topic: z.string(),
  seriesTitle: z.string(),

  format: z.literal("landscape"),
  resolution: z.object({
    width: z.literal(1920),
    height: z.literal(1080),
  }),
  compilation: z.literal(true),

  character: z.object({
    id: z.string(),
    profilePath: z.string(),
  }),

  items: z.array(ItemSchema).min(1).max(12),

  // Smart regeneration cache (content hashes), optional and backwards compatible.
  cache: JobCacheSchema.optional(),

  settings: JobSettingsSchema.optional(),

  finalVideoPath: z.string().optional(),
});

export type Job = z.infer<typeof JobSchema>;
export type JobItem = z.infer<typeof ItemSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type StoryboardBeat = z.infer<typeof StoryboardBeatSchema>;
export type JobCache = z.infer<typeof JobCacheSchema>;
export type JobSettings = z.infer<typeof JobSettingsSchema>;
export type ScriptIntro = z.infer<typeof ScriptIntroSchema>;
export type ScriptStyle = z.infer<typeof ScriptStyleSchema>;
export type JobStoryboardSettings = z.infer<typeof JobStoryboardSettingsSchema>;
export type JobRenderSettings = z.infer<typeof JobRenderSettingsSchema>;
