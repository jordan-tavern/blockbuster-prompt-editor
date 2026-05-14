import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

const FONT_FAMILY = '"Avenir Next", "Avenir", "Helvetica Neue", sans-serif';
const FPS = 30;

interface CTABuildProps {
  phases: any[];
  disclaimer?: {
    text: string;
    startFrame: number;
    endFrame: number;
  };
}

const f = (seconds: number) => Math.round(seconds * FPS);

// Timing synced to JOBS VO
const BLOCK_START = f(25.10);
const RULE_START = f(26.50);
const PHONE_START = f(27.08);  // "office" in VO

/**
 * Static fade-in component — only changes opacity, no movement
 */
const StaticFadeIn: React.FC<{
  startFrame: number;
  children: React.ReactNode;
  duration?: number;
}> = ({ startFrame, children, duration = 30 }) => {
  const frame = useCurrentFrame();

  // Always render children to preserve layout — only change opacity
  const opacity = frame < startFrame ? 0 : interpolate(
    frame - startFrame,
    [0, duration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div style={{ opacity }}>
      {children}
    </div>
  );
};

export const CTABuild: React.FC<CTABuildProps> = ({ disclaimer }) => {
  const frame = useCurrentFrame();

  if (frame < BLOCK_START) return null;

  // Calculate opacity for the main text block manually for complete control
  const textOpacity = frame >= BLOCK_START ? interpolate(
    frame - BLOCK_START,
    [0, 45],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  ) : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center", // Center everything horizontally
        pointerEvents: "none",
      }}
    >
      {/* Fixed CTA container - centered, anchored 25% from bottom */}
      <div
        style={{
          position: "absolute",
          bottom: "25%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Stage 1: Call block - completely static, only opacity change */}
        <div
          style={{
            opacity: textOpacity,
            fontFamily: FONT_FAMILY,
            fontSize: 56,
            fontWeight: 300,
            color: "#FFFFFF",
            textTransform: "uppercase",
            textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)",
            letterSpacing: "0.06em",
            lineHeight: 1.35,
            textAlign: "center",
          }}
        >
          Call Congresswoman McDonald Rivet's Office
        </div>

        {/* Rule — gentle fade */}
        <StaticFadeIn startFrame={RULE_START} duration={30}>
          <div
            style={{
              width: 400,
              height: 1,
              backgroundColor: "rgba(255,255,255,0.4)",
              marginTop: 24,
              marginBottom: 24,
              margin: "0 auto",
            }}
          />
        </StaticFadeIn>

        {/* Stage 2: Phone number — static positioning */}
        <StaticFadeIn startFrame={PHONE_START} duration={30}>
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 64,
              fontWeight: 300,
              color: "#FFFFFF",
              textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)",
              letterSpacing: "0.10em",
              lineHeight: 1.2,
              textAlign: "center",
            }}
          >
            202-225-3611
          </div>
        </StaticFadeIn>
      </div>

      {/* Disclaimer - Fixed at bottom with proper spacing */}
      {disclaimer && frame >= disclaimer.startFrame && (() => {
        const elapsed = frame - disclaimer.startFrame;
        const opacity = interpolate(
          elapsed,
          [0, 60],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        return (
          <div
            style={{
              position: "absolute",
              bottom: "4%", // Fixed distance from bottom
              left: "5%",
              right: "5%",
              fontFamily: FONT_FAMILY,
              fontSize: 16,
              fontWeight: 300,
              color: "rgba(255,255,255,0.7)",
              lineHeight: 1.4,
              whiteSpace: "pre-line",
              textAlign: "center",
              opacity: opacity,
            }}
          >
            {disclaimer.text}
          </div>
        );
      })()}
    </div>
  );
};