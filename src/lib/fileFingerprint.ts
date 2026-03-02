import fs from "node:fs/promises";

export type FileFingerprint = {
  size: number;
  mtimeMs: number;
};

export async function getFileFingerprint(filePath: string): Promise<FileFingerprint> {
  const stat = await fs.stat(filePath);
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}
