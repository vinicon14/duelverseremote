/**
 * DuelVerse - TCG Switcher
 * 
 * Componente de troca rápida entre perfis TCG na navbar.
 */
import { useTcg, TcgType } from '@/contexts/TcgContext';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Swords, Sparkles, ChevronDown } from 'lucide-react';

const TCG_ICONS: Record<TcgType, React.ReactNode> = {
  yugioh: <Swords className="w-4 h-4" />,
  magic: <Sparkles className="w-4 h-4" />,
};

const TCG_NAMES: Record<TcgType, string> = {
  yugioh: 'YGO',
  magic: 'MTG',
};

export const TcgSwitcher = () => {
  const { activeTcg, profiles, switchProfile } = useTcg();
  const navigate = useNavigate();

  if (profiles.length <= 1) {
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        className="gap-1 text-xs"
        onClick={() => navigate('/profile-select')}
      >
        {TCG_ICONS[activeTcg]}
        {TCG_NAMES[activeTcg]}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs">
          {TCG_ICONS[activeTcg]}
          {TCG_NAMES[activeTcg]}
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {profiles.map(p => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => switchProfile(p.id)}
            className={p.tcg_type === activeTcg ? 'bg-primary/10' : ''}
          >
            {TCG_ICONS[p.tcg_type]}
            <span className="ml-2">{TCG_NAMES[p.tcg_type]}</span>
            <span className="ml-auto text-xs text-muted-foreground">{p.username}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => navigate('/profile-select')}>
          + Gerenciar perfis
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
