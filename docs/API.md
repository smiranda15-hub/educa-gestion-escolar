# Referencia de la API de EDUCA

Esta referencia describe los grupos de rutas definidos en `server/index.js`. No es una API pública para terceros: los clientes web/móvil de EDUCA usan estas rutas. La autorización final depende del rol, la institución, el vínculo con el estudiante y las asignaciones del curso. Las rutas de modificación requieren sesión, validación de origen y autorización backend salvo los flujos públicos indicados.

Todas las rutas están bajo `/api`. JSON usa UTF-8. Las rutas de archivos pueden responder binarios. La ruta `/api/health` es una comprobación técnica simple y no sustituye un chequeo de todas las integraciones.

## Convenciones

- La sesión se envía como cookie same-origin; los clientes no deben guardar secretos de servidor.
- Los identificadores de registros son UUID. No incluyas contraseñas, tokens de reset ni datos privados en query strings.
- Las acciones protegidas verifican el alcance institucional en el servidor; no simules permisos ocultando botones en el navegador.
- Respuestas de error incluyen un mensaje breve. Códigos usuales: `400` entrada inválida, `401` sesión requerida, `403` sin autorización/origen, `404` recurso inexistente, `409` conflicto de estado o unicidad, `413` carga demasiado grande.
- Los cambios importantes deben usar la lógica transaccional y de auditoría existente.

## Inicio de sesión, institución y perfil

| Ruta | Finalidad |
| --- | --- |
| `GET /health` | Estado básico del proceso. |
| `GET /schools` | Lista pública de instituciones disponibles para el acceso. |
| `GET /institutions` | Lista de instituciones para la cuenta global autorizada. |
| `POST /institutions` | Crea una institución y su administración inicial; restringida a la cuenta global. |
| `PATCH /institutions/:id` | Edita datos institucionales globales; cuenta global. |
| `PATCH /institutions/:id/status` | Cambia estado de institución; cuenta global. |
| `GET /schools/:slug/logo` | Sirve logo institucional público. |
| `GET /auth/setup-status` | Indica si la configuración inicial sigue disponible. |
| `POST /auth/setup` | Crea primera institución y primer usuario usando `EDUCA_SETUP_KEY`. |
| `POST /auth/login` | Inicia sesión para institución/cuenta. |
| `GET /auth/me` | Devuelve identidad/rol de la sesión actual. |
| `POST /auth/logout` | Cierra la sesión. |
| `POST /auth/password` | Cambia contraseña de sesión activa. |
| `POST /auth/password-reset-requests` | Crea solicitud pública de recuperación. |
| `GET /password-reset-requests` | Bandeja protegida para roles revisores. |
| `PATCH /password-reset-requests/:id` | Aprueba/rechaza solicitud; aprobación envía enlace/código configurado. |
| `POST /auth/password-reset` | Completa restablecimiento con credencial temporal válida. |
| `GET /profile` | Consulta perfil propio. |
| `PATCH /profile` | Actualiza campos permitidos del perfil. |
| `GET /profile/photo` | Sirve la foto del usuario actual bajo sesión. |

## Legal, ajustes y auditoría

| Rutas | Uso |
| --- | --- |
| `GET /legal/provider` | Datos públicos de identificación del proveedor legal. |
| `GET /legal/terms-status`, `POST /legal/terms-acceptance` | Consulta y registra aceptación de términos. |
| `GET /school/settings`, `PATCH /school/settings` | Lee/actualiza configuración del colegio según permisos. |
| `GET /school/logo` | Lee logo del colegio autenticado. |
| `GET /audit-log`, `GET /audit-log/export` | Consulta/exporta bitácora para administración/rectoría. |
| `GET /admin/backup` | Descarga respaldo según permisos de administración. |

## Dashboard, notificaciones y comunicaciones

| Rutas | Uso |
| --- | --- |
| `GET /dashboard` | Métricas del colegio con alcance según el perfil. |
| `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read` | Lista y marca notificaciones internas como leídas. |
| `POST /push/register`, `POST /push/unregister` | Registra/desregistra token de dispositivo móvil. |
| `GET /communications/options`, `GET /communications`, `POST /communications` | Opciones, consulta y creación de comunicados. |
| `POST /communications/:id/read`, `DELETE /communications/:id` | Marca leído y elimina dentro de permisos. |

## Estudiantes, usuarios y matrículas

| Rutas | Uso |
| --- | --- |
| `GET /students`, `POST /students`, `PATCH /students/:id`, `DELETE /students/:id` | Lista/crea/edita/elimina expedientes según rol. |
| `GET /students/:id/academic-history` | Consulta historial de matrícula del estudiante. |
| `POST /students/import` | Importa archivo validado por personal autorizado. |
| `PATCH /students/:id/access` | Cambia estado de acceso al portal; independiente de matrícula. |
| `GET /users`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id`, `PATCH /users/:id/status` | Administración de cuentas del colegio. |
| `GET /enrollments`, `POST /enrollments`, `PATCH /enrollments/:id` | Solicitudes/procesos de matrícula y revisión. |
| `GET /enrollments/history`, `POST /enrollments/history/:id/transfer` | Historial/traslados de matrícula. |
| `GET /portal/students` | Lista limitada a estudiantes vinculados al usuario portal. |

## Cursos, personal y horarios

| Rutas | Uso |
| --- | --- |
| `GET /courses`, `POST /courses`, `PATCH /courses/:id`, `PATCH /courses/:id/status` | Gestión de cursos y grupos. |
| `GET /courses/:id/history`, `POST/PUT/DELETE /courses/:id/teachers` | Historial y alta, edición o retiro de asignaciones docentes/asignaturas. |
| `GET /teachers` | Cuentas docentes habilitadas para asignar. |
| `GET /teacher/courses`, `GET /teacher/courses/:id/students` | Cursos y estudiantes permitidos al docente. |
| `GET /institutional-staff`, `POST /institutional-staff`, `PUT /institutional-staff/:id` | Personal institucional y firmas. |
| `GET /institutional-staff/certifications`, `POST /institutional-staff/certifications` | Constancias de personal autorizadas. |
| `PUT /institutional-staff/signature-rules` | Reglas de firmas por clase de documento. |
| `PUT /institutional-staff/courses/:id/director` | Asigna director de grupo. |
| `GET /institutional-staff/:id/photo`, `PUT /institutional-staff/:id/signature` | Foto/firma bajo autorización. |
| `GET /schedule/options`, `GET /schedule`, `POST /schedule`, `DELETE /schedule/:id` | Opciones, consulta, creación y retiro de clases del horario. |
| `GET /academic-periods`, `POST /academic-periods`, `DELETE /academic-periods/:id` | Periodos por año lectivo. |

## Asistencia, eventos y observaciones

| Rutas | Uso |
| --- | --- |
| `GET /attendance`, `POST /attendance` | Consulta y registro de asistencia. |
| `GET /attendance/justifications`, `POST /attendance/justifications` | Consulta/envío de justificaciones; el envío se limita a acudiente. |
| `GET /attendance/justifications/:id/file`, `PATCH /attendance/justifications/:id` | Descarga soporte y revisión autorizada. |
| `GET /calendar/options`, `GET /calendar`, `POST /calendar`, `DELETE /calendar/:id` | Consulta y administración del calendario/eventos. |
| `GET /activities`, `GET /activities/:id/registrations`, `POST /activities/:id/register`, `DELETE /activities/:id/registrations/:registrationId` | Actividades e inscripciones/cancelación. |
| `GET /observations/options`, `GET /observations`, `POST /observations`, `DELETE /observations/:id` | Observador con restricciones de privacidad. |

## Evaluaciones, entregas, notas y boletines

| Rutas | Uso |
| --- | --- |
| `GET /grades/courses` | Cursos/asignaturas disponibles para calificación. |
| `GET /grades/assessments`, `POST /grades/assessments`, `PUT /grades/assessments/:id`, `DELETE /grades/assessments/:id` | Evaluaciones, actividades y trabajos. |
| `PATCH /grades/assessments/:id/publication`, `PATCH /grades/assessments/:id/weight` | Publicación y ponderación. |
| `GET /grades/assessments/:id/submissions`, `DELETE /grades/submissions/:id`, `GET /grades/submissions/:id/file` | Revisión, archivo y eliminación de entregas dentro de permisos. |
| `POST /grades/assessments/:id/scores` | Guarda notas de estudiantes asignados. |
| `GET /grades/rule`, `PUT /grades/rule` | Escalas/reglas institucionales por alcance académico. |
| `GET /grades/report-card/options`, `GET /grades/report-card` | Opciones e información del boletín. |
| `PUT /grades/publications` | Publica/retira periodos de boletín para roles autorizados. |
| `GET /portal/assignments`, `POST /portal/assignments/:id/submissions` | Trabajos publicados y entrega de archivo/respuesta. |
| `POST /portal/online-assessments/:id/start`, `POST .../draft`, `POST .../submit`, `POST .../events` | Inicia, guarda, envía evaluación en línea y registra eventos de integridad configurados. |
| `GET /grades/assessments/:id/integrity-events` | Consulta eventos de foco sujetos a permisos. |
| `GET /assessment-images/:id` | Sirve imagen de evaluación si la sesión y el alcance son válidos. |

## Certificados, carnés y archivo

| Rutas | Uso |
| --- | --- |
| `GET /certificates/options`, `GET /certificates`, `POST /certificates` | Opciones y solicitudes/emisión de documentos para el perfil autorizado. |
| `GET /certificates/students/:id/history` | Trayectoria disponible para constancias. |
| `GET /certificate-requests`, `PATCH /certificate-requests/:id`, `DELETE /certificate-requests/:id` | Revisión, actualización/cancelación de solicitudes por permisos. |
| `GET /certificates/:id`, `DELETE /certificates/:id` | Consulta y retiro de documento emitido según estado/permiso. |
| `GET /document-control` (incluye `?export=csv`), `DELETE /document-control/:id` | Consulta/exportación de folios y borrado permitido de anulados. |
| `GET /portal/digital-card`, `GET /portal/digital-card/:id/photo` | Carné propio/relacionado y foto protegida. |
| `GET /portal/digital-card/staff/:id/photo` | Foto de personal autorizada. |
| `GET /public/student-card/:token`, `GET /public/staff-card/:token` | Verificación pública acotada de carné por código aleatorio. |
| `GET /public/verification/constancia/:token`, `GET /public/verification/boletin/:token` | Verificación pública del documento por identificador QR. |

## Pagos y reportes

| Rutas | Uso |
| --- | --- |
| `GET /student-payments`, `POST /student-payments`, `PUT /student-payments/:id`, `DELETE /student-payments/:id` | Consulta, creación, edición y eliminación autorizada de cobros/pagos. |
| `GET /reports/options`, `GET /reports` | Filtros y reportes según el rol institucional. |

## Operación

La API está implementada como un router secuencial en `server/index.js`, no como una especificación OpenAPI generada. Antes de integrar un cliente adicional, confirma en ese archivo el método HTTP, campos validados, cuerpo, respuesta y permisos exactos de la ruta. Mantén esta referencia sincronizada con cambios de rutas y migraciones.
