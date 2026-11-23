/**
 * Cloudflare Pages Function: POST & OPTIONS & DELETE /api/eliminar-docentes
 * Elimina uno o varios registros docentes y sus respuestas de Cloudflare D1 (binding: DB)
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
  return procesarEliminacion(context);
}

export async function onRequestDelete(context) {
  return procesarEliminacion(context);
}

async function procesarEliminacion(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }, 500);
  }

  try {
    const body = await request.json();
    const ids = Array.isArray(body && body.ids)
      ? body.ids.filter(id => typeof id === 'string' && id.trim())
      : (body && body.id ? [body.id] : []);

    if (ids.length === 0) {
      return jsonResponse({ ok: false, error: 'No se indicaron registros para eliminar.' }, 400);
    }

    const stmts = [];
    for (const id of ids) {
      stmts.push(env.DB.prepare('DELETE FROM respuestas WHERE idDocente = ?').bind(id));
      stmts.push(env.DB.prepare('DELETE FROM docentes WHERE id = ?').bind(id));
      stmts.push(env.DB.prepare('DELETE FROM talleres WHERE surveyId = ?').bind(id));
    }

    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50));
    }

    return jsonResponse({
      ok: true,
      mensaje: `Se eliminaron ${ids.length} registro(s) exitosamente.`,
      eliminados: ids.length,
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
