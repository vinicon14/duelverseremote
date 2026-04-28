import { GoogleAd } from "./GoogleAd";

interface GoogleAdBannerProps {
  slot: string;
  className?: string;
}

export const GoogleAdBanner = ({ slot, className = "" }: GoogleAdBannerProps) => {
  return (
    <div className={`w-full flex justify-center my-4 ${className}`}>
      <GoogleAd 
        slot={slot}
        format="auto"
        style={{ display: "block", minHeight: "90px" }}
      />
    </div>
  );
};
