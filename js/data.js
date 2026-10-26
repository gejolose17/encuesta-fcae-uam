/**
 * TESIS DOCTORAL - FCAE / UAM
 * Instrumento de Investigación: Bancos de Ítems y Escalas
 */

const ITEMS_Q3 = [
  "Identifico problemas de investigación y propongo planes de investigación en mi área de conocimiento.",
  "Considero que tengo dominio claro de los enfoques y diseños de investigación en correspondencia con mi área de conocimiento.",
  "Tengo habilidades para diseñar, validar y aplicar instrumentos de recolección de datos (encuestas, entrevistas, grupos focales, etc.).",
  "Utilizo softwares y técnicas para el análisis e interpretación de datos de investigación (cuantitativo y cualitativo).",
  "Me mantengo actualizado con los avances de la teoría y literatura científica en mi área de conocimiento.",
  "Tengo habilidades para la búsqueda de información, revisión y discriminación de literatura en diferentes medios (bases de datos, repositorios, revistas, bibliotecas, libros, etc.).",
  "Utilizo algún software de gestión de referencias (Mendeley, Zotero, etc.)."
];

const ITEMS_MATRIZ_A = [
  "En mi clase procuro inspirar o motivar a mis estudiantes hacia la investigación a través de las estrategias que utilizo y mi práctica de investigación.",
  "Genero espacios en la asignatura para la reflexión y el debate.",
  "Aplico estrategias activas (ABP, ABPro, Estudio de Casos, Aula Invertida, entre otros) en las clases que imparto.",
  "Fomento la lectura crítica de textos científicos (artículos, tesis, libros, etc.) en temas vinculados con las asignaturas.",
  "Desarrollo actividades que requieren habilidades para identificar problemas o situaciones que requieran investigación.",
  "Oriento a mis estudiantes sobre cómo buscar información en diversas fuentes para la fundamentación de los trabajos.",
  "Fomento el uso de TIC para gestión de referencias bibliográficas (Mendeley, Zotero, etc.).",
  "Exijo el uso de normas APA o normas técnicas para la presentación de informes y tareas.",
  "Incluyo actividades para diseñar y aplicar instrumentos de recolección de datos en el contexto de la asignatura.",
  "Fomento el uso de softwares y técnicas para el análisis e interpretación de datos de investigación.",
  "Establezco asignaciones que requieren documentos académicos (informes, artículos, reportes) con rigor científico.",
  "Proporciono acompañamiento para guiar procesos investigativos al estudiantado."
];

const ITEMS_MATRIZ_B = [
  "Búsqueda y sistematización de información científica.",
  "Reseña académica.",
  "Ensayo teórico.",
  "Aula invertida.",
  "Aprendizaje Basado en Problemas.",
  "Estudio de casos.",
  "Aprendizaje Basado en Proyectos.",
  "Preseminario investigativo.",
  "Ensayo teórico con esquema investigativo.",
  "Semilleros o grupos de investigación.",
  "Prácticas de campo.",
  "Elaboración de informes.",
  "Elaboración de estado de arte.",
  "Trabajo de grado.",
  "Trabajo cooperativo entre alumnado y profesorado.",
  "Socialización y publicación de resultados de investigación."
];

const ITEMS_Q6 = [
  "Considero que la investigación como eje transversal debe estar presente en todas las asignaturas.",
  "La universidad cuenta con los recursos físicos necesarios (laboratorios, plataforma, biblioteca, etc.) para la implementación de la investigación formativa.",
  "La universidad cuenta con licencias de software necesarios para la implementación de la investigación formativa.",
  "La universidad fomenta en el profesorado el uso de estrategias de enseñanza-aprendizaje activas, vinculadas con la investigación formativa.",
  "La universidad ofrece programas de formación en competencias investigativas e implementación de la investigación formativa.",
  "La estructura curricular de las carreras permite el desarrollo de actividades de investigación formativa.",
  "El plan de estudio presenta el desarrollo de competencias investigativas de forma progresiva y en orden lógico.",
  "Los syllabus de las asignaturas que imparto plantean con claridad actividades para el desarrollo de competencias de investigación.",
  "Se promueve la coordinación efectiva entre el profesorado de las distintas asignaturas para implementar la investigación formativa.",
  "La carga horaria asignada permite realizar acompañamiento y retroalimentación oportuna."
];

const ESCALAS = {
  acuerdo: [
    { valor: 1, corto: "Tot. Desacuerdo", label: "Totalmente en desacuerdo" },
    { valor: 2, corto: "En desacuerdo", label: "En desacuerdo" },
    { valor: 3, corto: "Lig. Desacuerdo", label: "Ligeramente en desacuerdo" },
    { valor: 4, corto: "Neutral", label: "Ni de acuerdo ni en desacuerdo" },
    { valor: 5, corto: "Lig. Acuerdo", label: "Ligeramente de acuerdo" },
    { valor: 6, corto: "De acuerdo", label: "De acuerdo" },
    { valor: 7, corto: "Tot. Acuerdo", label: "Totalmente de acuerdo" }
  ],
  frecuencia: [
    { valor: 1, corto: "Nunca", label: "Nunca" },
    { valor: 2, corto: "Casi nunca", label: "Casi nunca" },
    { valor: 3, corto: "Ocasional", label: "Ocasionalmente" },
    { valor: 4, corto: "A veces", label: "A veces" },
    { valor: 5, corto: "Frecuente", label: "Frecuentemente" },
    { valor: 6, corto: "Casi siempre", label: "Casi siempre" },
    { valor: 7, corto: "Siempre", label: "Siempre" }
  ],
  dominio: [
    { valor: 1, corto: "Nulo", label: "Nulo" },
    { valor: 2, corto: "Muy bajo", label: "Muy bajo" },
    { valor: 3, corto: "Bajo", label: "Bajo" },
    { valor: 4, corto: "Medio", label: "Medio" },
    { valor: 5, corto: "Mod. alto", label: "Moderadamente alto" },
    { valor: 6, corto: "Alto", label: "Alto" },
    { valor: 7, corto: "Experto", label: "Experto" }
  ]
};
