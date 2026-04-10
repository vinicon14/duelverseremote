/**
 * DuelVerse - TCG Switcher / Badge
 * Admins can switch between TCGs. Regular users see a static badge.
 */
import { useTcg, TcgType } from '@/contexts/TcgContext';
import { useAdmin } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Swords, Sparkles, Zap } from 'lucide-react';

const TCG_ICONS: Record<TcgType, React.ReactNode> = {
  yugioh: <Swords className="w-4 h-4" />,
  magic: <Sparkles className="w-4 h-4" />,
  pokemon: <Zap className="w-4 h-4" />,
};

const TCG_NAMES: Record<TcgType, string> = {
  yugioh: 'YGO',
  magic: 'MTG',
  pokemon: 'PKM',
};

const TCG_FULL_NAMES: Record<TcgType, string> = {
  yugioh: 'Yu-Gi-Oh!',
  magic: 'Magic: The Gathering',
  pokemon: 'Pokémon TCG',
};

const ALL_TCGS: TcgType[] = ['yugioh', 'magic', 'pokemon'];

export const TcgSwitcher = () => {
  const { activeTcg, setActiveTcg } = useTcg();
  const { isAdmin } = useAdmin();

  // Regular users: static badge
  if (!isAdmin) {
    return (
      <Button variant="ghost" size="sm" className="gap-1 text-xs pointer-events-none">
        {TCG_ICONS[activeTcg]}
        {TCG_NAMES[activeTcg]}
      </Button>
    );
  }

  // Admins: dropdown switcher
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs">
          {TCG_ICONS[activeTcg]}
          {TCG_NAMES[activeTcg]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ALL_TCGS.map((tcg) => (
          <DropdownMenuItem
            key={tcg}
            onClick={() => setActiveTcg(tcg)}
            className={activeTcg === tcg ? 'bg-accent' : ''}
          >
            <span className="mr-2">{TCG_ICONS[tcg]}</span>
            {TCG_FULL_NAMES[tcg]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
