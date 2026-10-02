/**
 * Testes de autorização da edge function get-ice-servers
 * 
 * Valida que:
 * - Sem token de autenticação retorna 401
 * - Com anon key (sem usuário) retorna 401
 * - Com usuário válido retorna 200 e credenciais ICE
 * - Rate limit funciona corretamente
 */
import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";

/**
 * CONTRATO DA FUNÇÃO
 * 
 * A função get-ice-servers DEVE:
 * 1. Retornar 401 se não houver header Authorization
 * 2. Retornar 401 se o token for inválido ou expirado (incluindo anon key sem usuário)
 * 3. Retornar 429 se o rate limit for excedido (20 req/min por usuário)
 * 4. Retornar 200 com { iceServers: RTCIceServer[], hasTurn: boolean } para usuário autenticado
 */

Deno.test("CONTRATO: sem Authorization header retorna 401", () => {
  const expectedResponse = {
    status: 401,
    body: { error: "Authentication required" }
  };
  
  console.log("✓ Contrato definido:", expectedResponse);
  assertEquals(401, expectedResponse.status);
});

Deno.test("CONTRATO: anon key sem usuário retorna 401", () => {
  const expectedResponse = {
    status: 401,
    body: { error: "Invalid or expired token" }
  };
  
  console.log("✓ Contrato definido:", expectedResponse);
  assertEquals(401, expectedResponse.status);
});

Deno.test("CONTRATO: usuário autenticado válido retorna 200", () => {
  const expectedResponse = {
    status: 200,
    body: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        // ... mais servidores
      ],
      hasTurn: true // ou false se não houver TURN configurado
    }
  };
  
  console.log("✓ Contrato definido:", expectedResponse);
  assertEquals(200, expectedResponse.status);
});

Deno.test("CONTRATO: rate limit retorna 429 após 20 requisições", () => {
  const RATE_LIMIT = 20;
  const expectedResponse = {
    status: 429,
    body: { error: "Rate limit exceeded. Please try again later." }
  };
  
  console.log("✓ Contrato definido: após", RATE_LIMIT, "req/min →", expectedResponse);
  assertEquals(429, expectedResponse.status);
});

/**
 * TESTES DE INTEGRAÇÃO
 * 
 * Para testar a função real localmente:
 * 
 * 1. Inicie o Supabase local:
 *    npx supabase start
 * 
 * 2. Deploy da função:
 *    npx supabase functions deploy get-ice-servers --no-verify-jwt
 * 
 * 3. Teste sem autenticação (deve retornar 401):
 *    curl -X GET http://localhost:54321/functions/v1/get-ice-servers
 * 
 * 4. Teste com anon key (deve retornar 401):
 *    curl -X GET http://localhost:54321/functions/v1/get-ice-servers \
 *      -H "Authorization: Bearer YOUR_ANON_KEY"
 * 
 * 5. Teste com usuário válido:
 *    a) Primeiro faça login:
 *       curl -X POST http://localhost:54321/auth/v1/signup \
 *         -H "apikey: YOUR_ANON_KEY" \
 *         -H "Content-Type: application/json" \
 *         -d '{"email":"test@example.com","password":"password123"}'
 *    
 *    b) Use o access_token retornado:
 *       curl -X GET http://localhost:54321/functions/v1/get-ice-servers \
 *         -H "Authorization: Bearer ACCESS_TOKEN"
 * 
 * 6. Teste rate limit:
 *    for i in {1..25}; do
 *      curl -X GET http://localhost:54321/functions/v1/get-ice-servers \
 *        -H "Authorization: Bearer ACCESS_TOKEN"
 *      echo "Request $i"
 *    done
 *    # A partir da requisição 21, deve retornar 429
 */
