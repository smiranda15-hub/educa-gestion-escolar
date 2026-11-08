/**
 * Sincroniza notas de un cuestionario de Google Forms con EDUCA.
 * No pegues la clave en este archivo: guárdala en Propiedades del script.
 */
const EDUCA_PROPERTY_NAMES = {
  baseUrl: 'EDUCA_BASE_URL',
  formUrl: 'EDUCA_FORM_URL',
  secret: 'EDUCA_FORMS_WEBHOOK_SECRET',
};

/** Instala este manejador como activador «Desde formulario → Al enviar formulario». */
function onEducaFormSubmit(event) {
  if (!event || !event.response) throw new Error('Usa un activador de envío de Google Forms.');
  syncEducaResponse_(event.response);
}

/** Ejecuta manualmente para reenviar todas las respuestas, por ejemplo tras recalificar. */
function syncPendingResponses() {
  const form = FormApp.getActiveForm();
  if (!form) throw new Error('Este proyecto de Apps Script debe estar vinculado al formulario.');
  form.getResponses().forEach(syncEducaResponse_);
}

function syncEducaResponse_(formResponse) {
  const properties = PropertiesService.getScriptProperties();
  const baseUrl = String(properties.getProperty(EDUCA_PROPERTY_NAMES.baseUrl) || '').replace(/\/+$/, '');
  const formUrl = String(properties.getProperty(EDUCA_PROPERTY_NAMES.formUrl) || '').trim();
  const secret = String(properties.getProperty(EDUCA_PROPERTY_NAMES.secret) || '');
  if (!baseUrl || !formUrl || !secret) throw new Error('Completa EDUCA_BASE_URL, EDUCA_FORM_URL y EDUCA_FORMS_WEBHOOK_SECRET en las propiedades del script.');

  const respondentEmail = String(formResponse.getRespondentEmail() || '').trim().toLowerCase();
  if (!respondentEmail) throw new Error('Google Forms no entregó el correo. Activa «Recopilar direcciones de correo electrónico».');

  const form = FormApp.getActiveForm();
  let maxScore = 0;
  form.getItems().forEach(function (item) {
    const points = getEducaItemPoints_(item);
    if (points !== null) maxScore += points;
  });
  if (maxScore <= 0) throw new Error('El formulario no tiene preguntas calificables con puntaje.');

  const gradableResponses = formResponse.getGradableItemResponses();
  let score = 0;
  for (const itemResponse of gradableResponses) {
    const itemScore = itemResponse.getScore();
    if (itemScore === null || itemScore === undefined || !Number.isFinite(Number(itemScore))) {
      throw new Error('La respuesta todavía no tiene calificación automática. Revisa la clave de respuestas del cuestionario.');
    }
    score += Number(itemScore);
  }

  const payload = {
    formUrl: formUrl,
    responseId: formResponse.getId(),
    respondentEmail: respondentEmail,
    score: score,
    maxScore: maxScore,
    submittedAt: formResponse.getTimestamp().toISOString(),
  };
  const response = UrlFetchApp.fetch(baseUrl + '/api/integrations/google-forms/webhook', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Educa-Forms-Key': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    // No se registra el cuerpo: podría contener datos personales del alumno.
    throw new Error('EDUCA rechazó la sincronización (HTTP ' + status + '). Revisa el enlace, correo, matrícula y clave configurados.');
  }
}

/** Puntajes compatibles con preguntas que pueden formar parte de un cuestionario calificado. */
function getEducaItemPoints_(item) {
  switch (item.getType()) {
    case FormApp.ItemType.CHECKBOX:
      return item.asCheckboxItem().getPoints();
    case FormApp.ItemType.MULTIPLE_CHOICE:
      return item.asMultipleChoiceItem().getPoints();
    case FormApp.ItemType.LIST:
      return item.asListItem().getPoints();
    case FormApp.ItemType.TEXT:
      return item.asTextItem().getPoints();
    default:
      return null;
  }
}
