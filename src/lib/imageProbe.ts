import { spawn } from "node:child_process";

export async function probeImageSize(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
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

    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffprobe failed for image"));
      const dims = out.trim().split("x").map(Number);
      const w = dims[0];
      const h = dims[1];
      if (w === undefined || h === undefined || !Number.isFinite(w) || !Number.isFinite(h)) {
        return reject(new Error("Could not parse image size"));
      }
      resolve({ width: w, height: h });
    });
  });
}
