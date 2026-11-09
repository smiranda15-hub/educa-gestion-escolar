import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const W = 1280, H = 720;
const C = {
  navy: "#17324D", navy2: "#234B6B", blue: "#2D668F", teal: "#35A79B",
  ink: "#1F3145", muted: "#64768A", pale: "#F3F7FA", white: "#FFFFFF",
  line: "#D8E3EC", mint: "#E7F5F1", lavender: "#EEF0FF", gold: "#F4B95F"
};
const ppt = Presentation.create({ slideSize: { width: W, height: H } });
ppt.theme.defaultFont = "Arial";
const schoolPhoto = new Uint8Array(await fs.readFile("C:\\Users\\miran\\.codex\\generated_images\\01a1890a-612b-7521-acae-3334b0222723\\exec-b9cb498e-a48f-4cb4-a699-e95d115914fc.png"));
const familyPhoto = new Uint8Array(await fs.readFile("C:\\Users\\miran\\.codex\\generated_images\\01a1890a-612b-7521-acae-3334b0222723\\exec-f6153b71-8e41-4167-bc07-7988faae9f85.png"));

function rect(slide, x, y, width, height, fill, stroke = "none") {
  return slide.shapes.add({
    geometry: "roundRect", position: { left: x, top: y, width, height }, fill,
    line: { style: "solid", fill: stroke, width: stroke === "none" ? 0 : 1 },
    borderRadius: "rounded-xl"
  });
}
function text(slide, x, y, width, height, value, fontSize = 24, color = C.ink, bold = false, alignment = "left") {
  const shape = slide.shapes.add({
    geometry: "textbox", position: { left: x, top: y, width, height }, fill: "none",
    line: { style: "solid", fill: "none", width: 0 }
  });
  shape.text = value;
  shape.text.style = { fontSize, color, bold, alignment, verticalAlignment: "middle", wrap: true };
  shape.text.typeface = "Arial";
  return shape;
}
function slide(bg = C.pale) {
  const s = ppt.slides.add(); s.background.fill = bg; return s;
}
function heading(s, kicker, title, subtitle) {
  text(s, 72, 42, 1136, 26, kicker.toUpperCase(), 13, C.teal, true);
  text(s, 72, 76, 1136, 54, title, 34, C.navy, true);
  if (subtitle) text(s, 72, 132, 1136, 42, subtitle, 18, C.muted);
}
function footer(s, n) {
  text(s, 72, 681, 850, 20, "EDUCA  ·  Gestión escolar", 12, C.muted);
  text(s, 1120, 681, 88, 20, String(n).padStart(2, "0"), 12, C.muted, true, "right");
}
function card(s, x, y, w, h, title, body, accent = C.blue) {
  rect(s, x, y, w, h, C.white, C.line); rect(s, x, y, 6, h, accent);
  text(s, x + 24, y + 18, w - 48, 32, title, 20, C.navy, true);
  text(s, x + 24, y + 58, w - 48, h - 72, body, 16, C.muted);
}
function bullet(s, x, y, w, label, detail, accent = C.teal) {
  rect(s, x, y + 7, 10, 10, accent);
  text(s, x + 24, y, w - 24, 25, label, 18, C.ink, true);
  if (detail) text(s, x + 24, y + 29, w - 24, 42, detail, 14, C.muted);
}
function notes(s, value) { s.speakerNotes.text = value; }

// 1 — Portada
{
  const s = slide(C.navy);
  s.images.add({ blob: schoolPhoto, contentType: "image/png", alt: "Estudiantes colaboran en clase con guía docente", fit: "cover", position: { left: 735, top: 0, width: 545, height: 720 } });
  rect(s, 700, 0, 80, 720, C.navy);
  rect(s, 74, 70, 58, 58, C.teal); text(s, 74, 70, 58, 58, "E", 30, C.white, true, "center");
  text(s, 148, 72, 300, 54, "EDUCA", 30, C.white, true);
  text(s, 76, 194, 900, 35, "GESTIÓN ESCOLAR · PRESENTACIÓN DEL PROYECTO", 15, "#8DD8CD", true);
  text(s, 76, 248, 610, 150, "Todo el colegio,\nen un mismo lugar", 48, C.white, true);
  text(s, 78, 414, 600, 82, "La gestión académica y administrativa conectada con docentes, estudiantes y familias.", 21, "#D9E6F0");
  rect(s, 78, 535, 590, 1, "#446078");
  text(s, 78, 565, 580, 36, "EDUCA · Gestión escolar", 18, C.white, true);
  text(s, 78, 612, 600, 30, "Una presentación para la comunidad educativa", 15, "#B8CAD8");
  notes(s, "Presentar EDUCA como una plataforma escolar en desarrollo que centraliza procesos académicos e institucionales. Evitar describir funciones configurables como si todas estuvieran listas en producción.");
}
// 2 — Necesidad y respuesta
{
  const s = slide(); heading(s, "01 · La necesidad", "La vida escolar conecta muchos procesos", "EDUCA reúne el seguimiento cotidiano en una experiencia compartida.");
  const stages = [["01", "Matrícula", "Ingreso y asignación al grado"], ["02", "Curso", "Grupos, docentes y asignaturas"], ["03", "Seguimiento", "Asistencia, actividades y notas"], ["04", "Comunicación", "Avisos y eventos para la comunidad"], ["05", "Documentos", "Boletines y constancias"]];
  stages.forEach((v, i) => {
    const x = 72 + i * 227; rect(s, x, 252, 211, 218, C.white, C.line);
    rect(s, x + 18, 272, 42, 42, i === 4 ? C.lavender : C.mint);
    text(s, x + 18, 272, 42, 42, v[0], 15, i === 4 ? C.blue : C.teal, true, "center");
    text(s, x + 18, 333, 175, 34, v[1], 20, C.navy, true); text(s, x + 18, 374, 175, 65, v[2], 15, C.muted);
    if (i < 4) text(s, x + 211, 326, 16, 42, "›", 27, C.teal, true, "center");
  });
  rect(s, 72, 512, 1136, 94, C.navy); text(s, 100, 528, 1080, 28, "PROPUESTA DE VALOR", 13, "#9FE0D6", true);
  text(s, 100, 561, 1080, 30, "Un registro coherente para que cada equipo actúe con mejor contexto.", 22, C.white, true); footer(s, 2);
  notes(s, "La plataforma busca reducir la dispersión de información entre procesos. No prometer automatización integral de tareas aún no integradas.");
}
// 3 — Módulos
{
  const s = slide(); heading(s, "02 · Alcance", "Un panel para la operación del colegio", "La plataforma organiza funciones en tres áreas conectadas.");
  card(s, 72, 220, 350, 344, "Gestión institucional", "• Estudiantes y acudientes\n• Matrículas y cursos\n• Asistencia y justificaciones\n• Pagos y reportes", C.teal);
  card(s, 465, 220, 350, 344, "Gestión académica", "• Asignaturas y docentes\n• Actividades y evaluaciones\n• Calificaciones por periodo\n• Boletines y trayectoria", C.blue);
  card(s, 858, 220, 350, 344, "Comunidad y documentos", "• Comunicaciones y calendario\n• Eventos institucionales\n• Constancias con aprobación\n• Carné y control documental", C.gold);
  text(s, 72, 597, 1136, 35, "La disponibilidad de cada módulo depende del rol y de la configuración de la institución.", 16, C.muted); footer(s, 3);
  notes(s, "Confirmar que las funciones aparezcan habilitadas en la versión desplegada de la institución. Algunos módulos requieren configuración previa.");
}
// 4 — Trayectoria
{
  const s = slide(); heading(s, "03 · Trayectoria", "La información sigue al estudiante por año lectivo", "La matrícula da contexto al curso, las notas y los documentos de cada periodo.");
  const steps = [["Estudiante", "Identificación y contactos"], ["Matrícula", "Año lectivo y estado"], ["Grado / curso", "Grupo y docentes"], ["Seguimiento", "Asistencia y resultados"], ["Boletín", "Resumen del periodo"]];
  steps.forEach((v, i) => { const x = 72 + i * 230; rect(s, x, 282, 194, 148, C.white, C.line); text(s, x + 16, 304, 162, 30, v[0], 19, C.navy, true); text(s, x + 16, 342, 162, 62, v[1], 15, C.muted); if (i < 4) text(s, x + 194, 328, 36, 45, "→", 22, C.teal, true, "center"); });
  rect(s, 72, 486, 1136, 100, C.mint); text(s, 96, 504, 1088, 28, "HISTORIAL ACADÉMICO", 13, C.teal, true);
  text(s, 96, 539, 1088, 30, "Los registros asociados al año lectivo ayudan a conservar el recorrido del estudiante.", 19, C.navy, true); footer(s, 4);
  notes(s, "El diseño contempla separar y consultar información por año lectivo; validar la historia cargada antes de emitir documentos.");
}
// 5 — Perfiles y permisos
{
  const s = slide(); heading(s, "04 · Acceso", "Cada persona consulta lo que necesita", "Los permisos se aplican desde el backend y se limitan a la institución.");
  card(s, 72, 226, 538, 316, "Equipo institucional", "Administración y rectoría gestionan procesos del colegio.\n\nDocentes acceden a cursos asignados y registran seguimiento académico.", C.blue);
  rect(s, 670, 226, 538, 316, C.white, C.line);
  text(s, 694, 244, 490, 32, "Estudiantes y familias", 20, C.navy, true);
  s.images.add({ blob: familyPhoto, contentType: "image/png", alt: "Acudiente y estudiante revisan información escolar en un teléfono", fit: "cover", position: { left: 694, top: 290, width: 490, height: 160 }, geometry: "roundRect", borderRadius: "rounded-lg" });
  text(s, 694, 464, 490, 58, "El acceso se limita a los estudiantes asociados a cada cuenta familiar.", 16, C.muted);
  rect(s, 72, 576, 1136, 54, C.navy); text(s, 94, 584, 1090, 32, "Identidad · rol · institución · auditoría de acciones", 17, C.white, true, "center"); footer(s, 5);
  notes(s, "Describir modelo de acceso por rol. No sugerir que todos los perfiles tienen permisos administrativos; las excepciones se controlan por configuración.");
}
// 6 — Aula
{
  const s = slide(); heading(s, "05 · Aula", "La enseñanza y el seguimiento en un mismo flujo", "Docentes publican actividades; estudiantes responden y entregan desde su acceso.");
  const flow = [["1", "Publicar", "Actividad o evaluación"], ["2", "Resolver", "Cuestionario en línea"], ["3", "Entregar", "Archivo de trabajo"], ["4", "Revisar", "Calificar y retroalimentar"]];
  flow.forEach((v, i) => { const x = 72 + i * 286; rect(s, x, 244, 260, 160, C.white, C.line); rect(s, x + 20, 264, 42, 42, i === 3 ? C.lavender : C.mint); text(s, x + 20, 264, 42, 42, v[0], 18, i === 3 ? C.blue : C.teal, true, "center"); text(s, x + 20, 321, 220, 28, v[1], 20, C.navy, true); text(s, x + 20, 356, 220, 32, v[2], 15, C.muted); if (i < 3) text(s, x + 260, 301, 26, 36, "→", 20, C.teal, true, "center"); });
  rect(s, 72, 446, 1136, 134, C.white, C.line); text(s, 96, 463, 1085, 28, "EVALUACIONES EN LÍNEA", 16, C.navy, true);
  text(s, 96, 499, 1085, 60, "La plataforma puede guardar intentos y calcular resultados de evaluaciones nativas. Google Forms puede enlazarse; la sincronización automática de sus respuestas queda como integración futura.", 17, C.muted); footer(s, 6);
  notes(s, "Sea explícito: evaluación nativa y enlace externo son distintos. Enlace a Google Forms no significa que respuestas se importen automáticamente.");
}
// 7 — Documentos
{
  const s = slide(); heading(s, "06 · Documentos", "Documentos institucionales con trazabilidad", "Aprobación, firmas configuradas y folios ayudan a organizar el archivo.");
  [["Solicitud", "El acudiente o perfil autorizado inicia el trámite."], ["Revisión", "Rectoría valida la información y aprueba."], ["Emisión", "Se genera documento con folio y responsables."]].forEach((v, i) => bullet(s, 90, 220 + i * 104, 550, v[0], v[1], [C.teal, C.blue, C.gold][i]));
  rect(s, 700, 220, 508, 324, C.white, C.line); text(s, 730, 244, 448, 32, "CONTROL DEL DOCUMENTO", 17, C.navy, true);
  text(s, 730, 293, 448, 36, "EDU · CERT · AÑO · FOLIO", 19, C.blue, true); text(s, 730, 340, 448, 74, "Consulta del registro y estado del documento desde el control documental.", 16, C.muted);
  rect(s, 730, 438, 190, 54, C.mint); text(s, 746, 447, 160, 35, "QR de verificación", 15, C.teal, true, "center");
  text(s, 730, 508, 448, 30, "La imagen de firma no es firma electrónica certificada.", 13, C.muted); footer(s, 7);
  notes(s, "Firma gráfica insertada y firma electrónica con validez jurídica son conceptos distintos. La validación QR comprueba el registro disponible en EDUCA.");
}
// 8 — Arquitectura
{
  const s = slide(); heading(s, "07 · Tecnología", "Una arquitectura web con backend institucional", "El diseño separa interfaz, API y almacenamiento.");
  [["Interfaz", "Web adaptable\nAplicación Android con Capacitor"], ["Servicios", "API Node.js\nAutenticación y permisos"], ["Datos", "PostgreSQL en Railway\nSQLite para desarrollo local"]].forEach((v, i) => { const x = 72 + i * 392; rect(s, x, 236, 350, 172, C.white, C.line); text(s, x + 22, 260, 306, 32, v[0], 20, C.navy, true); text(s, x + 22, 305, 306, 70, v[1], 17, C.muted); if (i < 2) text(s, x + 350, 298, 42, 44, "→", 23, C.teal, true, "center"); });
  rect(s, 72, 454, 1136, 116, C.navy); text(s, 98, 473, 1080, 28, "CONTROLES CLAVE", 14, "#9FE0D6", true);
  text(s, 98, 509, 1080, 42, "Permisos en servidor · bitácora · recuperación revisada · secretos solo en backend", 18, C.white, true); footer(s, 8);
  notes(s, "El APK actual sirve como contenedor para acceso móvil y requiere conectividad si carga la plataforma publicada. Las notificaciones push y correo dependen de credenciales y configuración externas.");
}
// 9 — Rendimiento
{
  const s = slide(); heading(s, "08 · Prueba técnica", "Prueba de carga: hasta 1.000 usuarios virtuales", "Resultado reportado en staging con k6, en un recorrido de consultas de lectura.");
  [["1.000", "máximo de VUs"], ["157.316", "solicitudes HTTP"], ["0 %", "solicitudes fallidas"], ["819 ms", "p95 reportado"]].forEach((v, i) => { const x = 72 + i * 286; rect(s, x, 228, 260, 142, C.white, C.line); text(s, x + 18, 248, 224, 48, v[0], 32, i === 2 ? C.teal : C.navy, true); text(s, x + 18, 305, 224, 34, v[1], 15, C.muted); });
  rect(s, 72, 405, 1136, 146, C.mint); text(s, 98, 427, 1080, 30, "CÓMO LEER EL RESULTADO", 15, C.teal, true);
  text(s, 98, 466, 1080, 66, "La prueba alcanzó 1.000 VUs en staging y no registró fallos en los endpoints consultados. Esto no certifica 1.000 personas reales en producción ni cubre escrituras, archivos, PDF, correo o notificaciones.", 18, C.navy); footer(s, 9);
  notes(s, "Datos de salida k6 compartida por el usuario: 157,316 HTTP requests; 0 failed; p95 819.68ms; máximo 1000 VUs durante prueba escalonada en staging. Escenario limitado a login, dashboard, students y courses. No convertirlo en capacidad de producción.");
}
// 10 — Próximos pasos
{
  const s = slide(); heading(s, "09 · Siguiente etapa", "Validar el piloto antes de ampliar el despliegue", "Priorizar flujos reales, calidad de datos y observabilidad.");
  [["01", "Validación funcional", "Probar matrícula, notas, pagos y documentos con usuarios del colegio."], ["02", "Preparación operativa", "Completar credenciales de correo, notificaciones, copias y monitoreo."], ["03", "Prueba ampliada", "Medir consultas y operaciones de escritura por separado en un entorno controlado."], ["04", "Distribución móvil", "Preparar APK firmado y completar revisión de publicación en las tiendas."]].forEach((v, i) => { const y = 206 + i * 98; rect(s, 72, y, 1136, 76, C.white, C.line); rect(s, 90, y + 17, 42, 42, i === 3 ? C.lavender : C.mint); text(s, 90, y + 17, 42, 42, v[0], 15, i === 3 ? C.blue : C.teal, true, "center"); text(s, 154, y + 11, 265, 28, v[1], 18, C.navy, true); text(s, 420, y + 11, 772, 50, v[2], 15, C.muted); }); footer(s, 10);
  notes(s, "Una prueba exitosa no reemplaza ensayos funcionales, copias de seguridad, seguridad, revisión legal ni un lanzamiento gradual.");
}
// 11 — Cierre
{
  const s = slide(C.navy); s.images.add({ blob: familyPhoto, contentType: "image/png", alt: "Familia acompañando el proceso escolar", fit: "cover", position: { left: 760, top: 0, width: 520, height: 720 } }); rect(s, 720, 0, 80, 720, C.navy); rect(s, 72, 72, 58, 58, C.teal); text(s, 72, 72, 58, 58, "E", 30, C.white, true, "center"); text(s, 150, 72, 320, 58, "EDUCA", 30, C.white, true);
  text(s, 76, 206, 620, 110, "Acompañar cada etapa\nde la vida escolar.", 40, C.white, true);
  text(s, 78, 410, 600, 92, "Gestión académica e institucional en una experiencia conectada para el colegio y su comunidad.", 21, "#D9E6F0");
  rect(s, 78, 530, 590, 1, "#446078"); text(s, 78, 564, 580, 34, "EDUCA  ·  Gestión escolar", 18, "#9FE0D6", true); text(s, 78, 610, 580, 30, "Gracias", 16, C.white);
  notes(s, "Cerrar invitando a conversar sobre un piloto institucional y las prioridades de cada colegio.");
}

await fs.mkdir("staging", { recursive: true });
await fs.mkdir("..\\entregables", { recursive: true });
for (let i = 0; i < ppt.slides.items.length; i++) {
  const preview = await ppt.export({ slide: ppt.slides.items[i], format: "png", scale: 1 });
  await fs.writeFile(`staging/slide-${String(i + 1).padStart(2, "0")}.png`, new Uint8Array(await preview.arrayBuffer()));
}
const deck = await PresentationFile.exportPptx(ppt);
await deck.save("staging/candidate.pptx");
console.log(JSON.stringify({ slides: ppt.slides.items.length, output: ".codex-build/staging/candidate.pptx" }));
