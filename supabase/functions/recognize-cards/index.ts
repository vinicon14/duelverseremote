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
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are an expert Yu-Gi-Oh! Trading Card Game card recognition system with extensive knowledge of all cards ever printed. Your task is to identify ALL Yu-Gi-Oh! cards visible in an image.

CRITICAL INSTRUCTIONS:
1. Examine the ENTIRE image carefully - look at all visible cards
2. Identify EVERY Yu-Gi-Oh! card you can see, even partially visible ones
3. For each card, provide its EXACT official English name
4. Pay attention to card artwork, text, and any identifying features
5. Include cards even if you can only see part of the artwork - use your knowledge to identify them
6. Look for cards in the background, stacked cards, or cards at angles

OUTPUT FORMAT:
- Return ONLY a valid JSON array of card names
- Each name must be the official English card name
- Example: ["Dark Magician", "Blue-Eyes White Dragon", "Pot of Greed", "Monster Reborn"]

RECOGNITION TIPS:
- Check for distinctive artwork elements
- Look at card borders (normal, effect, ritual, fusion, synchro, xyz, link, pendulum)
- Read any visible text on the cards
- Consider card frame colors and designs
- Identify archetypes from artwork patterns

If you cannot identify any cards, return an empty array: []`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Carefully examine this image and identify ALL Yu-Gi-Oh! cards visible. List every card you can recognize, even partial cards. Return the official English names as a JSON array."
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