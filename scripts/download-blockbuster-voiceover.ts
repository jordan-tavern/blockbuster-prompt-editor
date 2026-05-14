/**
 * Download Blockbuster voiceover for an ad id (uses BLOCKBUSTER_API_KEY + default blockbuster-v2 host).
 *
 *   npx tsx scripts/download-blockbuster-voiceover.ts <ad-uuid> [output.mp3]
 *
 * Prefers GET /api/ads/:id/voiceover/download (OpenAPI) for a fresh signed URL; falls back to
 * composition_data.voiceover.url if that endpoint fails.
 */

import { config } from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { blockbusterGetAd, blockbusterVoiceoverDownload } from "../server-integrations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  const adId = process.argv[2]?.trim();
  if (!adId) {
    console.error("Usage: npx tsx scripts/download-blockbuster-voiceover.ts <ad-uuid> [output.mp3]");
    process.exit(1);
  }
  const out =
    process.argv[3]?.trim() ||
    path.resolve(__dirname, "..", "out", `voiceover-${adId.slice(0, 8)}.mp3`);

  const key = process.env.BLOCKBUSTER_API_KEY?.trim();
  if (!key) {
    console.error("BLOCKBUSTER_API_KEY missing in .env");
    process.exit(1);
  }

  let url: string | null = null;
  try {
    const dl = await blockbusterVoiceoverDownload(adId, key);
    url = dl.url.trim();
    console.error("Using Blockbuster voiceover/download signed URL.");
  } catch (e) {
    console.error("voiceover/download failed:", e instanceof Error ? e.message : String(e));
    console.error("Falling back to composition_data.voiceover.url …");
  }

  if (!url) {
    const ad = await blockbusterGetAd(adId, key);
    const cd = ad.composition_data;
    const vo = (cd?.voiceover ?? cd?.voiceOver) as Record<string, unknown> | undefined;
    const gcsPath = vo && typeof vo === "object" && typeof vo.gcsPath === "string" ? vo.gcsPath : "";
    url =
      vo && typeof vo === "object" && typeof vo.url === "string" && vo.url.trim().length > 0
        ? vo.url.trim()
        : null;
    if (!url) {
      console.error("No voiceover URL from download endpoint or composition_data.", gcsPath ? `gcsPath: ${gcsPath}` : "");
      process.exit(1);
    }
  }

  const bin = await fetch(url);
  if (!bin.ok) {
    console.error("Voiceover download failed:", bin.status, await bin.text());
    process.exit(1);
  }
  const buf = Buffer.from(await bin.arrayBuffer());
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, buf);
  console.log("Wrote", out, `(${buf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
