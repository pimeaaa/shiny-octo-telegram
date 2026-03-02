import { spawn } from "node:child_process";

export function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);

    let output = "";

    proc.stdout.on("data", (d) => {
      output += d.toString();
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("ffprobe failed"));
      } else {
        resolve(parseFloat(output.trim()));
      }
    });
  });
}

export async function getMediaDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ];

    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    let err = "";

    proc.stdout.on("data", (d) => (out += String(d)));
    proc.stderr.on("data", (d) => (err += String(d)));

    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed (${code}): ${err.trim()}`));
        return;
      }

      const v = Number.parseFloat(out.trim());
      if (!Number.isFinite(v) || v <= 0) {
        reject(new Error(`Invalid duration from ffprobe: "${out.trim()}"`));
        return;
      }

      resolve(v);
    });
  });
}

export async function getVideoOrImageSize(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath,
    ];

    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    let err = "";

    proc.stdout.on("data", (d) => (out += String(d)));
    proc.stderr.on("data", (d) => (err += String(d)));

    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed (${code}): ${err.trim()}`));
        return;
      }

      try {
        const json = JSON.parse(out) as { streams?: Array<{ width?: number; height?: number }> };
        const s = json?.streams?.[0];
        const width = Number(s?.width);
        const height = Number(s?.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          reject(new Error(`Invalid size from ffprobe: ${out}`));
          return;
        }
        resolve({ width, height });
      } catch (e) {
        reject(e);
      }
    });
  });
}

export function probeImageSize(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=s=x:p=0",
      filePath
    ]);

    let output = "";

    proc.stdout.on("data", (d) => {
      output += d.toString();
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("ffprobe failed to get image dimensions"));
      } else {
        const dims = output.trim().split("x").map(Number);
        const width = dims[0];
        const height = dims[1];
        if (!width || !height) {
          reject(new Error(`Failed to parse image dimensions: ${output.trim()}`));
        } else {
          resolve({ width, height });
        }
      }
    });
  });
}
