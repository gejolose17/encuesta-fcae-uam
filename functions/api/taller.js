/**
 * Cloudflare Pages Function: POST & OPTIONS /api/taller
 * Registra participantes interesados en los talleres colaborativos en Cloudflare D1 (binding: DB)
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }, 500);
  }

  try {
    const payload = await request.json();
    const tallerId = payload.id || crypto.randomUUID();
    const timestamp = payload.timestamp || new Date().toISOString();

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS talleres (
      id TEXT PRIMARY KEY,
      surveyId TEXT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      email TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )`).run();

    await env.DB.prepare(`
      INSERT OR REPLACE INTO talleres (id, surveyId, nombre, telefono, email, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      tallerId,
      payload.surveyId || null,
      String(payload.nombre || '').trim(),
      String(payload.telefono || '').trim(),
      String(payload.email || '').trim().toLowerCase(),
      timestamp
    ).run();

    return jsonResponse({ ok: true, id: tallerId, timestamp });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }, 400);
  }
}
