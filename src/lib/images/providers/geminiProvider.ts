/**
 * Gemini (Nano Banana) image provider using @google/genai.
 * Uses generateContent with responseModalities IMAGE for native Gemini image models
 * (e.g. gemini-3.1-flash-image-preview). Same JSON prompt is converted to text via
 * sceneJsonToTextPrompt; we send that as the prompt.
 * Dev smoke: export GEMINI_API_KEY, set job.settings.images.provider to "gemini",
 * set job.settings.images.geminiModel to "gemini-3.1-flash-image-preview", run:
 * pnpm run gen-images <jobPath> -- --limit 1
 */
import { GoogleGenAI, Modality } from "@google/genai";
import type {
  ImageProvider,
  GenerateSceneImageOptions,
  GenerateIconImageOptions,
  GeminiImageModel,
} from "./types.js";

export type { GeminiImageModel };

const DEFAULT_GEMINI_MODEL: GeminiImageModel = "gemini-3.1-flash-image-preview";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "GEMINI_API_KEY is required when using Gemini provider. Set it in .env or set job.settings.images.provider to 'openai'."
    );
  }
  return new GoogleGenAI({ apiKey });
}

export async function generateImageWithGemini(args: {
  model: GeminiImageModel;
  prompt: string;
  aspectRatio?: "16:9" | "1:1" | "9:16";
  imageSize?: "1K" | "2K" | "4K";
}): Promise<{ pngBuffer: Buffer }> {
  const ai = getGeminiClient();
  const { model, prompt, aspectRatio = "16:9", imageSize = "2K" } = args;

  const imageConfig: { aspectRatio: string; imageSize?: string } = {
    aspectRatio,
  };
  if (model.startsWith("gemini-3.")) {
    imageConfig.imageSize = imageSize;
  }

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig,
    },
  });

  const base64 = response.data;
  if (!base64 || typeof base64 !== "string") {
    const text = response.text;
    throw new Error(
      `Gemini did not return image data. ${text ? `Response: ${text.slice(0, 200)}` : "No image in response."}`
    );
  }

  const pngBuffer = Buffer.from(base64, "base64");
  return { pngBuffer };
}

export const geminiProvider: ImageProvider = {
  name: "gemini",

  async generateSceneImage(options: GenerateSceneImageOptions): Promise<Buffer> {
    const model = options.geminiModel ?? DEFAULT_GEMINI_MODEL;
    const { pngBuffer } = await generateImageWithGemini({
      model,
      prompt: options.promptText,
      aspectRatio: "16:9",
      imageSize: "2K",
    });
    return pngBuffer;
  },

  async generateIconImage(options: GenerateIconImageOptions): Promise<Buffer> {
    const model = options.geminiModel ?? DEFAULT_GEMINI_MODEL;
    const { pngBuffer } = await generateImageWithGemini({
      model,
      prompt: options.promptText,
      aspectRatio: "16:9",
      imageSize: "2K",
    });
    return pngBuffer;
  },
};
