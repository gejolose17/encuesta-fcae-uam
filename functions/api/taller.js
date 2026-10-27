/**
 * Cloudflare Pages Function - Endpoint API: /api/taller
 * Registra participación voluntaria para talleres colaborativos
 */

export async function onRequestPost({ request }) {
  try {
    const payload = await request.json();
    const tallerId = payload.id || crypto.randomUUID();
    const timestamp = payload.timestamp || new Date().toISOString();

    return new Response(JSON.stringify({
      ok: true,
      id: tallerId,
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
      error: err && err.message ? err.message : 'Error al registrar participante'
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
