/**
 * Cloudflare Pages Function: POST /api/reset
 * Limpia los registros de prueba en Cloudflare D1 (binding: DB)
 */

export async function onRequestPost(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
  }

  try {
    const [cDoc, cResp, cTal] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) as c FROM docentes'),
      env.DB.prepare('SELECT COUNT(*) as c FROM respuestas'),
      env.DB.prepare('SELECT COUNT(*) as c FROM talleres')
    ]).catch(() => [{ results: [{ c: 0 }] }, { results: [{ c: 0 }] }, { results: [{ c: 0 }] }]);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM respuestas'),
      env.DB.prepare('DELETE FROM docentes'),
      env.DB.prepare('DELETE FROM talleres')
    ]);

    return new Response(JSON.stringify({
      ok: true,
      mensaje: 'Base de datos D1 limpiada exitosamente.',
      eliminados: {
        docentes: cDoc?.results?.[0]?.c || 0,
        respuestas: cResp?.results?.[0]?.c || 0,
        talleres: cTal?.results?.[0]?.c || 0
      },
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
  }
}
