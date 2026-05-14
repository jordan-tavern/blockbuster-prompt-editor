import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import {
  EDITOR_WORKSPACES_DIR,
  type ProjectRecord,
  readRegistry,
  writeRegistry,
} from "./server-projects.js";
import {
  blockbusterDownloadTsxUrl,
  blockbusterGetAd,
  blockbusterGetBatch,
  fetchBinary,
  hydrateBlockbusterCompositionDataLenient,
  mergeBlockbusterVoiceoverDownloadUrl,
} from "./server-integrations.js";

const COMPOSITION_ID = "BlockbusterAd";

function safeBasename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.endsWith(".tsx") || base.endsWith(".ts") ? base : `${base}.tsx`;
}

function sanitizeBatchTitle(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
}

/**
 * Human label: `{batch name} · {ad#}` using Blockbuster batch name + ad index (1-based for display).
 */
async function blockbusterImportProjectLabel(
  ad: { id: string; batch_id?: string; index?: number },
  apiKey?: string
): Promise<string> {
  const fallback = `Blockbuster ${ad.id.slice(0, 8)}…`;
  const idxRaw = ad.index;
  const idx = typeof idxRaw === "number" && Number.isFinite(idxRaw) ? Math.trunc(idxRaw) : null;
  const adNum = idx === null ? null : idx + 1;

  let batchTitle = "";
  const bid = typeof ad.batch_id === "string" ? ad.batch_id.trim() : "";
  if (bid) {
    try {
      const batch = await blockbusterGetBatch(bid, apiKey);
      const name = typeof batch.name === "string" ? batch.name.trim() : "";
      const pn =
        batch.project_name != null && typeof batch.project_name === "string" ? batch.project_name.trim() : "";
      batchTitle = name || pn;
    } catch {
      /* keep batchTitle empty */
    }
  }

  const safeBatch = sanitizeBatchTitle(batchTitle);
  if (safeBatch && adNum !== null) return `${safeBatch} · ${adNum}`;
  if (safeBatch) return safeBatch;
  if (adNum !== null) return `${fallback} (ad ${adNum})`;
  return fallback;
}

function inferDurationFrames(compositionData: unknown, fps: number): number {
  const d = compositionData as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== "object") return 900;
  const vo = (d as any).voiceover ?? (d as any).voiceOver;
  const sec = vo?.durationSec ?? vo?.duration_sec;
  if (typeof sec === "number" && sec > 0) return Math.max(1, Math.ceil(sec * fps));
  const out = (d as any).output_settings ?? (d as any).outputSettings;
  const dif = out?.duration_in_frames ?? out?.durationInFrames;
  if (typeof dif === "number" && dif > 0) return dif;
  return 900;
}

function buildRootTsx(importFile: string): string {
  const base = importFile.replace(/\.tsx?$/, "");
  return `import React from "react";
import { Composition } from "remotion";
import * as CompositionModule from "./${base}";
import compositionMeta from "./composition-meta.json";

const Comp =
  (CompositionModule as any).default ??
  (CompositionModule as any).RivetAd ??
  (CompositionModule as any).BlockbusterAd;
if (typeof Comp !== "function") {
  throw new Error("Blockbuster TSX must export a React component as default (or named RivetAd/BlockbusterAd).");
}

const meta = compositionMeta as {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  defaultProps: Record<string, unknown>;
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="${COMPOSITION_ID}"
        component={Comp}
        durationInFrames={meta.durationInFrames}
        fps={meta.fps}
        width={meta.width}
        height={meta.height}
        defaultProps={meta.defaultProps ?? {}}
      />
    </>
  );
};
`;
}

const INDEX_TS = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
`;

const REMOTION_CONFIG = `import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/index.ts");
`;

const PACKAGE_JSON = {
  name: "blockbuster-import",
  version: "1.0.0",
  type: "commonjs",
  scripts: {
    dev: "remotion studio",
    render: `remotion render ${COMPOSITION_ID} out/render.mp4`,
  },
  dependencies: {
    "@remotion/cli": "4.0.432",
    "@remotion/player": "4.0.432",
    "@remotion/renderer": "4.0.432",
    "@remotion/transitions": "4.0.432",
    "@types/react": "19.2.14",
    react: "19.2.4",
    "react-dom": "19.2.4",
    remotion: "4.0.432",
    typescript: "5.9.3",
  },
};

const TSCONFIG = {
  compilerOptions: {
    target: "ES2018",
    module: "commonjs",
    jsx: "react-jsx",
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    outDir: "./dist",
    rootDir: ".",
    moduleResolution: "node",
    resolveJsonModule: true,
    declaration: true,
    sourceMap: true,
    lib: ["ES2018", "DOM"],
  },
  include: ["src/**/*", "remotion.config.ts"],
  exclude: ["node_modules", "dist"],
};

export async function importBlockbusterAd(
  adId: string,
  apiKey?: string
): Promise<{
  project: ProjectRecord;
  ad: Awaited<ReturnType<typeof blockbusterGetAd>>;
  hydrationWarnings: string[];
}> {
  const ad = await blockbusterGetAd(adId, apiKey);
  if (!ad.composition_tsx_path || !String(ad.composition_tsx_path).includes("remotion-tsx/")) {
    throw new Error("Ad has no Blockbuster TSX under remotion-tsx/ (composition_tsx_path missing or invalid).");
  }

  const { url, filename } = await blockbusterDownloadTsxUrl(adId, apiKey);
  const tsxBuf = await fetchBinary(url);
  const tsxName = safeBasename(filename);

  const fps = 30;
  const width = 1920;
  const height = 1080;
  const durationInFrames = inferDurationFrames(ad.composition_data ?? null, fps);

  const projectId = `bb-${adId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const rootDir = path.join(EDITOR_WORKSPACES_DIR, projectId);
  await fs.rm(rootDir, { recursive: true }).catch(() => {});
  await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "public", "assets"), { recursive: true });

  await fs.writeFile(path.join(rootDir, "src", tsxName), tsxBuf, "utf-8");

  const { data: hydratedProps, warnings: hydrationWarnings } = await hydrateBlockbusterCompositionDataLenient(
    (ad.composition_data ?? {}) as Record<string, unknown>
  );
  const voDlWarnings = await mergeBlockbusterVoiceoverDownloadUrl(hydratedProps, adId, apiKey);

  const compositionJson = {
    fps,
    width,
    height,
    durationInFrames,
    defaultProps: hydratedProps,
  };
  await fs.writeFile(path.join(rootDir, "src", "composition-meta.json"), JSON.stringify(compositionJson, null, 2), "utf-8");

  await fs.writeFile(path.join(rootDir, "package.json"), JSON.stringify(PACKAGE_JSON, null, 2), "utf-8");
  await fs.writeFile(path.join(rootDir, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2), "utf-8");
  await fs.writeFile(path.join(rootDir, "remotion.config.ts"), REMOTION_CONFIG, "utf-8");
  await fs.writeFile(path.join(rootDir, "src", "index.ts"), INDEX_TS, "utf-8");
  await fs.writeFile(path.join(rootDir, "src", "Root.tsx"), buildRootTsx(tsxName), "utf-8");

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("npm", ["install", "--no-fund", "--no-audit"], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let log = "";
    const append = (chunk: Buffer) => {
      log += chunk.toString();
      if (log.length > 32_000) log = log.slice(-32_000);
    };
    proc.stdout?.on("data", append);
    proc.stderr?.on("data", append);
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const tail = log.trim().slice(-4000);
        reject(
          new Error(
            `npm install failed (exit ${code ?? "unknown"}) in ${rootDir}.${tail ? `\n---\n${tail}` : ""}`
          )
        );
      }
    });
  });

  const label = await blockbusterImportProjectLabel(ad, apiKey);

  const project: ProjectRecord = {
    id: projectId,
    label,
    rootDir,
    compositionId: COMPOSITION_ID,
    compositionModule: tsxName,
    fps,
    width,
    height,
    durationInFrames,
    editableGlobs: ["**/*.ts", "**/*.tsx"],
  };

  const reg = await readRegistry();
  reg.projects[projectId] = project;
  reg.activeId = projectId;
  await writeRegistry(reg);

  return { project, ad, hydrationWarnings: [...hydrationWarnings, ...voDlWarnings] };
}
