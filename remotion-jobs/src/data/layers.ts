/**
 * Layer manifest — defines the composition stack for RivetAd.
 *
 * Each layer has:
 *   id:        Unique identifier (used by solo/mute UI and Claude edits)
 *   type:      "video" | "audio" | "text" | "overlay" | "grade"
 *   label:     Human-readable name shown in the layer panel
 *   component: Which component renders this layer (for reference)
 *   enabled:   Whether the layer is active in the composition
 *   zOrder:    Render order (lower = further back)
 *
 * RivetAd.tsx reads this and renders dynamically.
 * Claude can add, remove, reorder, or toggle layers by editing this file.
 * The editor's solo/mute UI reads from this same list.
 */

export interface LayerDef {
  id: string;
  type: "video" | "audio" | "text" | "overlay" | "grade";
  label: string;
  component: string;
  enabled: boolean;
  zOrder: number;
  /** For audio layers: the source file path */
  src?: string;
  /** For audio layers: base volume (0-1) */
  volume?: number;
}

export const LAYERS: LayerDef[] = [
  {
    id: "scenes",
    type: "video",
    label: "Video Clips",
    component: "SceneSequencer",
    enabled: true,
    zOrder: 0,
  },
  {
    id: "warmGrade",
    type: "grade",
    label: "Warm Grade",
    component: "WarmGradeOverlay",
    enabled: true,
    zOrder: 1,
  },
  {
    id: "textScrim",
    type: "overlay",
    label: "Text Scrim",
    component: "TextScrimOverlay",
    enabled: true,
    zOrder: 2,
  },
  {
    id: "text",
    type: "text",
    label: "On-Screen Text",
    component: "WordRevealLayer",
    enabled: true,
    zOrder: 3,
  },
  {
    id: "cta",
    type: "text",
    label: "CTA End Card",
    component: "CTABuild",
    enabled: true,
    zOrder: 4,
  },
  {
    id: "music",
    type: "audio",
    label: "Music Bed",
    component: "Audio",
    enabled: true,
    zOrder: 5,
    src: "audio/hopeful-alt.wav",
    volume: 0.2,
  },
  {
    id: "vo",
    type: "audio",
    label: "Voiceover",
    component: "Audio",
    enabled: true,
    zOrder: 6,
    src: "audio/vo.wav",
    volume: 1.0,
  },
];
