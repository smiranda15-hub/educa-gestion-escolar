# Encuadre de fotos de estudiantes: decisión de privacidad

## Decisión

El encuadre automático debe ejecutarse en el dispositivo del usuario. EDUCA no enviará fotos de estudiantes a servicios externos de IA, ni usará reconocimiento para identificar personas. La herramienta solo podrá sugerir un recorte centrado en el rostro; el usuario revisará el resultado antes de guardarlo.

## Reglas para implementarlo

- Solicitar la foto solo al personal autorizado o al acudiente, según el flujo institucional.
- Mostrar el propósito y pedir confirmación antes de procesar o guardar la imagen.
- Procesar localmente y subir únicamente el recorte que la persona confirme.
- No conservar miniaturas ni copias temporales después de guardar o cancelar.
- Mantener una opción manual de encuadre y permitir continuar sin detección facial.
- No registrar plantillas biométricas, vectores faciales ni identidad inferida.
- Respetar los límites de tamaño y formatos existentes y las políticas de retención del colegio.
- Si el dispositivo no admite el modelo local, ofrecer el recorte manual en vez de enviar la imagen a un proveedor.

## Estado

Esta decisión fija el criterio de privacidad; no instala ni activa todavía un modelo de IA. Para desplegar la detección local hace falta seleccionar y revisar un modelo que se pueda alojar junto con la aplicación, comprobar su licencia, tamaño y compatibilidad con Android/WebView, y probarlo en dispositivos reales. No se habilitará procesamiento remoto como alternativa automática.
