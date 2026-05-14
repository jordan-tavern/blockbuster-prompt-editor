import type { TimelineBlock, TimelineTrack } from "./components/Timeline.tsx";

const CLIP_PALETTE = ["#3a6b8a", "#4a7a6a", "#5a6a8a", "#4a8a7a", "#3a7a9a", "#5a8a6a"];

function clipWeights(clips: Record<string, unknown>[]): number[] {
  return clips.map((c) => {
    const a = Number(c.startSec) || 0;
    const b = Number(c.endSec) ?? a + 1;
    return Math.max(0.001, b - a);
  });
}

/** Lay out Blockbuster `composition-meta` clips / audio / captions on the timeline for selection. */
export function buildBlockbusterSimpleTimeline(
  defaultProps: Record<string, unknown> | undefined,
  fps: number,
  totalFrames: number
): TimelineTrack[] {
  if (!defaultProps || totalFrames < 1) return [];

  const tracks: TimelineTrack[] = [];
  const clips = Array.isArray(defaultProps.clips) ? (defaultProps.clips as Record<string, unknown>[]) : [];

  if (clips.length > 0) {
    const weights = clipWeights(clips);
    const sum = weights.reduce((a, b) => a + b, 0);
    let startF = 0;
    const blocks: TimelineBlock[] = [];
    for (let i = 0; i < clips.length; i++) {
      const isLast = i === clips.length - 1;
      const len = isLast ? totalFrames - startF : Math.max(1, Math.round((weights[i] / sum) * totalFrames));
      const endF = isLast ? totalFrames : Math.min(totalFrames, startF + len);
      const aid = typeof clips[i].assetId === "string" ? String(clips[i].assetId).slice(0, 8) : "?";
      blocks.push({
        label: `Clip ${i + 1} (${aid}…)`,
        startFrame: startF,
        endFrame: Math.max(startF + 1, endF),
        color: CLIP_PALETTE[i % CLIP_PALETTE.length],
        selectionType: "clip",
        sourceIndex: i,
      });
      startF = endF;
    }
    tracks.push({ name: "Clips", layerId: "simple-clips", isAudio: false, blocks });
  }

  const vo = defaultProps.voiceover ?? defaultProps.voiceOver;
  if (vo && typeof vo === "object") {
    const o = vo as Record<string, unknown>;
    const hasUrl = typeof o.url === "string" && o.url.length > 0;
    const hasAssetId = typeof o.assetId === "string" && String(o.assetId).trim().length > 0;
    const hasGcsPath = typeof o.gcsPath === "string" && String(o.gcsPath).trim().length > 0;
    const hasAnySource = hasUrl || hasAssetId || hasGcsPath;

    const durSec = Number(o.durationSec) || 0;
    const endF =
      durSec > 0 ? Math.min(totalFrames, Math.max(1, Math.round(durSec * fps))) : totalFrames;

    let label = "Voiceover";
    let color = "#5a8a5a";
    if (!hasAnySource) {
      label = "Voiceover (no source in meta)";
      color = "#7a4545";
    } else if (!hasUrl) {
      label =
        durSec > 0
          ? `Voiceover · ${durSec.toFixed(1)}s (no URL — re-import or hydrate)`
          : "Voiceover (no URL — re-import or hydrate)";
      color = "#7a6a3a";
    } else {
      const u = String(o.url);
      const isResultsStore = u.includes("video-pipeline-results-store");
      if (durSec > 0) {
        label = isResultsStore
          ? `Voiceover · ${durSec.toFixed(1)}s · audio in GCS (signed URL expires ~24h)`
          : `Voiceover · ${durSec.toFixed(1)}s`;
      } else {
        label = isResultsStore
          ? "Voiceover · audio in GCS (signed URL expires ~24h)"
          : "Voiceover";
      }
      if (isResultsStore) color = "#6a8a6a";
    }

    tracks.push({
      name: "Voiceover",
      layerId: "simple-voiceover",
      isAudio: true,
      blocks: [
        {
          label,
          startFrame: 0,
          endFrame: Math.max(1, endF),
          color,
          selectionType: "voiceover",
          sourceIndex: 0,
        },
      ],
    });
  }

  const bt = defaultProps.backingTrack;
  if (bt && typeof bt === "object") {
    const b = bt as Record<string, unknown>;
    if ((typeof b.url === "string" && b.url.length > 0) || b.assetId) {
      tracks.push({
        name: "Music",
        layerId: "simple-music",
        isAudio: true,
        blocks: [
          {
            label: typeof b.assetId === "string" ? `Backing (${String(b.assetId).slice(0, 8)}…)` : "Backing track",
            startFrame: 0,
            endFrame: totalFrames,
            color: "#6a5a8a",
            selectionType: "backing",
            sourceIndex: 0,
          },
        ],
      });
    }
  }

  const caps = Array.isArray(defaultProps.captions) ? (defaultProps.captions as { end?: number }[]) : [];
  if (caps.length > 0) {
    const lastEndSec = caps.reduce((m, w) => Math.max(m, Number(w.end) || 0), 0);
    const endF = Math.min(totalFrames, Math.max(1, Math.round(lastEndSec * fps)));
    tracks.push({
      name: "Captions",
      layerId: "simple-captions",
      isAudio: false,
      blocks: [
        {
          label: "Captions (word timings)",
          startFrame: 0,
          endFrame: endF,
          color: "#8a6a3a",
          selectionType: "captions",
          sourceIndex: 0,
        },
      ],
    });
  }

  return tracks;
}
