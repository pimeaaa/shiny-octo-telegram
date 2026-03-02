import fs from "node:fs/promises";
import path from "node:path";
import { formatISO } from "date-fns";
import { JobSchema, type Job } from "../types/job.js";
import { writeJson } from "../lib/fs.js";
import { getPhobiasPreset, getMentalDisordersPreset } from "../config/presets.js";
import type { JobItem } from "../types/job.js";
import { generateItemsFromTopic } from "../lib/generateItems.js";

function getPreset(template?: string): { topic: string; seriesTitle: string; items: JobItem[] } {
  const name = template?.trim() || "phobias";
  return name === "mental-disorders" ? getMentalDisordersPreset() : getPhobiasPreset();
}

function makeJobId(topic: string) {
  const now = new Date();

  const pad = (n: number) => String(n).padStart(2, "0");

  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear();

  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  const safeTopic = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "")
    .slice(0, 40);

  return `${day}-${month}-${year}--${hours}-${minutes}-${seconds}_${safeTopic || "job"}`;
}

export type CreateJobOptions = {
  outputPath?: string;
  template?: string;
  topic?: string;
  seriesTitle?: string;
  intro?: "name" | "numberAndName";
  promptStyle?: string;
  scriptStyle?: "fear" | "curiosity" | "educational" | "conspiracy";
  itemsPath?: string;
  count?: number;
  preset?: string;
};

async function loadItemsFromFile(filePath: string): Promise<JobItem[]> {
  const absolute = path.resolve(filePath);
  const raw = await fs.readFile(absolute, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Items file must be an array");
  }

  return parsed.map((item: { id?: string; name?: string; hook?: string; iconIdea?: string }, index: number) => {
    if (!item.name || !item.hook || !item.iconIdea) {
      throw new Error(
        `Invalid item at index ${index}. Required fields: name, hook, iconIdea`
      );
    }

    return {
      id: item.id ?? String(index + 1).padStart(2, "0"),
      name: item.name,
      hook: item.hook,
      iconIdea: item.iconIdea,
    };
  });
}

export async function createJob(options: CreateJobOptions) {
  const template = options.template ?? options.preset;
  const preset = getPreset(template);

  const topic =
    options.topic !== undefined && options.topic.trim() !== ""
      ? options.topic.trim()
      : preset.topic ?? "Untitled Topic";

  let items: JobItem[];
  if (options.itemsPath) {
    console.log(`Loading items from ${options.itemsPath}...`);
    items = await loadItemsFromFile(options.itemsPath);
  } else if (typeof options.count === "number" && options.count > 0) {
    console.log(`Generating ${options.count} items using AI...`);
    items = await generateItemsFromTopic({
      topic,
      count: options.count,
    });
  } else {
    items = preset.items;
  }

  const seriesTitle =
    options.seriesTitle !== undefined && options.seriesTitle.trim() !== ""
      ? options.seriesTitle.trim()
      : preset.seriesTitle ?? `${topic} Grid`;

  const intro = options.intro ?? "name";
  const promptStyle = options.promptStyle ?? "shorts_ominous_v1";
  const style = options.scriptStyle ?? "fear";

  const jobId = makeJobId(topic);

  const job: Job = {
    jobId,
    createdAt: formatISO(new Date()),
    topic,
    seriesTitle,
    format: "landscape",
    resolution: { width: 1920, height: 1080 },
    compilation: true,
    character: {
      id: "nico",
      profilePath: "assets/characters/nico/profile.json",
    },
    items,
    settings: {
      script: {
        intro,
        promptStyle,
        style,
      },
      storyboard: {
        beatsMin: 6,
        beatsMax: 9,
        defaultMotion: "zoomSlow",
      },
      render: {
        useIconIntro: true,
        iconIntroSeconds: 0.8,
        panelScale: 0.78,
      },
    },
  };

  const parsed = JobSchema.parse(job);

  const outPath = path.join("jobs", jobId, "job.json");
  await writeJson(outPath, parsed);

  return { jobId, outPath };
}
