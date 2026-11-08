# Arquitectura de EDUCA

## 1. Resumen

EDUCA usa una aplicación web React que se compila con Vite, un servidor Node.js que entrega la API y, en producción, también la web compilada. La persistencia es SQLite en desarrollo local y PostgreSQL cuando se proporciona `DATABASE_URL`. La aplicación Android es un contenedor Capacitor que carga la dirección web configurada en `capacitor.config.json`; por tanto, requiere red y muestra la versión publicada en esa dirección.

## 2. Estructura del repositorio

```text
.
├── android/                  Proyecto Android de Capacitor
├── docs/                     Documentación funcional y técnica
│   └── legal/                Plantilla contractual
├── public/                   Recursos públicos usados por Vite
├── server/
│   ├── db.js                 Adaptador SQL, esquema y migraciones
│   └── index.js              API HTTP, sesión, permisos y servicios
├── src/
│   ├── main.jsx              Interfaz React y módulos de la aplicación
│   ├── legal.jsx             Páginas legales y aceptación de términos
│   ├── edu-design.css        Estilos del sistema visual EDUCA
│   └── style.css             Sistema visual y estilos responsive
├── artifacts/                Salidas de compilación Android (si se guardan)
├── data/                     Base SQLite local (ignorada por Git)
├── .env.example              Variables documentadas, sin secretos reales
├── capacitor.config.json     Identidad y URL de la app móvil
├── package.json              Dependencias y comandos
└── vite.config.js            Desarrollo Vite y proxy local de /api
```

`dist/`, `node_modules/`, `.env`, `data/` y credenciales Firebase deben permanecer fuera del control de versiones. Las carpetas de entorno/IDE generadas localmente no son componentes de ejecución.

## 3. Tecnologías y ejecución

| Capa | Tecnología | Responsabilidad |
| --- | --- | --- |
| Interfaz | React + Vite | Inicio de sesión, navegación, formularios, tablas, tarjetas y portales por perfil. |
| Estilos | Bootstrap y CSS propio | Componentes visuales, accesibilidad básica y adaptación responsive. |
| API | Node.js 24, servidor HTTP nativo | Autenticación, validación, autorización, lógica de negocio, correo, push y respuestas JSON. |
| Persistencia | SQLite o PostgreSQL | Datos institucionales y binarios asociados (fotos, firmas, entregas e imágenes permitidas). |
| Aplicación móvil | Capacitor 8 / Android WebView | Empaqueta el acceso móvil y registra notificaciones push Android. |

El frontend usa rutas hash y solicitudes same-origin a `/api`. En desarrollo Vite debe ejecutarse junto con la API local; en producción `npm start` ejecuta `server/index.js`, que sirve la compilación si existe `dist/`.

## 4. Separación de datos y permisos

- Las instituciones se identifican en `schools`; cada usuario y registro operativo está asociado a `school_id`.
- La sesión usa una cookie segura en producción. El servidor guarda una huella del token de sesión, con expiración de ocho horas; no se conserva el token en claro en la tabla.
- Las rutas protegidas derivan institución y usuario de la sesión validada. No se debe confiar en un `school_id` enviado libremente por el navegador.
- `admin` administra cuentas de su institución y módulos asignados. `rectoria` tiene facultades institucionales amplias; la cuenta global autorizada para gestionar instituciones se restringe también por correo en el backend.
- Docentes quedan limitados a cursos/asignaturas asignados. Acudientes y estudiantes ven solo los registros vinculados. La interfaz oculta acciones no disponibles, y la API vuelve a comprobar la autorización.
- Roles disponibles: administrador, rectoría, coordinación, secretaría, docente, orientación, tesorería, acudiente y estudiante.

## 5. Base de datos y migraciones

`server/db.js` ofrece una interfaz común (`get`, `all`, `run`, `exec`, transacciones) para SQLite y PostgreSQL. El esquema incluye, entre otras, tablas para instituciones, usuarios y sesiones; estudiantes y relaciones familiares; cursos, matrículas e historial; periodos; asistencia y justificaciones; notas, evaluaciones e intentos; personal y firmas; eventos y comunicaciones; certificados; notificaciones y tokens push; pagos; auditoría y control documental.

`migrate()` se ejecuta al arrancar el servidor. Las migraciones se versionan con `schema_migrations` y se aplican de forma idempotente; una nueva modificación de esquema debe tener una migración versionada, válida para ambos motores. No se deben editar manualmente las tablas de producción para corregir datos sin respaldo y sin una migración revisable.

SQLite usa por defecto `./data/educa.sqlite`. PostgreSQL se activa cuando está presente `DATABASE_URL`. En Railway, configura una referencia desde el servicio de EDUCA a la variable de la base PostgreSQL; no pegues credenciales de base dentro del código.

## 6. Catálogo funcional

- Identidad institucional, multiinstitución y acceso por roles.
- Usuarios y perfil (incluye datos de contacto y foto donde corresponda).
- Estudiantes, acudientes relacionados y matrícula con trayectoria por año lectivo.
- Cursos, docentes, asignaturas, directores de grupo y horarios.
- Asistencia, justificaciones y observador con datos restringidos.
- Actividades, evaluaciones en línea, entregas y calificaciones.
- Periodos, reglas de escala, boletines y publicación de resultados.
- Solicitudes y emisión de certificados/constancias, funcionarios y reglas de firma.
- Carnés estudiantiles y del personal con código de control y QR de verificación.
- Calendario, comunicaciones, notificaciones internas y push Android.
- Cobros/pagos escolares, reportes, importación, exportación, respaldos y bitácora.
- Solicitudes de restablecimiento de contraseña con aprobación institucional.

El [manual de uso](MANUAL-USUARIO.md) explica los flujos. El [catálogo de API](API.md) describe las rutas disponibles.

## 7. Comunicación y archivos

- Correo transaccional: Resend por API HTTPS o SMTP, configurado exclusivamente en el servidor.
- Push Android: Firebase Cloud Messaging; el JSON de cuenta de servicio solo va en el backend, nunca en `src/` ni dentro del APK.
- SMS: integración opcional con Inalambria mediante `INALAMBRIA_API_KEY`.
- Los tamaños, formatos y permisos de subida se validan en el backend. La base puede guardar ciertos archivos como binarios; la lectura de fotos, firmas y adjuntos debe pasar por rutas autenticadas según el módulo.
- Los QR públicos contienen un identificador de verificación, no credenciales ni datos de acceso. La página de verificación debe exponer solo el estado necesario para validar el documento.

## 8. Seguridad y privacidad

- Contraseñas con derivación criptográfica y comparación segura en el servidor; no se almacenan en texto plano.
- Cookies de sesión con `HttpOnly`, `SameSite` y `Secure` en producción; control de origen para operaciones que modifican estado.
- Validación de entradas, límites de carga y comprobaciones de alcance por institución, rol y relación con el estudiante.
- Bitácora para acciones administrativas y documentos controlados.
- `EDUCA_SETUP_KEY` sirve únicamente para crear la primera institución y su primer administrador; retirarla del servicio después de la configuración inicial.
- Solicitudes de restablecimiento requieren revisión por rectoría, coordinación, secretaría o administración. Tras aprobación, se envía un enlace temporal por correo; la sustitución manual por personal autorizado es una alternativa excepcional.
- La institución debe definir bases legales, autorizaciones parentales, conservación, atención de derechos y medidas reforzadas para datos de menores. La plantilla legal del repositorio no sustituye revisión jurídica.
- Una imagen de firma manuscrita insertada en PDF/carné no es firma electrónica ni digital certificada.

## 9. Desarrollo, publicación y mantenimiento

Consulta [Configuración y despliegue](OPERACION.md) para comandos, variables, Railway, correo, Firebase y APK. Antes de un despliegue: revisa el diff, ejecuta `npm run build`, confirma que no haya secretos y conserva un respaldo de la base. Los cambios de base deben migrarse y desplegarse junto con la versión que los usa.

En Railway verifica los logs de inicio, conexión PostgreSQL, entrega de correo/push y disponibilidad del dominio. Una compilación exitosa solo verifica que el frontend compila; no confirma por sí sola que las integraciones externas o reglas de negocio estén configuradas.

## 10. Límites documentados

- El APK actual es un contenedor de la web publicada; no funciona sin conexión.
- El comando Android `android:apk` construye un APK de depuración, no un paquete listo para publicar en Play Store.
- El envío de correo/SMS/push depende de que las variables, permisos, DNS y credenciales externas estén configuradas correctamente.
- La disponibilidad máxima real no se deduce de una prueba k6 aislada: depende del plan y los límites de Railway, PostgreSQL, concurrencia, patrón de uso, tamaño de datos y de las integraciones.
