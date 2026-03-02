/**
 * Explainer Icon: clear, isolated item concept only.
 * Optimized for grid layouts, pure white background for easy masking/removal.
 */

export function buildExplainerIconPromptText(args: {
  iconIdea: string;
  hookObjects: string[];
  visualStyle?: string; // e.g., "flat vector art", "3D render inside a circle", "clean 2D cartoon"
}): string {
  const { iconIdea, hookObjects, visualStyle = "clean digital illustration" } = args;
  const primaryConcept =
    hookObjects.length > 0 && hookObjects[0]
      ? hookObjects[0]
      : iconIdea;

  return `
Create a single, isolated icon-style illustration for an explainer video. Concept only — do NOT include any unnecessary characters or people.

SUBJECT: ${primaryConcept}
Use this as the sole focal object. Represent the concept clearly and distinctly so it is easily recognizable when scaled down in a grid layout.

COMPOSITION: Centered, fully contained within the frame. Do NOT cut off the edges of the object. Flat, straight-on angle or simple isometric view. 

ENVIRONMENT: Pure white background for perfect isolation.
- Background base color = pure white RGB(255,255,255).
- No ground plane, no cast shadows on the background, no gradients, no vignettes.
- The object must appear floating and perfectly isolated to allow for easy background removal/compositing.

STYLE: ${visualStyle}, explainer video asset style. Highly readable, distinct colors, well-defined edges.

DO NOT: No text. No letters, numbers, punctuation, or symbols. No complex background scenes or environments.
`.trim();
}