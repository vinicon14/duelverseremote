import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

interface AdBannerProps {
  ad: {
    id: string;
    title: string;
    content: string;
    image_url?: string;
    link_url?: string;
  };
}

export const AdBanner = ({ ad }: AdBannerProps) => {
  const handleClick = () => {
    if (ad.link_url) {
      window.open(ad.link_url, '_blank');
    }
  };

  const imageUrl = ad.image_url || '/placeholder.svg';

  return (
    <Card 
      className={`border-2 border-secondary/30 ${ad.link_url ? 'cursor-pointer hover:border-secondary/60 transition-all' : ''}`}
      onClick={handleClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <img
            src={imageUrl}
            alt={ad.title}
            className="w-24 h-24 object-cover rounded"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = '/placeholder.svg';
            }}
          />
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-lg">{ad.title}</h3>
              {ad.link_url && (
                <ExternalLink className="w-4 h-4 text-secondary" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">{ad.content}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
