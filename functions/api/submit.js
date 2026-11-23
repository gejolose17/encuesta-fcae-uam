/**
 * Cloudflare Pages Function: POST & OPTIONS /api/submit
 * Recibe y persiste las respuestas de la encuesta en Cloudflare D1 (binding: DB)
 * Con soporte para CORS, lotes (batches de 50) e inserción resiliente.
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
      stage: 'config',
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }, 500);
  }

  try {
    const payload = await request.json();
    const respondentId = payload.id || crypto.randomUUID();
    const timestampFin = payload.timestampFin || payload.timestamp || new Date().toISOString();
    const timestampInicio = payload.timestampInicio || timestampFin;

    await asegurarTablas(env.DB);

    const statements = [];

    statements.push(
      env.DB.prepare(`
        INSERT OR REPLACE INTO docentes (
          id, timestamp, timestampInicio, timestampFin, edad, genero, expProfesional, expDocente, gradoAcademico,
          colabInterna, colabInternaCual, colabExterna, colabExternaCual,
          publicaciones, publicacionesCual, q3, q6, totalAsignaturas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        respondentId,
        timestampFin,
        timestampInicio,
        timestampFin,
          publicaciones, publicacionesCual, q3, q6, totalAsignaturas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        respondentId,
        timestamp,
        payload.edad ?? null,
        payload.genero || '',
        payload.expProfesional ?? null,
        payload.expDocente ?? null,
        payload.gradoAcademico || '',
        payload.colabInterna || '',
        payload.colabInternaCual || '',
        payload.colabExterna || '',
        payload.colabExternaCual || '',
        payload.publicaciones || '',
        payload.publicacionesCual || '',
        JSON.stringify(Array.isArray(payload.q3) ? payload.q3 : []),
        JSON.stringify(Array.isArray(payload.q6) ? payload.q6 : []),
        Array.isArray(payload.asignaturas) ? payload.asignaturas.length : 0
      )
    );

    const insertResp = env.DB.prepare(`
      INSERT OR REPLACE INTO respuestas (idDocente, timestamp, asignatura, matriz, itemNum, itemTexto, valor)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    if (Array.isArray(payload.matrices)) {
      for (const asigObj of payload.matrices) {
        const asigNombre = String(asigObj.asignatura || '').trim();
        if (Array.isArray(asigObj.matrizA)) {
          for (const it of asigObj.matrizA) {
            statements.push(
              insertResp.bind(respondentId, timestamp, asigNombre, 'A', Number(it.num), String(it.texto || ''), Number(it.valor))
            );
          }
        }
        if (Array.isArray(asigObj.matrizB)) {
          for (const it of asigObj.matrizB) {
            statements.push(
              insertResp.bind(respondentId, timestamp, asigNombre, 'B', Number(it.num), String(it.texto || ''), Number(it.valor))
            );
          }
        }
      }
    }

    // Ejecutar en lotes de máximo 50 para respetar los límites de Cloudflare D1
    for (let i = 0; i < statements.length; i += 50) {
      await env.DB.batch(statements.slice(i, i + 50));
    }

    return jsonResponse({ ok: true, id: respondentId, timestamp });
  } catch (err) {
    return jsonResponse({
      ok: false,
      stage: 'database',
      error: err && err.message ? err.message : String(err)
    }, 400);
  }
}
