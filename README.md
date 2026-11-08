# EDUCA · Gestión escolar

EDUCA es una plataforma web y Android para centralizar la gestión académica y operativa de una institución educativa. Incluye cuentas por rol, matrícula e historial académico, asistencia, actividades, calificaciones, boletines, certificados, comunicaciones, pagos y control documental.

## Documentación

- [Manual completo de uso](docs/MANUAL-USUARIO.md): instrucciones para administración, rectoría, secretaría, docentes, acudientes y estudiantes.
- [Arquitectura y mantenimiento](docs/ARQUITECTURA.md): estructura, datos, autenticación, permisos, migraciones y seguridad.
- [API del servidor](docs/API.md): catálogo de rutas y criterios de acceso.
- [Configuración y despliegue](docs/OPERACION.md): desarrollo local, variables, Railway, correo, notificaciones y APK Android.
- [Plantilla de contrato SaaS](docs/legal/contrato-saas-plantilla.md).

## Inicio local rápido

Requisitos: Node.js 24 o superior y npm.

1. En PowerShell, entra a la carpeta del proyecto y ejecuta `npm install`.
2. Copia `.env.example` a `.env` y reemplaza `EDUCA_SETUP_KEY` por una clave aleatoria larga. Puedes generarla con:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. En una terminal, carga la clave e inicia la API:

   ```powershell
   $env:EDUCA_SETUP_KEY = "PEGA_AQUI_TU_CLAVE"
   npm run api
   ```

4. En otra terminal, inicia el frontend con `npm run dev`.
5. Abre la dirección local que imprime Vite. Si la base está vacía, registra la institución y la primera cuenta administradora con la misma clave de configuración.

En local, la base SQLite se crea automáticamente en `data/educa.sqlite`. Más instrucciones, incluida la resolución de errores, están en [Configuración y despliegue](docs/OPERACION.md).

## Comandos habituales

| Comando | Uso |
| --- | --- |
| `npm run dev` | Inicia Vite para desarrollo web. |
| `npm run api` | Inicia el servidor local de EDUCA. |
| `npm run build` | Compila la web en `dist/`. |
| `npm start` | Inicia el servidor de producción; sirve API y web compilada. |
| `npm run preview` | Previsualiza localmente la compilación web. |
| `npm run android:sync` | Compila la web y sincroniza los recursos de Capacitor para Android. |
| `npm run android:open` | Abre el proyecto Android en Android Studio. |
| `npm run android:apk` | Compila y sincroniza la app y construye el APK de depuración. |

## Tecnologías

- Frontend: React, Vite, Bootstrap y Lucide.
- Backend: Node.js HTTP API.
- Datos: SQLite local; PostgreSQL cuando se configura `DATABASE_URL`.
- Android: Capacitor y Android WebView.
- Servicios opcionales: Firebase Cloud Messaging, correo por Resend o SMTP, y SMS mediante Inalambria.

## Alcance y seguridad

El servidor valida la sesión, el rol y el ámbito de institución en las operaciones protegidas. La cuenta administradora global `smiranda15@uan.edu.co` gestiona la creación y configuración de instituciones. Cada colegio conserva sus cuentas y datos separados. Los detalles de roles, límites y responsabilidades están en el [manual de uso](docs/MANUAL-USUARIO.md) y la [guía de arquitectura](docs/ARQUITECTURA.md).

No publiques claves, contraseñas, archivos de cuenta de servicio Firebase, datos reales de menores ni archivos `.env` en el repositorio. Las imágenes de firma incluidas en documentos son representaciones gráficas, no una firma electrónica con validez jurídica.
