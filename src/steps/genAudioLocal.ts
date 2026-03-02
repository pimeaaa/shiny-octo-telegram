import fs from "node:fs/promises";
import path from "node:path";
import { JobSchema } from "../types/job.js";
import { ensureDir, fileExists } from "../lib/fs.js";
import { runFfmpeg } from "../lib/ffmpeg.js";

export async function genAudioLocal(
  jobPath: string,
  opts?: { limit?: number; seconds?: number; force?: boolean; beep?: boolean }
) {
  const raw = await fs.readFile(jobPath, "utf8");
  const job = JobSchema.parse(JSON.parse(raw));

  const limit = opts?.limit;
  const seconds =
    typeof opts?.seconds === "number" && Number.isFinite(opts.seconds) && opts.seconds > 0
      ? opts.seconds
      : 14;

  const force = Boolean(opts?.force);

  const items =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? job.items.slice(0, limit)
      : job.items;

  const jobDir = path.dirname(jobPath);
  const audioDir = path.join(jobDir, "audio");
  await ensureDir(audioDir);

  for (const item of items) {
    const outFile = path.join(audioDir, `${item.id}.mp3`);
    const rel = path.join("audio", `${item.id}.mp3`);

    const exists = await fileExists(outFile);
    if (exists && !force) {
      console.log(`Skipping ${item.name}, audio already exists (use --force to regenerate)`);
      if (!item.audioPath) item.audioPath = rel;
      continue;
    }

    console.log(`Generating local audio for ${item.name} (${seconds}s)...`);

    if (opts?.beep) {
      // Beep every 1 second: 200ms tone + 800ms silence, looped for duration
      // This makes timing obvious when testing edits.
      await runFfmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=0.2",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=stereo",
        "-filter_complex",
        `[0:a]volume=0.3[a0];[1:a]atrim=0:${seconds},asetpts=PTS-STARTPTS[a1];` +
          `[a0]aloop=loop=-1:size=1e9[a0l];` +
          `[a0l][a1]amix=inputs=2:duration=first:dropout_transition=0`,
        "-t",
        String(seconds),
        "-q:a",
        "4",
        outFile
      ]);
    } else {
      // Silence placeholder
      await runFfmpeg([
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=stereo",
        "-t",
        String(seconds),
        "-q:a",
        "9",
        outFile
      ]);
    }

    item.audioPath = rel;
    console.log(`Saved: ${rel}`);
  }

  await fs.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");
  console.log("Local audio generation step complete.");
}
