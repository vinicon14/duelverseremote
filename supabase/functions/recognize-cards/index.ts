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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use Gemini Pro with vision capabilities to recognize Yu-Gi-Oh! cards
    console.log("Starting card recognition...");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are the world's leading expert on Yu-Gi-Oh! Trading Card Game with complete knowledge of ALL 12,000+ cards ever printed including OCG, TCG, anime-only, and promotional cards.

YOUR MISSION: Identify EVERY SINGLE Yu-Gi-Oh! card visible in this image. Do not miss any card.

IMPORTANT - This is likely a NERON APP screenshot:
- Neuron shows deck lists in a specific format
- Look for card names in list format, usually on the left side
- Card quantities may appear on the right (x1, x2, x3, etc.)
- Main deck cards at top, Extra deck below, Side deck at bottom
- Even small text or icons you can identify count as cards

IDENTIFICATION TECHNIQUES:
1. ARTWORK ANALYSIS: Study each card's unique artwork, monsters, spell/trap imagery
2. CARD FRAME: Identify card type by frame color:
   - Normal Monster = Yellow/Tan
   - Effect Monster = Orange  
   - Ritual Monster = Blue
   - Fusion Monster = Purple
   - Synchro Monster = White
   - XYZ Monster = Black with rank stars
   - Link Monster = Blue with arrows
   - Pendulum = Split frame with scales
   - Spell = Teal/Green
   - Trap = Magenta/Pink
3. TEXT READING: Read any visible card name text, even partial
4. ATTRIBUTE SYMBOLS: Fire, Water, Earth, Wind, Light, Dark, Divine
5. LEVEL/RANK STARS: Count stars for identification
6. ARCHETYPE PATTERNS: Recognize card family art styles (Blue-Eyes, Dark Magician, Elemental HERO, etc.)

CRITICAL RULES:
- List EVERY card you can identify, even if only 50% visible
- Use OFFICIAL ENGLISH card names (not Japanese/OCG names)
- If you see multiple copies of the same card, list it ONCE
- Include cards in hands, on table, in background, at angles
- For unclear cards, make your best educated guess based on visible features

OUTPUT: Return ONLY a JSON array of official English card names.
Example: ["Dark Magician", "Blue-Eyes White Dragon", "Polymerization", "Mirror Force"]

If absolutely no cards are identifiable, return: []`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Examine this image very carefully. Identify ALL Yu-Gi-Oh! cards you can see. Look at the entire image including edges, background, and partially visible cards. For each card, provide its official English name. Return your answer as a JSON array."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to analyze image");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    
    // Parse the JSON array from the response
    let cardNames: string[] = [];
    try {
      // Extract JSON array from response (handle cases where AI adds extra text)
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        cardNames = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse card names:", parseError);
      cardNames = [];
    }

    console.log(`Recognized ${cardNames.length} card names:`, cardNames);

    // Fetch card data from YGOProdeck API for each recognized card using parallel requests
    const cardPromises = cardNames.map(async (cardName: string) => {
      try {
        // First try exact name match
        let cardResponse = await fetch(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(cardName)}`
        );
        
        if (cardResponse.ok) {
          const cardInfo = await cardResponse.json();
          if (cardInfo.data && cardInfo.data.length > 0) {
            console.log(`Found exact match for: ${cardName}`);
            return cardInfo.data[0];
          }
        }
        
        // If exact match fails, try fuzzy search
        console.log(`Exact match failed for "${cardName}", trying fuzzy search...`);
        cardResponse = await fetch(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(cardName)}`
        );
        
        if (cardResponse.ok) {
          const cardInfo = await cardResponse.json();
          if (cardInfo.data && cardInfo.data.length > 0) {
            // Find best match - prioritize exact substring match
            const lowerName = cardName.toLowerCase();
            const bestMatch = cardInfo.data.find((c: any) => 
              c.name.toLowerCase() === lowerName
            ) || cardInfo.data.find((c: any) => 
              c.name.toLowerCase().includes(lowerName) || lowerName.includes(c.name.toLowerCase())
            ) || cardInfo.data[0];
            
            console.log(`Fuzzy match for "${cardName}" -> "${bestMatch.name}"`);
            return bestMatch;
          }
        }
        
        console.log(`No match found for: ${cardName}`);
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