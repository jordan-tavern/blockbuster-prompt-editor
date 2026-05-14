import type { TextOverlay, CTAPhase } from "../types";

const FPS = 30;
const f = (seconds: number) => Math.round(seconds * FPS);

/**
 * JOBS variant v3 — boss feedback round 2:
 *   - Sectors on one line, Farming not italicized
 *   - Three name instances with rotating taglines
 *   - No "Thank you" — replaced with third name + tagline
 *   - CTA centered and lowered to 25% from bottom
 */

export interface SerifOverlay {
  line1: string;
  line2?: string;
  startFrame: number;
  endFrame: number;
  fontSize?: number;
  position?: "center" | "bottom-center" | "top-center" | "center-left" | "center-right" | "lower-center";
  heavyFont?: boolean;
  wordDelays?: number[];
  persistentName?: boolean;
  isTagline?: boolean;
}

export const SERIF_OVERLAYS: SerifOverlay[] = [
  // ── "Mid-Michigan was built / by working people." ──
  {
    line1: "Mid-Michigan was built",
    line2: "by working people.",
    startFrame: f(0.0),
    endFrame: f(3.5),
    fontSize: 72,
    position: "lower-center",
  },

  // ── "Manufacturing, Healthcare, and Farming" — ONE LINE, timed to VO ──
  // VO: "manufacturing" @ 3.26, "healthcare" @ 4.24, "and" @ 4.88, "farming" @ 5.06
  {
    line1: "Manufacturing, Healthcare, and Farming",
    startFrame: f(3.1),
    endFrame: f(6.5),
    fontSize: 64,
    position: "lower-center",
    wordDelays: [f(3.26) - f(3.1), f(4.24) - f(3.1), f(4.88) - f(3.1), f(5.06) - f(3.1)],
  },

  // ── Persistent name (11s–25s) — stays on screen while taglines rotate below ──
  // VO: "Congresswoman" @ 11.22
  {
    line1: "Kristen McDonald Rivet",
    startFrame: f(11.0),
    endFrame: f(25.0),
    fontSize: 64,
    position: "center",
    heavyFont: true,
    persistentName: true,
  },

  // ── Tagline 1: "Fighting for Mid-Michigan Jobs" ──
  // VO: "is leading the fight to protect" starts @ 12.90
  {
    line1: "Fighting for Mid-Michigan Jobs",
    startFrame: f(12.90),
    endFrame: f(16.0),
    fontSize: 48,
    position: "center",
    isTagline: true,
  },

  // ── Tagline 2: "Creating Good Paying Jobs" ──
  // VO: "and create new jobs" @ 16.02
  {
    line1: "Creating Good Paying Jobs",
    startFrame: f(16.0),
    endFrame: f(20.5),
    fontSize: 48,
    position: "center",
    isTagline: true,
  },

  // ── Tagline 3: "Standing up for Mid-Michigan Workers" ──
  // VO: "Thank you...for standing up" @ 20.76
  {
    line1: "Standing up for Mid-Michigan Workers",
    startFrame: f(20.76),
    endFrame: f(25.0),
    fontSize: 48,
    position: "center",
    isTagline: true,
  },
];

export const TEXT_OVERLAYS: TextOverlay[] = [];
export const CTA_PHASES: CTAPhase[] = [];

export const DISCLAIMER = {
  text: "Paid for by Public First Action (www.publicfirstus).\nNot authorized by any candidate or candidate\u2019s committee.\nPublic First Action is responsible for the content of this advertising.",
  startFrame: f(26.2),
  endFrame: f(30.0),
};