import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, ChevronDown, Plus, Minus, Trash2, Undo2, Hand } from 'lucide-react';

interface PokemonFieldCard {
  id: string;
  instanceId: string;
  name: string;
  images: { small: string; large: string };
  supertype: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  energyAttached: number;
  damageCounters: number;
  isFaceDown?: boolean;
  attacks?: { name: string; damage: string; text: string; cost: string[] }[];
  abilities?: { name: string; text: string; type: string }[];
  rules?: string[];
}

interface PkmCardActionModalProps {
  card: PokemonFieldCard;
  zone: 'hand' | 'active' | 'bench' | 'discard' | 'deck' | null;
  fieldState: { active: PokemonFieldCard | null };
  onClose: () => void;
  onAttachEnergy: (card: PokemonFieldCard, zone: 'active' | 'bench') => void;
  onDetachEnergy: (card: PokemonFieldCard, zone: 'active' | 'bench') => void;
  onAddDamage: (card: PokemonFieldCard, zone: 'active' | 'bench', amount: number) => void;
  onDiscard: (card: PokemonFieldCard, from: 'hand' | 'active' | 'bench') => void;
  onReturnToDeck: (card: PokemonFieldCard, from: 'hand' | 'active' | 'bench' | 'discard', position: 'top' | 'bottom' | 'shuffle') => void;
  onReturnToHand: (card: PokemonFieldCard, from: 'active' | 'bench' | 'discard') => void;
  onPlayToActive: (card: PokemonFieldCard) => void;
  onPlayToBench: (card: PokemonFieldCard) => void;
  onActivateTrainer: (card: PokemonFieldCard) => void;
  onPromoteToActive: (card: PokemonFieldCard) => void;
}

export const PkmCardActionModal = ({
  card,
  zone,
  fieldState,
  onClose,
  onAttachEnergy,
  onDetachEnergy,
  onAddDamage,
  onDiscard,
  onReturnToDeck,
  onReturnToHand,
  onPlayToActive,
  onPlayToBench,
  onActivateTrainer,
  onPromoteToActive,
}: PkmCardActionModalProps) => {
  const [showEffect, setShowEffect] = useState(false);

  const hasEffect = (card.attacks && card.attacks.length > 0) ||
    (card.abilities && card.abilities.length > 0) ||
    (card.rules && card.rules.length > 0);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <img src={card.images.large || card.images.small} alt={card.name} className="w-full rounded-lg" />
        <p className="text-sm font-bold text-center">{card.name}</p>

        {/* HP and Types - like ATK/DEF */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {card.hp && (
            <Badge variant="outline" className="text-xs font-bold">
              HP {card.hp}
            </Badge>
          )}
          {card.types?.map(t => (
            <Badge key={t} className="text-xs bg-accent/20 text-accent-foreground border-0">{t}</Badge>
          ))}
          {card.supertype && (
            <Badge variant="secondary" className="text-xs">{card.supertype}</Badge>
          )}
        </div>

        {/* Read Effect toggle like YGO */}
        {hasEffect && (
          <>
            {!showEffect ? (
              <Button onClick={() => setShowEffect(true)} variant="default" className="w-full" size="sm">
                <BookOpen className="h-4 w-4 mr-2" />
                Ler Efeito
              </Button>
            ) : (
              <>
                {/* Abilities */}
                {card.abilities && card.abilities.length > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">HABILIDADES</p>
                    {card.abilities.map((a, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-bold text-primary">{a.name}</span>
                        <span className="text-muted-foreground ml-1">({a.type})</span>
                        <p className="text-muted-foreground">{a.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Attacks */}
                {card.attacks && card.attacks.length > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">ATAQUES</p>
                    {card.attacks.map((a, i) => (
                      <div key={i} className="text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-bold">{a.name}</span>
                          {a.damage && <Badge variant="destructive" className="text-[10px] h-4 px-1">{a.damage}</Badge>}
                        </div>
                        {a.text && <p className="text-muted-foreground">{a.text}</p>}
                        {a.cost?.length > 0 && (
                          <p className="text-[10px] text-muted-foreground">Custo: {a.cost.join(', ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Rules */}
                {card.rules && card.rules.length > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-semibold text-muted-foreground">REGRAS</p>
                    {card.rules.map((r, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{r}</p>
                    ))}
                  </div>
                )}

                <Button onClick={() => setShowEffect(false)} variant="outline" className="w-full" size="sm">
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Esconder Efeito
                </Button>
              </>
            )}
          </>
        )}

        {/* Energy & Damage for active/bench */}
        {(zone === 'active' || zone === 'bench') && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground text-center">Energia: {card.energyAttached}</p>
              <div className="flex gap-1 justify-center">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { onAttachEnergy(card, zone); onClose(); }}>
                  <Plus className="w-3 h-3 mr-0.5" />⚡
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { onDetachEnergy(card, zone); onClose(); }}>
                  <Minus className="w-3 h-3 mr-0.5" />⚡
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground text-center">Dano: {card.damageCounters * 10}</p>
              <div className="flex gap-1 justify-center">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAddDamage(card, zone, 1)}>
                  <Plus className="w-3 h-3" />10
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAddDamage(card, zone, -1)}>
                  <Minus className="w-3 h-3" />10
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap justify-center">
          {zone === 'active' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => { onReturnToHand(card, 'active'); onClose(); }}>
                <Hand className="w-3 h-3 mr-1" />Mão
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { onDiscard(card, 'active'); onClose(); }}>
                <Trash2 className="w-3 h-3 mr-1" />Descartar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { onReturnToDeck(card, 'active', 'shuffle'); onClose(); }}>
                <Undo2 className="w-3 h-3 mr-1" />Devolver
              </Button>
            </>
          )}
          {zone === 'bench' && (
            <>
              <Button size="sm" onClick={() => { onPromoteToActive(card); onClose(); }}>
                Promover a Ativo
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { onReturnToHand(card, 'bench'); onClose(); }}>
                <Hand className="w-3 h-3 mr-1" />Mão
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { onDiscard(card, 'bench'); onClose(); }}>
                <Trash2 className="w-3 h-3 mr-1" />Descartar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { onReturnToDeck(card, 'bench', 'shuffle'); onClose(); }}>
                <Undo2 className="w-3 h-3 mr-1" />Devolver
              </Button>
            </>
          )}
          {zone === 'hand' && (
            <>
              {card.supertype === 'Pokémon' && (
                <>
                  <Button size="sm" onClick={() => { onPlayToActive(card); onClose(); }}>Ativo</Button>
                  <Button size="sm" variant="outline" onClick={() => { onPlayToBench(card); onClose(); }}>Banco</Button>
                </>
              )}
              {card.supertype === 'Trainer' && (
                <Button size="sm" onClick={() => { onActivateTrainer(card); onClose(); }}>
                  Ativar Treinador
                </Button>
              )}
              {card.supertype === 'Energy' && fieldState.active && (
                <Button size="sm" onClick={() => { onAttachEnergy(card, 'active'); onClose(); }}>
                  ⚡ Ativo
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={() => { onDiscard(card, 'hand'); onClose(); }}>
                <Trash2 className="w-3 h-3 mr-1" />Descartar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { onReturnToDeck(card, 'hand', 'shuffle'); onClose(); }}>
                <Undo2 className="w-3 h-3 mr-1" />Devolver
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
