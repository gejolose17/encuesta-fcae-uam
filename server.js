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
    res.end(JSON.stringify({
      ok: true,
      generado: new Date().toISOString(),
      docentes: leer('docentes.json'),
      respuestas: leer('respuestas.json'),
      talleres: leer('talleres.json')
    }));
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
