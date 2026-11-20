/**
 * Cloudflare Pages Function: POST /api/submit
 * Recibe y persiste las respuestas de la encuesta en Cloudflare D1 (binding: DB)
 */

async function asegurarTablas(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS docentes (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
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
    )`)
  ]);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({
      ok: false,
      stage: 'config',
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Pages.'
    }), { status: 500, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
  }

  try {
    const payload = await request.json();
    const respondentId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    await asegurarTablas(env.DB);

    const statements = [];

    statements.push(
      env.DB.prepare(`
        INSERT INTO docentes (
          id, timestamp, edad, genero, expProfesional, expDocente, gradoAcademico,
          colabInterna, colabInternaCual, colabExterna, colabExternaCual,
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
      INSERT INTO respuestas (idDocente, timestamp, asignatura, matriz, itemNum, itemTexto, valor)
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

    await env.DB.batch(statements);

    return new Response(JSON.stringify({ ok: true, id: respondentId, timestamp }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      stage: 'database',
      error: err && err.message ? err.message : String(err)
    }), { status: 400, headers: { 'Content-Type': 'application/json; charset=UTF-8' } });
  }
}
