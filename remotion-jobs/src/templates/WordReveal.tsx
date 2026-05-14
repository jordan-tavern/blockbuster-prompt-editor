import React, { useState, useCallback } from "react";
import { useCurrentFrame, useCurrentScale, spring, interpolate } from "remotion";
import type { TextOverlay, Scene, DragCallbacks } from "../types";

const FONT_FAMILY = '"Avenir Next", "Avenir", "Helvetica Neue", sans-serif';
const FPS = 30;
const FADE_OUT_FRAMES = 14;
const COMP_WIDTH = 1920;
const COMP_HEIGHT = 1080;

function getBlockPosition(
  faceZone: string | undefined
): { top: string; justifyContent: string } {
  switch (faceZone) {
    case "center":
      return { top: "75%", justifyContent: "center" };
    case "upper":
      return { top: "68%", justifyContent: "center" };
    case "lower":
      return { top: "32%", justifyContent: "center" };
    case "left":
      return { top: "52%", justifyContent: "flex-end" };
    case "right":
      return { top: "52%", justifyContent: "flex-start" };
    case "none":
    default:
      return { top: "54%", justifyContent: "center" };
  }
}

const Word: React.FC<{
  text: string;
  revealFrame: number;
  italic?: boolean;
  bold?: boolean;
  fontSize: number;
  overlayEndFrame: number;
  globalFrame: number;
}> = ({ text, revealFrame, italic, bold, fontSize, overlayEndFrame, globalFrame }) => {
  const hasRevealed = globalFrame >= revealFrame;
  const framesSinceReveal = Math.max(0, globalFrame - revealFrame);

  const springProgress = spring({
    fps: FPS,
    frame: framesSinceReveal,
    config: { damping: 18, stiffness: 120, mass: 0.8 },
  });

  const opacity = hasRevealed ? springProgress : 0;
  const translateY = hasRevealed ? interpolate(springProgress, [0, 1], [18, 0]) : 18;
  const scale = hasRevealed ? interpolate(springProgress, [0, 1], [0.96, 1.0]) : 0.96;
  const blur = hasRevealed ? interpolate(springProgress, [0, 1], [3, 0]) : 3;

  const fadeOut = interpolate(
    globalFrame,
    [overlayEndFrame - FADE_OUT_FRAMES, overlayEndFrame],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight: bold ? 400 : 300,
        fontStyle: italic ? "italic" : "normal",
        color: "#FFFFFF",
        opacity: Math.min(opacity, fadeOut),
        transform: `translateY(${translateY}px) scale(${scale})`,
        filter: `blur(${blur}px)`,
        textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)",
        letterSpacing: "0.02em",
        willChange: "transform, opacity, filter",
      }}
    >
      {text}
    </span>
  );
};

/**
 * Draggable wrapper for a text block.
 * Uses pointer events inside the composition + useCurrentScale() for correct coordinates.
 */
const DraggableBlock: React.FC<{
  index: number;
  initialTop: number;  // percentage
  initialLeft: number; // percentage, -1 = centered
  dragEnabled: boolean;
  onDragEnd?: (index: number, top: number, left: number) => void;
  children: React.ReactNode;
}> = ({ index, initialTop, initialLeft, dragEnabled: _dragEnabled, onDragEnd, children }) => {
  // Always draggable when onDragEnd is provided (editor mode)
  const dragEnabled = !!onDragEnd;
  const scale = useCurrentScale();
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const isCentered = initialLeft < 0;
  const topPx = (initialTop / 100) * COMP_HEIGHT + offset.y;
  const leftPx = isCentered
    ? COMP_WIDTH / 2 + offset.x
    : (initialLeft / 100) * COMP_WIDTH + offset.x;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!dragEnabled) return;
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      setStartPos({ x: e.clientX, y: e.clientY });
    },
    [dragEnabled]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      // Divide by scale to convert screen pixels to composition pixels
      setOffset({
        x: (e.clientX - startPos.x) / scale,
        y: (e.clientY - startPos.y) / scale,
      });
    },
    [dragging, startPos, scale]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setDragging(false);

      // Convert final position back to percentages
      const finalTop = (topPx / COMP_HEIGHT) * 100;
      const finalLeft = (leftPx / COMP_WIDTH) * 100;

      setOffset({ x: 0, y: 0 });
      onDragEnd?.(index, finalTop, finalLeft);
    },
    [dragging, topPx, leftPx, index, onDragEnd]
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => dragEnabled && setHovering(true)}
      onPointerLeave={() => { if (!dragging) setHovering(false); }}
      style={{
        position: "absolute",
        top: topPx,
        left: leftPx,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "auto",
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        outline: dragging
          ? "2px solid rgba(106, 170, 204, 0.9)"
          : hovering
            ? "2px solid rgba(255, 255, 255, 0.5)"
            : dragEnabled
              ? "1px dashed rgba(255, 255, 255, 0.15)"
              : "none",
        outlineOffset: 6,
        borderRadius: 4,
        padding: 10,
      }}
    >
      {children}
    </div>
  );
};

interface WordRevealLayerProps {
  overlays: TextOverlay[];
  scenes: Scene[];
  dragCallbacks?: DragCallbacks;
}

export const WordRevealLayer: React.FC<WordRevealLayerProps> = ({
  overlays,
  scenes,
  dragCallbacks,
}) => {
  const frame = useCurrentFrame();
  const dragEnabled = dragCallbacks?.dragEnabled ?? false;

  return (
    <>
      {overlays.map((overlay, i) => {
        if (frame < overlay.startFrame || frame >= overlay.endFrame) return null;

        // Determine position: custom if set, otherwise face-aware default
        let topPct: number;
        if (overlay.customTop != null) {
          topPct = overlay.customTop;
        } else {
          const sceneAtStart = scenes.find(
            (s) => overlay.startFrame >= s.startFrame && overlay.startFrame < s.endFrame
          );
          const faceZone = sceneAtStart?.faceZone ?? "none";
          topPct = parseFloat(getBlockPosition(faceZone).top);
        }
        const leftPct = overlay.customLeft ?? -1; // -1 = centered

        // Group words by line
        const lines: Map<number, typeof overlay.words> = new Map();
        for (const word of overlay.words) {
          const lineNum = word.line ?? 0;
          if (!lines.has(lineNum)) lines.set(lineNum, []);
          lines.get(lineNum)!.push(word);
        }
        const sortedLines = [...lines.entries()].sort(([a], [b]) => a - b);

        return (
          <DraggableBlock
            key={i}
            index={i}
            initialTop={topPct}
            initialLeft={leftPct}
            dragEnabled={dragEnabled}
            onDragEnd={dragCallbacks?.onDragEnd}
          >
            {sortedLines.map(([lineNum, words]) => (
              <div
                key={lineNum}
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 14,
                  flexWrap: "wrap",
                }}
              >
                {words.map((word, j) => (
                  <Word
                    key={j}
                    text={word.text}
                    revealFrame={word.revealFrame}
                    italic={word.italic}
                    bold={word.bold}
                    fontSize={overlay.fontSize ?? 72}
                    overlayEndFrame={overlay.endFrame}
                    globalFrame={frame}
                  />
                ))}
              </div>
            ))}
          </DraggableBlock>
        );
      })}
    </>
  );
};
