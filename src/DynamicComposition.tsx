import React, { useEffect, useState } from "react";
import { AbsoluteFill } from "remotion";
import { PROJECTS_FINGERPRINT } from "./__projects-fingerprint";

// Include legacy `editor-workspace/` (no "s") in case older registries point there.
// Use `**` so nested workspace layouts still match; Vite picks up new files after fingerprint HMR.
const jobModules = import.meta.glob("../remotion-jobs/src/**/*.tsx");
const wsModules = import.meta.glob([
  "../editor-workspaces/**/src/**/*.tsx",
  "../.editor-workspaces/**/src/**/*.tsx",
  "../editor-workspace/**/src/**/*.tsx",
]);
const allModules = { ...jobModules, ...wsModules };

export interface ProjectClientMeta {
  id: string;
  compositionModule: string;
  /** Relative path from this app's `src/` to project src (posix), e.g. ../remotion-jobs/src */
  srcRootRel: string;
}

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function moduleKey(meta: ProjectClientMeta): string | null {
  const keys = Object.keys(allModules).map((k) => ({ raw: k, n: norm(k) }));
  const rel = norm(`${meta.srcRootRel.replace(/\/+$/, "")}/${meta.compositionModule}`);
  const exact = keys.find((k) => k.n.endsWith(rel));
  if (exact) return exact.raw;

  // Registry path can drift (e.g. legacy `editor-workspace` vs `.editor-workspaces`); match by filename + project id.
  const suffix = `/${meta.compositionModule}`;
  const id = meta.id;
  const byId = keys.find((k) => k.n.endsWith(suffix) && (id ? k.n.includes(id) : true));
  if (byId) return byId.raw;

  const bySuffix = keys.find((k) => k.n.endsWith(suffix));
  return bySuffix?.raw ?? null;
}

export async function loadCompositionComponent(
  meta: ProjectClientMeta
): Promise<React.FC<any> | null> {
  const key = moduleKey(meta);
  if (!key) return null;
  const mod: any = await allModules[key]();
  const C = (mod.default ?? mod.RivetAd ?? mod.BlockbusterAd) as React.FC<any> | undefined;
  return C ?? null;
}

interface DynamicCompositionProps {
  project: ProjectClientMeta | null;
  reloadKey: number;
}

export const DynamicComposition: React.FC<DynamicCompositionProps & Record<string, unknown>> = ({
  project,
  reloadKey,
  ...playerProps
}) => {
  const [Comp, setComp] = useState<React.FC<any> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!project) {
      setComp(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setErr(null);
    loadCompositionComponent(project)
      .then((c) => {
        if (cancelled) return;
        if (!c) {
          const keys = Object.keys(allModules).filter(
            (k) =>
              k.includes("editor-workspace") ||
              k.includes(".editor-workspaces") ||
              k.includes("editor-workspaces") ||
              k.includes("remotion-jobs")
          );
          setErr(
            `No composition module for ${project.compositionModule} under ${project.srcRootRel}.\n` +
              `Known glob keys (${keys.length}): ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? "…" : ""}\n` +
              `Try: refresh the page after import, or restart \`npm run dev\` so Vite rescans workspaces.`
          );
        }
        setComp(() => c);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.compositionModule, project?.srcRootRel, reloadKey, PROJECTS_FINGERPRINT]);

  if (err) {
    return (
      <AbsoluteFill style={{ background: "#200", color: "#faa", padding: 24, fontFamily: "monospace", fontSize: 13 }}>
        {err}
      </AbsoluteFill>
    );
  }
  if (!Comp) {
    return (
      <AbsoluteFill style={{ background: "#111", color: "#888", justifyContent: "center", alignItems: "center" }}>
        Loading composition…
      </AbsoluteFill>
    );
  }
  return <Comp {...playerProps} />;
};
