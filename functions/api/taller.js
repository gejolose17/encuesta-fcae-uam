/**
 * Cloudflare Pages Function: POST /api/taller
 * Registra participantes interesados en los talleres colaborativos en Cloudflare D1 (binding: DB)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
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

    return new Response(JSON.stringify({ ok: true, id: tallerId, timestamp }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }), { status: 400, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
  }
}
