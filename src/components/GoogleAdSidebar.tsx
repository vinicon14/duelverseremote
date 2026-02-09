import { GoogleAd } from "./GoogleAd";

interface GoogleAdSidebarProps {
  slot: string;
  className?: string;
}

export const GoogleAdSidebar = ({ slot, className = "" }: GoogleAdSidebarProps) => {
  return (
    <div className={`w-full ${className}`}>
      <GoogleAd 
        slot={slot}
        format="vertical"
        style={{ display: "block", minWidth: "160px", minHeight: "600px" }}
      />
    </div>
  );
};
