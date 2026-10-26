/**
 * TESIS DOCTORAL - FCAE / UAM
 * Lógica de la Aplicación Frontend, Motor de Matrices y Asistente por Etapas (Wizard)
 */

document.addEventListener('DOMContentLoaded', function() {
  // Estado de la aplicación
  let etapaActual = 1;
  const TOTAL_ETAPAS = 5;
  let matricesGeneradas = false;
  let asignaturasActivas = [];
  let idsAsignaturasRenderizadas = [];
  let subjectIdCounter = 0;
  // Almacén reactivo de respuestas por ID único de fila de asignatura (conserva selecciones al editar/eliminar)
  const estadoRespuestasMatrices = {};

  // Elementos DOM principales
  const form = document.getElementById('survey-form');
  const chkConsent = document.getElementById('chk-consent');
  const btnSubmit = document.getElementById('btn-submit');
  const btnAddSubject = document.getElementById('btn-add-subject');
  const subjectsContainer = document.getElementById('subjects-container');
  const subjectsDupNotice = document.getElementById('subjects-dup-notice');
  const secMatrices = document.getElementById('sec-matrices');
  const matricesContainer = document.getElementById('matrices-render-container');
  const errorBanner = document.getElementById('error-banner');
  const successCard = document.getElementById('card-success');
  const receiptIdEl = document.getElementById('receipt-id');
  const receiptTimestampEl = document.getElementById('receipt-timestamp');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const progressCount = document.getElementById('progress-count');
  const stepperNav = document.getElementById('survey-stepper');

  // Botones de navegación entre etapas
  const btnNext1 = document.getElementById('btn-next-1');
  const btnPrev2 = document.getElementById('btn-prev-2');
  const btnNext2 = document.getElementById('btn-next-2');
  const btnPrev3 = document.getElementById('btn-prev-3');
  const btnNext3 = document.getElementById('btn-next-3');
  const btnPrev4 = document.getElementById('btn-prev-4');
  const btnNext4 = document.getElementById('btn-next-4');
  const btnPrev5 = document.getElementById('btn-prev-5');



  // Escape seguro de HTML
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Generador UUID v4 para entorno local
  function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ==========================================================================
  // 1. GESTIÓN DEL ASISTENTE POR ETAPAS (WIZARD 5 ETAPAS)
  // ==========================================================================
  function actualizarStepperUI(etapaDestino) {
    if (!stepperNav) return;
    for (let i = 1; i <= TOTAL_ETAPAS; i++) {
      const stepBtn = document.getElementById('step-btn-' + i);
      const stepDiv = document.getElementById('step-div-' + i);

      if (stepBtn) {
        stepBtn.classList.remove('active', 'completed');
        const numSpan = stepBtn.querySelector('.step-number');
        if (i < etapaDestino) {
          stepBtn.classList.add('completed');
          if (numSpan) numSpan.textContent = '✓';
        } else if (i === etapaDestino) {
          stepBtn.classList.add('active');
          if (numSpan) numSpan.textContent = i;
        } else {
          if (numSpan) numSpan.textContent = i;
        }
      }

      if (stepDiv) {
        if (i < etapaDestino) {
          stepDiv.classList.add('completed');
        } else {
          stepDiv.classList.remove('completed');
        }
      }
    }
  }

  function cambiarEtapa(nuevaEtapa, validar = true) {
    if (nuevaEtapa === etapaActual) return true;

    // Si avanza a una etapa superior, validar todas las etapas intermedias en orden
    if (validar && nuevaEtapa > etapaActual) {
      for (let s = etapaActual; s < nuevaEtapa; s++) {
        const ok = validarEtapa(s);
        if (!ok) {
          if (s !== etapaActual) {
            cambiarEtapa(s, false);
            validarEtapa(s);
          }
          return false;
        }
      }
    }

    // Ocultar banner de error si estaba visible
    ocultarError();

    // Transición de paneles
    const paneActual = document.getElementById('stage-' + etapaActual);
    const paneNuevo = document.getElementById('stage-' + nuevaEtapa);

    if (paneActual) paneActual.classList.remove('active');
    if (paneNuevo) paneNuevo.classList.add('active');

    etapaActual = nuevaEtapa;
    actualizarStepperUI(nuevaEtapa);

    // Scroll suave hacia la parte superior del formulario
    window.scrollTo({ top: Math.max(0, (stepperNav ? stepperNav.offsetTop - 70 : 0)), behavior: 'smooth' });

    calcularProgreso();
    return true;
  }

  // Validaciones específicas por etapa
  function validarEtapa(etapa) {
    document.querySelectorAll('.is-invalid, .has-error').forEach(el => {
      el.classList.remove('is-invalid', 'has-error');
    });

    if (etapa === 1) {
      // Etapa 1: Consentimiento
      if (!chkConsent.checked) {
        mostrarError('Debe leer y aceptar el consentimiento informado para continuar con la encuesta.', chkConsent);
        return false;
      }
      return true;
    }

    if (etapa === 2) {
      // Etapa 2: Datos Generales
      const txtEdad = document.getElementById('txt-edad');
      const edad = parseInt(txtEdad.value, 10);
      if (isNaN(edad) || edad < 20 || edad > 80) {
        txtEdad.classList.add('is-invalid');
        mostrarError('La edad es obligatoria y debe encontrarse entre 20 y 80 años.', txtEdad);
        return false;
      }

      const cmbGenero = document.getElementById('cmb-genero');
      if (!cmbGenero.value) {
        cmbGenero.classList.add('is-invalid');
        mostrarError('Por favor seleccione su género.', cmbGenero);
        return false;
      }

      const txtExpProf = document.getElementById('txt-exp-prof');
      const expProf = parseInt(txtExpProf.value, 10);
      if (isNaN(expProf) || expProf < 0 || expProf > 70) {
        txtExpProf.classList.add('is-invalid');
        mostrarError('Años de experiencia profesional inválidos (0 a 70).', txtExpProf);
        return false;
      }

      const txtExpDoc = document.getElementById('txt-exp-doc');
      const expDoc = parseInt(txtExpDoc.value, 10);
      if (isNaN(expDoc) || expDoc < 0 || expDoc > 70) {
        txtExpDoc.classList.add('is-invalid');
        mostrarError('Años de experiencia docente inválidos (0 a 70).', txtExpDoc);
        return false;
      }

      const txtGrado = document.getElementById('txt-grado');
      if (!txtGrado.value.trim()) {
        txtGrado.classList.add('is-invalid');
        mostrarError('El grado académico máximo obtenido es obligatorio.', txtGrado);
        return false;
      }

      const radInt = document.querySelector('input[name="rad-colab-int"]:checked');
      if (!radInt) {
        mostrarError('Indique si ha colaborado en proyectos de investigación interna.', document.getElementsByName('rad-colab-int')[0]);
        return false;
      }
      const txtColabIntCual = document.getElementById('txt-colab-int-cual');
      if (radInt.value === 'Sí' && !txtColabIntCual.value.trim()) {
        txtColabIntCual.classList.add('is-invalid');
        mostrarError('Especifique el proyecto o línea de investigación interna en el campo correspondiente.', txtColabIntCual);
        return false;
      }

      const radExt = document.querySelector('input[name="rad-colab-ext"]:checked');
      if (!radExt) {
        mostrarError('Indique si ha colaborado en proyectos de investigación externos.', document.getElementsByName('rad-colab-ext')[0]);
        return false;
      }
      const txtColabExtCual = document.getElementById('txt-colab-ext-cual');
      if (radExt.value === 'Sí' && !txtColabExtCual.value.trim()) {
        txtColabExtCual.classList.add('is-invalid');
        mostrarError('Especifique el organismo o institución patrocinadora externa.', txtColabExtCual);
        return false;
      }

      const radPub = document.querySelector('input[name="rad-pub"]:checked');
      if (!radPub) {
        mostrarError('Indique si ha publicado artículos científicos en los últimos 3 años.', document.getElementsByName('rad-pub')[0]);
        return false;
      }
      const txtPubCual = document.getElementById('txt-pub-cual');
      if (radPub.value === 'Sí' && !txtPubCual.value.trim()) {
        txtPubCual.classList.add('is-invalid');
        mostrarError('Especifique el título o revista indexada de su publicación.', txtPubCual);
        return false;
      }

      return true;
    }

    if (etapa === 3) {
      // Etapa 3: Competencias Investigativas (Q3, 7 ítems)
      for (let i = 0; i < ITEMS_Q3.length; i++) {
        const r = document.querySelector('input[name="rad-q3-' + i + '"]:checked');
        if (!r) {
          const row = document.getElementById('row-rad-q3-' + i);
          if (row) row.classList.add('has-error');
          mostrarError('Falta responder la afirmación ' + (i + 1) + ' en Competencias Investigativas (Q3).', row);
          return false;
        }
      }
      return true;
    }

    if (etapa === 4) {
      // Sincronizar en tiempo real antes de validar Etapa 4
      sincronizarMatricesEnVivo();

      const infoAsig = obtenerAsignaturasDesdeInputs();
      const inputs = Array.from(subjectsContainer.getElementsByClassName('subject-input'));

      if (infoAsig.duplicado) {
        if (infoAsig.inputDuplicado) infoAsig.inputDuplicado.classList.add('is-invalid');
        mostrarError('Existen asignaturas duplicadas: "' + infoAsig.duplicado + '". Por favor ingrese nombres diferentes.', infoAsig.inputDuplicado || inputs[0]);
        if (infoAsig.inputDuplicado) infoAsig.inputDuplicado.focus();
        return false;
      }

      if (infoAsig.activas.length === 0) {
        if (inputs.length > 0) {
          inputs[0].classList.add('is-invalid');
          inputs[0].focus();
        }
        mostrarError('Debe ingresar el nombre de al menos una asignatura que imparte actualmente (mínimo 1, máximo 5).', inputs[0] || subjectsContainer);
        return false;
      }

      if (infoAsig.activas.length > 5) {
        mostrarError('El máximo permitido es de 5 asignaturas.', subjectsContainer);
        return false;
      }

      // Validar que todos los ítems de Matriz A estén respondidos (12 ítems x N asignaturas)
      for (let i = 0; i < ITEMS_MATRIZ_A.length; i++) {
        for (let j = 0; j < asignaturasActivas.length; j++) {
          const selA = document.querySelector('select[name="A_ITEM' + i + '_' + j + '"]');
          if (!selA || !selA.value) {
            const cellA = document.getElementById('cell-A-' + i + '-' + j);
            const rowA = document.getElementById('row-A-' + i);
            if (cellA) cellA.classList.add('has-error');
            if (rowA) rowA.classList.add('has-error');
            mostrarError('En la Matriz A (Práctica Docente), ítem ' + (i + 1) + ': seleccione una opción en el desplegable para la asignatura "' + asignaturasActivas[j] + '".', selA || cellA || rowA);
            if (selA) selA.focus();
            return false;
          }
        }
      }

      // Validar que todos los ítems de Matriz B estén respondidos (16 ítems x N asignaturas)
      for (let i = 0; i < ITEMS_MATRIZ_B.length; i++) {
        for (let j = 0; j < asignaturasActivas.length; j++) {
          const selB = document.querySelector('select[name="B_ITEM' + i + '_' + j + '"]');
          if (!selB || !selB.value) {
            const cellB = document.getElementById('cell-B-' + i + '-' + j);
            const rowB = document.getElementById('row-B-' + i);
            if (cellB) cellB.classList.add('has-error');
            if (rowB) rowB.classList.add('has-error');
            mostrarError('En la Matriz B (Estrategias), ítem ' + (i + 1) + ': seleccione una opción en el desplegable para la asignatura "' + asignaturasActivas[j] + '".', selB || cellB || rowB);
            if (selB) selB.focus();
            return false;
          }
        }
      }

      return true;
    }

    if (etapa === 5) {
      // Etapa 5: Valoración del Entorno (Q6, 10 ítems)
      for (let i = 0; i < ITEMS_Q6.length; i++) {
        const r = document.querySelector('input[name="rad-q6-' + i + '"]:checked');
        if (!r) {
          const row = document.getElementById('row-rad-q6-' + i);
          if (row) row.classList.add('has-error');
          mostrarError('Falta responder la afirmación ' + (i + 1) + ' en Valoración del Entorno (Q6).', row);
          return false;
        }
      }
      return true;
    }

    return true;
  }

  // Listeners de los botones de navegación entre etapas
  if (btnNext1) btnNext1.addEventListener('click', () => cambiarEtapa(2));
  if (btnPrev2) btnPrev2.addEventListener('click', () => cambiarEtapa(1, false));
  if (btnNext2) btnNext2.addEventListener('click', () => cambiarEtapa(3));
  if (btnPrev3) btnPrev3.addEventListener('click', () => cambiarEtapa(2, false));
  if (btnNext3) btnNext3.addEventListener('click', () => cambiarEtapa(4));
  if (btnPrev4) btnPrev4.addEventListener('click', () => cambiarEtapa(3, false));
  if (btnNext4) btnNext4.addEventListener('click', () => cambiarEtapa(5));

  // Sincronización instantánea al editar cualquier campo en Registro de Asignaturas
  subjectsContainer.addEventListener('input', function(e) {
    if (e.target && e.target.classList.contains('subject-input')) {
      if (etapaActual === 4) ocultarError();
      sincronizarMatricesEnVivo();
    }
  });
  if (btnPrev5) btnPrev5.addEventListener('click', () => cambiarEtapa(4, false));

  // Navegación interactiva haciendo clic en el stepper superior
  if (stepperNav) {
    stepperNav.addEventListener('click', function(e) {
      const btn = e.target.closest('.step-item');
      if (!btn) return;
      const targetStep = parseInt(btn.getAttribute('data-step'), 10);
      if (targetStep < etapaActual) {
        cambiarEtapa(targetStep, false);
      } else if (targetStep > etapaActual) {
        cambiarEtapa(targetStep, true);
      }
    });
  }

  // ==========================================================================
  // 2. CÁLCULO DE PROGRESO GLOBAL
  // ==========================================================================
  function calcularProgreso() {
    let totalEsperado = 0;
    let completados = 0;

    // Consentimiento
    totalEsperado += 1;
    if (chkConsent && chkConsent.checked) completados += 1;

    // Sección 1 / Etapa 2: Datos Generales (8 campos)
    totalEsperado += 8;
    if (document.getElementById('txt-edad').value) completados += 1;
    if (document.getElementById('cmb-genero').value) completados += 1;
    if (document.getElementById('txt-exp-prof').value) completados += 1;
    if (document.getElementById('txt-exp-doc').value) completados += 1;
    if (document.getElementById('txt-grado').value.trim()) completados += 1;

    const radInt = document.querySelector('input[name="rad-colab-int"]:checked');
    if (radInt) {
      if (radInt.value === 'No' || (radInt.value === 'Sí' && document.getElementById('txt-colab-int-cual').value.trim())) {
        completados += 1;
      }
    }

    const radExt = document.querySelector('input[name="rad-colab-ext"]:checked');
    if (radExt) {
      if (radExt.value === 'No' || (radExt.value === 'Sí' && document.getElementById('txt-colab-ext-cual').value.trim())) {
        completados += 1;
      }
    }

    const radPub = document.querySelector('input[name="rad-pub"]:checked');
    if (radPub) {
      if (radPub.value === 'No' || (radPub.value === 'Sí' && document.getElementById('txt-pub-cual').value.trim())) {
        completados += 1;
      }
    }

    // Sección 2 / Etapa 3: Q3 (7 ítems)
    totalEsperado += ITEMS_Q3.length;
    for (let i = 0; i < ITEMS_Q3.length; i++) {
      if (document.querySelector('input[name="rad-q3-' + i + '"]:checked')) {
        completados += 1;
      }
    }

    // Sección 5 / Etapa 5: Q6 (10 ítems)
    totalEsperado += ITEMS_Q6.length;
    for (let i = 0; i < ITEMS_Q6.length; i++) {
      if (document.querySelector('input[name="rad-q6-' + i + '"]:checked')) {
        completados += 1;
      }
    }

    // Sección 4 / Etapa 4: Matrices dinámicas
    if (matricesGeneradas && asignaturasActivas.length > 0) {
      const itemsPorAsignatura = ITEMS_MATRIZ_A.length + ITEMS_MATRIZ_B.length; // 12 + 16 = 28
      totalEsperado += (asignaturasActivas.length * itemsPorAsignatura);

      const selectsMatrices = matricesContainer.querySelectorAll('select.matrix-select');
      selectsMatrices.forEach(sel => {
        if (sel.value) completados += 1;
      });
    }

    const porcentaje = totalEsperado > 0 ? Math.min(100, Math.round((completados / totalEsperado) * 100)) : 0;
    if (progressBar) progressBar.style.width = porcentaje + '%';
    if (progressText) progressText.textContent = 'Progreso: ' + porcentaje + '%';
    if (progressCount) progressCount.textContent = completados + ' de ' + totalEsperado + ' completados';

    guardarBorradorLocal();
  }

  // ==========================================================================
  // 3. GESTIÓN DE ASIGNATURAS DINÁMICAS Y MOTOR REACTIVO DE MATRICES A Y B
  // ==========================================================================
  const qtyChipsContainer = document.getElementById('qty-chips');

  function truncarTexto(str, max = 22) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  function actualizarChipsCantidad(cantidad) {
    if (!qtyChipsContainer) return;
    const chips = qtyChipsContainer.querySelectorAll('.btn-qty-chip');
    chips.forEach(chip => {
      const q = parseInt(chip.getAttribute('data-qty'), 10);
      if (q === cantidad) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  function actualizarEstadoBotonesEliminar() {
    const rows = subjectsContainer.getElementsByClassName('subject-row');
    for (let i = 0; i < rows.length; i++) {
      const inp = rows[i].querySelector('.subject-input');
      const btnDel = rows[i].querySelector('.btn-delete-subject');
      if (btnDel) {
        btnDel.style.display = 'inline-flex';
        if (rows.length === 1) {
          const tieneTexto = inp && inp.value.trim().length > 0;
          btnDel.disabled = !tieneTexto;
          btnDel.title = tieneTexto ? 'Eliminar asignatura registrada' : 'Escriba una asignatura para poder eliminarla';
        } else {
          btnDel.disabled = false;
          btnDel.title = 'Eliminar esta fila de asignatura';
        }
      }
    }
  }

  function obtenerAsignaturasDesdeInputs() {
    const rows = Array.from(subjectsContainer.getElementsByClassName('subject-row'));
    const activas = [];
    const mapNorm = new Map();
    let duplicado = null;
    let inputDuplicado = null;

    rows.forEach(function(row, idx) {
      const id = row.getAttribute('data-subject-id');
      const input = row.querySelector('.subject-input');
      if (!input) return;
      input.classList.remove('is-invalid');

      const val = input.value.trim();
      if (val) {
        const norm = val.toLowerCase();
        if (mapNorm.has(norm)) {
          input.classList.add('is-invalid');
          const prevInput = mapNorm.get(norm);
          if (prevInput) prevInput.classList.add('is-invalid');
          if (!duplicado) {
            duplicado = val;
            inputDuplicado = input;
          }
        } else {
          mapNorm.set(norm, input);
        }
        activas.push({
          id: id,
          nombre: val,
          rowNum: idx + 1,
          inputEl: input
        });
      }
    });

    if (subjectsDupNotice) {
      if (duplicado) {
        subjectsDupNotice.textContent = 'Atención: Existen asignaturas con el mismo nombre ("' + duplicado + '"). Ingrese nombres diferentes para cada asignatura.';
        subjectsDupNotice.style.display = 'block';
      } else {
        subjectsDupNotice.style.display = 'none';
        subjectsDupNotice.textContent = '';
      }
    }

    return {
      activas: activas,
      duplicado: duplicado,
      inputDuplicado: inputDuplicado
    };
  }

  // Guarda en el almacén reactivo cualquier valor actualmente seleccionado en el DOM
  function capturarRespuestasMatricesDOM() {
    if (!matricesContainer) return;
    const selects = matricesContainer.querySelectorAll('select.matrix-select[data-subject-id]');
    selects.forEach(function(sel) {
      const sid = sel.getAttribute('data-subject-id');
      const mat = sel.getAttribute('data-matriz');
      const itemIdx = sel.getAttribute('data-item');
      if (sid && estadoRespuestasMatrices[sid] && (mat === 'A' || mat === 'B') && itemIdx !== null) {
        estadoRespuestasMatrices[sid][mat][itemIdx] = sel.value || '';
      }
    });
  }

  function renderEstadoVacioMatrices() {
    matricesContainer.innerHTML =
      '<div class="matrices-empty-state">' +
        '<strong>Matrices A y B vinculadas en tiempo real:</strong> ' +
        'Escriba el nombre de al menos una asignatura en el registro superior para habilitar y visualizar al instante la <strong>Matriz A</strong> (12 ítems de práctica docente) y la <strong>Matriz B</strong> (16 ítems de estrategias). Si edita o elimina alguna asignatura, ambas matrices se actualizarán automáticamente.' +
      '</div>';
  }

  // Actualiza únicamente encabezados y etiquetas en vivo sin reconstruir los <select> (preserva foco y estado)
  function actualizarEncabezadosMatricesEnVivo(activas) {
    activas.forEach(function(asig, j) {
      const sid = asig.id;
      const nombreCorto = truncarTexto(asig.nombre, 22);
      const nombrePill = truncarTexto(asig.nombre, 28);

      // Actualizar píldora de sincronización
      const pill = matricesContainer.querySelector('.sync-subject-pill[data-pill-subject-id="' + sid + '"]');
      if (pill) {
        pill.title = asig.nombre;
        const numEl = pill.querySelector('.sync-pill-num');
        const txtEl = pill.querySelector('.sync-pill-name');
        if (numEl) numEl.textContent = (j + 1);
        if (txtEl) txtEl.textContent = nombrePill;
      }

      // Actualizar encabezados <th> en Matriz A y Matriz B
      const headers = matricesContainer.querySelectorAll('th[data-col-subject-id="' + sid + '"]');
      headers.forEach(function(th) {
        th.title = asig.nombre;
        const badgeEl = th.querySelector('.subject-header-badge');
        const nameEl = th.querySelector('.subject-header-name');
        if (badgeEl) badgeEl.textContent = 'Asignatura ' + (j + 1);
        if (nameEl) nameEl.textContent = nombreCorto;
      });

      // Actualizar atributos aria-label de los desplegables de esa columna
      const selectsCol = matricesContainer.querySelectorAll('select.matrix-select[data-subject-id="' + sid + '"]');
      selectsCol.forEach(function(sel) {
        const itemIdx = parseInt(sel.getAttribute('data-item'), 10);
        sel.setAttribute('aria-label', 'Evaluación ' + asig.nombre + ' Ítem ' + (itemIdx + 1));
      });
    });
  }

  // Renderiza las dos tablas unificadas (Matriz A y Matriz B) restaurando las respuestas de cada asignatura activa
  function renderMatrices(activas) {
    matricesContainer.innerHTML = '';
    asignaturasActivas = activas.map(function(a) { return a.nombre; });
    idsAsignaturasRenderizadas = activas.map(function(a) { return a.id; });

    if (activas.length === 0) {
      matricesGeneradas = false;
      renderEstadoVacioMatrices();
      calcularProgreso();
      return;
    }

    // Barra superior de estado sincronizado en tiempo real
    const syncBar = document.createElement('div');
    syncBar.className = 'matrices-sync-bar';
    let pillsHtml = '<div class="matrices-sync-pills"><strong style="color:#0099A8;">Asignaturas en matriz:</strong>';
    activas.forEach(function(asig, j) {
      pillsHtml +=
        '<span class="sync-subject-pill" data-pill-subject-id="' + escapeHtml(asig.id) + '" title="' + escapeHtml(asig.nombre) + '">' +
          '<span class="sync-pill-num">' + (j + 1) + '</span>' +
          '<span class="sync-pill-name">' + escapeHtml(truncarTexto(asig.nombre, 28)) + '</span>' +
        '</span>';
    });
    pillsHtml += '</div><span class="sync-status-tag">⟳ Actualización instantánea activa</span>';
    syncBar.innerHTML = pillsHtml;
    matricesContainer.appendChild(syncBar);

    // -------------------------------------------------------------
    // Matriz A (12 filas de ítems x N columnas de asignaturas)
    // -------------------------------------------------------------
    const blockA = document.createElement('div');
    blockA.className = 'matrix-section-block';
    blockA.id = 'sec-block-matA';

    let htmlA = '<div class="matrix-heading">Matriz A — Práctica docente e investigación formativa (12 ítems)</div>' +
      '<div class="scale-legend-box"><strong>Escala Likert:</strong> 1 = Nunca | 2 = Casi nunca | 3 = Ocasionalmente | 4 = A veces | 5 = Frecuentemente | 6 = Casi siempre | 7 = Siempre</div>' +
      '<div class="matrix-table-scroll-wrapper">' +
        '<table class="matrix-table-unified" id="table-matA">' +
          '<thead>' +
            '<tr>' +
              '<th class="col-item-text">Ítem / Práctica Docente</th>';

    activas.forEach(function(asig, j) {
      htmlA += '<th class="col-subject-eval" data-col-subject-id="' + escapeHtml(asig.id) + '" title="' + escapeHtml(asig.nombre) + '">' +
        '<div class="subject-header-badge">Asignatura ' + (j + 1) + '</div>' +
        '<div class="subject-header-name">' + escapeHtml(truncarTexto(asig.nombre, 22)) + '</div>' +
      '</th>';
    });

    htmlA += '</tr></thead><tbody>';

    ITEMS_MATRIZ_A.forEach(function(itemTexto, i) {
      htmlA += '<tr id="row-A-' + i + '">' +
        '<td class="item-desc-cell"><span class="point-number">' + (i + 1) + '.</span> ' + escapeHtml(itemTexto) + '</td>';

      activas.forEach(function(asig, j) {
        const guardadoA = (estadoRespuestasMatrices[asig.id] && estadoRespuestasMatrices[asig.id].A[i]) || '';
        const clsSelectedA = guardadoA ? ' is-selected' : '';
        htmlA += '<td class="cell-matrix-eval" id="cell-A-' + i + '-' + j + '">' +
          '<select name="A_ITEM' + i + '_' + j + '" id="sel-A-' + i + '-' + j + '" data-subject-id="' + escapeHtml(asig.id) + '" data-matriz="A" data-item="' + i + '" class="form-control matrix-select' + clsSelectedA + '" aria-label="Evaluación ' + escapeHtml(asig.nombre) + ' Ítem ' + (i + 1) + '">' +
            '<option value="">-- Seleccionar (1-7) --</option>';
        for (let v = 1; v <= 7; v++) {
          const selAttr = String(guardadoA) === String(v) ? ' selected' : '';
          htmlA += '<option value="' + v + '"' + selAttr + '>' + v + ' — ' + escapeHtml(ESCALAS.frecuencia[v - 1].label) + '</option>';
        }
        htmlA += '</select></td>';
      });

      htmlA += '</tr>';
    });

    htmlA += '</tbody></table></div>';
    blockA.innerHTML = htmlA;
    matricesContainer.appendChild(blockA);

    // -------------------------------------------------------------
    // Matriz B (16 filas de ítems x N columnas de asignaturas)
    // -------------------------------------------------------------
    const blockB = document.createElement('div');
    blockB.className = 'matrix-section-block';
    blockB.id = 'sec-block-matB';

    let htmlB = '<div class="matrix-heading" style="margin-top: 32px;">Matriz B — Conocimiento y aplicación de estrategias (16 ítems)</div>' +
      '<div class="scale-legend-box"><strong>Escala Likert:</strong> 1 = Nulo | 2 = Muy bajo | 3 = Bajo | 4 = Medio | 5 = Moderadamente alto | 6 = Alto | 7 = Experto</div>' +
      '<div class="matrix-table-scroll-wrapper">' +
        '<table class="matrix-table-unified" id="table-matB">' +
          '<thead>' +
            '<tr>' +
              '<th class="col-item-text">Ítem / Estrategia de Enseñanza-Aprendizaje</th>';

    activas.forEach(function(asig, j) {
      htmlB += '<th class="col-subject-eval" data-col-subject-id="' + escapeHtml(asig.id) + '" title="' + escapeHtml(asig.nombre) + '">' +
        '<div class="subject-header-badge">Asignatura ' + (j + 1) + '</div>' +
        '<div class="subject-header-name">' + escapeHtml(truncarTexto(asig.nombre, 22)) + '</div>' +
      '</th>';
    });

    htmlB += '</tr></thead><tbody>';

    ITEMS_MATRIZ_B.forEach(function(itemTexto, i) {
      htmlB += '<tr id="row-B-' + i + '">' +
        '<td class="item-desc-cell"><span class="point-number">' + (i + 1) + '.</span> ' + escapeHtml(itemTexto) + '</td>';

      activas.forEach(function(asig, j) {
        const guardadoB = (estadoRespuestasMatrices[asig.id] && estadoRespuestasMatrices[asig.id].B[i]) || '';
        const clsSelectedB = guardadoB ? ' is-selected' : '';
        htmlB += '<td class="cell-matrix-eval" id="cell-B-' + i + '-' + j + '">' +
          '<select name="B_ITEM' + i + '_' + j + '" id="sel-B-' + i + '-' + j + '" data-subject-id="' + escapeHtml(asig.id) + '" data-matriz="B" data-item="' + i + '" class="form-control matrix-select' + clsSelectedB + '" aria-label="Evaluación ' + escapeHtml(asig.nombre) + ' Ítem ' + (i + 1) + '">' +
            '<option value="">-- Seleccionar (1-7) --</option>';
        for (let v = 1; v <= 7; v++) {
          const selAttr = String(guardadoB) === String(v) ? ' selected' : '';
          htmlB += '<option value="' + v + '"' + selAttr + '>' + v + ' — ' + escapeHtml(ESCALAS.dominio[v - 1].label) + '</option>';
        }
        htmlB += '</select></td>';
      });

      htmlB += '</tr>';
    });

    htmlB += '</tbody></table></div>';
    blockB.innerHTML = htmlB;
    matricesContainer.appendChild(blockB);

    matricesGeneradas = true;
    calcularProgreso();
  }

  // Motor reactivo: sincroniza al instante Matriz A y Matriz B ante cualquier edición, adición o eliminación de asignaturas
  function sincronizarMatricesEnVivo() {
    const info = obtenerAsignaturasDesdeInputs();
    const activas = info.activas;
    actualizarEstadoBotonesEliminar();

    if (activas.length === 0) {
      capturarRespuestasMatricesDOM();
      matricesGeneradas = false;
      asignaturasActivas = [];
      idsAsignaturasRenderizadas = [];
      renderEstadoVacioMatrices();
      calcularProgreso();
      return;
    }

    const nuevosIds = activas.map(function(a) { return a.id; });
    const mismaEstructura =
      matricesGeneradas &&
      nuevosIds.length === idsAsignaturasRenderizadas.length &&
      nuevosIds.every(function(id, idx) { return id === idsAsignaturasRenderizadas[idx]; });

    if (mismaEstructura) {
      asignaturasActivas = activas.map(function(a) { return a.nombre; });
      actualizarEncabezadosMatricesEnVivo(activas);
      calcularProgreso();
    } else {
      capturarRespuestasMatricesDOM();
      renderMatrices(activas);
    }
  }

  function renumerarFilasAsignatura() {
    const rows = subjectsContainer.getElementsByClassName('subject-row');
    for (let i = 0; i < rows.length; i++) {
      const badge = rows[i].querySelector('.subject-index-badge');
      if (badge) badge.textContent = (i + 1);
      const input = rows[i].querySelector('.subject-input');
      if (input) input.placeholder = 'Nombre de la asignatura ' + (i + 1) + ' (ej. Metodología de la Investigación)';
    }
    if (btnAddSubject) {
      btnAddSubject.disabled = rows.length >= 5;
    }
    actualizarChipsCantidad(rows.length);
    sincronizarMatricesEnVivo();
  }

  function crearFilaAsignatura(valorInicial, omitirSync) {
    const rows = subjectsContainer.getElementsByClassName('subject-row');
    if (rows.length >= 5) return;

    const subjectId = 'subj_' + (++subjectIdCounter);
    estadoRespuestasMatrices[subjectId] = { A: {}, B: {} };

    const row = document.createElement('div');
    row.className = 'subject-row';
    row.setAttribute('data-subject-id', subjectId);
    row.innerHTML =
      '<div class="subject-index-badge"></div>' +
      '<input type="text" class="form-control subject-input" maxlength="150" value="' + escapeHtml(valorInicial || '') + '">' +
      '<button type="button" class="btn btn-danger btn-delete-subject">Eliminar</button>';

    subjectsContainer.appendChild(row);
    if (!omitirSync) {
      renumerarFilasAsignatura();
    }
  }

  function sincronizarCantidadFilas(objetivo) {
    capturarRespuestasMatricesDOM();
    const rows = subjectsContainer.getElementsByClassName('subject-row');
    const actuales = rows.length;
    if (objetivo > actuales) {
      for (let i = actuales; i < objetivo; i++) {
        crearFilaAsignatura('', true);
      }
      renumerarFilasAsignatura();
    } else if (objetivo < actuales) {
      for (let i = actuales - 1; i >= objetivo; i--) {
        const sid = rows[i].getAttribute('data-subject-id');
        if (sid) delete estadoRespuestasMatrices[sid];
        rows[i].remove();
      }
      if (etapaActual === 4) ocultarError();
      renumerarFilasAsignatura();
    }
  }

  if (qtyChipsContainer) {
    qtyChipsContainer.addEventListener('click', function(e) {
      const chip = e.target.closest('.btn-qty-chip');
      if (chip) {
        const qty = parseInt(chip.getAttribute('data-qty'), 10);
        sincronizarCantidadFilas(qty);
      }
    });
  }

  // Delegación de eventos para eliminar (o limpiar si es la única fila) una asignatura al instante
  subjectsContainer.addEventListener('click', function(e) {
    const btnDel = e.target.closest('.btn-delete-subject');
    if (btnDel) {
      capturarRespuestasMatricesDOM();
      const rows = subjectsContainer.getElementsByClassName('subject-row');
      const targetRow = btnDel.closest('.subject-row');
      if (!targetRow) return;

      const sid = targetRow.getAttribute('data-subject-id');
      if (etapaActual === 4) ocultarError();

      if (rows.length <= 1) {
        // Si solo queda 1 fila, limpiar su asignatura y sus respuestas en Matriz A y B al instante
        if (sid) estadoRespuestasMatrices[sid] = { A: {}, B: {} };
        const inp = targetRow.querySelector('.subject-input');
        if (inp) {
          inp.value = '';
          inp.classList.remove('is-invalid');
          inp.focus();
        }
        sincronizarMatricesEnVivo();
        return;
      }

      if (sid) delete estadoRespuestasMatrices[sid];
      targetRow.remove();
      renumerarFilasAsignatura();
    }
  });

  if (btnAddSubject) {
    btnAddSubject.addEventListener('click', function() {
      crearFilaAsignatura('');
    });
  }

  // Guardar selección al instante, actualizar estilo activo y limpiar errores en desplegables de Matriz A y B
  matricesContainer.addEventListener('change', function(e) {
    if (e.target.classList.contains('matrix-select') || e.target.type === 'radio') {
      const sid = e.target.getAttribute('data-subject-id');
      const mat = e.target.getAttribute('data-matriz');
      const itemIdx = e.target.getAttribute('data-item');
      if (sid && estadoRespuestasMatrices[sid] && (mat === 'A' || mat === 'B') && itemIdx !== null) {
        estadoRespuestasMatrices[sid][mat][itemIdx] = e.target.value || '';
      }

      if (e.target.value) {
        e.target.classList.add('is-selected');
      } else {
        e.target.classList.remove('is-selected');
      }
      const cell = e.target.closest('td');
      if (cell) cell.classList.remove('has-error');
      const tr = e.target.closest('tr');
      if (tr) {
        const emptySelects = Array.from(tr.querySelectorAll('select.matrix-select')).filter(s => !s.value);
        if (emptySelects.length === 0) tr.classList.remove('has-error');
      }
      if (matricesContainer.querySelectorAll('.has-error').length === 0 && etapaActual === 4) {
        ocultarError();
      }
      calcularProgreso();
    }
  });

  // Inicializar 3 campos de asignatura por defecto y sincronizar estado inicial de matrices
  for (let i = 0; i < 3; i++) {
    crearFilaAsignatura('', true);
  }
  renumerarFilasAsignatura();

  // ==========================================================================
  // 4. RENDERIZADO DE TABLAS ESTÁTICAS (Q3 y Q6) CON FORMATO SECCIÓN 2
  // ==========================================================================
  function renderTablaLikert(tbodyId, itemsArray, namePrefix, escalaTipo) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';

    const escala = ESCALAS[escalaTipo];

    itemsArray.forEach(function(itemText, idx) {
      const tr = document.createElement('tr');
      tr.id = 'row-' + namePrefix + '-' + idx;

      let html = '<td class="desc-cell"><span class="point-number">' + (idx + 1) + '.</span> ' + escapeHtml(itemText) + '</td>';
      for (let v = 1; v <= 7; v++) {
        const itemEscala = escala[v - 1];
        html += '<td>' +
          '<label class="cell-radio-label" title="' + escapeHtml(itemEscala.label) + '">' +
            '<input type="radio" name="' + namePrefix + '-' + idx + '" value="' + v + '">' +
          '</label>' +
        '</td>';
      }
      tr.innerHTML = html;
      tbody.appendChild(tr);
    });
  }

  renderTablaLikert('tbody-q3', ITEMS_Q3, 'rad-q3', 'acuerdo');
  renderTablaLikert('tbody-q6', ITEMS_Q6, 'rad-q6', 'acuerdo');

  // ==========================================================================
  // 6. CAMPOS CONDICIONALES EN SECCIÓN 1 / ETAPA 2 (PREGUNTAS SÍ / NO)
  // ==========================================================================
  function vincularCondicional(radName, boxId, inputId, noticeId) {
    const radios = document.getElementsByName(radName);
    const box = document.getElementById(boxId);
    const input = document.getElementById(inputId);
    const notice = noticeId ? document.getElementById(noticeId) : null;

    radios.forEach(function(radio) {
      radio.addEventListener('change', function() {
        if (this.value === 'Sí') {
          if (notice) notice.style.display = 'none';
          box.style.display = 'block';
          input.classList.remove('is-invalid');
          input.focus();
        } else {
          box.style.display = 'none';
          input.value = '';
          input.classList.remove('is-invalid');
          if (notice) notice.style.display = 'inline-flex';
        }
        calcularProgreso();
      });
    });
  }

  vincularCondicional('rad-colab-int', 'panel-colab-int', 'txt-colab-int-cual', 'notice-colab-int');
  vincularCondicional('rad-colab-ext', 'panel-colab-ext', 'txt-colab-ext-cual', 'notice-colab-ext');
  vincularCondicional('rad-pub', 'panel-pub', 'txt-pub-cual', 'notice-pub');

  chkConsent.addEventListener('change', function() {
    calcularProgreso();
  });

  // ==========================================================================
  // 7. ENVÍO DEL FORMULARIO Y VALIDACIÓN FINAL (ETAPA 5)
  // ==========================================================================
  form.addEventListener('submit', function(e) {
    e.preventDefault();

    // Validar todas las etapas (1 a 5) para garantizar integridad completa antes de enviar
    for (let s = 1; s <= TOTAL_ETAPAS; s++) {
      if (!validarEtapa(s)) {
        if (s !== etapaActual) {
          cambiarEtapa(s, false);
          validarEtapa(s);
        }
        return;
      }
    }

    // Recopilar respuestas completas
    const txtEdad = document.getElementById('txt-edad');
    const edad = parseInt(txtEdad.value, 10);
    const cmbGenero = document.getElementById('cmb-genero');
    const expProf = parseInt(document.getElementById('txt-exp-prof').value, 10);
    const expDoc = parseInt(document.getElementById('txt-exp-doc').value, 10);
    const txtGrado = document.getElementById('txt-grado');
    const radInt = document.querySelector('input[name="rad-colab-int"]:checked');
    const txtColabIntCual = document.getElementById('txt-colab-int-cual');
    const radExt = document.querySelector('input[name="rad-colab-ext"]:checked');
    const txtColabExtCual = document.getElementById('txt-colab-ext-cual');
    const radPub = document.querySelector('input[name="rad-pub"]:checked');
    const txtPubCual = document.getElementById('txt-pub-cual');

    const q3 = [];
    for (let i = 0; i < ITEMS_Q3.length; i++) {
      const r = document.querySelector('input[name="rad-q3-' + i + '"]:checked');
      q3.push(parseInt(r.value, 10));
    }

    // [MODIFICADO] Recolección al enviar: respuestas de matrices usando convención A_ITEM${i}_${j} y B_ITEM${i}_${j}, agrupadas por asignatura
    const matricesPayload = [];
    for (let j = 0; j < asignaturasActivas.length; j++) {
      const asigNombre = asignaturasActivas[j];
      const matA = [];
      const matB = [];

      for (let i = 0; i < ITEMS_MATRIZ_A.length; i++) {
        const elA = document.querySelector('select[name="A_ITEM' + i + '_' + j + '"]') ||
                    document.querySelector('input[name="A_ITEM' + i + '_' + j + '"]:checked');
        matA.push({
          num: i + 1,
          texto: ITEMS_MATRIZ_A[i],
          valor: (elA && elA.value) ? parseInt(elA.value, 10) : null
        });
      }

      for (let i = 0; i < ITEMS_MATRIZ_B.length; i++) {
        const elB = document.querySelector('select[name="B_ITEM' + i + '_' + j + '"]') ||
                    document.querySelector('input[name="B_ITEM' + i + '_' + j + '"]:checked');
        matB.push({
          num: i + 1,
          texto: ITEMS_MATRIZ_B[i],
          valor: (elB && elB.value) ? parseInt(elB.value, 10) : null
        });
      }

      matricesPayload.push({
        asignatura: asigNombre,
        matrizA: matA,
        matrizB: matB
      });
    }

    const q6 = [];
    for (let i = 0; i < ITEMS_Q6.length; i++) {
      const r = document.querySelector('input[name="rad-q6-' + i + '"]:checked');
      q6.push(parseInt(r.value, 10));
    }

    const payload = {
      consent: true,
      edad: edad,
      genero: cmbGenero.value,
      expProfesional: expProf,
      expDocente: expDoc,
      gradoAcademico: txtGrado.value.trim(),
      colabInterna: radInt.value,
      colabInternaCual: radInt.value === 'Sí' ? txtColabIntCual.value.trim() : '',
      colabExterna: radExt.value,
      colabExternaCual: radExt.value === 'Sí' ? txtColabExtCual.value.trim() : '',
      publicaciones: radPub.value,
      publicacionesCual: radPub.value === 'Sí' ? txtPubCual.value.trim() : '',
      q3: q3,
      asignaturas: asignaturasActivas,
      matrices: matricesPayload,
      q6: q6
    };

    btnSubmit.disabled = true;
    const txtOriginal = btnSubmit.textContent;
    btnSubmit.textContent = 'Enviando y validando registro...';

    // Envío: detecta si está en Google Apps Script o en entorno local Node.js
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(procesarRespuestaServidor)
        .withFailureHandler(function(err) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = txtOriginal;
          mostrarError('Error de servidor: ' + (err.message || err));
        })
        .processForm(payload);
    } else {
      // Simulación local mediante Fetch a API local (con fallback estático para GitHub Pages)
      fetch('api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(procesarRespuestaServidor)
      .catch(function() {
        // Fallback simulación pura en cliente si no hay servidor backend levantado (ej. GitHub Pages)
        setTimeout(function() {
          procesarRespuestaServidor({ ok: true, id: generateUuid() });
        }, 700);
      });
    }

    function procesarRespuestaServidor(res) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = txtOriginal;

      if (res && res.ok) {
        try { localStorage.removeItem('encuesta_fcae_v1'); } catch (e) {}
        form.style.display = 'none';
        if (stepperNav) stepperNav.style.display = 'none';
        successCard.style.display = 'block';
        receiptIdEl.textContent = res.id;
        if (receiptTimestampEl) {
          const ahora = new Date();
          receiptTimestampEl.textContent = 'Fecha de recepción: ' + ahora.toLocaleDateString('es-NI', { dateStyle: 'long' }) + ' a las ' + ahora.toLocaleTimeString('es-NI', { timeStyle: 'short' });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const etapa = res ? res.stage : 'desconocida';
        const msg = res ? res.error : 'Ocurrió un error inesperado al procesar el formulario.';
        mostrarError('Error [' + etapa + ']: ' + msg);
      }
    }
  });

  function mostrarError(msg, target) {
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      errorBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function ocultarError() {
    if (errorBanner) errorBanner.style.display = 'none';
  }

  // ==========================================================================
  // 8. BORRADOR EN LOCALSTORAGE
  // ==========================================================================
  function guardarBorradorLocal() {
    try {
      const draft = {
        edad: document.getElementById('txt-edad').value,
        genero: document.getElementById('cmb-genero').value,
        expProf: document.getElementById('txt-exp-prof').value,
        expDoc: document.getElementById('txt-exp-doc').value,
        grado: document.getElementById('txt-grado').value
      };
      localStorage.setItem('encuesta_fcae_v1', JSON.stringify(draft));
    } catch (e) {}
  }

  function cargarBorradorLocal() {
    try {
      const raw = localStorage.getItem('encuesta_fcae_v1');
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.edad) document.getElementById('txt-edad').value = draft.edad;
        if (draft.genero) document.getElementById('cmb-genero').value = draft.genero;
        if (draft.expProf) document.getElementById('txt-exp-prof').value = draft.expProf;
        if (draft.expDoc) document.getElementById('txt-exp-doc').value = draft.expDoc;
        if (draft.grado) document.getElementById('txt-grado').value = draft.grado;
      }
    } catch (e) {}
  }
  cargarBorradorLocal();

  form.addEventListener('input', calcularProgreso);
  form.addEventListener('change', calcularProgreso);
  calcularProgreso();
});
