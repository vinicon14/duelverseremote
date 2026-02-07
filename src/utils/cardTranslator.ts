/**
 * Serviço de tradução de cartas Yu-Gi-Oh!
 * Traduz nomes e descrições de cartas para português com sistema de cache otimizado
 */

// Mapa de traduções manuais para cartas comuns
const MANUAL_TRANSLATIONS: Record<string, { name: string; desc?: string }> = {};

// Cache de traduções com persistência
const translationCache = new Map<string, string>();
const pendingTranslations = new Map<string, Promise<string>>();

// LocalStorage cache para persistência entre sessões
const CACHE_KEY = 'cardTranslationCache';
const CACHE_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 dias

interface CacheEntry {
  value: string;
  timestamp: number;
}

// Carrega cache do localStorage ao iniciar
const loadCacheFromStorage = () => {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const cached = JSON.parse(stored);
      const now = Date.now();
      
      Object.entries(cached).forEach(([key, entry]: [string, any]) => {
        if (now - entry.timestamp < CACHE_TIMEOUT) {
          translationCache.set(key, entry.value);
        }
      });
    }
  } catch (error) {
    console.warn('Error loading cache from storage:', error);
  }
};

// Salva cache no localStorage
const saveCacheToStorage = () => {
  try {
    const cacheObj: Record<string, CacheEntry> = {};
    const now = Date.now();
    
    translationCache.forEach((value, key) => {
      cacheObj[key] = { value, timestamp: now };
    });
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj));
  } catch (error) {
    console.warn('Error saving cache to storage:', error);
  }
};

// Carrega cache ao módulo ser carregado
loadCacheFromStorage();

/**
 * Tenta traduzir o nome de uma carta usando MyMemory API com sistema de fila
 */
export const translateCardName = async (englishName: string, language: string = 'pt'): Promise<string> => {
  // If no name or target language is English, return original
  if (!englishName || language === 'en') return englishName;

  const cacheKey = `name:${englishName}:${language}`;
  
  // Verifica cache
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  // Se já existe uma requisição pendente, aguarda
  if (pendingTranslations.has(cacheKey)) {
    return pendingTranslations.get(cacheKey)!;
  }

  // Verifica se há tradução manual
  if (MANUAL_TRANSLATIONS[englishName]) {
    const translated = MANUAL_TRANSLATIONS[englishName].name;
    translationCache.set(cacheKey, translated);
    return translated;
  }

  // Cria promise de tradução
  const translationPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(englishName)}&langpair=en|${language}`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return englishName;
      }

      const data = await response.json();
      
      // Verifica se a tradução foi encontrada
      if (data.responseStatus === 200 && data.responseData.translatedText) {
        const translated = data.responseData.translatedText;
        // Evita traduções quebradas ou muito diferentes
        if (translated && translated.length > 0 && translated !== englishName) {
          translationCache.set(cacheKey, translated);
          saveCacheToStorage();
          return translated;
        }
      }

      translationCache.set(cacheKey, englishName);
      return englishName;
    } catch (error) {
      console.warn(`Erro ao traduzir "${englishName}":`, error);
      translationCache.set(cacheKey, englishName);
      return englishName;
    } finally {
      pendingTranslations.delete(cacheKey);
    }
  })();

  pendingTranslations.set(cacheKey, translationPromise);
  return translationPromise;
};

/**
 * Traduz descrição de carta usando MyMemory API
 */
export const translateCardDescription = async (
  englishDesc: string,
  language: string = 'pt'
): Promise<string> => {
  if (!englishDesc || language === 'en') {
    return englishDesc;
  }

  const cacheKey = `desc:${englishDesc.substring(0, 100)}:${language}`;

  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  if (pendingTranslations.has(cacheKey)) {
    return pendingTranslations.get(cacheKey)!;
  }

  const translationPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(englishDesc.substring(0, 500))}&langpair=en|${language}`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return englishDesc;
      }

      const data = await response.json();

      if (data.responseStatus === 200 && data.responseData.translatedText) {
        const translated = data.responseData.translatedText;
        translationCache.set(cacheKey, translated);
        saveCacheToStorage();
        return translated;
      }

      translationCache.set(cacheKey, englishDesc);
      return englishDesc;
    } catch (error) {
      console.warn(`Erro ao traduzir descrição:`, error);
      translationCache.set(cacheKey, englishDesc);
      return englishDesc;
    } finally {
      pendingTranslations.delete(cacheKey);
    }
  })();

  pendingTranslations.set(cacheKey, translationPromise);
  return translationPromise;
};

/**
 * Traduz com cache
 */
export const translateWithCache = async (
  text: string,
  language: string = 'pt',
  isDescription: boolean = false
): Promise<string> => {
  return isDescription
    ? await translateCardDescription(text, language)
    : await translateCardName(text, language);
};

/**
 * Traduz campos de texto comuns em cartas
 */
export const translateCardFields = async (
  cardData: {
    type?: string;
    race?: string;
    attribute?: string;
  },
  language: string = 'pt'
): Promise<{
  type?: string;
  race?: string;
  attribute?: string;
}> => {
  if (language === 'en') {
    return cardData;
  }

  const fieldTranslations: Record<string, Record<string, string>> = {
    type: {
      'Effect Monster': 'Monstro de Efeito',
      'Flip Effect Monster': 'Monstro de Efeito Virado',
      'Fusion Monster': 'Monstro de Fusão',
      'Link Monster': 'Monstro Link',
      'Normal Monster': 'Monstro Normal',
      'Pendulum Effect Monster': 'Monstro de Efeito Pêndulo',
      'Pendulum Normal Monster': 'Monstro Normal Pêndulo',
      'Ritual Effect Monster': 'Monstro de Efeito Ritual',
      'Ritual Monster': 'Monstro Ritual',
      'Spell Card': 'Carta de Magia',
      'Spirit Monster': 'Monstro Espírito',
      'Synchro Monster': 'Monstro Sincro',
      'Synchro Pendulum Effect Monster': 'Monstro de Efeito Sincro Pêndulo',
      'Trap Card': 'Carta de Armadilha',
      'Tuner Monster': 'Monstro Sintonizador',
      'XYZ Monster': 'Monstro XYZ',
      'XYZ Pendulum Effect Monster': 'Monstro de Efeito XYZ Pêndulo',
      'Token': 'Ficha',
    },
    attribute: {
      'DARK': 'ESCURO',
      'LIGHT': 'CLARO',
      'EARTH': 'TERRA',
      'WATER': 'ÁGUA',
      'FIRE': 'FOGO',
      'WIND': 'VENTO',
      'DIVINE': 'DIVINO',
    },
    race: {
      'Aqua': 'Aqua',
      'Beast': 'Besta',
      'Beast-Warrior': 'Guerreiro Besta',
      'Creator-God': 'Deus Criador',
      'Cyberse': 'Cyberse',
      'Dinosaur': 'Dinossauro',
      'Divine-Beast': 'Besta Divina',
      'Dragon': 'Dragão',
      'Fairy': 'Féada',
      'Fiend': 'Demônio',
      'Fish': 'Peixe',
      'Illusion': 'Ilusão',
      'Insect': 'Inseto',
      'Machine': 'Máquina',
      'Plant': 'Planta',
      'Psychic': 'Psíquico',
      'Pyro': 'Piro',
      'Reptile': 'Réptil',
      'Rock': 'Rocha',
      'Sea Serpent': 'Serpente do Mar',
      'Spellcaster': 'Mago',
      'Thunder': 'Trovão',
      'Warrior': 'Guerreiro',
      'Winged Beast': 'Besta Alada',
      'Wyrm': 'Wyrm',
      'Zombie': 'Zumbi',
    },
  };

  return {
    type: cardData.type
      ? fieldTranslations.type[cardData.type] || cardData.type
      : cardData.type,
    race: cardData.race
      ? fieldTranslations.race[cardData.race] || cardData.race
      : cardData.race,
    attribute: cardData.attribute
      ? fieldTranslations.attribute[cardData.attribute] || cardData.attribute
      : cardData.attribute,
  };
};
