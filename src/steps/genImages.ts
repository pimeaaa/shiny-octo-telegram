import fs from "node:fs/promises";
import path from "node:path";
import { JobSchema, type Job, type JobItem } from "../types/job.js";
import type { ImageProvider } from "../lib/images/providers/types.js";
import { loadCharacterProfile } from "../config/character.js";
import { ensureDir, fileExists } from "../lib/fs.js";
import { probeImageSize } from "../lib/imageProbe.js";
import { getLandscapeSize, getSquareSize } from "../lib/imageSizes.js";
import { hashObject } from "../lib/hash.js";
import { ensureJobCache, ensureItemCache } from "../lib/jobCache.js";
import { getImageProvider } from "../lib/images/index.js";
import { buildExplainerIconPromptText } from "../lib/prompts/iconImage.js";
import { extractHookObjects } from "../lib/hookObjects.js";
import {
  buildSceneImageJsonPrompt,
  sceneJsonToTextPrompt,
  buildIconPromptJson,
} from "../lib/prompts/json/sceneJson.js";

export type GenImagesOptions = {
  limit?: number;
  force?: boolean;
  provider?: "openai" | "gemini";
};

async function maybeGenerateIcon(
  job: Job,
  item: JobItem,
  imagesDir: string,
  _jobDir: string,
  provider: ImageProvider,
  force: boolean | undefined,
  providerName: string,
  geminiModel: "gemini-3.1-flash-image-preview" | "gemini-3-pro-image-preview" | "gemini-2.5-flash-image"
): Promise<void> {
  const useIconIntro = job.settings?.render?.useIconIntro ?? false;
  if (!useIconIntro) return;
  const iconPath = path.join(imagesDir, `${item.id}_icon.png`);
  const iconExists = await fileExists(iconPath);
  if (!force && iconExists) return;
  const hookObjects = extractHookObjects(item.hook, item.voiceoverScript, 28);
  const iconPromptText = buildExplainerIconPromptText({ iconIdea: item.iconIdea, hookObjects });
  const iconSize = getSquareSize() as "1024x1024";
  const relIcon = path.join("images", `${item.id}_icon.png`);
  try {
    const iconOpts: Parameters<ImageProvider["generateIconImage"]>[0] = {
      promptText: iconPromptText,
      promptJson: buildIconPromptJson(item, hookObjects, "", "", job.settings),
      size: iconSize,
      referenceImagePaths: [],
    };
    if (providerName === "gemini") iconOpts.geminiModel = geminiModel;
    const iconBuffer = await provider.generateIconImage(iconOpts);
    await fs.writeFile(iconPath, iconBuffer);
    console.log(`Saved icon plate: ${relIcon}`);
  } catch (iconErr) {
    console.warn(`Icon plate generation failed for ${item.name}:`, iconErr);
  }
}

export async function genImages(
  jobPath: string,
  limit?: number,
  force?: boolean,
  opts?: GenImagesOptions
) {
  const raw = await fs.readFile(jobPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON in job file ${jobPath}: ${msg}`);
  }
  const job = JobSchema.parse(parsed);
  ensureJobCache(job);

  const options = opts ?? {};
  const limitOpt = options.limit ?? limit;
  const forceOpt = options.force ?? force;
  const providerName = (options.provider ?? job.settings?.images?.provider ?? "openai") as "openai" | "gemini";
  const provider = getImageProvider(providerName);
  const geminiModel = (job.settings?.images?.geminiModel ??
    "gemini-3.1-flash-image-preview") as
    | "gemini-3.1-flash-image-preview"
    | "gemini-3-pro-image-preview"
    | "gemini-2.5-flash-image";
  const characterProfile = await loadCharacterProfile(job.character.profilePath);

  const items =
    typeof limitOpt === "number" && Number.isFinite(limitOpt) && limitOpt > 0
      ? job.items.slice(0, limitOpt)
      : job.items;

  const jobDir = path.dirname(jobPath);
  const imagesDir = path.join(jobDir, "images");
  await ensureDir(imagesDir);

  function validateLandscapeImage(
    size: { width: number; height: number },
    strictSize: boolean
  ) {
    if (size.width <= size.height)
      return { ok: false as const, reason: `Not landscape (${size.width}x${size.height})` };
    if (!strictSize) return { ok: true as const };
    const allowed = [{ w: 1536, h: 1024 }];
    const ok = allowed.some(
      (a) => Math.abs(size.width - a.w) <= 32 && Math.abs(size.height - a.h) <= 32
    );
    if (!ok)
      return { ok: false as const, reason: `Unexpected size (${size.width}x${size.height})` };
    return { ok: true as const };
  }

  const strictSize = providerName === "openai";
  if (providerName === "gemini") {
    console.log(`Generating image with Gemini: ${geminiModel}`);
  }

  for (const item of items) {
    const itemCache = ensureItemCache(job, item.id);
    const gridSize = getLandscapeSize();
    const scenes = item.storyboard?.scenes ?? [];

    // V2: per-scene images when storyboard has scenes
    if (scenes.length > 0) {
      const stepHash = hashObject({
        step: "genImages@v3",
        provider: providerName,
        geminiModel: providerName === "gemini" ? geminiModel : undefined,
        id: item.id,
        scenes: scenes.map((s) => ({
          sceneId: s.sceneId,
          visual: s.visual,
          nicoAction: s.nicoAction,
          props: s.props,
          shot: s.shot,
          intensity: s.intensity,
          weight: s.weight,
          motion: s.motion,
        })),
        characterId: job.character?.id ?? null,
        characterProfilePath: job.character?.profilePath ?? null,
        referenceImages: characterProfile.referenceImages ?? [],
        size: gridSize,
        model: "gpt-image-1-mini",
      });

      const prevHash = itemCache.genImages;
      const existingPaths = item.sceneImagePaths ?? [];
      const filesExist = await Promise.all(
        existingPaths.map((rel) => fileExists(path.join(jobDir, rel)))
      );
      const allExist =
        scenes.length === existingPaths.length && filesExist.every(Boolean);

      if (!forceOpt && prevHash === stepHash && allExist) {
        if (!item.sceneImagePaths?.length) {
          item.sceneImagePaths = existingPaths;
        }
        console.log(`[gen-images] skip ${item.id} (scenes), unchanged`);
        await maybeGenerateIcon(job, item, imagesDir, jobDir, provider, forceOpt, providerName, geminiModel);
        continue;
      }

      console.log(`Generating ${scenes.length} scene images for ${item.name}...`);
      const scenePaths: string[] = [];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (!scene) continue;
        const pad = String(i + 1).padStart(2, "0");
        const sceneFileName = `${item.id}_s${pad}.png`;
        const scenePath = path.join(imagesDir, sceneFileName);
        const relPath = path.join("images", sceneFileName);

        const sceneJson = buildSceneImageJsonPrompt(
          scene,
          item,
          job,
          characterProfile.name,
          characterProfile.styleLock
        );
        const promptText = sceneJsonToTextPrompt(sceneJson);
        const promptJson = sceneJson;

        let lastErr: unknown = null;
        const MAX_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const sceneOpts: Parameters<ImageProvider["generateSceneImage"]>[0] = {
              promptText,
              promptJson,
              size: gridSize as "1536x1024",
              referenceImagePaths: characterProfile.referenceImages ?? [],
            };
            if (providerName === "gemini") sceneOpts.geminiModel = geminiModel;
            const imageBuffer = await provider.generateSceneImage(sceneOpts);
            await fs.writeFile(scenePath, imageBuffer);
            const size = await probeImageSize(scenePath);
            const v = validateLandscapeImage(size, strictSize);
            if (!v.ok) {
              lastErr = new Error(`Invalid image: ${v.reason}`);
              console.warn(`Scene ${i + 1} attempt ${attempt}/${MAX_ATTEMPTS} rejected: ${v.reason}`);
              continue;
            }
            scenePaths.push(relPath);
            console.log(providerName === "gemini" ? `  Saved: ${relPath} (${size.width}x${size.height})` : `  Saved: ${relPath}`);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            console.warn(`Scene ${i + 1} attempt ${attempt}/${MAX_ATTEMPTS} failed:`, e);
          }
        }
        if (lastErr) {
          console.error(`Failed scene ${i + 1} for ${item.name}:`, lastErr);
        }
      }

      item.sceneImagePaths = scenePaths;
      itemCache.genImages = stepHash;
      await maybeGenerateIcon(job, item, imagesDir, jobDir, provider, forceOpt, providerName, geminiModel);
      continue;
    }

    // Legacy: single grid image (beats mode)
    const imagePath = path.join(imagesDir, `${item.id}.png`);
    const relativeImagePath = path.join("images", `${item.id}.png`);

    const stepHash = hashObject({
      step: "genImages@1",
      provider: providerName,
      geminiModel: providerName === "gemini" ? geminiModel : undefined,
      id: item.id,
      imagePrompt: item.imagePrompt ?? null,
      characterId: job.character?.id ?? null,
      characterProfilePath: job.character?.profilePath ?? null,
      referenceImages: characterProfile.referenceImages ?? [],
      format: job.format,
      resolution: job.resolution,
      model: "gpt-image-1-mini",
      size: gridSize,
      quality: null,
    });

    const prevHash = itemCache.genImages;
    const imgExists = await fileExists(imagePath);

    if (!forceOpt && prevHash === stepHash && imgExists) {
      if (!item.imagePath) {
        item.imagePath = relativeImagePath;
      }
      console.log(`[gen-images] skip ${item.id}, unchanged`);
      await maybeGenerateIcon(job, item, imagesDir, jobDir, provider, forceOpt, providerName, geminiModel);
      continue;
    }

    if (!item.imagePrompt) {
      throw new Error(`[gen-images] Missing imagePrompt for item ${item.id}. Run storyboard first.`);
    }

    if (imgExists && forceOpt) {
      console.log(`Regenerating ${item.name} (--force)`);
    }
    console.log(`Generating image for ${item.name}...`);

    const MAX_ATTEMPTS = 3;
    const repairSuffix = `
REPAIR INSTRUCTIONS:
Your previous output was invalid.
You MUST output EXACTLY a 3x3 grid (9 equal panels) in LANDSCAPE.
Do not output 6 panels. Do not output portrait. No text anywhere.
`;

    let lastErr: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const attemptPrompt =
            attempt === 1 ? item.imagePrompt : `${item.imagePrompt}\n\n${repairSuffix}`;

          const legacyOpts: Parameters<ImageProvider["generateSceneImage"]>[0] = {
            promptText: attemptPrompt,
            size: gridSize as "1536x1024",
            referenceImagePaths: characterProfile.referenceImages ?? [],
          };
          if (providerName === "gemini") legacyOpts.geminiModel = geminiModel;
          const imageBuffer = await provider.generateSceneImage(legacyOpts);

          await fs.writeFile(imagePath, imageBuffer);

          const size = await probeImageSize(imagePath);
          const v = validateLandscapeImage(size, strictSize);

          if (!v.ok) {
            lastErr = new Error(`Invalid image: ${v.reason}`);
            console.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} rejected: ${v.reason}`);
            continue;
          }

          item.imagePath = relativeImagePath;
          itemCache.genImages = stepHash;
          console.log(`Saved: ${relativeImagePath} (${size.width}x${size.height})`);

          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          console.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} failed`);
          console.warn(e);
        }
      }

      if (lastErr) {
        console.error(`Failed to generate a valid image for ${item.name} after ${MAX_ATTEMPTS} attempts.`);
        console.error(lastErr);
      }
    } catch (err) {
      console.error(`Failed to generate image for ${item.name}:`);
      console.error(err);
    }

    await maybeGenerateIcon(job, item, imagesDir, jobDir, provider, forceOpt, providerName, geminiModel);
  }

  await fs.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");

  console.log("Image generation step complete.");
}
