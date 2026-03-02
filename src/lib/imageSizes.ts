export type OpenAIImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

export function getLandscapeSize(): OpenAIImageSize {
  return "1536x1024";
}

export function getSquareSize(): OpenAIImageSize {
  return "1024x1024";
}
