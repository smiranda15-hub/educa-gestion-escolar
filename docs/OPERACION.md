# Configuración y operación de EDUCA

Instrucciones para desarrollo, despliegue, correo, notificaciones y Android. Los secretos se configuran en el entorno del servidor que ejecuta EDUCA, no en el navegador ni en el APK.

## 1. Desarrollo local en Windows

Requisitos: Node.js 24+, npm, Git (opcional para clonar) y PowerShell.

```powershell
cd C:\ruta\a\COLEGIOS
npm install
Copy-Item .env.example .env
```

Abre `.env` con un editor y reemplaza `EDUCA_SETUP_KEY` por una clave larga y aleatoria. Para generar una:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

También puedes definirla solo en la ventana PowerShell que ejecuta la API:

```powershell
$env:EDUCA_SETUP_KEY = "PEGA_AQUI_LA_CLAVE_GENERADA"
npm run api
```

Deja esa terminal abierta. En otra terminal, desde la misma carpeta:

```powershell
npm run dev
```

Abre la URL local impresa por Vite, normalmente `http://localhost:5173`. La API local escucha en el puerto 3001 por defecto y Vite reenvía `/api` a ella. Si solo ejecutas `npm run dev` aparecerá `ECONNREFUSED`; si ejecutas solo `npm run api`, no tendrás el servidor de desarrollo frontend.

La base de datos se crea en `data/educa.sqlite`. Esa carpeta y los `.env` están ignorados por Git. No borres `data/educa.sqlite` si quieres conservar esos registros locales.

## 2. Variables de entorno

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `EDUCA_SETUP_KEY` | Inicialización | Secreto aleatorio para crear el primer colegio/administrador. Retíralo una vez completado el setup. |
| `DATABASE_URL` | Producción PostgreSQL | Cadena de conexión; en Railway usa referencia privada desde el servicio PostgreSQL. Si falta, el backend usa SQLite. |
| `EDUCA_DB_PATH` | No | Ruta alternativa para archivo SQLite; predeterminada `./data/educa.sqlite`. |
| `PORT` | Railway | Puerto que asigna Railway. El servidor lo usa automáticamente. |
| `API_PORT` | Local opcional | Puerto local; predeterminado 3001. |
| `NODE_ENV` | Producción | Pon `production` para cookies seguras y comportamiento de producción. |
| `EDUCA_ALLOWED_ORIGINS` | Opcional | Orígenes HTTPS adicionales separados por coma para solicitudes que cambian estado. Incluye origen exacto, sin ruta. |
| `PGSSLMODE` | Opcional | Usa `disable` solo si tu proveedor requiere conexión PostgreSQL sin SSL. En Railway normalmente déjala sin definir. |
| `PG_POOL_MAX` | Opcional | Máximo de conexiones PostgreSQL en el pool (predeterminado 5 por instancia). Ajusta junto con el límite del plan de base. |
| `RESEND_API_KEY`, `RESEND_FROM` | Correo recomendado | Credenciales y remitente verificado de Resend. EDUCA prefiere este canal cuando ambas están configuradas. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Alternativa correo | Parámetros SMTP del buzón/proveedor. No uses la clave del correo de una persona si puedes crear contraseña de aplicación. |
| `SMTP_REPLY_TO` | Opcional | Dirección donde recibir respuestas. |
| `EDUCA_PUBLIC_URL` | Restablecimiento correo | Dominio público HTTPS de EDUCA usado para generar enlaces de recuperación. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Push Android | JSON completo de cuenta de servicio Firebase, solo en backend. No es el `google-services.json` cliente. |
| `INALAMBRIA_API_KEY` | SMS opcional | Llave de API para envío SMS al aprobar recuperaciones cuando exista celular válido. |
| `EDUCA_PROVIDER_NAME`, `EDUCA_PROVIDER_NIT`, `EDUCA_PROVIDER_ADDRESS`, `EDUCA_PRIVACY_EMAIL`, `EDUCA_PRIVACY_PHONE` | Datos legales | Información real del proveedor para la página pública de privacidad. No rellenes con datos ficticios. |

`.env.example` contiene la lista de referencia. Añade nuevas variables allí sin valores reales y actualiza esta tabla al cambiar el servidor.

## 3. Despliegue en Railway

### Servicios

Se necesitan dos servicios dentro del proyecto Railway: **PostgreSQL** y la **aplicación EDUCA**. PostgreSQL no es público y no sirve la web; la aplicación Node sirve API y web.

### Conectar base y aplicación

1. Añade PostgreSQL desde Railway si aún no existe.
2. En el servicio EDUCA abre **Variables → Add Variable → Reference**.
3. Selecciona el servicio PostgreSQL y referencia `DATABASE_URL`. Debe quedar disponible en EDUCA con el nombre exacto `DATABASE_URL`.
4. No uses la dirección `*.railway.internal` desde tu computador; es una dirección privada de la red Railway.
5. Verifica que el servicio de aplicación tenga `NODE_ENV=production` y `EDUCA_SETUP_KEY` solo durante la inicialización.

### Configuración de compilación y despliegue

- Repositorio: rama que se desea desplegar.
- Build command: `npm run build` (si Railway no detecta el script automáticamente).
- Start command: `npm start`.
- Puerto: el servidor lee `PORT` automáticamente; no fijes el puerto interno a un valor distinto del asignado por Railway.
- Genera un dominio público para el servicio de aplicación; no lo generes para PostgreSQL.

En la primera visita del dominio registra el colegio y la cuenta administradora. Después elimina `EDUCA_SETUP_KEY` y redepliega. Confirma en **Deploy Logs** que aparece `Educa API (postgres) disponible en puerto ...`, y abre el dominio público para comprobar respuesta y acceso.

Para publicar código desde PowerShell:

```powershell
git status
git add .
git commit -m "Describe el cambio"
git push
```

Railway inicia el despliegue vinculado a la rama. Revisa **Deployments** y los logs de compilación y arranque. Si el árbol de trabajo incluye archivos generados no deseados, agrégalos por nombre en vez de `git add .`.

### Descarga de la aplicación para Windows

El instalador de Windows se genera en `artifacts/windows-release/`. No subas el `.exe` al repositorio: pesa alrededor de 121 MB. Para habilitar el botón **Descargar Windows** de la página pública:

1. Crea una publicación en GitHub Releases y adjunta el instalador `.exe` de `artifacts/windows-release/`.
2. Copia el enlace HTTPS directo del archivo adjunto.
3. En Railway, abre **Variables** del servicio EDUCA y agrega `EDUCA_WINDOWS_INSTALLER_URL` con ese enlace.
4. Guarda y espera el redepliegue. El botón del sitio redirige al instalador configurado. Si falta la variable, la página explica que la descarga todavía no está publicada.

Actualiza la publicación y la variable cuando generes una nueva versión. Mantén el instalador más reciente en Releases; los directorios `artifacts/` son resultados locales de compilación y no se publican con el código.

## 4. Correo saliente

En Railway configura las variables en el servicio EDUCA, nunca en el servicio PostgreSQL. El servidor admite Resend API HTTPS y SMTP; en planes Railway que restringen SMTP saliente, usa Resend o un proveedor con API HTTPS.

1. Verifica el dominio remitente en el proveedor de correo.
2. Añade los registros DNS SPF/DKIM que te indique el proveedor. DMARC es recomendado.
3. Espera a que la verificación del proveedor muestre el dominio autenticado.
4. Configura `RESEND_API_KEY` y `RESEND_FROM` (por ejemplo `EDUCA <notificaciones@tudominio>`), o los parámetros SMTP correspondientes.
5. Configura `EDUCA_PUBLIC_URL` con el dominio HTTPS definitivo.
6. Guarda variables y espera el redepliegue. Genera una solicitud de recuperación controlada y comprueba correo recibido, spam y logs de Railway.

No pegues una clave de API o contraseña de correo en el código, capturas, repositorio o variable pública `VITE_*`. Si una credencial privada se compartió por error, revócala/rotala en el proveedor.

## 5. Notificaciones Android y SMS

### Firebase Cloud Messaging

1. En Firebase registra la aplicación Android con el identificador `com.educa.gestionescolar`.
2. Descarga el archivo cliente `google-services.json` y colócalo en `android/app/google-services.json`.
3. Descarga una cuenta de servicio para Firebase Admin. Es un archivo distinto con clave privada.
4. Guarda el JSON completo como `FIREBASE_SERVICE_ACCOUNT_JSON` en Railway, servicio EDUCA únicamente.
5. Despliega backend. Genera/sincroniza APK si cambió la configuración Android, instala y acepta el permiso de notificaciones.
6. Inicia sesión en el teléfono para registrar el token push y prueba con evento/comunicado de destinatarios definidos.

La bandeja interna de EDUCA puede funcionar aunque push no esté listo. Push necesita Android, permiso del usuario, token activo y credenciales servidor válidas. No subas el JSON de servicio ni lo incluyas en la APK.

### SMS

Configura `INALAMBRIA_API_KEY` en backend EDUCA. El SMS es complementario al enlace de correo para flujos de recuperación y solo se envía cuando la cuenta tiene un celular válido y el servicio externo responde. Valida costos, saldo, formato internacional y políticas del proveedor antes de habilitarlo ampliamente.

## 6. Android APK

La app actual usa Capacitor (`com.educa.gestionescolar`) y la URL productiva se define en `capacitor.config.json`. Mientras se mantenga configurada una URL remota, la APK es un contenedor online y requiere Internet.

### Requisitos de compilación Windows

- Node.js 24 y npm.
- Android Studio/SDK y JDK 21 (o la versión compatible con Gradle del proyecto).
- Android SDK Platform 36 y Build Tools 36.0.0, según configuración actual del proyecto.
- Licencias Android SDK aceptadas; variables `JAVA_HOME`, `ANDROID_HOME` y/o `ANDROID_SDK_ROOT` apuntando a SDK/JDK instalados.

En PowerShell, desde el repositorio:

```powershell
npm install
npm run android:apk
```

El script compila frontend, sincroniza Capacitor y ejecuta Gradle. El APK de depuración se genera normalmente en `android/app/build/outputs/apk/debug/app-debug.apk`. Para abrir Android Studio: `npm run android:open`.

Este APK debug puede instalarse para validar. Para Play Store se necesita preparar firma release, `applicationId` definitivo, iconos/capturas, política de privacidad, ficha, clasificación y formato de publicación requerido. Para iOS se requiere Xcode en macOS y configuración Apple Developer; Android Studio en Windows no genera un binario iOS.

Si se modifica la dirección remota en Capacitor o una integración nativa, ejecuta `npm run android:sync` y genera de nuevo el APK. Cambios solo web servidos desde el mismo dominio pueden reflejarse sin reinstalar, pero actualizaciones nativas necesitan compilar y distribuir un APK nuevo.

## 7. Dominio personalizado y HTTPS

1. Añade el dominio en Networking/Public Networking del servicio EDUCA en Railway.
2. Copia exactamente los registros DNS que Railway muestra (tipo, nombre y destino) a tu registrador DNS.
3. Conserva el TXT de verificación hasta que Railway valide el dominio.
4. Elimina registros duplicados/conflictivos que apunten el mismo host a otro servicio.
5. Espera propagación DNS y validación del certificado TLS; abre `https://` del dominio y revisa que el certificado sea válido.
6. Actualiza `EDUCA_PUBLIC_URL` al dominio canónico y agrega el origen a `EDUCA_ALLOWED_ORIGINS` solo si el dominio frontend/API dejan de ser same-origin.

No compartas públicamente valores TXT de verificación innecesarios, credenciales DNS ni claves privadas.

## 8. Respaldos, monitoreo y recuperación

- Mantén respaldo automatizado de PostgreSQL desde Railway o desde una herramienta compatible, con retención y ubicación separada.
- La exportación `/api/admin/backup` es complementaria; restringe su archivo porque contiene información personal y posiblemente datos de menores.
- Documenta quién puede restaurar, prueba restauración periódica en un entorno aislado y define objetivo de recuperación.
- Revisa uso de CPU, memoria, conexiones PostgreSQL, errores HTTP, latencia, entrega de correo y errores FCM en las métricas/logs del proveedor.
- Escala pool de conexiones solo conociendo el límite de PostgreSQL y número de réplicas: el máximo total se multiplica por instancias del backend.
- La capacidad observada en k6 bajo una configuración es una medición de esa prueba; no garantiza carga real futura ni incluye operaciones no probadas.

## 9. Resolución de errores comunes

| Mensaje/síntoma | Acción |
| --- | --- |
| `ECONNREFUSED 127.0.0.1:3001` | Arranca `npm run api` en una terminal y `npm run dev` en otra. |
| `Educa API (sqlite)` en logs de Railway | Railway no está entregando `DATABASE_URL` al servicio de la app; corrige la referencia privada. |
| `Educa API (postgres)` pero web en blanco | Abre logs/Consola del navegador; verifica errores JS y que se haya construido `dist/`. |
| El setup no acepta clave | Comprueba que el valor sea exactamente el de `EDUCA_SETUP_KEY` del servicio que corre la API; reinicia/redeploy tras cambiar variable. |
| Correo `ETIMEDOUT` | Revisa restricciones de SMTP saliente del plan; prueba API HTTPS de Resend y verifica DNS/remitente. |
| Firebase Admin no inicializa | JSON completo válido, private key con saltos escapados, correo de servicio correcto y proyecto Firebase correspondiente. Mantén la credencial en Railway. |
| Dominio dice “Not secure” | Railway todavía no emitió TLS o DNS no apunta al valor indicado; elimina duplicados, espera propagación/validación y prueba HTTPS. |
| Build Android falla | Revisa JDK, SDK, licencias, Gradle y sincroniza `android:sync` antes de compilar. |
