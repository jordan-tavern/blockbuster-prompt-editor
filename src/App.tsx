import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { DynamicComposition } from "./DynamicComposition.tsx";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { Timeline, TimelineSelection } from "./components/Timeline.tsx";
import { VersionPanel } from "./components/VersionPanel.tsx";
import { CodeEditor } from "./components/CodeEditor.tsx";
import { FileUpload } from "./components/FileUpload.tsx";
import { ProjectBar } from "./components/ProjectBar.tsx";
import { ReplaceClipModal } from "./components/ReplaceClipModal.tsx";
import { ReplaceVoiceoverModal } from "./components/ReplaceVoiceoverModal.tsx";
import { buildBlockbusterSimpleTimeline } from "./blockbusterSimpleTimeline.ts";
import { SCENES } from "@video/data/scenes.ts";
import { TEXT_OVERLAYS } from "@video/data/overlays.ts";
import { LAYERS } from "@video/data/layers.ts";

type RightTab = "chat" | "code";

type ProjectClientMeta = {
  id: string;
  label: string;
  compositionId: string;
  compositionModule: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  srcRootRel: string;
  timelineMode?: "rivet" | "simple";
  /** From `src/composition-meta.json` — Blockbuster ads pass clips/captions/voiceover props here. */
  compositionDefaultProps?: Record<string, unknown>;
};

export const App: React.FC = () => {
  const playerRef = useRef<PlayerRef>(null);
  const [project, setProject] = useState<ProjectClientMeta | null>(null);
  const [compositionReloadKey, setCompositionReloadKey] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [syncFeedback, setSyncFeedback] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState("");
  const [undoCount, setUndoCount] = useState(0);
  const [undoFeedback, setUndoFeedback] = useState("");
  const [selection, setSelection] = useState<TimelineSelection>([]);
  const [replaceClipModal, setReplaceClipModal] = useState<{ clipIndex: number; label: string } | null>(null);
  const [replaceVoiceoverOpen, setReplaceVoiceoverOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("chat");

  // Feature 2: Solo/mute state
  const [mutedLayers, setMutedLayers] = useState<Set<string>>(new Set());
  const [soloLayer, setSoloLayer] = useState<string | null>(null);

  // Feature 4: Last uploaded file (sent as context to Claude)
  const [lastUpload, setLastUpload] = useState<{ path: string; filename: string; type: string } | null>(null);

  // Preview proxy
  const [previewQuality, setPreviewQuality] = useState("50");
  const [previewMode, setPreviewMode] = useState(false); // true = play proxy, false = live composition
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState("");

  // Compute effective muted set for the Player — memoize the full inputProps
  // object to prevent re-renders from creating new object references
  const effectiveMuted = useMemo(() => {
    if (project?.timelineMode !== "rivet") return [];
    if (soloLayer) {
      return LAYERS.filter((l) => l.id !== soloLayer).map((l) => l.id);
    }
    return [...mutedLayers];
  }, [mutedLayers, soloLayer, project?.timelineMode]);

  const playerInputProps = useMemo(
    () => ({
      ...(project?.compositionDefaultProps ?? {}),
      mutedLayers: effectiveMuted,
      dragEnabled: true,
      project: project
        ? { id: project.id, compositionModule: project.compositionModule, srcRootRel: project.srcRootRel }
        : null,
      reloadKey: compositionReloadKey,
    }),
    [effectiveMuted, project, compositionReloadKey]
  );

  const blockbusterSimpleTracks = useMemo(() => {
    if (!project || project.timelineMode === "rivet") return undefined;
    const t = buildBlockbusterSimpleTimeline(
      project.compositionDefaultProps,
      project.fps,
      project.durationInFrames
    );
    return t.length > 0 ? t : undefined;
  }, [project]);

  const refreshProject = useCallback(async () => {
    const res = await fetch("/api/projects/current");
    if (!res.ok) return;
    const data = await res.json();
    setProject(data as ProjectClientMeta);
  }, []);

  useEffect(() => {
    refreshProject();
  }, [refreshProject]);

  const onProjectSwitched = useCallback(() => {
    setCompositionReloadKey((k) => k + 1);
    setPreviewUrl(null);
    setPreviewMode(false);
    setSelection([]);
    setReplaceClipModal(null);
    setReplaceVoiceoverOpen(false);
    void refreshProject();
  }, [refreshProject]);

  const handleSimpleClipContextMenu = useCallback((clipIndex: number, label: string) => {
    setReplaceClipModal({ clipIndex, label });
  }, []);

  const handleSimpleVoiceoverContextMenu = useCallback(() => {
    setReplaceVoiceoverOpen(true);
  }, []);

  const handleReplaceClipProjectUpdated = useCallback((payload: Record<string, unknown>) => {
    setProject(payload as ProjectClientMeta);
    setCompositionReloadKey((k) => k + 1);
  }, []);

  const handleReplaceVoiceoverProjectUpdated = useCallback((payload: Record<string, unknown>) => {
    setProject(payload as ProjectClientMeta);
    setCompositionReloadKey((k) => k + 1);
  }, []);

  const handleFrameUpdate = useCallback(() => {
    const frame = playerRef.current?.getCurrentFrame() ?? 0;
    setCurrentFrame(frame);
    setSyncFeedback(true);
  }, []);

  const handleSeek = useCallback((frame: number) => {
    playerRef.current?.seekTo(frame);
    setCurrentFrame(frame);
  }, []);

  // Auto-sync frame position — only update state when frame actually changes
  const lastFrameRef = useRef(0);
  useEffect(() => {
    let raf: number;
    const poll = () => {
      const frame = playerRef.current?.getCurrentFrame();
      if (frame != null && frame !== lastFrameRef.current) {
        lastFrameRef.current = frame;
        setCurrentFrame(frame);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Spacebar play/pause
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Don't intercept if Monaco editor is focused
      if ((e.target as HTMLElement).closest(".monaco-editor")) return;

      if (e.code === "Space") {
        e.preventDefault();
        const player = playerRef.current;
        if (!player) return;
        if (player.isPlaying()) player.pause();
        else player.play();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!syncFeedback) return;
    const t = setTimeout(() => setSyncFeedback(false), 2500);
    return () => clearTimeout(t);
  }, [syncFeedback]);

  const handleUndo = useCallback(async () => {
    const res = await fetch("/api/undo", { method: "POST" });
    const data = await res.json();
    setUndoCount(data.remaining);
    setUndoFeedback(data.message);
    setTimeout(() => setUndoFeedback(""), 3000);
  }, []);

  const refreshUndoCount = useCallback(async () => {
    const res = await fetch("/api/undo-count");
    const data = await res.json();
    setUndoCount(data.count);
  }, []);

  const captureScreenshot = useCallback(async (): Promise<string | null> => {
    const container = document.querySelector("[data-remotion-player]");
    const canvas = container?.querySelector("canvas");
    if (canvas) return canvas.toDataURL("image/png");
    return null;
  }, []);

  const handleToggleMute = useCallback((id: string) => {
    setSoloLayer(null); // Clear solo when manually muting
    setMutedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleSolo = useCallback((id: string) => {
    setSoloLayer((prev) => (prev === id ? null : id));
  }, []);

  // Mark preview as stale when edits happen
  const handleEditApplied = useCallback(async () => {
    await refreshUndoCount();
    if (previewUrl) setPreviewStale(true);
  }, [refreshUndoCount, previewUrl]);

  const handleDragEnd = useCallback(async (overlayIndex: number, top: number, left: number) => {
    if (project?.timelineMode !== "rivet") return;
    // Read overlays.ts, find the overlay, update its customTop/customLeft
    const res = await fetch("/api/file/data/overlays.ts");
    const { content } = await res.json();

    const lines = content.split("\n");
    let overlayCount = -1;
    let foundBlock = false;

    for (let l = 0; l < lines.length; l++) {
      if (lines[l].match(/startFrame:\s*f\(/)) {
        overlayCount++;
        if (overlayCount === overlayIndex) {
          // Found our overlay — scan for closing brace, update or insert positions
          let hasTop = false;
          let hasLeft = false;
          let closingLine = -1;

          for (let j = l; j < lines.length; j++) {
            if (lines[j].includes("customTop")) {
              lines[j] = `    customTop: ${top.toFixed(1)},`;
              hasTop = true;
            }
            if (lines[j].includes("customLeft")) {
              lines[j] = `    customLeft: ${left.toFixed(1)},`;
              hasLeft = true;
            }
            if (lines[j].match(/^\s*\},?\s*$/)) {
              closingLine = j;
              break;
            }
          }
          if (closingLine >= 0) {
            const inserts = [];
            if (!hasTop) inserts.push(`    customTop: ${top.toFixed(1)},`);
            if (!hasLeft) inserts.push(`    customLeft: ${left.toFixed(1)},`);
            if (inserts.length) lines.splice(closingLine, 0, ...inserts);
          }
          foundBlock = true;
          break;
        }
      }
    }

    if (foundBlock) {
      await fetch("/api/file/data/overlays.ts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lines.join("\n") }),
      });
      handleEditApplied();
    }
  }, [handleEditApplied, project?.timelineMode]);

  // Listen for drag-end events dispatched from inside the composition
  useEffect(() => {
    const handler = (e: Event) => {
      const { overlayIndex, top, left } = (e as CustomEvent).detail;
      handleDragEnd(overlayIndex, top, left);
    };
    window.addEventListener("remotion-drag-end", handler);
    return () => window.removeEventListener("remotion-drag-end", handler);
  }, [handleDragEnd]);

  const generatePreview = useCallback(async () => {
    setGeneratingPreview(true);
    setPreviewProgress("Starting...");
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quality: previewQuality }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value).split("\n")) {
            if (line.startsWith("data: ")) {
              const msg = line.slice(6);
              if (msg === "DONE") {
                // Cache-bust the preview URL
                setPreviewUrl(`/api/preview-file?t=${Date.now()}`);
                setPreviewStale(false);
                setPreviewMode(true);
                setPreviewProgress("Ready");
              } else if (msg === "ERROR") {
                setPreviewProgress("Failed");
              } else {
                setPreviewProgress(msg);
              }
            }
          }
        }
      }
    } catch (err: any) {
      setPreviewProgress(`Error: ${err.message}`);
    } finally {
      setGeneratingPreview(false);
      setTimeout(() => setPreviewProgress(""), 3000);
    }
  }, [previewQuality]);

  const handleRender = useCallback(async () => {
    setRenderStatus("Choosing file...");
    const dialogRes = await fetch("/api/save-dialog");
    const { path: savePath, cancelled } = await dialogRes.json();
    if (cancelled || !savePath) { setRenderStatus(""); return; }

    setRendering(true);
    setRenderStatus("Starting render...");
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputPath: savePath }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value).split("\n")) {
            if (line.startsWith("data: ")) {
              const msg = line.slice(6);
              if (msg.startsWith("DONE:")) setRenderStatus(`Exported to ${msg.slice(5).split("/").pop()}`);
              else if (msg.startsWith("ERROR:")) setRenderStatus(msg.slice(6));
              else setRenderStatus(msg);
            }
          }
        }
      }
    } catch (err: any) {
      setRenderStatus(`Error: ${err.message}`);
    } finally {
      setRendering(false);
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#111" }}>
      <ProjectBar onProjectSwitched={onProjectSwitched} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* ═══ Left: Video + Timeline + Layers ═══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16, gap: 8 }}>
        {/* Frame counter + preview controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#888", fontFamily: "monospace" }}>
            Frame {currentFrame} / {project?.durationInFrames ?? "…"} (
            {project ? (currentFrame / project.fps).toFixed(1) : "—"}s)
          </span>
          <div style={{ flex: 1 }} />

          {/* Preview mode toggle */}
          <button
            onClick={() => setPreviewMode(false)}
            style={{
              padding: "3px 10px", fontSize: 10, borderRadius: 3, border: "none", cursor: "pointer",
              background: !previewMode ? "#4a7aaa" : "#333", color: !previewMode ? "#fff" : "#888",
            }}
          >
            Live
          </button>
          <button
            onClick={() => previewUrl && setPreviewMode(true)}
            disabled={!previewUrl}
            title={previewStale ? "Preview is stale — regenerate" : ""}
            style={{
              padding: "3px 10px", fontSize: 10, borderRadius: 3, border: "none", cursor: previewUrl ? "pointer" : "default",
              background: previewMode ? "#4a7aaa" : "#333", color: previewMode ? "#fff" : previewUrl ? "#888" : "#555",
            }}
          >
            Preview{previewStale ? " *" : ""}
          </button>

          <span style={{ color: "#555", fontSize: 10 }}>|</span>

          {/* Quality selector */}
          <select
            value={previewQuality}
            onChange={(e) => setPreviewQuality(e.target.value)}
            style={{
              padding: "3px 6px", fontSize: 10, background: "#252525", color: "#ccc",
              border: "1px solid #444", borderRadius: 3,
            }}
          >
            <option value="25">25%</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
          </select>

          <button
            onClick={generatePreview}
            disabled={generatingPreview}
            style={{
              padding: "3px 10px", fontSize: 10, borderRadius: 3, border: "none", cursor: generatingPreview ? "default" : "pointer",
              background: generatingPreview ? "#333" : "#3a6a3a", color: generatingPreview ? "#888" : "#cfc",
            }}
          >
            {generatingPreview ? previewProgress : "Generate Preview"}
          </button>
        </div>

        {/* Player */}
        <div
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", borderRadius: 8, overflow: "hidden", position: "relative" }}
          data-remotion-player
        >
          {previewMode && previewUrl ? (
            <video
              src={previewUrl}
              controls
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : project ? (
            <Player
              ref={playerRef}
              component={DynamicComposition}
              inputProps={playerInputProps}
              durationInFrames={project.durationInFrames}
              fps={project.fps}
              compositionWidth={project.width}
              compositionHeight={project.height}
              controls
              loop={false}
              style={{ width: "100%", height: "100%" }}
              renderLoading={() => <div style={{ color: "#666" }}>Loading...</div>}
              errorFallback={({ error }) => (
                <div style={{ color: "#f66", padding: 20, fontSize: 14, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                  {error.message}{"\n\n"}{error.stack}
                </div>
              )}
            />
          ) : (
            <div style={{ color: "#666", padding: 24 }}>Loading project…</div>
          )}
        </div>

        {/* Timeline */}
        <Timeline
          currentFrame={currentFrame}
          onSeek={handleSeek}
          scenes={SCENES}
          overlays={TEXT_OVERLAYS}
          ctaStart={project && project.timelineMode === "rivet" ? Math.round(25.74 * project.fps) : 0}
          voDuration={project && project.timelineMode === "rivet" ? Math.round(30.0 * project.fps) : project?.durationInFrames ?? 900}
          selection={selection}
          onSelect={setSelection}
          mutedLayers={mutedLayers}
          soloLayer={soloLayer}
          onToggleMute={handleToggleMute}
          onToggleSolo={handleToggleSolo}
          simpleMode={project?.timelineMode !== "rivet"}
          simpleModeTracks={blockbusterSimpleTracks}
          fps={project?.fps}
          totalFrames={project?.durationInFrames}
          onSimpleClipContextMenu={project?.id.startsWith("bb-") ? handleSimpleClipContextMenu : undefined}
          onSimpleVoiceoverContextMenu={project?.id.startsWith("bb-") ? handleSimpleVoiceoverContextMenu : undefined}
        />

        {/* Bottom bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleFrameUpdate} style={btnStyle}>Sync Frame</button>
          {syncFeedback && <span style={{ fontSize: 11, color: "#6c6", fontFamily: "monospace" }}>Synced ({currentFrame})</span>}
          <button onClick={handleUndo} disabled={undoCount === 0} style={{ ...btnStyle, background: undoCount > 0 ? "#6a4a2a" : "#2a2a2a", color: undoCount > 0 ? "#e0c090" : "#555", border: `1px solid ${undoCount > 0 ? "#8a6a3a" : "#333"}` }}>
            Undo {undoCount > 0 ? `(${undoCount})` : ""}
          </button>
          {undoFeedback && <span style={{ fontSize: 11, color: "#e0c090", fontFamily: "monospace" }}>{undoFeedback}</span>}
          <div style={{ flex: 1 }} />
          <button onClick={handleRender} disabled={rendering} style={{ ...btnStyle, background: rendering ? "#333" : "#5a4a9a", color: "#fff" }}>
            {rendering ? "Rendering..." : "Render Out"}
          </button>
          {renderStatus && (
            <span style={{ fontSize: 11, color: renderStatus.startsWith("Exported") ? "#6c6" : renderStatus.startsWith("Error") ? "#f66" : "#aaa", fontFamily: "monospace" }}>
              {renderStatus}
            </span>
          )}
        </div>
      </div>

      {/* ═══ Right: Chat / Code tabs ═══ */}
      <div style={{ width: 450, borderLeft: "1px solid #333", display: "flex", flexDirection: "column", background: "#1a1a1a" }}>
        {/* Version controls */}
        <VersionPanel />

        {/* Tab switcher */}
        <div style={{ display: "flex", borderBottom: "1px solid #333" }}>
          {(["chat", "code"] as RightTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              style={{
                flex: 1,
                padding: "10px 0",
                background: rightTab === tab ? "#252525" : "transparent",
                color: rightTab === tab ? "#fff" : "#888",
                border: "none",
                borderBottom: rightTab === tab ? "2px solid #6aaacc" : "2px solid transparent",
                fontSize: 13,
                fontWeight: rightTab === tab ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {rightTab === "chat" ? (
            <>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <ChatPanel
                  currentFrame={currentFrame}
                  captureScreenshot={captureScreenshot}
                  onEditApplied={handleEditApplied}
                  selection={selection}
                  onClearSelection={() => setSelection([])}
                  lastUpload={lastUpload}
                />
              </div>
              <FileUpload onUploaded={setLastUpload} />
            </>
          ) : (
            <CodeEditor onEditApplied={handleEditApplied} projectReloadKey={compositionReloadKey} />
          )}
        </div>
      </div>
    </div>
    {replaceClipModal ? (
      <ReplaceClipModal
        clipIndex={replaceClipModal.clipIndex}
        clipLabel={replaceClipModal.label}
        onClose={() => setReplaceClipModal(null)}
        onProjectUpdated={handleReplaceClipProjectUpdated}
      />
    ) : null}
    {replaceVoiceoverOpen ? (
      <ReplaceVoiceoverModal
        onClose={() => setReplaceVoiceoverOpen(false)}
        onProjectUpdated={handleReplaceVoiceoverProjectUpdated}
      />
    ) : null}
  </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: "5px 12px",
  background: "#333",
  color: "#ccc",
  border: "1px solid #555",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
};
