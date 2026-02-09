import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleError, securityHeaders, sanitizeString } from '../_utils/security.ts';

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_QUERY_LENGTH = 200;

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: { ...corsHeaders, ...securityHeaders } });
    }

    try {
        const { query, language } = await req.json();
        const sanitizedQuery = sanitizeString(query, MAX_QUERY_LENGTH);

        if (!sanitizedQuery) {
            return new Response(
                JSON.stringify({ error: "Query is required", suggestions: [] }),
                { status: 400, headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" } }
            );
        }

        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
            return new Response(JSON.stringify({ error: "Service not configured", suggestions: [] }), {
                status: 500,
                headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
            });
        }

        const systemPrompt = `You are an expert Yu-Gi-Oh! card search assistant.
Return a JSON array of up to 10 strings with OFFICIAL ENGLISH NAMES of real Yu-Gi-Oh! cards.
Only return the array. No other text.`;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Search: "${sanitizedQuery}"` }
                ],
                temperature: 0.3,
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            return new Response(JSON.stringify({ error: "Failed to search cards", suggestions: [] }), {
                status: 500,
                headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
            });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "[]";

        let suggestedNames: string[] = [];
        try {
            const cleanContent = content.replace(/```json\n?|```/g, "").trim();
            suggestedNames = JSON.parse(cleanContent);
        } catch {
            const match = content.match(/\[.*\]/s);
            if (match) {
                try { suggestedNames = JSON.parse(match[0]); } catch { }
            }
        }

        if (!Array.isArray(suggestedNames)) {
            suggestedNames = [];
        }

        return new Response(
            JSON.stringify({ suggestions: suggestedNames }),
            { headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return handleError(error, 'search-related-cards');
    }
});
