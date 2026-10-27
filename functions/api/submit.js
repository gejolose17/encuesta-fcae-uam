/**
 * Cloudflare Pages Function - Endpoint API: /api/submit
 * Recibe y valida respuestas de la encuesta en el Edge de Cloudflare
 */

export async function onRequestPost({ request }) {
  try {
    const payload = await request.json();
    const respondentId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    return new Response(JSON.stringify({
      ok: true,
      id: respondentId,
      timestamp: timestamp,
      provider: 'cloudflare-pages'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      stage: 'validation',
      error: err && err.message ? err.message : 'Error al procesar envío'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
