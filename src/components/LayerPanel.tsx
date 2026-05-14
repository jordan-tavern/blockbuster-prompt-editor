import React from "react";
import type { LayerDef } from "@video/data/layers.ts";

interface LayerPanelProps {
  layers: LayerDef[];
  mutedLayers: Set<string>;
  soloLayer: string | null;
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  video: "\u{1F3AC}",   // 🎬
  audio: "\u{1F50A}",   // 🔊
  text: "\u{1F524}",    // 🔤
  overlay: "\u{1F311}",  // 🌑
  grade: "\u{1F3A8}",   // 🎨
};

const MUTED_AUDIO_ICON = "\u{1F507}"; // 🔇

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  mutedLayers,
  soloLayer,
  onToggleMute,
  onToggleSolo,
}) => {
  const sorted = [...layers].sort((a, b) => (b.zOrder ?? 0) - (a.zOrder ?? 0)); // top layer first

  return (
    <div
      style={{
        background: "#1a1a1a",
        borderTop: "1px solid #333",
        padding: "6px 0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          padding: "0 12px 4px",
        }}
      >
        Layers
      </div>
      {sorted.map((layer) => {
        const isMuted = mutedLayers.has(layer.id);
        const isSolo = soloLayer === layer.id;
        const isAudio = layer.type === "audio";
        // If solo is active, everything else is effectively muted
        const effectivelyMuted = soloLayer ? !isSolo : isMuted;

        return (
          <div
            key={layer.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 12px",
              opacity: effectivelyMuted ? 0.4 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {/* Mute toggle */}
            <button
              onClick={() => onToggleMute(layer.id)}
              title={isMuted ? "Unmute" : "Mute"}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                width: 22,
                textAlign: "center",
                padding: 0,
                filter: isMuted ? "grayscale(1)" : "none",
              }}
            >
              {isAudio ? (isMuted ? MUTED_AUDIO_ICON : TYPE_ICONS.audio) : (isMuted ? "\u{1F441}\u{200D}\u{1F5E8}" : "\u{1F441}")}
            </button>

            {/* Solo toggle */}
            <button
              onClick={() => onToggleSolo(layer.id)}
              title={isSolo ? "Unsolo" : "Solo"}
              style={{
                background: isSolo ? "#cc8800" : "#333",
                color: isSolo ? "#000" : "#888",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 700,
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              S
            </button>

            {/* Layer icon + name */}
            <span style={{ fontSize: 11, marginRight: 2 }}>
              {(layer.type && TYPE_ICONS[layer.type]) || ""}
            </span>
            <span
              style={{
                fontSize: 11,
                color: effectivelyMuted ? "#666" : "#ccc",
                fontFamily: "monospace",
                flex: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {String((layer as { label?: string }).label ?? layer.id)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
