import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { JobSchema } from "../types/job.js";
import { ensureDir, fileExists } from "../lib/fs.js";

// TODO Phase 2: background music layer, SFX layer, multiple audio tracks

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", cwd });
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(cmd + " failed"))));
  });
}

export async function compileJob(
  jobPath: string,
  opts?: { limit?: number; force?: boolean }
) {
  const raw = await fs.readFile(jobPath, "utf8");
  const job = JobSchema.parse(JSON.parse(raw));

  const items =
    typeof opts?.limit === "number" && Number.isFinite(opts.limit) && opts.limit > 0
      ? job.items.slice(0, opts.limit)
      : job.items;

  const jobDir = path.dirname(jobPath);
  const outFile = path.join(jobDir, "final.mp4");
  const relOut = "final.mp4";

  if ((await fileExists(outFile)) && !opts?.force) {
    console.log(`Skipping compile, final.mp4 already exists (use --force to regenerate)`);
    job.finalVideoPath = relOut;
    await fs.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");
    return;
  }

  const itemsWithClips = items.filter(
    (it) => typeof it.clipPath === "string" && it.clipPath.length > 0
  );
  if (itemsWithClips.length === 0) {
    throw new Error("No clips found to compile. Run render-clips first.");
  }

  const buildDir = path.join(jobDir, "build");
  await ensureDir(buildDir);

  // Per item: mux narration onto silent clip (or copy clip if no audio), then concat all
  const builtPaths: string[] = [];
  for (const item of itemsWithClips) {
    const clipPath = path.resolve(jobDir, item.clipPath!);
    const ok = await fileExists(clipPath);
    if (!ok) throw new Error(`Missing clip file: ${clipPath}`);

    const builtName = `item_${item.id}.mp4`;
    const builtPath = path.join(buildDir, builtName);

    if (typeof item.audioPath === "string" && item.audioPath.length > 0) {
      const audioPath = path.resolve(jobDir, item.audioPath);
      const audioExists = await fileExists(audioPath);
      if (audioExists) {
        console.log(`Muxing narration for item ${item.name}...`);
        await run(
          "ffmpeg",
          [
            "-y",
            "-i",
            clipPath,
            "-i",
            audioPath,
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            builtPath,
          ],
          undefined
        );
      } else {
        await fs.copyFile(clipPath, builtPath);
      }
    } else {
      await fs.copyFile(clipPath, builtPath);
    }
    builtPaths.push(builtPath);
  }

  const listPath = path.join(buildDir, "concat.txt");
  const lines = builtPaths.map((abs) => {
    const rel = path.relative(buildDir, abs).split(path.sep).join("/");
    return `file '${rel}'`;
  });
  await fs.writeFile(listPath, lines.join("\n"), "utf8");

  console.log(`Compiling ${builtPaths.length} clip(s) into final.mp4...`);

  await run(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat.txt",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      path.resolve(buildDir, "final.mp4"),
    ],
    buildDir
  );

  await fs.rename(path.join(buildDir, "final.mp4"), outFile);

  job.finalVideoPath = relOut;
  await fs.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");

  console.log(`Saved: ${relOut}`);
}
