/**
 * Replace Blockbuster workspace voiceover with a local file, scale caption word timings,
 * and stretch scene duration constants in the composition TSX (proportional to new VO length).
 */

import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import type { ProjectRecord } from "./server-projects.js";
import { publicDirOf, srcDirOf } from "./server-projects.js";

const VO_HELPER_FN = "voBlockbusterSrc";

export async function ffprobeDurationSec(audioPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ]);
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      const v = parseFloat(out.trim());
      resolve(Number.isFinite(v) && v > 0 ? v : null);
    });
  });
}

function inferOldVoiceoverDurationSec(defaultProps: Record<string, unknown>): number | null {
  const vo = (defaultProps.voiceover ?? defaultProps.voiceOver) as Record<string, unknown> | undefined;
  if (vo && typeof vo === "object") {
    const ds = Number((vo as { durationSec?: unknown }).durationSec);
    if (Number.isFinite(ds) && ds > 0.05) return ds;
  }
  const caps = defaultProps.captions;
  if (Array.isArray(caps) && caps.length > 0) {
    let max = 0;
    for (const w of caps) {
      if (!w || typeof w !== "object") continue;
      const e = Number((w as { end?: unknown }).end);
      if (Number.isFinite(e)) max = Math.max(max, e);
    }
    if (max > 0.05) return max;
  }
  return null;
}

function scaleCaptions(
  caps: unknown,
  ratio: number
): { captions: unknown[]; scaled: boolean } {
  if (!Array.isArray(caps) || caps.length === 0) return { captions: [], scaled: false };
  const out: unknown[] = [];
  for (const row of caps) {
    if (!row || typeof row !== "object") {
      out.push(row);
      continue;
    }
    const o = row as Record<string, unknown>;
    const next: Record<string, unknown> = { ...o };
    for (const k of ["start", "end"]) {
      const v = Number(o[k]);
      if (Number.isFinite(v)) next[k] = Math.max(0, v * ratio);
    }
    out.push(next);
  }
  return { captions: out, scaled: true };
}

function countTransitionSeriesTransitions(tsx: string): number {
  const m = tsx.match(/<TransitionSeries\.Transition\b/g);
  return m ? m.length : 0;
}

function parseConstInt(tsx: string, name: string): number | null {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)\\s*;`);
  const m = tsx.match(re);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Scale `const S*_DUR = n` body scenes (not EC_DUR), recompute `const durationInFrames = n`.
 */
export function scaleBlockbusterSceneDurationsInTsx(
  tsx: string,
  ratio: number
): { tsx: string; warnings: string[]; durationInFrames: number | null } {
  const warnings: string[] = [];
  const clamped = Math.min(6, Math.max(0.15, ratio));
  if (clamped !== ratio) warnings.push(`ratio clamped to ${clamped.toFixed(3)} (was ${ratio.toFixed(3)})`);

  const sceneRe = /const\s+(S\d+[A-Z]?)\s*_DUR\s*=\s*(\d+)\s*;/g;
  const scenes: { full: string; name: string; frames: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = sceneRe.exec(tsx)) !== null) {
    scenes.push({ full: m[0], name: m[1], frames: parseInt(m[2], 10) });
  }
  if (scenes.length === 0) {
    warnings.push("TSX: no `const S*_DUR = …` scene constants found — scene lengths unchanged.");
    let out = tsx;
    const df = parseConstInt(tsx, "durationInFrames");
    let durationInFrames: number | null = null;
    if (df != null) {
      const nv = Math.max(1, Math.round(df * clamped));
      durationInFrames = nv;
      out = out.replace(/(const\s+durationInFrames\s*=\s*)\d+(\s*;)/, `$1${nv}$2`);
    }
    return { tsx: out, warnings, durationInFrames };
  }

  let out = tsx;
  for (const s of scenes) {
    const nv = Math.max(1, Math.round(s.frames * clamped));
    const lineRe = new RegExp(`const\\s+${s.name}\\s*_DUR\\s*=\\s*\\d+\\s*;`);
    out = out.replace(lineRe, `const ${s.name}_DUR = ${nv};`);
  }

  const ec = parseConstInt(out, "EC_DUR") ?? 150;
  const tf = parseConstInt(out, "TRANSITION_FRAMES") ?? 12;
  const nTrans = countTransitionSeriesTransitions(out);
  let sumSeq = ec;
  const sceneRe2 = /const\s+(S\d+[A-Z]?)\s*_DUR\s*=\s*(\d+)\s*;/g;
  while ((m = sceneRe2.exec(out)) !== null) {
    sumSeq += parseInt(m[2], 10);
  }
  const newDur = Math.max(1, sumSeq - nTrans * tf);
  const durReplaced = out.replace(/(const\s+durationInFrames\s*=\s*)\d+(\s*;)/, `$1${newDur}$2`);
  if (durReplaced === out) {
    warnings.push("TSX: `const durationInFrames = …` not updated (pattern not found).");
    return { tsx: out, warnings, durationInFrames: null };
  }
  out = durReplaced;
  return { tsx: out, warnings, durationInFrames: newDur };
}

function addStaticFileToFirstRemotionImport(tsx: string): string {
  if (/\bstaticFile\b/.test(tsx)) return tsx;
  const re = /import\s*\{([\s\S]*?)\}\s*from\s*(["'])remotion\2/g;
  return tsx.replace(re, (full, inner: string, quote: string) => {
    if (/\bstaticFile\b/.test(inner)) return full;
    const t = inner.trim().replace(/^\s*,/, "").replace(/,\s*$/, "").trim();
    const body = t ? `staticFile, ${t}` : `staticFile`;
    return `import { ${body} } from ${quote}remotion${quote}`;
  });
}

function ensureVoSrcHelper(tsx: string): string {
  if (tsx.includes(`function ${VO_HELPER_FN}`)) return tsx;
  const helper =
    `function ${VO_HELPER_FN}(url: string | undefined): string {\n` +
    `  if (!url) return "";\n` +
    `  if (/^https?:\\/\\//i.test(url)) return url;\n` +
    `  return staticFile(url);\n` +
    `}\n`;
  const importMatch = tsx.match(/^(import[^\n]+\n)+/m);
  if (importMatch) {
    const idx = importMatch[0].length;
    return tsx.slice(0, idx) + "\n" + helper + tsx.slice(idx);
  }
  return helper + "\n" + tsx;
}

function patchVoiceoverAudioSrc(tsx: string): string {
  let out = tsx;
  out = out.replace(
    /<Audio\s+src=\{props\.(voiceover|voiceOver)\?\.url\}/g,
    `<Audio src={${VO_HELPER_FN}(props.$1?.url)}`
  );
  out = out.replace(
    /<Audio\s+src=\{props\.(voiceover|voiceOver)\.url\}/g,
    `<Audio src={${VO_HELPER_FN}(props.$1?.url)}`
  );
  return out;
}

export function ensureLocalVoiceoverAudioHandling(tsx: string): { tsx: string; changed: boolean } {
  let out = tsx;
  const before = out;
  out = addStaticFileToFirstRemotionImport(out);
  out = ensureVoSrcHelper(out);
  out = patchVoiceoverAudioSrc(out);
  return { tsx: out, changed: out !== before };
}

export interface VoiceoverReplaceResult {
  publicRelativePath: string;
  newDurationSec: number;
  ratio: number;
  compositionMetaPath: string;
  compositionTsxRel: string;
  warnings: string[];
}

export async function replaceBlockbusterVoiceoverOnDisk(args: {
  project: ProjectRecord;
  /** Temp path from multer (file still there). */
  uploadedTmpPath: string;
  originalFilename: string;
  manualDurationSec?: number | null;
}): Promise<VoiceoverReplaceResult> {
  const { project, uploadedTmpPath, originalFilename } = args;
  const ext = path.extname(originalFilename).toLowerCase() || ".mp3";
  const safeExt = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].includes(ext) ? ext : ".mp3";
  const base = `voice-replaced-${Date.now()}${safeExt}`;
  const subdir = "uploads/audio";
  const destDir = path.join(publicDirOf(project), subdir);
  await fs.mkdir(destDir, { recursive: true });
  const destAbs = path.join(destDir, base);

  let newDur =
    (typeof args.manualDurationSec === "number" && Number.isFinite(args.manualDurationSec) && args.manualDurationSec > 0
      ? args.manualDurationSec
      : null) ?? (await ffprobeDurationSec(uploadedTmpPath));
  if (newDur == null || newDur <= 0) {
    await fs.rm(uploadedTmpPath, { force: true }).catch(() => {});
    throw new Error(
      "Could not read audio duration (ffprobe missing or failed). Install ffmpeg, or pass manualDurationSec in the request body."
    );
  }

  await fs.rename(uploadedTmpPath, destAbs).catch(async () => {
    const buf = await fs.readFile(uploadedTmpPath);
    await fs.writeFile(destAbs, buf);
    await fs.rm(uploadedTmpPath, { force: true }).catch(() => {});
  });

  const metaPath = path.join(project.rootDir, "src", "composition-meta.json");
  const rawMeta = await fs.readFile(metaPath, "utf-8");
  const meta = JSON.parse(rawMeta) as {
    defaultProps?: Record<string, unknown>;
    fps?: number;
    durationInFrames?: number;
    [k: string]: unknown;
  };
  const origDp =
    meta.defaultProps && typeof meta.defaultProps === "object" && !Array.isArray(meta.defaultProps)
      ? (meta.defaultProps as Record<string, unknown>)
      : {};
  const hadVoiceOverKey = Object.prototype.hasOwnProperty.call(origDp, "voiceOver");
  const dp = { ...origDp };

  const oldDur = inferOldVoiceoverDurationSec(origDp);
  const ratio = oldDur != null && oldDur > 0.05 ? newDur / oldDur : 1;

  const publicRelativePath = `${subdir}/${base}`;
  const warnings: string[] = [];

  const patchVo = (key: "voiceover" | "voiceOver") => {
    const cur = dp[key];
    const next: Record<string, unknown> =
      cur && typeof cur === "object" && !Array.isArray(cur) ? { ...(cur as Record<string, unknown>) } : {};
    delete next.gcsPath;
    delete next.assetId;
    next.url = publicRelativePath;
    next.durationSec = newDur;
    dp[key] = next;
  };
  patchVo("voiceover");
  if (hadVoiceOverKey) patchVo("voiceOver");

  const { captions, scaled } = scaleCaptions(dp.captions, ratio);
  if (scaled) dp.captions = captions;

  const fps = typeof meta.fps === "number" && meta.fps > 0 ? meta.fps : project.fps;

  const tsxRel = project.compositionModule;
  const tsxPath = path.join(srcDirOf(project), tsxRel);
  let tsx = await fs.readFile(tsxPath, "utf-8");
  const { tsx: scaledTsx, warnings: tw, durationInFrames: scaledTotal } = scaleBlockbusterSceneDurationsInTsx(tsx, ratio);
  tsx = scaledTsx;
  warnings.push(...tw);

  const { tsx: patchedTsx } = ensureLocalVoiceoverAudioHandling(tsx);
  tsx = patchedTsx;

  meta.defaultProps = dp;
  if (scaledTotal != null && Number.isFinite(scaledTotal)) {
    meta.durationInFrames = scaledTotal;
  } else {
    meta.durationInFrames = Math.max(1, Math.round(newDur * fps));
  }

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  await fs.writeFile(tsxPath, tsx, "utf-8");

  return {
    publicRelativePath,
    newDurationSec: newDur,
    ratio,
    compositionMetaPath: metaPath,
    compositionTsxRel: tsxRel,
    warnings,
  };
}
