/**
 * TESIS DOCTORAL - FCAE / UAM
 * Tablero analítico de resultados (vista independiente de la encuesta)
 * - Lee /api/resultados (servidor Node local), o los JSON de /data como respaldo,
 *   o google.script.run.getDashboardData() si se publica en Google Apps Script.
 * - Visualizaciones: Chart.js (pastel, dona, barras apiladas, divergentes, radar,
 *   burbujas, líneas) + Sankey, esquema del modelo y mapas de calor en SVG/HTML propios.
 */
(function () {
  'use strict';

  // ==========================================================================
  // 1. CONFIGURACIÓN
  // ==========================================================================
  const SECCIONES = {
    q3: {
      key: 'q3', codigo: 'Q3', prefijo: 'C', titulo: 'Competencias investigativas del docente',
      desc: 'Autopercepción del profesorado sobre sus competencias investigativas (7 ítems, una respuesta por docente).',
      items: ITEMS_Q3, escala: ESCALAS.acuerdo, escalaNombre: 'Escala de acuerdo 1–7', porAsignatura: false
    },
    A: {
      key: 'A', codigo: 'Matriz A', prefijo: 'A', titulo: 'Práctica docente por asignatura',
      desc: 'Frecuencia con que el docente integra prácticas de investigación formativa en cada asignatura (12 ítems × asignatura).',
      items: ITEMS_MATRIZ_A, escala: ESCALAS.frecuencia, escalaNombre: 'Escala de frecuencia 1–7', porAsignatura: true
    },
    B: {
      key: 'B', codigo: 'Matriz B', prefijo: 'B', titulo: 'Estrategias de investigación formativa',
      desc: 'Nivel de dominio de estrategias didácticas de investigación formativa en cada asignatura (16 ítems × asignatura).',
      items: ITEMS_MATRIZ_B, escala: ESCALAS.dominio, escalaNombre: 'Escala de dominio 1–7', porAsignatura: true
    },
    q6: {
      key: 'q6', codigo: 'Q6', prefijo: 'E', titulo: 'Valoración del entorno institucional',
      desc: 'Percepción del entorno institucional y curricular para implementar la investigación formativa (10 ítems).',
      items: ITEMS_Q6, escala: ESCALAS.acuerdo, escalaNombre: 'Escala de acuerdo 1–7', porAsignatura: false
    }
  };

  const COLORES_ESCALA = ['#b42318', '#e5533d', '#f4a28c', '#c3ccd4', '#8fd3db', '#25a9b8', '#00707b'];
  const PALETA = ['#0099A8', '#c59b27', '#6c63d9', '#e2674f', '#2fb380', '#a855f7', '#5b7083', '#f59e0b', '#0ea5e9', '#ec4899'];
  const COLORES_FIJOS = {
    'Sí': '#0099A8', 'No': '#e2674f', 'Femenino': '#a855f7', 'Masculino': '#0ea5e9',
    'Bajo (<3.5)': '#e5533d', 'Medio (3.5–5.4)': '#c59b27', 'Alto (≥5.5)': '#0f8f86',
    'No indicado': '#94a3b8', 'Sin dato': '#94a3b8', 'Otro / no clasificado': '#94a3b8'
  };

  const RANGOS_EDAD = ['Menos de 30', '30–39', '40–49', '50–59', '60 o más'];
  const RANGOS_EXP = ['0–5 años', '6–10 años', '11–20 años', 'Más de 20 años'];
  const GRADOS = ['Licenciatura', 'Especialidad', 'Maestría', 'Doctorado', 'Otro / no clasificado'];
  const NIVELES = ['Bajo (<3.5)', 'Medio (3.5–5.4)', 'Alto (≥5.5)', 'Sin dato'];
  const SINO = ['Sí', 'No', 'No indicado'];

  const DIMS = {
    genero: { label: 'Género', get: d => d.genero || 'No indicado', orden: ['Femenino', 'Masculino', 'No indicado'] },
    rangoEdad: { label: 'Rango de edad', get: d => d.rangoEdad, orden: RANGOS_EDAD },
    grado: { label: 'Grado académico', get: d => d.grado, orden: GRADOS },
    rangoExpDoc: { label: 'Experiencia docente', get: d => d.rangoExpDoc, orden: RANGOS_EXP },
    rangoExpProf: { label: 'Experiencia profesional', get: d => d.rangoExpProf, orden: RANGOS_EXP },
    colabInterna: { label: 'Colab. investigación interna', get: d => d.colabInterna || 'No indicado', orden: SINO },
    colabExterna: { label: 'Colab. investigación externa', get: d => d.colabExterna || 'No indicado', orden: SINO },
    publicaciones: { label: 'Publicaciones (3 años)', get: d => d.publicaciones || 'No indicado', orden: SINO },
    nivelQ3: { label: 'Nivel competencias (Q3)', get: d => nivel(d.mQ3), orden: NIVELES },
    nivelA: { label: 'Nivel práctica (A)', get: d => nivel(d.mA), orden: NIVELES },
    nivelB: { label: 'Nivel estrategias (B)', get: d => nivel(d.mB), orden: NIVELES },
    nivelQ6: { label: 'Nivel entorno (Q6)', get: d => nivel(d.mQ6), orden: NIVELES }
  };

  const FILTROS_GLOBALES = ['genero', 'rangoEdad', 'grado', 'rangoExpDoc', 'colabInterna', 'colabExterna', 'publicaciones'];

  const VISTAS_LIKERT = ['q3', 'A', 'B', 'q6'];

  // ==========================================================================
  // 2. ESTADO
  // ==========================================================================
  const seccionInicial = () => ({ modo: 'stack100', orden: 'orig', comparar: 'genero', foco: 0, asignaturas: [] });

  const state = {
    docentes: [],
    asignaturas: [],
    talleres: [],
    generado: null,
    filtros: { desde: '', hasta: '' },
    vista: 'resumen',
    secciones: { q3: seccionInicial(), A: seccionInicial(), B: seccionInicial(), q6: seccionInicial() },
    sankeyCols: ['genero', 'grado', 'colabInterna', 'nivelQ3'],
    radarDim: 'genero',
    tema: leerLS('dash_tema') || 'light'
  };
  FILTROS_GLOBALES.forEach(k => { state.filtros[k] = ''; });

  let charts = [];

  // ==========================================================================
  // 3. UTILIDADES
  // ==========================================================================
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esNum = v => typeof v === 'number' && isFinite(v);

  function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardarLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function aNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }

  function media(a) { const v = a.filter(esNum); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; }
  function mediana(a) {
    const v = a.filter(esNum).sort((x, y) => x - y);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  function varianza(a) {
    const v = a.filter(esNum);
    if (v.length < 2) return null;
    const m = media(v);
    return v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1);
  }
  function desv(a) { const vr = varianza(a); return vr === null ? null : Math.sqrt(vr); }
  function pct(n, t) { return t ? (n * 100) / t : 0; }
  function fmt(v, d) { return esNum(v) ? v.toFixed(d === undefined ? 2 : d) : '—'; }

  function nivel(m) {
    if (!esNum(m)) return 'Sin dato';
    if (m < 3.5) return 'Bajo (<3.5)';
    if (m < 5.5) return 'Medio (3.5–5.4)';
    return 'Alto (≥5.5)';
  }

  function normTexto(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function truncar(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function envolver(s, n) {
    const palabras = String(s || '').split(' ');
    const lineas = [];
    let actual = '';
    palabras.forEach(p => {
      if ((actual + ' ' + p).trim().length > (n || 58)) { if (actual) lineas.push(actual); actual = p; }
      else actual = (actual + ' ' + p).trim();
    });
    if (actual) lineas.push(actual);
    return lineas;
  }

  function hexARgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbAHex(r) { return '#' + r.map(x => Math.round(x).toString(16).padStart(2, '0')).join(''); }
  function alfa(hex, a) { const [r, g, b] = hexARgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function mezclar(a, b, t) { const x = hexARgb(a), y = hexARgb(b); return rgbAHex(x.map((v, i) => v + (y[i] - v) * t)); }
  function colorMedia(m) {
    if (!esNum(m)) return '#94a3b8';
    const pos = Math.min(Math.max(m, 1), 7) - 1;
    const i = Math.min(Math.floor(pos), 5);
    return mezclar(COLORES_ESCALA[i], COLORES_ESCALA[i + 1], pos - i);
  }
  function textoContraste(color) {
    if (typeof color !== 'string' || color[0] !== '#' || color.length !== 7) return '#ffffff';
    const [r, g, b] = hexARgb(color);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#0f2530' : '#ffffff';
  }
  function cssVar(n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); }

  function colorCategoria(dimKey, valor, idx) {
    if (COLORES_FIJOS[valor]) return COLORES_FIJOS[valor];
    const orden = DIMS[dimKey] ? DIMS[dimKey].orden : [];
    const i = orden.indexOf(valor);
    return PALETA[(i >= 0 ? i : idx) % PALETA.length];
  }

  function fechaCorta(f) {
    if (!f) return '';
    const d = new Date(f + 'T12:00:00');
    return isNaN(d) ? f : d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short' });
  }

  function pearson(xs, ys) {
    const p = [];
    xs.forEach((x, i) => { if (esNum(x) && esNum(ys[i])) p.push([x, ys[i]]); });
    if (p.length < 3) return null;
    const mx = media(p.map(q => q[0])), my = media(p.map(q => q[1]));
    let sxy = 0, sxx = 0, syy = 0;
    p.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
    if (!sxx || !syy) return null;
    return sxy / Math.sqrt(sxx * syy);
  }

  function cronbach(filas) {
    if (!filas.length) return null;
    const k = filas[0].length;
    const completas = filas.filter(f => f.length === k && f.every(esNum));
    if (k < 2 || completas.length < 3) return null;
    let sumaVar = 0;
    for (let j = 0; j < k; j++) sumaVar += varianza(completas.map(f => f[j])) || 0;
    const vt = varianza(completas.map(f => f.reduce((a, b) => a + b, 0)));
    if (!vt) return null;
    return (k / (k - 1)) * (1 - sumaVar / vt);
  }

  function interpretarAlfa(a) {
    if (!esNum(a)) return 'Requiere ≥3 casos con varianza';
    if (a >= 0.9) return 'Excelente';
    if (a >= 0.8) return 'Bueno';
    if (a >= 0.7) return 'Aceptable';
    if (a >= 0.6) return 'Cuestionable';
    return 'Bajo';
  }

  function ordenIdx(orden, v) { const i = orden.indexOf(v); return i < 0 ? 999 : i; }

  // ==========================================================================
  // 4. PREPARACIÓN DE DATOS
  // ==========================================================================
  function clasGrado(txt) {
    const t = normTexto(txt);
    if (!t) return 'Otro / no clasificado';
    if (/doctorado|\bphd\b|ph\.d|\bdr\.?\s|\bdra\.?\s/.test(t)) return 'Doctorado';
    if (/maestr|master|magist|\bmsc\b|\bmba\b|doctorando/.test(t)) return 'Maestría';
    if (/especiali|posgrado|postgrado|diplomado/.test(t)) return 'Especialidad';
    if (/licenc|ingenier|\blic\b|\bing\b|arquitect|bachiller|grado/.test(t)) return 'Licenciatura';
    return 'Otro / no clasificado';
  }
  function rangoEdad(e) {
    if (!esNum(e)) return 'No indicado';
    if (e < 30) return RANGOS_EDAD[0];
    if (e < 40) return RANGOS_EDAD[1];
    if (e < 50) return RANGOS_EDAD[2];
    if (e < 60) return RANGOS_EDAD[3];
    return RANGOS_EDAD[4];
  }
  function rangoExp(a) {
    if (!esNum(a)) return 'No indicado';
    if (a <= 5) return RANGOS_EXP[0];
    if (a <= 10) return RANGOS_EXP[1];
    if (a <= 20) return RANGOS_EXP[2];
    return RANGOS_EXP[3];
  }
  function arrNum(a, n) {
    const out = new Array(n).fill(null);
    if (Array.isArray(a)) a.slice(0, n).forEach((v, i) => { out[i] = aNum(v); });
    return out;
  }

  function preparar(raw) {
    const catalogo = new Map();
    const matPorDoc = new Map();

    (raw.respuestas || []).forEach(r => {
      if (!r || !r.idDocente) return;
      const nombre = String(r.asignatura || '').trim() || 'Sin nombre';
      const key = normTexto(nombre);
      if (!catalogo.has(key)) catalogo.set(key, { key, nombre });
      if (!matPorDoc.has(r.idDocente)) matPorDoc.set(r.idDocente, new Map());
      const m = matPorDoc.get(r.idDocente);
      if (!m.has(key)) {
        m.set(key, { key, nombre, A: new Array(ITEMS_MATRIZ_A.length).fill(null), B: new Array(ITEMS_MATRIZ_B.length).fill(null) });
      }
      const reg = m.get(key);
      const arr = r.matriz === 'A' ? reg.A : r.matriz === 'B' ? reg.B : null;
      const idx = Number(r.itemNum) - 1;
      if (arr && idx >= 0 && idx < arr.length) arr[idx] = aNum(r.valor);
    });

    const docentes = (raw.docentes || []).filter(d => d && d.id).map(d => {
      const edad = aNum(d.edad), expDoc = aNum(d.expDocente), expProf = aNum(d.expProfesional);
      const mats = matPorDoc.has(d.id) ? Array.from(matPorDoc.get(d.id).values()) : [];
      const doc = Object.assign({}, d, {
        edad, expDocente: expDoc, expProfesional: expProf,
        q3: arrNum(d.q3, ITEMS_Q3.length),
        q6: arrNum(d.q6, ITEMS_Q6.length),
        grado: clasGrado(d.gradoAcademico),
        rangoEdad: rangoEdad(edad),
        rangoExpDoc: rangoExp(expDoc),
        rangoExpProf: rangoExp(expProf),
        fecha: String(d.timestamp || '').slice(0, 10),
        matrices: mats
      });
      doc.mQ3 = media(doc.q3);
      doc.mQ6 = media(doc.q6);
      doc.mA = media(mats.flatMap(m => m.A));
      doc.mB = media(mats.flatMap(m => m.B));
      return doc;
    });

    return {
      docentes,
      asignaturas: Array.from(catalogo.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    };
  }

  function docentesFiltrados() {
    const f = state.filtros;
    return state.docentes.filter(d => {
      for (const k of FILTROS_GLOBALES) if (f[k] && DIMS[k].get(d) !== f[k]) return false;
      if (f.desde && d.fecha && d.fecha < f.desde) return false;
      if (f.hasta && d.fecha && d.fecha > f.hasta) return false;
      return true;
    });
  }

  function categorias(dimKey, docs) {
    const dim = DIMS[dimKey];
    const conteo = new Map();
    docs.forEach(d => { const v = dim.get(d); conteo.set(v, (conteo.get(v) || 0) + 1); });
    return Array.from(conteo.keys())
      .sort((a, b) => ordenIdx(dim.orden, a) - ordenIdx(dim.orden, b) || String(a).localeCompare(String(b), 'es'))
      .map(v => ({ valor: v, n: conteo.get(v) }));
  }

  /** Registros de una sección: una fila por docente (Q3/Q6) o por docente × asignatura (A/B). */
  function registros(key, docs, ignorarAsig) {
    const S = SECCIONES[key];
    if (!S.porAsignatura) {
      return docs.map(d => ({ doc: d, asig: null, valores: d[key] })).filter(r => r.valores.some(esNum));
    }
    const sel = ignorarAsig ? [] : state.secciones[key].asignaturas;
    const out = [];
    docs.forEach(d => d.matrices.forEach(m => {
      if (sel.length && sel.indexOf(m.key) < 0) return;
      if (m[key].some(esNum)) out.push({ doc: d, asig: m.key, asigNombre: m.nombre, valores: m[key] });
    }));
    return out;
  }

  function contarDist(vals) {
    const dist = [0, 0, 0, 0, 0, 0, 0];
    vals.forEach(v => { if (esNum(v) && v >= 1 && v <= 7) dist[Math.round(v) - 1]++; });
    return dist;
  }

  function statsItems(S, regs) {
    return S.items.map((texto, i) => {
      const vals = regs.map(r => r.valores[i]).filter(esNum);
      const dist = contarDist(vals);
      const n = vals.length;
      return {
        i, num: i + 1, codigo: S.prefijo + (i + 1), texto, n, dist,
        media: media(vals), mediana: mediana(vals), sd: desv(vals),
        fav: pct(dist[4] + dist[5] + dist[6], n), desf: pct(dist[0] + dist[1] + dist[2], n), neutro: pct(dist[3], n)
      };
    });
  }

  // ==========================================================================
  // 5. CHART.JS: TEMA Y PLUGINS PROPIOS
  // ==========================================================================
  const pluginEtiquetasPct = {
    id: 'etiquetasPct',
    defaults: { display: false },
    afterDatasetsDraw(chart, args, opts) {
      if (!opts.display) return;
      const ctx = chart.ctx;
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        const total = ds.data.reduce((a, b, i) => a + (chart.getDataVisibility(i) ? (+b || 0) : 0), 0);
        meta.data.forEach((arc, i) => {
          const v = +ds.data[i] || 0;
          if (!total || !v || !chart.getDataVisibility(i)) return;
          const p = (v * 100) / total;
          if (p < 6) return;
          const pos = arc.tooltipPosition();
          const bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
          ctx.save();
          ctx.font = '700 12px Inter, sans-serif';
          ctx.fillStyle = textoContraste(bg);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(Math.round(p) + '%', pos.x, pos.y);
          ctx.restore();
        });
      });
    }
  };

  const pluginTextoCentro = {
    id: 'textoCentro',
    defaults: { texto: null, sub: '' },
    afterDraw(chart, args, opts) {
      if (!opts.texto) return;
      const { ctx, chartArea: ca } = chart;
      const x = (ca.left + ca.right) / 2, y = (ca.top + ca.bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = cssVar('--text');
      ctx.font = '700 24px Outfit, sans-serif';
      ctx.fillText(opts.texto, x, opts.sub ? y - 7 : y);
      if (opts.sub) {
        ctx.fillStyle = cssVar('--muted');
        ctx.font = '500 11px Inter, sans-serif';
        ctx.fillText(opts.sub, x, y + 13);
      }
      ctx.restore();
    }
  };

  const pluginEtiquetasBarra = {
    id: 'etiquetasBarra',
    defaults: { display: false, min: 7, formato: null },
    afterDatasetsDraw(chart, args, opts) {
      if (!opts.display) return;
      const ctx = chart.ctx;
      const horiz = chart.options.indexAxis === 'y';
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden || meta.type !== 'bar') return;
        meta.data.forEach((el, i) => {
          const raw = ds.data[i];
          if (Math.abs(+raw || 0) < opts.min) return;
          const p = el.getProps(['x', 'y', 'base'], true);
          const cx = horiz ? (p.x + p.base) / 2 : p.x;
          const cy = horiz ? p.y : (p.y + p.base) / 2;
          const bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
          const txt = opts.formato ? opts.formato(raw, di, i) : String(Math.round(Math.abs(raw)));
          if (!txt) return;
          ctx.save();
          ctx.font = '600 10.5px Inter, sans-serif';
          ctx.fillStyle = textoContraste(bg);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, cx, cy);
          ctx.restore();
        });
      });
    }
  };

  const pluginLineaRef = {
    id: 'lineaRef',
    defaults: { valor: null, eje: 'x', texto: '' },
    afterDatasetsDraw(chart, args, opts) {
      if (opts.valor === null || opts.valor === undefined) return;
      const sc = chart.scales[opts.eje];
      if (!sc) return;
      const p = sc.getPixelForValue(opts.valor);
      const { ctx, chartArea: ca } = chart;
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#c59b27';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (opts.eje === 'x') { ctx.moveTo(p, ca.top); ctx.lineTo(p, ca.bottom); }
      else { ctx.moveTo(ca.left, p); ctx.lineTo(ca.right, p); }
      ctx.stroke();
      if (opts.texto) {
        ctx.setLineDash([]);
        ctx.fillStyle = '#c59b27';
        ctx.font = '600 10.5px Inter, sans-serif';
        ctx.textAlign = opts.eje === 'x' ? 'center' : 'right';
        ctx.fillText(opts.texto, opts.eje === 'x' ? p : ca.right, opts.eje === 'x' ? ca.top - 5 : p - 5);
      }
      ctx.restore();
    }
  };

  function aplicarTemaCharts() {
    const oscuro = state.tema === 'dark';
    document.body.classList.toggle('theme-dark', oscuro);
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = oscuro ? '#9fb4bf' : '#5b6b79';
    Chart.defaults.borderColor = oscuro ? 'rgba(255,255,255,0.07)' : 'rgba(15,37,48,0.08)';
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = 700;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 8;
    Chart.defaults.plugins.legend.labels.padding = 14;
    const tt = Chart.defaults.plugins.tooltip;
    tt.backgroundColor = 'rgba(8,28,34,0.94)';
    tt.padding = 10;
    tt.cornerRadius = 10;
    tt.titleFont = { weight: '600' };
    tt.boxPadding = 4;
    Chart.defaults.elements.arc.borderColor = oscuro ? '#101c23' : '#ffffff';
    Chart.defaults.elements.arc.borderWidth = 2;
  }

  function gradV(color) {
    return function (c) {
      const { ctx, chartArea } = c.chart;
      if (!chartArea) return color;
      const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
      g.addColorStop(0, alfa(color, 0.35));
      g.addColorStop(1, color);
      return g;
    };
  }

  function nuevoChart(id, config) {
    const cv = document.getElementById(id);
    if (!cv || typeof Chart === 'undefined') return null;
    const ch = new Chart(cv.getContext('2d'), config);
    charts.push(ch);
    return ch;
  }

  function vacio(id, msg) {
    const cv = document.getElementById(id);
    if (!cv) return;
    cv.style.display = 'none';
    cv.parentElement.insertAdjacentHTML('beforeend', `<div class="empty-msg">${esc(msg || 'Sin datos para los filtros seleccionados.')}</div>`);
  }

  function destruirCharts() { charts.forEach(c => c.destroy()); charts = []; }

  // ==========================================================================
  // 6. PLANTILLAS
  // ==========================================================================
  function card(o) {
    const cuerpo = o.body !== undefined ? o.body :
      `<div class="chart-box ${o.box || ''}" ${o.alto ? `style="height:${o.alto}px"` : ''}><canvas id="${o.id}" role="img" aria-label="${esc(o.titulo)}"></canvas></div>`;
    return `<article class="card ${o.cls || ''}">
      <div class="card-head"><div><h3 class="card-title">${o.titulo}</h3>${o.sub ? `<p class="card-sub">${o.sub}</p>` : ''}</div>${o.extra || ''}</div>
      ${cuerpo}
    </article>`;
  }

  function kpi(o) {
    return `<article class="card kpi" style="--kpi-color:${o.color || 'var(--primary)'}">
      <div class="kpi-label">${o.label}</div>
      <div class="kpi-value">${o.valor}${o.sufijo ? `<small>${o.sufijo}</small>` : ''}</div>
      ${o.pie ? `<div class="kpi-foot">${o.pie}</div>` : ''}
      ${esNum(o.barra) ? `<div class="kpi-bar"><span style="width:${Math.max(0, Math.min(100, o.barra))}%"></span></div>` : ''}
    </article>`;
  }

  function opcionesDims(seleccion, incluirNinguno, textoNinguno) {
    let h = incluirNinguno ? `<option value="">${textoNinguno || '— Ninguno —'}</option>` : '';
    Object.keys(DIMS).forEach(k => { h += `<option value="${k}" ${k === seleccion ? 'selected' : ''}>${esc(DIMS[k].label)}</option>`; });
    return h;
  }

  const barraMedia = m => esNum(m) ? ((m - 1) / 6) * 100 : null;

  // ==========================================================================
  // 7. FILTROS GLOBALES
  // ==========================================================================
  function construirFiltros() {
    const fechas = state.docentes.map(d => d.fecha).filter(Boolean).sort();
    let h = '';
    FILTROS_GLOBALES.forEach(k => {
      const cats = categorias(k, state.docentes);
      if (state.filtros[k] && !cats.some(c => c.valor === state.filtros[k])) state.filtros[k] = '';
      h += `<div class="field ${state.filtros[k] ? 'is-set' : ''}">
        <label for="f-${k}">${esc(DIMS[k].label)}</label>
        <select id="f-${k}" data-filtro="${k}">
          <option value="">Todos</option>
          ${cats.map(c => `<option value="${esc(c.valor)}" ${c.valor === state.filtros[k] ? 'selected' : ''}>${esc(c.valor)} (${c.n})</option>`).join('')}
        </select>
      </div>`;
    });
    const min = fechas[0] || '', max = fechas[fechas.length - 1] || '';
    h += `<div class="field ${state.filtros.desde ? 'is-set' : ''}"><label for="f-desde">Desde</label>
            <input type="date" id="f-desde" data-filtro="desde" min="${min}" max="${max}" value="${state.filtros.desde}"></div>
          <div class="field ${state.filtros.hasta ? 'is-set' : ''}"><label for="f-hasta">Hasta</label>
            <input type="date" id="f-hasta" data-filtro="hasta" min="${min}" max="${max}" value="${state.filtros.hasta}"></div>`;
    $('#filter-grid').innerHTML = h;

    $$('[data-filtro]', $('#filter-grid')).forEach(el => {
      el.addEventListener('change', () => {
        state.filtros[el.dataset.filtro] = el.value;
        el.closest('.field').classList.toggle('is-set', !!el.value);
        render();
      });
    });
  }

  function actualizarResumenFiltros(docs) {
    $('#filter-count').textContent = `${docs.length} de ${state.docentes.length} docentes`;
    let chips = '';
    FILTROS_GLOBALES.forEach(k => {
      if (state.filtros[k]) chips += `<span class="chip">${esc(DIMS[k].label)}: <b>${esc(state.filtros[k])}</b><button type="button" data-quitar="${k}" aria-label="Quitar filtro">✕</button></span>`;
    });
    if (state.filtros.desde) chips += `<span class="chip">Desde: <b>${esc(state.filtros.desde)}</b><button type="button" data-quitar="desde" aria-label="Quitar filtro">✕</button></span>`;
    if (state.filtros.hasta) chips += `<span class="chip">Hasta: <b>${esc(state.filtros.hasta)}</b><button type="button" data-quitar="hasta" aria-label="Quitar filtro">✕</button></span>`;
    $('#active-chips').innerHTML = chips;
    $$('[data-quitar]', $('#active-chips')).forEach(b => b.addEventListener('click', () => {
      state.filtros[b.dataset.quitar] = '';
      construirFiltros();
      render();
    }));
  }

  // ==========================================================================
  // 8. VISTA: RESUMEN GENERAL
  // ==========================================================================
  function renderResumen(docs) {
    const el = $('#view-resumen');
    const allQ3 = docs.flatMap(d => d.q3), allQ6 = docs.flatMap(d => d.q6);
    const allA = docs.flatMap(d => d.matrices.flatMap(m => m.A)), allB = docs.flatMap(d => d.matrices.flatMap(m => m.B));
    const mQ3 = media(allQ3), mA = media(allA), mB = media(allB), mQ6 = media(allQ6);
    const totalAsig = docs.reduce((a, d) => a + d.matrices.length, 0);
    const unicas = new Set(docs.flatMap(d => d.matrices.map(m => m.key))).size;
    const favDe = vals => { const v = vals.filter(esNum); return pct(v.filter(x => x >= 5).length, v.length); };

    el.innerHTML = `
      <div class="view-head"><div>
        <h2 class="view-title">Resumen general</h2>
        <p class="view-desc">Perfil de los docentes participantes y valoración promedio de cada sección del instrumento (escala 1–7).</p>
      </div></div>

      <div class="grid grid-kpi">
        ${kpi({ label: 'Docentes', valor: docs.length, pie: `de ${state.docentes.length} registros totales`, color: '#0099A8', barra: pct(docs.length, state.docentes.length) })}
        ${kpi({ label: 'Asignaturas evaluadas', valor: totalAsig, pie: `${unicas} asignaturas distintas`, color: '#c59b27' })}
        ${kpi({ label: 'Edad promedio', valor: fmt(media(docs.map(d => d.edad)), 1), sufijo: 'años', pie: `Exp. docente: ${fmt(media(docs.map(d => d.expDocente)), 1)} años`, color: '#6c63d9' })}
        <article class="card kpi" style="--kpi-color:#c59b27; cursor:pointer;" data-goto="talleres" title="Ver lista de participantes para talleres colaborativos">
          <div class="kpi-label">Talleres colaborativos ➜</div>
          <div class="kpi-value">${state.talleres ? state.talleres.length : 0}</div>
          <div class="kpi-foot">${state.talleres && state.talleres.length ? 'participantes registrados' : 'sin inscritos aún'}</div>
        </article>
        ${kpi({ label: 'Q3 · Competencias', valor: fmt(mQ3), sufijo: '/ 7', pie: `${fmt(favDe(allQ3), 0)}% favorable (5–7)`, color: colorMedia(mQ3), barra: barraMedia(mQ3) })}
        ${kpi({ label: 'A · Práctica docente', valor: fmt(mA), sufijo: '/ 7', pie: `${fmt(favDe(allA), 0)}% frecuente (5–7)`, color: colorMedia(mA), barra: barraMedia(mA) })}
        ${kpi({ label: 'B · Estrategias', valor: fmt(mB), sufijo: '/ 7', pie: `${fmt(favDe(allB), 0)}% dominio alto (5–7)`, color: colorMedia(mB), barra: barraMedia(mB) })}
        ${kpi({ label: 'Q6 · Entorno', valor: fmt(mQ6), sufijo: '/ 7', pie: `${fmt(favDe(allQ6), 0)}% favorable (5–7)`, color: colorMedia(mQ6), barra: barraMedia(mQ6) })}
      </div>

      <div class="grid grid-3">
        ${card({ id: 'g-genero', titulo: 'Distribución por género', sub: 'Gráfico de pastel', box: 'sm' })}
        ${card({ id: 'g-grado', titulo: 'Grado académico', sub: 'Clasificado a partir del texto declarado', box: 'sm' })}
        ${card({ id: 'g-sino', titulo: 'Trayectoria investigativa', sub: 'Últimos 3 años · barras apiladas 100%', box: 'sm' })}
        ${card({ id: 'g-edad', titulo: 'Rangos de edad', sub: 'Número de docentes', box: 'sm' })}
        ${card({ id: 'g-exp', titulo: 'Experiencia docente vs profesional', sub: 'Número de docentes por rango', box: 'sm' })}
        ${card({ id: 'g-dim', titulo: 'Media por sección', sub: 'Línea punteada = punto neutro (4)', box: 'sm' })}
        ${card({ id: 'g-burbuja', titulo: 'Mapa de trayectoria', sub: 'Exp. profesional (x) vs docente (y) · tamaño = edad', cls: 'span-2' })}
        ${card({ id: 'g-tiempo', titulo: 'Recepción de respuestas', sub: 'Por día y acumulado' })}
      </div>`;

    if (!docs.length) {
      ['g-genero', 'g-grado', 'g-sino', 'g-edad', 'g-exp', 'g-dim', 'g-burbuja', 'g-tiempo'].forEach(id => vacio(id));
      return;
    }

    // Pastel género
    const gen = categorias('genero', docs);
    nuevoChart('g-genero', {
      type: 'pie',
      data: { labels: gen.map(c => c.valor), datasets: [{ data: gen.map(c => c.n), backgroundColor: gen.map((c, i) => colorCategoria('genero', c.valor, i)), hoverOffset: 10 }] },
      options: { plugins: { legend: { position: 'bottom' }, etiquetasPct: { display: true } } }
    });

    // Dona grado
    const gr = categorias('grado', docs);
    nuevoChart('g-grado', {
      type: 'doughnut',
      data: { labels: gr.map(c => c.valor), datasets: [{ data: gr.map(c => c.n), backgroundColor: gr.map((c, i) => colorCategoria('grado', c.valor, i)), hoverOffset: 10 }] },
      options: { cutout: '58%', plugins: { legend: { position: 'bottom' }, etiquetasPct: { display: true }, textoCentro: { texto: String(docs.length), sub: 'docentes' } } }
    });

    // Sí/No apiladas
    const preguntas = [['colabInterna', 'Colab. interna'], ['colabExterna', 'Colab. externa'], ['publicaciones', 'Publicaciones']];
    const conteoSN = (k, v) => docs.filter(d => (d[k] || 'No indicado') === v).length;
    nuevoChart('g-sino', {
      type: 'bar',
      data: {
        labels: preguntas.map(p => p[1]),
        datasets: ['Sí', 'No'].map(v => ({
          label: v,
          data: preguntas.map(p => pct(conteoSN(p[0], v), docs.length)),
          conteos: preguntas.map(p => conteoSN(p[0], v)),
          backgroundColor: COLORES_FIJOS[v], borderRadius: 6, borderSkipped: false, barThickness: 26
        }))
      },
      options: {
        indexAxis: 'y',
        scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }, y: { stacked: true, grid: { display: false } } },
        plugins: {
          legend: { position: 'bottom' },
          etiquetasBarra: { display: true, min: 8, formato: v => Math.round(v) + '%' },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.dataset.conteos[c.dataIndex]} docentes (${fmt(c.raw, 0)}%)` } }
        }
      }
    });

    // Edad
    nuevoChart('g-edad', {
      type: 'bar',
      data: { labels: RANGOS_EDAD, datasets: [{ label: 'Docentes', data: RANGOS_EDAD.map(r => docs.filter(d => d.rangoEdad === r).length), backgroundColor: gradV('#6c63d9'), borderRadius: 8, maxBarThickness: 46 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });

    // Experiencia
    nuevoChart('g-exp', {
      type: 'bar',
      data: {
        labels: RANGOS_EXP,
        datasets: [
          { label: 'Docente', data: RANGOS_EXP.map(r => docs.filter(d => d.rangoExpDoc === r).length), backgroundColor: '#0099A8', borderRadius: 6, maxBarThickness: 28 },
          { label: 'Profesional', data: RANGOS_EXP.map(r => docs.filter(d => d.rangoExpProf === r).length), backgroundColor: '#c59b27', borderRadius: 6, maxBarThickness: 28 }
        ]
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });

    // Media por sección
    const dims = [['Q3 Competencias', mQ3, allQ3], ['A Práctica', mA, allA], ['B Estrategias', mB, allB], ['Q6 Entorno', mQ6, allQ6]];
    nuevoChart('g-dim', {
      type: 'bar',
      data: { labels: dims.map(d => d[0]), datasets: [{ label: 'Media', data: dims.map(d => d[1]), backgroundColor: dims.map(d => colorMedia(d[1])), borderRadius: 10, maxBarThickness: 48 }] },
      options: {
        scales: { y: { min: 1, max: 7, ticks: { stepSize: 1 } }, x: { grid: { display: false } } },
        plugins: {
          legend: { display: false },
          lineaRef: { valor: 4, eje: 'y' },
          etiquetasBarra: { display: true, min: 0.1, formato: v => fmt(v) },
          tooltip: { callbacks: { label: c => `Media ${fmt(c.raw)} · ${fmt(favDe(dims[c.dataIndex][2]), 0)}% en 5–7` } }
        }
      }
    });

    // Burbujas
    const genCats = categorias('genero', docs);
    nuevoChart('g-burbuja', {
      type: 'bubble',
      data: {
        datasets: genCats.map((g, i) => {
          const col = colorCategoria('genero', g.valor, i);
          return {
            label: g.valor,
            data: docs.filter(d => DIMS.genero.get(d) === g.valor && esNum(d.expProfesional) && esNum(d.expDocente))
              .map(d => ({ x: d.expProfesional, y: d.expDocente, r: Math.max(6, Math.min(22, ((d.edad || 30) - 15) / 2.4)), edad: d.edad, grado: d.grado })),
            backgroundColor: alfa(col, 0.45), borderColor: col, borderWidth: 2
          };
        })
      },
      options: {
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: c => `${c.dataset.label} · ${c.raw.edad ?? '—'} años · ${c.raw.grado} · Prof. ${c.raw.x} / Doc. ${c.raw.y} años` } }
        },
        scales: {
          x: { beginAtZero: true, title: { display: true, text: 'Años de experiencia profesional' } },
          y: { beginAtZero: true, title: { display: true, text: 'Años de experiencia docente' } }
        }
      }
    });

    // Línea de tiempo
    const porFecha = new Map();
    docs.forEach(d => { if (d.fecha) porFecha.set(d.fecha, (porFecha.get(d.fecha) || 0) + 1); });
    const fechas = Array.from(porFecha.keys()).sort();
    let acum = 0;
    nuevoChart('g-tiempo', {
      type: 'bar',
      data: {
        labels: fechas.map(fechaCorta),
        datasets: [
          { type: 'line', label: 'Acumulado', data: fechas.map(f => (acum += porFecha.get(f))), borderColor: '#c59b27', backgroundColor: alfa('#c59b27', 0.15), fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#c59b27', yAxisID: 'y' },
          { type: 'bar', label: 'Por día', data: fechas.map(f => porFecha.get(f)), backgroundColor: gradV('#0099A8'), borderRadius: 6, maxBarThickness: 30, yAxisID: 'y' }
        ]
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });
  }

  // ==========================================================================
  // 9. VISTA: FLUJOS Y ESQUEMAS
  // ==========================================================================
  function renderFlujos(docs) {
    const el = $('#view-flujos');
    const cols = state.sankeyCols;
    const selCol = (i) => `<div class="field"><label for="sk-col-${i}">Paso ${i + 1}</label>
      <select id="sk-col-${i}" data-skcol="${i}">${opcionesDims(cols[i], i >= 2, '— (ninguno)')}</select></div>`;

    el.innerHTML = `
      <div class="view-head"><div>
        <h2 class="view-title">Flujos y esquemas</h2>
        <p class="view-desc">Recorridos del perfil docente (Sankey), esquema del modelo con medias y correlaciones, y perfiles comparados por grupo.</p>
      </div></div>

      <div class="grid">
        ${card({
          titulo: 'Diagrama de flujo del perfil docente (Sankey)',
          sub: 'Cada banda representa docentes que comparten la combinación de categorías. Pase el cursor sobre nodos y bandas.',
          cls: 'span-all',
          body: `<div class="sankey-controls">${selCol(0)}<span class="arrow">➜</span>${selCol(1)}<span class="arrow">➜</span>${selCol(2)}<span class="arrow">➜</span>${selCol(3)}</div>
                 <div class="svg-wrap" id="sankey-wrap"></div>`
        })}
        ${card({
          titulo: 'Esquema del modelo de investigación formativa',
          sub: 'Media por dimensión (1–7), % de respuestas favorables (5–7) y correlación de Pearson (r) entre dimensiones a nivel docente. Haga clic en un nodo para abrir su sección.',
          cls: 'span-all',
          body: `<div class="svg-wrap" id="schema-wrap"></div>
                 <div class="scale-legend" style="margin-top:10px">
                   <span><i style="background:#0f8f86"></i>Correlación positiva</span>
                   <span><i style="background:#e2674f"></i>Correlación negativa</span>
                   <span><i style="background:#94a3b8"></i>Sin varianza suficiente (r no calculable)</span>
                   <span>Grosor de la flecha ∝ |r|</span>
                 </div>`
        })}
      </div>
      <div class="grid grid-main mt">
        ${card({ titulo: 'Matriz de correlaciones', sub: 'Pearson entre medias por docente y variables de trayectoria', body: '<div class="table-wrap" id="corr-wrap"></div>' })}
        ${card({
          id: 'g-radar-grupo', titulo: 'Perfil por dimensión según grupo', sub: 'Diagrama de radar (1–7)', box: 'lg',
          extra: `<div class="field" style="min-width:150px"><label for="radar-dim">Agrupar por</label><select id="radar-dim">${opcionesDims(state.radarDim)}</select></div>`
        })}
      </div>`;

    $$('[data-skcol]', el).forEach(s => s.addEventListener('change', () => {
      state.sankeyCols[+s.dataset.skcol] = s.value;
      render();
    }));
    $('#radar-dim').addEventListener('change', e => { state.radarDim = e.target.value; render(); });

    $('#sankey-wrap').innerHTML = svgSankey(docs, cols);
    $('#schema-wrap').innerHTML = svgEsquema(docs);
    $('#corr-wrap').innerHTML = tablaCorrelaciones(docs);

    // Radar comparativo
    if (!docs.length) { vacio('g-radar-grupo'); return; }
    const grupos = categorias(state.radarDim, docs);
    nuevoChart('g-radar-grupo', {
      type: 'radar',
      data: {
        labels: ['Q3 Competencias', 'A Práctica', 'B Estrategias', 'Q6 Entorno'],
        datasets: grupos.map((g, i) => {
          const sub = docs.filter(d => DIMS[state.radarDim].get(d) === g.valor);
          const col = colorCategoria(state.radarDim, g.valor, i);
          return {
            label: `${g.valor} (n=${g.n})`,
            data: [media(sub.flatMap(d => d.q3)), media(sub.flatMap(d => d.matrices.flatMap(m => m.A))), media(sub.flatMap(d => d.matrices.flatMap(m => m.B))), media(sub.flatMap(d => d.q6))],
            borderColor: col, backgroundColor: alfa(col, 0.15), pointBackgroundColor: col, borderWidth: 2, pointRadius: 4
          };
        })
      },
      options: {
        scales: { r: { min: 1, max: 7, ticks: { stepSize: 1, backdropColor: 'transparent' }, pointLabels: { font: { size: 12, weight: '600' } } } },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.raw)}` } } }
      }
    });
  }

  function svgSankey(docs, colsSel) {
    const cols = colsSel.filter(Boolean);
    if (!docs.length) return '<div class="state-box">Sin docentes para los filtros seleccionados.</div>';
    if (cols.length < 2) return '<div class="state-box">Seleccione al menos dos pasos para construir el flujo.</div>';

    const W = 1000, padT = 34, padB = 12, padX = 4, nodeW = 16, gap = 14;
    const columnas = cols.map((k, ci) => ({
      key: k,
      nodos: categorias(k, docs).map((c, i) => ({ id: ci + '|' + c.valor, col: ci, valor: c.valor, n: c.n, color: colorCategoria(k, c.valor, i) }))
    }));
    const maxNodos = Math.max.apply(null, columnas.map(c => c.nodos.length));
    const H = Math.max(320, maxNodos * 62 + padT + padB);
    const util = H - padT - padB;
    const escala = Math.min.apply(null, columnas.map(c => (util - (c.nodos.length - 1) * gap) / docs.length));
    const xCol = ci => padX + ci * ((W - 2 * padX - nodeW) / (cols.length - 1));

    columnas.forEach((c, ci) => {
      const total = c.nodos.reduce((a, n) => a + n.n * escala, 0) + (c.nodos.length - 1) * gap;
      let y = padT + (util - total) / 2;
      c.nodos.forEach(n => { n.x = xCol(ci); n.y = y; n.h = Math.max(n.n * escala, 2); n.outY = y; n.inY = y; y += n.h + gap; });
    });

    let defs = '', enlaces = '', nodos = '', titulos = '';
    let gid = 0;
    for (let ci = 0; ci < columnas.length - 1; ci++) {
      const A = columnas[ci], B = columnas[ci + 1];
      A.nodos.forEach(src => {
        B.nodos.forEach(tgt => {
          const n = docs.filter(d => DIMS[A.key].get(d) === src.valor && DIMS[B.key].get(d) === tgt.valor).length;
          if (!n) return;
          const h = n * escala;
          const x0 = src.x + nodeW, x1 = tgt.x, xm = (x0 + x1) / 2;
          const y0 = src.outY, y1 = tgt.inY;
          src.outY += h; tgt.inY += h;
          const id = 'skg' + (gid++);
          defs += `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x0}" x2="${x1}"><stop offset="0" stop-color="${src.color}"/><stop offset="1" stop-color="${tgt.color}"/></linearGradient>`;
          const tip = `<b>${esc(src.valor)} → ${esc(tgt.valor)}</b><br>${n} docente${n === 1 ? '' : 's'} · ${fmt(pct(n, src.n), 0)}% de «${esc(src.valor)}» · ${fmt(pct(n, docs.length), 0)}% del total`;
          enlaces += `<path class="sk-link" data-src="${esc(src.id)}" data-tgt="${esc(tgt.id)}" data-tip="${esc(tip)}" fill="url(#${id})" opacity="0.42"
            d="M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h} C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h} Z"/>`;
        });
      });
    }

    const halo = `paint-order="stroke" stroke="${cssVar('--surface')}" stroke-width="4" stroke-linejoin="round"`;
    columnas.forEach((c, ci) => {
      const ultimo = ci === columnas.length - 1;
      const anchorT = ci === 0 ? 'start' : ultimo ? 'end' : 'middle';
      titulos += `<text class="sk-col-title" x="${ci === 0 ? xCol(ci) : ultimo ? xCol(ci) + nodeW : xCol(ci) + nodeW / 2}" y="16" text-anchor="${anchorT}">${esc(DIMS[c.key].label)}</text>`;
      c.nodos.forEach(n => {
        const tip = `<b>${esc(n.valor)}</b><br>${esc(DIMS[c.key].label)}: ${n.n} docente${n.n === 1 ? '' : 's'} (${fmt(pct(n.n, docs.length), 0)}%)`;
        const lx = ultimo ? n.x - 8 : n.x + nodeW + 8;
        const anchor = ultimo ? 'end' : 'start';
        nodos += `<g class="sk-node" data-id="${esc(n.id)}" data-tip="${esc(tip)}">
          <rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="4" fill="${n.color}"/>
          <text class="sk-label" x="${lx}" y="${n.y + n.h / 2 - (n.h > 30 ? 5 : 0)}" text-anchor="${anchor}" dominant-baseline="middle" ${halo}>${esc(n.valor)}</text>
          ${n.h > 30 ? `<text class="sk-count" x="${lx}" y="${n.y + n.h / 2 + 11}" text-anchor="${anchor}" dominant-baseline="middle" ${halo}>${n.n} · ${fmt(pct(n.n, docs.length), 0)}%</text>` : ''}
        </g>`;
      });
    });

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagrama Sankey del perfil docente"><defs>${defs}</defs>${titulos}${enlaces}${nodos}</svg>`;
  }

  function svgEsquema(docs) {
    if (!docs.length) return '<div class="state-box">Sin docentes para los filtros seleccionados.</div>';
    const vals = {
      Q3: docs.flatMap(d => d.q3), Q6: docs.flatMap(d => d.q6),
      A: docs.flatMap(d => d.matrices.flatMap(m => m.A)), B: docs.flatMap(d => d.matrices.flatMap(m => m.B))
    };
    vals.IF = vals.A.concat(vals.B);
    const fav = v => { const x = v.filter(esNum); return pct(x.filter(y => y >= 5).length, x.length); };
    const pctSi = k => pct(docs.filter(d => d[k] === 'Sí').length, docs.length);
    const vec = k => docs.map(d => d[k]);

    const N = {
      P: { x: 20, y: 140, w: 200, h: 130, titulo: 'Perfil docente', goto: 'resumen' },
      Q3: { x: 285, y: 24, w: 210, h: 130, titulo: 'Competencias (Q3)', goto: 'q3', v: vals.Q3 },
      Q6: { x: 285, y: 256, w: 210, h: 130, titulo: 'Entorno institucional (Q6)', goto: 'q6', v: vals.Q6 },
      A: { x: 560, y: 24, w: 210, h: 130, titulo: 'Práctica docente (A)', goto: 'A', v: vals.A },
      B: { x: 560, y: 256, w: 210, h: 130, titulo: 'Estrategias (B)', goto: 'B', v: vals.B },
      IF: { x: 820, y: 140, w: 165, h: 130, titulo: 'Inv. formativa', goto: 'A', v: vals.IF, sub: 'Índice A + B' }
    };

    const colorR = r => !esNum(r) ? '#94a3b8' : r >= 0 ? '#0f8f86' : '#e2674f';
    const marcador = c => 'm' + c.replace('#', '');
    const usados = new Set();

    function arista(a, b, r, vertical, etiqueta) {
      const c = colorR(r);
      usados.add(c);
      const w = esNum(r) ? 1.6 + Math.abs(r) * 4 : 1.6;
      let d, mx, my;
      if (vertical) {
        const x = a.x + a.w / 2, y0 = a.y + a.h, y1 = b.y;
        d = `M${x},${y0} L${x},${y1 - 6}`; mx = x; my = (y0 + y1) / 2;
      } else {
        const x0 = a.x + a.w, y0 = a.y + a.h / 2, x1 = b.x - 6, y1 = b.y + b.h / 2, xm = (x0 + x1) / 2;
        d = `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1}`; mx = (x0 + x1) / 2; my = (y0 + y1) / 2;
      }
      const txt = etiqueta || (esNum(r) ? `r = ${fmt(r)}` : 'r = —');
      return `<path class="sch-edge ${vertical ? '' : 'flow-dash'}" d="${d}" stroke="${c}" stroke-width="${w}" marker-end="url(#${marcador(c)})" opacity="0.85"/>
        <rect class="sch-edge-bg" x="${mx - 34}" y="${my - 11}" width="68" height="22" rx="11"/>
        <text class="sch-edge-label" x="${mx}" y="${my + 4}" text-anchor="middle" fill="${c}">${txt}</text>`;
    }

    function nodo(k) {
      const n = N[k];
      let interior;
      if (k === 'P') {
        interior = `<text class="sch-title" x="${n.x + 16}" y="${n.y + 26}">${n.titulo}</text>
          <text class="sch-val" x="${n.x + 16}" y="${n.y + 64}" fill="#0099A8">${docs.length}<tspan class="sch-sub" dx="6">docentes</tspan></text>
          <text class="sch-sub" x="${n.x + 16}" y="${n.y + 88}">${fmt(pctSi('colabInterna'), 0)}% colab. interna · ${fmt(pctSi('colabExterna'), 0)}% externa</text>
          <text class="sch-sub" x="${n.x + 16}" y="${n.y + 106}">${fmt(pctSi('publicaciones'), 0)}% publica · Edad media ${fmt(media(vec('edad')), 0)}</text>`;
      } else {
        const m = media(n.v), c = colorMedia(m), bw = n.w - 32;
        interior = `<text class="sch-title" x="${n.x + 16}" y="${n.y + 26}">${n.titulo}</text>
          <text class="sch-val" x="${n.x + 16}" y="${n.y + 64}" fill="${c}">${fmt(m)}<tspan class="sch-sub" dx="4">/ 7</tspan></text>
          <rect x="${n.x + 16}" y="${n.y + 78}" width="${bw}" height="7" rx="3.5" fill="${cssVar('--surface-2')}"/>
          <rect x="${n.x + 16}" y="${n.y + 78}" width="${bw * Math.max(0, (barraMedia(m) || 0) / 100)}" height="7" rx="3.5" fill="${c}"/>
          <text class="sch-sub" x="${n.x + 16}" y="${n.y + 106}">${fmt(fav(n.v), 0)}% favorable (5–7)${n.sub ? ' · ' + n.sub : ''}</text>`;
      }
      const tip = k === 'P' ? '<b>Perfil docente</b><br>Abrir resumen general' : `<b>${esc(n.titulo)}</b><br>Media ${fmt(media(n.v))} · ${n.v.filter(esNum).length} respuestas<br>Clic para abrir la sección`;
      return `<g class="sch-node" data-goto="${n.goto}" data-tip="${esc(tip)}">
        <rect class="box" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="16"/>
        <rect x="${n.x}" y="${n.y + 14}" width="4" height="${n.h - 28}" rx="2" fill="${k === 'P' ? '#0099A8' : colorMedia(media(n.v))}"/>
        ${interior}
      </g>`;
    }

    const aristas =
      arista(N.P, N.Q3, null, false, 'perfil') +
      arista(N.P, N.Q6, null, false, 'perfil') +
      arista(N.Q3, N.A, pearson(vec('mQ3'), vec('mA'))) +
      arista(N.Q3, N.B, pearson(vec('mQ3'), vec('mB'))) +
      arista(N.Q6, N.A, pearson(vec('mQ6'), vec('mA'))) +
      arista(N.Q6, N.B, pearson(vec('mQ6'), vec('mB'))) +
      arista(N.A, N.IF, null, false, 'índice') +
      arista(N.B, N.IF, null, false, 'índice') +
      arista(N.Q3, N.Q6, pearson(vec('mQ3'), vec('mQ6')), true) +
      arista(N.A, N.B, pearson(vec('mA'), vec('mB')), true);

    usados.add('#94a3b8');
    let defs = '';
    usados.forEach(c => {
      defs += `<marker id="${marcador(c)}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`;
    });

    return `<svg viewBox="0 0 1000 410" role="img" aria-label="Esquema del modelo de investigación formativa"><defs>${defs}</defs>
      ${aristas}${Object.keys(N).map(nodo).join('')}</svg>`;
  }

  function tablaCorrelaciones(docs) {
    const vars = [['mQ3', 'Q3 Compet.'], ['mA', 'A Práctica'], ['mB', 'B Estrat.'], ['mQ6', 'Q6 Entorno'], ['edad', 'Edad'], ['expDocente', 'Exp. docente'], ['expProfesional', 'Exp. prof.']];
    let h = '<table class="heat"><thead><tr><th class="row-h">Variable</th>' + vars.map(v => `<th>${v[1]}</th>`).join('') + '</tr></thead><tbody>';
    vars.forEach(a => {
      h += `<tr><td class="row-h" style="min-width:120px"><b>${a[1]}</b></td>`;
      vars.forEach(b => {
        const r = a[0] === b[0] ? 1 : pearson(docs.map(d => d[a[0]]), docs.map(d => d[b[0]]));
        let bg = 'transparent', fg = cssVar('--muted');
        if (esNum(r)) {
          const base = r >= 0 ? '#0f8f86' : '#e2674f';
          const t = Math.min(1, Math.abs(r));
          bg = mezclar(state.tema === 'dark' ? '#15252e' : '#ffffff', base, 0.15 + t * 0.85);
          fg = textoContraste(bg);
        }
        const tip = `<b>${a[1]} × ${b[1]}</b><br>r de Pearson = ${fmt(r)}`;
        h += `<td><span class="heat-cell" style="background:${bg};color:${fg}" data-tip="${esc(tip)}">${fmt(r)}</span></td>`;
      });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  // ==========================================================================
  // 10. VISTA: SECCIONES LIKERT (Q3, A, B, Q6)
  // ==========================================================================
  function renderSeccion(key, docs) {
    const S = SECCIONES[key], cfg = state.secciones[key];
    const el = $('#view-likert');
    const compacto = window.innerWidth < 900;

    // Asignaturas disponibles (ignorando el filtro de asignatura de la sección)
    const regsTodos = registros(key, docs, true);
    const asigDisp = [];
    if (S.porAsignatura) {
      const vistos = new Map();
      regsTodos.forEach(r => vistos.set(r.asig, (vistos.get(r.asig) || { key: r.asig, nombre: r.asigNombre, n: 0 })) && vistos.get(r.asig).n++);
      vistos.forEach(v => asigDisp.push(v));
      asigDisp.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      cfg.asignaturas = cfg.asignaturas.filter(k => vistos.has(k));
    }

    const regs = registros(key, docs);
    const stats = statsItems(S, regs);
    const ordenados = stats.slice().sort((a, b) => {
      if (cfg.orden === 'desc') return (b.media ?? -1) - (a.media ?? -1);
      if (cfg.orden === 'asc') return (a.media ?? 99) - (b.media ?? 99);
      if (cfg.orden === 'fav') return b.fav - a.fav;
      return a.num - b.num;
    });
    const todos = regs.flatMap(r => r.valores).filter(esNum);
    const distTotal = contarDist(todos);
    const mGeneral = media(todos);
    const alfaC = cronbach(regs.map(r => r.valores));
    const docsUnicos = new Set(regs.map(r => r.doc.id)).size;
    if (cfg.foco >= S.items.length) cfg.foco = 0;

    const modos = [['stack100', 'Apilada 100%'], ['divergente', 'Divergente'], ['conteo', 'Apilada (n)'], ['media', 'Promedios'], ['radar', 'Radar']];
    const altoMain = cfg.modo === 'radar' ? 440 : Math.max(280, S.items.length * 32 + 90);

    el.innerHTML = `
      <div class="view-head">
        <div>
          <h2 class="view-title">${S.codigo} · ${S.titulo}</h2>
          <p class="view-desc">${S.desc}</p>
        </div>
        <span class="scale-tag">◧ ${S.escalaNombre}: ${S.escala[0].label} → ${S.escala[6].label}</span>
      </div>

      <div class="section-toolbar" id="sec-toolbar">
        <span class="toolbar-label">Filtros de la sección</span>
        <div class="field" style="min-width:auto"><label>Tipo de gráfico</label>
          <div class="seg" role="group" aria-label="Tipo de gráfico">${modos.map(m => `<button type="button" id="modo-${m[0]}" data-modo="${m[0]}" class="${cfg.modo === m[0] ? 'active' : ''}">${m[1]}</button>`).join('')}</div>
        </div>
        <div class="field"><label for="sec-orden">Ordenar ítems</label>
          <select id="sec-orden">
            <option value="orig" ${cfg.orden === 'orig' ? 'selected' : ''}>Orden del instrumento</option>
            <option value="desc" ${cfg.orden === 'desc' ? 'selected' : ''}>Media (mayor a menor)</option>
            <option value="asc" ${cfg.orden === 'asc' ? 'selected' : ''}>Media (menor a mayor)</option>
            <option value="fav" ${cfg.orden === 'fav' ? 'selected' : ''}>% favorable (5–7)</option>
          </select></div>
        <div class="field"><label for="sec-comparar">Comparar por grupo</label>
          <select id="sec-comparar">${opcionesDims(cfg.comparar, true)}</select></div>
        ${S.porAsignatura ? `<div class="field" style="flex:1 1 100%;min-width:0"><label>Asignaturas</label>
          <div class="chip-select">
            <button type="button" class="chip-toggle ${cfg.asignaturas.length ? '' : 'active'}" data-asig="">Todas (${asigDisp.length})</button>
            ${asigDisp.map(a => `<button type="button" class="chip-toggle ${cfg.asignaturas.indexOf(a.key) >= 0 ? 'active' : ''}" data-asig="${esc(a.key)}">${esc(a.nombre)} <small>(${a.n})</small></button>`).join('')}
          </div></div>` : ''}
      </div>

      <div class="grid grid-kpi">
        ${kpi({ label: 'Media general', valor: fmt(mGeneral), sufijo: '/ 7', color: colorMedia(mGeneral), barra: barraMedia(mGeneral), pie: `DE ${fmt(desv(todos))}` })}
        ${kpi({ label: 'Mediana', valor: fmt(mediana(todos), 1), color: colorMedia(mediana(todos)), pie: S.escala[Math.round(mediana(todos) || 1) - 1].label })}
        ${kpi({ label: 'Favorable (5–7)', valor: fmt(pct(distTotal[4] + distTotal[5] + distTotal[6], todos.length), 0), sufijo: '%', color: '#0f8f86', barra: pct(distTotal[4] + distTotal[5] + distTotal[6], todos.length) })}
        ${kpi({ label: 'Desfavorable (1–3)', valor: fmt(pct(distTotal[0] + distTotal[1] + distTotal[2], todos.length), 0), sufijo: '%', color: '#e5533d', barra: pct(distTotal[0] + distTotal[1] + distTotal[2], todos.length) })}
        ${kpi({ label: 'α de Cronbach', valor: fmt(alfaC), color: '#6c63d9', pie: interpretarAlfa(alfaC) })}
        ${kpi({ label: S.porAsignatura ? 'Asignaturas · docentes' : 'Docentes', valor: S.porAsignatura ? `${regs.length}<small>·</small>${docsUnicos}` : regs.length, color: '#c59b27', pie: `${todos.length} respuestas válidas` })}
      </div>

      <div class="grid grid-main">
        ${card({ id: 'sec-main', titulo: tituloModo(cfg.modo, cfg.comparar), sub: 'Pase el cursor para ver el enunciado completo de cada ítem', alto: altoMain })}
        <div class="grid" style="align-content:start">
          ${card({ id: 'sec-dist', titulo: 'Distribución global', sub: 'Todas las respuestas de la sección', box: 'sm' })}
          ${card({ titulo: 'Fortalezas y áreas de mejora', sub: 'Ítems con mayor y menor media', body: rankingHtml(S, stats) })}
        </div>
      </div>

      <div class="grid mt">
        ${card({ id: 'sec-comp', titulo: cfg.comparar ? `Comparativo por ${DIMS[cfg.comparar].label.toLowerCase()}` : 'Comparativo por grupo', sub: 'Media por ítem en cada grupo (barras agrupadas) y media general (línea)', alto: 340 })}
        ${card({
          titulo: 'Detalle de ítem', sub: 'Seleccione un ítem para analizarlo en profundidad',
          extra: `<div class="field" style="min-width:220px;max-width:420px"><label for="sec-foco">Ítem en foco</label><select id="sec-foco">${S.items.map((t, i) => `<option value="${i}" ${i === cfg.foco ? 'selected' : ''}>${S.prefijo}${i + 1} · ${esc(truncar(t, 70))}</option>`).join('')}</select></div>`,
          body: detalleItemHtml(S, stats[cfg.foco])
        })}
      </div>

      ${S.porAsignatura ? `<div class="grid grid-main mt">
        ${card({ titulo: 'Mapa de calor: ítem × asignatura', sub: 'Media por celda (1–7). Pase el cursor para ver n y detalle.', body: heatmapHtml(S, regs) })}
        ${card({ id: 'sec-asig', titulo: 'Media por asignatura', sub: 'Promedio de todos los ítems de la matriz', alto: Math.max(260, asigDisp.length * 34 + 60) })}
      </div>` : ''}`;

    // Eventos de la toolbar de sección
    $$('[data-modo]', el).forEach(b => b.addEventListener('click', () => { cfg.modo = b.dataset.modo; render(); }));
    $('#sec-orden').addEventListener('change', e => { cfg.orden = e.target.value; render(); });
    $('#sec-comparar').addEventListener('change', e => { cfg.comparar = e.target.value; render(); });
    $('#sec-foco').addEventListener('change', e => { cfg.foco = +e.target.value; render(); });
    $$('[data-asig]', el).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.asig;
      if (!k) cfg.asignaturas = [];
      else {
        const i = cfg.asignaturas.indexOf(k);
        if (i >= 0) cfg.asignaturas.splice(i, 1); else cfg.asignaturas.push(k);
        if (cfg.asignaturas.length === asigDisp.length) cfg.asignaturas = [];
      }
      render();
    }));

    if (!regs.length) {
      ['sec-main', 'sec-dist', 'sec-comp', 'sec-item-dist', 'sec-item-grupo', 'sec-asig'].forEach(id => vacio(id));
      return;
    }

    graficoPrincipal(S, cfg, ordenados, regs, compacto);

    // Dona de distribución global
    nuevoChart('sec-dist', {
      type: 'doughnut',
      data: { labels: S.escala.map(e => `${e.valor} · ${e.corto}`), datasets: [{ data: distTotal, backgroundColor: COLORES_ESCALA, hoverOffset: 8 }] },
      options: {
        cutout: '60%',
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 } } },
          etiquetasPct: { display: true },
          textoCentro: { texto: fmt(mGeneral), sub: 'media' },
          tooltip: { callbacks: { label: c => `${c.label}: ${c.raw} (${fmt(pct(c.raw, todos.length), 1)}%)` } }
        }
      }
    });

    graficoComparativo(S, cfg, stats, regs);
    graficosItem(S, cfg, regs);
    if (S.porAsignatura) graficoAsignaturas(S, regs);
  }

  function tituloModo(modo, comparar) {
    return {
      stack100: 'Distribución por ítem · barras apiladas 100%',
      divergente: 'Barras divergentes · desacuerdo ← neutral → acuerdo',
      conteo: 'Distribución por ítem · conteo de respuestas',
      media: 'Media por ítem',
      radar: comparar ? `Radar de medias por ${DIMS[comparar].label.toLowerCase()}` : 'Radar de medias por ítem'
    }[modo];
  }

  function etiquetaItem(s, compacto) { return compacto ? s.codigo : `${s.codigo} · ${truncar(s.texto, 46)}`; }

  function tooltipTituloItem(lista) {
    return items => {
      const s = lista[items[0].dataIndex];
      return s ? [s.codigo].concat(envolver(s.texto, 60)) : '';
    };
  }

  function graficoPrincipal(S, cfg, st, regs, compacto) {
    const labels = st.map(s => etiquetaItem(s, compacto));
    const base = {
      indexAxis: 'y',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: { y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11.5 } } } }
    };

    if (cfg.modo === 'stack100' || cfg.modo === 'conteo') {
      const es100 = cfg.modo === 'stack100';
      nuevoChart('sec-main', {
        type: 'bar',
        data: {
          labels,
          datasets: S.escala.map((e, lv) => ({
            label: `${e.valor} · ${e.corto}`,
            data: st.map(s => es100 ? pct(s.dist[lv], s.n) : s.dist[lv]),
            backgroundColor: COLORES_ESCALA[lv], borderWidth: 0, barPercentage: 0.78, categoryPercentage: 0.9
          }))
        },
        options: Object.assign({}, base, {
          scales: { y: base.scales.y, x: Object.assign({ stacked: true }, es100 ? { max: 100, ticks: { callback: v => v + '%' } } : { ticks: { precision: 0 } }) },
          plugins: Object.assign({}, base.plugins, {
            etiquetasBarra: { display: true, min: es100 ? 9 : 1, formato: v => es100 ? Math.round(v) + '%' : String(v) },
            tooltip: { callbacks: { title: tooltipTituloItem(st), label: c => { const s = st[c.dataIndex]; const n = s.dist[c.datasetIndex]; return ` ${c.dataset.label}: ${n} (${fmt(pct(n, s.n), 1)}%)`; }, footer: items => { const s = st[items[0].dataIndex]; return `Media ${fmt(s.media)} · n = ${s.n}`; } } }
          })
        })
      });
      return;
    }

    if (cfg.modo === 'divergente') {
      const def = [[3, -0.5, 'neg'], [2, -1], [1, -1], [0, -1], [3, 0.5, 'pos'], [4, 1], [5, 1], [6, 1]];
      nuevoChart('sec-main', {
        type: 'bar',
        data: {
          labels,
          datasets: def.map(([lv, f, mitad]) => ({
            label: `${S.escala[lv].valor} · ${S.escala[lv].corto}`,
            data: st.map(s => pct(s.dist[lv], s.n) * f),
            backgroundColor: COLORES_ESCALA[lv], borderWidth: 0, barPercentage: 0.78, categoryPercentage: 0.9,
            nivel: lv, mitad: mitad || null
          }))
        },
        options: Object.assign({}, base, {
          scales: { y: base.scales.y, x: { stacked: true, min: -100, max: 100, ticks: { callback: v => Math.abs(v) + '%' } } },
          plugins: Object.assign({}, base.plugins, {
            legend: { position: 'bottom', labels: { font: { size: 11 }, filter: (it, data) => data.datasets[it.datasetIndex].mitad !== 'pos' }, onClick: null },
            lineaRef: { valor: 0, eje: 'x' },
            etiquetasBarra: { display: true, min: 9, formato: (v, di) => def[di][2] ? '' : Math.round(Math.abs(v)) + '%' },
            tooltip: {
              filter: c => c.dataset.mitad !== 'pos',
              callbacks: {
                title: tooltipTituloItem(st),
                label: c => { const s = st[c.dataIndex]; const n = s.dist[c.dataset.nivel]; return ` ${c.dataset.label}: ${n} (${fmt(pct(n, s.n), 1)}%)`; },
                footer: items => { const s = st[items[0].dataIndex]; return `Desfavorable ${fmt(s.desf, 0)}% · Neutral ${fmt(s.neutro, 0)}% · Favorable ${fmt(s.fav, 0)}%`; }
              }
            }
          })
        })
      });
      return;
    }

    if (cfg.modo === 'media') {
      nuevoChart('sec-main', {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Media', data: st.map(s => s.media), backgroundColor: st.map(s => colorMedia(s.media)), borderRadius: 8, barPercentage: 0.7 }] },
        options: Object.assign({}, base, {
          scales: { y: { grid: { display: false }, ticks: { font: { size: 11.5 } } }, x: { min: 1, max: 7, ticks: { stepSize: 1 } } },
          plugins: {
            legend: { display: false },
            lineaRef: { valor: 4, eje: 'x', texto: 'Neutral' },
            etiquetasBarra: { display: true, min: 0.1, formato: v => fmt(v) },
            tooltip: { callbacks: { title: tooltipTituloItem(st), label: c => { const s = st[c.dataIndex]; return ` Media ${fmt(s.media)} · Mediana ${fmt(s.mediana, 1)} · DE ${fmt(s.sd)} · n = ${s.n}`; } } }
          }
        })
      });
      return;
    }

    // Radar
    const grupos = cfg.comparar ? categorias(cfg.comparar, Array.from(new Set(regs.map(r => r.doc)))) : [];
    const datasets = grupos.length ? grupos.map((g, i) => {
      const col = colorCategoria(cfg.comparar, g.valor, i);
      const sub = regs.filter(r => DIMS[cfg.comparar].get(r.doc) === g.valor);
      return { label: `${g.valor} (n=${g.n})`, data: st.map(s => media(sub.map(r => r.valores[s.i]))), borderColor: col, backgroundColor: alfa(col, 0.12), pointBackgroundColor: col, borderWidth: 2 };
    }) : [{ label: 'Media general', data: st.map(s => s.media), borderColor: '#0099A8', backgroundColor: alfa('#0099A8', 0.18), pointBackgroundColor: st.map(s => colorMedia(s.media)), pointRadius: 5, borderWidth: 2 }];
    nuevoChart('sec-main', {
      type: 'radar',
      data: { labels: st.map(s => s.codigo), datasets },
      options: {
        scales: { r: { min: 1, max: 7, ticks: { stepSize: 1, backdropColor: 'transparent' }, pointLabels: { font: { size: 12, weight: '600' } } } },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { title: tooltipTituloItem(st), label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } }
      }
    });
  }

  function graficoComparativo(S, cfg, stats, regs) {
    if (!cfg.comparar) { vacio('sec-comp', 'Seleccione un criterio en «Comparar por grupo» para ver este gráfico.'); return; }
    const dim = DIMS[cfg.comparar];
    const grupos = categorias(cfg.comparar, Array.from(new Set(regs.map(r => r.doc))));
    const datasets = grupos.map((g, i) => {
      const sub = regs.filter(r => dim.get(r.doc) === g.valor);
      return {
        type: 'bar', label: `${g.valor} (n=${g.n})`,
        data: stats.map(s => media(sub.map(r => r.valores[s.i]))),
        backgroundColor: colorCategoria(cfg.comparar, g.valor, i), borderRadius: 5, maxBarThickness: 26, order: 2
      };
    });
    datasets.push({
      type: 'line', label: 'Media general', data: stats.map(s => s.media), borderColor: cssVar('--text'), borderDash: [5, 4],
      borderWidth: 1.5, pointRadius: 3.5, pointBackgroundColor: cssVar('--text'), fill: false, order: 1, tension: 0.25
    });
    nuevoChart('sec-comp', {
      type: 'bar',
      data: { labels: stats.map(s => s.codigo), datasets },
      options: {
        scales: { y: { min: 1, max: 7, ticks: { stepSize: 1 } }, x: { grid: { display: false } } },
        plugins: { legend: { position: 'bottom' }, lineaRef: { valor: 4, eje: 'y' }, tooltip: { callbacks: { title: tooltipTituloItem(stats), label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } }
      }
    });
  }

  function detalleItemHtml(S, s) {
    if (!s) return '';
    return `<div class="grid grid-3" style="gap:16px">
      <div>
        <div class="item-focus-text"><b>${s.codigo}.</b> ${esc(s.texto)}</div>
        <div class="stat-row">
          <div class="stat-pill"><b style="color:${colorMedia(s.media)}">${fmt(s.media)}</b><span>Media</span></div>
          <div class="stat-pill"><b>${fmt(s.mediana, 1)}</b><span>Mediana</span></div>
          <div class="stat-pill"><b>${fmt(s.sd)}</b><span>Desv. est.</span></div>
          <div class="stat-pill"><b>${s.n}</b><span>n</span></div>
        </div>
        <div class="scale-legend">${S.escala.map((e, i) => `<span><i style="background:${COLORES_ESCALA[i]}"></i>${e.valor} ${esc(e.corto)}</span>`).join('')}</div>
      </div>
      <div class="chart-box"><canvas id="sec-item-dist" role="img" aria-label="Distribución del ítem"></canvas></div>
      <div class="chart-box"><canvas id="sec-item-grupo" role="img" aria-label="Media del ítem por grupo"></canvas></div>
    </div>`;
  }

  function graficosItem(S, cfg, regs) {
    const i = cfg.foco;
    const vals = regs.map(r => r.valores[i]).filter(esNum);
    const dist = contarDist(vals);
    if (!vals.length) { vacio('sec-item-dist'); vacio('sec-item-grupo'); return; }
    nuevoChart('sec-item-dist', {
      type: 'pie',
      data: { labels: S.escala.map(e => `${e.valor} · ${e.corto}`), datasets: [{ data: dist, backgroundColor: COLORES_ESCALA, hoverOffset: 8 }] },
      options: { plugins: { legend: { display: false }, etiquetasPct: { display: true }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} (${fmt(pct(c.raw, vals.length), 1)}%)` } } } }
    });
    const dimKey = cfg.comparar || 'genero';
    const grupos = categorias(dimKey, Array.from(new Set(regs.map(r => r.doc))));
    const medias = grupos.map(g => media(regs.filter(r => DIMS[dimKey].get(r.doc) === g.valor).map(r => r.valores[i])));
    nuevoChart('sec-item-grupo', {
      type: 'bar',
      data: { labels: grupos.map(g => g.valor), datasets: [{ label: 'Media', data: medias, backgroundColor: grupos.map((g, k) => colorCategoria(dimKey, g.valor, k)), borderRadius: 8, maxBarThickness: 40 }] },
      options: {
        indexAxis: 'y',
        scales: { x: { min: 1, max: 7, ticks: { stepSize: 1 } }, y: { grid: { display: false } } },
        plugins: {
          legend: { display: false }, lineaRef: { valor: 4, eje: 'x' },
          title: { display: true, text: `Media por ${DIMS[dimKey].label.toLowerCase()}`, font: { size: 12, weight: '600' } },
          etiquetasBarra: { display: true, min: 0.1, formato: v => fmt(v) }
        }
      }
    });
  }

  function rankingHtml(S, stats) {
    const conMedia = stats.filter(s => esNum(s.media)).sort((a, b) => b.media - a.media);
    if (!conMedia.length) return '<p class="card-sub">Sin datos.</p>';
    const k = Math.min(3, Math.ceil(conMedia.length / 2));
    const fila = s => `<li data-tip="${esc(`<b>${s.codigo}</b> ${esc(s.texto)}<br>Media ${fmt(s.media)} · ${fmt(s.fav, 0)}% favorable`)}">
      <span class="rank-code" style="background:${colorMedia(s.media)};color:${textoContraste(colorMedia(s.media))}">${s.codigo}</span>
      <span class="rank-text">${esc(s.texto)}</span><span class="rank-val" style="color:${colorMedia(s.media)}">${fmt(s.media)}</span></li>`;
    return `<p class="card-sub" style="margin-bottom:6px;font-weight:600;color:#0f8f86">▲ Fortalezas</p>
      <ul class="rank-list">${conMedia.slice(0, k).map(fila).join('')}</ul>
      <p class="card-sub" style="margin:14px 0 6px;font-weight:600;color:#e5533d">▼ Áreas de mejora</p>
      <ul class="rank-list">${conMedia.slice(-k).reverse().map(fila).join('')}</ul>`;
  }

  function heatmapHtml(S, regs) {
    const asigs = new Map();
    regs.forEach(r => { if (!asigs.has(r.asig)) asigs.set(r.asig, { nombre: r.asigNombre, regs: [] }); asigs.get(r.asig).regs.push(r); });
    const cols = Array.from(asigs.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!cols.length) return '<div class="state-box">Sin datos.</div>';
    const celda = (vals, tipTitulo) => {
      const v = vals.filter(esNum), m = media(v), bg = colorMedia(m);
      const tip = `<b>${tipTitulo}</b><br>Media ${fmt(m)} · n = ${v.length}`;
      return `<td><span class="heat-cell" style="background:${esNum(m) ? bg : 'transparent'};color:${esNum(m) ? textoContraste(bg) : 'inherit'}" data-tip="${esc(tip)}">${fmt(m, 1)}</span></td>`;
    };
    let h = `<div class="table-wrap"><table class="heat"><thead><tr><th class="row-h">Ítem</th>${cols.map(c => `<th title="${esc(c.nombre)}">${esc(truncar(c.nombre, 16))}<br><small>n=${c.regs.length}</small></th>`).join('')}<th>General</th></tr></thead><tbody>`;
    S.items.forEach((t, i) => {
      h += `<tr><td class="row-h" data-tip="${esc(`<b>${S.prefijo}${i + 1}</b> ${esc(t)}`)}"><span class="row-code">${S.prefijo}${i + 1}</span>${esc(truncar(t, 52))}</td>`;
      cols.forEach(c => { h += celda(c.regs.map(r => r.valores[i]), `${S.prefijo}${i + 1} · ${esc(c.nombre)}`); });
      h += celda(regs.map(r => r.valores[i]), `${S.prefijo}${i + 1} · Todas las asignaturas`) + '</tr>';
    });
    h += `<tr><td class="row-h"><b>Media de la matriz</b></td>${cols.map(c => celda(c.regs.flatMap(r => r.valores), esc(c.nombre))).join('')}${celda(regs.flatMap(r => r.valores), 'General')}</tr>`;
    return h + '</tbody></table></div>';
  }

  function graficoAsignaturas(S, regs) {
    const asigs = new Map();
    regs.forEach(r => { if (!asigs.has(r.asig)) asigs.set(r.asig, { nombre: r.asigNombre, vals: [], n: 0 }); const a = asigs.get(r.asig); a.vals.push(...r.valores); a.n++; });
    const lista = Array.from(asigs.values()).map(a => ({ nombre: a.nombre, m: media(a.vals), n: a.n })).sort((a, b) => (b.m ?? 0) - (a.m ?? 0));
    nuevoChart('sec-asig', {
      type: 'bar',
      data: { labels: lista.map(a => truncar(a.nombre, 28)), datasets: [{ label: 'Media', data: lista.map(a => a.m), backgroundColor: lista.map(a => colorMedia(a.m)), borderRadius: 8, barPercentage: 0.7 }] },
      options: {
        indexAxis: 'y',
        scales: { x: { min: 1, max: 7, ticks: { stepSize: 1 } }, y: { grid: { display: false } } },
        plugins: {
          legend: { display: false }, lineaRef: { valor: 4, eje: 'x' },
          etiquetasBarra: { display: true, min: 0.1, formato: v => fmt(v) },
          tooltip: { callbacks: { title: items => lista[items[0].dataIndex].nombre, label: c => ` Media ${fmt(c.raw)} · ${lista[c.dataIndex].n} registro(s)` } }
        }
      }
    });
  }

  // ==========================================================================
  // 11. VISTA: DATOS Y EXPORTACIÓN
  // ==========================================================================
  function renderDatos(docs) {
    const el = $('#view-datos');
    const sino = v => v === 'Sí' ? '<span class="badge badge-si">Sí</span>' : v === 'No' ? '<span class="badge badge-no">No</span>' : '—';
    const lista = (k, kc) => {
      const items = docs.filter(d => d[k] === 'Sí' && d[kc]).map(d => `<li>${esc(d[kc])}<small>${esc(d.grado)} · ${esc(d.genero || '')} · ${esc(d.fecha)}</small></li>`);
      return items.length ? `<ul class="text-list">${items.join('')}</ul>` : '<p class="card-sub">Sin registros declarados.</p>';
    };

    el.innerHTML = `
      <div class="view-head"><div>
        <h2 class="view-title">Datos y exportación</h2>
        <p class="view-desc">Registros anonimizados de los docentes que cumplen los filtros globales. Exporte a CSV para análisis en Excel, SPSS, R o JASP.</p>
      </div></div>

      <div class="card admin-data-card">
        <div class="admin-data-header">
          <div class="admin-data-icon">⚙️</div>
          <div class="admin-data-text">
            <h3 class="admin-data-title">Preparación para recolección de datos reales</h3>
            <p class="admin-data-desc">
              ${state.docentes.length > 0 
                ? `Actualmente hay <strong>${state.docentes.length} docentes de prueba</strong> cargados en el sistema. Para iniciar el trabajo de campo oficial con la planta docente de la FCAE, puede limpiar la data de prueba con respaldo preventivo automático.`
                : '🟢 <strong>Base de datos limpia y lista:</strong> No hay registros de prueba. Lista para recibir las respuestas reales del profesorado a través de la encuesta.'}
            </p>
          </div>
          ${state.docentes.length > 0 ? '<button type="button" class="btn btn-danger-solid" id="btn-admin-clear-data">🗑 Eliminar data de prueba</button>' : ''}
        </div>
      </div>

      <div class="data-toolbar">
        <div class="field"><label for="data-search">Buscar en la tabla</label><input type="search" id="data-search" placeholder="Grado, asignatura, proyecto…"></div>
        <button type="button" class="btn btn-primary" id="btn-csv-docentes">⬇ CSV docentes (formato ancho)</button>
        <button type="button" class="btn" id="btn-csv-matrices">⬇ CSV matrices A/B (formato largo)</button>
        <button type="button" class="btn" id="btn-json">⬇ JSON filtrado</button>
        ${state.docentes.length > 0 ? '<button type="button" class="btn btn-danger" id="btn-toolbar-clear-data" title="Eliminar data de prueba">🗑 Limpiar datos</button>' : ''}
      </div>

      <article class="card">
        <div class="table-wrap">
          <table class="data" id="tabla-datos">
            <thead><tr>
              <th>#</th><th>Fecha</th><th>Género</th><th>Edad</th><th>Grado académico</th><th>Exp. prof.</th><th>Exp. doc.</th>
              <th>Colab. int.</th><th>Colab. ext.</th><th>Publica</th><th>Asignaturas</th><th>Q3</th><th>A</th><th>B</th><th>Q6</th>
            </tr></thead>
            <tbody>
              ${docs.map((d, i) => `<tr>
                <td>${i + 1}</td><td>${esc(d.fecha)}</td><td>${esc(d.genero || '—')}</td><td>${d.edad ?? '—'}</td>
                <td>${esc(d.gradoAcademico || '—')}<br><small style="color:var(--muted)">${esc(d.grado)}</small></td>
                <td>${d.expProfesional ?? '—'}</td><td>${d.expDocente ?? '—'}</td>
                <td>${sino(d.colabInterna)}</td><td>${sino(d.colabExterna)}</td><td>${sino(d.publicaciones)}</td>
                <td>${esc(d.matrices.map(m => m.nombre).join(', ') || '—')}</td>
                ${['mQ3', 'mA', 'mB', 'mQ6'].map(k => `<td><b style="color:${colorMedia(d[k])}">${fmt(d[k])}</b></td>`).join('')}
              </tr>`).join('') || '<tr><td colspan="15" style="text-align:center;padding:30px;color:var(--muted)">Sin registros para los filtros seleccionados.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>

      <div class="grid grid-3 mt">
        ${card({ titulo: 'Proyectos internos declarados', sub: 'Colaboración en investigación de la universidad', body: lista('colabInterna', 'colabInternaCual') })}
        ${card({ titulo: 'Proyectos externos declarados', sub: 'Instituciones u organismos', body: lista('colabExterna', 'colabExternaCual') })}
        ${card({ titulo: 'Publicaciones declaradas', sub: 'Artículos o revistas', body: lista('publicaciones', 'publicacionesCual') })}
      </div>`;

    $('#data-search').addEventListener('input', e => {
      const q = normTexto(e.target.value);
      $$('#tabla-datos tbody tr').forEach(tr => { tr.style.display = !q || normTexto(tr.textContent).indexOf(q) >= 0 ? '' : 'none'; });
    });
    $('#btn-csv-docentes').addEventListener('click', () => exportarDocentes(docs));
    $('#btn-csv-matrices').addEventListener('click', () => exportarMatrices(docs));
    $('#btn-json').addEventListener('click', () => {
      const limpio = docs.map(d => { const c = Object.assign({}, d); return c; });
      descargar(`resultados_fcae_${hoy()}.json`, JSON.stringify(limpio, null, 2), 'application/json');
    });

    const bAdmin = $('#btn-admin-clear-data');
    if (bAdmin) bAdmin.addEventListener('click', abrirModalEliminar);
    const bTool = $('#btn-toolbar-clear-data');
    if (bTool) bTool.addEventListener('click', abrirModalEliminar);
  }

  function hoy() { return new Date().toISOString().slice(0, 10); }

  function celdaCSV(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",;\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function descargar(nombre, contenido, tipo) {
    const blob = new Blob([contenido], { type: tipo + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }

  function descargarCSV(nombre, filas) {
    descargar(nombre, '\ufeff' + filas.map(f => f.map(celdaCSV).join(',')).join('\r\n'), 'text/csv');
  }

  function exportarDocentes(docs) {
    const cab = ['id', 'fecha', 'genero', 'edad', 'rango_edad', 'grado_academico', 'grado_clasificado', 'exp_profesional', 'exp_docente',
      'colab_interna', 'colab_interna_cual', 'colab_externa', 'colab_externa_cual', 'publicaciones', 'publicaciones_cual', 'total_asignaturas']
      .concat(ITEMS_Q3.map((t, i) => 'Q3_' + (i + 1)), ITEMS_Q6.map((t, i) => 'Q6_' + (i + 1)), ['media_Q3', 'media_A', 'media_B', 'media_Q6']);
    const filas = docs.map(d => [d.id, d.fecha, d.genero, d.edad, d.rangoEdad, d.gradoAcademico, d.grado, d.expProfesional, d.expDocente,
      d.colabInterna, d.colabInternaCual, d.colabExterna, d.colabExternaCual, d.publicaciones, d.publicacionesCual, d.matrices.length]
      .concat(d.q3, d.q6, [d.mQ3, d.mA, d.mB, d.mQ6].map(v => esNum(v) ? v.toFixed(3) : '')));
    descargarCSV(`docentes_fcae_${hoy()}.csv`, [cab].concat(filas));
  }

  function exportarMatrices(docs) {
    const cab = ['id_docente', 'fecha', 'genero', 'grado_clasificado', 'rango_edad', 'asignatura', 'matriz', 'item_num', 'item_codigo', 'item_texto', 'valor'];
    const filas = [];
    docs.forEach(d => d.matrices.forEach(m => {
      ['A', 'B'].forEach(mx => m[mx].forEach((v, i) => {
        filas.push([d.id, d.fecha, d.genero, d.grado, d.rangoEdad, m.nombre, mx, i + 1, mx + (i + 1), SECCIONES[mx].items[i], v]);
      }));
    }));
    descargarCSV(`matrices_fcae_${hoy()}.csv`, [cab].concat(filas));
  }

  // ==========================================================================
  // VISTA DE PARTICIPANTES EN TALLERES COLABORATIVOS (SEGUNDA ETAPA)
  // ==========================================================================
  function renderTalleres() {
    const el = $('#view-talleres');
    if (!el) return;
    const talleres = state.talleres || [];
    const conTel = talleres.filter(t => t.telefono && t.telefono.trim()).length;
    const conEmail = talleres.filter(t => t.email && t.email.trim()).length;

    el.innerHTML = `
      <div class="view-head">
        <div>
          <h2 class="view-title">Participantes en Talleres Colaborativos</h2>
          <p class="view-desc">Docentes de la FCAE que han manifestado su disposición e interés en participar en los talleres de diseño colaborativo y validación para la construcción del modelo de investigación formativa (Segunda Etapa de Tesis).</p>
        </div>
      </div>

      <div class="talleres-intro-card">
        <div class="talleres-intro-header">
          <div class="talleres-icon-badge">👥</div>
          <div>
            <div class="talleres-intro-title">Segunda Etapa: Talleres de Co-Diseño y Validación Metodológica</div>
            <div class="talleres-intro-desc">
              Esta sección consolida el directorio de contacto de los docentes que completaron la encuesta y aceptaron ser convocados a las sesiones de talleres colaborativos. Puede exportar el listado a Excel/CSV, descargar JSON o copiar directamente todos los correos electrónicos para enviar la convocatoria por correo institucional.
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-kpi" style="margin-bottom: 22px;">
        ${kpi({ label: 'Docentes registrados', valor: talleres.length, pie: 'Interesados en talleres colaborativos', color: '#0099A8' })}
        ${kpi({ label: 'Con correo electrónico', valor: conEmail, pie: pct(conEmail, talleres.length) + '% con correo de contacto', color: '#c59b27' })}
        ${kpi({ label: 'Con teléfono directo', valor: conTel, pie: pct(conTel, talleres.length) + '% con número telefónico', color: '#2fb380' })}
      </div>

      <article class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">Directorio de Contacto (${talleres.length})</h3>
            <p class="card-sub">Búsqueda rápida en vivo y herramientas de exportación</p>
          </div>
          <div class="card-actions">
            <input type="search" id="talleres-search" placeholder="🔍 Buscar por nombre, teléfono o correo…" class="input-search" style="min-width: 280px;">
            <button type="button" class="btn-ghost" id="btn-copy-talleres-emails" title="Copiar todos los correos electrónicos separados por coma">📋 Copiar correos</button>
            <button type="button" class="btn-ghost" id="btn-csv-talleres" title="Descargar planilla CSV / Excel con los participantes">⬇ Descargar CSV</button>
            <button type="button" class="btn-ghost" id="btn-json-talleres" title="Descargar datos en formato JSON">⬇ JSON</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table" id="tabla-talleres">
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th>Fecha de registro</th>
                <th>Nombre completo</th>
                <th>Teléfono de contacto</th>
                <th>Correo electrónico</th>
                <th>Origen</th>
              </tr>
            </thead>
            <tbody>
              ${talleres.map((t, idx) => {
                const f = t.timestamp ? new Date(t.timestamp) : null;
                const fStr = f ? (f.toLocaleDateString('es-NI', { dateStyle: 'medium' }) + ' ' + f.toLocaleTimeString('es-NI', { timeStyle: 'short' })) : '—';
                const telClean = t.telefono ? t.telefono.replace(/[^\d+]/g, '') : '';
                return `<tr>
                  <td style="font-weight:700; color:var(--muted);">${idx + 1}</td>
                  <td>${esc(fStr)}</td>
                  <td><strong>${esc(t.nombre || '—')}</strong></td>
                  <td>${t.telefono ? `<a href="tel:${esc(telClean)}" class="talleres-link-phone" title="Llamar">📞 ${esc(t.telefono)}</a>` : '—'}</td>
                  <td>${t.email ? `<a href="mailto:${esc(t.email)}" class="talleres-link-email" title="Enviar correo">✉️ ${esc(t.email)}</a>` : '—'}</td>
                  <td><span class="badge-tag-survey">Encuesta FCAE</span></td>
                </tr>`;
              }).join('') || '<tr><td colspan="6" style="text-align:center;padding:36px;color:var(--muted)">Aún no hay docentes registrados para los talleres colaborativos. Aparecerán aquí automáticamente cuando completen la encuesta y elijan la opción "Sí, me gustaría".</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>`;

    const inpSearch = $('#talleres-search');
    if (inpSearch) {
      inpSearch.addEventListener('input', e => {
        const q = normTexto(e.target.value);
        $$('#tabla-talleres tbody tr').forEach(tr => {
          tr.style.display = !q || normTexto(tr.textContent).indexOf(q) >= 0 ? '' : 'none';
        });
      });
    }

    const btnCopy = $('#btn-copy-talleres-emails');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const correos = talleres.map(t => (t.email || '').trim()).filter(Boolean);
        if (!correos.length) {
          mostrarToast('ℹ️ No hay correos registrados para copiar.', 3000);
          return;
        }
        const texto = correos.join(', ');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(texto)
            .then(() => mostrarToast(`📋 <strong>${correos.length} correos copiados</strong> al portapapeles listos para su cliente de correo.`))
            .catch(() => prompt('Copie la siguiente lista de correos:', texto));
        } else {
          prompt('Copie la siguiente lista de correos:', texto);
        }
      });
    }

    const btnCsv = $('#btn-csv-talleres');
    if (btnCsv) {
      btnCsv.addEventListener('click', () => {
        const cab = ['N', 'Fecha_Registro', 'Nombre_Completo', 'Telefono', 'Correo_Electronico', 'ID_Registro'];
        const filas = talleres.map((t, i) => [
          i + 1,
          t.timestamp || '',
          t.nombre || '',
          t.telefono || '',
          t.email || '',
          t.id || ''
        ]);
        descargarCSV(`participantes_talleres_fcae_${hoy()}.csv`, [cab].concat(filas));
      });
    }

    const btnJson = $('#btn-json-talleres');
    if (btnJson) {
      btnJson.addEventListener('click', () => {
        descargar(`participantes_talleres_fcae_${hoy()}.json`, JSON.stringify(talleres, null, 2), 'application/json');
      });
    }
  }

  // ==========================================================================
  // 12. NAVEGACIÓN Y RENDER
  // ==========================================================================
  function irVista(v) {
    if (['resumen', 'flujos', 'datos', 'talleres'].concat(VISTAS_LIKERT).indexOf(v) < 0) v = 'resumen';
    state.vista = v;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    destruirCharts();
    const docs = docentesFiltrados();
    actualizarResumenFiltros(docs);

    const v = state.vista;
    const contId = v === 'resumen' ? 'view-resumen' : v === 'flujos' ? 'view-flujos' : v === 'datos' ? 'view-datos' : v === 'talleres' ? 'view-talleres' : 'view-likert';
    $$('.view').forEach(x => x.classList.toggle('active', x.id === contId));

    actualizarBotonEliminar();

    if (v === 'talleres') {
      renderTalleres();
      return;
    }

    if (!state.docentes.length) {
      $('#' + contId).innerHTML = `
        <div class="empty-state-card">
          <div class="empty-state-badge">🟢 Base de datos limpia</div>
          <h2 class="empty-state-title">Lista para recibir datos reales</h2>
          <p class="empty-state-desc">
            No hay registros de prueba en la plataforma. Las respuestas enviadas por los docentes a través de la encuesta se registrarán automáticamente aquí en tiempo real.
          </p>
          <div class="empty-state-actions">
            <a href="index.html" class="btn btn-primary" target="_blank">📋 Abrir Formulario de la Encuesta ↗</a>
            <button type="button" class="btn btn-secondary" id="btn-refresh-empty">⟳ Comprobar nuevas respuestas</button>
          </div>
          <div class="empty-state-hint">
            <small>Usa «⟳ Comprobar nuevas respuestas» en cualquier momento o envía un registro desde la encuesta para verificar el cálculo en vivo.</small>
          </div>
        </div>`;
      const btnRef = $('#btn-refresh-empty');
      if (btnRef) btnRef.addEventListener('click', cargar);
      return;
    }

    if (v === 'resumen') renderResumen(docs);
    else if (v === 'flujos') renderFlujos(docs);
    else if (v === 'datos') renderDatos(docs);
    else renderSeccion(v, docs);
  }

  // ==========================================================================
  // GESTIÓN DE DATA DE PRUEBA Y NOTIFICACIONES
  // ==========================================================================
  let toastTimer = null;
  function mostrarToast(html, duracion = 5500) {
    const t = $('#dash-toast');
    if (!t) return;
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); }, duracion);
  }

  function actualizarBotonEliminar() {
    const btn = $('#btn-eliminar-prueba');
    if (!btn) return;
    const hayDatos = state.docentes.length > 0;
    btn.disabled = !hayDatos;
    btn.title = hayDatos
      ? 'Eliminar datos de prueba para iniciar la recolección real'
      : 'La base de datos ya está limpia (0 registros)';
    btn.style.opacity = hayDatos ? '1' : '0.5';
    btn.style.cursor = hayDatos ? 'pointer' : 'not-allowed';
  }

  function abrirModalEliminar() {
    const modal = $('#modal-clear-data');
    if (!modal) return;
    const cDoc = $('#modal-count-docentes');
    const cResp = $('#modal-count-respuestas');
    const cTal = $('#modal-count-talleres');
    if (cDoc) cDoc.textContent = state.docentes.length;
    if (cTal) cTal.textContent = state.talleres.length;
    if (cResp) {
      const tot = state.docentes.reduce((acc, d) => acc + ((d.matrices ? d.matrices.length : 0) * 28), 0);
      cResp.textContent = tot;
    }
    modal.hidden = false;
  }

  function cerrarModalEliminar() {
    const modal = $('#modal-clear-data');
    if (modal) modal.hidden = true;
  }

  const SYNC_CHANNEL_NAME = 'encuesta_fcae_sync_v1';
  const LS_SYNC_PING_KEY = 'encuesta_fcae_last_sync_v1';
  const LS_LOCAL_SUBMISSIONS_KEY = 'encuesta_fcae_envios_locales_v1';
  const LS_TALLERES_KEY = 'encuesta_fcae_talleres_v1';
  const LS_BASELINE_CLEARED_KEY = 'encuesta_fcae_baseline_cleared_v1';

  let modoServidorActivo = false;
  let sseStream = null;
  let syncDebounceTimer = null;
  let ultimoSyncTs = 0;

  function leerEnviosLocales() {
    try {
      const raw = localStorage.getItem(LS_LOCAL_SUBMISSIONS_KEY);
      if (!raw) return { docentes: [], respuestas: [] };
      const parsed = JSON.parse(raw);
      return {
        docentes: Array.isArray(parsed && parsed.docentes) ? parsed.docentes : [],
        respuestas: Array.isArray(parsed && parsed.respuestas) ? parsed.respuestas : []
      };
    } catch (e) {
      return { docentes: [], respuestas: [] };
    }
  }

  function leerTalleresLocales() {
    try {
      const raw = localStorage.getItem(LS_TALLERES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function combinarTalleres(baseTalleres) {
    const locales = leerTalleresLocales();
    const arrBase = Array.isArray(baseTalleres) ? baseTalleres : [];
    if (!locales.length) return arrBase;
    const ids = new Set(arrBase.map(t => t.id || (t.email + '_' + t.nombre)));
    const nuevos = locales.filter(t => !ids.has(t.id || (t.email + '_' + t.nombre)));
    return arrBase.concat(nuevos);
  }

  function combinarDatosConLocales(base) {
    const locales = leerEnviosLocales();
    const talleresCombinados = combinarTalleres(base && base.talleres);
    const baseDocentes = Array.isArray(base && base.docentes) ? base.docentes : [];
    const baseRespuestas = Array.isArray(base && base.respuestas) ? base.respuestas : [];
    if (!locales.docentes.length) {
      return { generado: base && base.generado, docentes: baseDocentes, respuestas: baseRespuestas, talleres: talleresCombinados };
    }

    const idsExistentes = new Set(baseDocentes.map(d => d && d.id).filter(Boolean));
    const nuevosDocentes = locales.docentes.filter(d => d && d.id && !idsExistentes.has(d.id));
    if (!nuevosDocentes.length) {
      return { generado: base && base.generado, docentes: baseDocentes, respuestas: baseRespuestas, talleres: talleresCombinados };
    }

    const idsNuevos = new Set(nuevosDocentes.map(d => d.id));
    const nuevasRespuestas = locales.respuestas.filter(r => r && idsNuevos.has(r.idDocente));
    return {
      generado: new Date().toISOString(),
      docentes: baseDocentes.concat(nuevosDocentes),
      respuestas: baseRespuestas.concat(nuevasRespuestas),
      talleres: talleresCombinados
    };
  }

  function emitirSyncTablero(evento) {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(SYNC_CHANNEL_NAME);
        bc.postMessage(evento);
        bc.close();
      }
    } catch (e) {}
    try {
      localStorage.setItem(LS_SYNC_PING_KEY, JSON.stringify(evento));
    } catch (e) {}
  }

  async function ejecutarEliminarDataPrueba() {
    const btnConfirm = $('#btn-confirm-clear');
    const txtConfirm = $('#btn-confirm-clear-text');
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.classList.add('spinning');
    }
    if (txtConfirm) txtConfirm.textContent = '⏳ Eliminando y respaldando…';

    const cantActual = state.docentes.length;

    try {
      let limpioEnServidor = false;
      let cantDoc = cantActual;

      try {
        const resp = await fetch('api/reset', { method: 'POST' });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data.ok) {
          limpioEnServidor = true;
          if (data.eliminados && typeof data.eliminados.docentes === 'number') {
            cantDoc = data.eliminados.docentes;
          }
        }
      } catch (e) { /* modo estático / GitHub Pages */ }

      try {
        localStorage.removeItem(LS_LOCAL_SUBMISSIONS_KEY);
        localStorage.removeItem(LS_TALLERES_KEY);
        if (limpioEnServidor) {
          localStorage.removeItem(LS_BASELINE_CLEARED_KEY);
        } else {
          localStorage.setItem(LS_BASELINE_CLEARED_KEY, '1');
        }
      } catch (e) {}

      ultimoSyncTs = Date.now();
      emitirSyncTablero({ type: 'data_reset', ts: ultimoSyncTs });

      cerrarModalEliminar();

      // Limpiar estado en memoria
      state.docentes = [];
      state.asignaturas = [];
      state.talleres = [];
      const badgeT = $('#badge-talleres-count');
      if (badgeT) badgeT.textContent = '0';
      Object.keys(state.filtros).forEach(k => { state.filtros[k] = ''; });

      construirFiltros();
      render();

      $('#hero-sub').textContent = '0 docentes · 0 asignaturas distintas · Base de datos limpia y lista para datos reales';

      const detalleRespaldo = limpioEnServidor
        ? 'Se guardó un respaldo automático en <code>data/backups/</code>.'
        : 'Registros locales limpiados en este navegador.';
      mostrarToast(`✅ <strong>Base de datos limpia:</strong> Se eliminaron ${cantDoc} registros de prueba. ${detalleRespaldo} ¡Listo para recibir datos reales!`, 7500);
    } catch (err) {
      console.error(err);
      mostrarToast(`❌ <strong>Error al vaciar datos:</strong> ${esc(err.message)}`, 6000);
    } finally {
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.classList.remove('spinning');
      }
      if (txtConfirm) txtConfirm.textContent = '🗑 Sí, eliminar data de prueba';
    }
  }

  // ==========================================================================
  // 13. CARGA DE DATOS Y SINCRONIZACIÓN AUTOMÁTICA EN TIEMPO REAL
  // ==========================================================================
  async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
    return r.json();
  }

  function asegurarConexionSSE() {
    if (!modoServidorActivo || sseStream || typeof EventSource === 'undefined') return;
    try {
      sseStream = new EventSource('api/events');
      sseStream.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data || '{}');
          if (msg.type === 'survey_submitted' || msg.type === 'data_reset' || msg.type === 'workshop_registered') {
            programarActualizacionEnVivo(msg.type);
          }
        } catch (e) {}
      };
      sseStream.onerror = () => {
        if (sseStream) {
          sseStream.close();
          sseStream = null;
        }
      };
    } catch (e) {}
  }

  function programarActualizacionEnVivo(tipo) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(async () => {
      await cargar();
      if (tipo === 'survey_submitted') {
        mostrarToast('✨ <strong>Nueva encuesta finalizada:</strong> El tablero se actualizó automáticamente con el nuevo registro.', 5500);
      } else if (tipo === 'data_reset') {
        mostrarToast('ℹ️ <strong>Base de datos reiniciada:</strong> El tablero se ha sincronizado.', 4500);
      } else if (tipo === 'workshop_registered') {
        mostrarToast('👥 <strong>Nuevo registro en talleres:</strong> Un docente se inscribió en los talleres colaborativos.', 5500);
      }
    }, 220);
  }

  function iniciarEscuchaEnVivo() {
    try {
      const r = localStorage.getItem(LS_SYNC_PING_KEY);
      if (r) ultimoSyncTs = (JSON.parse(r) || {}).ts || 0;
    } catch (e) {}

    // 1. BroadcastChannel entre pestañas del mismo navegador (instantáneo en local y GitHub Pages)
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(SYNC_CHANNEL_NAME);
        bc.onmessage = ev => {
          const msg = ev && ev.data;
          if (!msg || !msg.type) return;
          if (msg.ts && msg.ts <= ultimoSyncTs) return;
          if (msg.ts) ultimoSyncTs = msg.ts;
          if (msg.type === 'survey_submitted' || msg.type === 'data_reset' || msg.type === 'workshop_registered') {
            programarActualizacionEnVivo(msg.type);
          }
        };
      }
    } catch (e) {}

    // 2. Respaldo por evento storage entre ventanas/pestañas
    window.addEventListener('storage', e => {
      if (e.key === LS_SYNC_PING_KEY && e.newValue) {
        try {
          const msg = JSON.parse(e.newValue);
          if (msg && msg.ts && msg.ts > ultimoSyncTs) {
            ultimoSyncTs = msg.ts;
            programarActualizacionEnVivo(msg.type);
          }
        } catch (err) {}
      } else if (e.key === LS_LOCAL_SUBMISSIONS_KEY) {
        programarActualizacionEnVivo('survey_submitted');
      } else if (e.key === LS_TALLERES_KEY) {
        programarActualizacionEnVivo('workshop_registered');
      }
    });

    // 3. Al volver a enfocar la pestaña del dashboard, verificar si hubo envíos recientes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const raw = localStorage.getItem(LS_SYNC_PING_KEY);
        if (raw) {
          const msg = JSON.parse(raw);
          if (msg && msg.ts && msg.ts > ultimoSyncTs) {
            ultimoSyncTs = msg.ts;
            programarActualizacionEnVivo(msg.type);
          }
        }
      } catch (e) {}
    });
  }

  async function obtenerDatos() {
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      return new Promise((res, rej) => google.script.run.withSuccessHandler(res).withFailureHandler(rej).getDashboardData());
    }
    try {
      const j = await fetchJSON('api/resultados');
      if (j && Array.isArray(j.docentes)) {
        modoServidorActivo = true;
        asegurarConexionSSE();
        return combinarDatosConLocales(j);
      }
    } catch (e) {
      modoServidorActivo = false;
    }

    let baseEst = { docentes: [], respuestas: [], talleres: [] };
    const limpiadoLocal = leerLS(LS_BASELINE_CLEARED_KEY) === '1';
    if (!limpiadoLocal) {
      const docentes = await fetchJSON('data/docentes.json');
      const respuestas = await fetchJSON('data/respuestas.json').catch(() => []);
      const talleres = await fetchJSON('data/talleres.json').catch(() => []);
      baseEst = { docentes, respuestas, talleres };
    }
    return combinarDatosConLocales(baseEst);
  }

  async function cargar() {
    const btn = $('#btn-refresh');
    btn.classList.add('spinning');
    btn.textContent = '⟳ Cargando…';
    const box = $('#state-box');
    try {
      const data = await obtenerDatos();
      const prep = preparar(data || {});
      state.docentes = prep.docentes;
      state.asignaturas = prep.asignaturas;
      state.talleres = Array.isArray(data && data.talleres) ? data.talleres : [];
      state.generado = (data && data.generado) || new Date().toISOString();
      const badgeT = $('#badge-talleres-count');
      if (badgeT) badgeT.textContent = state.talleres.length;
      box.hidden = true;
      construirFiltros();
      render();
      const g = new Date(state.generado);
      if (state.docentes.length > 0) {
        const strTalleres = state.talleres.length ? ` · ${state.talleres.length} en talleres` : '';
        $('#hero-sub').textContent = `${state.docentes.length} docentes · ${state.asignaturas.length} asignaturas distintas${strTalleres} · Actualizado ${g.toLocaleDateString('es-NI', { dateStyle: 'medium' })} ${g.toLocaleTimeString('es-NI', { timeStyle: 'short' })}`;
      } else {
        $('#hero-sub').textContent = '0 docentes · 0 asignaturas distintas · Base de datos limpia y lista para datos reales';
      }
    } catch (err) {
      console.error(err);
      box.hidden = false;
      box.innerHTML = `<strong>No fue posible cargar las respuestas</strong>
        Inicie el servidor local con <code>node server.js</code> y abra <code>http://localhost:3000/dashboard</code>.<br>
        <small>Detalle: ${esc(err && err.message ? err.message : err)}</small>`;
      $('#hero-sub').textContent = 'Sin conexión con la fuente de datos';
    } finally {
      btn.classList.remove('spinning');
      btn.textContent = '⟳ Actualizar';
    }
  }

  // ==========================================================================
  // 14. INICIALIZACIÓN Y EVENTOS GLOBALES
  // ==========================================================================
  function iniciar() {
    if (typeof Chart !== 'undefined') {
      Chart.register(pluginEtiquetasPct, pluginTextoCentro, pluginEtiquetasBarra, pluginLineaRef);
    }
    aplicarTemaCharts();

    $$('.nav-item').forEach(b => b.addEventListener('click', () => irVista(b.dataset.view)));
    $('#btn-refresh').addEventListener('click', cargar);
    $('#btn-theme').addEventListener('click', () => {
      state.tema = state.tema === 'dark' ? 'light' : 'dark';
      guardarLS('dash_tema', state.tema);
      aplicarTemaCharts();
      render();
    });
    $('#btn-reset-filters').addEventListener('click', () => {
      Object.keys(state.filtros).forEach(k => { state.filtros[k] = ''; });
      construirFiltros();
      render();
    });

    // Control para eliminar datos de prueba
    const btnHeroClear = $('#btn-eliminar-prueba');
    if (btnHeroClear) {
      btnHeroClear.addEventListener('click', () => {
        if (state.docentes.length === 0) {
          mostrarToast('ℹ️ La base de datos ya está limpia y preparada para recibir datos reales.');
          return;
        }
        abrirModalEliminar();
      });
    }

    const bCloseModal = $('#btn-close-modal');
    if (bCloseModal) bCloseModal.addEventListener('click', cerrarModalEliminar);
    const bCancelModal = $('#btn-cancel-clear');
    if (bCancelModal) bCancelModal.addEventListener('click', cerrarModalEliminar);

    const modalEl = $('#modal-clear-data');
    if (modalEl) {
      modalEl.addEventListener('click', e => {
        if (e.target === modalEl) cerrarModalEliminar();
      });
    }

    const bBackupModal = $('#btn-download-backup');
    if (bBackupModal) {
      bBackupModal.addEventListener('click', () => {
        const payload = {
          exportado: new Date().toISOString(),
          totalDocentes: state.docentes.length,
          docentes: state.docentes,
          asignaturas: state.asignaturas
        };
        descargar(`respaldo_datos_prueba_${hoy()}.json`, JSON.stringify(payload, null, 2), 'application/json');
        mostrarToast('⬇ Copia de respaldo JSON descargada a tu equipo.');
      });
    }

    const bConfirmModal = $('#btn-confirm-clear');
    if (bConfirmModal) bConfirmModal.addEventListener('click', ejecutarEliminarDataPrueba);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') cerrarModalEliminar();
    });

    // Tooltip propio para SVG / mapas de calor
    const tip = $('#dash-tooltip');
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[data-tip]');
      if (t) { tip.innerHTML = t.getAttribute('data-tip'); tip.classList.add('show'); }
      else tip.classList.remove('show');

      const nodo = e.target.closest('.sk-node');
      if (nodo) {
        const id = nodo.dataset.id;
        $$('.sk-link', nodo.closest('svg')).forEach(l => { l.style.opacity = (l.dataset.src === id || l.dataset.tgt === id) ? '0.8' : '0.08'; });
      }
    });
    document.addEventListener('mouseout', e => {
      const nodo = e.target.closest('.sk-node');
      if (nodo && !nodo.contains(e.relatedTarget)) $$('.sk-link', nodo.closest('svg')).forEach(l => { l.style.opacity = ''; });
    });
    document.addEventListener('mousemove', e => {
      if (!tip.classList.contains('show')) return;
      const r = tip.getBoundingClientRect();
      let x = e.clientX + 16, y = e.clientY + 16;
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 16;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 16;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    });
    document.addEventListener('click', e => {
      const g = e.target.closest('[data-goto]');
      if (g) irVista(g.dataset.goto);
    });

    let tRes;
    window.addEventListener('resize', () => { clearTimeout(tRes); tRes = setTimeout(() => { if (VISTAS_LIKERT.indexOf(state.vista) >= 0) render(); }, 300); });
    window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== state.vista) irVista(v); });

    const inicial = location.hash.slice(1);
    if (inicial) {
      state.vista = ['resumen', 'flujos', 'datos', 'talleres'].concat(VISTAS_LIKERT).indexOf(inicial) >= 0 ? inicial : 'resumen';
      $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === state.vista));
    }

    if (typeof Chart === 'undefined') {
      const box = $('#state-box');
      box.hidden = false;
      box.innerHTML = '<strong>No se pudo cargar la librería de gráficos</strong>Verifique la conexión a Internet (Chart.js se carga desde jsDelivr).';
    }
    iniciarEscuchaEnVivo();
    cargar();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
