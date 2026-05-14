import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".ogg"]);

export function serveStatic(app: Express) {
  // Use fileURLToPath + dirname pattern — works on all Node 20.x versions
  // (import.meta.dirname was only added in Node 20.11.0)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(
    express.static(distPath, {
      // Explicitly accept range requests so browsers can seek / buffer videos
      acceptRanges: true,
      setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          res.setHeader("Accept-Ranges", "bytes");
          // Prevent proxies/CDNs from caching partial responses incorrectly
          res.setHeader("Cache-Control", "public, max-age=86400");
          if (ext === ".mp4") res.setHeader("Content-Type", "video/mp4");
          else if (ext === ".webm") res.setHeader("Content-Type", "video/webm");
        }
      },
    }),
  );

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
