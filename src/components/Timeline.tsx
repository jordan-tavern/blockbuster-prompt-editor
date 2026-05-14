import React, { useRef, useCallback, useState } from "react";

const FPS = 30;
const TOTAL_FRAMES = 900;

export interface TimelineSelectionItem {
  type: "scene" | "text" | "cta" | "clip" | "voiceover" | "backing" | "captions";
  index: number;
  label: string;
  startFrame: number;
  endFrame: number;
}

export type TimelineSelection = TimelineSelectionItem[];

export interface TimelineBlock {
  label: string;
  startFrame: number;
  endFrame: number;
  color: string;
  selectionType: "scene" | "text" | "cta" | "clip" | "voiceover" | "backing" | "captions";
  sourceIndex: number;
}

export interface TimelineTrack {
  name: string;
  layerId: string;
  isAudio: boolean;
  blocks: TimelineBlock[];
}

interface TimelineProps {
  currentFrame: number;
  onSeek: (frame: number) => void;
  scenes: Array<{ src: string; startFrame: number; endFrame: number; label?: string }>;
  overlays: Array<{ startFrame: number; endFrame: number; words: Array<{ text: string }> }>;
  ctaStart: number;
  voDuration: number;
  selection: TimelineSelection;
  onSelect: (sel: TimelineSelection) => void;
  mutedLayers: Set<string>;
  soloLayer: string | null;
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  /** Single scrub row only — no Rivet-specific tracks. */
  simpleMode?: boolean;
  /** When `simpleMode`, optional Blockbuster-derived tracks (clips / VO / etc.). If omitted or empty, one empty "Composition" row. */
  simpleModeTracks?: TimelineTrack[];
  fps?: number;
  totalFrames?: number;
  /** Right-click a Blockbuster clip block (simple mode) to swap b-roll from the asset server. */
  onSimpleClipContextMenu?: (clipIndex: number, label: string) => void;
  /** Right-click voiceover (simple mode) to replace the VO file and re-time the composition. */
  onSimpleVoiceoverContextMenu?: () => void;
}

const TRACK_HEIGHT = 24;
const TRACK_GAP = 2;
const LABEL_WIDTH = 110; // wider to fit mute/solo buttons

const COLORS = {
  scene: ["#3a6b8a", "#4a7a6a", "#5a6a8a", "#4a8a7a", "#3a7a9a", "#5a8a6a"],
  sceneSelected: "#6aaacc",
  text: "#8a6a3a",
  textSelected: "#ccaa5a",
  cta: "#7a4a6a",
  ctaSelected: "#bb7aaa",
  clip: "#3a6b8a",
  clipSelected: "#6aaacc",
  voiceover: "#5a8a5a",
  voiceoverSelected: "#7ccc7c",
  backing: "#6a5a8a",
  backingSelected: "#9a8acc",
  captions: "#8a6a3a",
  captionsSelected: "#ccaa5a",
  vo: "#5a8a5a",
  music: "#6a5a8a",
};

function formatTime(frame: number, fps: number): string {
  const sec = frame / fps;
  return `${Math.floor(sec)}:${String(Math.round((sec % 1) * fps)).padStart(2, "0")}`;
}

export const Timeline: React.FC<TimelineProps> = ({
  currentFrame,
  onSeek,
  scenes,
  overlays,
  ctaStart,
  voDuration,
  selection,
  onSelect,
  mutedLayers,
  soloLayer,
  onToggleMute,
  onToggleSolo,
  simpleMode = false,
  simpleModeTracks,
  fps: fpsProp,
  totalFrames: totalFramesProp,
  onSimpleClipContextMenu,
  onSimpleVoiceoverContextMenu,
}) => {
  const fps = fpsProp ?? FPS;
  const totalFrames = totalFramesProp ?? TOTAL_FRAMES;
  const trackAreaRef = useRef<HTMLDivElement>(null);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      // Only seek if clicking the track background, not a block
      const target = e.target as HTMLElement;
      if (target.dataset.trackBg) {
        // Use the clicked track bg element's own rect — it doesn't include the label
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        const frame = Math.round(pct * totalFrames);
        onSeek(Math.max(0, Math.min(totalFrames - 1, frame)));
        onSelect([]); // Deselect when clicking empty track area
      }
    },
    [onSeek, onSelect, totalFrames]
  );

  const handleBlockContextMenu = useCallback(
    (e: React.MouseEvent, block: TimelineBlock) => {
      if (!simpleMode) return;
      if (block.selectionType === "clip" && onSimpleClipContextMenu && block.sourceIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        onSimpleClipContextMenu(block.sourceIndex, block.label);
        return;
      }
      if (block.selectionType === "voiceover" && onSimpleVoiceoverContextMenu) {
        e.preventDefault();
        e.stopPropagation();
        onSimpleVoiceoverContextMenu();
      }
    },
    [simpleMode, onSimpleClipContextMenu, onSimpleVoiceoverContextMenu]
  );

  const handleBlockClick = useCallback(
    (e: React.MouseEvent, block: TimelineBlock) => {
      e.stopPropagation();

      const item: TimelineSelectionItem = {
        type: block.selectionType,
        index: block.sourceIndex,
        label: block.label,
        startFrame: block.startFrame,
        endFrame: block.endFrame,
      };

      const alreadySelected = selection.some(
        (s) => s.type === block.selectionType && s.index === block.sourceIndex
      );

      if (e.shiftKey) {
        // Shift+click: toggle this item in the multi-selection
        if (alreadySelected) {
          onSelect(selection.filter(
            (s) => !(s.type === block.selectionType && s.index === block.sourceIndex)
          ));
        } else {
          onSelect([...selection, item]);
        }
      } else {
        // Regular click: toggle single selection
        if (alreadySelected && selection.length === 1) {
          onSelect([]);
        } else {
          onSelect([item]);
        }
      }

      onSeek(block.startFrame);
    },
    [selection, onSelect, onSeek]
  );

  const isSelected = (type: string, index: number) =>
    selection.some((s) => s.type === type && s.index === index);

  const blockColor = (block: TimelineBlock): string => {
    const sel = isSelected(block.selectionType, block.sourceIndex);
    if (block.selectionType === "clip") return sel ? COLORS.clipSelected : block.color;
    if (block.selectionType === "voiceover") return sel ? COLORS.voiceoverSelected : block.color;
    if (block.selectionType === "backing") return sel ? COLORS.backingSelected : block.color;
    if (block.selectionType === "captions") return sel ? COLORS.captionsSelected : block.color;
    return block.color;
  };

  const isLayerMuted = (id: string) => soloLayer ? id !== soloLayer : mutedLayers.has(id);

  // Build tracks
  const tracks: TimelineTrack[] = simpleMode
    ? simpleModeTracks && simpleModeTracks.length > 0
      ? simpleModeTracks
      : [{ name: "Composition", layerId: "main", isAudio: false, blocks: [] }]
    : [
        {
          name: "Clips",
          layerId: "scenes",
          isAudio: false,
          blocks: scenes.map((s, i) => ({
            label: (s.label || s.src.split("/").pop()?.replace(".mp4", "") || "").slice(0, 25),
            startFrame: s.startFrame,
            endFrame: s.endFrame,
            color: isSelected("scene", i) ? COLORS.sceneSelected : COLORS.scene[i % COLORS.scene.length],
            selectionType: "scene" as const,
            sourceIndex: i,
          })),
        },
        {
          name: "Text",
          layerId: "text",
          isAudio: false,
          blocks: overlays.map((o, i) => ({
            label: o.words.map((w) => w.text).join(" ").slice(0, 30),
            startFrame: o.startFrame,
            endFrame: o.endFrame,
            color: isSelected("text", i) ? COLORS.textSelected : COLORS.text,
            selectionType: "text" as const,
            sourceIndex: i,
          })),
        },
        {
          name: "CTA",
          layerId: "cta",
          isAudio: false,
          blocks:
            ctaStart > 0
              ? [
                  {
                    label: "Call CTA + Phone",
                    startFrame: ctaStart,
                    endFrame: totalFrames,
                    color: isSelected("cta", 0) ? COLORS.ctaSelected : COLORS.cta,
                    selectionType: "cta" as const,
                    sourceIndex: 0,
                  },
                ]
              : [],
        },
        {
          name: "VO",
          layerId: "vo",
          isAudio: true,
          blocks: [
            {
              label: "Voiceover",
              startFrame: 0,
              endFrame: voDuration,
              color: COLORS.vo,
              selectionType: "scene" as const,
              sourceIndex: -1,
            },
          ],
        },
        {
          name: "Music",
          layerId: "music",
          isAudio: true,
          blocks: [
            {
              label: "hopeful-alt.wav",
              startFrame: 0,
              endFrame: totalFrames,
              color: COLORS.music,
              selectionType: "scene" as const,
              sourceIndex: -1,
            },
          ],
        },
      ];

  const playheadPct = (currentFrame / totalFrames) * 100;
  const maxSec = Math.max(1, Math.ceil(totalFrames / fps));
  const markers: number[] = [];
  for (let s = 0; s <= maxSec; s += 5) markers.push(s);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);

  // Scrub: convert mouse X on the ruler to a frame and seek
  const scrubFromEvent = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      onSeek(Math.round(pct * totalFrames));
    },
    [onSeek, totalFrames]
  );

  const handleRulerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setScrubbing(true);
      scrubFromEvent(e);
    },
    [scrubFromEvent]
  );

  const handleRulerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!scrubbing) return;
      scrubFromEvent(e);
    },
    [scrubbing, scrubFromEvent]
  );

  const handleRulerPointerUp = useCallback(() => {
    setScrubbing(false);
  }, []);

  return (
    <div
      style={{
        background: "#1a1a1a",
        borderTop: "1px solid #333",
        padding: "8px 0",
        userSelect: "none",
      }}
    >
      {/* Time ruler + scrubber playhead */}
      <div style={{ display: "flex", marginBottom: 2 }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} />
        <div
          ref={rulerRef}
          onPointerDown={handleRulerPointerDown}
          onPointerMove={handleRulerPointerMove}
          onPointerUp={handleRulerPointerUp}
          style={{
            flex: 1,
            position: "relative",
            height: 22,
            cursor: "pointer",
            touchAction: "none",
          }}
        >
          {/* Time markers */}
          {markers.map((sec) => (
            <span
              key={sec}
              style={{
                position: "absolute",
                left: `${(sec / maxSec) * 100}%`,
                bottom: 0,
                fontSize: 9,
                color: "#555",
                fontFamily: "monospace",
                transform: "translateX(-50%)",
                pointerEvents: "none",
              }}
            >
              {sec}s
            </span>
          ))}

          {/* Playhead handle */}
          <div
            style={{
              position: "absolute",
              left: `${playheadPct}%`,
              top: 0,
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {/* Triangle head */}
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "8px solid #e04040",
              }}
            />
            {/* Stem line — extends through all tracks */}
            <div
              style={{
                width: 1.5,
                height: simpleMode ? 320 : 200,
                background: "#e04040",
                opacity: 0.8,
              }}
            />
          </div>
        </div>
      </div>

      {/* Tracks */}
      <div
        ref={trackAreaRef}
        onClick={handleTrackClick}
        style={{ display: "flex", flexDirection: "column", gap: TRACK_GAP }}
      >
        {tracks.map((track) => {
          const muted = isLayerMuted(track.layerId);
          const solo = soloLayer === track.layerId;
          const rowHeight = simpleMode && track.isAudio ? 30 : TRACK_HEIGHT;
          const labelTint =
            simpleMode && track.layerId === "simple-voiceover"
              ? "rgba(90, 138, 90, 0.14)"
              : simpleMode && track.layerId === "simple-music"
                ? "rgba(106, 90, 138, 0.12)"
                : "transparent";
          return (
          <div key={track.layerId + track.name} style={{ display: "flex", height: rowHeight }}>
            <div
              style={{
                width: LABEL_WIDTH,
                flexShrink: 0,
                fontSize: 10,
                fontFamily: "monospace",
                display: "flex",
                alignItems: "center",
                gap: 3,
                paddingLeft: 4,
                background: labelTint,
                borderRadius: 3,
              }}
            >
              {track.layerId !== "main" && (
              <>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleMute(track.layerId); }}
                title={muted ? "Unmute" : "Mute"}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "0 2px",
                  color: muted ? "#555" : "#aaa",
                }}
              >
                {track.isAudio ? (muted ? "M" : "\u{266A}") : (muted ? "\u{2013}" : "\u{25CF}")}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSolo(track.layerId); }}
                title={solo ? "Unsolo" : "Solo"}
                style={{
                  background: solo ? "#cc8800" : "none",
                  color: solo ? "#000" : "#666",
                  border: "none",
                  borderRadius: 2,
                  cursor: "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  width: 14,
                  height: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                S
              </button>
              </>
              )}
              <span style={{ color: muted ? "#555" : "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {track.name}
              </span>
            </div>

            <div
              data-track-bg="true"
              style={{
                flex: 1,
                position: "relative",
                background: "#111",
                borderRadius: 3,
                cursor: "crosshair",
              }}
            >
              {track.blocks.map((block, i) => {
                const left = (block.startFrame / totalFrames) * 100;
                const width = ((block.endFrame - block.startFrame) / totalFrames) * 100;
                const selected = isSelected(block.selectionType, block.sourceIndex);
                const selectable = block.sourceIndex >= 0;
                const bg = simpleMode ? blockColor(block) : block.color;

                return (
                  <div
                    key={i}
                    title={`${block.label} (${formatTime(block.startFrame, fps)} – ${formatTime(block.endFrame, fps)})`}
                    onClick={selectable ? (e) => handleBlockClick(e, block) : undefined}
                    onContextMenu={
                      simpleMode &&
                      ((block.selectionType === "clip" && onSimpleClipContextMenu) ||
                        (block.selectionType === "voiceover" && onSimpleVoiceoverContextMenu))
                        ? (e) => handleBlockContextMenu(e, block)
                        : undefined
                    }
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${width}%`,
                      height: "100%",
                      background: bg,
                      borderRadius: 3,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 4,
                      cursor: selectable ? "pointer" : "crosshair",
                      outline: selected ? "2px solid #fff" : "none",
                      outlineOffset: -1,
                      zIndex: selected ? 5 : 1,
                      transition: "outline 0.1s, background 0.1s",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "rgba(255,255,255,0.85)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontFamily: "monospace",
                        fontWeight: selected ? 600 : 400,
                      }}
                    >
                      {block.label}
                    </span>
                  </div>
                );
              })}

              {/* (playhead is rendered from the ruler above) */}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
};
