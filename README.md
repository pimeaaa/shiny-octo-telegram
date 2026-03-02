# GridForge

GridForge is a Node.js + TypeScript CLI that generates a compilation explainer video from a single topic.
The format is a grid style explainer with multiple items (usually 12). For testing, you can run 1 item.

## Target Output

- Landscape 1920x1080
- One compilation video
- No text burned into images by default
- Optional subtitles later

## Requirements

- Node.js 22+
- pnpm (Corepack recommended)

## Setup

```bash
corepack enable
pnpm install
```

Create a `.env` file:

```bash
cp .env.example .env
```

Fill in:

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY` (later)
- `ELEVENLABS_VOICE_ID` (later)

To use Gemini for image generation instead of OpenAI, set `GEMINI_API_KEY` and in `job.json` set `settings.images.provider` to `"gemini"` (optional: `settings.images.geminiModel` to `"gemini-3.1-flash-image-preview"` or `"gemini-3-pro-image-preview"` or `"gemini-2.5-flash-image"`). Then run: `pnpm run gen-images jobs/<jobId>/job.json -- --limit 1`.

## Commands

### Create a Job

Creates `jobs/<jobId>/job.json`.

```bash
pnpm run create-job -- --count 1
```

You can also pass a topic:

```bash
pnpm run create-job -- "Phobias" --count 12
```

### Generate Scripts

Generates audio-only scripts and stores them in:

- `jobs/<jobId>/scripts/*.txt`
- `job.json` under each item as `voiceoverScript`

```bash
pnpm run write-scripts jobs/<jobId>/job.json -- --limit 1
```

## Output Folder Structure

Each job writes artifacts into `jobs/<jobId>/`:

- `job.json`
- `scripts/`
- `images/` (planned)
- `audio/` (planned)
- `clips/` (planned)
- `final/` (planned)

## Notes

- Scripts are audio-only. Visual planning happens in the storyboard step later.
- Images must contain no text. Nico must appear in every panel.
- We will add CONTRIBUTING guidelines after the MVP is working.
