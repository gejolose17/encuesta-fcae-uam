/**
 * CLOUDFLARE WORKER + STATIC ASSETS + D1
 * Encuesta de Investigación Formativa FCAE-UAM
 *
 * Endpoints:
 *   POST /api/submit      -> Guarda encuesta en D1 (chunked batch para soportar N asignaturas)
 *   POST /api/sync        -> Sincroniza lotes de docentes/respuestas/talleres (idempotente)
 *   POST /api/taller      -> Guarda inscripción a talleres colaborativos en D1
 *   GET  /api/resultados  -> Devuelve docentes, respuestas y talleres (sin pérdida de datos)
 *   POST /api/reset       -> Limpia registros en D1
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
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
  try { await db.prepare("ALTER TABLE docentes ADD COLUMN eliminado INTEGER DEFAULT 0").run(); } catch (e) {}
  try { await db.prepare("ALTER TABLE docentes ADD COLUMN fechaEliminado TEXT").run(); } catch (e) {}
  try { await db.prepare("ALTER TABLE respuestas ADD COLUMN eliminado INTEGER DEFAULT 0").run(); } catch (e) {}

  for (const pid of IDS_PRUEBA_HISTORICOS) {
    try {
      await db.prepare('DELETE FROM respuestas WHERE idDocente = ?').bind(pid).run();
      await db.prepare('DELETE FROM docentes WHERE id = ?').bind(pid).run();
    } catch (e) {}
  }
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
    const respondentId = payload.id || crypto.randomUUID();
    if (IDS_PRUEBA_HISTORICOS.has(respondentId)) {
      return jsonResponse({ ok: true, id: respondentId, filtradoPrueba: true });
    }
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

async function handleSync(request, env) {
  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada.'
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

async function handleDeleteDocentes(request, env) {
  if (!env.DB) {
    return jsonResponse({
      ok: false,
      error: 'Base de datos D1 (binding DB) no vinculada en Cloudflare Workers.'
    }, 500);
  }

  try {
    const body = await request.json();
    const ids = Array.isArray(body && body.ids)
      ? body.ids.filter(id => typeof id === 'string' && id.trim())
      : (body && body.id ? [body.id] : []);

    if (ids.length === 0) {
      return jsonResponse({ ok: false, error: 'No se indicaron registros para enviar a la papelera.' }, 400);
    }

    await asegurarTablas(env.DB);

    const now = new Date().toISOString();
    const stmts = [];
    for (const id of ids) {
      stmts.push(env.DB.prepare('UPDATE docentes SET eliminado = 1, fechaEliminado = ? WHERE id = ?').bind(now, id));
      stmts.push(env.DB.prepare('UPDATE respuestas SET eliminado = 1 WHERE idDocente = ?').bind(id));
    }

    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50));
    }

    return jsonResponse({
      ok: true,
      mensaje: `Se enviaron ${ids.length} registro(s) a la papelera exitosamente.`,
      eliminados: ids.length,
      ids,
      timestamp: now
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err)
    }, 500);
  }
}

async function handleRestaurarDocentes(request, env) {
  if (!env.DB) {
    return jsonResponse({ ok: false, error: 'Base de datos D1 no vinculada.' }, 500);
  }

  try {
    const body = await request.json();
    const ids = Array.isArray(body && body.ids)
      ? body.ids.filter(id => typeof id === 'string' && id.trim())
      : (body && body.id ? [body.id] : []);

    if (ids.length === 0) {
      return jsonResponse({ ok: false, error: 'No se indicaron registros para restaurar.' }, 400);
    }

    await asegurarTablas(env.DB);

    const stmts = [];
    for (const id of ids) {
      stmts.push(env.DB.prepare('UPDATE docentes SET eliminado = 0, fechaEliminado = NULL WHERE id = ?').bind(id));
      stmts.push(env.DB.prepare('UPDATE respuestas SET eliminado = 0 WHERE idDocente = ?').bind(id));
    }

    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50));
    }

    return jsonResponse({
      ok: true,
      mensaje: `Se restauraron ${ids.length} registro(s) exitosamente.`,
      restaurados: ids.length,
      ids,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.message ? err.message : String(err) }, 500);
  }
}

async function handlePurgarPapelera(request, env) {
  if (!env.DB) {
    return jsonResponse({ ok: false, error: 'Base de datos D1 no vinculada.' }, 500);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body && body.ids)
      ? body.ids.filter(id => typeof id === 'string' && id.trim())
      : (body && body.id ? [body.id] : []);
    const purgarTodos = Boolean(body && body.all);

    await asegurarTablas(env.DB);

    if (purgarTodos) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM respuestas WHERE idDocente IN (SELECT id FROM docentes WHERE eliminado = 1)'),
        env.DB.prepare('DELETE FROM respuestas WHERE eliminado = 1'),
        env.DB.prepare('DELETE FROM docentes WHERE eliminado = 1')
      ]);
      return jsonResponse({
        ok: true,
        mensaje: 'Papelera vaciada completamente de forma definitiva.',
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
      stmts.push(env.DB.prepare('DELETE FROM talleres WHERE surveyId = ?').bind(id));
    }

    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50));
    }

    return jsonResponse({
      ok: true,
      mensaje: `Se eliminaron permanentemente ${ids.length} registro(s) de la papelera.`,
      purgados: ids.length,
      ids,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.message ? err.message : String(err) }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Soporte preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Redirecciones limpias para alias del tablero analítico (/dashboard se sirve directo por Static Assets)
    if (pathname === '/tablero' || pathname === '/tablero/') {
      return Response.redirect(new URL('/dashboard', url.origin), 302);
    }

    // Rutas API conectadas a Cloudflare D1
    if (request.method === 'POST' && pathname === '/api/submit') {
      return handleSubmit(request, env);
    }
    if (request.method === 'POST' && pathname === '/api/sync') {
      return handleSync(request, env);
    }
    if (request.method === 'POST' && pathname === '/api/taller') {
      return handleTaller(request, env);
    }
    if (request.method === 'GET' && pathname === '/api/resultados') {
      return handleResultados(url, env);
    }
    if ((request.method === 'POST' || request.method === 'DELETE') && (pathname === '/api/eliminar-docentes' || pathname === '/api/delete' || pathname === '/api/eliminar' || pathname === '/api/papelera/mover')) {
      return handleDeleteDocentes(request, env);
    }
    if (request.method === 'POST' && (pathname === '/api/papelera/restaurar' || pathname === '/api/restaurar-docentes')) {
      return handleRestaurarDocentes(request, env);
    }
    if (request.method === 'POST' && (pathname === '/api/papelera/purgar' || pathname === '/api/purgar-papelera')) {
      return handlePurgarPapelera(request, env);
    }
    if (request.method === 'POST' && (pathname === '/api/reset' || pathname === '/api/clear' || pathname === '/api/eliminar-datos')) {
      return handleReset(env);
    }

    // Resto de rutas: servir archivos estáticos
    return env.ASSETS.fetch(request);
  }
};
