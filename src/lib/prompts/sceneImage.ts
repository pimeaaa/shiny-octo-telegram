import type { StoryboardScene } from "../../types/job.js";

const SCALE_RULES = `
Character scale (strict):
- shot="close": Nico occupies 80–90% of frame height.
- shot="medium": 60–70% of frame height. Keep feet visible when possible.
- shot="wide": 40–60% of frame height. Keep feet visible when possible.
- Keep proportions consistent across all scenes.
`.trim();

/** Replace placeholder with actual character name. */
function withCharacterName(text: string, characterName: string): string {
  return text.replace(/\$\{"?Nico"?\}/g, characterName).replace(/Nico/g, characterName);
}

/**
 * Build text prompt for a single scene image (OpenAI path).
 * Phase A: white compositing background, character scale, safe area.
 */
export function buildSceneImagePromptText(args: {
  scene: StoryboardScene;
  characterName: string;
  styleLock: string;
}): string {
  const { scene, characterName, styleLock } = args;
  const propsLine =
    scene.props.length > 0 ? ` Props: ${scene.props.join(", ")}.` : "";

  const scaleRules = withCharacterName(SCALE_RULES, characterName);

  return `
Create a single-panel image. LANDSCAPE. One scene only.

WHITE COMPOSITING BACKGROUND:
- Canvas base is pure white (#FFFFFF). No gray gradients, no vignette, no textured paper, no studio backdrop gradients.
- Any minimal environment elements must dissolve softly into white at the edges (soft fade). No hard rectangular background edges.
- Result must composite cleanly onto a white canvas in editing.

${scaleRules}

SAFE AREA:
- All important elements (character, key props) must stay within the central 70% of the frame.
- Maintain white margins around edges. Do not place key props near borders.

${styleLock}

Scene (${scene.shot}, ${scene.intensity}): ${scene.visual}
${characterName}: ${scene.nicoAction}.${propsLine}

Rules: No text. No letters, numbers, punctuation, or symbols. Minimal props. White compositing background only.
`.trim();
}
