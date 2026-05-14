import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  Easing,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { SceneSequencer } from "./templates/SceneSequencer";
import { ElegantSerifReveal } from "./templates/ElegantSerifReveal";
import { CTABuild } from "./templates/CTABuild";
import { SCENES } from "./data/scenes";
import { SERIF_OVERLAYS, CTA_PHASES, DISCLAIMER } from "./data/overlays";
import { LAYERS } from "./data/layers";
import type { LayerDef } from "./data/layers";

import type { SerifOverlay } from "./data/overlays";

const FPS = 30;
const DURATION_FRAMES = 900;
const CTA_START = Math.round(25.10 * FPS);

/** Animate a single word — fade + upward drift + blur clear */
const AnimWord: React.FC<{
  word: string;
  startFrame: number;
  style: React.CSSProperties;
}> = ({ word, startFrame, style }) => {
  const frame = useCurrentFrame();
  const localF = frame - startFrame;

  const opacity = interpolate(localF, [0, 10], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const translateY = interpolate(localF, [0, 10], [12, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const blur = interpolate(localF, [0, 8], [2, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <span
      style={{
        display: "inline-block",
        opacity,
        transform: `translateY(${translateY}px)`,
        filter: `blur(${blur}px)`,
        marginRight: "0.3em",
        ...style,
      }}
    >
      {word}
    </span>
  );
};

/**
 * Persistent name with rotating italic taglines below.
 * Both name and taglines use word-by-word staggered reveal.
 * Name reveals once and stays. Taglines crossfade with word stagger on each new phrase.
 */
const NameWithTaglines: React.FC<{
  name: string;
  nameFontSize: number;
  taglines: SerifOverlay[];
  nameStartFrame: number;
  nameDuration: number;
}> = ({ name, nameFontSize, taglines, nameStartFrame, nameDuration }) => {
  const frame = useCurrentFrame(); // relative to Sequence start

  // Name exit fade
  const nameExit = interpolate(frame, [nameDuration - 15, nameDuration], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const nameWords = name.split(" ");
  const wordDelay = 4; // frames between each word

  // Find active tagline
  const absFrame = nameStartFrame + frame;
  const activeTagline = taglines.find(
    (t) => absFrame >= t.startFrame && absFrame < t.endFrame
  );

  let taglineWords: string[] = [];
  let taglineExitOpacity = 1;
  let taglineLocalFrame = 0;
  if (activeTagline) {
    taglineWords = activeTagline.line1.split(" ");
    taglineLocalFrame = absFrame - activeTagline.startFrame;
    const tagDuration = activeTagline.endFrame - activeTagline.startFrame;
    taglineExitOpacity = interpolate(taglineLocalFrame, [tagDuration - 15, tagDuration], [1, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
  }

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
      }}
    >
      {/* Single block: name + tagline, anchored at 72% from top (below face) */}
      <div
        style={{
          position: "absolute",
          top: "60%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Name */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", opacity: nameExit }}>
          {nameWords.map((word, i) => (
            <AnimWord
              key={word + i}
              word={word}
              startFrame={i * wordDelay + 8}
              style={{
                fontFamily: '"Helvetica Neue", "Helvetica", "Arial", sans-serif',
                fontSize: nameFontSize,
                fontWeight: 800,
                color: "#FFFFFF",
                textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)",
                letterSpacing: "0.01em",
              }}
            />
          ))}
        </div>

        {/* Tagline — fixed height so the name never shifts */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            opacity: taglineExitOpacity,
            height: 80,
            overflow: "hidden",
          }}
        >
        {taglineWords.map((word, i) => {
          // Tagline word should appear at: (tagline start - name start) + i * wordDelay + 8
          // In the Sequence's local frame space
          const tagRelStart = (activeTagline?.startFrame ?? 0) - nameStartFrame;
          const wordStart = tagRelStart + i * wordDelay + 8;
          return (
          <AnimWord
            key={word + i + (activeTagline?.startFrame ?? 0)}
            word={word}
            startFrame={wordStart}
            style={{
              fontFamily: '"Georgia", "Times New Roman", serif',
              fontSize: activeTagline?.fontSize ?? nameFontSize * 0.7,
              fontWeight: 400,
              fontStyle: "italic",
              color: "rgba(255,255,255,0.85)",
              textShadow: "0 2px 12px rgba(0,0,0,0.7), 0 0 4px rgba(0,0,0,0.5)",
              letterSpacing: "0.01em",
            }}
          />
          );
        })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export interface RivetAdProps {
  mutedLayers?: string[];
  dragEnabled?: boolean;
}

export const RivetAd: React.FC<RivetAdProps> = ({ mutedLayers = [] }) => {
  const frame = useCurrentFrame();
  const muted = new Set(mutedLayers);

  const sortedLayers = [...LAYERS]
    .filter((l) => l.enabled)
    .sort((a, b) => a.zOrder - b.zOrder);

  const masterDarken = 0.1;

  function renderLayer(layer: LayerDef) {
    if (muted.has(layer.id)) return null;

    switch (layer.id) {
      case "scenes":
        return (
          <AbsoluteFill key={layer.id} style={{ filter: `brightness(${1 - masterDarken})` }}>
            <SceneSequencer scenes={SCENES} />
          </AbsoluteFill>
        );

      case "warmGrade":
        return (
          <AbsoluteFill
            key={layer.id}
            style={{
              backgroundColor: "rgba(180, 120, 40, 1)",
              mixBlendMode: "soft-light",
              opacity: 0.07,
              pointerEvents: "none",
            }}
          />
        );

      case "textScrim":
        return null;

      case "text": {
        // Split overlays into regular, persistent name, and taglines
        const regular = SERIF_OVERLAYS.filter((o) => !o.persistentName && !o.isTagline);
        const persistentName = SERIF_OVERLAYS.find((o) => o.persistentName);
        const taglines = SERIF_OVERLAYS.filter((o) => o.isTagline);

        return (
          <AbsoluteFill key={layer.id} style={{ pointerEvents: "none" }}>
            {/* Regular overlays */}
            {regular.map((overlay, i) => {
              const duration = overlay.endFrame - overlay.startFrame;
              return (
                <Sequence key={`r-${i}`} from={overlay.startFrame} durationInFrames={duration}>
                  <ElegantSerifReveal
                    line1={overlay.line1}
                    line2={overlay.line2}
                    fontSize={overlay.fontSize ?? 64}
                    position={overlay.position ?? "center"}
                    duration={duration}
                    heavyFont={overlay.heavyFont}
                    wordDelays={overlay.wordDelays}
                  />
                </Sequence>
              );
            })}

            {/* Persistent name + rotating taglines — single stacked block */}
            {persistentName && (
              <Sequence from={persistentName.startFrame} durationInFrames={persistentName.endFrame - persistentName.startFrame}>
                <NameWithTaglines
                  name={persistentName.line1}
                  nameFontSize={persistentName.fontSize ?? 64}
                  taglines={taglines}
                  nameStartFrame={persistentName.startFrame}
                  nameDuration={persistentName.endFrame - persistentName.startFrame}
                />
              </Sequence>
            )}
          </AbsoluteFill>
        );
      }

      case "cta":
        return (
          <AbsoluteFill key={layer.id} style={{ pointerEvents: "none" }}>
            <CTABuild phases={CTA_PHASES} disclaimer={DISCLAIMER} />
          </AbsoluteFill>
        );

      case "music": {
        const baseVol = layer.volume ?? 0.2;
        return (
          <Sequence key={layer.id} from={0} durationInFrames={DURATION_FRAMES}>
            <Audio
              src={staticFile(layer.src!)}
              volume={(f) => {
                const fadeIn = interpolate(f, [0, Math.round(FPS * 0.15)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                const fadeOut = interpolate(f, [DURATION_FRAMES - FPS * 4, DURATION_FRAMES - FPS * 0.5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                return Math.min(fadeIn, fadeOut) * baseVol;
              }}
            />
          </Sequence>
        );
      }

      case "vo":
        return (
          <Sequence key={layer.id} from={0} durationInFrames={DURATION_FRAMES}>
            <Audio
              src={staticFile(layer.src!)}
              volume={layer.volume ?? 1.0}
            />
          </Sequence>
        );

      default:
        return null;
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {sortedLayers.map(renderLayer)}
    </AbsoluteFill>
  );
};