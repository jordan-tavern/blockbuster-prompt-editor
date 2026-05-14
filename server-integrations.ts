/**
 * Blockbuster v2 + Tavern Asset Server (server-side only; keys from env).
 */

import fs from "fs/promises";
import path from "node:path";

const DEFAULT_BLOCKBUSTER = "https://blockbuster-v2-1075585577705.us-central1.run.app";
const DEFAULT_ASSET_SERVER = "https://asset-server-1075585577705.us-central1.run.app";

function blockbusterBase(): string {
  return (process.env.BLOCKBUSTER_BASE_URL || DEFAULT_BLOCKBUSTER).replace(/\/+$/, "");
}

function blockbusterKey(): string | undefined {
  return process.env.BLOCKBUSTER_API_KEY?.trim() || undefined;
}

function assetServerBase(): string {
  return (process.env.ASSET_SERVER_BASE_URL || DEFAULT_ASSET_SERVER).replace(/\/+$/, "");
}

function assetServerKey(): string | undefined {
  return process.env.ASSET_SERVER_API_KEY?.trim() || undefined;
}

function bbHeaders(apiKey?: string): Record<string, string> {
  const key = apiKey || blockbusterKey();
  if (!key) throw new Error("BLOCKBUSTER_API_KEY is not set");
  return {
    "X-API-Key": key,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function asHeaders(): Record<string, string> {
  const key = assetServerKey();
  if (!key) throw new Error("ASSET_SERVER_API_KEY is not set");
  return {
    "X-API-Key": key,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function readErr(res: Response): Promise<string> {
  const t = await res.text().catch(() => "");
  try {
    const j = JSON.parse(t);
    if (j?.detail) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    return JSON.stringify(j);
  } catch {
    return t || `${res.status} ${res.statusText}`;
  }
}

export interface AdDetail {
  id: string;
  batch_id?: string;
  /** Row index within the batch (API is typically 0-based; callers may show `index + 1` as “ad #”). */
  index?: number;
  composition_tsx_path?: string | null;
  composition_data?: Record<string, unknown> | null;
  status?: string;
  script?: string;
}

export async function blockbusterGetAd(adId: string, apiKey?: string): Promise<AdDetail> {
  const res = await fetch(`${blockbusterBase()}/api/ads/${encodeURIComponent(adId)}`, {
    headers: bbHeaders(apiKey),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as AdDetail;
}

/** GET /api/batches/:id — batch `name` for human-readable project labels (OpenAPI `BatchResponse`). */
export async function blockbusterGetBatch(
  batchId: string,
  apiKey?: string
): Promise<{ id: string; name: string; project_name?: string | null }> {
  const res = await fetch(`${blockbusterBase()}/api/batches/${encodeURIComponent(batchId)}`, {
    headers: bbHeaders(apiKey),
  });
  if (!res.ok) throw new Error(await readErr(res));
  const j = (await res.json()) as Record<string, unknown>;
  return {
    id: typeof j.id === "string" ? j.id : batchId,
    name: typeof j.name === "string" ? j.name : "",
    project_name:
      j.project_name === null || j.project_name === undefined
        ? j.project_name
        : typeof j.project_name === "string"
          ? j.project_name
          : null,
  };
}

export async function blockbusterDownloadTsxUrl(adId: string, apiKey?: string): Promise<{ url: string; filename: string }> {
  const res = await fetch(`${blockbusterBase()}/api/ads/${encodeURIComponent(adId)}/tsx/download`, {
    headers: bbHeaders(apiKey),
  });
  if (!res.ok) throw new Error(await readErr(res));
  const j = (await res.json()) as { url?: string; filename?: string };
  if (!j.url || !j.filename) throw new Error("Invalid tsx/download response");
  return { url: j.url, filename: j.filename };
}

/** GET /api/ads/:id/voiceover/download — Blockbuster-signed URL for the VO artifact (OpenAPI). */
export async function blockbusterVoiceoverDownload(
  adId: string,
  apiKey?: string
): Promise<{ url: string; filename: string }> {
  const res = await fetch(`${blockbusterBase()}/api/ads/${encodeURIComponent(adId)}/voiceover/download`, {
    headers: bbHeaders(apiKey),
  });
  if (!res.ok) throw new Error(await readErr(res));
  const j = (await res.json()) as { url?: string; filename?: string };
  if (!j.url || !j.filename) throw new Error("Invalid voiceover/download response");
  return { url: j.url, filename: j.filename };
}

/** `bb-<uuid>` workspace id → ad UUID (same normalization as import). */
export function blockbusterAdIdFromBbProjectId(projectId: string): string | null {
  if (!projectId.startsWith("bb-")) return null;
  const rest = projectId.slice(3).trim();
  return rest.length > 0 ? rest : null;
}

/**
 * After hydrating composition_data, overlay the voiceover URL from Blockbuster's
 * `/voiceover/download` so playback/render do not depend on expiring GCS links or asset-server TTS signing.
 */
export async function mergeBlockbusterVoiceoverDownloadUrl(
  defaultProps: Record<string, unknown>,
  adId: string,
  apiKey?: string
): Promise<string[]> {
  const warnings: string[] = [];
  let dl: { url: string; filename: string };
  try {
    dl = await blockbusterVoiceoverDownload(adId, apiKey);
  } catch (e: unknown) {
    warnings.push(`voiceover/download: ${e instanceof Error ? e.message : String(e)}`);
    return warnings;
  }
  const u = dl.url.trim();
  if (!u) {
    warnings.push("voiceover/download: empty url");
    return warnings;
  }

  let patched = false;
  for (const key of ["voiceover", "voiceOver"] as const) {
    const vo = defaultProps[key];
    if (vo && typeof vo === "object") {
      defaultProps[key] = { ...(vo as Record<string, unknown>), url: u };
      patched = true;
    }
  }
  if (!patched) {
    defaultProps.voiceover = { url: u };
  }
  return warnings;
}

export async function fetchBinary(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Indexed video signed URL (path from OpenAPI). */
export async function assetServerIndexedVideoSignedUrl(videoId: string, expiration?: number): Promise<string> {
  const q = expiration != null ? `?expiration=${encodeURIComponent(String(expiration))}` : "";
  const res = await fetch(`${assetServerBase()}/index/${encodeURIComponent(videoId)}/signed-url${q}`, {
    headers: asHeaders(),
  });
  if (!res.ok) throw new Error(await readErr(res));
  const j = (await res.json()) as { signed_url?: string };
  if (!j.signed_url) throw new Error("No signed_url in response");
  return j.signed_url;
}

export async function assetServerUnindexedSignedUrl(assetId: string, expiration?: number): Promise<string> {
  const q = expiration != null ? `?expiration=${encodeURIComponent(String(expiration))}` : "";
  const res = await fetch(
    `${assetServerBase()}/unindexed/${encodeURIComponent(assetId)}/signed-url${q}`,
    { headers: asHeaders() }
  );
  if (!res.ok) throw new Error(await readErr(res));
  const j = (await res.json()) as { signed_url?: string };
  if (!j.signed_url) throw new Error("No signed_url in response");
  return j.signed_url;
}

export async function assetServerOverlaySignedUrl(objectId: string, expiration?: number): Promise<string> {
  const q = expiration != null ? `?expiration=${encodeURIComponent(String(expiration))}` : "";
  const res = await fetch(
    `${assetServerBase()}/overlays/${encodeURIComponent(objectId)}/signed-url${q}`,
    { headers: asHeaders() }
  );
  if (!res.ok) throw new Error(await readErr(res));
  const j = (await res.json()) as { signed_url?: string };
  if (!j.signed_url) throw new Error("No signed_url in response");
  return j.signed_url;
}

export async function assetServerBackingTrackSignedUrl(objectId: string, expiration?: number): Promise<string> {
  const q = expiration != null ? `?expiration=${encodeURIComponent(String(expiration))}` : "";
  const res = await fetch(
    `${assetServerBase()}/backing-tracks/${encodeURIComponent(objectId)}/signed-url${q}`,
    { headers: asHeaders() }
  );
  if (!res.ok) throw new Error(await readErr(res));
  const j = (await res.json()) as { signed_url?: string };
  if (!j.signed_url) throw new Error("No signed_url in response");
  return j.signed_url;
}

export async function assetServerSearchText(
  query: string,
  k = 10,
  options?: { filterLabels?: string[] }
): Promise<unknown> {
  const body: Record<string, unknown> = { query, k };
  if (options?.filterLabels?.length) {
    body.labels = options.filterLabels;
  }
  const res = await fetch(`${assetServerBase()}/index/search/text`, {
    method: "POST",
    headers: asHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return res.json();
}

/** GET /index/labels — catalog labels with video counts. */
export async function assetServerListLabels(): Promise<unknown> {
  const res = await fetch(`${assetServerBase()}/index/labels`, {
    headers: asHeaders(),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return res.json();
}

/** POST /index/search/labels — videos matching taxonomy labels. */
export async function assetServerSearchLabels(labels: string[], matchAll = false): Promise<unknown> {
  const res = await fetch(`${assetServerBase()}/index/search/labels`, {
    method: "POST",
    headers: asHeaders(),
    body: JSON.stringify({ labels, match_all: matchAll }),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return res.json();
}

function stripCommonMediaExt(id: string): string {
  return id.replace(/\.(mp4|mov|webm|mkv|wav|mp3|m4a|aac|jpg|jpeg|png|webp)$/i, "");
}

function formatUuidFrom32Hex(hex: string): string {
  const h = hex.toLowerCase();
  if (h.length !== 32 || !/^[0-9a-f]{32}$/.test(h)) return h;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * TTS outputs often ship with `gcsPath` like `tts/<32hex>.mp3` and a separate `url` signed on
 * `video-pipeline-results-store` that expires quickly. Infer a stable id so we can re-sign via
 * the asset server on import.
 */
function ttsObjectIdFromVoiceover(v: Record<string, unknown>): string | null {
  const gcsPath = typeof v.gcsPath === "string" ? v.gcsPath.trim() : "";
  if (gcsPath) {
    const m = /^tts\/([0-9a-f]{32})\.(mp3|wav|m4a|aac)$/i.exec(gcsPath);
    if (m) return formatUuidFrom32Hex(m[1]);
  }
  const url = typeof v.url === "string" ? v.url : "";
  const m2 = /\/tts\/([0-9a-f]{32})\.(?:mp3|wav|m4a|aac)(?:\?|$)/i.exec(url);
  if (m2) return formatUuidFrom32Hex(m2[1]);
  return null;
}

async function hydrateVoiceoverObject(
  v: Record<string, unknown>,
  opts: { lenient: boolean; voKey: string; warnings: string[] }
): Promise<void> {
  const ttsId = ttsObjectIdFromVoiceover(v);
  if (ttsId) {
    const prevUrl = typeof v.url === "string" ? v.url : "";
    const wasResults = prevUrl.includes("video-pipeline-results-store");
    if (wasResults) {
      delete v.url;
    }
    let resolved = false;
    try {
      v.url = await signedUrlClipFlexible(ttsId);
      resolved = true;
    } catch (e1: unknown) {
      const raw32 = ttsId.replace(/-/g, "");
      if (raw32.length === 32) {
        try {
          v.url = await signedUrlClipFlexible(raw32);
          resolved = true;
        } catch (e2: unknown) {
          opts.warnings.push(
            `voiceover (${opts.voKey}) TTS ${ttsId}: ${e2 instanceof Error ? e2.message : String(e2)}`
          );
        }
      } else {
        opts.warnings.push(
          `voiceover (${opts.voKey}) TTS ${ttsId}: ${e1 instanceof Error ? e1.message : String(e1)}`
        );
      }
    }
    if (!resolved && wasResults && prevUrl) {
      v.url = prevUrl;
      opts.warnings.push(
        `voiceover (${opts.voKey}): reverted to Blockbuster TTS URL (asset server could not sign ${ttsId}); if playback/render fails, the GCS signature has likely expired — re-import after Blockbuster refreshes URLs`
      );
    }
    return;
  }

  const urlOk = typeof v.url === "string" && v.url.length > 0;
  const assetId = typeof v.assetId === "string" && v.assetId.trim() ? String(v.assetId).trim() : "";
  if (!urlOk && assetId) {
    try {
      v.url = await signedUrlUnindexedFlexible(assetId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (opts.lenient) {
        opts.warnings.push(`voiceover (${opts.voKey}) ${assetId}: ${msg}`);
      } else {
        throw new Error(`voiceover (${opts.voKey}) ${assetId}: ${msg}`);
      }
    }
  }
}

async function signedUrlUnindexedFlexible(assetId: string): Promise<string> {
  const id = assetId.trim();
  if (!id) throw new Error("empty assetId");
  try {
    return await assetServerUnindexedSignedUrl(id);
  } catch (e1) {
    const bare = stripCommonMediaExt(id);
    if (bare !== id) return await assetServerUnindexedSignedUrl(bare);
    throw e1;
  }
}

/** B-roll clips may be unindexed blobs or indexed pipeline videos — try both. */
async function signedUrlClipFlexible(assetId: string): Promise<string> {
  const id = assetId.trim();
  if (!id) throw new Error("empty assetId");
  try {
    return await signedUrlUnindexedFlexible(id);
  } catch (e1) {
    const bare = stripCommonMediaExt(id);
    try {
      return await assetServerIndexedVideoSignedUrl(bare);
    } catch {
      try {
        if (bare !== id) return await assetServerIndexedVideoSignedUrl(id);
      } catch {
        /* fall through */
      }
      throw e1;
    }
  }
}

async function signedUrlBackingFlexible(assetId: string): Promise<string> {
  const id = assetId.trim();
  if (!id) throw new Error("empty backing assetId");
  const bare = stripCommonMediaExt(id);
  try {
    return await assetServerBackingTrackSignedUrl(bare);
  } catch {
    try {
      return await assetServerBackingTrackSignedUrl(id);
    } catch {
      return await signedUrlUnindexedFlexible(id);
    }
  }
}

/**
 * Blockbuster `composition_data` often stores `assetId` on clips / backing / voiceover /
 * project assets without `url`. Remotion compositions expect `url` for `<OffthreadVideo>` / `<Audio>`.
 * Resolves signed URLs via the Tavern asset server (requires ASSET_SERVER_API_KEY).
 * Voiceover may include a stale `url` on `video-pipeline-results-store` plus `gcsPath` (`tts/…`);
 * those are refreshed from the asset server using the TTS object id.
 */
export async function hydrateBlockbusterCompositionData(
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...data };

  const clips = out.clips;
  if (Array.isArray(clips)) {
    out.clips = await Promise.all(
      clips.map(async (item) => {
        if (!item || typeof item !== "object") return item;
        const c = { ...(item as Record<string, unknown>) };
        const urlOk = typeof c.url === "string" && c.url.length > 0;
        if (!urlOk && typeof c.assetId === "string" && c.assetId.trim()) {
          c.url = await signedUrlClipFlexible(c.assetId);
        }
        return c;
      })
    );
  }

  const bt = out.backingTrack;
  if (bt && typeof bt === "object") {
    const b = { ...(bt as Record<string, unknown>) };
    const urlOk = typeof b.url === "string" && b.url.length > 0;
    if (!urlOk && typeof b.assetId === "string" && b.assetId.trim()) {
      b.url = await signedUrlBackingFlexible(String(b.assetId));
    }
    out.backingTrack = b;
  }

  const voWarnings: string[] = [];
  for (const voKey of ["voiceover", "voiceOver"] as const) {
    const vo = out[voKey];
    if (!vo || typeof vo !== "object") continue;
    const v = { ...(vo as Record<string, unknown>) };
    await hydrateVoiceoverObject(v, { lenient: false, voKey, warnings: voWarnings });
    out[voKey] = v;
  }

  const pa = out.projectAssets;
  if (Array.isArray(pa)) {
    out.projectAssets = await Promise.all(
      pa.map(async (item) => {
        if (!item || typeof item !== "object") return item;
        const o = { ...(item as Record<string, unknown>) };
        const urlOk = typeof o.url === "string" && o.url.length > 0;
        if (!urlOk && typeof o.assetId === "string" && o.assetId.trim()) {
          o.url = await signedUrlUnindexedFlexible(String(o.assetId));
        }
        return o;
      })
    );
  }

  return out;
}

/**
 * Same as {@link hydrateBlockbusterCompositionData} but never throws: failed assets stay
 * without `url` and messages are collected (for Blockbuster import when some IDs are missing
 * from the asset server or live under a different bucket).
 */
export async function hydrateBlockbusterCompositionDataLenient(
  data: Record<string, unknown>
): Promise<{ data: Record<string, unknown>; warnings: string[] }> {
  const warnings: string[] = [];
  const out: Record<string, unknown> = { ...data };

  const clips = out.clips;
  if (Array.isArray(clips)) {
    const next: unknown[] = [];
    for (const item of clips) {
      if (!item || typeof item !== "object") {
        next.push(item);
        continue;
      }
      const c = { ...(item as Record<string, unknown>) };
      const urlOk = typeof c.url === "string" && c.url.length > 0;
      if (!urlOk && typeof c.assetId === "string" && c.assetId.trim()) {
        try {
          c.url = await signedUrlClipFlexible(String(c.assetId));
        } catch (e: unknown) {
          warnings.push(`clip ${String(c.assetId)}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      next.push(c);
    }
    out.clips = next;
  }

  const bt = out.backingTrack;
  if (bt && typeof bt === "object") {
    const b = { ...(bt as Record<string, unknown>) };
    const urlOk = typeof b.url === "string" && b.url.length > 0;
    if (!urlOk && typeof b.assetId === "string" && b.assetId.trim()) {
      try {
        b.url = await signedUrlBackingFlexible(String(b.assetId));
      } catch (e: unknown) {
        warnings.push(`backingTrack ${String(b.assetId)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    out.backingTrack = b;
  }

  for (const voKey of ["voiceover", "voiceOver"] as const) {
    const vo = out[voKey];
    if (!vo || typeof vo !== "object") continue;
    const v = { ...(vo as Record<string, unknown>) };
    await hydrateVoiceoverObject(v, { lenient: true, voKey, warnings });
    out[voKey] = v;
  }

  const pa = out.projectAssets;
  if (Array.isArray(pa)) {
    const next: unknown[] = [];
    for (const item of pa) {
      if (!item || typeof item !== "object") {
        next.push(item);
        continue;
      }
      const o = { ...(item as Record<string, unknown>) };
      const urlOk = typeof o.url === "string" && o.url.length > 0;
      if (!urlOk && typeof o.assetId === "string" && o.assetId.trim()) {
        try {
          o.url = await signedUrlUnindexedFlexible(String(o.assetId));
        } catch (e: unknown) {
          warnings.push(`projectAssets ${String(o.assetId)}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      next.push(o);
    }
    out.projectAssets = next;
  }

  return { data: out, warnings };
}

/**
 * Overlay freshly signed `url` fields from a Blockbuster `GET /api/ads/:id` `composition_data`
 * onto the editor's `composition-meta.json` defaultProps (voiceover / backing / clips by assetId).
 * Remotion renders fail when GCS URLs in the DB have expired (e.g. results-store TTS links).
 */
export function mergeFreshBlockbusterMediaUrls(
  defaultProps: Record<string, unknown>,
  freshCompositionData: Record<string, unknown> | null | undefined
): void {
  if (!freshCompositionData || typeof freshCompositionData !== "object") return;

  for (const key of ["voiceover", "voiceOver", "backingTrack"] as const) {
    const next = freshCompositionData[key];
    if (!next || typeof next !== "object") continue;
    const nu = (next as Record<string, unknown>).url;
    if (typeof nu !== "string" || !nu.trim()) continue;
    const cur = defaultProps[key];
    if (cur && typeof cur === "object") {
      defaultProps[key] = { ...(cur as Record<string, unknown>), url: nu.trim() };
    } else {
      defaultProps[key] = next;
    }
  }

  const fc = freshCompositionData.clips;
  const cc = defaultProps.clips;
  if (!Array.isArray(fc) || !Array.isArray(cc)) return;

  for (let i = 0; i < cc.length; i++) {
    const cclip = cc[i];
    if (!cclip || typeof cclip !== "object") continue;
    const aid = typeof (cclip as Record<string, unknown>).assetId === "string"
      ? String((cclip as Record<string, unknown>).assetId)
      : "";
    if (!aid) continue;
    const match = fc.find(
      (x) => x && typeof x === "object" && String((x as Record<string, unknown>).assetId) === aid
    ) as Record<string, unknown> | undefined;
    if (!match) continue;
    const fu = match.url;
    if (typeof fu === "string" && fu.trim()) {
      cc[i] = { ...(cclip as Record<string, unknown>), url: fu.trim() };
    }
  }
}

/** Re-fetch ad JSON + asset-server URLs and rewrite `src/composition-meta.json`. */
export async function refreshBlockbusterCompositionMetaUrls(
  projectRootDir: string,
  adId: string,
  apiKey?: string
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  const metaPath = path.join(projectRootDir, "src", "composition-meta.json");
  let raw: string;
  try {
    raw = await fs.readFile(metaPath, "utf-8");
  } catch {
    return { warnings: ["refresh: missing src/composition-meta.json"] };
  }

  const meta = JSON.parse(raw) as {
    defaultProps?: Record<string, unknown>;
    fps?: number;
    width?: number;
    height?: number;
    durationInFrames?: number;
  };
  const base = meta.defaultProps;
  const dp: Record<string, unknown> =
    base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};

  try {
    const ad = await blockbusterGetAd(adId, apiKey);
    mergeFreshBlockbusterMediaUrls(dp, ad.composition_data as Record<string, unknown> | null | undefined);
  } catch (e: unknown) {
    warnings.push(`refresh: Blockbuster GET ad — ${e instanceof Error ? e.message : String(e)}`);
  }

  const { data, warnings: hw } = await hydrateBlockbusterCompositionDataLenient(dp);
  warnings.push(...hw);
  const voDl = await mergeBlockbusterVoiceoverDownloadUrl(data, adId, apiKey);
  warnings.push(...voDl);

  const vo = (data.voiceover ?? data.voiceOver) as Record<string, unknown> | undefined;
  if (vo && typeof vo === "object") {
    const u = typeof vo.url === "string" ? vo.url : "";
    if (u.length < 12 && typeof vo.gcsPath === "string" && vo.gcsPath.trim()) {
      warnings.push(
        "refresh: voiceover has no playable URL after refresh (GET /api/ads/:id/voiceover/download failed or returned empty; check Blockbuster API or ASSET_SERVER for TTS assets)"
      );
    }
  }
  meta.defaultProps = data;
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  return { warnings };
}
