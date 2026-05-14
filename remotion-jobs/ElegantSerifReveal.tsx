import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

/**
 * ElegantSerifReveal — Staggered word-by-word fade-in with mixed typography.
 *
 * Based on "Animated Text 3": center-aligned text on transparent/dark bg,
 * words appear one at a time with a soft fade + slight upward drift.
 * Line 1 uses bold sans-serif, line 2 uses italic serif for contrast.
 * Subtle film grain texture overlay.
 *
 * Props:
 *   line1       — Primary text (bold sans-serif)
 *   line2       — Secondary text (italic serif)
 *   textColor   — Text color (default white)
 *   accentColor — Not heavily used, available for future variants
 */

import { Position, positionStyles, alignFromPosition } from "./positions";

interface ElegantSerifRevealProps {
  line1: string;
  line2?: string;
  textColor?: string;
  accentColor?: string;
  startFrame?: number;
  duration?: number;
  fontSize?: number;
  position?: Position;
}

export const ElegantSerifReveal: React.FC<ElegantSerifRevealProps> = ({
  line1,
  line2,
  textColor = "#FFFFFF",
  accentColor = "#E5173F",
  startFrame = 0,
  duration,
  fontSize = 64,
  position = "center",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - startFrame;
  const totalDuration = duration ?? Math.round(fps * 5);

  if (f < 0 || f > totalDuration) return null;

  // Split into words for staggered reveal
  const words1 = line1.split(" ");
  const words2 = line2 ? line2.split(" ") : [];
  const allWords = [...words1, ...words2];
  const wordDelay = 4; // frames between each word appearing

  // Exit fade
  const exitOpacity = interpolate(
    f,
    [totalDuration - 15, totalDuration],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const renderWord = (
    word: string,
    index: number,
    isLine2: boolean
  ) => {
    const wordStart = index * wordDelay + 8; // 8 frame initial delay
    const localF = f - wordStart;

    const opacity = interpolate(localF, [0, 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

    const translateY = interpolate(localF, [0, 10], [12, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

    // Slight blur that clears
    const blur = interpolate(localF, [0, 8], [2, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    return (
      <span
        key={`${index}-${word}`}
        style={{
          display: "inline-block",
          opacity,
          transform: `translateY(${translateY}px)`,
          filter: `blur(${blur}px)`,
          fontFamily: isLine2
            ? '"Georgia", "Times New Roman", "Playfair Display", serif'
            : '"Helvetica Neue", "Helvetica", "Arial", sans-serif',
          fontStyle: isLine2 ? "italic" : "normal",
          fontWeight: isLine2 ? 400 : 500,
          fontSize: isLine2 ? fontSize * 0.8 : fontSize,
          color: isLine2 ? `${textColor}cc` : textColor,
          marginRight: "0.3em",
          letterSpacing: "0.01em",
        }}
      >
        {word}
      </span>
    );
  };

  const align = alignFromPosition(position);

  return (
    <AbsoluteFill
      style={{
        opacity: exitOpacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          ...positionStyles[position],
          maxWidth: "80%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: align,
            gap: 8,
          }}
        >
          {/* Line 1 — bold sans */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : align }}>
            {words1.map((word, i) => renderWord(word, i, false))}
          </div>
          {/* Line 2 — italic serif */}
          {line2 && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : align }}>
            {words2.map((word, i) =>
              renderWord(word, i + words1.length, true)
            )}
          </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
