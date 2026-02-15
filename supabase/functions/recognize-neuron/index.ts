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
    const { neuronLink } = await req.json();
    
    if (!neuronLink) {
      return new Response(
        JSON.stringify({ error: "Neuron link is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Fetching Neuron deck from:", neuronLink);

    const response = await fetch(neuronLink, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Neuron page: ${response.status}`);
    }

    const html = await response.text();
    console.log("HTML length:", html.length);

    const cardNames: string[] = [];
    
    // Try to find JSON data embedded in the page
    // Neuron typically has card data in a script tag as JSON
    const jsonPatterns = [
      /"cards"\s*:\s*\[([\s\S]*?)\]/,
      /"deck"\s*:\s*\{([\s\S]*?)\}/,
      /"data"\s*:\s*(\{[\s\S]*?\})/,
      /window\.__DATA__\s*=\s*(\{[\s\S]*?\})/,
    ];

    let jsonData: any = null;
    for (const pattern of jsonPatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          jsonData = JSON.parse(match[1]);
          console.log("Found JSON data in page");
          break;
        } catch {
          continue;
        }
      }
    }

    // If we found JSON data, extract card names from it
    if (jsonData) {
      const extractCards = (obj: any): string[] => {
        const names: string[] = [];
        if (Array.isArray(obj)) {
          for (const item of obj) {
            if (typeof item === "string" && item.length > 0 && item.length < 100) {
              names.push(item);
            } else if (typeof item === "object" && item !== null) {
              names.push(...extractCards(item));
            }
          }
        } else if (typeof obj === "object" && obj !== null) {
          for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (typeof value === "string" && value.length > 0 && value.length < 100) {
              // Check if it looks like a card name (has some common card name patterns)
              if (value.match(/[A-Z][a-z]/) || value.match(/[一-龯]/)) {
                names.push(value);
              }
            } else if (typeof value === "object" && value !== null) {
              names.push(...extractCards(value));
            }
          }
        }
        return names;
      };
      
      const extractedNames = extractCards(jsonData);
      if (extractedNames.length > 0) {
        cardNames.push(...extractedNames);
      }
    }

    // Fallback: try to extract card names from HTML using AI
    if (cardNames.length === 0) {
      console.log("No JSON found, using AI to parse HTML");
      
      const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
      if (!GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY is not configured");
      }

      const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are the world's leading expert on Yu-Gi-Oh! Trading Card Game with complete knowledge of ALL 12,000+ cards ever printed.

YOUR MISSION: Extract ALL Yu-Gi-Oh! card names from this Neuron deck list HTML.

The deck list format typically includes:
- Main deck cards at top (usually labeled "Main Deck" or "メイン")
- Extra deck cards below (usually labeled "Extra Deck" or "エクストラ")
- Side deck cards at bottom (usually labeled "Side Deck" or "サイド")

Look for:
- Card names in list format (usually left side)
- Card quantities may appear on the right (x1, x2, x3, etc.)
- Japanese card names may also be present
- Numbers indicate how many copies

OUTPUT: Return ONLY a JSON array of official English card names.
Example: ["Dark Magician", "Blue-Eyes White Dragon", "Polymerization", "Mirror Force"]

If absolutely no cards are identifiable, return: []`
                },
                {
                  text: html.substring(0, 15000)
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2000,
          }
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("AI gateway error:", aiResponse.status, errorText);
        throw new Error("Failed to analyze Neuron page");
      }

      const aiData = await aiResponse.json();
      const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      
      // Parse the JSON array from the response
      try {
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            cardNames.push(...parsed);
          }
        }
      } catch (parseError) {
        console.error("Failed to parse card names:", parseError);
      }
    }

    // Deduplicate card names
    const uniqueNames = [...new Set(cardNames)];
    console.log(`Found ${uniqueNames.length} unique card names:`, uniqueNames);

    // Fetch card data from YGOProdeck API for each recognized card using parallel requests
    const cardPromises = uniqueNames.map(async (cardName: string) => {
      try {
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
        recognizedNames: uniqueNames,
        cards: cardData 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in recognize-neuron:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
