
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
        const { query, language } = await req.json();

        if (!query) {
            return new Response(
                JSON.stringify({ error: "Query is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
            throw new Error("LOVABLE_API_KEY is not configured");
        }

        console.log(`Processing search query: "${query}" in language: ${language}`);

        const systemPrompt = `You are an expert Yu-Gi-Oh! card search assistant.
Your goal is to help a user find cards based on a search query, which may be in Portuguese or English.
The user might be looking for:
1. Specific cards (by name, even if partial or translated)
2. Archetypes (e.g., "Blue-Eyes", "Mago Negro", "Herois Elementares")
3. Cards with specific themes or effects (e.g., "dragões de fogo", "cartas que destroem spell/trap")

RETURN a JSON array of up to 10 strings. Each string should be the OFFICIAL ENGLISH NAME of a real Yu-Gi-Oh! card.
- If the user searches for a Portuguese name (e.g. "Mago Negro"), return the English name ("Dark Magician") and related cards ("Dark Magical Circle", etc).
- If the user searches for a theme (e.g. "fogo"), return popular/iconic cards of that theme.
- PRIORITIZE exact matches or direct translations first.
- ONLY return the array of strings. No other text.`;

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
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: `Search query: "${query}"`
                    }
                ],
                temperature: 0.3,
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("AI gateway error:", response.status, errorText);
            throw new Error("Failed to get AI suggestions");
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "[]";

        let suggestedNames: string[] = [];
        try {
            // clean up code blocks if present
            const cleanContent = content.replace(/```json\n?|```/g, "").trim();
            suggestedNames = JSON.parse(cleanContent);
        } catch (e) {
            console.error("Failed to parse AI response:", content, e);
            // Fallback: try to match anything looking like a list
            const match = content.match(/\[.*\]/s);
            if (match) {
                try {
                    suggestedNames = JSON.parse(match[0]);
                } catch { }
            }
        }

        // Ensure it's an array of strings
        if (!Array.isArray(suggestedNames)) {
            suggestedNames = [];
        }

        console.log("AI suggested cards:", suggestedNames);

        return new Response(
            JSON.stringify({
                suggestions: suggestedNames
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error in search-related-cards:", error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", suggestions: [] }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
