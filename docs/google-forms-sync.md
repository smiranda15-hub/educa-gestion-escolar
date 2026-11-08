# Sincronizar notas de Google Forms con EDUCA

EDUCA puede recibir la calificación de un cuestionario de Google Forms y guardarla en la evaluación asociada. El estudiante se identifica por el correo recopilado por Google Forms, que debe coincidir con el correo de su cuenta de estudiante en EDUCA. La nota se escala al puntaje máximo configurado en la actividad de EDUCA.

La integración solo sincroniza cuestionarios con calificación disponible. Para que llegue automáticamente al enviar, configura respuestas correctas y puntajes en Google Forms y selecciona la opción de publicar la nota inmediatamente. Las preguntas que requieran calificación manual no se sincronizarán hasta que tengan puntaje; después puedes volver a ejecutar `syncPendingResponses` en Apps Script.

## 1. Configurar la evaluación en EDUCA

1. En **Calificaciones**, crea una tarea/evaluación del curso y asignatura correspondientes.
2. Pega el enlace del formulario en **Enlace de Google Forms** y guarda la actividad.
3. Publica la actividad para el curso.
4. Conserva el enlace exacto que pegaste: se usará en la configuración de Apps Script.

## 2. Crear una clave segura y guardarla en Railway

En PowerShell, genera una clave nueva:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

En Railway, abre el servicio de EDUCA → **Variables** y agrega `EDUCA_FORMS_WEBHOOK_SECRET` con el valor generado. No uses la clave de configuración inicial, ni una clave de Firebase, ni la publiques en el código de la web. Railway reiniciará/desplegará el servicio con la variable.

## 3. Vincular Apps Script al formulario

1. Abre el formulario en Google Forms con una cuenta que pueda editarlo.
2. Abre **⋮ → Editor de secuencias de comandos** (o **Extensiones → Apps Script**).
3. En el editor, reemplaza el contenido de `Code.gs` con el contenido de [`integrations/google-forms/Code.gs`](../integrations/google-forms/Code.gs) y guarda.
4. En el proyecto de Apps Script, abre **Configuración del proyecto** → **Propiedades de la secuencia de comandos** y agrega:

| Propiedad | Valor |
| --- | --- |
| `EDUCA_BASE_URL` | URL HTTPS pública de tu servicio EDUCA en Railway, por ejemplo `https://educa-gestion-escolar-production.up.railway.app` |
| `EDUCA_FORM_URL` | El mismo enlace exacto que guardaste en la actividad de EDUCA |
| `EDUCA_FORMS_WEBHOOK_SECRET` | La misma clave que pusiste como variable en Railway |

5. En Google Forms → **Configuración** → **Respuestas**, activa **Recopilar direcciones de correo electrónico**. Debe llegar el mismo correo que usa la cuenta de estudiante de EDUCA.
6. Configura el formulario como cuestionario, añade las claves de respuesta y los puntajes. Publica la nota al enviar para que el activador reciba un resultado ya calificado.

## 4. Activar el envío automático

1. En Apps Script, abre **Activadores** (icono de reloj) → **Añadir activador**.
2. Selecciona la función `onEducaFormSubmit`.
3. Origen del evento: **Desde el formulario**.
4. Tipo de evento: **Al enviar el formulario**.
5. Guarda y acepta los permisos que solicita Google. El activador ejecuta como la cuenta que lo creó.

## 5. Confirmar en EDUCA

Envía una respuesta real de prueba con el correo de una cuenta estudiantil que esté matriculada en el curso. Al ejecutarse el activador, la calificación aparecerá en **Calificaciones** y **Boletines**. Si la plataforma ya tiene una nota ingresada manualmente para ese estudiante y actividad, EDUCA conserva la nota manual; no la reemplaza silenciosamente.

Puedes revisar los fallos de ejecución en **Apps Script → Ejecuciones**. Mensajes habituales:

- **No hay una actividad publicada con este enlace:** el formulario no está pegado en la actividad publicada o el enlace no coincide exactamente.
- **No encontramos una cuenta activa:** Forms no recopiló el correo o ese correo no coincide con una cuenta de estudiante.
- **No está matriculado en el curso:** la cuenta no tiene matrícula activa en el curso/año de esa evaluación.
- **HTTP 401:** la clave de Apps Script y Railway no coincide.
- **Todavía no tiene calificación automática:** faltan claves/puntajes, la nota se libera después o hay preguntas manuales sin calificar.

## Alcance

- Cada evaluación debe tener su propio formulario/enlace.
- Usa **Limitar a 1 respuesta** en Google Forms para evitar varios intentos; si se permiten varios, EDUCA conserva como nota la respuesta enviada más recientemente.
- Un reenvío del mismo identificador de respuesta actualiza la nota sincronizada, pero una respuesta antigua no reemplaza una más nueva.
- La integración no recibe las respuestas textuales ni archivos del estudiante; solo recibe identificador de respuesta, correo, puntaje y fecha.
- No es un sistema antifraude ni una integración con el libro de calificaciones de Google Classroom. Google Forms no siempre notifica a Apps Script cuando una calificación manual se cambia más tarde; en ese caso ejecuta `syncPendingResponses` manualmente.
