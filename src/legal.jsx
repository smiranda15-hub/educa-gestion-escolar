import React, { useEffect, useState } from 'react'
import { ArrowLeft, Check, FileText, LockKeyhole, ShieldCheck } from 'lucide-react'

export const LEGAL_TERMS_VERSION = '2026-11-03-v1'

function TermsContent({ schoolName }) {
  return <>
    <p>Al continuar confirmas que accedes con una cuenta autorizada por {schoolName || 'tu institución'} y que utilizarás EDUCA para fines académicos, pedagógicos y administrativos relacionados con la comunidad educativa.</p>
    <h3>Uso respetuoso</h3>
    <p>No publiques contenido ilegal, ofensivo, discriminatorio, sexualmente explícito, difamatorio ni material que vulnere derechos de otras personas. Mantén un trato respetuoso en comunicaciones, actividades y entregas.</p>
    <h3>Seguridad de la cuenta</h3>
    <p>Tu contraseña es personal. No la compartas. Si sospechas que otra persona usó tu cuenta, informa de inmediato a la administración de tu institución y cambia la contraseña.</p>
    <h3>Uso responsable del servicio</h3>
    <p>No intentes acceder a datos ajenos, alterar registros, interferir con el servicio, eludir permisos ni vulnerar sus sistemas. Consulta únicamente la información que corresponda a tu rol y autorización.</p>
    <h3>Datos personales y menores</h3>
    <p>Consulta la <a href="/privacidad" target="_blank" rel="noreferrer">Política de tratamiento de datos</a>. Aceptar estas reglas de uso no equivale a autorizar el tratamiento de datos personales. La autorización de datos de estudiantes menores corresponde a su representante legal y a la institución educativa que administra el registro, conforme a la normativa aplicable.</p>
    <p>La institución puede limitar o suspender el acceso cuando la cuenta deje de estar autorizada o se use de forma indebida.</p>
  </>
}

export function TermsAcceptanceDialog({ schoolName, busy, error, onAccept, onLogout }) {
  return <div className="legal-backdrop"><section className="legal-accept-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-accept-title">
    <span className="legal-icon"><FileText size={22}/></span><div className="eyebrow">ACCESO A EDUCA</div><h1 id="legal-accept-title">Reglas de uso de la plataforma</h1>
    <p className="legal-intro">Lee estas condiciones antes de ingresar al espacio de {schoolName || 'tu institución'}.</p>
    <div className="legal-terms-scroll"><TermsContent schoolName={schoolName}/></div>
    <div className="legal-consent-note"><ShieldCheck size={16}/><span>Esta aceptación registra que conoces las reglas de uso. No sustituye la autorización de tratamiento de datos que debe gestionar tu institución, especialmente para estudiantes menores de edad.</span></div>
    {error && <div className="login-message login-error" role="alert">{error}</div>}
    <div className="dialog-actions"><button type="button" className="button button-soft" onClick={onLogout} disabled={busy}>Salir</button><button type="button" className="button button-primary" onClick={onAccept} disabled={busy}>{busy ? 'Guardando…' : <><Check size={15}/> Aceptar y continuar</>}</button></div>
  </section></div>
}

export function LegalDocumentPage({ documentType }) {
  const [provider, setProvider] = useState(null)
  const [loading, setLoading] = useState(documentType === 'privacy')
  useEffect(() => {
    if (documentType !== 'privacy') return
    fetch('/api/legal/provider').then(response => response.ok ? response.json() : null).then(result => setProvider(result?.provider || {})).catch(() => setProvider({})).finally(() => setLoading(false))
  }, [documentType])

  if (documentType === 'terms') return <main className="legal-page"><header className="legal-page-header"><a href="/" className="institution-entry-brand"><span className="institution-entry-brand-mark"><LockKeyhole size={18}/></span><strong>educa<span>.</span></strong></a><a href="/" className="legal-back-link"><ArrowLeft size={15}/> Volver</a></header><article className="legal-document"><div className="eyebrow">EDUCA · USO DE LA PLATAFORMA</div><h1>Términos de uso</h1><p className="legal-document-lead">Reglas para utilizar las herramientas escolares de forma autorizada, segura y respetuosa.</p><TermsContent/><p className="legal-version">Versión {LEGAL_TERMS_VERSION} · Actualizada el 3 de noviembre de 2026</p><a href="/privacidad">Consultar política de tratamiento de datos</a></article></main>

  const missingProviderDetails = !provider?.name || !provider?.nit || !provider?.address || !provider?.email || !provider?.phone
  return <main className="legal-page"><header className="legal-page-header"><a href="/" className="institution-entry-brand"><span className="institution-entry-brand-mark"><ShieldCheck size={18}/></span><strong>educa<span>.</span></strong></a><a href="/" className="legal-back-link"><ArrowLeft size={15}/> Volver</a></header><article className="legal-document"><div className="eyebrow">PROTECCIÓN DE DATOS PERSONALES</div><h1>Política de tratamiento de datos personales</h1><p className="legal-document-lead">Información sobre el tratamiento realizado en la plataforma EDUCA Gestión Escolar, conforme al marco colombiano de protección de datos personales.</p>
    {missingProviderDetails && <div className="legal-draft-notice"><strong>Información del proveedor pendiente de completar.</strong><span>Antes de publicar esta política para uso real, el proveedor debe configurar y verificar su razón social, NIT, domicilio, correo y teléfono de atención.</span></div>}
    <section><h2>1. Identificación del proveedor</h2><p><strong>{provider?.name || 'Razón social pendiente de completar'}</strong> · NIT: <strong>{provider?.nit || 'Pendiente de verificar'}</strong></p><p>Domicilio: {provider?.address || 'Pendiente de completar'} · Correo para consultas de privacidad: {provider?.email || 'Pendiente de completar'} · Teléfono: {provider?.phone || 'Pendiente de completar'}.</p></section>
    <section><h2>2. Roles de las partes</h2><p>Para los datos de estudiantes, acudientes y personal que la institución incorpora a su espacio, la institución educativa determina los fines del tratamiento y actúa como responsable. EDUCA procesa esos datos bajo las instrucciones de la institución y el contrato aplicable. Para los datos necesarios para administrar la relación con el proveedor, proteger cuentas, prestar soporte y mantener la seguridad del servicio, EDUCA tratará la información conforme a sus propias obligaciones y a la normativa aplicable.</p><p>La distribución de funciones debe quedar definida por escrito para cada institución. Los roles pueden variar según el dato y la operación concreta.</p></section>
    <section><h2>3. Datos tratados y finalidades</h2><p>Según los módulos habilitados por cada institución, EDUCA puede procesar datos de identificación y contacto, matrícula y curso, asistencia, calificaciones, actividades, comunicaciones, documentos escolares, pagos registrados, cuentas y datos técnicos necesarios para autenticación, seguridad y soporte.</p><ul><li>Administrar matrículas, cursos, grupos, asistencia y seguimiento escolar.</li><li>Registrar calificaciones, evaluaciones, actividades y generar boletines y documentos institucionales.</li><li>Facilitar comunicaciones y notificaciones autorizadas por la institución.</li><li>Proteger cuentas, atender incidencias, mantener y respaldar el servicio.</li></ul></section>
    <section><h2>4. Niños, niñas y adolescentes</h2><p>El tratamiento debe respetar el interés superior y los derechos fundamentales de cada menor, y atender su madurez y derecho a ser escuchado conforme a la normativa. La institución responsable debe verificar y conservar la autorización del representante legal cuando corresponda. El uso de EDUCA o la aceptación de sus términos por una cuenta no constituye por sí mismo esa autorización.</p></section>
    <section><h2>5. Derechos y consultas</h2><p>Las personas titulares o sus representantes pueden conocer, actualizar y rectificar sus datos; solicitar prueba de la autorización cuando sea exigible; ser informadas sobre el uso; presentar consultas o reclamos; solicitar la revocatoria de la autorización o supresión cuando proceda; y acudir ante la Superintendencia de Industria y Comercio después de agotar el trámite correspondiente ante el responsable.</p><p>Para datos que administra el colegio, presenta la solicitud ante la institución educativa responsable, usando sus canales de atención. Para datos tratados directamente por el proveedor, puedes contactar al proveedor usando los datos de la sección 1. Cada parte atenderá las solicitudes dentro de su función y de los plazos legales aplicables. El acceso y la supresión pueden tener límites cuando exista una obligación legal o contractual de conservación.</p></section>
    <section><h2>6. Seguridad, conservación y eliminación</h2><p>EDUCA aplica controles de acceso por rol, autenticación, separación de información por institución, registro de acciones administrativas y medidas técnicas para proteger la información. Los datos se conservan durante el tiempo definido por la institución y los requisitos legales o contractuales. Al terminar el servicio, la exportación, conservación y eliminación se rigen por el contrato con la institución y las obligaciones legales; no se eliminarán datos sujetos a una obligación de conservación.</p></section>
    <section><h2>7. Cambios a esta política</h2><p>La versión vigente se publicará en esta página. Si un cambio afecta las finalidades o la identidad del responsable, la institución deberá informar a los titulares según corresponda antes de aplicar el cambio.</p></section>
    {loading && <p>Cargando datos de contacto del proveedor…</p>}<p className="legal-version">Versión base: 3 de noviembre de 2026 · Esta política debe completarse y revisarse para cada relación institucional antes de tratar datos reales.</p><a href="/terminos">Consultar términos de uso</a>
  </article></main>
}
