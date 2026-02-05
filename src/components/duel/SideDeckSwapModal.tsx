 import { useState, useMemo } from 'react';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
 import { ArrowLeftRight, Check, RefreshCcw, Sparkles, Layers } from 'lucide-react';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { cn } from '@/lib/utils';
 import { GameCard } from './DuelFieldBoard';
 
 const EXTRA_DECK_TYPES = ['Fusion', 'Synchro', 'XYZ', 'Link'];
 
 const isExtraDeckCard = (card: GameCard): boolean => {
   return EXTRA_DECK_TYPES.some((t) => card.type.includes(t));
 };
 
 interface SideDeckSwapModalProps {
   open: boolean;
   onClose: () => void;
   mainDeck: GameCard[];
   extraDeck: GameCard[];
   sideDeck: GameCard[];
   onSwapComplete: (newMainDeck: GameCard[], newExtraDeck: GameCard[], newSideDeck: GameCard[]) => void;
 }
 
 export const SideDeckSwapModal = ({
   open,
   onClose,
   mainDeck,
   extraDeck,
   sideDeck,
   onSwapComplete,
 }: SideDeckSwapModalProps) => {
   const [selectedFromMain, setSelectedFromMain] = useState<Set<string>>(new Set());
   const [selectedFromExtra, setSelectedFromExtra] = useState<Set<string>>(new Set());
   const [selectedFromSide, setSelectedFromSide] = useState<Set<string>>(new Set());
   const [activeTab, setActiveTab] = useState<'main' | 'extra'>('main');
 
   const totalSelected = selectedFromMain.size + selectedFromExtra.size;
   const canSwap = totalSelected > 0 && totalSelected === selectedFromSide.size;
 
   const handleMainCardClick = (card: GameCard) => {
     setSelectedFromMain(prev => {
       const next = new Set(prev);
       if (next.has(card.instanceId)) {
         next.delete(card.instanceId);
       } else {
         next.add(card.instanceId);
       }
       return next;
     });
   };
 
   const handleExtraCardClick = (card: GameCard) => {
     setSelectedFromExtra(prev => {
       const next = new Set(prev);
       if (next.has(card.instanceId)) {
         next.delete(card.instanceId);
       } else {
         next.add(card.instanceId);
       }
       return next;
     });
   };
 
   const handleSideCardClick = (card: GameCard) => {
     setSelectedFromSide(prev => {
       const next = new Set(prev);
       if (next.has(card.instanceId)) {
         next.delete(card.instanceId);
       } else {
         next.add(card.instanceId);
       }
       return next;
     });
   };
 
   const handleSwap = () => {
     if (!canSwap) return;
 
     const mainCardsMovingToSide = mainDeck.filter(c => selectedFromMain.has(c.instanceId));
     const extraCardsMovingToSide = extraDeck.filter(c => selectedFromExtra.has(c.instanceId));
     const sideCardsSelected = sideDeck.filter(c => selectedFromSide.has(c.instanceId));
     
     const sideCardsToMain = sideCardsSelected.filter(c => !isExtraDeckCard(c));
     const sideCardsToExtra = sideCardsSelected.filter(c => isExtraDeckCard(c));
 
     const newMainDeck = [
       ...mainDeck.filter(c => !selectedFromMain.has(c.instanceId)),
       ...sideCardsToMain,
     ];
     const newExtraDeck = [
       ...extraDeck.filter(c => !selectedFromExtra.has(c.instanceId)),
       ...sideCardsToExtra,
     ];
     const newSideDeck = [
       ...sideDeck.filter(c => !selectedFromSide.has(c.instanceId)),
       ...mainCardsMovingToSide,
       ...extraCardsMovingToSide,
     ];
 
     onSwapComplete(newMainDeck, newExtraDeck, newSideDeck);
     handleReset();
     onClose();
   };
 
   const handleReset = () => {
     setSelectedFromMain(new Set());
     setSelectedFromExtra(new Set());
     setSelectedFromSide(new Set());
   };
 
   const handleClose = () => {
     handleReset();
     onClose();
   };
 
   const groupedMainDeck = useMemo(() => {
     const map = new Map<number, GameCard[]>();
     mainDeck.forEach(card => {
       if (!map.has(card.id)) {
         map.set(card.id, []);
       }
       map.get(card.id)!.push(card);
     });
     return Array.from(map.entries());
   }, [mainDeck]);
 
   const groupedExtraDeck = useMemo(() => {
     const map = new Map<number, GameCard[]>();
     extraDeck.forEach(card => {
       if (!map.has(card.id)) {
         map.set(card.id, []);
       }
       map.get(card.id)!.push(card);
     });
     return Array.from(map.entries());
   }, [extraDeck]);
 
   const groupedSideDeck = useMemo(() => {
     const map = new Map<number, GameCard[]>();
     sideDeck.forEach(card => {
       if (!map.has(card.id)) {
         map.set(card.id, []);
       }
       map.get(card.id)!.push(card);
     });
     return Array.from(map.entries());
   }, [sideDeck]);
 
   return (
     <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
       <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <ArrowLeftRight className="h-5 w-5 text-primary" />
             Troca de Side Deck
           </DialogTitle>
           <DialogDescription>
             Selecione cartas do Main/Extra Deck e do Side Deck para trocar.
           </DialogDescription>
         </DialogHeader>
 
         <div className="flex items-center justify-center gap-2 sm:gap-4 py-2 bg-muted/30 rounded-lg flex-wrap">
           <Badge variant={selectedFromMain.size > 0 ? "default" : "outline"} className="gap-1 text-xs">
             Main: {selectedFromMain.size}
           </Badge>
           <Badge variant={selectedFromExtra.size > 0 ? "default" : "outline"} className="gap-1 text-xs">
             Extra: {selectedFromExtra.size}
           </Badge>
           <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
           <Badge variant={selectedFromSide.size > 0 ? "default" : "outline"} className="gap-1 text-xs">
             Side: {selectedFromSide.size}
           </Badge>
           {canSwap && (
             <Badge variant="secondary" className="bg-primary/20 text-primary gap-1 text-xs">
               <Check className="h-3 w-3" />
               Pronto
             </Badge>
           )}
         </div>
 
         <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
           <div className="flex flex-col border rounded-lg overflow-hidden">
             <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'main' | 'extra')} className="flex flex-col h-full">
               <TabsList className="w-full grid grid-cols-2 rounded-none">
                 <TabsTrigger value="main" className="gap-1 text-xs">
                   <Layers className="h-3 w-3" />
                   Main ({mainDeck.length})
                 </TabsTrigger>
                 <TabsTrigger value="extra" className="gap-1 text-xs">
                   <Sparkles className="h-3 w-3" />
                   Extra ({extraDeck.length})
                 </TabsTrigger>
               </TabsList>
               <TabsContent value="main" className="flex-1 mt-0 overflow-hidden">
                 <ScrollArea className="h-[180px] sm:h-[250px] p-2">
                   <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
                     {groupedMainDeck.map(([, cards]) => (
                       cards.map((card) => (
                         <div
                           key={card.instanceId}
                           className={cn(
                             "relative cursor-pointer rounded-sm overflow-hidden border-2 transition-all",
                             selectedFromMain.has(card.instanceId)
                               ? "border-primary ring-2 ring-primary/50 scale-95"
                               : "border-transparent hover:border-muted-foreground/30"
                           )}
                           onClick={() => handleMainCardClick(card)}
                         >
                           <img
                             src={card.card_images?.[0]?.image_url_small}
                             alt={card.name}
                             title={card.name}
                             className="w-full h-auto"
                           />
                           {selectedFromMain.has(card.instanceId) && (
                             <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                               <Check className="h-6 w-6 text-primary" />
                             </div>
                           )}
                         </div>
                       ))
                     ))}
                     {mainDeck.length === 0 && (
                       <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                         Deck vazio
                       </p>
                     )}
                   </div>
                 </ScrollArea>
               </TabsContent>
               <TabsContent value="extra" className="flex-1 mt-0 overflow-hidden">
                 <ScrollArea className="h-[180px] sm:h-[250px] p-2">
                   <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
                     {groupedExtraDeck.map(([, cards]) => (
                       cards.map((card) => (
                         <div
                           key={card.instanceId}
                           className={cn(
                             "relative cursor-pointer rounded-sm overflow-hidden border-2 transition-all",
                             selectedFromExtra.has(card.instanceId)
                               ? "border-primary ring-2 ring-primary/50 scale-95"
                               : "border-transparent hover:border-muted-foreground/30"
                           )}
                           onClick={() => handleExtraCardClick(card)}
                         >
                           <img
                             src={card.card_images?.[0]?.image_url_small}
                             alt={card.name}
                             title={card.name}
                             className="w-full h-auto"
                           />
                           {selectedFromExtra.has(card.instanceId) && (
                             <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                               <Check className="h-6 w-6 text-primary" />
                             </div>
                           )}
                         </div>
                       ))
                     ))}
                     {extraDeck.length === 0 && (
                       <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                         Extra Deck vazio
                       </p>
                     )}
                   </div>
                 </ScrollArea>
               </TabsContent>
             </Tabs>
           </div>
 
           <div className="flex flex-col border rounded-lg overflow-hidden">
             <div className="p-2 bg-muted/50 border-b flex items-center justify-between">
               <span className="text-sm font-medium">Side Deck</span>
               <Badge variant="outline">{sideDeck.length} cartas</Badge>
             </div>
             <ScrollArea className="h-[180px] sm:h-[250px] p-2">
               <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
                 {groupedSideDeck.map(([, cards]) => (
                   cards.map((card) => (
                     <div
                       key={card.instanceId}
                       className={cn(
                         "relative cursor-pointer rounded-sm overflow-hidden border-2 transition-all",
                         selectedFromSide.has(card.instanceId)
                           ? "border-primary ring-2 ring-primary/50 scale-95"
                           : "border-transparent hover:border-muted-foreground/30"
                       )}
                       onClick={() => handleSideCardClick(card)}
                     >
                       <img
                         src={card.card_images?.[0]?.image_url_small}
                         alt={card.name}
                         title={card.name}
                         className="w-full h-auto"
                       />
                       {selectedFromSide.has(card.instanceId) && (
                         <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                           <Check className="h-6 w-6 text-primary" />
                         </div>
                       )}
                     </div>
                   ))
                 ))}
                 {sideDeck.length === 0 && (
                   <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                     Side Deck vazio
                   </p>
                 )}
               </div>
             </ScrollArea>
           </div>
         </div>
 
         <DialogFooter className="flex-row gap-2">
           <Button variant="outline" onClick={handleReset} className="gap-1">
             <RefreshCcw className="h-4 w-4" />
             Limpar
           </Button>
           <Button variant="outline" onClick={handleClose}>
             Cancelar
           </Button>
           <Button 
             onClick={handleSwap} 
             disabled={!canSwap}
             className="gap-1"
           >
             <ArrowLeftRight className="h-4 w-4" />
             Trocar ({totalSelected})
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 };