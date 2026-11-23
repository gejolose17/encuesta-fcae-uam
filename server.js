/**
 * SERVIDOR LOCAL DE DESARROLLO Y SIMULACIÓN
 * Sin dependencias externas (usa módulos nativos de Node.js)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');

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

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// Clientes suscritos por Server-Sent Events (SSE) para actualizar el dashboard al instante
const sseClients = new Set();

function notificarClientesSSE(evento) {
  const dataStr = `data: ${JSON.stringify(evento)}\n\n`;
  sseClients.forEach(clientRes => {
    try {
      clientRes.write(dataStr);
    } catch (e) {
      sseClients.delete(clientRes);
    }
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Endpoint SSE: Canal en tiempo real para actualización automática del dashboard
  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=UTF-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Endpoint API: Recepción de respuestas
  if (req.method === 'POST' && pathname === '/api/submit') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const respondentId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        // 1. Guardar en registro de docentes
        const docentesFile = path.join(DATA_DIR, 'docentes.json');
        let docentesList = [];
        if (fs.existsSync(docentesFile)) {
          docentesList = JSON.parse(fs.readFileSync(docentesFile, 'utf8'));
        }

        const docenteRecord = {
          id: respondentId,
          timestamp: timestamp,
          timestampInicio: payload.timestampInicio || timestamp,
          timestampFin: payload.timestampFin || timestamp,
          edad: payload.edad,
          genero: payload.genero,
          expProfesional: payload.expProfesional,
          expDocente: payload.expDocente,
          gradoAcademico: payload.gradoAcademico,
          colabInterna: payload.colabInterna,
          colabInternaCual: payload.colabInternaCual,
          colabExterna: payload.colabExterna,
          colabExternaCual: payload.colabExternaCual,
          publicaciones: payload.publicaciones,
          publicacionesCual: payload.publicacionesCual,
          q3: payload.q3,
          q6: payload.q6,
          totalAsignaturas: payload.asignaturas ? payload.asignaturas.length : 0
        };
        docentesList.push(docenteRecord);
        fs.writeFileSync(docentesFile, JSON.stringify(docentesList, null, 2), 'utf8');

        // 2. Guardar en registro de respuestas en formato largo (N * 28)
        const respuestasFile = path.join(DATA_DIR, 'respuestas.json');
        let respuestasList = [];
        if (fs.existsSync(respuestasFile)) {
          respuestasList = JSON.parse(fs.readFileSync(respuestasFile, 'utf8'));
        }

        if (Array.isArray(payload.matrices)) {
          payload.matrices.forEach(asigObj => {
            const asigNombre = asigObj.asignatura;
            if (Array.isArray(asigObj.matrizA)) {
              asigObj.matrizA.forEach(it => {
                respuestasList.push({
                  idDocente: respondentId,
                  timestamp: timestamp,
                  asignatura: asigNombre,
                  matriz: 'A',
                  itemNum: it.num,
                  itemTexto: it.texto,
                  valor: it.valor
                });
              });
            }
            if (Array.isArray(asigObj.matrizB)) {
              asigObj.matrizB.forEach(it => {
                respuestasList.push({
                  idDocente: respondentId,
                  timestamp: timestamp,
                  asignatura: asigNombre,
                  matriz: 'B',
                  itemNum: it.num,
                  itemTexto: it.texto,
                  valor: it.valor
                });
              });
            }
          });
        }
        fs.writeFileSync(respuestasFile, JSON.stringify(respuestasList, null, 2), 'utf8');

        console.log(`[SUBMIT OK] Docente registrado: ${respondentId} | Asignaturas: ${payload.asignaturas.length} | Filas generadas: ${(payload.asignaturas.length * 28)}`);
        notificarClientesSSE({ type: 'survey_submitted', id: respondentId, timestamp: timestamp });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: respondentId }));
      } catch (err) {
        console.error('[SUBMIT ERROR]', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, stage: 'validation', error: err.message }));
      }
    });
    return;
  }

  // Endpoint API: Sincronización en lote de docentes, respuestas y talleres
  if (req.method === 'POST' && pathname === '/api/sync') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const nuevosDocentes = (Array.isArray(payload.docentes) ? payload.docentes : [])
          .filter(d => d && d.id && !IDS_PRUEBA_HISTORICOS.has(d.id));
        const nuevasRespuestas = (Array.isArray(payload.respuestas) ? payload.respuestas : [])
          .filter(r => r && r.idDocente && !IDS_PRUEBA_HISTORICOS.has(r.idDocente));
        const nuevosTalleres = Array.isArray(payload.talleres) ? payload.talleres : [];

        // 1. Docentes
        const docFile = path.join(DATA_DIR, 'docentes.json');
        let docs = fs.existsSync(docFile) ? JSON.parse(fs.readFileSync(docFile, 'utf8')) : [];
        const docMap = new Map(docs.map(d => [d.id, d]));
        nuevosDocentes.forEach(d => { if (d && d.id) docMap.set(d.id, d); });
        docs = Array.from(docMap.values());
        fs.writeFileSync(docFile, JSON.stringify(docs, null, 2), 'utf8');

        // 2. Respuestas
        const respFile = path.join(DATA_DIR, 'respuestas.json');
        let resps = fs.existsSync(respFile) ? JSON.parse(fs.readFileSync(respFile, 'utf8')) : [];
        const respKey = r => `${r.idDocente}_${r.asignatura}_${r.matriz}_${r.itemNum}`;
        const respMap = new Map(resps.map(r => [respKey(r), r]));
        nuevasRespuestas.forEach(r => { if (r && r.idDocente) respMap.set(respKey(r), r); });
        resps = Array.from(respMap.values());
        fs.writeFileSync(respFile, JSON.stringify(resps, null, 2), 'utf8');

        // 3. Talleres
        const talFile = path.join(DATA_DIR, 'talleres.json');
        let tals = fs.existsSync(talFile) ? JSON.parse(fs.readFileSync(talFile, 'utf8')) : [];
        const talKey = t => t.id || `${t.email}_${t.nombre}`;
        const talMap = new Map(tals.map(t => [talKey(t), t]));
        nuevosTalleres.forEach(t => { if (t) talMap.set(talKey(t), t); });
        tals = Array.from(talMap.values());
        fs.writeFileSync(talFile, JSON.stringify(tals, null, 2), 'utf8');

        console.log(`[SYNC OK] Sincronizados: ${nuevosDocentes.length} docentes, ${nuevasRespuestas.length} respuestas, ${nuevosTalleres.length} talleres`);
        notificarClientesSSE({ type: 'survey_submitted', ts: Date.now() });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({
          ok: true,
          mensaje: 'Sincronización local exitosa',
          recibidos: { docentes: nuevosDocentes.length, respuestas: nuevasRespuestas.length, talleres: nuevosTalleres.length }
        }));
      } catch (err) {
        console.error('[SYNC ERROR]', err);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint API: Registro de participantes para talleres colaborativos (segunda etapa)
  if (req.method === 'POST' && pathname === '/api/taller') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const tallerId = payload.id || crypto.randomUUID();
        const timestamp = payload.timestamp || new Date().toISOString();

        const talleresFile = path.join(DATA_DIR, 'talleres.json');
        let talleresList = [];
        if (fs.existsSync(talleresFile)) {
          try {
            talleresList = JSON.parse(fs.readFileSync(talleresFile, 'utf8'));
            if (!Array.isArray(talleresList)) talleresList = [];
          } catch (e) {
            talleresList = [];
          }
        }

        const record = {
          id: tallerId,
          surveyId: payload.surveyId || null,
          nombre: payload.nombre || '',
          telefono: payload.telefono || '',
          email: payload.email || '',
          timestamp: timestamp
        };

        talleresList.push(record);
        fs.writeFileSync(talleresFile, JSON.stringify(talleresList, null, 2), 'utf8');

        console.log(`[TALLER OK] Participante registrado: ${record.nombre} (${record.email})`);
        notificarClientesSSE({ type: 'workshop_registered', taller: record, timestamp: timestamp });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: true, id: tallerId }));
      } catch (err) {
        console.error('[TALLER ERROR]', err);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint API: Consulta de resultados para el tablero analítico (dashboard.html)
  if (req.method === 'GET' && pathname === '/api/resultados') {
    const leer = (nombre) => {
      const f = path.join(DATA_DIR, nombre);
      try {
        return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
      } catch (e) {
        console.error('[RESULTADOS ERROR] No se pudo leer', nombre, e.message);
        return [];
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' });
    const allDocs = leer('docentes.json').filter(d => d && d.id && !IDS_PRUEBA_HISTORICOS.has(d.id));
    const allResps = leer('respuestas.json').filter(r => r && r.idDocente && !IDS_PRUEBA_HISTORICOS.has(r.idDocente));
    const docs = allDocs.filter(d => !d.eliminado);
    const resps = allResps.filter(r => !r.eliminado);
    const papelera = allDocs.filter(d => d.eliminado === 1);

    res.end(JSON.stringify({
      ok: true,
      generado: new Date().toISOString(),
      docentes: docs,
      respuestas: resps,
      talleres: leer('talleres.json'),
      papelera: papelera
    }));
    return;
  }

  // Endpoint API: Mover registros a la papelera (soft-delete)
  if ((req.method === 'POST' || req.method === 'DELETE') && (pathname === '/api/eliminar-docentes' || pathname === '/api/delete' || pathname === '/api/eliminar' || pathname === '/api/papelera/mover')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const ids = Array.isArray(payload.ids)
          ? payload.ids.filter(id => typeof id === 'string' && id.trim())
          : (payload.id ? [payload.id] : []);

        if (ids.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
          res.end(JSON.stringify({ ok: false, error: 'No se indicaron IDs para enviar a la papelera.' }));
          return;
        }

        const idSet = new Set(ids);
        const docFile = path.join(DATA_DIR, 'docentes.json');
        const respFile = path.join(DATA_DIR, 'respuestas.json');

        let docs = fs.existsSync(docFile) ? JSON.parse(fs.readFileSync(docFile, 'utf8')) : [];
        let resps = fs.existsSync(respFile) ? JSON.parse(fs.readFileSync(respFile, 'utf8')) : [];

        const now = new Date().toISOString();
        docs.forEach(d => {
          if (idSet.has(d.id)) {
            d.eliminado = 1;
            d.fechaEliminado = now;
          }
        });
        resps.forEach(r => {
          if (idSet.has(r.idDocente)) {
            r.eliminado = 1;
          }
        });

        fs.writeFileSync(docFile, JSON.stringify(docs, null, 2), 'utf8');
        fs.writeFileSync(respFile, JSON.stringify(resps, null, 2), 'utf8');

        console.log(`[PAPELERA MOVER] Enviados ${ids.length} docentes a la papelera local.`);
        notificarClientesSSE({ type: 'docente_deleted', ids, ts: Date.now() });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: true, mensaje: `Se enviaron ${ids.length} registro(s) a la papelera.`, eliminados: ids.length, ids }));
      } catch (err) {
        console.error('[DELETE ERROR]', err);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint API: Restaurar registros desde la papelera
  if (req.method === 'POST' && (pathname === '/api/papelera/restaurar' || pathname === '/api/restaurar-docentes')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const ids = Array.isArray(payload.ids)
          ? payload.ids.filter(id => typeof id === 'string' && id.trim())
          : (payload.id ? [payload.id] : []);

        if (ids.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
          res.end(JSON.stringify({ ok: false, error: 'No se indicaron IDs para restaurar.' }));
          return;
        }

        const idSet = new Set(ids);
        const docFile = path.join(DATA_DIR, 'docentes.json');
        const respFile = path.join(DATA_DIR, 'respuestas.json');

        let docs = fs.existsSync(docFile) ? JSON.parse(fs.readFileSync(docFile, 'utf8')) : [];
        let resps = fs.existsSync(respFile) ? JSON.parse(fs.readFileSync(respFile, 'utf8')) : [];

        docs.forEach(d => {
          if (idSet.has(d.id)) {
            d.eliminado = 0;
            delete d.fechaEliminado;
          }
        });
        resps.forEach(r => {
          if (idSet.has(r.idDocente)) {
            d.eliminado = 0;
          }
        });

        fs.writeFileSync(docFile, JSON.stringify(docs, null, 2), 'utf8');
        fs.writeFileSync(respFile, JSON.stringify(resps, null, 2), 'utf8');

        console.log(`[PAPELERA RESTAURAR] Restaurados ${ids.length} docentes.`);
        notificarClientesSSE({ type: 'docente_deleted', ids, ts: Date.now() });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: true, mensaje: `Se restauraron ${ids.length} registro(s) exitosamente.`, restaurados: ids.length, ids }));
      } catch (err) {
        console.error('[RESTORE ERROR]', err);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint API: Purgar / vaciar papelera definitivamente
  if (req.method === 'POST' && (pathname === '/api/papelera/purgar' || pathname === '/api/purgar-papelera')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const purgarTodos = Boolean(payload && payload.all);
        const ids = Array.isArray(payload.ids)
          ? payload.ids.filter(id => typeof id === 'string' && id.trim())
          : (payload.id ? [payload.id] : []);

        const docFile = path.join(DATA_DIR, 'docentes.json');
        const respFile = path.join(DATA_DIR, 'respuestas.json');

        let docs = fs.existsSync(docFile) ? JSON.parse(fs.readFileSync(docFile, 'utf8')) : [];
        let resps = fs.existsSync(respFile) ? JSON.parse(fs.readFileSync(respFile, 'utf8')) : [];

        if (purgarTodos) {
          const idsPurgar = new Set(docs.filter(d => d.eliminado === 1).map(d => d.id));
          docs = docs.filter(d => d.eliminado !== 1);
          resps = resps.filter(r => !idsPurgar.has(r.idDocente));
        } else if (ids.length > 0) {
          const idSet = new Set(ids);
          docs = docs.filter(d => !idSet.has(d.id));
          resps = resps.filter(r => !idSet.has(r.idDocente));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
          res.end(JSON.stringify({ ok: false, error: 'No se indicaron registros para purgar.' }));
          return;
        }

        fs.writeFileSync(docFile, JSON.stringify(docs, null, 2), 'utf8');
        fs.writeFileSync(respFile, JSON.stringify(resps, null, 2), 'utf8');

        console.log(`[PAPELERA PURGAR] Purgada papelera local.`);
        notificarClientesSSE({ type: 'docente_deleted', ts: Date.now() });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: true, mensaje: 'Papelera purgada exitosamente.' }));
      } catch (err) {
        console.error('[PURGE ERROR]', err);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint API: Eliminar datos de prueba / reiniciar base de datos para recolección real
  if (req.method === 'POST' && (pathname === '/api/reset' || pathname === '/api/clear' || pathname === '/api/eliminar-datos')) {
    try {
      const docentesFile = path.join(DATA_DIR, 'docentes.json');
      const respuestasFile = path.join(DATA_DIR, 'respuestas.json');
      const talleresFile = path.join(DATA_DIR, 'talleres.json');

      const backupsDir = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      let conteoDocentes = 0;
      let conteoRespuestas = 0;
      let conteoTalleres = 0;

      // Generar copia de seguridad preventiva antes de limpiar
      if (fs.existsSync(docentesFile)) {
        const docRaw = fs.readFileSync(docentesFile, 'utf8');
        try {
          const docParsed = JSON.parse(docRaw);
          conteoDocentes = Array.isArray(docParsed) ? docParsed.length : 0;
        } catch (e) {}
        fs.writeFileSync(path.join(backupsDir, `docentes_backup_${ts}.json`), docRaw, 'utf8');
      }
      if (fs.existsSync(respuestasFile)) {
        const respRaw = fs.readFileSync(respuestasFile, 'utf8');
        try {
          const respParsed = JSON.parse(respRaw);
          conteoRespuestas = Array.isArray(respParsed) ? respParsed.length : 0;
        } catch (e) {}
        fs.writeFileSync(path.join(backupsDir, `respuestas_backup_${ts}.json`), respRaw, 'utf8');
      }
      if (fs.existsSync(talleresFile)) {
        const tallRaw = fs.readFileSync(talleresFile, 'utf8');
        try {
          const tallParsed = JSON.parse(tallRaw);
          conteoTalleres = Array.isArray(tallParsed) ? tallParsed.length : 0;
        } catch (e) {}
        fs.writeFileSync(path.join(backupsDir, `talleres_backup_${ts}.json`), tallRaw, 'utf8');
      }

      // Vaciar los registros dejando arreglos vacíos listos para datos reales
      fs.writeFileSync(docentesFile, JSON.stringify([], null, 2), 'utf8');
      fs.writeFileSync(respuestasFile, JSON.stringify([], null, 2), 'utf8');
      fs.writeFileSync(talleresFile, JSON.stringify([], null, 2), 'utf8');

      console.log(`[RESET OK] Data de prueba eliminada (${conteoDocentes} docentes, ${conteoRespuestas} respuestas, ${conteoTalleres} talleres respaldados en /data/backups/). Plataforma lista para recibir datos reales.`);
      notificarClientesSSE({ type: 'data_reset', timestamp: new Date().toISOString() });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({
        ok: true,
        mensaje: 'Data de prueba eliminada exitosamente. La base de datos está lista para recibir respuestas reales.',
        eliminados: {
          docentes: conteoDocentes,
          respuestas: conteoRespuestas,
          talleres: conteoTalleres
        },
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('[RESET ERROR]', err);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // Servir archivos estáticos
  let rutaSolicitada = pathname === '/' ? 'index.html' : pathname;
  if (pathname === '/dashboard' || pathname === '/resultados') rutaSolicitada = 'dashboard.html';
  let filePath = path.join(PUBLIC_DIR, rutaSolicitada);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Recurso no encontrado');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Error interno del servidor');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor local activo en: http://localhost:${PORT}`);
});
