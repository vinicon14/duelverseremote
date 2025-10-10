import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, User } from "lucide-react";

interface NewsCardProps {
  news: {
    id: string;
    title: string;
    summary?: string;
    content: string;
    image_url?: string;
    created_at: string;
    author?: {
      username: string;
    };
  };
  onClick?: () => void;
}

export const NewsCard = ({ news, onClick }: NewsCardProps) => {
  return (
    <Card 
      className="card-mystic hover:border-primary/40 transition-all cursor-pointer"
      onClick={onClick}
    >
      {news.image_url && (
        <div className="w-full h-48 overflow-hidden rounded-t-lg">
          <img 
            src={news.image_url} 
            alt={news.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-xl text-gradient-mystic">
          {news.title}
        </CardTitle>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>{new Date(news.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
          {news.author && (
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" />
              <span>{news.author.username}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground line-clamp-3">
          {news.summary || news.content}
        </p>
      </CardContent>
    </Card>
  );
};
