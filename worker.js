/**
 * CLOUDFLARE WORKER + STATIC ASSETS + D1
 * Encuesta de Investigación Formativa FCAE-UAM
 *
 * Endpoints:
 *   POST /api/submit      -> Guarda encuesta en D1 (tablas docentes + respuestas)
 *   POST /api/taller      -> Guarda inscripción a talleres colaborativos en D1
 *   GET  /api/resultados  -> Devuelve docentes, respuestas y talleres (opcional ?desde=YYYY-MM-DD)
 *   POST /api/reset       -> Limpia registros de prueba en D1
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store'
    }
  });
}

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
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS talleres (
      id TEXT PRIMARY KEY,
      surveyId TEXT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      email TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )`)
  ]);
}

async function handleSubmit(request, env) {
  if (!env.DB) {
    return jsonResponse({
      ok: false,
      stage: 'config',
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Workers.'
    }, 500);
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
    return jsonResponse({ ok: true, id: respondentId, timestamp });
  } catch (err) {
    return jsonResponse({
      ok: false,
      stage: 'database',
      error: err && err.message ? err.message : String(err)
    }, 400);
  }
}

async function handleTaller(request, env) {
  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Workers.'
    }, 500);
  }

  try {
    const payload = await request.json();
    const tallerId = payload.id || crypto.randomUUID();
    const timestamp = payload.timestamp || new Date().toISOString();

    await asegurarTablas(env.DB);

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

async function handleResultados(url, env) {
  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Workers.'
    }, 500);
  }

  try {
    const desde = (url.searchParams.get('desde') || '').trim();
    const filtroFecha = /^\d{4}-\d{2}-\d{2}$/.test(desde) ? `${desde}T00:00:00.000Z` : null;

    await asegurarTablas(env.DB);

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

    return jsonResponse({
      ok: true,
      fuente: 'cloudflare-d1',
      desde: desde || null,
      generado: new Date().toISOString(),
      docentes,
      respuestas: resResp.results || [],
      talleres: resTal.results || []
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }, 500);
  }
}

async function handleReset(env) {
  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Workers.'
    }, 500);
  }

  try {
    await asegurarTablas(env.DB);

    const [cDoc, cResp, cTal] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) as c FROM docentes'),
      env.DB.prepare('SELECT COUNT(*) as c FROM respuestas'),
      env.DB.prepare('SELECT COUNT(*) as c FROM talleres')
    ]);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM respuestas'),
      env.DB.prepare('DELETE FROM docentes'),
      env.DB.prepare('DELETE FROM talleres')
    ]);

    return jsonResponse({
      ok: true,
      mensaje: 'Base de datos D1 limpiada exitosamente.',
      eliminados: {
        docentes: cDoc?.results?.[0]?.c || 0,
        respuestas: cResp?.results?.[0]?.c || 0,
        talleres: cTal?.results?.[0]?.c || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Redirecciones limpias para el tablero analítico
    if (pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/tablero' || pathname === '/tablero/') {
      return Response.redirect(new URL('/dashboard.html', url.origin), 302);
    }

    // Rutas API conectadas a Cloudflare D1
    if (request.method === 'POST' && pathname === '/api/submit') {
      return handleSubmit(request, env);
    }
    if (request.method === 'POST' && pathname === '/api/taller') {
      return handleTaller(request, env);
    }
    if (request.method === 'GET' && pathname === '/api/resultados') {
      return handleResultados(url, env);
    }
    if (request.method === 'POST' && (pathname === '/api/reset' || pathname === '/api/clear' || pathname === '/api/eliminar-datos')) {
      return handleReset(env);
    }

    // Resto de rutas: servir archivos estáticos
    return env.ASSETS.fetch(request);
  }
};
