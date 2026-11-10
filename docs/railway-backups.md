# Copias de seguridad y restauración en Railway

## Configurar las copias

Las copias deben configurarse en el servicio PostgreSQL de Railway, en su volumen persistente. No se debe usar el disco temporal del contenedor de EDUCA como respaldo.

1. Abre el proyecto EDUCA en Railway y selecciona el servicio **Postgres** (no el servicio web `educa-gestion-escolar`).
2. Abre **Settings → Backups**.
3. Activa el horario **Daily** para tener puntos de recuperación recientes.
4. Si el plan permite varios horarios, añade **Weekly** y/o **Monthly** para ampliar la ventana de recuperación.
5. Confirma que se muestren ejecuciones exitosas en la pestaña **Backups**.

Railway conserva actualmente el horario diario por 6 días, semanal por 27 días y mensual por 89 días. Por eso, el horario diario por sí solo no satisface una retención exacta de 30 días. Daily + Weekly da cobertura cercana a 30 días; Daily + Monthly conserva además un punto mensual por más tiempo. Revisa el periodo y costo que muestra Railway para el plan del proyecto.

### Opción para PostgreSQL: recuperación a un momento (PITR)

Railway también documenta recuperación a un momento para PostgreSQL. Se habilita en la pestaña **Backups** del servicio Postgres. La documentación indica una ventana de archivo aproximada de cuatro semanas para PostgreSQL; comienza después de la primera copia base generada tras activarlo, no recupera fechas anteriores. La restauración crea un servicio Postgres hermano y no cambia producción automáticamente. Hay que validar el servicio restaurado y hacer el cambio de conexión manualmente cuando se decida. PITR genera costos de almacenamiento y salida de red; revisa la estimación de Railway antes de activarlo.

## Probar restauración sin tocar producción

1. No restaures encima del volumen activo de producción.
2. Elige una copia reciente y usa **Restore**. Railway restaura creando un volumen nuevo.
3. Conecta ese volumen restaurado a un servicio PostgreSQL temporal o de staging, nunca al servicio web productivo.
4. Comprueba que EDUCA pueda iniciar con esa base y verifica conteos de tablas clave (colegios, estudiantes, cursos, matrículas y calificaciones) sin abrir datos personales innecesariamente.
5. Registra fecha de copia, duración de restauración, resultado y persona que verificó.
6. Elimina el entorno temporal solo después de validar el resultado y conservar la evidencia necesaria.

Una copia marcada como exitosa no sustituye una prueba periódica de restauración. Conviene hacer la prueba en staging al menos una vez por trimestre y después de cambios de esquema importantes.

## Referencias

- [Railway: Backups](https://docs.railway.com/volumes/backups)
- [Railway: Point-in-Time Recovery](https://docs.railway.com/volumes/point-in-time-recovery)

## Estado en EDUCA

Este documento guía la configuración manual en Railway. No afirma que el horario ya esté activado ni que se haya ejecutado una restauración; eso debe confirmarse en el panel de Railway del proyecto.
