/**
 * Cloudflare Pages Function: POST & OPTIONS /api/sync
 * Sincroniza lotes de docentes, respuestas y talleres hacia Cloudflare D1 (binding: DB)
 * Idempotente (INSERT OR REPLACE) y procesado en lotes de 50.
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

async function asegurarTablas(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS docentes (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      timestampInicio TEXT,
      timestampFin TEXT,
      edad INTEGER,
      genero TEXT,
      expProfesional INTEGER,
      expDocente INTEGER,
      gradoAcademico TEXT,
      colabInterna TEXT,
      colabInternaCual TEXT,
      colabExterna TEXT,
      colabExternaCual TEXT,
      publicaciones TEXT,
      publicacionesCual TEXT,
      q3 TEXT NOT NULL,
      q6 TEXT NOT NULL,
      totalAsignaturas INTEGER DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS respuestas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idDocente TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      asignatura TEXT NOT NULL,
      matriz TEXT NOT NULL,
      itemNum INTEGER NOT NULL,
      itemTexto TEXT,
      valor INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS talleres (
      id TEXT PRIMARY KEY,
      surveyId TEXT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      email TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_respuestas_item ON respuestas(idDocente, asignatura, matriz, itemNum)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_docentes_ts ON docentes(timestamp)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_respuestas_doc ON respuestas(idDocente)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_talleres_ts ON talleres(timestamp)`)
  ]);

  try { await db.prepare("ALTER TABLE docentes ADD COLUMN timestampInicio TEXT").run(); } catch (e) {}
  try { await db.prepare("ALTER TABLE docentes ADD COLUMN timestampFin TEXT").run(); } catch (e) {}
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
    const body = await request.json();
    const docentes = (Array.isArray(body && body.docentes) ? body.docentes : [])
      .filter(d => d && d.id && !IDS_PRUEBA_HISTORICOS.has(d.id));
    const respuestas = (Array.isArray(body && body.respuestas) ? body.respuestas : [])
      .filter(r => r && r.idDocente && !IDS_PRUEBA_HISTORICOS.has(r.idDocente));
    const talleres = Array.isArray(body && body.talleres) ? body.talleres : [];

    await asegurarTablas(env.DB);

    // 1. Sincronizar docentes
    if (docentes.length > 0) {
      const docStmts = docentes.map(d => {
        const tsFin = d.timestampFin || d.timestamp || new Date().toISOString();
        const tsIni = d.timestampInicio || tsFin;
        return env.DB.prepare(`
          INSERT OR REPLACE INTO docentes (
            id, timestamp, timestampInicio, timestampFin, edad, genero, expProfesional, expDocente, gradoAcademico,
            colabInterna, colabInternaCual, colabExterna, colabExternaCual,
            publicaciones, publicacionesCual, q3, q6, totalAsignaturas
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          d.id,
          tsFin,
          tsIni,
          tsFin,
          d.edad ?? null,
          d.genero || '',
          d.expProfesional ?? null,
          d.expDocente ?? null,
          d.gradoAcademico || '',
          d.colabInterna || '',
          d.colabInternaCual || '',
          d.colabExterna || '',
          d.colabExternaCual || '',
          d.publicaciones || '',
          d.publicacionesCual || '',
          typeof d.q3 === 'string' ? d.q3 : JSON.stringify(d.q3 || []),
          typeof d.q6 === 'string' ? d.q6 : JSON.stringify(d.q6 || []),
          d.totalAsignaturas || 0
        );
      });
      for (let i = 0; i < docStmts.length; i += 50) {
        await env.DB.batch(docStmts.slice(i, i + 50));
      }
    }

    // 2. Sincronizar respuestas
    if (respuestas.length > 0) {
      const respStmts = respuestas.map(r => {
        return env.DB.prepare(`
          INSERT OR REPLACE INTO respuestas (idDocente, timestamp, asignatura, matriz, itemNum, itemTexto, valor)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          r.idDocente,
          r.timestamp || new Date().toISOString(),
          r.asignatura || '',
          r.matriz || '',
          Number(r.itemNum) || 0,
          r.itemTexto || '',
          Number(r.valor) || 0
        );
      });
      for (let i = 0; i < respStmts.length; i += 50) {
        await env.DB.batch(respStmts.slice(i, i + 50));
      }
    }

    // 3. Sincronizar talleres
    if (talleres.length > 0) {
      const talStmts = talleres.map(t => {
        return env.DB.prepare(`
          INSERT OR REPLACE INTO talleres (id, surveyId, nombre, telefono, email, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          t.id || crypto.randomUUID(),
          t.surveyId || null,
          t.nombre || '',
          t.telefono || '',
          t.email || '',
          t.timestamp || new Date().toISOString()
        );
      });
      for (let i = 0; i < talStmts.length; i += 50) {
        await env.DB.batch(talStmts.slice(i, i + 50));
      }
    }

    return jsonResponse({
      ok: true,
      mensaje: 'Sincronización en Cloudflare D1 exitosa',
      recibidos: {
        docentes: docentes.length,
        respuestas: respuestas.length,
        talleres: talleres.length
      }
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }, 400);
  }
}

