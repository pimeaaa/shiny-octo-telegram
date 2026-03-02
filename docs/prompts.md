# Prompt System

GridForge relies heavily on structured prompt engineering.

## Script Generation Rules

Scripts:
- Must start with "Number X: <Name>."
- Single paragraph
- 12 to 20 seconds spoken
- Cinematic and visual
- No emojis
- No brackets
- No bullet formatting
- No em dashes

Structure:
1) Hook
2) Definition
3) Concrete examples
4) Psychological explanation
5) Trigger line

## Storyboard Rules

Storyboard output:
- 6 to 9 beats
- Each beat assigned to panelIndex 1 to 9
- Emphasis level (low, medium, high)

Images:
- 3x3 grid
- Pure white background
- No text
- Nico present in every panel

Future:
We may version prompts (v1, v2, v3) for A/B testing.

## Separation of concerns
- write-scripts generates audio-only scripts.
- storyboard generates beats and visual plans.
- gen-images generates images based on storyboard prompts and character profile.
