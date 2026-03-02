#!/usr/bin/env node
import { createJob } from "../steps/createJob.js";
import { writeScripts } from "../steps/writeScripts.js";
import { storyboardJob } from "../steps/storyboard.js";
import { genImages } from "../steps/genImages.js";
import { genAudioLocal } from "../steps/genAudioLocal.js";
import { genAudioElevenlabs } from "../steps/genAudioElevenlabs.js";
import { renderClips } from "../steps/renderClips.js";
import { compileJob } from "../steps/compile.js";

const [command, ...rest] = process.argv.slice(2);

if (!command) {
  console.log("GridForge CLI");
  console.log("Commands:");
  console.log("  create-job [topic] [--count <n>] [--preset <name>] [--topic <s>] [--seriesTitle <s>] [--intro name|numberAndName] [--promptStyle <s>] [--scriptStyle <style>] [--items <path>]");
  console.log("    --count <number>     Auto-generate N items from topic using AI");
  console.log("    --items <path>       Path to JSON file containing items list");
  console.log("    --scriptStyle <fear|curiosity|educational|conspiracy>");
  console.log("    --promptStyle <string>");
  console.log("  write-scripts <path-to-job.json>");
  console.log("  storyboard <path-to-job.json>");
  console.log("  gen-images <path-to-job.json> [--limit <n>] [--force] [--provider openai|gemini]");
  console.log("  gen-audio-local <path-to-job.json>");
  console.log("  gen-audio-elevenlabs <path-to-job.json>");
  console.log("  render-clips <path-to-job.json>");
  console.log("  compile <path-to-job.json>");
  process.exit(0);
}

if (command === "create-job") {
  const args = rest;

  function getArg(name: string): string | undefined {
    const index = args.indexOf(`--${name}`);
    if (index !== -1 && args[index + 1]) {
      return args[index + 1];
    }
    return undefined;
  }

  const countIndex = args.indexOf("--count");
  const countRaw = countIndex >= 0 ? args[countIndex + 1] : undefined;
  const count = countRaw ? Number(countRaw) : undefined;

  const presetIndex = args.indexOf("--preset");
  const preset = presetIndex >= 0 ? args[presetIndex + 1] : undefined;

  const topicFlag = getArg("topic");
  const seriesTitle = getArg("seriesTitle");
  const introRaw = getArg("intro");
  const intro = (introRaw === "numberAndName" || introRaw === "name" ? introRaw : undefined) as "name" | "numberAndName" | undefined;
  const promptStyle = getArg("promptStyle");
  const scriptStyleRaw = getArg("scriptStyle");
  const scriptStyle = (
    scriptStyleRaw === "fear" ||
    scriptStyleRaw === "curiosity" ||
    scriptStyleRaw === "educational" ||
    scriptStyleRaw === "conspiracy"
      ? scriptStyleRaw
      : undefined
  ) as "fear" | "curiosity" | "educational" | "conspiracy" | undefined;
  const itemsPath = getArg("items");

  // Extract topic from positionals (everything before first flag)
  const flagIndices = [
    countIndex,
    presetIndex,
    args.indexOf("--topic"),
    args.indexOf("--seriesTitle"),
    args.indexOf("--intro"),
    args.indexOf("--promptStyle"),
    args.indexOf("--scriptStyle"),
    args.indexOf("--items"),
  ].filter((idx) => idx >= 0);
  const firstFlagIndex = flagIndices.length > 0 ? Math.min(...flagIndices) : args.length;
  const topicParts = args.slice(0, firstFlagIndex);
  const topicPositional = topicParts.join(" ").trim();

  const topic = topicFlag ?? (topicPositional.length ? topicPositional : undefined);

  const createJobArgs: {
    topic?: string;
    count?: number;
    preset?: string;
    seriesTitle?: string;
    intro?: "name" | "numberAndName";
    promptStyle?: string;
    scriptStyle?: "fear" | "curiosity" | "educational" | "conspiracy";
    itemsPath?: string;
  } = {};
  if (topic !== undefined) {
    createJobArgs.topic = topic;
  }
  if (typeof count === "number" && Number.isFinite(count)) {
    createJobArgs.count = count;
  }
  if (preset !== undefined) {
    createJobArgs.preset = preset;
  }
  if (seriesTitle !== undefined) {
    createJobArgs.seriesTitle = seriesTitle;
  }
  if (intro !== undefined) {
    createJobArgs.intro = intro;
  }
  if (promptStyle !== undefined) {
    createJobArgs.promptStyle = promptStyle;
  }
  if (scriptStyle !== undefined) {
    createJobArgs.scriptStyle = scriptStyle;
  }
  if (itemsPath !== undefined) {
    createJobArgs.itemsPath = itemsPath;
  }

  createJob(createJobArgs)
    .then(({ outPath, jobId }) => {
      console.log(`Created job: ${jobId}`);
      console.log(`Saved: ${outPath}`);
      console.log("");
      console.log("Next:");
      console.log(
        `pnpm run write-scripts ${outPath} -- --limit 1`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to create job:");
      console.error(err);
      process.exit(1);
    });
} else if (command === "write-scripts") {
  const jobPath = rest[0];

  if (!jobPath) {
    console.error("Usage: write-scripts <path-to-job.json> [--limit <number>]");
    process.exit(1);
  }

  const args = rest.slice(1);
  const limitIndex = args.indexOf("--limit");
  const limitRaw = limitIndex >= 0 ? args[limitIndex + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  writeScripts(jobPath, limit)
    .then(() => {
      console.log("");
      console.log("Next:");
      console.log(
        `pnpm run storyboard ${jobPath} -- --limit 1`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to write scripts:");
      console.error(err);
      process.exit(1);
    });
} else if (command === "storyboard") {
  const jobPath = rest[0];

  if (!jobPath) {
    console.error("Usage: storyboard <path-to-job.json> [--limit <number>]");
    process.exit(1);
  }

  const args = rest.slice(1);
  const limitIndex = args.indexOf("--limit");
  const limitRaw = limitIndex >= 0 ? args[limitIndex + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  storyboardJob(jobPath, limit)
    .then(() => {
      console.log("");
      console.log("Next:");
      console.log(
        `pnpm run gen-images ${jobPath} -- --limit 1`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Storyboard failed:");
      console.error(err);
      process.exit(1);
    });
} else if (command === "gen-images") {
  const jobPath = rest[0];

  if (!jobPath) {
    console.error("Usage: gen-images <path-to-job.json> [--limit <number>] [--force] [--provider openai|gemini]");
    process.exit(1);
  }

  const args = rest.slice(1);
  const limitIndex = args.indexOf("--limit");
  const limitRaw = limitIndex >= 0 ? args[limitIndex + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const force = args.includes("--force");
  const providerIndex = args.indexOf("--provider");
  const providerRaw = providerIndex >= 0 ? args[providerIndex + 1] : undefined;
  const provider = (providerRaw === "gemini" || providerRaw === "openai"
    ? providerRaw
    : undefined) as "openai" | "gemini" | undefined;

  const genOpts: { provider?: "openai" | "gemini" } | undefined = provider !== undefined ? { provider } : undefined;
  genImages(jobPath, limit, force, genOpts)
    .then(() => {
      console.log("");
      console.log("Next:");
      console.log(
        `pnpm run gen-audio-elevenlabs ${jobPath} -- --limit 1`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Image generation failed:");
      console.error(err);
      process.exit(1);
    });
} else if (command === "gen-audio-local") {
  const jobPath = rest[0];

  if (!jobPath) {
    console.error("Usage: gen-audio-local <path-to-job.json> [--limit <n>] [--seconds <n>] [--beep] [--force]");
    process.exit(1);
  }

  const args = rest.slice(1);

  const limitIndex = args.indexOf("--limit");
  const limitRaw = limitIndex >= 0 ? args[limitIndex + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const secIndex = args.indexOf("--seconds");
  const secRaw = secIndex >= 0 ? args[secIndex + 1] : undefined;
  const seconds = secRaw ? Number(secRaw) : undefined;

  const force = args.includes("--force");
  const beep = args.includes("--beep");

  const genAudioLocalOpts: { limit?: number; seconds?: number; force?: boolean; beep?: boolean } = {};
  if (typeof limit === "number" && Number.isFinite(limit)) {
    genAudioLocalOpts.limit = limit;
  }
  if (typeof seconds === "number" && Number.isFinite(seconds)) {
    genAudioLocalOpts.seconds = seconds;
  }
  if (force) {
    genAudioLocalOpts.force = force;
  }
  if (beep) {
    genAudioLocalOpts.beep = beep;
  }

  genAudioLocal(jobPath, genAudioLocalOpts)
    .then(() => {
      console.log("");
      console.log("Next:");
      console.log(`pnpm run render-clips ${jobPath} -- --limit 1`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Local audio generation failed:");
      console.error(err);
      process.exit(1);
    });
} else if (command === "gen-audio-elevenlabs") {
  const jobPath = rest[0];

  if (!jobPath) {
    console.error(
      "Usage: gen-audio-elevenlabs <path-to-job.json> [--limit <number>] [--force] [--voiceId <id>] [--modelId <id>]"
    );
    process.exit(1);
  }

  const args = rest.slice(1);

  const limitIndex = args.indexOf("--limit");
  const limitRaw = limitIndex >= 0 ? args[limitIndex + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const force = args.includes("--force");

  const voiceIndex = args.indexOf("--voiceId");
  const voiceId = voiceIndex >= 0 ? args[voiceIndex + 1] : undefined;

  const modelIndex = args.indexOf("--modelId");
  const modelId = modelIndex >= 0 ? args[modelIndex + 1] : undefined;

  const stabilityIndex = args.indexOf("--stability");
  const stabilityRaw = stabilityIndex >= 0 ? args[stabilityIndex + 1] : undefined;
  const stability = stabilityRaw ? Number(stabilityRaw) : undefined;

  const similarityIndex = args.indexOf("--similarity");
  const similarityRaw = similarityIndex >= 0 ? args[similarityIndex + 1] : undefined;
  const similarity = similarityRaw ? Number(similarityRaw) : undefined;

  const styleIndex = args.indexOf("--style");
  const styleRaw = styleIndex >= 0 ? args[styleIndex + 1] : undefined;
  const style = styleRaw ? Number(styleRaw) : undefined;

  const genAudioElevenlabsOpts: {
    limit?: number;
    force?: boolean;
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarity?: number;
    style?: number;
  } = {};
  if (typeof limit === "number" && Number.isFinite(limit)) {
    genAudioElevenlabsOpts.limit = limit;
  }
  if (force) {
    genAudioElevenlabsOpts.force = force;
  }
  if (voiceId) {
    genAudioElevenlabsOpts.voiceId = voiceId;
  }
  if (modelId) {
    genAudioElevenlabsOpts.modelId = modelId;
  }
  if (typeof stability === "number" && Number.isFinite(stability)) {
    genAudioElevenlabsOpts.stability = stability;
  }
  if (typeof similarity === "number" && Number.isFinite(similarity)) {
    genAudioElevenlabsOpts.similarity = similarity;
  }
  if (typeof style === "number" && Number.isFinite(style)) {
    genAudioElevenlabsOpts.style = style;
  }

  genAudioElevenlabs(jobPath, genAudioElevenlabsOpts)
    .then(() => {
      console.log("");
      console.log("Next:");
      console.log(`pnpm run render-clips ${jobPath} -- --limit 1`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("gen-audio-elevenlabs failed:");
      console.error(err);
      process.exit(1);
    });
} else if (command === "render-clips") {
  const jobPath = rest[0];

  if (!jobPath) {
    console.error("Usage: render-clips <path-to-job.json> [--limit <n>] [--force]");
    process.exit(1);
  }

  const args = rest.slice(1);
  const limitIndex = args.indexOf("--limit");
  const limitRaw = limitIndex >= 0 ? args[limitIndex + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const force = args.includes("--force");

  renderClips(jobPath, limit, force)
    .then(() => {
      console.log("");
      console.log("Next:");
      console.log(`pnpm run compile ${jobPath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Render clips failed:");
      console.error(err);
      process.exit(1);
    });
} else if (command === "compile") {
  const jobPath = rest[0];

  if (!jobPath) {
    console.error("Usage: compile <path-to-job.json> [--limit <n>] [--force]");
    process.exit(1);
  }

  const args = rest.slice(1);

  const limitIndex = args.indexOf("--limit");
  const limitRaw = limitIndex >= 0 ? args[limitIndex + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const force = args.includes("--force");

  const compileJobOpts: { limit?: number; force?: boolean } = {};
  if (typeof limit === "number" && Number.isFinite(limit)) {
    compileJobOpts.limit = limit;
  }
  if (force) {
    compileJobOpts.force = force;
  }

  compileJob(jobPath, compileJobOpts)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Compile failed:");
      console.error(err);
      process.exit(1);
    });
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
