import { generateImageWithReferences } from "../../openaiImages.js";
import type {
  ImageProvider,
  GenerateSceneImageOptions,
  GenerateIconImageOptions,
} from "./types.js";

export const openaiProvider: ImageProvider = {
  name: "openai",

  async generateSceneImage(options: GenerateSceneImageOptions): Promise<Buffer> {
    const { promptText, size, referenceImagePaths } = options;
    return generateImageWithReferences(promptText, referenceImagePaths, {
      size,
    });
  },

  async generateIconImage(options: GenerateIconImageOptions): Promise<Buffer> {
    const { promptText, size, referenceImagePaths } = options;
    return generateImageWithReferences(promptText, referenceImagePaths, {
      size,
    });
  },
};
