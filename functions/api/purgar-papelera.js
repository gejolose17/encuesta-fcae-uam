/**
 * Cloudflare Pages Function: POST & OPTIONS & DELETE /api/purgar-papelera
 * Elimina definitivamente registros de la papelera en Cloudflare D1 (binding DB)
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
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
  return procesarPurga(context);
}

export async function onRequestDelete(context) {
  return procesarPurga(context);
}

async function procesarPurga(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }, 500);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const purgarTodos = Boolean(body && body.all);
    const ids = Array.isArray(body && body.ids)
      ? body.ids.filter(id => typeof id === 'string' && id.trim())
      : (body && body.id ? [body.id] : []);

    if (purgarTodos) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM respuestas WHERE idDocente IN (SELECT id FROM docentes WHERE eliminado = 1)'),
        env.DB.prepare('DELETE FROM respuestas WHERE eliminado = 1'),
        env.DB.prepare('DELETE FROM docentes WHERE eliminado = 1')
      ]);
      return jsonResponse({
        ok: true,
        mensaje: 'La papelera ha sido vaciada completamente.',
        purgados: 'todos',
        timestamp: new Date().toISOString()
      });
    }

    if (ids.length === 0) {
      return jsonResponse({ ok: false, error: 'No se indicaron registros para purgar.' }, 400);
    }

    const stmts = [];
    for (const id of ids) {
      stmts.push(env.DB.prepare('DELETE FROM respuestas WHERE idDocente = ?').bind(id));
      stmts.push(env.DB.prepare('DELETE FROM docentes WHERE id = ?').bind(id));
    }

    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50));
    }

    return jsonResponse({
      ok: true,
      mensaje: `Se eliminaron definitivamente ${ids.length} registro(s) de la papelera.`,
      purgados: ids.length,
      ids,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }, 500);
  }
}
