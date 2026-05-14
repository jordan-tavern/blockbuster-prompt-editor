/// <reference types="vite/client" />

declare module "@video/data/scenes.ts" {
  export const SCENES: Array<{ src: string; startFrame: number; endFrame: number; label?: string }>;
}

declare module "@video/data/overlays.ts" {
  export const TEXT_OVERLAYS: Array<{ startFrame: number; endFrame: number; words: Array<{ text: string }> }>;
}

declare module "@video/data/layers.ts" {
  export type LayerDef = {
    id: string;
    type: string;
    label?: string;
    enabled?: boolean;
    zOrder?: number;
    [key: string]: unknown;
  };
  export const LAYERS: LayerDef[];
}

declare module "@video/RivetAd.tsx" {
  import type { FC } from "react";
  export const RivetAd: FC<any>;
}
