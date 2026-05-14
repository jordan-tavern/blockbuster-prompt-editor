import { Composition } from "remotion";
import { RivetAd } from "./RivetAd";

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="RivetAd"
        component={RivetAd}
        durationInFrames={900}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ mutedLayers: [] }}
      />
    </>
  );
};
