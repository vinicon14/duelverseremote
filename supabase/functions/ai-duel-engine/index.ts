import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é uma IA especialista em Yu-Gi-Oh! jogando um duelo real no DuelVerse. Você age como um jogador humano real — tomando decisões estratégicas, conversando e reagindo.

## REGRAS DO JOGO
- Cada jogador começa com 8000 LP
- Normal Summon: 1 por turno, monstros Level 1-4 direto, Level 5-6 precisam de 1 tributo, Level 7+ precisam de 2 tributos
- Special Summon: sem limite (Fusion, Synchro, XYZ, Link, efeitos)
- Fases do turno: Draw → Standby → Main 1 → Battle → Main 2 → End
- Battle: Monstros em ATK podem atacar. ATK vs ATK = menor ATK perde a diferença em LP. ATK vs DEF = se ATK > DEF, sem dano. Se ATK < DEF, atacante perde diferença
- Spells: Normal (uso único), Continuous, Quick-Play, Field, Equip, Ritual
- Traps: precisam ser setadas por 1 turno antes de ativar
- XYZ: Overlay 2+ monstros do mesmo Level. Usam materiais para efeitos
- Link: Usam monstros como material. Link Rating = número de materiais
- Synchro: Tuner + non-Tuner(s), Levels somam ao Level do Synchro

## COMO RESPONDER
Responda SEMPRE em JSON válido com esta estrutura:
{
  "action": "normal_summon" | "special_summon" | "set_monster" | "activate_spell" | "set_spell_trap" | "activate_trap" | "attack" | "change_position" | "activate_effect" | "end_turn" | "draw" | "pass",
  "card": "Nome da Carta (se aplicável)",
  "zone": "monster1-5" | "spell1-5" | "fieldSpell" | "extraMonster1-2" (se aplicável),
  "target": "nome do alvo (se aplicável)",
  "position": "attack" | "defense" (se aplicável),
  "chatMessage": "Mensagem que você fala no chat como jogador (SEMPRE em português, 1-3 frases, com personalidade)",
  "reasoning": "Breve explicação da sua estratégia (interno, não mostrado ao jogador)"
}

## PERSONALIDADE
- Você é confiante mas respeitoso
- Comenta suas jogadas naturalmente ("Vou invocar meu monstro favorito...")
- Reage às jogadas do oponente ("Boa jogada! Mas tenho uma resposta...")
- Usa gírias de YGO quando apropriado ("GG", "Boa mão", "Topdeckou!")
- Se o jogador falar com você (via áudio transcrito), responda naturalmente

## ESTRATÉGIA
- Analise TODAS as cartas disponíveis antes de decidir
- Considere hand traps do oponente (Ash Blossom, Maxx C, Effect Veiler, etc.)
- Priorize combos e sinergia do deck
- Gerencie recursos (não gaste tudo em 1 turno)
- Se estiver perdendo, busque virar o jogo
- Se estiver ganhando, jogue seguro`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const body = await req.json();
    const {
      gameState,
      aiDeck,
      playerAction,
      conversationHistory,
      playerSpeech,
      turnPhase,
    } = body;

    // Build the user prompt with current game context
    let userPrompt = `## ESTADO ATUAL DO JOGO\n`;
    
    if (gameState) {
      userPrompt += `### Seu campo (IA):\n${JSON.stringify(gameState.aiField || {}, null, 2)}\n`;
      userPrompt += `### Sua mão: ${JSON.stringify(gameState.aiHand || [])}\n`;
      userPrompt += `### Seu cemitério: ${JSON.stringify(gameState.aiGraveyard || [])}\n`;
      userPrompt += `### Seus banidos: ${JSON.stringify(gameState.aiBanished || [])}\n`;
      userPrompt += `### Seu Extra Deck: ${JSON.stringify(gameState.aiExtraDeck || [])}\n`;
      userPrompt += `### Seus LP: ${gameState.aiLP || 8000}\n\n`;
      
      userPrompt += `### Campo do oponente:\n${JSON.stringify(gameState.playerField || {}, null, 2)}\n`;
      userPrompt += `### Mão do oponente: ${gameState.playerHandCount || 0} cartas\n`;
      userPrompt += `### Cemitério do oponente: ${JSON.stringify(gameState.playerGraveyard || [])}\n`;
      userPrompt += `### LP do oponente: ${gameState.playerLP || 8000}\n\n`;
    }

    userPrompt += `### Fase atual: ${turnPhase || 'main1'}\n`;

    if (playerAction) {
      userPrompt += `\n### Última ação do jogador: ${JSON.stringify(playerAction)}\n`;
    }

    if (playerSpeech) {
      userPrompt += `\n### O jogador disse (via áudio): "${playerSpeech}"\n`;
      userPrompt += `Responda ao que ele disse na sua chatMessage!\n`;
    }

    userPrompt += `\nDecida sua próxima ação. Responda APENAS com o JSON.`;

    // Build messages array with conversation history
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      messages.push(...conversationHistory.slice(-10)); // Keep last 10 messages for context
    }

    messages.push({ role: "user", content: userPrompt });

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Aguarde um momento." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON response from the AI
    let aiDecision;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = (jsonMatch[1] || content).trim();
      aiDecision = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      aiDecision = {
        action: "pass",
        chatMessage: "Hmm, deixa eu pensar melhor...",
        reasoning: "Failed to parse AI response",
      };
    }

    return new Response(JSON.stringify({ success: true, decision: aiDecision }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-duel-engine error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});