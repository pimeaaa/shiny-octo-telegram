import fs from "node:fs/promises";
import { z } from "zod";

export const CharacterProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  styleLock: z.string(),
  referenceImages: z.array(z.string()).default([]),
});

export type CharacterProfile = z.infer<typeof CharacterProfileSchema>;

export async function loadCharacterProfile(profilePath: string) {
  const raw = await fs.readFile(profilePath, "utf8");
  return CharacterProfileSchema.parse(JSON.parse(raw));
}
