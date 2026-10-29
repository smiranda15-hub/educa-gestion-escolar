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
5. En configuración de despliegue establece el comando de build `npm run build` y de inicio `npm start`. El servidor usa el puerto `PORT` que asigna Railway y sirve el frontend compilado y la API desde el mismo servicio.
6. Genera un dominio público para el servicio de la aplicación. Al abrirlo por primera vez, usa la pantalla inicial para crear el colegio y el primer administrador. Después de completar la configuración, elimina `EDUCA_SETUP_KEY` de las variables y redepliega.

La API aplica las migraciones `CREATE TABLE IF NOT EXISTS` al arrancar. La base de Railway no se accede desde el navegador. Conserva activadas copias de seguridad en Railway y verifica la restauración antes de cargar datos escolares.

## Alcance actual

- Instituciones, usuario inicial, sesiones y estudiantes se guardan en SQLite local o PostgreSQL cuando `DATABASE_URL` está configurada.
- Las contraseñas se almacenan usando scrypt con sal; la cookie de sesión es HttpOnly, SameSite Strict y tiene una duración limitada.
- La API filtra los estudiantes por el colegio de la sesión y registra acciones iniciales, accesos y altas en la bitácora.
- El navegador no contiene usuarios ni contraseñas precargadas. El primer colegio lo crea quien opera el sistema.
- La aplicación usa PostgreSQL cuando Railway provee `DATABASE_URL`; el entorno local usa SQLite. Antes de operar con menores, completa recuperación y cambio de contraseña, protección CSRF/origen, revisión de privacidad, copias de seguridad y políticas de conservación. No usar aún con datos reales.

### Usuarios y portales por rol

- El administrador crea cuentas desde **Usuarios y accesos**, define el rol y una contraseña inicial; también puede activar o desactivar cuentas.
- Para crear un acudiente, primero registra al estudiante y luego asocia uno o más estudiantes activos. Para una cuenta de estudiante, asocia exactamente un registro.
- Acudientes y estudiantes solo reciben los nombres, grados y estados de los registros que tienen asociados. La lista general de estudiantes está limitada a administración y secretaría.
- Docentes y los demás roles pueden iniciar sesión, pero sus cursos y módulos todavía deben implementarse y asignarse antes de mostrarles información escolar.
- La contraseña inicial debe compartirse directamente por un canal seguro. La recuperación de contraseña no está disponible todavía.

## Construcción

Ejecuta `npm run build` para generar el frontend en `dist/`. `npm start` inicia la API y sirve el frontend compilado desde el mismo proceso.
