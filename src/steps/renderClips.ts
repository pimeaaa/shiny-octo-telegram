import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { JobSchema, type Job, type JobItem, type StoryboardBeat } from "../types/job.js";
import { ensureDir, fileExists } from "../lib/fs.js";
import { getMediaDurationSeconds, getVideoOrImageSize } from "../lib/ffprobe.js";
import { hashObject } from "../lib/hash.js";
import { ensureJobCache, ensureItemCache } from "../lib/jobCache.js";

// TODO Phase 2: background music layer, SFX layer, multiple audio tracks

const FPS = 30;

function panelIndexToRowCol(panelIndex: number): { row: number; col: number } {
  const idx = Math.max(1, Math.min(9, Math.round(panelIndex)));
  const zero = idx - 1;
  const col = zero % 3;
  const row = Math.floor(zero / 3);
  return { row, col };
}

function buildCropArgs(args: { imgW: number; imgH: number; panelIndex: number }): {
  panelW: number;
  panelH: number;
  x: number;
  y: number;
} {
  const { imgW, imgH, panelIndex } = args;
  const { row, col } = panelIndexToRowCol(panelIndex);

  const panelW = imgW / 3;
  const panelH = imgH / 3;

  const x = col * panelW;
  const y = row * panelH;

  return { panelW, panelH, x, y };
}

function weightsToFrames(args: {
  totalSeconds: number;
  weights: number[];
  minSecondsPerBeat?: number;
}): { frames: number[]; durations: number[]; totalFrames: number } {
  const { totalSeconds, weights, minSecondsPerBeat = 0.35 } = args;

  const totalFrames = Math.max(1, Math.round(totalSeconds * FPS));
  const minFrames = Math.max(1, Math.ceil(minSecondsPerBeat * FPS));

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 1));
  const sum = safeWeights.reduce((a, b) => a + b, 0);

  let frames = safeWeights.map((w) => Math.round((w / sum) * totalFrames));
  frames = frames.map((f) => Math.max(minFrames, f));

  const sumFrames = frames.reduce((a, b) => a + b, 0);
  const drift = totalFrames - sumFrames;
  const lastIdx = frames.length - 1;
  const lastFrame = frames[lastIdx];
  if (lastFrame !== undefined) {
    frames[lastIdx] = Math.max(minFrames, lastFrame + drift);
  }

  let durations = frames.map((f) => f / FPS);

  // Last duration absorbs rounding error for perfect sync with audio length
  if (durations.length > 1) {
    const sumExceptLast = durations.slice(0, -1).reduce((a, b) => a + b, 0);
    const lastDuration = Math.max(minSecondsPerBeat, totalSeconds - sumExceptLast);
    durations = [...durations.slice(0, -1), lastDuration];
  }

  return { frames, durations, totalFrames };
}

function run(cmd: string, args: string[], cwd?: string) {
  console.log("RUN:", cmd, args.join(" "));
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", cwd });
    p.on("error", reject);
    p.on("close", (c) =>
      c === 0 ? resolve() : reject(new Error(cmd + " failed"))
    );
  });
}

export async function renderClips(jobPath: string, limit?: number, force?: boolean) {
  const raw = await fs.readFile(jobPath, "utf8");
  const job = JobSchema.parse(JSON.parse(raw));
  ensureJobCache(job);

  const items =
    typeof limit === "number" && limit > 0
      ? job.items.slice(0, limit)
      : job.items;

  const jobDir = path.dirname(jobPath);
  const clipsDir = path.join(jobDir, "clips");
  await ensureDir(clipsDir);

  const useIconIntro = job.settings?.render?.useIconIntro ?? false;
  const iconIntroSeconds = job.settings?.render?.iconIntroSeconds ?? 0.8;
  const panelScale = job.settings?.render?.panelScale ?? 0.78;
  const outW = job.resolution.width;
  const outH = job.resolution.height;
  const imagesDir = path.join(jobDir, "images");

  for (const item of items) {
    if (!item.audioPath) {
      console.log(`Skipping ${item.name}, missing audio`);
      continue;
    }

    const audioPath = path.resolve(jobDir, item.audioPath);
    const scenePaths = item.sceneImagePaths ?? [];
    const scenes = item.storyboard?.scenes ?? [];
    const beats = item.storyboard?.beats ?? [];

    const useScenes = scenePaths.length > 0 && scenes.length === scenePaths.length;

    if (useScenes) {
      await renderClipsScenes(
        job,
        item,
        jobDir,
        clipsDir,
        imagesDir,
        audioPath,
        scenePaths,
        scenes,
        { useIconIntro, iconIntroSeconds, panelScale, outW, outH },
        force
      );
    } else if (item.imagePath && beats.length > 0) {
      await renderClipsGrid(
        job,
        item,
        jobDir,
        clipsDir,
        imagesDir,
        audioPath,
        item.imagePath,
        beats,
        { useIconIntro, iconIntroSeconds, panelScale, outW, outH }
      );
    } else {
      console.log(`Skipping ${item.name}, missing image/storyboard (need sceneImagePaths+scenes or imagePath+beats)`);
      continue;
    }
  }

  await fs.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");
  console.log("Render clips step complete.");
}

async function renderClipsScenes(
  job: Job,
  item: JobItem,
  jobDir: string,
  clipsDir: string,
  imagesDir: string,
  audioPath: string,
  scenePaths: string[],
  scenes: Array<{ weight?: number; motion?: string }>,
  opts: { useIconIntro: boolean; iconIntroSeconds: number; panelScale: number; outW: number; outH: number },
  force?: boolean
) {
  const { useIconIntro, iconIntroSeconds, panelScale, outW, outH } = opts;
  const itemCache = ensureItemCache(job, item.id);

  const tempDir = path.join(clipsDir, `tmp_${item.id}`);
  const outClip = path.resolve(clipsDir, `${item.id}.mp4`);
  const relClip = path.join("clips", `${item.id}.mp4`);

  const audioDurationSeconds = await getMediaDurationSeconds(audioPath);
  const audioDurationForScenes = useIconIntro
    ? Math.max(0.1, audioDurationSeconds - iconIntroSeconds)
    : audioDurationSeconds;

  const weights = scenes.map((s) => (typeof s.weight === "number" && s.weight > 0 ? s.weight : 1));
  const { durations } = weightsToFrames({
    totalSeconds: audioDurationForScenes,
    weights,
    minSecondsPerBeat: 0.35,
  });

  const clipCount = (useIconIntro && (await fileExists(path.join(imagesDir, `${item.id}_icon.png`))) ? 1 : 0) + scenePaths.length;
  const stepHash = hashObject({
    step: "renderClips@v3",
    id: item.id,
    sceneImagePaths: scenePaths,
    weights: scenes.map((s) => s.weight ?? 1),
    durations,
    panelScale,
    iconIntroSeconds: useIconIntro ? iconIntroSeconds : 0,
    clipCount,
  });

  if (!force && itemCache.renderClips === stepHash) {
    try {
      await fs.access(outClip);
      item.clipPath = relClip;
      console.log(`[render-clips] skip ${item.id} (scenes), unchanged`);
      return;
    } catch {
      // fall through to render
    }
  }

  console.log(`Rendering silent scene clips for ${item.name}...`);

  await ensureDir(tempDir);
  const segmentFiles: string[] = [];

  const iconPath = path.join(imagesDir, `${item.id}_icon.png`);
  const hasIconIntro = useIconIntro && (await fileExists(iconPath));
  if (hasIconIntro) {
    const introPath = path.resolve(tempDir, "intro.mp4");
    const absIconPath = path.resolve(imagesDir, `${item.id}_icon.png`);
    await run(
      "ffmpeg",
      [
        "-y", "-loop", "1", "-i", absIconPath,
        "-filter_complex",
        `[0:v]scale=-2:${Math.round(outH * panelScale)}[ps];color=c=white:s=${outW}x${outH}[bg];[bg][ps]overlay=(W-w)/2:(H-h)/2:format=auto[v]`,
        "-map", "[v]", "-t", String(iconIntroSeconds),
        "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-an", introPath,
      ],
      tempDir
    );
    segmentFiles.push(introPath);
  }

  const targetH = Math.round(outH * panelScale);

  for (let i = 0; i < scenePaths.length; i++) {
    const relPath = scenePaths[i];
    if (relPath === undefined) continue;
    const sceneImagePath = path.resolve(jobDir, relPath);
    const dur = durations[i] ?? durations[durations.length - 1] ?? 0.35;
    const motion = scenes[i]?.motion ?? "zoomSlow";
    const totalFrames = Math.max(1, Math.round(dur * FPS));

    let filterComplex: string;
    if (motion === "zoomIn") {
      filterComplex = [
        `color=c=white:s=${outW}x${outH}[bg]`,
        `[0:v]scale=-2:${targetH}[p0]`,
        `[p0]zoompan=z='min(zoom+0.002,1.2)':d=${totalFrames}:s=${outW}x${outH}[p]`,
        `[bg][p]overlay=(W-w)/2:(H-h)/2:format=auto[v]`,
      ].join(";");
    } else if (motion === "zoomSlow") {
      const zoomExpr = `z='1+0.08*on/${totalFrames}':d=${totalFrames}:s=${outW}x${outH}`;
      filterComplex = [
        `color=c=white:s=${outW}x${outH}[bg]`,
        `[0:v]scale=-2:${targetH}[p0]`,
        `[p0]zoompan=${zoomExpr}[p]`,
        `[bg][p]overlay=(W-w)/2:(H-h)/2:format=auto[v]`,
      ].join(";");
    } else {
      filterComplex = [
        `color=c=white:s=${outW}x${outH}[bg]`,
        `[0:v]scale=-2:${targetH}[p]`,
        `[bg][p]overlay=(W-w)/2:(H-h)/2:format=auto[v]`,
      ].join(";");
    }

    const segmentPath = path.resolve(tempDir, `seg_${i}.mp4`);
    segmentFiles.push(segmentPath);

    await run(
      "ffmpeg",
      [
        "-y", "-loop", "1", "-i", sceneImagePath,
        "-filter_complex", filterComplex,
        "-map", "[v]", "-t", String(dur),
        "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-an", segmentPath,
      ],
      tempDir
    );
  }

  const concatFile = path.join(tempDir, "list.txt");
  await fs.writeFile(
    concatFile,
    segmentFiles.map((f) => `file '${path.basename(f)}'`).join("\n"),
    "utf8"
  );

  await run(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", outClip],
    tempDir
  );

  item.clipPath = relClip;
  itemCache.renderClips = stepHash;
  console.log(`Saved: ${relClip} (silent)`);
}

async function renderClipsGrid(
  _job: Job,
  item: JobItem,
  jobDir: string,
  clipsDir: string,
  imagesDir: string,
  audioPath: string,
  imagePathRel: string,
  beats: StoryboardBeat[],
  opts: { useIconIntro: boolean; iconIntroSeconds: number; panelScale: number; outW: number; outH: number }
) {
  const imagePath = path.resolve(jobDir, imagePathRel);
  const { useIconIntro, iconIntroSeconds, panelScale, outW, outH } = opts;

  console.log(`Rendering silent scene clips for ${item.name} (grid)...`);
  const audioDurationSeconds = await getMediaDurationSeconds(audioPath);

  let weights = beats.map((b) => (typeof b.weight === "number" && b.weight > 0 ? b.weight : 1));
  while (weights.length < 9) weights.push(1);
  if (weights.length > 9) weights = weights.slice(0, 9);

  const audioDurationForPanels = useIconIntro
    ? Math.max(0.1, audioDurationSeconds - iconIntroSeconds)
    : audioDurationSeconds;

  const { durations } = weightsToFrames({
    totalSeconds: audioDurationForPanels,
    weights,
    minSecondsPerBeat: 0.35,
  });

  const tempDir = path.join(clipsDir, `tmp_${item.id}`);
  await ensureDir(tempDir);

  const { width: imgW, height: imgH } = await getVideoOrImageSize(imagePath);
  const segmentFiles: string[] = [];

  const iconPath = path.join(imagesDir, `${item.id}_icon.png`);
  const hasIconIntro = useIconIntro && (await fileExists(iconPath));
  if (hasIconIntro) {
    const introPath = path.resolve(tempDir, "intro.mp4");
    const absIconPath = path.resolve(imagesDir, `${item.id}_icon.png`);
    await run(
      "ffmpeg",
      [
        "-y", "-loop", "1", "-i", absIconPath,
        "-filter_complex",
        `[0:v]scale=-2:${Math.round(outH * panelScale)}[ps];color=c=white:s=${outW}x${outH}[bg];[bg][ps]overlay=(W-w)/2:(H-h)/2:format=auto[v]`,
        "-map", "[v]", "-t", String(iconIntroSeconds),
        "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-an", introPath,
      ],
      tempDir
    );
    segmentFiles.push(introPath);
  }

  const targetH = Math.round(outH * panelScale);

  for (let i = 0; i < 9; i++) {
    const dur = durations[i] ?? durations[durations.length - 1] ?? 0.35;
    const { panelW, panelH, x, y } = buildCropArgs({ imgW, imgH, panelIndex: i + 1 });
    const filterComplex = [
      `color=c=white:s=${outW}x${outH}[bg]`,
      `[0:v]crop=${panelW}:${panelH}:${x}:${y},scale=-2:${targetH}[p]`,
      `[bg][p]overlay=(W-w)/2:(H-h)/2:format=auto[v]`,
    ].join(";");

    const segmentPath = path.resolve(tempDir, `seg_${i}.mp4`);
    segmentFiles.push(segmentPath);

    await run(
      "ffmpeg",
      [
        "-y", "-loop", "1", "-i", imagePath,
        "-filter_complex", filterComplex,
        "-map", "[v]", "-t", String(dur),
        "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-an", segmentPath,
      ],
      tempDir
    );
  }

  const concatFile = path.join(tempDir, "list.txt");
  await fs.writeFile(
    concatFile,
    segmentFiles.map((f) => `file '${path.basename(f)}'`).join("\n"),
    "utf8"
  );

  const outClip = path.resolve(clipsDir, `${item.id}.mp4`);
  const relClip = path.join("clips", `${item.id}.mp4`);
  await run(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", outClip],
    tempDir
  );

  item.clipPath = relClip;
  console.log(`Saved: ${relClip} (silent)`);
}
