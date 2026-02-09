/**
 * Traduz efeitos de cartas Yu-Gi-Oh de inglês para português
 * Usa API Google Translate ou dicionário local para termos específicos
 */

// Dicionário de termos específicos do Yu-Gi-Oh
const yugiohTerms: Record<string, string> = {
  // Tipos de cartas
  'Fusion Monster': 'Monstro Fusão',
  'Synchro Monster': 'Monstro Sincro',
  'XYZ Monster': 'Monstro XYZ',
  'Link Monster': 'Monstro Link',
  'Ritual Monster': 'Monstro Ritual',
  'Pendulum Monster': 'Monstro Pêndulo',
  'Tuner Monster': 'Monstro Sincronizador',
  'Effect Monster': 'Monstro de Efeito',
  'Normal Monster': 'Monstro Normal',
  'Spell Card': 'Carta Mágica',
  'Trap Card': 'Carta Armadilha',
  'Quick-Play Spell': 'Mágica de Ativação Rápida',
  'Continuous Spell': 'Mágica Contínua',
  'Equip Spell': 'Mágica de Equipamento',
  'Field Spell': 'Mágica de Campo',
  'Normal Trap': 'Armadilha Normal',
  'Continuous Trap': 'Armadilha Contínua',
  'Counter Trap': 'Armadilha Contra',

  // Mecânicas
  'Special Summon': 'Invocar Especialmente',
  'Normal Summon': 'Invocar Normalmente',
  'Synchro Summon': 'Invocar por Sincronização',
  'XYZ Summon': 'Invocar por XYZ',
  'Link Summon': 'Invocar por Link',
  'Fusion Summon': 'Invocar por Fusão',
  'Ritual Summon': 'Invocar por Ritual',
  'Pendulum Summon': 'Invocar por Pêndulo',
  'excavate': 'escavar',
  'shuffle': 'embaralhar',
  'draw': 'sacar',
  'target': 'alvo',
  'tribute': 'tributo',
  'banish': 'banir',
  'send to Graveyard': 'enviar ao Cemitério',
  'destroy': 'destruir',
  'negate': 'negar',
  'declare': 'declarar',
  'select': 'selecionar',
  'your opponent': 'seu oponente',
  'this card': 'esta carta',
  'this card name': 'o nome desta carta',
  'once per turn': 'uma vez por turno',
  'once per turn (Quick Effect)': 'uma vez por turno (Efeito Rápido)',
  'Unaffected by': 'Não é afetado(a) por',
  'Cannot be': 'Não pode ser',
  'cannot attack': 'não pode atacar',
  'cannot be used as': 'não pode ser usado(a) como',
  'instead': 'em vez disso',
  'also': 'também',
  'and if it does': 'e se o fizer',
  'Conditions': 'Condições',
  'Cost': 'Custo',
  'Effect': 'Efeito',
  'Activation requirement': 'Requisito de Ativação',

  // Atributos
  'DARK': 'ESCURO',
  'LIGHT': 'CLARO',
  'EARTH': 'TERRA',
  'WATER': 'ÁGUA',
  'FIRE': 'FOGO',
  'WIND': 'VENTO',
  'DIVINE': 'DIVINO',

  // Tipos
  'Warrior': 'Guerreiro',
  'Spellcaster': 'Mago',
  'Fairy': 'Fada',
  'Fiend': 'Criatura Demoníaca',
  'Zombie': 'Zumbi',
  'Machine': 'Máquina',
  'Aqua': 'Aquático',
  'Pyro': 'Piromancia',
  'Rock': 'Rochoso',
  'Winged Beast': 'Besta Alada',
  'Plant': 'Planta',
  'Insect': 'Inseto',
  'Thunder': 'Trovão',
  'Dragon': 'Dragão',
  'Beast': 'Besta',
  'Beast-Warrior': 'Guerreiro-Besta',
  'Dinosaur': 'Dinossauro',
  'Fish': 'Peixe',
  'Sea Serpent': 'Serpente Marinha',
  'Reptile': 'Réptil',
  'Cyberse': 'Cibersé',
  'Creator God': 'Criador Divino',
  'Illusion': 'Ilusionista',
  'Expression': 'Expressão',
};

const commonPhrases: Record<string, string> = {
  'activate this effect only once per turn': 'ative apenas uma vez por turno',
  'activate this card effect': 'ative o efeito desta carta',
  'the owner of this card': 'o proprietário desta carta',
  'you can only use the (1)': 'você só pode usar o (1)',
  'you can only use the (2)': 'você só pode usar o (2)',
  'you can only use the (3)': 'você só pode usar o (3)',
  'effect of': 'efeito de',
  'this first (1)': 'este primeiro (1)',
  'this second (2)': 'este segundo (2)',
  'discard 1 card': 'descarte 1 carta',
  'discard cards': 'descarte cartas',
  'send to the graveyard': 'envie ao cemitério',
  'cannot activate': 'não pode ativar',
  'neither player': 'nenhum jogador',
  'player can': 'jogador pode',
  'during your': 'durante sua',
  'during the': 'durante o',
  'during': 'durante',
  'summon': 'invoque',
  'is summoned': 'for invocado(a)',
  'equip': 'equipe',
  'equipped': 'equipado(a)',
  'reveal': 'revele',
  'check': 'verifique',
  'search your deck': 'procure em seu deck',
  'add to your hand': 'adicione à sua mão',
  'increase': 'aumente',
  'decrease': 'diminua',
  'damage': 'dano',
  'monster can': 'monstro pode',
  'battle damage': 'dano de batalha',
};

// Traduções de nomes de cartas (catálogo básico)
export const cardNameTranslations: Record<string, string> = {
  'Circle of the Fire Kings': 'Círculo dos Reis de Fogo',
  'Onslaught of the Fire Kings': 'Investida dos Reis de Fogo',
};

export const translateCardName = (name: string | undefined): string => {
  if (!name) return '';
  for (const [eng, pt] of Object.entries(cardNameTranslations)) {
    const regex = new RegExp(`^${eng}$`, 'i');
    if (regex.test(name)) return pt;
  }
  return name;
};

/**
 * Traduz um efeito de carta usando dicionário local
 * Para traduções mais complexas, seria necessário usar uma API de tradução
 */
export const translateCardEffect = (effect: string | undefined): string => {
  if (!effect) return 'Sem efeito disponível';

  let translated = effect;

  // Substituir termos específicos do Yu-Gi-Oh
  for (const [eng, pt] of Object.entries(yugiohTerms)) {
    const regex = new RegExp(`\\b${eng}\\b`, 'gi');
    translated = translated.replace(regex, pt);
  }

  // Substituir frases comuns
  for (const [eng, pt] of Object.entries(commonPhrases)) {
    const regex = new RegExp(eng, 'gi');
    translated = translated.replace(regex, pt);
  }

  return translated;
};

/**
 * Retorna uma versão simplificada do efeito com quebras de linha
 */
export const formatCardEffect = (effect: string | undefined): string => {
  if (!effect) return 'Sem efeito disponível';

  // Adicionar quebras de linha antes de números numerados (1), (2), etc
  let formatted = effect.replace(/\] (?=\()/g, ']\n\n');
  
  // Adicionar quebras de linha antes de maiúsculas após pontos
  formatted = formatted.replace(/\. ([A-Z])/g, '.\n\n$1');

  return formatted;
};

/**
 * Detecta se o efeito é muito longo e precisa de scroll
 */
export const isEffectLong = (effect: string | undefined): boolean => {
  if (!effect) return false;
  return effect.length > 300; // Mais de 300 caracteres é considerado longo
};

/**
 * Traduz e formata o efeito da carta com todas as características
 */
export const processCardEffect = (effect: string | undefined) => {
  const translated = translateCardEffect(effect);
  const formatted = formatCardEffect(translated);
  const isLong = isEffectLong(translated);

  return {
    text: formatted,
    original: effect || '',
    isLong,
    length: translated.length,
  };
};
