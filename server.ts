import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, ".env") });

import express from "express";
import cors from "cors";
import fs from "fs/promises";
import multer from "multer";
import { spawn } from "child_process";
import {
  REPO_ROOT,
  EDITOR_WORKSPACES_DIR,
  getActiveProject,
  setActiveProject,
  listEditableRelativePaths,
  readSourceSnapshot,
  readRegistry,
  writeSourceFile,
  writeRegistry,
  versionsDirOf,
  publicDirOf,
  ensureRegistry,
  clientSrcRootRel,
  touchProjectsFingerprint,
  type ProjectRecord,
} from "./server-projects.js";
import {
  assetServerSearchText,
  assetServerSearchLabels,
  assetServerListLabels,
  assetServerIndexedVideoSignedUrl,
  assetServerUnindexedSignedUrl,
  assetServerOverlaySignedUrl,
  assetServerBackingTrackSignedUrl,
  fetchBinary,
  hydrateBlockbusterCompositionData,
  refreshBlockbusterCompositionMetaUrls,
  mergeBlockbusterVoiceoverDownloadUrl,
  blockbusterAdIdFromBbProjectId,
} from "./server-integrations.js";
import { importBlockbusterAd } from "./server-blockbuster-import.js";
import { replaceBlockbusterVoiceoverOnDisk } from "./server-blockbuster-voiceover-replace.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const CURSOR_MODEL = process.env.CURSOR_MODEL || "claude-opus-4-7-xhigh";

const undoStacks = new Map<string, Array<{ files: Record<string, string>; description: string }>>();

function undoFor(projectId: string): Array<{ files: Record<string, string>; description: string }> {
  if (!undoStacks.has(projectId)) undoStacks.set(projectId, []);
  return undoStacks.get(projectId)!;
}

async function snapshotForUndo(project: ProjectRecord, description: string) {
  const paths = await listEditableRelativePaths(project);
  const files = await readSourceSnapshot(project, paths);
  undoFor(project.id).push({ files, description });
}

/** Undo snapshot for voiceover replace: editable TS + `composition-meta.json` (not in editable glob). */
async function snapshotBlockbusterVoiceoverUndo(project: ProjectRecord) {
  const paths = await listEditableRelativePaths(project);
  const files = await readSourceSnapshot(project, paths);
  try {
    files["composition-meta.json"] = await fs.readFile(
      path.join(project.rootDir, "src", "composition-meta.json"),
      "utf-8"
    );
  } catch {
    /* missing */
  }
  undoFor(project.id).push({ files, description: "Replace voiceover" });
}

async function readAllEditable(project: ProjectRecord): Promise<Record<string, string>> {
  const paths = await listEditableRelativePaths(project);
  return readSourceSnapshot(project, paths);
}

// ═══════════════════════════════════════════════
// Projects API
// ═══════════════════════════════════════════════

function coercePositiveInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = parseInt(v.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Blockbuster TSX compositions almost always declare `const durationInFrames = N;` at module scope.
 * That value can drift ahead of `composition-meta.json` after manual edits; use it so Player/timeline match the TSX.
 */
async function readCompositionModuleDurationFrames(project: ProjectRecord): Promise<number | null> {
  if (!project.id.startsWith("bb-")) return null;
  const mod = project.compositionModule;
  if (typeof mod !== "string" || !mod.endsWith(".tsx")) return null;
  try {
    const fp = path.join(project.rootDir, "src", mod);
    const raw = await fs.readFile(fp, "utf-8");
    const m = /\bconst\s+durationInFrames\s*=\s*(\d+)\s*;/.exec(raw);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function readCompositionMetaClientSlice(
  project: ProjectRecord
): Promise<{
  defaultProps?: Record<string, unknown>;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
} | null> {
  try {
    const raw = await fs.readFile(path.join(project.rootDir, "src", "composition-meta.json"), "utf-8");
    const meta = JSON.parse(raw) as Record<string, unknown>;
    const slice: {
      defaultProps?: Record<string, unknown>;
      durationInFrames?: number;
      fps?: number;
      width?: number;
      height?: number;
    } = {};
    const dp = meta.defaultProps;
    if (dp && typeof dp === "object" && !Array.isArray(dp)) {
      slice.defaultProps = dp as Record<string, unknown>;
    }
    const dif = coercePositiveInt(meta.durationInFrames);
    if (dif != null) slice.durationInFrames = dif;
    const fps = coercePositiveInt(meta.fps);
    if (fps != null) slice.fps = fps;
    const w = coercePositiveInt(meta.width);
    if (w != null) slice.width = w;
    const h = coercePositiveInt(meta.height);
    if (h != null) slice.height = h;
    return Object.keys(slice).length > 0 ? slice : null;
  } catch {
    return null;
  }
}

async function currentProjectClientPayload(project: ProjectRecord) {
  const metaSlice = await readCompositionMetaClientSlice(project);
  const compositionDefaultProps = metaSlice?.defaultProps;

  let durationInFrames =
    metaSlice?.durationInFrames != null ? metaSlice.durationInFrames : project.durationInFrames;
  const tsxDur = await readCompositionModuleDurationFrames(project);
  if (tsxDur != null) {
    durationInFrames = Math.max(durationInFrames, tsxDur);
  }

  const fps = metaSlice?.fps != null ? metaSlice.fps : project.fps;
  const width = metaSlice?.width != null ? metaSlice.width : project.width;
  const height = metaSlice?.height != null ? metaSlice.height : project.height;

  return {
    id: project.id,
    label: project.label,
    compositionId: project.compositionId,
    compositionModule: project.compositionModule,
    fps,
    width,
    height,
    durationInFrames,
    srcRootRel: clientSrcRootRel(project),
    timelineMode: project.id === "rivet" ? "rivet" : "simple",
    ...(compositionDefaultProps != null ? { compositionDefaultProps } : {}),
  };
}

app.get("/api/projects", async (_req, res) => {
  const reg = await ensureRegistry();
  res.json({
    activeId: reg.activeId,
    projects: Object.values(reg.projects).map((p) => ({
      id: p.id,
      label: p.label,
      compositionId: p.compositionId,
      compositionModule: p.compositionModule,
      fps: p.fps,
      width: p.width,
      height: p.height,
      durationInFrames: p.durationInFrames,
      srcRootRel: clientSrcRootRel(p),
    })),
  });
});

app.get("/api/projects/current", async (_req, res) => {
  const p = await getActiveProject();
  res.json(await currentProjectClientPayload(p));
});

app.post("/api/projects/active", async (req, res) => {
  const { id } = req.body;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Missing id" });
    return;
  }
  const p = await setActiveProject(id);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(await currentProjectClientPayload(p));
});

app.post("/api/projects/import-blockbuster", async (req, res) => {
  const { adId, apiKey } = req.body ?? {};
  if (typeof adId !== "string" || !adId.trim()) {
    res.status(400).json({ error: "adId required" });
    return;
  }
  try {
    const { project, hydrationWarnings } = await importBlockbusterAd(adId.trim(), typeof apiKey === "string" ? apiKey : undefined);
    res.json({
      ok: true,
      project: await currentProjectClientPayload(project),
      hydrationWarnings,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

/** Re-resolve `assetId` → signed `url` in `src/composition-meta.json` for the active Blockbuster project. */
app.post("/api/projects/hydrate-blockbuster-assets", async (_req, res) => {
  try {
    const project = await getActiveProject();
    if (!project.id.startsWith("bb-")) {
      res.status(400).json({ error: "Active project must be a Blockbuster import (id starts with bb-)" });
      return;
    }
    const metaPath = path.join(project.rootDir, "src", "composition-meta.json");
    const raw = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(raw) as {
      fps: number;
      width: number;
      height: number;
      durationInFrames: number;
      defaultProps?: Record<string, unknown>;
    };
    meta.defaultProps = await hydrateBlockbusterCompositionData(meta.defaultProps ?? {});
    const adId = blockbusterAdIdFromBbProjectId(project.id);
    const voWarnings = adId ? await mergeBlockbusterVoiceoverDownloadUrl(meta.defaultProps, adId) : [];
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    await touchProjectsFingerprint();
    res.json({
      ok: true,
      project: await currentProjectClientPayload(project),
      ...(voWarnings.length ? { hydrationWarnings: voWarnings } : {}),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

/** Replace one `defaultProps.clips[i]` with an indexed asset-server video id; re-hydrate signed `url`s and save `composition-meta.json`. */
app.post("/api/projects/blockbuster-replace-clip", async (req, res) => {
  const clipIndexRaw = (req.body as { clipIndex?: unknown })?.clipIndex;
  const videoId = typeof (req.body as { videoId?: unknown })?.videoId === "string" ? String((req.body as { videoId: string }).videoId).trim() : "";
  const clipIndex = typeof clipIndexRaw === "number" ? clipIndexRaw : parseInt(String(clipIndexRaw), 10);
  if (!Number.isFinite(clipIndex) || clipIndex < 0) {
    res.status(400).json({ error: "clipIndex must be a non-negative integer" });
    return;
  }
  if (!videoId) {
    res.status(400).json({ error: "videoId required" });
    return;
  }
  try {
    const project = await getActiveProject();
    if (!project.id.startsWith("bb-")) {
      res.status(400).json({ error: "Active project must be a Blockbuster import (id starts with bb-)" });
      return;
    }
    const metaPath = path.join(project.rootDir, "src", "composition-meta.json");
    const raw = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(raw) as {
      fps: number;
      width: number;
      height: number;
      durationInFrames: number;
      defaultProps?: Record<string, unknown>;
    };
    const dp = meta.defaultProps ?? {};
    const clips = dp.clips;
    if (!Array.isArray(clips) || clipIndex >= clips.length) {
      res.status(400).json({ error: "Invalid clipIndex for this composition" });
      return;
    }
    const prev = clips[clipIndex];
    if (!prev || typeof prev !== "object") {
      res.status(400).json({ error: "Clip entry is not an object" });
      return;
    }
    const nextClip: Record<string, unknown> = { ...(prev as Record<string, unknown>) };
    nextClip.assetId = videoId;
    delete nextClip.url;
    const nextClips = [...clips];
    nextClips[clipIndex] = nextClip;
    meta.defaultProps = { ...dp, clips: nextClips };
    meta.defaultProps = await hydrateBlockbusterCompositionData(meta.defaultProps);
    const adId = blockbusterAdIdFromBbProjectId(project.id);
    const voWarnings = adId ? await mergeBlockbusterVoiceoverDownloadUrl(meta.defaultProps, adId) : [];
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    await touchProjectsFingerprint();
    res.json({
      ok: true,
      project: await currentProjectClientPayload(project),
      ...(voWarnings.length ? { hydrationWarnings: voWarnings } : {}),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// ═══════════════════════════════════════════════
// Asset Server proxy (search + attach)
// ═══════════════════════════════════════════════

const INDEXED_VIDEO_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCommaLabels(v: unknown): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

app.get("/api/assets/labels", async (_req, res) => {
  try {
    const data = await assetServerListLabels();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.get("/api/assets/indexed-signed-url", async (req, res) => {
  const videoId = typeof req.query.videoId === "string" ? req.query.videoId.trim() : "";
  if (!videoId || !INDEXED_VIDEO_ID_RE.test(videoId)) {
    res.status(400).json({ error: "videoId must be an indexed UUID" });
    return;
  }
  try {
    const signed_url = await assetServerIndexedVideoSignedUrl(videoId);
    res.json({ url: signed_url, videoId });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

/** Text search (q, optional labels= comma-separated) or POST JSON for text / label search. */
app.get("/api/assets/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const k = req.query.k ? parseInt(String(req.query.k), 10) : 10;
  if (!q.trim()) {
    res.status(400).json({ error: "q required" });
    return;
  }
  try {
    const filterLabels = parseCommaLabels(req.query.labels);
    const data = await assetServerSearchText(q, Number.isFinite(k) ? k : 10, {
      filterLabels: filterLabels.length ? filterLabels : undefined,
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

/**
 * POST body:
 * - `{ "kind": "text", "query": "…", "k"?: number, "labels"?: string[] }` — semantic text search, optional label filter
 * - `{ "kind": "labels", "labels": string[], "matchAll"?: boolean }` — videos matching catalog labels
 */
app.post("/api/assets/search", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind : "text";
  try {
    if (kind === "labels") {
      const raw = body.labels;
      const labels = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 50)
        : [];
      if (labels.length < 1) {
        res.status(400).json({ error: "labels array required" });
        return;
      }
      const matchAll = Boolean(body.matchAll);
      const data = await assetServerSearchLabels(labels, matchAll);
      res.json(data);
      return;
    }
    const query = typeof body.query === "string" ? body.query : "";
    if (!query.trim()) {
      res.status(400).json({ error: "query required for text search" });
      return;
    }
    const k = typeof body.k === "number" && Number.isFinite(body.k) ? body.k : 12;
    const lab = body.labels;
    const filterLabels = Array.isArray(lab)
      ? lab.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 50)
      : [];
    const data = await assetServerSearchText(query, k, {
      filterLabels: filterLabels.length ? filterLabels : undefined,
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.post("/api/assets/attach", async (req, res) => {
  const { kind, id } = req.body ?? {};
  if (typeof kind !== "string" || typeof id !== "string") {
    res.status(400).json({ error: "kind and id required" });
    return;
  }
  const project = await getActiveProject();
  const pub = publicDirOf(project);
  const assetsDir = path.join(pub, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  let signed: string;
  try {
    if (kind === "indexed") signed = await assetServerIndexedVideoSignedUrl(id);
    else if (kind === "unindexed") signed = await assetServerUnindexedSignedUrl(id);
    else if (kind === "overlay") signed = await assetServerOverlaySignedUrl(id);
    else if (kind === "backing" || kind === "backing_track") signed = await assetServerBackingTrackSignedUrl(id);
    else {
      res.status(400).json({ error: "kind must be indexed|unindexed|overlay|backing" });
      return;
    }
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
    return;
  }

  const safeName = path.basename(id).replace(/[^a-zA-Z0-9._-]/g, "_") || "asset.bin";
  const destPath = path.join(assetsDir, safeName);
  try {
    const buf = await fetchBinary(signed);
    await fs.writeFile(destPath, buf);
  } catch (e: any) {
    res.status(500).json({ error: `Download failed: ${e?.message}` });
    return;
  }

  const staticPath = `assets/${safeName}`;
  res.json({
    path: staticPath,
    filename: safeName,
    staticFile: `staticFile("${staticPath}")`,
  });
});

// ═══════════════════════════════════════════════
// Versioning (per-project .editor-versions)
// ═══════════════════════════════════════════════

interface VersionEntry {
  id: string;
  name: string;
  timestamp: string;
  description: string;
}

async function readManifest(project: ProjectRecord): Promise<VersionEntry[]> {
  const dir = versionsDirOf(project);
  try {
    const data = await fs.readFile(path.join(dir, "manifest.json"), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeManifest(project: ProjectRecord, entries: VersionEntry[]) {
  const dir = versionsDirOf(project);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(entries, null, 2));
}

app.get("/api/versions", async (_req, res) => {
  const project = await getActiveProject();
  res.json(await readManifest(project));
});

app.post("/api/versions", async (req, res) => {
  const project = await getActiveProject();
  const { name, description } = req.body;
  const id = Date.now().toString();
  const versionDir = path.join(versionsDirOf(project), id);
  await fs.mkdir(versionDir, { recursive: true });

  const paths = await listEditableRelativePaths(project);
  const files = await readSourceSnapshot(project, paths);
  for (const [filePath, content] of Object.entries(files)) {
    const dest = path.join(versionDir, filePath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content, "utf-8");
  }

  const entry: VersionEntry = {
    id,
    name: name || `Version ${id}`,
    timestamp: new Date().toISOString(),
    description: description || "",
  };

  const manifest = await readManifest(project);
  manifest.push(entry);
  await writeManifest(project, manifest);

  res.json(entry);
});

app.post("/api/versions/:id/restore", async (req, res) => {
  const project = await getActiveProject();
  const { id } = req.params;
  const versionDir = path.join(versionsDirOf(project), id);

  try {
    await fs.access(versionDir);
  } catch {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  await snapshotForUndo(project, `restore version ${id}`);

  const paths = await listEditableRelativePaths(project);
  for (const filePath of paths) {
    const src = path.join(versionDir, filePath);
    try {
      const content = await fs.readFile(src, "utf-8");
      await writeSourceFile(project, filePath, content);
    } catch {
      /* skip */
    }
  }

  res.json({ message: `Restored version ${id}` });
});

app.delete("/api/versions/:id", async (req, res) => {
  const project = await getActiveProject();
  const { id } = req.params;
  const versionDir = path.join(versionsDirOf(project), id);

  try {
    await fs.rm(versionDir, { recursive: true });
  } catch {
    /* */
  }

  const manifest = await readManifest(project);
  const updated = manifest.filter((v) => v.id !== id);
  await writeManifest(project, updated);

  res.json({ message: "Deleted" });
});

// ═══════════════════════════════════════════════
// Undo
// ═══════════════════════════════════════════════

app.post("/api/undo", async (_req, res) => {
  const project = await getActiveProject();
  const stack = undoFor(project.id);
  if (stack.length === 0) {
    res.json({ message: "Nothing to undo.", undone: false, remaining: 0 });
    return;
  }
  const snapshot = stack.pop()!;
  for (const [filePath, content] of Object.entries(snapshot.files)) {
    await writeSourceFile(project, filePath, content);
  }
  res.json({ message: `Undid changes to ${snapshot.description}`, undone: true, remaining: stack.length });
});

app.get("/api/undo-count", async (_req, res) => {
  const project = await getActiveProject();
  res.json({ count: undoFor(project.id).length });
});

// ═══════════════════════════════════════════════
// Uploads → active project public/
// ═══════════════════════════════════════════════

const upload = multer({ dest: path.join(REPO_ROOT, ".uploads-tmp") });

/**
 * Multipart: field `audio` (file), optional `manualDurationSec` (seconds) if ffprobe is unavailable.
 */
app.post("/api/projects/replace-voiceover", upload.single("audio"), async (req, res) => {
  try {
    const project = await getActiveProject();
    if (!project.id.startsWith("bb-")) {
      res.status(400).json({ error: "Active project must be a Blockbuster import (id starts with bb-)" });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Missing multipart field `audio`" });
      return;
    }
    let manualDurationSec: number | null = null;
    const rawM = (req.body as { manualDurationSec?: unknown })?.manualDurationSec;
    if (rawM != null && rawM !== "") {
      const n = parseFloat(String(rawM));
      if (Number.isFinite(n) && n > 0) manualDurationSec = n;
    }

    await snapshotBlockbusterVoiceoverUndo(project);
    const result = await replaceBlockbusterVoiceoverOnDisk({
      project,
      uploadedTmpPath: file.path,
      originalFilename: file.originalname || "voiceover.mp3",
      manualDurationSec,
    });

    const reg = await readRegistry();
    const pr = reg.projects[project.id];
    if (pr) {
      try {
        const metaRaw = await fs.readFile(path.join(project.rootDir, "src", "composition-meta.json"), "utf-8");
        const meta = JSON.parse(metaRaw) as { durationInFrames?: unknown };
        if (typeof meta.durationInFrames === "number" && meta.durationInFrames > 0) {
          reg.projects[project.id] = { ...pr, durationInFrames: meta.durationInFrames };
        }
      } catch {
        /* keep */
      }
      await writeRegistry(reg);
    }
    await touchProjectsFingerprint();
    const updated = await getActiveProject();
    res.json({
      ok: true,
      project: await currentProjectClientPayload(updated),
      warnings: result.warnings,
      newDurationSec: result.newDurationSec,
      ratio: result.ratio,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  const project = await getActiveProject();
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  let subdir = "uploads";
  if ([".mp4", ".mov"].includes(ext)) subdir = "uploads/video";
  else if ([".wav", ".mp3"].includes(ext)) subdir = "uploads/audio";
  else if ([".png", ".jpg", ".jpeg"].includes(ext)) subdir = "uploads/images";

  const destDir = path.join(publicDirOf(project), subdir);
  await fs.mkdir(destDir, { recursive: true });
  const destPath = path.join(destDir, file.originalname);
  await fs.rename(file.path, destPath);

  const publicPath = `${subdir}/${file.originalname}`;

  res.json({
    path: publicPath,
    filename: file.originalname,
    size: file.size,
    type: file.mimetype,
  });
});

// ═══════════════════════════════════════════════
// Code files
// ═══════════════════════════════════════════════

app.get("/api/files", async (_req, res) => {
  const project = await getActiveProject();
  const paths = await listEditableRelativePaths(project);
  const files = await readSourceSnapshot(project, paths);
  res.json(files);
});

app.get("/api/file-list", async (_req, res) => {
  const project = await getActiveProject();
  res.json({ files: await listEditableRelativePaths(project) });
});

app.get("/api/file/:path(*)", async (req, res) => {
  const project = await getActiveProject();
  const filePath = (req.params as unknown as { path: string }).path;
  const allowed = await listEditableRelativePaths(project);
  if (!allowed.includes(filePath)) {
    res.status(403).json({ error: "File not editable" });
    return;
  }
  try {
    const content = await fs.readFile(path.join(project.rootDir, "src", filePath), "utf-8");
    res.json({ content });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

app.put("/api/file/:path(*)", async (req, res) => {
  const project = await getActiveProject();
  const filePath = (req.params as unknown as { path: string }).path;
  const allowed = await listEditableRelativePaths(project);
  if (!allowed.includes(filePath)) {
    res.status(403).json({ error: "File not editable" });
    return;
  }
  const { content } = req.body;
  if (typeof content !== "string") {
    res.status(400).json({ error: "Content must be a string" });
    return;
  }

  await snapshotForUndo(project, filePath);
  await writeSourceFile(project, filePath, content);
  res.json({ message: `Saved ${filePath}` });
});

// ═══════════════════════════════════════════════
// Cursor CLI prompt
// ═══════════════════════════════════════════════

function buildPromptText(args: {
  project: ProjectRecord;
  prompt: string;
  currentFrame: number;
  fps: number;
  screenshotPath: string | null;
  selection: any;
  uploadedFile: any;
  files: Record<string, string>;
}): string {
  const { project, prompt, currentFrame, fps, screenshotPath, selection, uploadedFile, files } = args;

  const selectionBlock =
    selection && Array.isArray(selection) && selection.length > 0
      ? `\nTIMELINE SELECTION (${selection.length}):\n` +
        selection
          .map(
            (s: any, i: number) =>
              `  ${i + 1}. [${s.type}] "${s.label}" frames ${s.startFrame}–${s.endFrame} (~${(s.startFrame / fps).toFixed(2)}s–${(s.endFrame / fps).toFixed(2)}s), index ${s.index}`
          )
          .join("\n") +
        `\nUse the selection as optional focus; infer which source files to edit from the project.\n`
      : "";

  const uploadBlock = uploadedFile
    ? `\nRECENTLY UPLOADED FILE:\n  Path: ${uploadedFile.path} (use with staticFile("${uploadedFile.path}"))\n  Filename: ${uploadedFile.filename}\n  Type: ${uploadedFile.type}\n`
    : "";

  const screenshotBlock = screenshotPath
    ? `\nA screenshot of the current frame is available at: ${screenshotPath}\nRead it with your image-reading tool if visual context will help.\n`
    : "";

  const srcRoot = path.relative(REPO_ROOT, project.rootDir + "/src").replace(/\\/g, "/");
  const editableList = Object.keys(files)
    .map((f) => `  - ${srcRoot}/${f}`)
    .join("\n");

  return `You are an expert Remotion video editor. The user edits a Remotion (React) composition in this workspace.

RULES:
- Use your Edit / Write tools to modify source files directly. Do NOT print code blocks for the user to copy.
- Only edit files under the project src tree that are listed below (paths relative to repo root):
${editableList}
- Active Remotion package root (cwd for this run): ${project.rootDir}
- Composition id: ${project.compositionId}; module: src/${project.compositionModule}
- Timing: ${project.fps} fps, ${project.width}x${project.height}, ${project.durationInFrames} frames. Frame from seconds: Math.round(seconds * ${project.fps}).
- After edits, reply with one short sentence describing what changed.

Current frame: ${currentFrame} (${(currentFrame / fps).toFixed(2)}s)
${selectionBlock}${uploadBlock}${screenshotBlock}
Source file contents (edit only what you need):

${Object.entries(files).map(([name, content]) => `--- ${srcRoot}/${name} ---\n${content}`).join("\n\n")}

User request:
${prompt}`;
}

app.post("/api/prompt", async (req, res) => {
  const project = await getActiveProject();
  const { prompt, currentFrame, screenshot, selection, uploadedFile } = req.body;
  if (typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  const paths = await listEditableRelativePaths(project);
  const before = await readSourceSnapshot(project, paths);

  let screenshotPath: string | null = null;
  if (typeof screenshot === "string" && screenshot.startsWith("data:image/")) {
    const tmpDir = path.join(REPO_ROOT, ".uploads-tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    screenshotPath = path.join(tmpDir, `frame-${Date.now()}.png`);
    const b64 = screenshot.replace(/^data:image\/png;base64,/, "");
    await fs.writeFile(screenshotPath, Buffer.from(b64, "base64"));
  }

  const promptText = buildPromptText({
    project,
    prompt,
    currentFrame: typeof currentFrame === "number" ? currentFrame : 0,
    fps: project.fps,
    screenshotPath,
    selection,
    uploadedFile,
    files: before,
  });

  const args = [
    "-p",
    "--force",
    "--trust",
    "--output-format",
    "stream-json",
    "--model",
    CURSOR_MODEL,
    "--workspace",
    REPO_ROOT,
    promptText,
  ];

  const proc = spawn("cursor-agent", args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let responded = false;
  const sendJson = (status: number, body: Record<string, unknown>) => {
    if (responded) return;
    responded = true;
    res.status(status).json(body);
  };

  let stdoutBuf = "";
  let stderrBuf = "";
  let resultText = "";
  let assistantText = "";
  let resultIsError = false;

  proc.stdout.on("data", (data: Buffer) => {
    stdoutBuf += data.toString();
    let nl;
    while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text" && typeof block.text === "string") {
            assistantText += block.text;
          }
        }
      }
      if (msg.type === "result") {
        resultIsError = !!msg.is_error;
        if (typeof msg.result === "string") resultText = msg.result;
      }
    }
  });

  proc.stderr.on("data", (data: Buffer) => {
    stderrBuf += data.toString();
  });

  proc.on("error", (err) => {
    if (screenshotPath) void fs.unlink(screenshotPath).catch(() => {});
    sendJson(500, { error: `Failed to spawn cursor-agent: ${err.message}` });
  });

  proc.on("close", async (code) => {
    if (screenshotPath) await fs.unlink(screenshotPath).catch(() => {});
    if (responded) return;

    if (code !== 0 || resultIsError) {
      const detail = (resultText || stderrBuf || "cursor-agent exited with a non-zero code").trim();
      sendJson(500, { error: detail });
      return;
    }

    const after = await readSourceSnapshot(project, paths);
    const editedFiles = paths.filter((f) => (after[f] ?? "") !== (before[f] ?? ""));

    if (editedFiles.length > 0) {
      undoFor(project.id).push({ files: before, description: editedFiles.join(", ") });
    }

    const message = (
      resultText ||
      assistantText ||
      (editedFiles.length > 0 ? `Edited ${editedFiles.length} file(s).` : "No changes made.")
    ).trim();
    sendJson(200, { message, edits: editedFiles });
  });
});

// ═══════════════════════════════════════════════
// Save dialog
// ═══════════════════════════════════════════════

app.get("/api/save-dialog", async (_req, res) => {
  const project = await getActiveProject();
  const { execSync } = await import("child_process");
  const defaultName = `${project.compositionId}_${new Date().toISOString().slice(0, 10)}.mp4`;
  const defaultDir = path.join(project.rootDir, "out");

  try {
    await fs.mkdir(defaultDir, { recursive: true });
    const script = `
      set defaultPath to POSIX file "${defaultDir}/${defaultName}"
      set chosenFile to choose file name with prompt "Export video as:" default name "${defaultName}" default location POSIX file "${defaultDir}"
      return POSIX path of chosenFile
    `;
    const result = execSync(`osascript -e '${script}'`, { encoding: "utf-8" }).trim();
    const filePath = result.endsWith(".mp4") ? result : result + ".mp4";
    res.json({ path: filePath });
  } catch {
    res.json({ path: null, cancelled: true });
  }
});

// ═══════════════════════════════════════════════
// Preview / render
// ═══════════════════════════════════════════════

const PREVIEW_QUALITIES: Record<string, { scale: number; crf: number }> = {
  "25": { scale: 0.25, crf: 30 },
  "50": { scale: 0.5, crf: 28 },
  "75": { scale: 0.75, crf: 23 },
  "100": { scale: 1.0, crf: 18 },
};

app.post("/api/preview", async (req, res) => {
  const project = await getActiveProject();
  const quality = req.body?.quality || "50";
  const q = PREVIEW_QUALITIES[quality] || PREVIEW_QUALITIES["50"];
  const outputDir = path.join(project.rootDir, "out");
  const outputPath = path.join(outputDir, "preview.mp4");

  await fs.mkdir(outputDir, { recursive: true });

  const width = Math.round(project.width * q.scale);
  const height = Math.round(project.height * q.scale);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (msg: string) => res.write(`data: ${msg}\n\n`);
  send(`Rendering preview at ${quality}% (${width}x${height})...`);

  if (project.id.startsWith("bb-")) {
    const adId = project.id.slice(3);
    try {
      await refreshBlockbusterCompositionMetaUrls(project.rootDir, adId);
      await touchProjectsFingerprint();
    } catch {
      /* non-fatal */
    }
  }

  const args = [
    "remotion",
    "render",
    project.compositionId,
    outputPath,
    "--width",
    String(width),
    "--height",
    String(height),
    "--crf",
    String(q.crf),
    "--concurrency",
    "50%",
  ];

  const proc = spawn("npx", args, { cwd: project.rootDir, stdio: ["ignore", "pipe", "pipe"] });

  let lastMsg = "";
  const handleOutput = (data: Buffer) => {
    const text = data.toString();
    const match = text.match(/Rendered (\d+)\/(\d+)/);
    if (match) {
      const pct = Math.round((parseInt(match[1], 10) / parseInt(match[2], 10)) * 100);
      const msg = `${pct}%`;
      if (msg !== lastMsg) {
        lastMsg = msg;
        send(msg);
      }
    }
  };

  proc.stdout.on("data", handleOutput);
  proc.stderr.on("data", handleOutput);

  proc.on("close", (code) => {
    if (code === 0) send("DONE");
    else send("ERROR");
    res.end();
  });
});

app.get("/api/preview-file", async (req, res) => {
  const project = await getActiveProject();
  const previewPath = path.join(project.rootDir, "out", "preview.mp4");
  const t = typeof req.query.t === "string" ? req.query.t : "";
  try {
    await fs.access(previewPath);
    res.setHeader("Cache-Control", "no-store");
    if (t) res.setHeader("ETag", `"${t}"`);
    res.sendFile(previewPath);
  } catch {
    res.status(404).json({ error: "No preview available" });
  }
});

app.get("/api/preview-status", async (_req, res) => {
  const project = await getActiveProject();
  const previewPath = path.join(project.rootDir, "out", "preview.mp4");
  try {
    const stat = await fs.stat(previewPath);
    res.json({ exists: true, timestamp: stat.mtime.toISOString(), size: stat.size });
  } catch {
    res.json({ exists: false });
  }
});

app.post("/api/render", async (req, res) => {
  const project = await getActiveProject();
  const outputPath =
    req.body?.outputPath || path.join(project.rootDir, "out", `${project.compositionId}_${Date.now()}.mp4`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (msg: string) => res.write(`data: ${msg}\n\n`);
  send("Starting Remotion render...");

  let stderrTail = "";
  const appendStderr = (chunk: Buffer) => {
    stderrTail += chunk.toString();
    if (stderrTail.length > 48_000) stderrTail = stderrTail.slice(-48_000);
  };

  if (project.id.startsWith("bb-")) {
    const adId = project.id.slice(3);
    send(`Refreshing signed media URLs (ad ${adId.slice(0, 8)}…)…`);
    try {
      const { warnings } = await refreshBlockbusterCompositionMetaUrls(project.rootDir, adId);
      for (const w of warnings.slice(0, 12)) {
        send(`NOTE:${w}`);
      }
      await touchProjectsFingerprint();
    } catch (e: unknown) {
      send(`NOTE:URL refresh: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const proc = spawn("npx", ["remotion", "render", project.compositionId, outputPath], {
    cwd: project.rootDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let lastProgress = "";
  const handleOutput = (data: Buffer) => {
    const text = data.toString();
    const match = text.match(/Rendered (\d+)\/(\d+)/);
    if (match) {
      const pct = Math.round((parseInt(match[1], 10) / parseInt(match[2], 10)) * 100);
      const msg = `Rendering: ${pct}% (${match[1]}/${match[2]} frames)`;
      if (msg !== lastProgress) {
        lastProgress = msg;
        send(msg);
      }
    }
    const encMatch = text.match(/Encoded (\d+)\/(\d+)/);
    if (encMatch) send(`Encoding: ${encMatch[1]}/${encMatch[2]} frames`);
  };

  proc.stdout.on("data", handleOutput);
  proc.stderr.on("data", (d) => {
    appendStderr(d);
    handleOutput(d);
  });

  proc.on("close", async (code) => {
    if (code === 0) {
      const { exec } = await import("child_process");
      exec(`open "${outputPath}"`);
      send(`DONE:${outputPath}`);
    } else {
      const lines = stderrTail.trim().split("\n").filter(Boolean);
      const tail = lines.slice(-18).join("\n");
      const oneLine = tail.replace(/\s+/g, " ").slice(0, 2800);
      const detail = oneLine ? ` — ${oneLine}` : "";
      send(`ERROR:Render failed (exit code ${code})${detail}`);
    }
    res.end();
  });
});

async function bootstrap() {
  await fs.mkdir(EDITOR_WORKSPACES_DIR, { recursive: true });
  await ensureRegistry();
  await touchProjectsFingerprint();
}

bootstrap().then(() => {
  app.listen(3101, () => {
    console.log("Editor API running on http://localhost:3101");
  });
});
