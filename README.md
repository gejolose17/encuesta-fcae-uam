# Encuesta de Investigación Formativa — FCAE · UAM

Instrumento digital interactivo y tablero analítico desarrollados para la tesis doctoral:

> *"Modelo de gestión participativo de investigación formativa y desarrollo de competencias investigativas en las carreras de la FCAE-UAM"* — **Marco Vinicio Sandino Castillo** (Doctorado en Educación, Universidad Americana).

## Vistas principales

- **Encuesta Docente (`index.html`)**: Asistente por etapas (5 etapas) con registro dinámico de asignaturas (1 a 5) y sincronización reactiva en tiempo real de las **Matrices A y B** (conservando respuestas al editar o eliminar asignaturas).
- **Tablero Analítico de Resultados (`dashboard.html`)**: Visualización interactiva con filtros globales, distribuciones Likert, diagramas de flujo Sankey, radar comparativo y exportación de datos.

## Ejecución local

```bash
node server.js
```

Luego abrir en el navegador:
- Encuesta: `http://localhost:3000/`
- Tablero de resultados: `http://localhost:3000/dashboard`
