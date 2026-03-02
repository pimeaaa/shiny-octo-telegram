/**
 * Image provider abstraction. Default: OpenAI. Optional: Gemini (Nano Banana).
 */

export type SceneImageSize = "1536x1024" | "1024x1536" | "1024x1024";
export type IconImageSize = "1024x1024" | "1536x1024";

export type GeminiImageModel =
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview"
  | "gemini-2.5-flash-image";

export interface GenerateSceneImageOptions {
  promptText: string;
  promptJson?: unknown;
  size: SceneImageSize;
  referenceImagePaths: string[];
  /** Used by Gemini provider. Ignored by OpenAI. */
  geminiModel?: GeminiImageModel;
}

export interface GenerateIconImageOptions {
  promptText: string;
  promptJson?: unknown;
  size: IconImageSize;
  referenceImagePaths: string[];
  /** Used by Gemini provider. Ignored by OpenAI. */
  geminiModel?: GeminiImageModel;
}

export interface ImageProvider {
  readonly name: string;
  generateSceneImage(options: GenerateSceneImageOptions): Promise<Buffer>;
  generateIconImage(options: GenerateIconImageOptions): Promise<Buffer>;
}
