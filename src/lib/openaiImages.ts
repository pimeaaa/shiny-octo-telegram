import fs from "node:fs/promises";
import path from "node:path";
import { toFile } from "openai";
import { openai } from "./openai.js";

function mimeFromExt(ext: string) {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  return "image/png";
}

async function readAsFile(filePath: string): Promise<File> {
  const resolved = path.resolve(filePath);
  const buf = await fs.readFile(resolved);
  const ext = path.extname(resolved) || ".png";
  const mime = mimeFromExt(ext);
  const fileName = path.basename(resolved);
  return toFile(buf, fileName, { type: mime });
}

/**
 * Generates a new image using reference images for character consistency.
 * If reference images are provided, we use the Images Edit endpoint.
 * If not, we fall back to Images Generate.
 * TODO Phase 2: provider abstraction (OpenAI + Nano Banana); Phase 2: JSON prompting skill for image gen.
 */
export async function generateImageWithReferences(
  prompt: string,
  referenceImagePaths: string[],
  options?: { size?: string }
): Promise<Buffer> {
  const hasRefs = Array.isArray(referenceImagePaths) && referenceImagePaths.length > 0;
  const size = options?.size ?? "1536x1024";

  if (hasRefs) {
    const imageFiles = await Promise.all(referenceImagePaths.map(readAsFile));

    // We want a new image, but conditioned on reference character images.
    // This uses an "edit" style call where we provide images as inputs.
    const response = await openai.images.edit({
      model: "gpt-image-1-mini",
      prompt: [
        "Use Image 1 as the character reference.",
        "Preserve the character design closely across all panels (face, hair, clothes, colors).",
        "Generate a brand new 3x3 comic grid image based on the instructions below.",
        prompt
      ].join("\n"),
      image: imageFiles,
      output_format: "png"
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("No b64_json returned from images.edit");
    }

    return Buffer.from(b64, "base64");
  }

  // Fallback without references (size must be a known OpenAI image size)
  const response = await openai.images.generate({
    model: "gpt-image-1-mini",
    prompt,
    size: size as "1536x1024" | "1024x1024" | "1024x1536",
    n: 1
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    // Some responses might return a URL instead, but prefer base64.
    const url = response.data?.[0]?.url;
    if (!url) {
      throw new Error("No image data returned from images.generate");
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }

  return Buffer.from(b64, "base64");
}
