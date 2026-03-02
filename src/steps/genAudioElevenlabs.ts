import fs from "node:fs/promises";
import path from "node:path";
import { JobSchema } from "../types/job.js";
import { ensureDir, fileExists } from "../lib/fs.js";
import { elevenlabsTextToSpeechMp3 } from "../lib/elevenlabs.js";
import { hashObject } from "../lib/hash.js";
import { ensureJobCache, ensureItemCache } from "../lib/jobCache.js";

export async function genAudioElevenlabs(
  jobPath: string,
  opts?: {
    limit?: number;
    force?: boolean;
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarity?: number;
    style?: number;
  }
) {
  const raw = await fs.readFile(jobPath, "utf8");
  const job = JobSchema.parse(JSON.parse(raw));
  ensureJobCache(job);

  const items =
    typeof opts?.limit === "number" && Number.isFinite(opts.limit) && opts.limit > 0
      ? job.items.slice(0, opts.limit)
      : job.items;

  const jobDir = path.dirname(jobPath);
  const audioDir = path.join(jobDir, "audio");
  await ensureDir(audioDir);

  for (const item of items) {
    const audioPath = path.join(audioDir, `${item.id}.mp3`);
    const rel = path.join("audio", `${item.id}.mp3`);

    const itemCache = ensureItemCache(job, item.id);

    const stepHash = hashObject({
      step: "genAudioElevenlabs@1",
      id: item.id,
      voiceoverScript: item.voiceoverScript ?? null,
      voiceId: opts?.voiceId ?? null,
      modelId: opts?.modelId ?? null,
      outputFormat: "mp3",
      stability: opts?.stability ?? null,
      similarityBoost: opts?.similarity ?? null,
      style: opts?.style ?? null,
      speakerBoost: true,
    });

    const prevHash = itemCache.genAudioElevenlabs;
    const audioExists = await fileExists(audioPath);

    if (!opts?.force && prevHash === stepHash && audioExists) {
      if (!item.audioPath) item.audioPath = rel;
      console.log(`[gen-audio-elevenlabs] skip ${item.id}, unchanged`);
      continue;
    }

    if (!item.voiceoverScript) {
      throw new Error(
        `[gen-audio-elevenlabs] Missing voiceoverScript for item ${item.id}. Run write-scripts first.`
      );
    }

    console.log(`Generating ElevenLabs audio for ${item.name}...`);

    try {
      const voiceSettings: {
        stability?: number;
        similarity_boost?: number;
        style?: number;
        use_speaker_boost?: boolean;
      } = {
        use_speaker_boost: true
      };
      if (typeof opts?.stability === "number" && Number.isFinite(opts.stability)) {
        voiceSettings.stability = opts.stability;
      }
      if (typeof opts?.similarity === "number" && Number.isFinite(opts.similarity)) {
        voiceSettings.similarity_boost = opts.similarity;
      }
      if (typeof opts?.style === "number" && Number.isFinite(opts.style)) {
        voiceSettings.style = opts.style;
      }

      const ttsArgs: {
        text: string;
        voiceId?: string;
        modelId?: string;
        voiceSettings?: typeof voiceSettings;
      } = {
        text: item.voiceoverScript,
        voiceSettings
      };
      if (opts?.voiceId) {
        ttsArgs.voiceId = opts.voiceId;
      }
      if (opts?.modelId) {
        ttsArgs.modelId = opts.modelId;
      }

      const mp3 = await elevenlabsTextToSpeechMp3(ttsArgs);

      await fs.writeFile(audioPath, mp3);
      item.audioPath = rel;
      itemCache.genAudioElevenlabs = stepHash;

      console.log(`Saved: ${rel}`);
    } catch (err) {
      console.error(`Failed to generate audio for ${item.name}:`);
      console.error(err);
    }
  }

  await fs.writeFile(jobPath, JSON.stringify(job, null, 2), "utf8");
  console.log("ElevenLabs audio generation complete.");
}
