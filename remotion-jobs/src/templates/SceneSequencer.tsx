import React, { useEffect } from "react";
import {
  useCurrentFrame,
  interpolate,
  staticFile,
  AbsoluteFill,
  Video,
  OffthreadVideo,
  Sequence,
  random,
  Easing,
  useRemotionEnvironment,
  prefetch,
} from "remotion";
import type { Scene, ClipGrade } from "../types";

const DISSOLVE_FRAMES = 10;
const PRELOAD_FRAMES = 60; // preload next clip 2 seconds ahead

type KenBurnsMotion = "zoom_in" | "zoom_out" | "pan_left" | "pan_right";

function getMotion(sceneIndex: number): KenBurnsMotion {
  const motions: KenBurnsMotion[] = [
    "zoom_in",
    "zoom_out",
    "pan_left",
    "pan_right",
  ];
  const r = random(`kb-${sceneIndex}`);
  return motions[Math.floor(r * motions.length)];
}

function resolveMotion(
  scene: Scene,
  sceneIndex: number
): KenBurnsMotion | null {
  if (scene.kenBurns === "none") return null;
  if (scene.kenBurns && scene.kenBurns !== "auto")
    return scene.kenBurns as KenBurnsMotion;
  return getMotion(sceneIndex);
}

function getKenBurnsStyle(
  frame: number,
  segDuration: number,
  motion: KenBurnsMotion | null
): React.CSSProperties {
  if (!motion) return {};

  const progress = interpolate(frame / Math.max(segDuration, 1), [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const amount = 0.08; // Subtle for this ad style
  const panRange = 2;

  switch (motion) {
    case "zoom_in":
      return { transform: `scale(${1.0 + progress * amount})` };
    case "zoom_out":
      return { transform: `scale(${1.0 + amount - progress * amount})` };
    case "pan_left":
      return {
        transform: `scale(${1.0 + amount}) translateX(${progress * -panRange}%)`,
      };
    case "pan_right":
      return {
        transform: `scale(${1.0 + amount}) translateX(${progress * panRange}%)`,
      };
  }
}

const VideoSegment: React.FC<{
  src: string;
  segDuration: number;
  motion: KenBurnsMotion | null;
  startFrom?: number;
}> = ({ src, segDuration, motion, startFrom }) => {
  const frame = useCurrentFrame();
  const { isPlayer } = useRemotionEnvironment();
  const VideoComponent = isPlayer ? Video : OffthreadVideo;
  const kbStyle = getKenBurnsStyle(frame, segDuration, motion);

  const video = (
    <VideoComponent
      src={staticFile(src)}
      startFrom={startFrom ?? 0}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        ...kbStyle,
      }}
      muted
    />
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {video}
      <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />
    </AbsoluteFill>
  );
};

interface SceneSequencerProps {
  scenes: Scene[];
}

export const SceneSequencer: React.FC<SceneSequencerProps> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const { isPlayer } = useRemotionEnvironment();

  // In the Player, prefetch upcoming clips so transitions are seamless
  useEffect(() => {
    if (!isPlayer) return;
    const cleanups: (() => void)[] = [];
    for (const scene of scenes) {
      if (scene.startFrame - PRELOAD_FRAMES <= frame && frame < scene.endFrame) {
        // Prefetch this and the next scene
        const idx = scenes.indexOf(scene);
        for (let j = idx; j <= Math.min(idx + 2, scenes.length - 1); j++) {
          const { free } = prefetch(staticFile(scenes[j].src));
          cleanups.push(free);
        }
        break;
      }
    }
    return () => cleanups.forEach((fn) => fn());
  }, [frame, scenes]);

  if (scenes.length === 0) return null;

  // In the Player, keep all videos mounted to avoid mount/unmount decoder stalls.
  // Use opacity to show/hide instead of Sequence unmounting.
  if (isPlayer) {
    return (
      <>
        {scenes.map((scene, i) => {
          const segDuration = scene.endFrame - scene.startFrame;
          const isActive = frame >= scene.startFrame && frame < scene.endFrame;
          // Also keep the previous scene visible during dissolve
          const isFirst = i === 0;
          const inDissolve = isFirst && i + 1 < scenes.length &&
            frame >= scenes[i + 1].startFrame &&
            frame < scenes[i + 1].startFrame + DISSOLVE_FRAMES;

          const visible = isActive || inDissolve;
          const motion = resolveMotion(scene, i);

          const g = scene.grade;
          const filter = g
            ? `brightness(${g.brightness ?? 1}) contrast(${g.contrast ?? 1}) saturate(${g.saturate ?? 1}) sepia(${g.sepia ?? 0})`
            : undefined;

          // Cross-dissolve opacity for second scene
          const isCrossfadeTarget = i === 1;
          let opacity = visible ? 1 : 0;
          if (isCrossfadeTarget && isActive) {
            const localFrame = frame - scene.startFrame;
            opacity = interpolate(localFrame, [0, DISSOLVE_FRAMES], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
          }

          return (
            <AbsoluteFill
              key={i}
              style={{
                opacity,
                pointerEvents: visible ? "auto" : "none",
                // Keep mounted but invisible — browser keeps decoder alive
                ...(filter ? { filter } : {}),
              }}
            >
              <Sequence from={scene.startFrame} layout="none">
                <VideoSegment
                  src={scene.src}
                  segDuration={segDuration}
                  motion={motion}
                  startFrom={scene.startFrom}
                />
              </Sequence>
            </AbsoluteFill>
          );
        })}
      </>
    );
  }

  // Headless renderer: use standard Sequence mounting (OffthreadVideo handles decoding)
  return (
    <>
      {scenes.map((scene, i) => {
        const isFirst = i === 0;
        const segDuration = isFirst
          ? scene.endFrame - scene.startFrame + DISSOLVE_FRAMES
          : scene.endFrame - scene.startFrame;

        const motion = resolveMotion(scene, i);
        const segment = (
          <VideoSegment
            src={scene.src}
            segDuration={segDuration}
            motion={motion}
            startFrom={scene.startFrom}
          />
        );

        const g = scene.grade;
        const filter = g
          ? `brightness(${g.brightness ?? 1}) contrast(${g.contrast ?? 1}) saturate(${g.saturate ?? 1}) sepia(${g.sepia ?? 0})`
          : undefined;

        const graded = filter ? (
          <AbsoluteFill style={{ filter }}>{segment}</AbsoluteFill>
        ) : (
          segment
        );

        const isCrossfadeTarget = i === 1;
        if (isCrossfadeTarget) {
          return (
            <Sequence key={i} from={scene.startFrame} durationInFrames={scene.endFrame - scene.startFrame}>
              <CrossfadeIn durationFrames={DISSOLVE_FRAMES}>{graded}</CrossfadeIn>
            </Sequence>
          );
        }

        return (
          <Sequence key={i} from={scene.startFrame} durationInFrames={segDuration}>
            {graded}
          </Sequence>
        );
      })}
    </>
  );
};

const CrossfadeIn: React.FC<{
  durationFrames: number;
  children: React.ReactNode;
}> = ({ durationFrames, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
