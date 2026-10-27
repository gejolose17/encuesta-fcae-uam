/**
 * Cloudflare Pages Function - Endpoint API: /api/resultados
 * Retorna estado de resultados para el tablero analítico
 */

export async function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    generado: new Date().toISOString(),
    provider: 'cloudflare-pages',
    docentes: [],
    respuestas: [],
    talleres: []
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
