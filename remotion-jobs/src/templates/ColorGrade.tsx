import React from "react";
import { AbsoluteFill } from "remotion";
import type { ColorPreset } from "../types";

interface ColorGradeProps {
  preset?: ColorPreset;
  intensity?: number;
  children: React.ReactNode;
}

const PRESETS: Record<
  ColorPreset,
  {
    filter: string;
    overlayColor: string;
    overlayBlend: string;
    overlayOpacity: number;
    secondaryColor?: string;
    secondaryBlend?: string;
    secondaryOpacity?: number;
  }
> = {
  // Warm golden — pastoral open, aerial farm, family
  champion: {
    filter: "contrast(1.06) saturate(1.12) brightness(1.05)",
    overlayColor: "rgba(180, 130, 50, 1)",
    overlayBlend: "soft-light",
    overlayOpacity: 0.10,
    secondaryColor: "rgba(255, 220, 160, 1)",
    secondaryBlend: "soft-light",
    secondaryOpacity: 0.08,
  },
  // Warm natural — default district footage
  hometown: {
    filter: "contrast(1.04) saturate(1.06) brightness(1.01)",
    overlayColor: "rgba(160, 100, 30, 1)",
    overlayBlend: "soft-light",
    overlayOpacity: 0.09,
    secondaryColor: "rgba(42, 31, 20, 1)",
    secondaryBlend: "multiply",
    secondaryOpacity: 0.07,
  },
  // Cool blue-green — industry, stakes, tension
  fighter: {
    filter: "contrast(1.15) saturate(1.05) brightness(0.97)",
    overlayColor: "rgba(10, 10, 31, 1)",
    overlayBlend: "multiply",
    overlayOpacity: 0.10,
    secondaryColor: "rgba(0, 120, 160, 1)",
    secondaryBlend: "soft-light",
    secondaryOpacity: 0.10,
  },
  // Gritty documentary
  outsider: {
    filter: "contrast(1.15) saturate(0.85) brightness(0.97)",
    overlayColor: "rgba(10, 10, 30, 1)",
    overlayBlend: "multiply",
    overlayOpacity: 0.12,
  },
  // Neutral balanced — factory, authentic
  maverick: {
    filter: "contrast(1.08) saturate(1.02) brightness(1.01)",
    overlayColor: "rgba(30, 26, 22, 1)",
    overlayBlend: "multiply",
    overlayOpacity: 0.06,
  },
  // Minimal — CTA, clean
  basic: {
    filter: "contrast(1.04) saturate(1.05) brightness(1.03)",
    overlayColor: "rgba(160, 120, 50, 1)",
    overlayBlend: "soft-light",
    overlayOpacity: 0.06,
  },
};

export const ColorGrade: React.FC<ColorGradeProps> = ({
  preset = "hometown",
  intensity = 0.6,
  children,
}) => {
  const p = PRESETS[preset] ?? PRESETS.hometown;

  const scaledFilter = p.filter.replace(
    /(\w+)\(([\d.]+)\)/g,
    (_, fn, val) => {
      const v = parseFloat(val);
      const scaled = 1.0 + (v - 1.0) * intensity;
      return `${fn}(${scaled.toFixed(3)})`;
    }
  );

  const overlayOpacity = p.overlayOpacity * intensity;
  const secondaryOpacity = (p.secondaryOpacity ?? 0) * intensity;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: scaledFilter }}>{children}</AbsoluteFill>
      <AbsoluteFill
        style={{
          backgroundColor: p.overlayColor,
          mixBlendMode: p.overlayBlend as React.CSSProperties["mixBlendMode"],
          opacity: overlayOpacity,
          pointerEvents: "none",
        }}
      />
      {p.secondaryColor && secondaryOpacity > 0 && (
        <AbsoluteFill
          style={{
            backgroundColor: p.secondaryColor,
            mixBlendMode: (p.secondaryBlend ??
              "soft-light") as React.CSSProperties["mixBlendMode"],
            opacity: secondaryOpacity,
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};
