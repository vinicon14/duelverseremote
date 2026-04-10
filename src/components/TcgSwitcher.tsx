/**
 * DuelVerse - TCG Badge (static display)
 * Shows the user's active TCG as a static badge. No switching.
 */
import { useTcg, TcgType } from '@/contexts/TcgContext';
import { Button } from '@/components/ui/button';
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

export const TcgSwitcher = () => {
  const { activeTcg } = useTcg();

  return (
    <Button variant="ghost" size="sm" className="gap-1 text-xs pointer-events-none">
      {TCG_ICONS[activeTcg]}
      {TCG_NAMES[activeTcg]}
    </Button>
  );
};
