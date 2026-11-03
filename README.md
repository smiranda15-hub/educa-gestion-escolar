# Educa · Gestión escolar

Starter de una plataforma escolar. El frontend usa React y Vite; la API usa Node.js 24. En local usa SQLite integrado y en Railway usa PostgreSQL mediante `DATABASE_URL`.

## Desarrollo local

Requisitos: Node.js 24 o superior y npm.

1. Instala las dependencias del frontend con `npm install`.
2. Copia `.env.example` a `.env` y cambia `EDUCA_SETUP_KEY` por un secreto aleatorio largo. Genera uno con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Inicia la API en una terminal: `npm run api`.
4. Inicia Vite en otra terminal: `npm run dev`.
5. Abre la dirección que imprime Vite. En la primera visita, crea el colegio y la cuenta administradora con la clave `EDUCA_SETUP_KEY`.

Los comandos de Node no cargan archivos `.env` automáticamente. En PowerShell, configura la clave en la terminal de la API antes de arrancarla:

```powershell
$env:EDUCA_SETUP_KEY = "tu-secreto-aleatorio"
npm run api
```

La base SQLite se crea en `data/educa.sqlite` de forma automática. `EDUCA_DB_PATH` y `API_PORT` permiten personalizar la ruta y el puerto.

## Railway con PostgreSQL

1. Sube este proyecto a un repositorio Git y crea un proyecto en Railway desde ese repositorio.
2. En el proyecto Railway, usa **New → Database → PostgreSQL** para agregar la base administrada.
3. En el servicio de la aplicación, agrega una referencia `DATABASE_URL` a la variable `DATABASE_URL` del servicio PostgreSQL. No copies credenciales al código.
4. En las variables del servicio de la aplicación configura `EDUCA_SETUP_KEY` con un secreto aleatorio largo. También configura `NODE_ENV=production`.
   Si usas un dominio personalizado o un proxy que cambie el host/protocolo, configura `EDUCA_ALLOWED_ORIGINS` con los orígenes HTTPS permitidos, separados por comas (por ejemplo, `https://colegio.example.edu`).
5. En configuración de despliegue establece el comando de build `npm run build` y de inicio `npm start`. El servidor usa el puerto `PORT` que asigna Railway y sirve el frontend compilado y la API desde el mismo servicio.
6. Genera un dominio público para el servicio de la aplicación. Al abrirlo por primera vez, usa la pantalla inicial para crear el colegio y el primer administrador. Después de completar la configuración, elimina `EDUCA_SETUP_KEY` de las variables y redepliega.

La API aplica las migraciones `CREATE TABLE IF NOT EXISTS` al arrancar. La base de Railway no se accede desde el navegador. Conserva activadas copias de seguridad en Railway y verifica la restauración antes de cargar datos escolares.

## Alcance actual

- Instituciones, usuario inicial, sesiones y estudiantes se guardan en SQLite local o PostgreSQL cuando `DATABASE_URL` está configurada.
- Las contraseñas se almacenan usando scrypt con sal; la cookie de sesión es HttpOnly, SameSite Strict y tiene una duración limitada.
- Las solicitudes que modifican datos se validan con `Origin` contra el origen recibido por el servidor o la lista explícita `EDUCA_ALLOWED_ORIGINS`; sin un origen válido, el backend las rechaza.
- Cada usuario autenticado puede cambiar su contraseña desde el botón de perfil; se verifica la contraseña actual, se registran los cambios y se revocan las demás sesiones de la cuenta.
- La API filtra los estudiantes por el colegio de la sesión y registra acciones administrativas y académicas en la bitácora. El administrador puede consultar la actividad desde **Bitácora**, filtrarla por acción o fecha y recorrerla por páginas; cada consulta queda limitada al colegio de su sesión.
- El navegador no contiene usuarios ni contraseñas precargadas. El primer colegio lo crea quien opera el sistema.
- La aplicación usa PostgreSQL cuando Railway provee `DATABASE_URL`; el entorno local usa SQLite. Antes de operar con menores, completa recuperación por correo, revisión de privacidad, copias de seguridad y políticas de conservación. No usar aún con datos reales.

### Usuarios y portales por rol

- El administrador crea cuentas desde **Usuarios y accesos**, define el rol y una contraseña inicial; también puede activar o desactivar cuentas.
- En **Configuración**, el administrador puede actualizar el nombre del colegio, correo, teléfono, dirección, color principal y logo (JPG, PNG o WEBP de hasta 1 MB). Los datos de identidad se separan por colegio; el logo se almacena en la base y su ruta requiere una sesión autenticada. La migración de columnas se aplica al iniciar el servidor.
- Para crear un acudiente, primero registra al estudiante y luego asocia uno o más estudiantes activos. Para una cuenta de estudiante, asocia exactamente un registro.
- Acudientes y estudiantes solo reciben los nombres, grados y estados de los registros que tienen asociados. La lista general de estudiantes está limitada a administración y secretaría.
- Los docentes ven las funciones de sus cursos asignados; otros roles se limitan a los módulos habilitados para su perfil.
- Docentes pueden crear evaluaciones y trabajos con instrucciones, fecha límite y puntaje máximo, registrar notas y consultar las entregas de sus cursos asignados.
- En **Calificaciones**, el docente puede elegir **Evaluación en línea**, agregar preguntas de selección única y marcar las respuestas correctas. Puede dejarla como borrador o publicarla para que el estudiante responda desde **Mi aula**; el sistema guarda el intento y calcula la nota automáticamente. Solo se permite un intento enviado por estudiante.
- Estudiantes y acudientes vinculados consultan trabajos del año lectivo activo y pueden subir hasta 10 versiones por actividad; se admiten PDF, JPG, PNG, DOCX y XLSX de hasta 8 MB. El contenido se almacena en la base de datos, no en archivos temporales del servidor.
- Las evaluaciones en línea solo las puede iniciar la cuenta del estudiante. Las respuestas del borrador se guardan automáticamente; las respuestas correctas nunca se envían al navegador antes de finalizar.
- Boletines por estudiante, curso, asignatura y periodo muestran evaluaciones, notas, observaciones y promedio ponderado. Administración, secretaría o el docente asignado pueden definir ponderación por evaluación, escala mínima/máxima y nota aprobatoria; el boletín conserva el porcentaje normalizado y muestra el equivalente institucional cuando la regla está configurada. El PDF se genera desde Imprimir en el navegador.
- Administración y secretaría pueden publicar o retirar boletines por año lectivo y periodo; acudientes y estudiantes solo consultan los periodos publicados.
- Las entregas y los boletines se limitan en el backend al colegio, al estudiante vinculado y a las asignaturas de cada docente.
- En **Calificaciones**, docentes asignados pueden adjuntar hasta 5 imágenes JPG, PNG o WEBP (4 MB cada una; 20 MB en total) y un enlace HTTPS de Google Forms (`forms.gle`, `forms.google.com` o `docs.google.com/forms`). Los archivos se guardan en la base de datos y solo se sirven mediante una ruta autenticada, dentro del colegio y curso correspondientes.
- El autor o un administrador puede eliminar comunicaciones; la eliminación también las quita de las bandejas de destinatarios. En **Ver entregas**, el docente asignado puede borrar una entrega individual; su nota se conserva. Al eliminar una evaluación se borran de forma permanente sus notas, preguntas, intentos, imágenes y entregas vinculadas; la aplicación pide confirmación antes de hacerlo.
- La contraseña inicial debe compartirse directamente por un canal seguro. La recuperación de contraseña olvidada no está disponible todavía; requiere configurar un proveedor de correo y un flujo de restablecimiento con token de un solo uso.

## Construcción

Ejecuta `npm run build` para generar el frontend en `dist/`. `npm start` inicia la API y sirve el frontend compilado desde el mismo proceso.

## Aplicación Android

El proyecto incluye un contenedor Android con Capacitor. El APK carga la aplicación publicada en Railway, así que requiere conexión a Internet y muestra la versión que esté desplegada en ese dominio.

Para recompilar en Windows instala Node.js, JDK 21 y Android SDK Platform 36 con Build Tools 36.0.0. Configura `JAVA_HOME`, `ANDROID_HOME` y `ANDROID_SDK_ROOT`, acepta las licencias del SDK y ejecuta `npm install` seguido de `npm run android:apk`. El archivo de depuración se genera en `android/app/build/outputs/apk/debug/app-debug.apk`.

El APK de depuración se puede instalar directamente en un teléfono Android; Android puede pedir autorización para instalar aplicaciones desde el navegador o administrador de archivos. Este paquete no está firmado para publicarse en Google Play.

### Avisos push para la APK Android

EDUCA guarda las notificaciones en la bandeja de cada usuario y la APK registra el dispositivo tras iniciar sesión. Para que Android las muestre también cuando la aplicación está en segundo plano, configura Firebase Cloud Messaging:

1. En Firebase crea/selecciona un proyecto y registra una aplicación Android con el identificador `com.educa.gestionescolar`.
2. Descarga `google-services.json` y colócalo en `android/app/google-services.json`. No lo coloques en `src/` ni dentro del frontend.
3. En Firebase habilita Firebase Cloud Messaging. Crea una clave JSON de cuenta de servicio para el backend.
4. En Railway, agrega `FIREBASE_SERVICE_ACCOUNT_JSON` al servicio EDUCA y pega como valor el contenido JSON completo de la cuenta de servicio. Es una clave privada: no la subas a GitHub ni la incluyas en el APK.
5. Despliega el backend y vuelve a generar e instalar el APK con `npm run android:apk`. Acepta el permiso de notificaciones en el teléfono.

Los eventos del calendario y los comunicados envían avisos a las cuentas destinatarias del colegio o curso; también se notifican nuevas solicitudes de constancia y respuestas de justificaciones. Un evento futuro, por ejemplo «Entrega de boletines», avisa a sus destinatarios al publicarse. El envío push no altera la notificación guardada en la bandeja de EDUCA. Sin la configuración Firebase de los pasos anteriores, la bandeja interna sigue disponible, pero no se reciben avisos del sistema Android.
