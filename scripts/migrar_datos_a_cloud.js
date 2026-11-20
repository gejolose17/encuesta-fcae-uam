/**
 * SCRIPT DE MIGRACIÓN / SEEDING A CLOUDFLARE D1
 * Sube todas las respuestas locales históricas (docentes.json, respuestas.json, talleres.json)
 * directamente a la base de datos Cloudflare D1 en producción a través de /api/sync.
 *
 * Uso:
 *   node scripts/migrar_datos_a_cloud.js
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = (process.argv[2] || process.env.ENCUESTA_PROD_URL || 'https://encuesta-fcae-uam.gelopsequeira.workers.dev').replace(/\/+$/, '');
const DATA_DIR = path.join(__dirname, '..', 'data');

async function main() {
  const docentesFile = path.join(DATA_DIR, 'docentes.json');
  const respuestasFile = path.join(DATA_DIR, 'respuestas.json');
  const talleresFile = path.join(DATA_DIR, 'talleres.json');

  const docentes = fs.existsSync(docentesFile) ? JSON.parse(fs.readFileSync(docentesFile, 'utf8')) : [];
  const respuestas = fs.existsSync(respuestasFile) ? JSON.parse(fs.readFileSync(respuestasFile, 'utf8')) : [];
  const talleres = fs.existsSync(talleresFile) ? JSON.parse(fs.readFileSync(talleresFile, 'utf8')) : [];

  console.log(`\n[MIGRACIÓN D1] Preparando sincronización a: ${BASE_URL}/api/sync`);
  console.log(`  • Docentes a subir:   ${docentes.length}`);
  console.log(`  • Respuestas a subir: ${respuestas.length}`);
  console.log(`  • Talleres a subir:   ${talleres.length}`);

  if (docentes.length === 0 && respuestas.length === 0 && talleres.length === 0) {
    console.log('[MIGRACIÓN D1] No hay registros locales para migrar.');
    return;
  }

  const res = await fetch(`${BASE_URL}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docentes, respuestas, talleres })
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${bodyText}`);
  }

  const result = JSON.parse(bodyText);
  console.log(`\n[MIGRACIÓN D1 OK] Datos insertados exitosamente en Cloudflare D1:`, result);
  console.log(`Todos los dispositivos (móvil, computadoras) ahora verán esta información de inmediato.\n`);
}

main().catch(err => {
  console.error('\n[MIGRACIÓN D1 ERROR]', err.message || err);
  process.exit(1);
});
