import type { ImageProvider } from "./providers/types.js";
import { openaiProvider } from "./providers/openaiProvider.js";
import { geminiProvider } from "./providers/geminiProvider.js";

const providers: Record<string, ImageProvider> = {
  openai: openaiProvider,
  gemini: geminiProvider,
};

export function getImageProvider(name: string): ImageProvider {
  const p = providers[name];
  if (!p) {
    throw new Error(
      `Unknown image provider: ${name}. Use "openai" or "gemini".`
    );
  }
  return p;
}

export { openaiProvider } from "./providers/openaiProvider.js";
export { geminiProvider } from "./providers/geminiProvider.js";
export type {
  ImageProvider,
  GenerateSceneImageOptions,
  GenerateIconImageOptions,
  GeminiImageModel,
} from "./providers/types.js";
