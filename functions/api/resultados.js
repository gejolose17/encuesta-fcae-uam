/**
 * Cloudflare Pages Function: GET /api/resultados
 * Devuelve docentes, respuestas y talleres almacenados en Cloudflare D1 (binding: DB).
 * Soporta filtro opcional ?desde=YYYY-MM-DD para resguardo y consulta por fecha.
 */

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
  }

  try {
    const url = new URL(request.url);
    const desde = (url.searchParams.get('desde') || '').trim();
    const filtroFecha = /^\d{4}-\d{2}-\d{2}$/.test(desde) ? `${desde}T00:00:00.000Z` : null;

    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS docentes (
        id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, edad INTEGER, genero TEXT,
        expProfesional INTEGER, expDocente INTEGER, gradoAcademico TEXT,
        colabInterna TEXT, colabInternaCual TEXT, colabExterna TEXT, colabExternaCual TEXT,
        publicaciones TEXT, publicacionesCual TEXT, q3 TEXT NOT NULL, q6 TEXT NOT NULL,
        totalAsignaturas INTEGER DEFAULT 0
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS respuestas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, idDocente TEXT NOT NULL, timestamp TEXT NOT NULL,
        asignatura TEXT NOT NULL, matriz TEXT NOT NULL, itemNum INTEGER NOT NULL,
        itemTexto TEXT, valor INTEGER NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS talleres (
        id TEXT PRIMARY KEY, surveyId TEXT, nombre TEXT NOT NULL,
        telefono TEXT NOT NULL, email TEXT NOT NULL, timestamp TEXT NOT NULL
      )`)
    ]);

    const qDocentes = filtroFecha
      ? env.DB.prepare('SELECT * FROM docentes WHERE timestamp >= ? ORDER BY timestamp ASC').bind(filtroFecha)
      : env.DB.prepare('SELECT * FROM docentes ORDER BY timestamp ASC');

    const qRespuestas = filtroFecha
      ? env.DB.prepare('SELECT idDocente, timestamp, asignatura, matriz, itemNum, itemTexto, valor FROM respuestas WHERE timestamp >= ? ORDER BY id ASC').bind(filtroFecha)
      : env.DB.prepare('SELECT idDocente, timestamp, asignatura, matriz, itemNum, itemTexto, valor FROM respuestas ORDER BY id ASC');

    const qTalleres = filtroFecha
      ? env.DB.prepare('SELECT * FROM talleres WHERE timestamp >= ? ORDER BY timestamp ASC').bind(filtroFecha)
      : env.DB.prepare('SELECT * FROM talleres ORDER BY timestamp ASC');

    const [resDoc, resResp, resTal] = await env.DB.batch([qDocentes, qRespuestas, qTalleres]);

    const docentes = (resDoc.results || []).map(d => ({
      ...d,
      q3: typeof d.q3 === 'string' ? JSON.parse(d.q3 || '[]') : (d.q3 || []),
      q6: typeof d.q6 === 'string' ? JSON.parse(d.q6 || '[]') : (d.q6 || [])
    }));

    return new Response(JSON.stringify({
      ok: true,
      fuente: 'cloudflare-d1',
      desde: desde || null,
      generado: new Date().toISOString(),
      docentes,
      respuestas: resResp.results || [],
      talleres: resTal.results || []
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
  }
}
