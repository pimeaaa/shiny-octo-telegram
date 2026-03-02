# Architecture Overview

GridForge is a step-based pipeline.

Each step:
- Reads job.json
- Adds structured data
- Writes job.json back
- Creates artifacts in jobs/<jobId>/

## Pipeline Steps (implemented and planned)

1) create-job (implemented)
   Generates job.json scaffold with character profile pointer:
   job.character.profilePath -> assets/characters/<id>/profile.json

2) write-scripts (implemented)
   Generates audio-only voiceover scripts per item.
   Saves scripts to jobs/<jobId>/scripts and writes voiceoverScript to job.json.

3) storyboard (implemented)
   Generates structured beats and panel mapping for a 3x3 grid.
   Writes item.storyboard and item.imagePrompt.

4) gen-images (implemented)
   Generates one 3x3 grid image per item.
   Saves to jobs/<jobId>/images and writes item.imagePath to job.json.
   Character reference images are loaded via character profile.

5) gen-audio (planned)
   ElevenLabs MP3 generation per item.

6) render-clips (planned)
   Beat based crops from the 3x3 grid, synced to audio duration.

7) compile (planned)
   Concatenate all clips into final.mp4.

8) subtitles (planned)
   Generate SRT and optionally burn in.

9) upload-youtube (planned)
   Auto upload and metadata publishing.

Design principles:
- Deterministic
- Resumable
- Artifact-based
- Stateless between steps

We avoid:
- Hidden state
- In-memory pipelines
- Coupled steps

Each step should be independently runnable.

### Character consistency
Character design is controlled by a Character Profile:
assets/characters/<id>/profile.json includes:
- styleLock (text)
- referenceImages (paths to local images)

Steps that need character consistency load this profile. Image generation uses reference images when supported by the image API.
