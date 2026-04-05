/**
 * DuelVerse - Edge Function: Reconhecer Cartas
 * Desenvolvido por Vinícius
 * 
 * Utiliza Google Gemini API diretamente para reconhecer cartas Yu-Gi-Oh! a partir de imagens.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log("Starting card recognition with Gemini...");

    // Extract base64 data and mime type
    let base64Data = imageBase64;
    let mimeType = "image/jpeg";
    if (imageBase64.startsWith("data:")) {
      const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are the world's leading expert on Yu-Gi-Oh! Trading Card Game. Identify EVERY Yu-Gi-Oh! card visible in this image.

IDENTIFICATION TECHNIQUES:
1. ARTWORK ANALYSIS: Study each card's unique artwork
2. CARD FRAME: Normal=Yellow, Effect=Orange, Ritual=Blue, Fusion=Purple, Synchro=White, XYZ=Black, Link=Blue arrows, Pendulum=Split, Spell=Teal, Trap=Magenta
3. TEXT READING: Read any visible card name text
4. ATTRIBUTE SYMBOLS: Fire, Water, Earth, Wind, Light, Dark, Divine
5. LEVEL/RANK STARS: Count stars for identification

RULES:
- List EVERY card, even if only 50% visible
- Use OFFICIAL ENGLISH card names
- If multiple copies, list once
- For unclear cards, make best educated guess

OUTPUT: Return ONLY a JSON array of official English card names.
Example: ["Dark Magician", "Blue-Eyes White Dragon", "Polymerization"]
If no cards identifiable, return: []`
                },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      throw new Error("Failed to analyze image");
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    // Parse the JSON array from the response
    let cardNames: string[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        cardNames = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse card names:", parseError);
      cardNames = [];
    }

    console.log(`Recognized ${cardNames.length} card names:`, cardNames);

    // Fetch card data from YGOProdeck API
    const cardPromises = cardNames.map(async (cardName: string) => {
      try {
        let cardResponse = await fetch(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(cardName)}`
        );
        
        if (cardResponse.ok) {
          const cardInfo = await cardResponse.json();
          if (cardInfo.data?.length > 0) {
            return cardInfo.data[0];
          }
        }
        
        cardResponse = await fetch(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(cardName)}`
        );
        
        if (cardResponse.ok) {
          const cardInfo = await cardResponse.json();
          if (cardInfo.data?.length > 0) {
            const lowerName = cardName.toLowerCase();
            const bestMatch = cardInfo.data.find((c: any) => 
              c.name.toLowerCase() === lowerName
            ) || cardInfo.data.find((c: any) => 
              c.name.toLowerCase().includes(lowerName) || lowerName.includes(c.name.toLowerCase())
            ) || cardInfo.data[0];
            return bestMatch;
          }
        }
        
        return null;
      } catch (cardError) {
        console.error(`Failed to fetch card: ${cardName}`, cardError);
        return null;
      }
    });

    const cardResults = await Promise.all(cardPromises);
    const cardData = cardResults.filter((card): card is NonNullable<typeof card> => card !== null);
    console.log(`Successfully fetched ${cardData.length} cards`);

    return new Response(
      JSON.stringify({ 
        recognizedNames: cardNames,
        cards: cardData 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in recognize-cards:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
