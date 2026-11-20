/**
 * SCRIPT DE RESGUARDO LOCAL DE RESPUESTAS EN PRODUCCIÓN
 * Descarga las respuestas desde Cloudflare D1 (/api/resultados)
 * y las resguarda en /data/ (docentes.json, respuestas.json, talleres.json)
 * preservando los registros existentes (fusión sin duplicados)
 * y generando además una copia histórica inmutable en /data/backups/.
 *
 * Uso:
 *   node scripts/resguardar_respuestas.js
 *   node scripts/resguardar_respuestas.js --desde=2026-11-19
 *   node scripts/resguardar_respuestas.js --todas
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name, defVal) {
  const pref = `--${name}=`;
  const found = args.find(a => a.startsWith(pref));
  return found ? found.slice(pref.length).trim() : defVal;
}
const traerTodas = args.includes('--todas') || args.includes('--all');

const BASE_URL = getArg('url', process.env.ENCUESTA_PROD_URL || 'https://encuesta-fcae-uam.gelopsequeira.workers.dev').replace(/\/+$/, '');
const DESDE = traerTodas ? '' : getArg('desde', '');
const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

async function main() {
  const queryParam = DESDE ? `?desde=${encodeURIComponent(DESDE)}` : '';
  const endpoint = `${BASE_URL}/api/resultados${queryParam}`;
  console.log(`\n[RESGUARDO] Consultando producción: ${endpoint}`);

  const res = await fetch(endpoint, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) {
    throw new Error(`El servidor respondió HTTP ${res.status} (${res.statusText}).`);
  }

  const data = await res.json();
  if (!data || !data.ok || !Array.isArray(data.docentes)) {
    throw new Error(`Respuesta inválida del endpoint: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const docentesRemotos = data.docentes;
  const respuestasRemotas = data.respuestas || [];
  const talleresRemotos = data.talleres || [];

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const docentesFile = path.join(DATA_DIR, 'docentes.json');
  const respuestasFile = path.join(DATA_DIR, 'respuestas.json');
  const talleresFile = path.join(DATA_DIR, 'talleres.json');

  // Fusión segura: conservar registros existentes y agregar o actualizar los remotos
  const docentesPrevios = fs.existsSync(docentesFile) ? JSON.parse(fs.readFileSync(docentesFile, 'utf8') || '[]') : [];
  const mapDocentes = new Map(docentesPrevios.map(d => [d.id, d]));
  docentesRemotos.forEach(d => { if (d && d.id) mapDocentes.set(d.id, d); });
  const docentesFinal = Array.from(mapDocentes.values()).sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  const respuestasPrevias = fs.existsSync(respuestasFile) ? JSON.parse(fs.readFileSync(respuestasFile, 'utf8') || '[]') : [];
  const setClavesResp = new Set(respuestasPrevias.map(r => `${r.idDocente}_${r.asignatura}_${r.matriz}_${r.itemNum}`));
  const respuestasFinal = [...respuestasPrevias];
  respuestasRemotas.forEach(r => {
    const k = `${r.idDocente}_${r.asignatura}_${r.matriz}_${r.itemNum}`;
    if (!setClavesResp.has(k)) {
      setClavesResp.add(k);
      respuestasFinal.push(r);
    }
  });

  const talleresPrevios = fs.existsSync(talleresFile) ? JSON.parse(fs.readFileSync(talleresFile, 'utf8') || '[]') : [];
  const mapTalleres = new Map(talleresPrevios.map(t => [t.id || (t.email + '_' + t.nombre), t]));
  talleresRemotos.forEach(t => {
    const k = t.id || (t.email + '_' + t.nombre);
    mapTalleres.set(k, t);
  });
  const talleresFinal = Array.from(mapTalleres.values()).sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  // 1. Copia de respaldo histórica
  const backupFile = path.join(BACKUPS_DIR, `resguardo_${ts}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({
    resguardadoEn: new Date().toISOString(),
    filtroDesde: DESDE || 'todos',
    totales: {
      docentes: docentesFinal.length,
      respuestas: respuestasFinal.length,
      talleres: talleresFinal.length
    },
    docentes: docentesFinal,
    respuestas: respuestasFinal,
    talleres: talleresFinal
  }, null, 2), 'utf8');

  // 2. Guardar archivos consolidados oficiales en /data/
  fs.writeFileSync(docentesFile, JSON.stringify(docentesFinal, null, 2), 'utf8');
  fs.writeFileSync(respuestasFile, JSON.stringify(respuestasFinal, null, 2), 'utf8');
  fs.writeFileSync(talleresFile, JSON.stringify(talleresFinal, null, 2), 'utf8');

  console.log(`\n[RESGUARDO OK] Base consolidada y resguardada:`);
  console.log(`  • Docentes totales:   ${docentesFinal.length}`);
  console.log(`  • Respuestas totales: ${respuestasFinal.length}`);
  console.log(`  • Talleres totales:   ${talleresFinal.length}`);
  console.log(`  • Copia histórica:    ${backupFile}`);
  console.log(`  • Archivos locales actualizados en /data/*.json\n`);
}

main().catch(err => {
  console.error('\n[RESGUARDO ERROR]', err.message || err);
  process.exit(1);
});
