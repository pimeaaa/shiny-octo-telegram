# GridForge Agent Notes

GridForge is a Node.js + TypeScript CLI that generates a compilation explainer video from a single topic.
The video format is a 12 item grid style explainer. For MVP we support generating fewer items for testing.

Current output target:
- Landscape 1920x1080
- One compilation video (12 segments, or fewer for testing)
- No text burned into images by default
- Subtitles optional later (SRT)

## Core idea
We generate:
1) A job (job.json) with items (topic units)
2) Audio scripts for each item (audio only, no visual directions)
3) A storyboard per item (beats + panels + image prompt)
4) One multi panel grid image per item
5) Voiceover audio per item (ElevenLabs)
6) Beat based clip rendering by cropping panels from the grid image
7) Concatenate clips into final compilation mp4
8) Optional subtitles and upload steps later

## Project structure
- src/cli/index.ts
  CLI entry point. Commands should follow an if, else if, else chain to avoid fallthrough bugs.

- src/steps/*
  Each automation step is implemented as a function here. Steps read and update job.json.

- src/types/job.ts
  Zod schemas and TypeScript types for job.json.

- src/config/*
  Presets, style locks, and prompt templates live here.

- jobs/<jobId>/
  Generated artifacts per run. Contains job.json plus scripts, images, audio, clips, final.

## Job ID convention
Job IDs use:
DD-MM-YYYY--HH-mm-ss_title
Example: 01-03-2026--14-05-33_phobias

## CLI commands (current)
Implemented:
- create-job [topic] --count <n>
  Creates jobs/<jobId>/job.json with 1..12 items.
  After success, prints the next suggested command.

- write-scripts <path-to-job.json> [--limit <n>]
  Generates audio-only scripts and stores them in:
  jobs/<jobId>/scripts/<itemId>.txt
  and in job.json under item.voiceoverScript.
  After success, prints the next suggested command.

- storyboard <path-to-job.json> [--limit <n>]
  Generates a structured storyboard (beats and panel mapping) and an imagePrompt per item.
  After success, prints the next suggested command.

- gen-images <path-to-job.json> [--limit <n>] [--force]
  Generates one 3x3 grid image per item and stores it under jobs/<jobId>/images/<itemId>.png.
  Updates item.imagePath in job.json.
  Uses a character profile (job.character.profilePath) and supports reference images for consistency.
  After success, prints the next suggested command (placeholder until audio step exists).

Planned next:
- gen-audio
- render-clips
- compile
- subtitles
- upload-youtube

## Content style rules
Scripts:
- Must start exactly with: "Number X: <Name>."
- Single paragraph, audio only
- Cinematic, visual language, but no explicit visual directions like "[Visual: ...]"
- No emojis, no bullet points, no brackets
- Avoid the em dash character, use commas or parentheses instead

Images:
- Minimalist European comic style
- Thick outlines, flat colors
- Pure white background, no scenery unless essential
- No text anywhere (no speech bubbles, captions, signs)
- Nico must appear in every panel, with a consistent design (defined in the style lock prompt)

## Nico character lock
Nico must appear in every panel:
- Large, slightly pink or red nose
- Half sleepy eyelids
- Messy short dark hair with a distinctive spike
- Green casual jacket
- Unzipped white t-shirt with a small black lightning bolt icon
- Beige or tan pants
- Bright yellow sneakers
- Oversized wristwatch

## Development conventions
- Keep steps deterministic and resumable:
  If an artifact exists (imagePath, audioPath, clipPath), do not regenerate unless a force flag is added later.
- Keep prompt templates centralized in src/config so they can be tuned without hunting across code.
- Validate job.json with zod before writing.
- Prefer small, single purpose functions.
- Do not add contribution guidelines yet. We will add CONTRIBUTING.md after MVP is working.

## CLI UX convention
After a command finishes successfully, it should print a copy paste friendly "Next:" command that continues the pipeline using the same jobPath and a safe default --limit 1 for quick iteration.

## MVP milestone definition
Working MVP means:
- create-job works with --count 1..12
- write-scripts works with --limit and produces audio-only scripts
- storyboard produces beats and a 3x3 grid prompt per item
- image generation produces one grid per item
- clip rendering crops panels per beat and syncs to audio duration (simple timing first)
- compile produces final 1920x1080 compilation mp4