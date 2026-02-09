import { Newspaper } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface NewsSidebarProps {
  news: any[];
  onNewsSelect: (news: any) => void;
}

export function NewsSidebar({ news, onNewsSelect }: NewsSidebarProps) {
  return (
    <Sidebar className="border-l">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary" />
            Notícias
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-8rem)]">
              <SidebarMenu>
                {news.length > 0 ? (
                  news.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton 
                        onClick={() => onNewsSelect(item)}
                        className="h-auto py-3 flex-col items-start gap-2"
                      >
                        {item.image_url && (
                          <div className="w-full h-24 overflow-hidden rounded">
                            <img 
                              src={item.image_url} 
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="w-full">
                          <div className="font-semibold text-sm line-clamp-2 mb-1">
                            {item.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleDateString('pt-BR')}
                          </div>
                          {item.author && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {item.author.username}
                            </Badge>
                          )}
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                ) : (
                  <div className="text-center py-8 px-4 text-muted-foreground text-sm">
                    <Newspaper className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma notícia disponível</p>
                  </div>
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
