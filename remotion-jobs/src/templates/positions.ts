import React from "react";

/**
 * Standard overlay positions — 9 placements on a 3x3 grid.
 *
 * Vertical: top third (33% from top), center (50%), bottom third (33% from bottom)
 * Horizontal: 20% from left, center (50%), 20% from right
 */

export type Position =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "center-left"
  | "center-right"
  | "lower-center"
  | "top-center"
  | "top-left"
  | "top-right";

export const positionStyles: Record<Position, React.CSSProperties> = {
  "top-left": { top: "33%", left: "10%", transform: "translateY(-50%)", textAlign: "left" },
  "top-center": { top: "33%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" },
  "top-right": { top: "33%", right: "10%", transform: "translateY(-50%)", textAlign: "right" },
  "center-left": { top: "50%", left: "10%", transform: "translateY(-50%)", textAlign: "left" },
  center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" },
  "lower-center": { top: "60%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" },
  "center-right": { top: "50%", right: "10%", transform: "translateY(-50%)", textAlign: "right" },
  "bottom-left": { bottom: "33%", left: "10%", transform: "translateY(50%)", textAlign: "left" },
  "bottom-center": { bottom: "33%", left: "50%", transform: "translate(-50%, 50%)", textAlign: "center" },
  "bottom-right": { bottom: "33%", right: "10%", transform: "translateY(50%)", textAlign: "right" },
};

/** Derive text alignment from position name. */
export function alignFromPosition(pos: Position): "center" | "flex-start" | "flex-end" {
  if (pos.includes("right")) return "flex-end";
  if (pos.includes("left")) return "flex-start";
  return "center";
}
