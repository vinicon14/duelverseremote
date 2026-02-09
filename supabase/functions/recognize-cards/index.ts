import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleError, securityHeaders, sanitizeString } from '../_utils/security.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, ...securityHeaders } });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Image is required" }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
      });
    }

    let imageUrl = imageBase64;
    if (!imageBase64.startsWith('data:')) {
      imageUrl = `data:image/jpeg;base64,${imageBase64}`;
    }

    const base64Length = imageBase64.replace(/^data:image\/\w+;base64,/, '').length;
    if (base64Length > MAX_IMAGE_SIZE * 1.37) {
      return new Response(JSON.stringify({ error: "Image too large. Maximum 5MB allowed." }), {
        status: 400,
        headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
      });
    }

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
            content: `You are an expert on Yu-Gi-Oh! cards. Identify cards in images. Return ONLY a JSON array of official English card names. Example: ["Dark Magician", "Blue-Eyes White Dragon"] If no cards, return: []`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify all Yu-Gi-Oh! cards in this image. Return as JSON array." },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to analyze image" }), {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    
    let cardNames: string[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        cardNames = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      cardNames = [];
    }

    const cardPromises = (cardNames || []).map(async (cardName: string) => {
      try {
        const sanitizedName = sanitizeString(cardName, 100);
        const cardResponse = await fetch(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(sanitizedName)}`
        );
        if (cardResponse.ok) {
          const cardInfo = await cardResponse.json();
          if (cardInfo.data && cardInfo.data.length > 0) {
            return cardInfo.data[0];
          }
        }
        return null;
      } catch {
        return null;
      }
    });

    const cardResults = await Promise.all(cardPromises);
    const cardData = cardResults.filter((card): card is NonNullable<typeof card> => card !== null);

    return new Response(
      JSON.stringify({ recognizedNames: cardNames, cards: cardData }),
      { headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return handleError(error, 'recognize-cards');
  }
});
