import { Composition } from "remotion";
import { Video1 } from "./Video1";
import { PromoVideo, CONFIGS } from "./PromoVideo";
import { Vertical15 } from "./Vertical15";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="video1" component={Video1} durationInFrames={690} fps={30} width={1920} height={1080} />
    {(["video2", "video3", "video4", "video5"] as const).map((id) => (
      <Composition
        key={id}
        id={id}
        component={PromoVideo}
        durationInFrames={690}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ cfg: CONFIGS[id] }}
      />
    ))}
    <Composition id="vertical15" component={Vertical15} durationInFrames={450} fps={30} width={1080} height={1920} />
  </>
);
