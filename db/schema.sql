-- ==============================================================================
-- ESQUEMA DE BASE DE DATOS CLOUDFLARE D1 (SQLite)
-- Encuesta de Investigación Formativa FCAE-UAM
-- ==============================================================================

CREATE TABLE IF NOT EXISTS docentes (
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
);

CREATE INDEX IF NOT EXISTS idx_docentes_timestamp ON docentes(timestamp);

CREATE TABLE IF NOT EXISTS respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idDocente TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  asignatura TEXT NOT NULL,
  matriz TEXT NOT NULL,
  itemNum INTEGER NOT NULL,
  itemTexto TEXT,
  valor INTEGER NOT NULL,
  FOREIGN KEY (idDocente) REFERENCES docentes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_respuestas_docente ON respuestas(idDocente);
CREATE INDEX IF NOT EXISTS idx_respuestas_timestamp ON respuestas(timestamp);

CREATE TABLE IF NOT EXISTS talleres (
  id TEXT PRIMARY KEY,
  surveyId TEXT,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_talleres_timestamp ON talleres(timestamp);
