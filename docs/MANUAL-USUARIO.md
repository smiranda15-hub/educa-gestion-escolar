# Manual de uso de EDUCA

Guía funcional para personal, familias y estudiantes. Los nombres de los módulos corresponden a la navegación actual. Las acciones visibles dependen del rol, de las asignaciones y de las relaciones registradas; el servidor vuelve a validar los permisos al guardar.

## 1. Antes de comenzar

### Acceso a la plataforma

1. Abre el dominio web de EDUCA o la APK instalada.
2. En la página pública, selecciona **Acceso a mi institución**.
3. Busca el plantel por nombre y selecciónalo. Si elegiste otro, vuelve a la selección de instituciones antes de ingresar las credenciales.
4. Escribe el correo y la contraseña de tu cuenta institucional.
5. Lee y acepta los términos vigentes cuando se solicite.
6. Si es tu primer acceso después de una aprobación de restablecimiento, abre el enlace recibido en tu correo y crea una contraseña nueva.

Cada colegio mantiene su propio conjunto de usuarios y datos. No uses la cuenta de otro integrante. Si no ves un módulo, puede que tu rol no tenga acceso o que falte una asignación; comunícate con administración o rectoría.

### Primer ingreso de una institución nueva

La pantalla **Configura tu colegio** aparece únicamente cuando aún no se han creado usuarios. Completa el nombre institucional, administrador inicial, correo, contraseña y clave de configuración del servidor (`EDUCA_SETUP_KEY`). Esa clave se define en el servicio del servidor, no es una contraseña de usuario ni la contraseña de la base de datos. Después de la configuración inicial, el responsable técnico debe retirar la variable de Railway.

## 2. Roles y responsabilidades

| Rol | Uso habitual y límites principales |
| --- | --- |
| Administrador | Administra usuarios y accesos del colegio, ajustes institucionales, cuentas, módulos operativos y configuración disponible. La cuenta global autorizada puede crear y administrar instituciones. |
| Rectoría | Gestiona el ámbito institucional, personal y firmas, revisa constancias y solicitudes de contraseña, supervisa matrículas, cursos, periodos y boletines según las reglas del servidor. |
| Coordinación | Apoya supervisión académica, revisión de justificaciones y solicitudes de contraseña; acceso limitado a acciones autorizadas. |
| Secretaría | Apoya estudiantes, matrícula, documentos, horarios y periodos dentro de los permisos habilitados. |
| Docente | Consulta sus cursos/asignaturas, estudiantes asignados, asistencia, actividades, evaluaciones, entregas y calificaciones. No administra cuentas ni matrícula general. |
| Orientación | Registra seguimientos y observaciones de convivencia/orientación dentro de las restricciones de privacidad. |
| Tesorería | Accede a las funciones financieras habilitadas para su rol. Las acciones concretas dependen de permisos del backend. |
| Acudiente | Consulta únicamente estudiantes relacionados con su cuenta; puede enviar justificaciones y solicitar certificados/constancias para ellos. Puede tener más de un hijo vinculado. |
| Estudiante | Consulta su aula, actividades, evaluaciones, notas publicadas, boletines habilitados, carné y trayectoria asociados. No envía justificaciones ni solicita constancias/boletines en nombre propio; lo hace su acudiente autorizado. |

La tabla es una orientación de uso, no una concesión de permisos. La respuesta 403 indica que esa operación no está autorizada para el usuario actual.

## 3. Navegación y perfil

- **Resumen:** muestra indicadores calculados a partir de los registros disponibles y varía según el rol. Algunas tarjetas solo aparecen a administración/rectoría.
- **Mi perfil:** permite consultar los datos de cuenta y actualizar los campos habilitados. Para cambiar correo, usa la opción de correo del perfil si está disponible y confirma el cambio si el sistema lo solicita. Mantén un correo accesible para recuperación.
- **Foto de perfil:** puede actualizarse desde el perfil cuando el rol lo permite. Si ya existe una foto, no es necesario volver a cargarla para guardar otros campos; usa la acción de quitar foto solo cuando de verdad quieras retirarla.
- **Notificaciones:** abre la campana o el módulo **Notificaciones** para revisar mensajes de EDUCA y marcarlos como leídos. Push al teléfono requiere Android, permiso del sistema y configuración Firebase en el servidor.
- **Cerrar sesión:** usa el botón al final del menú lateral, en especial si compartes el dispositivo.

## 4. Configuración del colegio y año académico

### Identidad institucional

Administración abre **Configuración** para actualizar nombre, contacto, dirección, color institucional y logo. El logo es el que se usa en documentos institucionales cuando aplica. Rectoría puede gestionar los datos académicos del colegio, pero la configuración global está reservada al administrador.

### Periodos académicos

1. Abre **Periodos académicos**.
2. Indica un año lectivo (un año calendario), nombre del periodo y fechas de inicio y fin.
3. Guarda. Crea los periodos necesarios para ese año.

Los periodos y matrículas se asocian a un año. La trayectoria conserva el curso/grado del estudiante en cada año lectivo aunque avance luego.

### Cursos, asignaturas, docentes y horarios

1. En **Cursos y docentes**, crea el grupo eligiendo grado disponible, nombre/curso y año lectivo.
2. Añade las asignaturas y vincula las cuentas de docentes existentes a los cursos/asignaturas correspondientes.
3. Define director de grupo desde la gestión institucional de cursos o personal, según el formulario visible.
4. En **Horario**, elige la asignación, día, horas y salón y guarda.

Un docente debe estar asignado al curso/asignatura antes de que pueda administrar notas o consultar el listado de ese grupo. Revisa que el año del curso y el periodo académico coincidan.

## 5. Usuarios, personal y firmas

### Crear cuentas

1. Administración abre **Usuarios y accesos** y crea la cuenta con nombre, correo, rol y contraseña inicial.
2. Para acudientes, selecciona todos los estudiantes a su cargo; una cuenta puede asociarse a varios hijos.
3. Para estudiantes, vincula exactamente su registro de estudiante.
4. Para docentes y funcionarios, asigna rol y cursos pertinentes donde corresponda.
5. Entrega la contraseña inicial por un canal seguro e indica que debe cambiarla al iniciar sesión.

Administración puede editar, activar/desactivar o retirar cuentas. No se puede retirar el último administrador activo del colegio. Desactivar una cuenta bloquea su acceso sin borrar automáticamente el expediente académico.

### Personal Institucional y Firmas

1. Rectoría o administración abre **Personal Institucional y Firmas**.
2. Vincula una cuenta existente para completar los datos a partir del usuario creado; verifica nombres, identificación, cargo, correo, área y teléfono.
3. Selecciona cursos/grupos para directores de grupo o docentes cuando aplique.
4. Si se necesita una firma gráfica, carga PNG transparente y revisa que corresponda al funcionario.
5. Guarda; para actualizar otros campos no vuelvas a cargar la firma ya existente. Usa estado inactivo cuando el funcionario deje de firmar.
6. Configura las reglas por tipo de documento y comprueba las firmas que se insertarán en boletines, certificados o informes.

La vinculación de una persona a este registro no concede permisos de acceso. Las imágenes de firma son representaciones gráficas, no firmas electrónicas certificadas.

## 6. Estudiantes, acudientes y matrículas

### Registrar estudiante

Personal autorizado abre **Estudiantes** y crea el registro con nombre, tipo y número de documento, lugar de expedición, grado/curso, acudiente autorizado, teléfono y foto opcional. La foto existente no debe volver a cargarse al editar los demás datos.

El estado **Activo** representa matrícula activa en el registro del colegio. El alumno debe aparecer en el grado asignado al aprobarse la matrícula. Docentes solo consultan estudiantes de grupos relacionados y no pueden editar ni eliminar estudiantes.

### Crear solicitud y aprobar matrícula

1. Abre **Matrículas** y crea una solicitud con datos del aspirante, grado seleccionado, año lectivo y acudiente.
2. Revisa documentos pendientes, cupo/curso y datos de contacto.
3. Rectoría, administración o secretaría autorizada revisa y aprueba o rechaza la solicitud.
4. La aprobación crea/actualiza el registro activo del estudiante y la matrícula histórica con el grado, curso y año indicados. Verifica luego **Estudiantes** y **Trayectoria académica**.
5. Crea o vincula las cuentas de estudiante/acudiente desde **Usuarios y accesos**; la matrícula no equivale por sí sola a entregar credenciales.

Los traslados y cambios de curso deben quedar reflejados en el historial del año correspondiente. No sobrescribas años anteriores para simular el curso actual.

### Importación y exportación

En **Importar estudiantes**, personal autorizado descarga o sigue el formato indicado por la pantalla, verifica encabezados, tipos de identificación y grados disponibles, y sube CSV/Excel compatible. Revisa el resumen de errores antes de corregir y volver a importar; no dupliques registros con el mismo documento. **Estudiantes** y **Reportes** ofrecen exportaciones según el rol.

## 7. Asistencia, justificaciones y seguimiento

### Asistencia

1. El docente abre **Asistencia**, elige curso y fecha/clase.
2. Marca cada estudiante como presente, ausente, tarde o justificado según las opciones del sistema.
3. Guarda una sola vez y confirma los registros. Si hubo duplicado o error, solicita corrección a un rol autorizado.

El backend limita al docente a sus asignaciones y registra fecha y responsable.

### Justificaciones

El padre/acudiente autorizado abre **Justificaciones**, selecciona estudiante y fecha, escribe el motivo y adjunta soporte opcional en formato permitido. Envía y conserva el seguimiento. Administración, rectoría, coordinación o secretaría autorizada revisa, aprueba/rechaza y puede añadir observación. El estudiante no puede presentar la solicitud.

### Observador del estudiante

Personal autorizado registra categoría, prioridad, hechos observables y acciones acordadas. Marca confidencial cuando corresponda. Evita incluir información excesiva o diagnósticos que no sean necesarios. Docentes solo acceden a los registros permitidos y a estudiantes de sus cursos.

## 8. Calendario, actividades y comunicaciones

### Calendario y eventos

En **Calendario**, navega por mes, elige fecha y consulta agenda. Personal habilitado crea eventos con título, tipo, fecha, horas, alcance (colegio o curso) y descripción. El docente debe seleccionar un curso que tenga asignado. Actividades con cupo pueden permitir inscripciones. El autor y los roles autorizados pueden borrar eventos.

Al publicar un evento, EDUCA genera notificaciones internas para las cuentas destinatarias y puede enviar correo/push si esas integraciones están habilitadas. La entrega externa depende de la configuración y del permiso del dispositivo.

### Actividades y eventos

Consulta actividades publicadas, detalles, fechas e inscripción cuando esté habilitada. Familias y estudiantes solo ven las actividades destinadas a sus relaciones/cursos.

### Comunicaciones

El autor o un administrador autorizado crea comunicados y selecciona destinatarios o cursos. Revisa cuidadosamente el público antes de enviar. El sistema conserva el historial y puede notificar por bandeja, correo o push según configuración. El autor/administrador puede eliminar conforme a permisos; la eliminación afecta la bandeja de destinatarios asociada.

### Mensajería privada

1. Abre **Mensajería** en la navegación.
2. Usa **Recibidos** para leer conversaciones entrantes y **Enviados** para consultar las que iniciaste.
3. Pulsa **Nuevo mensaje**, selecciona una persona autorizada, escribe el asunto y el mensaje, y envíalo.
4. Abre una conversación para leerla y responder. La respuesta queda dentro del mismo hilo.

La lista de destinatarios depende del rol, de que la cuenta esté activa y de sus relaciones académicas. Estudiantes y acudientes pueden escribir a rectoría, coordinación, secretaría, orientación y tesorería, además de docentes vinculados a sus cursos. Los docentes pueden contactar estudiantes y acudientes de los grupos que tienen asignados. La mensajería es privada entre participantes; las notificaciones en pantalla o en el teléfono solo anuncian que hay un mensaje nuevo.

## 9. Aula, evaluaciones, notas y boletines

### Crear actividad o evaluación (docentes)

1. En **Calificaciones**, elige curso/asignatura y periodo.
2. Usa **Nueva evaluación** para un trabajo entregable o evaluación, o **Nota de actividad en clase** para registrar una calificación de actividad presencial.
3. Completa nombre, tipo, descripción, fecha límite y puntaje máximo. Para apoyo puede adjuntar imágenes permitidas o un enlace Google Forms HTTPS.
4. Para evaluación en línea, agrega preguntas y respuestas correctas, define publicación y, si aplica, activa registro de pérdida de foco/cambio de pestaña.
5. Publica cuando esté lista; revisa el curso y periodo antes de hacerlo.

El registro de cambios de foco no detecta qué aplicación abrió el estudiante ni demuestra uso de ChatGPT u otra herramienta. No debe usarse como prueba automática de fraude.

### Entregas y calificaciones

- Estudiantes abren **Mi aula**, consultan trabajos vigentes y cargan archivo/respuesta antes de la fecha límite.
- Acudientes vinculados pueden consultar el trabajo de sus hijos cuando el módulo lo permite.
- Docentes revisan **Ver entregas**, escriben retroalimentación y nota; las entregas pueden corregirse según las acciones disponibles.
- Los docentes califican solo cursos/asignaturas asignados. Se conserva la nota asociada a la evaluación salvo que se elimine la evaluación; borrar una evaluación puede borrar permanentemente notas, preguntas, intentos e información relacionada.

### Boletines

1. Completa calificaciones y observaciones del periodo.
2. Administración, rectoría o secretaría autorizada abre **Boletines** y publica para año y periodo.
3. Acudientes/estudiantes consultan solo los periodos publicados desde **Boletines** o la trayectoria.
4. Descarga o imprime el documento desde el navegador y guarda PDF.

El boletín contiene datos reales registrados; comprueba estudiante, grado, año, periodo, docentes/director y firmas antes de distribuirlo. El QR verifica la vigencia del folio. Una vista previa aún no publicada no se debe tratar como documento oficial.

## 10. Certificados, constancias, carnés y control documental

### Solicitar y emitir certificados/constancias

1. El acudiente abre **Certificados y constancias**, elige uno de los estudiantes vinculados, tipo de documento y registro histórico (grado/curso/año).
2. Si faltan tipo o lugar de expedición del documento, pide a administración corregirlos en **Estudiantes** antes de enviar.
3. Envía la solicitud a rectoría. El estudiante no puede solicitarla.
4. Rectoría revisa identidad, trayectoria, tipo de documento y firmantes; aprueba/firma o rechaza.
5. El acudiente descarga/imprime la constancia aprobada. Administración/rectoría puede corregir mediante nueva solicitud/versionado, anular o eliminar dentro de las opciones disponibles.

El documento incluye institución, identificación, lugar de expedición, grado/curso/año, folio, emisor y verificación QR según el tipo. La aprobación conserva responsable y fecha. Una imagen de firma no proporciona por sí sola integridad jurídica certificada.

### Carné digital

Abre **Carné digital** para consultar el carné disponible para tu perfil. El carné institucional debe mostrar identidad, documento, institución, rol/cargo o grado, foto registrada, código de barras/identificador, QR de verificación y persona que expide cuando esos datos estén configurados. El QR valida el estado sin compartir la contraseña. Si la foto falta o aparece incorrecta, solicita actualizar el registro correspondiente.

### Control documental

Rectoría, administración y secretaría autorizada consultan folios. Filtra por número, estudiante, tipo y año lectivo. Usa **Abrir documento** cuando el tipo tenga un PDF/documento emitido vinculado. Matrículas y solicitudes pueden aparecer como registro administrativo y no necesariamente tienen un PDF. Los documentos anulados pueden eliminarse del listado por rectoría/administración; la bitácora de auditoría conserva el registro según la función.

## 11. Pagos, reportes y respaldos

### Pagos estudiantiles

Roles autorizados registran un cobro con estudiante, concepto, valor, año lectivo y vencimiento. Después de confirmar el pago, registran el movimiento y referencia si aplica. Revisa movimientos filtrando por estado. Los roles habilitados pueden editar el valor o eliminar cobros según las opciones de la pantalla.

La suspensión de acceso al portal por mora es una acción separada del registro de cobros y de la matrícula. Verifica saldo, estudiante, periodo, motivo y comunicación con la familia antes de suspender/restablecer. No se borran las obligaciones históricas al cambiar el estado de acceso. No se almacenan datos de tarjetas.

### Reportes y respaldos

En **Reportes**, aplica filtros de sede/curso/año/periodo/fecha que estén disponibles y exporta CSV/PDF. Comprueba el rango antes de compartir datos personales.

La descarga de respaldo está reservada al administrador. Un respaldo debe guardarse en ubicación cifrada, con acceso limitado y política de retención institucional. La descarga de respaldo no reemplaza un plan periódico de recuperación; valida la restauración en un entorno seguro.

## 12. Cambiar o recuperar la contraseña

### Cambio voluntario

En **Mi perfil**, usa la opción de cambio de contraseña cuando aparezca; proporciona la contraseña actual si se solicita y crea una nueva única y segura. No reutilices contraseñas compartidas con otros servicios.

### Recuperación mediante aprobación

1. En el inicio de sesión, selecciona **¿Olvidaste tu contraseña?** e indica colegio/correo de la cuenta.
2. EDUCA envía confirmación de recepción; no es aún el enlace para cambiar la clave.
3. Rectoría, coordinación, secretaría o administración abre **Solicitudes de contraseña** y verifica la identidad por un canal conocido. Aprueba o rechaza.
4. Al aprobar, EDUCA envía al correo registrado un enlace de un solo uso con vencimiento de 30 minutos. Si hay número de celular y SMS está configurado, también puede enviarse un código temporal. El enlace es el mecanismo principal.
5. La persona abre el enlace y define una contraseña nueva. Si el enlace venció o fue utilizado, solicita nuevamente.

La sustitución manual por administración/rectoría se reserva para casos fortuitos y requiere verificación de identidad y registro de la acción. Nunca compartas códigos de recuperación con otra persona.

## 13. Notificaciones y correo

Las notificaciones internas aparecen en **Notificaciones**. El correo de eventos, comunicados, boletines y acciones importantes depende de que el proveedor esté configurado y de que el usuario tenga correo válido. El remitente identifica EDUCA y, cuando se configuró, la institución. Para Android, permite notificaciones en el sistema y abre la app al menos una vez para registrar el dispositivo.

Si falta un mensaje: revisa spam, bandeja interna, dirección registrada, estado de publicación y las variables/bitácora del proveedor. No deduzcas que el envío funcionó únicamente porque se guardó la notificación interna.

## 14. Problemas comunes

| Síntoma | Qué revisar |
| --- | --- |
| No aparece el colegio en selector | Confirma que la institución está activa y que el servicio responde. Actualiza la página y busca por nombre. |
| Inicio en blanco | Recarga sin caché; abre consola del navegador y revisa error React y red. Confirma despliegue exitoso y versiones de frontend/backend compatibles. |
| `ECONNREFUSED 127.0.0.1:3001` local | La API no está corriendo. Mantén `npm run api` en una terminal y Vite en otra. |
| Acceso denegado o lista vacía | Verifica institución elegida, rol activo, asignación docente, vínculo acudiente-estudiante, curso/año y publicación del periodo. |
| No guarda documento o foto | Comprueba campos obligatorios, tipo/tamaño del archivo y que el formulario no requiera realmente cambiar la foto. Revisa el mensaje y log de API. |
| Correo no llega | Revisa `RESEND_*` o SMTP en el servicio EDUCA, estado de dominio remitente y logs de envío; evita cambiar secretos sin causa. |
| Push no llega al Android | Revisa permiso de notificaciones, Firebase Android (`google-services.json`), cuenta de servicio en backend, app instalada y token de dispositivo. |
| APK queda con una vista antigua | Si usa el dominio web productivo, confirma que Railway desplegó la versión; el APK contenedor en línea suele reflejar esa web. Si cambió configuración nativa, vuelve a sincronizar y compilar. |
| Solicitud de contraseña pendiente | La persona debe esperar aprobación; la confirmación inicial no es el enlace de restablecimiento. |

Al reportar un problema comparte módulo, institución, hora aproximada y captura; oculta contraseñas, tokens, documentos y datos de menores.
