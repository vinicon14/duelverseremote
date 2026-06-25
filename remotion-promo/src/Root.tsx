import { Composition } from "remotion";
import { Video1 } from "./Video1";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="video1"
      component={Video1}
      durationInFrames={690}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
