export interface Scene {
  src: string;
  startFrame: number;
  endFrame: number;
  type: "video";
  /** Seek into the source clip (frames). Used for C-SPAN segments. */
  startFrom?: number;
  /** Ken Burns motion override. "none" disables motion (e.g. C-SPAN). */
  kenBurns?: "auto" | "none" | "zoom_in" | "zoom_out" | "pan_left" | "pan_right";
  /** Per-clip color correction — tuned individually per clip for cohesion */
  grade?: ClipGrade;
  /** Where the primary face/subject is in the frame — text avoids this zone */
  faceZone?: "center" | "upper" | "lower" | "left" | "right" | "none";
  label?: string;
}

export type ColorPreset =
  | "hometown"
  | "champion"
  | "fighter"
  | "outsider"
  | "maverick"
  | "basic";

/** Per-clip color correction values. All default to neutral (1.0 / 0). */
export interface ClipGrade {
  brightness?: number;  // 1.0 = unchanged
  contrast?: number;    // 1.0 = unchanged
  saturate?: number;    // 1.0 = unchanged
  sepia?: number;       // 0–1, adds warmth (counters blue/green)
}

export interface TextOverlay {
  /** Words to display, in order */
  words: TextWord[];
  startFrame: number;
  endFrame: number;
  /** Vertical position: "center" (default) or "lower" */
  position?: "center" | "lower";
  /** Font size in px */
  fontSize?: number;
  /** Manual position override (percentage 0-100). Set by drag-and-drop in the editor. */
  customTop?: number;
  customLeft?: number;
}

/** Callback for when a user drags an overlay to a new position */
export interface DragCallbacks {
  onDragEnd?: (overlayIndex: number, top: number, left: number) => void;
  dragEnabled?: boolean;
}

export interface TextWord {
  text: string;
  /** Frame at which this word appears (absolute) */
  revealFrame: number;
  /** Italic emphasis */
  italic?: boolean;
  /** Bold weight */
  bold?: boolean;
  /** Line index within the overlay block (0 = first line, 1 = second, etc.) */
  line?: number;
}

export interface CTAPhase {
  text: string;
  startFrame: number;
  fontSize?: number;
  /** Uppercase */
  uppercase?: boolean;
}
