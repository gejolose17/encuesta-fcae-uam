/**
 * SCRIPT DE RESGUARDO LOCAL DE RESPUESTAS EN PRODUCCIÓN
 * Descarga las respuestas desde Cloudflare Pages (/api/resultados?desde=2026-11-19)
 * y las resguarda en /data/ (docentes.json, respuestas.json, talleres.json)
 * generando además una copia histórica inmutable en /data/backups/.
 *
 * Uso:
 *   node scripts/resguardar_respuestas.js --url=https://encuesta-fcae-uam.pages.dev --desde=2026-11-19
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name, defVal) {
  const pref = `--${name}=`;
  const found = args.find(a => a.startsWith(pref));
  return found ? found.slice(pref.length).trim() : defVal;
}

const BASE_URL = getArg('url', process.env.ENCUESTA_PROD_URL || 'https://encuesta-fcae-uam.gelopsequeira.workers.dev').replace(/\/+$/, '');
const DESDE = getArg('desde', '2026-11-19');
const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

async function main() {
  const endpoint = `${BASE_URL}/api/resultados?desde=${encodeURIComponent(DESDE)}`;
  console.log(`\n[RESGUARDO] Consultando producción: ${endpoint}`);

  const res = await fetch(endpoint, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) {
    throw new Error(`El servidor respondió HTTP ${res.status} (${res.statusText}). Verifica que el binding D1 (DB) esté activo en Cloudflare Pages.`);
  }

  const data = await res.json();
  if (!data || !data.ok || !Array.isArray(data.docentes)) {
    throw new Error(`Respuesta inválida del endpoint: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const docentes = data.docentes.filter(d => !d.timestamp || d.timestamp >= `${DESDE}T00:00:00.000Z`);
  const idsValidos = new Set(docentes.map(d => d.id));
  const respuestas = (data.respuestas || []).filter(r => idsValidos.has(r.idDocente));
  const talleres = (data.talleres || []).filter(t => !t.timestamp || t.timestamp >= `${DESDE}T00:00:00.000Z`);

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  // 1. Copia histórica en data/backups/
  const backupFile = path.join(BACKUPS_DIR, `resguardo_${DESDE}_a_${ts}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    resguardadoEn: new Date().toISOString(),
    desde: DESDE,
    origen: endpoint,
    totales: {
      docentes: docentes.length,
      respuestas: respuestas.length,
      talleres: talleres.length
    },
    docentes,
    respuestas,
    talleres
  }, null, 2), 'utf8');

  // 2. Actualizar archivos oficiales del repositorio local (alimentan el tablero)
  fs.writeFileSync(path.join(DATA_DIR, 'docentes.json'), JSON.stringify(docentes, null, 2), 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, 'respuestas.json'), JSON.stringify(respuestas, null, 2), 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, 'talleres.json'), JSON.stringify(talleres, null, 2), 'utf8');

  console.log(`[RESGUARDO OK] Desde ${DESDE} al corriente:`);
  console.log(`  • Docentes:   ${docentes.length}`);
  console.log(`  • Respuestas: ${respuestas.length}`);
  console.log(`  • Talleres:   ${talleres.length}`);
  console.log(`  • Backup:     ${backupFile}`);
  console.log(`  • Tablero local actualizado en /data/*.json\n`);
}

main().catch(err => {
  console.error('\n[RESGUARDO ERROR]', err.message || err);
  process.exit(1);
});

