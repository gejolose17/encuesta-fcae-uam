/**
 * Cloudflare Pages Function: GET & OPTIONS /api/resultados
 * Devuelve docentes, respuestas y talleres almacenados en Cloudflare D1 (binding: DB).
 * Soporta filtro opcional ?desde=YYYY-MM-DD para resguardo y consulta por fecha.
 */

const IDS_PRUEBA_HISTORICOS = new Set([
  '5b47b922-2330-4109-8efb-65d7fb10a92c',
  'ba7318bb-6e9a-48a8-9630-d9ab0dab373c',
  'b0680876-f44d-4abb-886e-8b936feedd06',
  '09b20055-e02f-4073-ab13-f9298cb7828d',
  'd70f1efd-0f0a-4135-9a23-8f5c487ee01d',
  '93d3ebf0-caa5-41d2-b630-73f101481ada',
  '50227db6-ba1e-4a0d-9ffc-ae6f32092ef1',
  '934ab3d2-30c1-4ecb-995f-ae39cfd38f38',
  '62869bd7-ed4d-438a-aa2c-3e6eff43ab81',
  '3b2919ce-4512-4f52-bfc0-ca67e031a300',
  'e95ab3b3-22ca-46a3-b784-5374b4672d95'
]);

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

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }, 500);
  }

  try {
    const url = new URL(request.url);
    const desde = (url.searchParams.get('desde') || '').trim();
    const filtroFecha = /^\d{4}-\d{2}-\d{2}$/.test(desde) ? `${desde}T00:00:00.000Z` : null;

    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS docentes (
        id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, timestampInicio TEXT, timestampFin TEXT, edad INTEGER, genero TEXT,
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
      )`),
      env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_respuestas_item ON respuestas(idDocente, asignatura, matriz, itemNum)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_docentes_ts ON docentes(timestamp)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_respuestas_doc ON respuestas(idDocente)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_talleres_ts ON talleres(timestamp)`)
    ]);

    try { await env.DB.prepare("ALTER TABLE docentes ADD COLUMN timestampInicio TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE docentes ADD COLUMN timestampFin TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE docentes ADD COLUMN eliminado INTEGER DEFAULT 0").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE docentes ADD COLUMN fechaEliminado TEXT").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE respuestas ADD COLUMN eliminado INTEGER DEFAULT 0").run(); } catch (e) {}

    const qDocentes = filtroFecha
      ? env.DB.prepare('SELECT * FROM docentes WHERE timestamp >= ? AND (eliminado = 0 OR eliminado IS NULL) ORDER BY timestamp ASC').bind(filtroFecha)
      : env.DB.prepare('SELECT * FROM docentes WHERE (eliminado = 0 OR eliminado IS NULL) ORDER BY timestamp ASC');

    const qRespuestas = filtroFecha
      ? env.DB.prepare('SELECT idDocente, timestamp, asignatura, matriz, itemNum, itemTexto, valor FROM respuestas WHERE timestamp >= ? AND (eliminado = 0 OR eliminado IS NULL) ORDER BY id ASC').bind(filtroFecha)
      : env.DB.prepare('SELECT idDocente, timestamp, asignatura, matriz, itemNum, itemTexto, valor FROM respuestas WHERE (eliminado = 0 OR eliminado IS NULL) ORDER BY id ASC');

    const qTalleres = filtroFecha
      ? env.DB.prepare('SELECT * FROM talleres WHERE timestamp >= ? ORDER BY timestamp ASC').bind(filtroFecha)
      : env.DB.prepare('SELECT * FROM talleres ORDER BY timestamp ASC');

    const qPapelera = env.DB.prepare('SELECT * FROM docentes WHERE eliminado = 1 ORDER BY fechaEliminado DESC, timestamp DESC');

    const [resDoc, resResp, resTal, resPap] = await env.DB.batch([qDocentes, qRespuestas, qTalleres, qPapelera]);

    const docentes = (resDoc.results || [])
      .filter(d => d && d.id && !IDS_PRUEBA_HISTORICOS.has(d.id))
      .map(d => ({
        ...d,
        q3: typeof d.q3 === 'string' ? JSON.parse(d.q3 || '[]') : (d.q3 || []),
        q6: typeof d.q6 === 'string' ? JSON.parse(d.q6 || '[]') : (d.q6 || [])
      }));

    const respuestas = (resResp.results || []).filter(r => r && r.idDocente && !IDS_PRUEBA_HISTORICOS.has(r.idDocente));

    const papelera = (resPap.results || [])
      .filter(d => d && d.id && !IDS_PRUEBA_HISTORICOS.has(d.id))
      .map(d => ({
        ...d,
        q3: typeof d.q3 === 'string' ? JSON.parse(d.q3 || '[]') : (d.q3 || []),
        q6: typeof d.q6 === 'string' ? JSON.parse(d.q6 || '[]') : (d.q6 || [])
      }));

    return jsonResponse({
      ok: true,
      fuente: 'cloudflare-d1',
      desde: desde || null,
      generado: new Date().toISOString(),
      docentes,
      respuestas,
      talleres: resTal.results || [],
      papelera
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }, 500);
  }
}
