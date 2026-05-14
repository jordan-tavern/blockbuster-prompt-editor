import type { Scene } from "../types";

const FPS = 30;
const f = (seconds: number) => Math.round(seconds * FPS);

/**
 * JOBS variant v2 — boss feedback applied:
 *   - CUT farm_field_wide (second scene)
 *   - CUT empty_rural_road (fourth scene)
 *   - CUT C-SPAN (too blurry) — replaced with general-4 (playground)
 *   - CUT general-5 (one less gratitude b-roll for breathing room)
 *   - Redistributed time to remaining clips
 */
export const SCENES: Scene[] = [
  // ═══ Beat 1: Hook — "Built by people who work with their hands" (0–3.2s) ═══
  // Fewer clips, each holds longer — more breathing room
  {
    src: "broll/sunset_farmland.mp4",
    startFrame: f(0),
    endFrame: f(1.4),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 0.94, contrast: 1.06, saturate: 1.10, sepia: 0.06 },
    faceZone: "none",
    label: "Aerial sunset farmland",
  },
  {
    src: "broll/manufacturing_floor.mp4",
    startFrame: f(1.4),
    endFrame: f(4.2),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 0.94, contrast: 1.06, saturate: 1.05, sepia: 0.06 },
    faceZone: "none",
    label: "Manufacturing floor",
  },

  // ═══ Beat 2: Sectors (4.2–7.0s) ═══
  {
    src: "broll/doctor_with_patient.mp4",
    startFrame: f(4.2),
    endFrame: f(5.0),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 0.82, contrast: 1.06, saturate: 1.06, sepia: 0.08 },
    faceZone: "upper",
    label: "Doctor — Healthcare",
  },
  {
    src: "broll/community_garden.mp4",
    startFrame: f(5.0),
    endFrame: f(7.0),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 0.94, contrast: 1.06, saturate: 1.10, sepia: 0.10 },
    faceZone: "center",
    label: "Garden — Farming",
  },

  // ═══ Beat 3: Stakes (7.0–11.0s) ═══
  {
    src: "broll/factory_floor_workers.mp4",
    startFrame: f(7.0),
    endFrame: f(9.0),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 1.10, contrast: 1.10, saturate: 1.06, sepia: 0.08 },
    faceZone: "none",
    label: "Drill press — Manufacturing",
  },
  {
    src: "broll/working_family.mp4",
    startFrame: f(9.0),
    endFrame: f(11.0),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 1.0, contrast: 1.06, saturate: 1.06, sepia: 0.06 },
    faceZone: "upper",
    label: "Working family",
  },

  // ═══ Beat 4: Candidate (11.0–13.5s) — general-4 replaces C-SPAN ═══
  {
    src: "candidate/general-4.mp4",
    startFrame: f(11.0),
    endFrame: f(13.5),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 1.04, contrast: 1.06, saturate: 1.06, sepia: 0.06 },
    faceZone: "upper",
    label: "KMR at playground with family",
  },

  // ═══ Beat 5: Factory proof (13.5–20.2s) ═══
  {
    src: "candidate/workers-1.mp4",
    startFrame: f(13.5),
    endFrame: f(15.5),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 0.96, contrast: 1.06, saturate: 1.06, sepia: 0.08 },
    faceZone: "none",
    label: "WIDE: Factory floor walk",
  },
  {
    src: "candidate/workers-2.mp4",
    startFrame: f(15.5),
    endFrame: f(17.5),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 1.06, contrast: 1.08, saturate: 1.06, sepia: 0.08 },
    faceZone: "upper",
    label: "MEDIUM: Talking to workers",
  },
  {
    src: "candidate/workers-3.mp4",
    startFrame: f(17.5),
    endFrame: f(18.8),
    type: "video",
    kenBurns: "pan_right",
    grade: { brightness: 0.96, contrast: 1.06, saturate: 1.06, sepia: 0.08 },
    faceZone: "upper",
    label: "Walking warehouse",
  },
  {
    src: "candidate/workers-4.mp4",
    startFrame: f(18.8),
    endFrame: f(20.2),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 1.12, contrast: 1.08, saturate: 1.04, sepia: 0.12 },
    faceZone: "upper",
    label: "Lab/tech space",
  },

  // ═══ Beat 6: Gratitude (20.2–25.1s) — cut general-5, more room to breathe ═══
  {
    src: "candidate/seniors-1.mp4",
    startFrame: f(20.2),
    endFrame: f(22.0),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 1.02, contrast: 1.06, saturate: 1.06, sepia: 0.06 },
    faceZone: "upper",
    label: "KMR with seniors",
  },
  {
    src: "candidate/general-2.mp4",
    startFrame: f(22.0),
    endFrame: f(25.1),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 0.86, contrast: 1.06, saturate: 1.08, sepia: 0.06 },
    faceZone: "upper",
    label: "Main street conversation",
  },

  // ═══ Beat 7: CTA (25.1–29.1s) ═══
  {
    src: "candidate/general-1.mp4",
    startFrame: f(25.1),
    endFrame: f(30.0),
    type: "video",
    kenBurns: "zoom_in",
    grade: { brightness: 1.04, contrast: 1.06, saturate: 1.06, sepia: 0.06 },
    faceZone: "right",
    label: "Porch conversation — CTA",
  },
];

