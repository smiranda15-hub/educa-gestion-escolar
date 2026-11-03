import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import 'bootstrap/dist/css/bootstrap.min.css'
import { QRCodeSVG } from 'qrcode.react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen, Building2, CreditCard,
  CalendarDays, Check, ChevronDown, ChevronRight, ClipboardCheck,
  Award, CalendarPlus, Clock3, Download, Eye, EyeOff, FileText, GraduationCap, History, IdCard, LayoutDashboard, LockKeyhole, LogOut, Menu,
  PartyPopper, Plus, Pencil, PenTool, Printer, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Smartphone, Trash2, Users, UserRound, X,
} from 'lucide-react'
import './style.css'
import { LEGAL_TERMS_VERSION, LegalDocumentPage, TermsAcceptanceDialog } from './legal.jsx'

const navGroups = [
  { title: 'GENERAL', items: [{ label: 'Resumen', icon: LayoutDashboard }, { label: 'Mi perfil', icon: UserRound }, { label: 'Estudiantes', icon: Users }, { label: 'Matrículas', icon: ClipboardCheck }, { label: 'Asistencia', icon: CalendarDays }, { label: 'Justificaciones', icon: Check }, { label: 'Calendario', icon: CalendarDays }, { label: 'Actividades y eventos', icon: PartyPopper }, { label: 'Carné digital', icon: IdCard }, { label: 'Certificados y constancias', icon: Award }, { label: 'Trayectoria académica', icon: History }, { label: 'Horario', icon: Clock3 }, { label: 'Calificaciones', icon: BookOpen }, { label: 'Boletines', icon: FileText }, { label: 'Mi aula', icon: ClipboardCheck }] },
  { title: 'GESTIÓN', items: [{ label: 'Personal Institucional y Firmas', icon: PenTool }, { label: 'Usuarios y accesos', icon: LockKeyhole }, { label: 'Solicitudes de contraseña', icon: LockKeyhole }, { label: 'Cursos y docentes', icon: GraduationCap }, { label: 'Pagos estudiantiles', icon: CreditCard }, { label: 'Mis cursos', icon: BookOpen }, { label: 'Comunicaciones', icon: Bell }, { label: 'Notificaciones', icon: Bell }, { label: 'Observador del estudiante', icon: ShieldCheck }, { label: 'Periodos académicos', icon: CalendarDays }, { label: 'Importar estudiantes', icon: Download }, { label: 'Respaldos', icon: Download }, { label: 'Reportes', icon: FileText }, { label: 'Bitácora', icon: History }, { label: 'Control documental', icon: FileText }] },
]

const roles = [
  { value: 'rectoria', label: 'Rectoría' }, { value: 'coordinacion', label: 'Coordinación' },
  { value: 'secretaria', label: 'Secretaría' }, { value: 'docente', label: 'Docente' },
  { value: 'orientacion', label: 'Orientación' }, { value: 'tesoreria', label: 'Tesorería' },
  { value: 'acudiente', label: 'Acudiente' }, { value: 'estudiante', label: 'Estudiante' },
  { value: 'admin', label: 'Administrador' },
]
const commonSubjects = [
  'Matemáticas', 'Lengua Castellana', 'Lectura Crítica', 'Ciencias Naturales', 'Biología', 'Física', 'Química',
  'Ciencias Sociales', 'Historia', 'Geografía', 'Inglés', 'Educación Física', 'Educación Artística', 'Música',
  'Tecnología e Informática', 'Ética y Valores', 'Educación Religiosa', 'Filosofía', 'Cátedra de Paz',
  'Competencias Ciudadanas', 'Emprendimiento', 'Economía y Política', 'Geometría', 'Estadística',
]

const auditActionName = action => ({
  initial_setup: 'Configuración inicial del colegio', institution_created: 'Creación de institución', institution_branding_updated: 'Personalización de institución', institution_suspended: 'Suspensión de institución', institution_reactivated: 'Reactivación de institución', institution_archived: 'Archivo de institución', institution_restored: 'Restauración de institución', login: 'Inicio de sesión', password_changed: 'Cambio de contraseña',
  communication_created: 'Publicación de comunicación', communication_deleted: 'Eliminación de comunicación',
  school_branding_updated: 'Actualización de datos del colegio', user_created: 'Creación de cuenta', user_updated: 'Actualización de cuenta',
  user_deleted: 'Eliminación de cuenta', user_activated: 'Activación de cuenta', user_deactivated: 'Desactivación de cuenta',
  course_created: 'Creación de curso', course_updated: 'Actualización de curso', course_archived: 'Archivo de curso',
  course_reactivated: 'Reactivación de curso', teacher_assigned: 'Asignación de docente', teacher_assignment_updated: 'Cambio de asignación docente',
  teacher_assignment_deleted: 'Eliminación de asignación docente', attendance_saved: 'Registro de asistencia', grade_assessment_created: 'Creación de evaluación',
  grade_assessment_deleted: 'Eliminación de evaluación', online_assessment_published: 'Publicación de evaluación en línea',
  online_assessment_unpublished: 'Retiro de evaluación en línea', grade_assessment_weight_updated: 'Cambio de ponderación',
  academic_grade_rule_saved: 'Actualización de escala académica', grade_records_saved: 'Registro de calificaciones',
  grade_period_published: 'Publicación de boletines', grade_period_unpublished: 'Retiro de boletines', report_card_viewed: 'Consulta de boletín',
  online_assessment_started: 'Inicio de evaluación en línea', online_assessment_submitted: 'Envío de evaluación en línea',
  work_submitted: 'Entrega de trabajo', work_submission_deleted: 'Eliminación de entregas', enrollment_request_created: 'Solicitud de matrícula creada',
  enrollment_request_updated: 'Actualización de solicitud de matrícula', enrollment_approved: 'Matrícula aprobada',
  student_transferred: 'Traslado de estudiante', student_created: 'Creación de estudiante', student_updated: 'Actualización de estudiante',
  student_deleted: 'Eliminación de estudiante', student_access_suspended: 'Suspensión de acceso estudiantil', student_access_reactivated: 'Reactivación de acceso estudiantil', student_payment_created: 'Registro de cobro estudiantil', student_payment_updated: 'Actualización de pago estudiantil',
}[String(action || '').split(':')[0]] || String(action || '').split(':')[0].replaceAll('_', ' '))
const auditDateLabel = value => {
  const raw = String(value || '')
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  let iso = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized) ? normalized : `${normalized}Z`
  if (/[+-]\d{2}$/.test(iso)) iso += ':00'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('es-CO')
}
const roleName = value => roles.find(role => role.value === value)?.label || value
const institutionManagerEmail = 'smiranda15@uan.edu.co'
const schoolOption = school => ({ ...school, initials: school.name.slice(0, 1).toLocaleUpperCase('es'), color: 'school-lilac', city: `Código: ${school.slug}`, logoUrl: school.hasLogo ? `/api/schools/${school.slug}/logo` : '' })
function SchoolMark({ school }) {
  return <span className="school-option-avatar" style={{ background: school.primaryColor || '#edecfc', color: school.primaryColor ? '#fff' : '#7475ce' }}>{school.logoUrl ? <img src={school.logoUrl} alt=""/> : school.initials}</span>
}
function InstitutionChooser({ schools, search, setSearch, onSelect }) {
  const matches = schools.filter(school => `${school.name} ${school.slug}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))
  return <div className="institution-entry-page institution-chooser-page"><header className="institution-entry-top"><a className="institution-entry-brand" href="#inicio"><span className="institution-entry-brand-mark"><GraduationCap size={21}/></span><strong>educa<span>.</span></strong></a><nav className="institution-marketing-nav" aria-label="Navegación principal"><a href="#plataforma">Plataforma</a><a href="#beneficios">Beneficios</a><a href="#comunidad">Comunidad</a><a className="institution-download-link" href="/educa-android.apk" download="EDUCA-Gestion-Escolar-Android.apk"><Smartphone size={15}/> Descargar APK</a><a className="institution-nav-access" href="#acceso">Acceso a mi institución <ArrowRight size={15}/></a></nav></header><main className="institution-marketing-main" id="inicio"><section className="institution-marketing-hero" id="plataforma"><div className="institution-marketing-copy"><span className="institution-entry-eyebrow"><span className="live-dot"/> GESTIÓN ESCOLAR EN UN SOLO LUGAR</span><h1>Una comunidad escolar mejor conectada.</h1><p>Organiza la vida académica y administrativa de tu colegio, y acompaña el progreso de cada estudiante desde un solo espacio.</p><div className="institution-marketing-actions"><a className="institution-nav-access" href="#acceso">Acceder a mi institución <ArrowRight size={16}/></a><a className="institution-marketing-secondary" href="#beneficios">Conoce la plataforma <ChevronDown size={15}/></a><a className="institution-marketing-secondary institution-hero-download" href="/educa-android.apk" download="EDUCA-Gestion-Escolar-Android.apk"><Smartphone size={15}/> Descargar APK</a></div><div className="institution-marketing-assurance"><ShieldCheck size={16}/> Acceso por institución y perfil autorizado</div></div><div className="institution-product-visual" aria-label="Vista ilustrativa de gestión escolar"><div className="institution-product-window"><div className="institution-product-window-top"><span/><span/><span/><small>Panel escolar</small></div><div className="institution-product-window-body"><aside><span className="institution-product-brandmark"><GraduationCap size={18}/></span><i/><i/><i/><i/></aside><div className="institution-product-dashboard"><small>RESUMEN INSTITUCIONAL</small><strong>Todo en orden</strong><div className="institution-product-stat-row"><span/><span/><span/></div><div className="institution-product-chart"><div/><div/><div/><div/><div/><div/><div/></div><div className="institution-product-lower"><span/><span/></div></div></div></div><div className="institution-product-float institution-product-float-a"><BookOpen size={17}/><span><b>Gestión académica</b><small>Cursos y evaluaciones</small></span></div><div className="institution-product-float institution-product-float-b"><CalendarDays size={17}/><span><b>Vida escolar</b><small>Asistencia y actividades</small></span></div></div></section><section className="institution-marketing-benefits" id="beneficios"><div className="institution-marketing-section-heading"><span className="institution-entry-eyebrow">UNA PLATAFORMA, DISTINTOS PERFILES</span><h2>Herramientas para el día a día escolar</h2><p>La información y las acciones que necesita cada integrante de la comunidad educativa.</p></div><div className="institution-marketing-feature-grid"><article><span><BookOpen size={20}/></span><h3>Seguimiento académico</h3><p>Cursos, tareas, evaluaciones, calificaciones y boletines en un mismo espacio.</p></article><article><span><CalendarDays size={20}/></span><h3>Organización escolar</h3><p>Asistencia, horarios, matrículas, actividades y eventos del colegio.</p></article><article><span><Users size={20}/></span><h3>Comunidad conectada</h3><p>Comunicaciones e información disponible según los permisos de cada perfil.</p></article></div></section><section className="institution-access-section" id="acceso"><div className="institution-access-heading"><div><span className="institution-entry-eyebrow"><span className="live-dot"/> ACCESO A EDUCA</span><h2>Elige tu institución</h2><p>Selecciona el plantel educativo al que quieres ingresar.</p></div><label className="institution-chooser-search"><Search size={18}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre del colegio" aria-label="Buscar institución"/></label></div>{matches.length ? <div className="institution-chooser-grid">{matches.map(school => <button type="button" className="institution-chooser-card" key={school.id} onClick={() => onSelect(school)} style={{ '--institution-accent': school.primaryColor || '#286887' }}><SchoolMark school={school}/><span className="institution-chooser-card-copy"><strong>{school.name}</strong><small>Institución educativa</small></span><span className="institution-chooser-card-action"><ArrowRight size={17}/></span></button>)}</div> : <div className="institution-chooser-empty"><Building2 size={24}/><strong>{schools.length ? 'No encontramos ese plantel' : 'No hay instituciones disponibles'}</strong><span>{schools.length ? 'Prueba con otra búsqueda.' : 'Pide al administrador de EDUCA que registre tu institución.'}</span></div>}<div className="institution-chooser-security"><ShieldCheck size={16}/> Tus datos se mantienen separados por institución.</div></section><section className="institution-community-strip" id="comunidad"><span className="institution-community-icon"><ShieldCheck size={20}/></span><div><strong>Un espacio para toda la comunidad educativa</strong><p>Estudiantes, acudientes, docentes y equipos directivos ingresan con las autorizaciones de su institución.</p></div><a href="#acceso">Encontrar mi colegio <ArrowRight size={15}/></a></section></main><footer className="institution-entry-footer"><span>© 2026 Educa · Gestión escolar</span><span>Plataforma para la comunidad educativa</span><nav className="legal-footer-links" aria-label="Información legal"><a href="/privacidad">Privacidad</a><a href="/terminos">Términos de uso</a></nav><a className="institution-download-link institution-footer-download" href="/educa-android.apk" download="EDUCA-Gestion-Escolar-Android.apk"><Smartphone size={14}/> Descargar app Android</a></footer></div>
}
function InstitutionHome({ school, onEnter, onChange }) {
  const accentStyle = { '--institution-accent': school.primaryColor || '#286887' }
  return <div className="institution-entry-page institution-home-page" style={accentStyle}><header className="institution-home-header"><a className="institution-home-identity" href="#inicio"><span className="institution-home-logo">{school.logoUrl ? <img src={school.logoUrl} alt={`Logo de ${school.name}`}/> : <span>{school.initials}</span>}</span><strong>{school.name}</strong></a><div className="institution-home-contact">{school.contactEmail && <a href={`mailto:${school.contactEmail}`}><small>Correo institucional</small><span>{school.contactEmail}</span></a>}{school.contactPhone && <a href={`tel:${school.contactPhone.replace(/[^+\d]/g, '')}`}><small>Teléfono</small><span>{school.contactPhone}</span></a>}{school.address && <div><small>Dirección</small><span>{school.address}</span></div>}</div><button type="button" className="institution-mobile-enter" onClick={onEnter}><LockKeyhole size={16}/> Ingresar</button></header><nav className="institution-home-nav" aria-label="Navegación institucional"><a className="institution-nav-current" href="#inicio">Inicio</a><a href="#institucion">Quiénes somos</a><a href="#novedades">Noticias</a><a href="#contacto">Contáctanos</a><button type="button" onClick={onEnter}>Ingresar a EDUCA <ArrowRight size={15}/></button></nav><main><section className="institution-home-hero" id="inicio"><div className="institution-hero-copy"><span className="institution-entry-eyebrow"><span className="live-dot"/> COMUNIDAD EDUCATIVA</span><p className="institution-hero-kicker">Bienvenidos a</p><h1>{school.name}</h1><p className="institution-hero-description">Consulta el espacio digital de tu institución para acompañar la vida académica, la comunicación escolar y el progreso de cada estudiante.</p><div className="institution-hero-actions"><button type="button" className="institution-enter-button" onClick={onEnter}>Ingresar a la plataforma <ArrowRight size={17}/></button><button type="button" className="institution-change-button" onClick={onChange}>Elegir otro plantel</button></div><div className="institution-hero-access"><ShieldCheck size={16}/> Acceso seguro para personal, estudiantes y acudientes autorizados</div></div><div className="institution-hero-art" aria-hidden="true"><div className="institution-art-orbit institution-art-orbit-a"/><div className="institution-art-orbit institution-art-orbit-b"/><div className="institution-art-schoolmark">{school.logoUrl ? <img src={school.logoUrl} alt=""/> : <GraduationCap size={72}/>}</div><span className="institution-art-chip"><BookOpen size={16}/> Aprendizaje</span><span className="institution-art-dot institution-art-dot-a"/><span className="institution-art-dot institution-art-dot-b"/><span className="institution-art-star">✦</span></div></section><section className="institution-home-features" id="institucion"><article><span><BookOpen size={19}/></span><div><strong>Gestión académica</strong><p>Cursos, evaluaciones, trabajos y boletines en el espacio del colegio.</p></div></article><article><span><CalendarDays size={19}/></span><div><strong>Vida escolar</strong><p>Consulta asistencia, actividades y comunicaciones institucionales.</p></div></article><article><span><Users size={19}/></span><div><strong>Comunidad conectada</strong><p>Acceso según el rol y las autorizaciones de cada cuenta.</p></div></article></section><section className="institution-home-info" id="novedades"><div><span className="institution-entry-eyebrow">INFORMACIÓN INSTITUCIONAL</span><h2>Todo lo que necesitas, en un solo lugar</h2><p>Inicia sesión para consultar las novedades, actividades y comunicaciones publicadas por tu institución.</p></div><button type="button" className="institution-outline-button" onClick={onEnter}>Continuar al ingreso <ArrowRight size={15}/></button></section></main><footer className="institution-home-footer" id="contacto"><div><strong>{school.name}</strong><span>Una comunidad educativa conectada con Educa.</span></div><div className="institution-footer-contact">{school.contactEmail && <a href={`mailto:${school.contactEmail}`}>{school.contactEmail}</a>}{school.contactPhone && <a href={`tel:${school.contactPhone.replace(/[^+\d]/g, '')}`}>{school.contactPhone}</a>}{school.address && <span>{school.address}</span>}</div><button type="button" onClick={onChange}>Cambiar institución</button></footer></div>
}
const getLocalDate = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10) }

function SetupForm({ onComplete }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    const { setupKey, ...payload } = values
    try {
      const response = await fetch('/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Setup-Key': setupKey }, body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) setError(result.error || 'No se pudo completar la configuración.')
      else onComplete()
    } catch { setError('No se pudo conectar con la API. Revisa que esté en ejecución.') }
    finally { setBusy(false) }
  }
  return <form className="login-form setup-form" onSubmit={submit}><div className="login-message login-info">Solo se muestra mientras no haya usuarios. La clave de configuración se guarda en el servidor, no en la base de datos.</div><label className="login-label" htmlFor="setup-school">Nombre del colegio</label><div className="login-input-wrap"><GraduationCap size={16}/><input id="setup-school" name="schoolName" required minLength="2" maxLength="120" placeholder="Nombre de la institución"/></div><label className="login-label" htmlFor="setup-admin">Nombre de quien administra</label><div className="login-input-wrap"><Users size={16}/><input id="setup-admin" name="adminName" required minLength="2" maxLength="100" placeholder="Nombre completo"/></div><label className="login-label" htmlFor="setup-email">Correo administrador</label><div className="login-input-wrap"><Users size={16}/><input id="setup-email" name="email" type="email" required maxLength="254" placeholder="admin@colegio.edu.co" autoComplete="email"/></div><label className="login-label" htmlFor="setup-password">Contraseña inicial <span className="optional-label">12 CARACTERES MÍNIMO</span></label><div className="login-input-wrap"><LockKeyhole size={16}/><input id="setup-password" name="password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" placeholder="Crea una contraseña segura"/></div><label className="login-label" htmlFor="setup-key">Clave de configuración del servidor</label><div className="login-input-wrap"><ShieldCheck size={16}/><input id="setup-key" name="setupKey" type="password" required autoComplete="off" placeholder="Clave EDUCA_SETUP_KEY"/></div>{error && <div className="login-message login-error" role="alert">{error}</div>}<button type="submit" className="login-submit" disabled={busy}>{busy ? 'Configurando…' : 'Crear colegio y administrador'} <ArrowRight size={16}/></button></form>
}

function OnlineQuestionEditor({ questions, onChange }) {
  const updateQuestion = (index, patch) => onChange(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  return <div className="online-question-editor"><div className="online-question-heading"><strong>Preguntas de selección única</strong><span>Se califican automáticamente.</span></div>{questions.map((question, index) => <fieldset className="online-question-card" key={question.key}><legend>Pregunta {index + 1}</legend><label>Enunciado<textarea rows="2" maxLength="500" required value={question.prompt} onChange={event => updateQuestion(index, { prompt: event.target.value })} placeholder="Escribe la pregunta"/></label><div className="online-options-grid">{question.options.map((option, optionIndex) => <label className="online-option-editor" key={optionIndex}><input type="radio" name={`correct-${question.key}`} aria-label={`Marcar opción ${optionIndex + 1} como correcta`} checked={question.correctOption === optionIndex} onChange={() => updateQuestion(index, { correctOption: optionIndex })}/><input required maxLength="120" value={option} onChange={event => updateQuestion(index, { options: question.options.map((value, current) => current === optionIndex ? event.target.value : value) })} placeholder={`Opción ${optionIndex + 1}`}/></label>)}</div><div className="online-question-footer"><label>Puntos<input type="number" min="0.01" max="1000" step="any" required value={question.points} onChange={event => updateQuestion(index, { points: event.target.value })}/></label>{questions.length > 1 && <button type="button" className="button button-soft" onClick={() => onChange(items => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14}/> Quitar</button>}</div></fieldset>)}{questions.length < 50 && <button type="button" className="button button-soft" onClick={() => onChange(items => [...items, { key: crypto.randomUUID(), prompt: '', options: ['', '', '', ''], correctOption: 0, points: '1' }])}><Plus size={15}/> Agregar pregunta</button>}</div>
}

function CalendarModule({ user, notify }) {
  const [month, setMonth] = useState(`${getLocalDate().slice(0, 7)}-01`)
  const [selectedDate, setSelectedDate] = useState(getLocalDate())
  const [events, setEvents] = useState([])
  const [courses, setCourses] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newEventType, setNewEventType] = useState('Evento')
  const canCreate = ['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'].includes(user?.role)
  const [year, monthIndex] = month.slice(0, 7).split('-').map(Number)
  const daysInMonth = new Date(year, monthIndex, 0).getDate()
  const offset = (new Date(year, monthIndex - 1, 1).getDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  const monthEvents = events.filter(event => event.eventDate.startsWith(month.slice(0, 7)))
  const selectedEvents = monthEvents.filter(event => event.eventDate === selectedDate)
  const load = async () => {
    const first = `${month.slice(0, 7)}-01`
    const lastDate = new Date(year, monthIndex, 0)
    const last = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`
    try {
      const response = await fetch(`/api/calendar?from=${first}&to=${last}`, { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar el calendario.')
      setEvents(result.events || []); setError('')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setLoading(false) }
  }
  useEffect(() => { setLoading(true); load() }, [month])
  useEffect(() => { fetch('/api/calendar/options', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { courses: [] }).then(result => setCourses(result.courses || [])).catch(() => setCourses([])) }, [])
  const save = async event => {
    event.preventDefault(); setBusy(true); setError('')
    const formElement = event.currentTarget; const form = new FormData(formElement)
    const payload = Object.fromEntries(form.entries())
    payload.courseId = payload.courseId || null
    payload.registrationCapacity = payload.registrationCapacity || null
    payload.registrationDeadline = payload.registrationDeadline || null
    payload.registrationOpen = form.has('registrationOpen')
    try {
      const response = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el evento.')
      await load()
      const internalCount = Number(result.notified || 0)
      const pushCount = Number(result.pushNotified || 0)
      let confirmation = `Evento creado. Aviso en EDUCA para ${internalCount} persona${internalCount === 1 ? '' : 's'}. `
      if (!result.pushConfigured) confirmation += 'Las notificaciones a teléfonos aún no están configuradas en el servidor.'
      else if (result.pushFailed) confirmation += 'No se pudo entregar el aviso push; revisa la configuración de Firebase en el servidor.'
      else if (!result.pushRegistered) confirmation += 'Ningún destinatario tiene un teléfono registrado: abre la APK, inicia sesión y permite las notificaciones.'
      else confirmation += `Notificación enviada a ${pushCount} teléfono${pushCount === 1 ? '' : 's'}${pushCount < result.pushRegistered ? ` (${result.pushRegistered - pushCount} sin entrega)` : ''}.`
      notify(confirmation); formElement.reset(); setNewEventType('Evento')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setBusy(false) }
  }
  const remove = async item => {
    if (!window.confirm(`¿Eliminar «${item.title}» del calendario?`)) return
    const response = await fetch(`/api/calendar/${item.id}`, { method: 'DELETE', credentials: 'same-origin' })
    const result = await response.json()
    if (!response.ok) return setError(result.error || 'No se pudo eliminar el evento.')
    await load(); notify('Evento eliminado.')
  }
  const shiftMonth = amount => {
    const next = new Date(year, monthIndex - 1 + amount, 1)
    const value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
    setMonth(value); setSelectedDate(value)
  }
  return <section className="students-page calendar-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> VIDA ESCOLAR</div><h1>Calendario escolar</h1><p className="welcome-sub">Eventos y fechas importantes de tu colegio.</p></div></div>{error && <div className="login-message login-error" role="alert">{error}</div>}<div className="calendar-layout"><article className="panel calendar-month-panel"><div className="calendar-month-heading"><button className="button button-soft" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">‹</button><h2>{new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex - 1, 1))}</h2><button className="button button-soft" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">›</button></div><div className="calendar-grid calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => { const date = day ? `${month.slice(0, 7)}-${String(day).padStart(2, '0')}` : ''; const count = monthEvents.filter(item => item.eventDate === date).length; return <button type="button" key={`${date || 'blank'}-${index}`} className={`calendar-day ${date === selectedDate ? 'calendar-day-selected' : ''} ${date === getLocalDate() ? 'calendar-day-today' : ''}`} disabled={!day} onClick={() => setSelectedDate(date)}>{day && <><span>{day}</span>{count > 0 && <i aria-label={`${count} eventos`}>{count}</i>}</>}</button> })}</div><div className="calendar-legend"><span><i/> Hoy</span><span><b/> Día con eventos</span></div></article><div className="calendar-agenda"><article className="panel"><div className="panel-heading"><div><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>{selectedEvents.length} evento{selectedEvents.length === 1 ? '' : 's'}</p></div><CalendarDays size={19}/></div>{loading ? <div className="students-empty">Cargando calendario…</div> : selectedEvents.length ? <div className="calendar-event-list">{selectedEvents.map(item => <article className="calendar-event-card" key={item.id}><span className="calendar-event-type">{item.eventType}</span><strong>{item.title}</strong><p>{item.startTime || 'Todo el día'}{item.endTime ? `–${item.endTime}` : ''} · {item.courseName ? `${item.grade} · ${item.courseName}` : 'Todo el colegio'}</p>{item.details && <p>{item.details}</p>}{(user?.role === 'admin' || item.createdBy === user?.id) && <button className="account-toggle danger-action" onClick={() => remove(item)}><Trash2 size={14}/> Eliminar</button>}</article>)}</div> : <div className="calendar-empty"><CalendarDays size={22}/><strong>No hay eventos este día</strong><span>Elige otra fecha o crea un evento escolar.</span></div>}</article></div></div>{canCreate && <details className="calendar-create"><summary><Plus size={16}/> Crear evento</summary><form className="calendar-form" onSubmit={save}><label>Título<input name="title" required minLength="2" maxLength="120" placeholder="Ej. Reunión de familias"/></label><label>Tipo<select name="eventType" value={newEventType} onChange={event => setNewEventType(event.target.value)}>{['Evento','Actividad','Reunión','Evaluación','Entrega','Festivo','Institucional'].map(type => <option key={type}>{type}</option>)}</select></label><label>Fecha<input name="eventDate" type="date" required value={selectedDate} onChange={event => setSelectedDate(event.target.value)}/></label><label>Inicio<input name="startTime" type="time"/></label><label>Fin<input name="endTime" type="time"/></label>{courses.length > 0 && <label>Curso<select name="courseId">{user?.role !== 'docente' && <option value="">Todo el colegio</option>}{courses.map(course => <option key={course.id} value={course.id}>{course.grade} · {course.name} · {course.academicYear}</option>)}</select></label>}{newEventType === 'Actividad' && <><label>Cupo máximo<input name="registrationCapacity" type="number" min="1" max="10000" placeholder="Sin límite"/></label><label>Inscripciones hasta<input name="registrationDeadline" type="date" max={selectedDate}/></label><label className="online-publish-check"><input name="registrationOpen" type="checkbox" defaultChecked/> Abrir inscripciones</label></>}<label className="calendar-form-wide">Descripción<textarea name="details" rows="3" maxLength="1500" placeholder="Información para las personas notificadas"/></label><div className="calendar-form-wide"><span className="field-hint">Al guardar, EDUCA crea notificaciones internas para las cuentas vinculadas. No se envían mensajes externos.</span><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : <><Check size={15}/> Guardar evento</>}</button></div></form></details>}</section>
}

function NotificationsModule({ notify }) {
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const load = async () => { try { const response = await fetch('/api/notifications', { credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las notificaciones.'); setItems(result.notifications || []) } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') } finally { setLoading(false) } }
  useEffect(() => {
    load()
    const onNotificationUpdate = () => load()
    window.addEventListener('educa:notifications-updated', onNotificationUpdate)
    const timer = window.setInterval(load, 30000)
    return () => { window.removeEventListener('educa:notifications-updated', onNotificationUpdate); window.clearInterval(timer) }
  }, [])
  const markRead = async item => { const response = await fetch(`/api/notifications/${item.id}/read`, { method: 'PATCH', credentials: 'same-origin' }); if (response.ok) setItems(rows => rows.map(row => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)) }
  const markAll = async () => { const response = await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'same-origin' }); if (response.ok) { setItems(rows => rows.map(row => ({ ...row, readAt: row.readAt || new Date().toISOString() }))); notify('Notificaciones marcadas como leídas.') } }
  return <section className="students-page notifications-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CENTRO DE AVISOS</div><h1>Notificaciones</h1><p className="welcome-sub">Avisos internos de eventos escolares y solicitudes.</p></div><button className="button button-soft" disabled={!items.some(item => !item.readAt)} onClick={markAll}>Marcar todas como leídas</button></div>{error && <div className="login-message login-error" role="alert">{error}</div>}{loading ? <div className="students-empty">Cargando notificaciones…</div> : items.length ? <div className="notification-list">{items.map(item => <article className={`notification-card ${item.readAt ? 'notification-card-read' : ''}`} key={item.id}><span className="notification-icon"><Bell size={17}/></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString('es-CO')}</small></div>{!item.readAt && <button className="button button-soft" onClick={() => markRead(item)}>Marcar leída</button>}</article>)}</div> : <div className="students-empty"><Bell size={22}/><strong>No tienes notificaciones</strong><p>Los avisos internos del colegio aparecerán aquí.</p></div>}</section>
}

function ActivitiesModule({ user, notify, onGoCalendar }) {
  const [activities, setActivities] = useState([]), [students, setStudents] = useState([]), [selectedStudent, setSelectedStudent] = useState('')
  const [registrations, setRegistrations] = useState({}), [expanded, setExpanded] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState('')
  const family = ['estudiante', 'acudiente'].includes(user?.role)
  const canManage = ['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'].includes(user?.role)
  const load = async () => { const response = await fetch('/api/activities', { credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las actividades.'); setActivities(result.activities || []); setStudents(result.students || []); if (!selectedStudent && result.students?.length) setSelectedStudent(result.students[0].id) }
  useEffect(() => { load().catch(err => setError(err.message)) }, [])
  const register = async activity => {
    if (!selectedStudent) return setError('No hay estudiantes vinculados a esta cuenta.')
    setBusy(activity.id); setError('')
    try { const response = await fetch(`/api/activities/${activity.id}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ studentId: selectedStudent }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo completar la inscripción.'); await load(); notify('Inscripción registrada.') }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }
  const cancel = async (activity, studentId) => {
    if (!window.confirm('¿Cancelar esta inscripción?')) return
    const response = await fetch(`/api/activities/${activity.id}/registrations/${studentId}`, { method: 'DELETE', credentials: 'same-origin' }), result = await response.json()
    if (!response.ok) return setError(result.error || 'No se pudo cancelar la inscripción.')
    await load(); notify('Inscripción cancelada.')
  }
  const showRegistrations = async activity => {
    if (expanded === activity.id) { setExpanded(''); return }
    setBusy(activity.id); setError('')
    try { const response = await fetch(`/api/activities/${activity.id}/registrations`, { credentials: 'same-origin' }), result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo cargar la lista.'); setRegistrations(current => ({ ...current, [activity.id]: result.registrations || [] })); setExpanded(activity.id) }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }
  return <section className="students-page activities-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> VIDA ESCOLAR</div><h1>Actividades y eventos</h1><p className="welcome-sub">Consulta actividades, fechas, cupos e inscripciones.</p></div>{canManage && <button className="button button-primary" onClick={onGoCalendar}><CalendarPlus size={16}/> Crear actividad</button>}</div>{error && <div className="login-message login-error" role="alert">{error}</div>}{family && students.length > 0 && <label className="student-filter activity-student-picker">Estudiante<select value={selectedStudent} onChange={event => setSelectedStudent(event.target.value)}>{students.map(item => <option key={item.id} value={item.id}>{item.name} · {item.grade}</option>)}</select></label>}<div className="activity-grid">{activities.map(activity => {
    const mine = (activity.registrations || []).find(item => item.studentId === selectedStudent && item.status === 'Inscrito')
    const full = activity.capacity != null && activity.registrationCount >= Number(activity.capacity)
    return <article className="panel activity-card" key={activity.id}><div className="activity-card-head"><span className="stat-icon violet"><PartyPopper size={18}/></span><span className="role-chip">{activity.eventDate ? new Date(`${activity.eventDate}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span></div><h2>{activity.title}</h2><p>{activity.courseName ? `${activity.grade} · ${activity.courseName}` : 'Actividad institucional'}{activity.startTime ? ` · ${activity.startTime}` : ''}</p>{activity.details && <p className="activity-details">{activity.details}</p>}<div className="activity-capacity"><Users size={15}/><span>{activity.registrationCount}{activity.capacity ? ` de ${activity.capacity} cupos` : ' inscritos'}</span>{activity.registrationDeadline && <small>Inscripción hasta {new Date(`${activity.registrationDeadline}T12:00:00`).toLocaleDateString('es-CO')}</small>}</div>{family && <div className="activity-actions">{mine ? <><span className="student-status status-active">Inscrito</span><button className="account-toggle danger-action" onClick={() => cancel(activity, selectedStudent)}>Cancelar inscripción</button></> : <button className="button button-primary" disabled={!activity.registrationOpen || full || !selectedStudent || busy === activity.id} onClick={() => register(activity)}>{busy === activity.id ? 'Guardando…' : full ? 'Sin cupos' : activity.registrationOpen ? 'Inscribir estudiante' : 'Inscripciones cerradas'}</button>}</div>}{canManage && (user?.role !== 'docente' || activity.courseId) && <button className="account-toggle" onClick={() => showRegistrations(activity)}>{expanded === activity.id ? 'Ocultar inscripciones' : 'Ver inscripciones'} <span>({activity.registrationCount})</span></button>}{expanded === activity.id && <div className="activity-roster">{(registrations[activity.id] || []).map(row => <div key={row.id}><strong>{row.studentName}</strong><span>{row.grade} · {row.status}</span>{['admin','rectoria','coordinacion','secretaria'].includes(user?.role) && row.status === 'Inscrito' && <button className="account-toggle danger-action" onClick={() => cancel(activity, row.studentId)}>Cancelar</button>}</div>)}{!registrations[activity.id]?.length && <small>No hay estudiantes inscritos.</small>}</div>}</article>
  })}{!activities.length && <div className="students-empty"><span className="empty-icon"><PartyPopper size={22}/></span><strong>No hay actividades publicadas</strong><p>Las actividades habilitadas aparecerán aquí.</p>{canManage && <button className="button button-primary" onClick={onGoCalendar}>Crear la primera actividad</button>}</div>}</div></section>
}

function DigitalCardModule({ notify }) {
  const [cards, setCards] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/portal/digital-card', { credentials: 'same-origin' }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo cargar el carné.'); setCards(result.cards || []) }).catch(err => setError(err.message)).finally(() => setLoading(false)) }, [])
  return <section className="students-page digital-card-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> IDENTIFICACIÓN ESCOLAR</div><h1>Carné digital</h1><p className="welcome-sub">Identificación privada para el estudiante y su acudiente.</p></div><button className="button button-primary" onClick={() => { window.print(); notify('Abre el diálogo de impresión y selecciona Guardar como PDF si lo deseas.') }} disabled={!cards.length}><Printer size={16}/> Imprimir / guardar PDF</button></div><div className="students-scope"><ShieldCheck size={14}/> El QR contiene un código opaco de identificación, sin datos personales. La foto solo se muestra si el colegio la registró.</div>{error && <div className="login-message login-error" role="alert">{error}</div>}{loading ? <div className="students-empty">Cargando carné…</div> : <div className="digital-card-grid">{cards.map(card => <article className="digital-card" key={card.id} style={{ '--card-accent': card.primaryColor || '#6c70df' }}><div className="digital-card-brand"><span className="digital-card-logo"><GraduationCap size={20}/></span><strong>{card.schoolName}</strong></div><div className="digital-card-body"><div className="digital-card-avatar">{card.hasPhoto ? <img src={`/api/portal/digital-card/${card.id}/photo`} alt={`Foto de ${card.studentName}`} onError={event => { event.currentTarget.hidden = true }}/> : card.studentName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</div><div><span className="eyebrow">ESTUDIANTE</span><h2>{card.studentName}</h2><p>{card.grade}{card.academicYear ? ` · Año ${card.academicYear}` : ''}</p></div><div className="digital-card-qr"><QRCodeSVG value={`EDUCA:${card.cardCode}`} size={82} level="M" title="Código privado del carné"/><small>{card.cardCode?.slice(0, 8).toUpperCase()}</small></div></div><div className="digital-card-footer"><span className={`student-status ${card.status === 'Activo' ? 'status-active' : 'status-inactive'}`}>{card.status}</span><span>{card.relationship === 'estudiante' ? 'Carné personal' : 'Cuenta de acudiente'}</span></div><small className="digital-card-note">Presenta este carné al personal autorizado del colegio.</small></article>)}</div>}{!loading && !cards.length && !error && <div className="students-empty">No hay estudiantes vinculados a esta cuenta.</div>}</section>
}

function AcademicTrajectoryModule({ students, onViewReport, allowReportAccess = true }) {
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '')
  const [records, setRecords] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const currentStudent = students.find(item => item.id === selectedStudentId)
  useEffect(() => { if (!students.some(item => item.id === selectedStudentId)) setSelectedStudentId(students[0]?.id || '') }, [students, selectedStudentId])
  useEffect(() => {
    let alive = true
    if (!selectedStudentId) { setRecords([]); return () => { alive = false } }
    setLoading(true); setError('')
    fetch(`/api/students/${selectedStudentId}/academic-history`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la trayectoria académica.')
      if (alive) setRecords(result.records || [])
    }).catch(err => { if (alive) setError(err.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [selectedStudentId])
  return <section className="students-page academic-trajectory-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> HISTORIAL ACADÉMICO</div><h1>Trayectoria académica</h1><p className="welcome-sub">Consulta los grados, cursos y boletines publicados de cada año.</p></div></div>{students.length > 1 && <label className="student-filter">Estudiante<select value={selectedStudentId} onChange={event => setSelectedStudentId(event.target.value)}>{students.map(item => <option key={item.id} value={item.id}>{item.name} · {item.grade}</option>)}</select></label>}{error && <div className="login-message login-error" role="alert">{error}</div>}{loading ? <div className="students-empty">Cargando historial académico…</div> : records.length ? <div className="academic-trajectory-list">{records.map((record,index) => <article className="panel academic-trajectory-card" key={`${record.enrollmentId || record.courseId}-${record.academicYear}-${index}`}><div className="academic-trajectory-marker"><History size={17}/></div><div className="academic-trajectory-content"><div className="academic-trajectory-heading"><div><span className="role-chip">AÑO LECTIVO {record.academicYear}</span><h2>{record.grade || 'Grado no especificado'}{record.courseName ? ` · ${record.courseName}` : ''}</h2><p>{record.status}{record.startDate ? ` · Desde ${record.startDate}` : ''}{record.endDate ? ` hasta ${record.endDate}` : ''}</p></div><span className={`student-status ${record.status === 'Activa' ? 'status-active' : ''}`}>{record.status}</span></div>{record.reportPeriods?.length ? allowReportAccess && onViewReport ? <div className="academic-trajectory-reports"><strong>Boletines publicados</strong><div>{record.reportPeriods.map(item => <button key={item.period} className="button button-soft" onClick={() => onViewReport(selectedStudentId, record, item.period)}><FileText size={14}/>{item.period}</button>)}</div></div> : <small className="history-secondary">Los boletines se consultan desde la cuenta del acudiente.</small> : <small className="history-secondary">No hay boletines publicados para este año.</small>}</div></article>)}</div> : <div className="students-empty"><span className="empty-icon"><History size={22}/></span><strong>Aún no hay historial académico disponible</strong><p>Cuando se registren las matrículas, asistencia o calificaciones, verás aquí el recorrido por año lectivo.</p></div>}{currentStudent && <div className="students-scope"><ShieldCheck size={14}/> La trayectoria consultada corresponde a {currentStudent.name}. Cada boletín solo se habilita cuando el colegio lo publica.</div>}</section>
}

function CertificatesModule({ user, notify }) {
  const [students, setStudents] = useState([]), [history, setHistory] = useState([]), [requests, setRequests] = useState([]), [studentId, setStudentId] = useState(''), [certificate, setCertificate] = useState(null), [editingRequest, setEditingRequest] = useState(null), [replacesCertificateId, setReplacesCertificateId] = useState('')
  const [academicHistory, setAcademicHistory] = useState([]), [selectedAcademicRecordKey, setSelectedAcademicRecordKey] = useState(''), [academicHistoryError, setAcademicHistoryError] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const selectedCertificateStudent = students.find(student => student.id === studentId)
  const canIssue = user?.role === 'acudiente'
  const canReview = user?.role === 'rectoria', canAnnul = ['admin', 'rectoria'].includes(user?.role)
  const load = async () => {
    const [optionResponse, historyResponse, requestResponse] = await Promise.all([fetch('/api/certificates/options', { credentials: 'same-origin' }), fetch('/api/certificates', { credentials: 'same-origin' }), fetch('/api/certificate-requests', { credentials: 'same-origin' })])
    const options = await optionResponse.json(), past = await historyResponse.json(), pending = await requestResponse.json()
    const problems = []
    if (optionResponse.ok) { setStudents(options.students || []); if (!studentId && options.students?.length) setStudentId(options.students[0].id) }
    else problems.push(`Estudiantes: ${options.error || 'no se pudieron cargar.'}`)
    if (historyResponse.ok) setHistory(past.certificates || [])
    else problems.push(`Constancias emitidas: ${past.error || 'no se pudo cargar el historial.'}`)
    if (requestResponse.ok) setRequests(pending.requests || [])
    else problems.push(`Solicitudes: ${pending.error || 'no se pudieron cargar.'}`)
    if (problems.length) throw new Error(problems.join(' '))
  }
  useEffect(() => { load().catch(err => setError(err.message)) }, [])
  useEffect(() => {
    let alive = true
    setAcademicHistoryError('')
    if (!studentId) { setAcademicHistory([]); return () => { alive = false } }
    fetch(`/api/certificates/students/${studentId}/history`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la trayectoria académica.')
      if (!alive) return
      const records = result.records || []
      setAcademicHistory(records)
      const recordKey = record => `${record.enrollmentId || ''}|${record.courseId || ''}`
      setSelectedAcademicRecordKey(current => records.some(record => recordKey(record) === current) ? current : recordKey(records.find(record => record.status === 'Activa') || records[0] || {}))
    }).catch(error => { if (alive) setAcademicHistoryError(error.message) })
    return () => { alive = false }
  }, [studentId])
  const currentYear = new Date().getFullYear()
  const fallbackAcademicRecord = selectedCertificateStudent ? { enrollmentId: null, courseId: null, academicYear: String(currentYear), grade: selectedCertificateStudent.grade, courseName: '', status: 'Registro actual' } : null
  const certificateAcademicRecords = academicHistory.length ? academicHistory : (fallbackAcademicRecord ? [fallbackAcademicRecord] : [])
  const selectedAcademicRecord = certificateAcademicRecords.find(record => `${record.enrollmentId || ''}|${record.courseId || ''}` === selectedAcademicRecordKey) || certificateAcademicRecords.find(record => record.status === 'Activa') || certificateAcademicRecords[0]
  const reprint = async id => { try { const response = await fetch(`/api/certificates/${id}`, { credentials: 'same-origin' }), result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo consultar la constancia.'); setCertificate(result.certificate) } catch (err) { setError(err.message) } }
  const issue = async event => {
    event.preventDefault(); const formElement = event.currentTarget; setBusy(true); setError(''); const form = new FormData(formElement), payload = { studentId: form.get('studentId'), certificateType: form.get('certificateType'), academicYear: selectedAcademicRecord?.academicYear, enrollmentId: selectedAcademicRecord?.enrollmentId || null, courseId: selectedAcademicRecord?.courseId || null, replacesCertificateId }
    try {
      const response = editingRequest ? await fetch(`/api/certificate-requests/${editingRequest.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) }) : await fetch('/api/certificates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo enviar la solicitud.')
      setEditingRequest(null); setReplacesCertificateId(''); await load(); formElement.reset(); notify(editingRequest ? 'Solicitud actualizada.' : 'Solicitud enviada a rectoría para aprobación.')
    }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const decide = async (item, status) => { const note = status === 'Rechazada' ? window.prompt('Motivo para rechazar la solicitud:') : ''; if (status === 'Rechazada' && !note) return; setBusy(true); try { const response = await fetch(`/api/certificate-requests/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ status, note }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo revisar.'); await load(); if (result.certificateId) await reprint(result.certificateId); notify(status === 'Aprobada' ? 'Constancia aprobada y firmada por rectoría.' : 'Solicitud rechazada.') } catch (err) { setError(err.message) } finally { setBusy(false) } }
  const cancelRequest = async item => { const administrativeDelete = canAnnul; if (!window.confirm(administrativeDelete ? '¿Eliminar esta solicitud del listado? Se conservará el registro de auditoría.' : '¿Cancelar esta solicitud pendiente?')) return; const response = await fetch(`/api/certificate-requests/${item.id}`, { method: 'DELETE', credentials: 'same-origin' }), result = await response.json(); if (!response.ok) return setError(result.error || 'No se pudo eliminar.'); await load(); notify(administrativeDelete ? 'Solicitud eliminada; se conserva en auditoría.' : 'Solicitud cancelada.') }
  const annul = async item => { const reason = window.prompt('Motivo para eliminar la constancia. Se retirará de circulación y quedará en la bitácora:'); if (!reason?.trim()) return; const response = await fetch(`/api/certificates/${item.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ reason }) }), result = await response.json(); if (!response.ok) return setError(result.error || 'No se pudo eliminar.'); await load(); notify('Constancia retirada del listado; se conserva el registro de auditoría.') }
  const editRequest = item => { setEditingRequest(item); setStudentId(item.studentId); setSelectedAcademicRecordKey(`${item.enrollmentId || ''}|${item.courseId || ''}`); setReplacesCertificateId(item.replacesCertificateId || ''); setError(''); document.querySelector('.certificate-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const requestCorrection = item => { setCertificate(null); setEditingRequest(null); setStudentId(item.studentId); setSelectedAcademicRecordKey(`${item.enrollmentId || ''}|${item.courseId || ''}`); setReplacesCertificateId(item.id); setError(''); setTimeout(() => document.querySelector('.certificate-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0) }
  return <section className="students-page certificates-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> DOCUMENTOS ESCOLARES</div><h1>Certificados y constancias</h1><p className="welcome-sub">Las constancias solo se emiten después de la aprobación de rectoría.</p></div></div><div className="students-scope"><ShieldCheck size={14}/> La firma muestra el nombre del rector que aprobó y la fecha. Para corregir una constancia vigente, se crea una nueva versión aprobada y la anterior queda reemplazada. El grado, curso y año lectivo se seleccionan desde la trayectoria registrada. Administración y rectoría pueden eliminar solicitudes y constancias del listado; la auditoría conserva el registro.</div>{error && <div className="login-message login-error" role="alert">{error}</div>}{canIssue && <form key={editingRequest?.id || `new-${replacesCertificateId}`} className="calendar-create certificate-form" onSubmit={issue}><div className="panel-heading"><h2>{editingRequest ? 'Editar solicitud pendiente' : replacesCertificateId ? 'Solicitar corrección de constancia' : 'Solicitar constancia'}</h2>{editingRequest && <button type="button" className="account-toggle" onClick={() => setEditingRequest(null)}>Cancelar edición</button>}</div><label>Estudiante<select name="studentId" value={studentId} onChange={event => setStudentId(event.target.value)} disabled={Boolean(editingRequest)} required>{students.map(student => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label>{selectedCertificateStudent && <div className={selectedCertificateStudent.documentType && selectedCertificateStudent.documentIssuedPlace ? 'students-scope' : 'login-message login-error'}><IdCard size={15}/>{selectedCertificateStudent.documentType && selectedCertificateStudent.documentIssuedPlace ? <>Identificación: {selectedCertificateStudent.documentType} No. {selectedCertificateStudent.document}, expedida en {selectedCertificateStudent.documentIssuedPlace}.</> : <>Falta completar tipo o lugar de expedición. Actualiza esos datos en Estudiantes antes de solicitar.</>}</div>}{editingRequest && <small>En una solicitud existente se conserva el estudiante; cancélala y crea otra si hace falta corregirlo.</small>}<label>Tipo de documento<select name="certificateType" defaultValue={editingRequest?.certificateType || 'Constancia de estudio'}><option>Constancia de estudio</option><option>Constancia de matrícula</option><option>Certificado académico</option></select></label><label>Grado, curso y año lectivo<select name="academicRecord" value={selectedAcademicRecordKey} onChange={event => setSelectedAcademicRecordKey(event.target.value)} required disabled={!certificateAcademicRecords.length}><option value="" disabled>Selecciona el registro académico</option>{certificateAcademicRecords.map((record,index) => { const key = `${record.enrollmentId || ''}|${record.courseId || ''}`; return <option key={`${key}-${index}`} value={key}>{record.grade || 'Grado sin especificar'}{record.courseName ? ` · ${record.courseName}` : ''} · ${record.academicYear} · ${record.status}</option> })}</select><small>Elige el grado que corresponde al año de la constancia. Se conserva aunque el estudiante avance de curso.</small></label>{academicHistoryError && <div className="login-message login-error" role="alert">{academicHistoryError}</div>}{!academicHistoryError && !academicHistory.length && selectedCertificateStudent && <small>No hay matrículas históricas guardadas; se usará el grado actual del estudiante para este año.</small>}<button className="button button-primary" disabled={busy || !students.length || !selectedCertificateStudent?.documentType || !selectedCertificateStudent?.documentIssuedPlace || !selectedAcademicRecord}>{busy ? 'Guardando…' : <><Award size={16}/> {editingRequest ? 'Guardar cambios' : 'Enviar a rectoría'}</>}</button></form>}{certificate && <article className="certificate-paper" style={{ "--document-accent": certificate.primaryColor || "#286b83" }}><div className="certificate-heading"><span className="certificate-school-logo">{certificate.hasLogo && certificate.schoolSlug ? <img src={`/api/schools/${certificate.schoolSlug}/logo`} alt={`Logo de ${certificate.schoolName}`}/> : <GraduationCap size={22}/>}</span><strong>{certificate.schoolName}</strong><small>{certificate.address}{certificate.contactPhone ? ` · ${certificate.contactPhone}` : ''}{certificate.contactEmail ? ` · ${certificate.contactEmail}` : ''}</small></div><div className="certificate-content"><p>{certificate.certificateType.toLocaleUpperCase('es')}</p><h2>{certificate.certificateType.toLocaleUpperCase('es')}</h2><p>La institución <strong>{certificate.schoolName}</strong> hace constar que <strong>{certificate.studentName}</strong>, identificado(a) con <strong>{certificate.studentDocumentType || 'Documento'} No. {certificate.studentDocumentNumber || 'No registrado'}</strong>, expedido en <strong>{certificate.studentDocumentIssuedPlace || 'Lugar no registrado'}</strong>, {certificate.academicStatusSnapshot === 'Activa' ? 'se encuentra matriculado(a)' : certificate.academicStatusSnapshot === 'Trasladada' ? 'estuvo matriculado(a) y posteriormente fue trasladado(a)' : certificate.academicStatusSnapshot === 'Retirada' ? 'estuvo matriculado(a), con retiro registrado' : 'figura en el registro académico'} en el grado <strong>{certificate.grade}</strong>{certificate.courseNameSnapshot ? <> · curso <strong>{certificate.courseNameSnapshot}</strong></> : null} durante el año lectivo <strong>{certificate.academicYear}</strong>.</p>{certificate.certificateType === 'Constancia de matrícula' && <p>El estado de matrícula registrado para este año lectivo es: <strong>{certificate.academicStatusSnapshot || 'Registro académico'}</strong>.</p>}<p>Se expide a solicitud de <strong>{certificate.requesterName || certificate.studentName}</strong>{certificate.requesterRole === 'acudiente' ? ' en calidad de acudiente' : certificate.requesterRole === 'estudiante' ? ' en calidad de estudiante' : ''}, el {new Date(certificate.signedAt || certificate.issuedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).toLocaleLowerCase('es')}.</p></div>{(certificate.signatures || []).length ? certificate.signatures.map((signer,index) => <div className="certificate-signature" key={`${signer.id}-${index}`}>{signer.signature ? <img className="document-signature-image" src={signer.signature} alt=""/> : <span>______________________________</span>}<strong>{signer.fullName}</strong><small>{signer.positionTitle}</small><small>{certificate.schoolName}</small></div>) : <div className="certificate-signature"><span>______________________________</span><strong>{certificate.rectorName}</strong><small>Rector(a) · Aprobado por rectoría</small><small>{certificate.schoolName}</small></div>}<footer className="certificate-folio">Número de control: {certificate.documentNumber || certificate.certificateNumber} · Aprobada el {new Date(certificate.signedAt || certificate.issuedAt).toLocaleDateString('es-CO')}</footer><div className="certificate-verification">{certificate.verificationCode && <QRCodeSVG value={`${window.location.origin}/validar/constancia/${certificate.verificationCode}`} size={96} level="M" title="Código de verificación de la constancia"/>}<span><strong>Verificación digital</strong><small>Escanea el código QR para confirmar la vigencia y firma de rectoría.</small></span></div><button className="button button-soft certificate-print" onClick={() => window.print()}><Printer size={16}/> Imprimir / guardar PDF</button></article>}<div className="panel certificate-history"><h2>Solicitudes de constancias</h2>{requests.length ? <div className="certificate-requests">{requests.map(item => <article className="certificate-request" key={item.id}><div><strong>{item.studentName}</strong><span>{item.certificateType} · {item.gradeSnapshot || item.grade || 'Grado sin especificar'}{item.courseNameSnapshot ? ` · ${item.courseNameSnapshot}` : ''} · {item.academicYear}</span><small>Documento: {item.documentType || 'Sin tipo registrado'} No. {item.document || '—'} · expedido en {item.documentIssuedPlace || 'lugar no registrado'}</small><small>Solicitó: {item.requestedByName} · {item.requestedByRole === 'acudiente' ? 'Acudiente' : item.requestedByRole === 'estudiante' ? 'Estudiante' : roleName(item.requestedByRole)}{item.replacesCertificateNumber ? ` · Corrige folio ${item.replacesCertificateNumber}` : ''}</small>{item.reviewNote && <small>Observación: {item.reviewNote}</small>}</div><span className={`student-status ${item.status === 'Aprobada' ? 'status-active' : item.status === 'Rechazada' ? 'status-inactive' : ''}`}>{item.status}</span><div className="table-row-actions">{canReview && item.status === 'Pendiente' && <><button className="account-toggle" disabled={busy} onClick={() => decide(item, 'Aprobada')}><Check size={14}/> Aprobar y firmar</button><button className="account-toggle danger-action" disabled={busy} onClick={() => decide(item, 'Rechazada')}>Rechazar</button></>}{item.status === 'Pendiente' && (item.requestedBy === user?.id || canAnnul) && <><button className="account-toggle" onClick={() => editRequest(item)}><Pencil size={14}/> Editar</button><button className="account-toggle danger-action" onClick={() => cancelRequest(item)}><Trash2 size={14}/> {canAnnul ? 'Eliminar' : 'Cancelar'}</button></>}{canAnnul && item.status !== 'Pendiente' && <button className="account-toggle danger-action" onClick={() => cancelRequest(item)}><Trash2 size={14}/> Eliminar</button>}</div></article>)}</div> : <p className="schedule-empty">No hay solicitudes.</p>}</div><div className="panel certificate-history"><h2>Constancias emitidas</h2>{history.length ? <div className="student-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>DOCUMENTO</th><th>AÑO</th><th>FOLIO / FIRMANTE</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{history.map(item => <tr key={item.id}><td>{item.studentName}</td><td>{item.certificateType}</td><td>{item.academicYear}</td><td>{item.status === 'Emitida' ? <button type="button" className="account-toggle" onClick={() => reprint(item.id)}>{item.documentNumber || item.certificateNumber}</button> : (item.documentNumber || item.certificateNumber)}<small className="table-cell-note">{item.rectorName || 'Sin firma registrada'}</small></td><td>{item.status}{item.status === 'Anulada' && item.annulNote ? <small className="table-cell-note">{item.annulNote}</small> : null}</td><td><div className="table-row-actions">{item.status === 'Emitida' && <><button type="button" className="account-toggle" onClick={() => requestCorrection(item)}><Pencil size={14}/> Corregir</button>{canAnnul && <button type="button" className="account-toggle danger-action" onClick={() => annul(item)}><Trash2 size={14}/> Eliminar</button>}</>}</div></td></tr>)}</tbody></table></div> : <p className="schedule-empty">Todavía no hay constancias emitidas.</p>}</div></section>
}

const staffPositionOptions = [
  ['rector', 'Rector(a)'], ['academic_coordinator', 'Coordinador(a) académico'], ['coexistence_coordinator', 'Coordinador(a) de convivencia'],
  ['teacher', 'Docente'], ['group_director', 'Director(a) de grupo'], ['academic_secretary', 'Secretario(a) académico'], ['administrative', 'Personal administrativo'], ['other', 'Otro funcionario'],
]
const staffAccountRoleDefaults = {
  admin: ['other', 'Administrador(a)'], rectoria: ['rector', 'Rector(a)'], coordinacion: ['academic_coordinator', 'Coordinador(a) académico'],
  secretaria: ['academic_secretary', 'Secretario(a) académico'], docente: ['teacher', 'Docente'], orientacion: ['other', 'Orientación escolar'], tesoreria: ['administrative', 'Tesorería'],
}
const documentRuleOptions = [
  ['report_card', 'Boletín académico', 'group_director', 'rector'], ['study_certificate', 'Constancia de estudio', 'rector', 'academic_secretary'],
  ['academic_certificate', 'Certificado académico', 'rector', 'academic_coordinator'], ['academic_report', 'Informe académico', 'group_director', 'academic_coordinator'], ['other', 'Otros documentos', 'other', ''],
]
function InstitutionalStaffModule({ notify }) {
  const [data, setData] = useState({ staff: [], courses: [], directors: [], rules: [], accounts: [] })
  const [editing, setEditing] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [directorDrafts, setDirectorDrafts] = useState({}), [ruleDrafts, setRuleDrafts] = useState({})
  const staffFormRef = useRef(null)
  const load = async () => {
    setError('')
    try { const response = await fetch('/api/institutional-staff', { credentials: 'same-origin' }), result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo cargar el personal institucional.'); setData(result); setDirectorDrafts(Object.fromEntries((result.directors || []).map(item => [item.courseId, item.staffId]))); setRuleDrafts(Object.fromEntries((result.rules || []).map(item => [item.documentType, item]))) }
    catch (err) { setError(err.message) }
  }
  useEffect(() => { load() }, [])
  const selectStaffAccount = event => {
    const form = staffFormRef.current, account = data.accounts.find(item => item.id === event.target.value)
    if (!form || !account) return
    const [positionKey, positionTitle] = staffAccountRoleDefaults[account.role] || ['other', 'Otro funcionario']
    form.elements.fullName.value = account.fullName || ''
    form.elements.email.value = account.email || ''
    form.elements.phone.value = account.phone || ''
    form.elements.positionKey.value = positionKey
    form.elements.positionTitle.value = positionTitle
  }
  const readSignature = file => new Promise((resolve, reject) => { if (!(file instanceof File) || !file.size) return resolve(null); const reader = new FileReader(); reader.onload = () => resolve({ fileName: file.name, data: reader.result }); reader.onerror = () => reject(new Error('No se pudo leer la imagen de firma.')); reader.readAsDataURL(file) })
  const saveStaff = async event => {
    event.preventDefault(); setBusy(true); setError('')
    const formElement = event.currentTarget, form = new FormData(formElement), courseIds = form.getAll('courseIds')
    try {
      const signature = await readSignature(form.get('signatureFile'))
      const body = { fullName: form.get('fullName'), nationalId: form.get('nationalId'), positionKey: form.get('positionKey'), positionTitle: form.get('positionTitle'), email: form.get('email'), phone: form.get('phone'), department: form.get('department'), userId: form.get('userId') || null, courseIds, signature, removeSignature: form.get('removeSignature') === 'on' }
      const response = await fetch(editing ? `/api/institutional-staff/${editing.id}` : '/api/institutional-staff', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }), result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el funcionario.')
      setEditing(null); formElement.reset(); await load(); notify(editing ? 'Perfil institucional actualizado.' : 'Funcionario institucional registrado.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const changeActive = async staff => {
    const active = !staff.isActive
    if (!window.confirm(`${active ? '¿Activar' : '¿Desactivar'} a ${staff.fullName}? ${!active ? 'Su firma dejará de usarse en los nuevos documentos.' : ''}`)) return
    try { const response = await fetch(`/api/institutional-staff/${staff.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ active }) }), result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo cambiar el estado.'); await load(); notify(active ? 'Funcionario activado.' : 'Funcionario desactivado.') } catch (err) { setError(err.message) }
  }
  const saveDirector = async course => {
    const staffId = directorDrafts[course.id] || ''
    try { const response = await fetch(`/api/institutional-staff/courses/${course.id}/director`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ staffId }) }), result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo asignar el director de grupo.'); await load(); notify('Director de grupo actualizado.') } catch (err) { setError(err.message) }
  }
  const saveRule = async documentType => {
    const rule = ruleDrafts[documentType] || {}, defaults = documentRuleOptions.find(item => item[0] === documentType)
    try { const response = await fetch('/api/institutional-staff/signature-rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ documentType, primaryPosition: rule.primaryPosition || defaults[2], secondaryPosition: rule.secondaryPosition ?? defaults[3], primaryStaffId: rule.primaryStaffId || null, secondaryStaffId: rule.secondaryStaffId || null }) }), result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo guardar la regla de firmas.'); await load(); notify('Configuración de firmas guardada.') } catch (err) { setError(err.message) }
  }
  const activeStaff = data.staff.filter(item => item.isActive)
  return <section className="students-page institutional-staff-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> GOBIERNO INSTITUCIONAL</div><h1>Personal Institucional y Firmas</h1><p className="welcome-sub">Administra funcionarios autorizados, directores de grupo y firmas para documentos escolares.</p></div></div><div className="students-scope"><ShieldCheck size={14}/> Solo administración y rectoría pueden modificar estos datos. Las imágenes de firma son representaciones gráficas y no equivalen a una firma electrónica o digital con validez jurídica.</div>{error && <div className="login-message login-error" role="alert">{error}</div>}
    <form ref={staffFormRef} className="calendar-create staff-profile-form" onSubmit={saveStaff} key={editing?.id || 'new-staff'}><div className="panel-heading"><div><h2>{editing ? 'Editar perfil institucional' : 'Registrar funcionario'}</h2><p>La firma debe ser PNG con fondo transparente (máximo 512 KB).</p></div>{editing && <button className="account-toggle" type="button" onClick={() => setEditing(null)}>Cancelar edición</button>}</div><div className="calendar-form"><label>Vincular cuenta existente (opcional)<select name="userId" defaultValue={editing?.userId || ''} onChange={selectStaffAccount}><option value="">Funcionario sin cuenta de acceso</option>{data.accounts.map(account => <option key={account.id} value={account.id}>{account.fullName} · {account.email} · {roleName(account.role)}</option>)}</select><small className="field-hint">Elige una cuenta creada en Usuarios y accesos. Se completan sus datos y cargo; el vínculo no concede permisos adicionales.</small></label><label>Nombres y apellidos<input name="fullName" required minLength="3" maxLength="120" defaultValue={editing?.fullName || ''}/></label><label>Número de identificación<input name="nationalId" required minLength="4" maxLength="40" defaultValue={editing?.nationalId || ''}/></label><label>Cargo institucional<select name="positionKey" defaultValue={editing?.positionKey || 'teacher'}>{staffPositionOptions.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Nombre del cargo<input name="positionTitle" required minLength="2" maxLength="80" defaultValue={editing?.positionTitle || ''} placeholder="Ej. Rectora"/></label><label>Correo<input name="email" type="email" maxLength="254" defaultValue={editing?.email || ''}/></label><label>Teléfono (opcional)<input name="phone" maxLength="40" defaultValue={editing?.phone || ''}/></label><label>Área o dependencia<input name="department" maxLength="100" defaultValue={editing?.department || ''} placeholder="Ej. Coordinación académica"/></label><label className="calendar-form-wide">Imagen de firma manuscrita para documentos (PNG)<input name="signatureFile" type="file" accept="image/png,.png"/><small className="field-hint">{editing?.hasSignature ? `Firma cargada: ${editing.signatureFileName || 'PNG'}. Si dejas el selector vacío, se conserva; elige otro PNG solo para reemplazarla.` : 'La firma es opcional al guardar el perfil. Carga una imagen PNG si deseas agregarla; no es firma electrónica con validez jurídica.'}</small>{editing?.hasSignature && <span><input type="checkbox" name="removeSignature"/> Retirar la firma del perfil</span>}</label><fieldset className="staff-course-fieldset calendar-form-wide"><legend>Cursos o grupos asignados</legend><div className="staff-course-options">{data.courses.map(course => <label key={course.id}><input type="checkbox" name="courseIds" value={course.id} defaultChecked={editing?.courses?.includes(course.id)}/><span>{course.grade} · {course.name} · {course.academicYear}</span></label>)}</div>{!data.courses.length && <small className="field-hint">Crea cursos primero en «Cursos y docentes».</small>}</fieldset><div className="calendar-form-wide"><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : <><Check size={15}/>{editing ? 'Guardar cambios' : 'Registrar funcionario'}</>}</button></div></div></form>
    <section className="panel staff-directory-panel"><div className="panel-heading"><div><h2>Funcionarios autorizados</h2><p>{data.staff.length} perfiles institucionales</p></div></div>{data.staff.length ? <div className="student-table-wrap"><table className="student-table"><thead><tr><th>FUNCIONARIO</th><th>CARGO / ÁREA</th><th>CURSOS</th><th>FIRMA</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{data.staff.map(person => <tr key={person.id}><td><strong>{person.fullName}</strong><small className="history-secondary">{person.nationalId} · {person.email || 'Sin correo'}</small></td><td>{person.positionTitle}<small className="history-secondary">{person.department || 'Sin dependencia'}</small></td><td>{person.courses.length}</td><td>{person.hasSignature ? 'PNG cargado' : 'Sin firma'}</td><td><span className={`student-status ${person.isActive ? 'status-active' : 'status-inactive'}`}>{person.isActive ? 'Activo' : 'Inactivo'}</span></td><td><div className="table-row-actions"><button className="account-toggle" onClick={() => { setEditing(person); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Pencil size={14}/> Editar</button><button className={`account-toggle ${person.isActive ? 'danger-action' : ''}`} onClick={() => changeActive(person)}>{person.isActive ? 'Desactivar' : 'Activar'}</button>{person.positionKey === 'teacher' && <button className="account-toggle" onClick={() => { setEditing(person); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{person.hasSignature ? 'Actualizar firma' : 'Subir firma'}</button>}</div></td></tr>)}</tbody></table></div> : <div className="students-empty">Registra aquí a las personas autorizadas para firmar.</div>}</section>
    <section className="panel staff-directors-panel"><div className="panel-heading"><div><h2>Directores de grupo</h2><p>La firma asignada aparecerá en los boletines del curso.</p></div></div><div className="staff-director-list">{data.courses.filter(course => course.isActive).map(course => <div key={course.id}><strong>{course.grade} · {course.name} <small>{course.academicYear}</small></strong><select value={directorDrafts[course.id] || ''} onChange={event => setDirectorDrafts(current => ({ ...current, [course.id]: event.target.value }))}><option value="">Sin director asignado</option>{activeStaff.map(person => <option key={person.id} value={person.id}>{person.fullName} · {person.positionTitle}</option>)}</select><button className="button button-soft" onClick={() => saveDirector(course)}>Guardar</button></div>)}</div>{!data.courses.length && <div className="students-empty">No hay cursos registrados.</div>}</section>
    <section className="panel staff-rules-panel"><div className="panel-heading"><div><h2>Firmas por tipo de documento</h2><p>Selecciona cargos predeterminados o firmantes concretos.</p></div></div><div className="staff-rules-list">{documentRuleOptions.map(([type,label,primaryDefault,secondaryDefault]) => { const rule = ruleDrafts[type] || {}; return <article key={type}><strong>{label}</strong><label>Firma principal<select value={rule.primaryPosition || primaryDefault} onChange={event => setRuleDrafts(current => ({ ...current, [type]: { ...(current[type] || {}), primaryPosition: event.target.value } }))}>{staffPositionOptions.map(([key,title]) => <option key={key} value={key}>{title}</option>)}</select></label><label>Funcionario<select value={rule.primaryStaffId || ''} onChange={event => setRuleDrafts(current => ({ ...current, [type]: { ...(current[type] || {}), primaryStaffId: event.target.value } }))}><option value="">Automático por cargo o curso</option>{activeStaff.map(person => <option key={person.id} value={person.id}>{person.fullName} · {person.positionTitle}</option>)}</select></label><label>Firma adicional<select value={rule.secondaryPosition ?? secondaryDefault} onChange={event => setRuleDrafts(current => ({ ...current, [type]: { ...(current[type] || {}), secondaryPosition: event.target.value } }))}><option value="">Sin firma adicional</option>{staffPositionOptions.map(([key,title]) => <option key={key} value={key}>{title}</option>)}</select></label><label>Funcionario<select value={rule.secondaryStaffId || ''} onChange={event => setRuleDrafts(current => ({ ...current, [type]: { ...(current[type] || {}), secondaryStaffId: event.target.value } }))}><option value="">Automático por cargo o curso</option>{activeStaff.map(person => <option key={person.id} value={person.id}>{person.fullName} · {person.positionTitle}</option>)}</select></label><button className="button button-primary" onClick={() => saveRule(type)}>Guardar configuración</button></article> })}</div></section>
    <p className="staff-legal-note"><ShieldCheck size={14}/> Las firmas gráficas insertadas en documentos no acreditan por sí solas la identidad del firmante ni la integridad jurídica del archivo. Para esos fines se requiere un proveedor de firma electrónica o digital certificado.</p>
  </section>
}

function PublicDocumentVerification({ documentKind, token }) {
  const [record, setRecord] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    fetch(`/api/public/verification/${documentKind}/${token}`).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.status || 'No encontramos el código de verificación.')
      if (alive) setRecord(result)
    }).catch(err => { if (alive) setError(err.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [documentKind, token])
  return <main className="public-verification-page"><header className="public-verification-top"><a href="/" className="institution-entry-brand"><span className="institution-entry-brand-mark"><GraduationCap size={21}/></span><strong>educa<span>.</span></strong></a><span>Validación de documento escolar</span></header><section className="public-verification-card">{loading ? <div className="public-verification-loading">Consultando el registro institucional…</div> : error ? <><span className="public-verification-state invalid"><X size={23}/></span><span className="institution-entry-eyebrow">VERIFICACIÓN EDUCA</span><h1>No se pudo validar</h1><p>{error}</p><a className="button button-primary" href="/">Ir a EDUCA</a></> : <><div className={`public-verification-state ${record.valid ? 'valid' : 'invalid'}`}>{record.valid ? <Check size={24}/> : <X size={24}/>}</div><span className="institution-entry-eyebrow">VERIFICACIÓN EDUCA</span><h1>{record.valid ? 'Documento auténtico' : 'Documento no vigente'}</h1><p className={`public-verification-status ${record.valid ? 'valid-text' : 'invalid-text'}`}>{record.status}</p><div className="public-verification-school">{record.hasLogo ? <img src={`/api/schools/${record.schoolSlug}/logo`} alt=""/> : <span><GraduationCap size={19}/></span>}<strong>{record.schoolName}</strong></div><dl className="public-verification-details"><div><dt>Documento</dt><dd>{record.documentKind}{record.certificateType ? ` · ${record.certificateType}` : ''}</dd></div><div><dt>Estudiante</dt><dd>{record.studentName}</dd></div>{record.grade && <div><dt>Grado</dt><dd>{record.grade}</dd></div>}{record.courseName && <div><dt>Curso</dt><dd>{record.courseName}</dd></div>}{record.academicStatusSnapshot && <div><dt>Estado del registro</dt><dd>{record.academicStatusSnapshot}</dd></div>}<div><dt>Año lectivo</dt><dd>{record.academicYear}</dd></div>{record.period && <div><dt>Periodo</dt><dd>{record.period}</dd></div>}{(record.documentNumber || record.certificateNumber) && <div><dt>Número de control</dt><dd>{record.documentNumber || record.certificateNumber}</dd></div>}{record.rectorName && <div><dt>Firmada por</dt><dd>{record.rectorName} · Rectoría</dd></div>}{record.signedAt && <div><dt>Fecha de emisión</dt><dd>{new Date(record.signedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</dd></div>}</dl><p className="public-verification-privacy"><ShieldCheck size={15}/> Esta consulta confirma el estado del documento. No muestra calificaciones ni otra información académica.</p><a className="public-verification-home" href="/">Ir a EDUCA</a></>}</section><footer className="public-verification-footer">EDUCA · Gestión escolar · Verificación documental</footer></main>
}

function ProfileAvatar({ user, small = false, revision = 0 }) {
  const initials = user?.name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es') || 'U'
  return <span className={`user-avatar ${small ? 'small' : ''}`}><span>{initials}</span><img key={revision} src={`/api/profile/photo?v=${revision}`} alt="" aria-hidden="true" onError={event => { event.currentTarget.hidden = true }}/></span>
}

function ProfileModule({ user, notify, onChangePassword, onProfileUpdated }) {
  const [profile, setProfile] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [preview, setPreview] = useState(''), [revision, setRevision] = useState(Date.now())
  useEffect(() => {
    let alive = true
    fetch('/api/profile', { credentials: 'same-origin' }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo cargar tu perfil.'); if (alive) setProfile(result.profile) }).catch(err => { if (alive) setError(err.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const submit = async event => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), file = data.get('photo')
    setBusy(true); setError('')
    try {
      const payload = { phone: data.get('phone') || '', removePhoto: data.get('removePhoto') === 'on' }
      if (file instanceof File && file.size) {
        if (file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Usa una imagen JPG, PNG o WEBP de máximo 2 MB.')
        payload.photo = { fileName: file.name, data: await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) }) }
      }
      const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo actualizar tu perfil.')
      setProfile(result.profile); setPreview(''); setRevision(Date.now()); form.elements.photo.value = ''; if (form.elements.removePhoto) form.elements.removePhoto.checked = false; onProfileUpdated(); notify('Perfil actualizado.')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setBusy(false) }
  }
  const updatePreview = event => { const file = event.target.files?.[0]; setPreview(current => { if (current) URL.revokeObjectURL(current); return file ? URL.createObjectURL(file) : '' }) }
  const image = preview || (profile?.hasPhoto ? `/api/profile/photo?v=${revision}` : '')
  return <section className="students-page profile-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CUENTA PERSONAL</div><h1>Mi perfil</h1><p className="welcome-sub">Administra tu foto y tus datos de contacto.</p></div></div>{error && <div className="login-message login-error" role="alert">{error}</div>}{loading ? <div className="students-empty">Cargando perfil…</div> : profile && <div className="profile-layout"><article className="panel profile-card"><div className="profile-avatar-large">{image ? <img src={image} alt={`Foto de perfil de ${profile.name}`} onError={event => { event.currentTarget.hidden = true }}/> : <span>{profile.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es')}</span>}</div><div className="profile-identity"><span className="role-chip">{roleName(profile.role)}</span><h2>{profile.name}</h2><p>{profile.email}</p></div><div className="profile-safety"><ShieldCheck size={17}/><span>{profile.role === 'estudiante' ? 'La foto solo se comparte con las cuentas vinculadas y aparece en tu carné digital.' : 'Tu foto es privada y se usa para identificar tu cuenta dentro del colegio.'}</span></div></article><form className="panel profile-form" onSubmit={submit}><div className="panel-heading"><div><h2>Información personal</h2><p>La cuenta de acceso y el rol los administra el colegio.</p></div></div><label>Foto de perfil<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={updatePreview}/><small>JPG, PNG o WEBP · máximo 2 MB. {profile.hasPhoto ? 'Deja el selector vacío para conservar la foto actual.' : 'Opcional; puedes agregarla cuando quieras.'}</small></label>{profile.hasPhoto && <label className="checkbox-label"><input name="removePhoto" type="checkbox"/> Quitar mi foto actual</label>}<label>Teléfono de contacto<input name="phone" type="tel" maxLength="25" defaultValue={profile.phone} placeholder="Ej. +57 300 123 4567" autoComplete="tel"/></label><div className="profile-actions"><button type="button" className="button button-soft" onClick={onChangePassword}><LockKeyhole size={15}/> Cambiar contraseña</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : <><Check size={15}/> Guardar perfil</>}</button></div></form></div>}</section>
}

function ScheduleModule({ user, notify }) {
  const [items, setItems] = useState([]), [options, setOptions] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const canEdit = ['admin', 'rectoria', 'secretaria'].includes(user?.role)
  const load = async () => { const response = await fetch('/api/schedule', { credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo cargar el horario.'); setItems(result.schedule || []) }
  useEffect(() => { load().catch(err => setError(err.message)); if (canEdit) fetch('/api/schedule/options', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { assignments: [] }).then(result => setOptions(result.assignments || [])).catch(() => setOptions([])) }, [])
  const save = async event => { event.preventDefault(); const formElement = event.currentTarget; setBusy(true); setError(''); const data = Object.fromEntries(new FormData(formElement)); const assignment = options[Number(data.assignmentIndex)]; if (!assignment) { setBusy(false); return setError('Selecciona una asignación docente válida.') } Object.assign(data, { courseId: assignment.courseId, teacherId: assignment.teacherId, subject: assignment.subject }); delete data.assignmentIndex; try { const response = await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo guardar el horario.'); await load(); formElement.reset(); notify('Clase añadida al horario.') } catch (err) { setError(err.message) } finally { setBusy(false) } }
  const remove = async item => { if (!window.confirm(`¿Quitar ${item.subject} de ${item.courseName}?`)) return; const response = await fetch(`/api/schedule/${item.id}`, { method: 'DELETE', credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) return setError(result.error); await load(); notify('Clase quitada del horario.') }
  const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  return <section className="students-page schedule-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ORGANIZACIÓN ACADÉMICA</div><h1>Horario de clases</h1><p className="welcome-sub">Consulta asignaturas, docentes, cursos y salones por día.</p></div></div>{error && <div className="login-message login-error" role="alert">{error}</div>}<div className="schedule-week">{weekdays.map((day, index) => { const rows = items.filter(item => Number(item.weekday) === index + 1); return <article className="panel schedule-day" key={day}><div className="panel-heading"><div><h2>{day}</h2><p>{rows.length} clases</p></div></div>{rows.length ? rows.map(item => <div className="schedule-slot" key={item.id}><time>{item.startTime}–{item.endTime}</time><strong>{item.subject}</strong><span>{item.grade} · {item.courseName}</span><small>{item.teacherName}{item.room ? ` · Salón ${item.room}` : ''}</small>{canEdit && <button className="account-toggle danger-action" onClick={() => remove(item)} aria-label="Eliminar clase"><Trash2 size={14}/></button>}</div>) : <p className="schedule-empty">Sin clases registradas</p>}</article> })}</div>{canEdit && <details className="calendar-create"><summary><Plus size={16}/> Añadir clase</summary>{options.length ? <form className="calendar-form" onSubmit={save}><label>Curso y docente<select name="assignmentIndex" required defaultValue=""><option value="" disabled>Selecciona una asignación</option>{options.map((item, index) => <option key={`${item.courseId}-${item.teacherId}-${item.subject}`} value={index}>{item.grade} · {item.courseName} · {item.subject} — {item.teacherName}</option>)}</select></label><label>Día<select name="weekday">{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label><label>Inicio<input name="startTime" type="time" required/></label><label>Fin<input name="endTime" type="time" required/></label><label>Salón<input name="room" maxLength="80" placeholder="Opcional"/></label><div className="calendar-form-wide"><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar horario'}</button></div></form> : <p className="students-empty">Asigna primero docentes y asignaturas a los cursos.</p>}</details>}</section>
}

function JustificationsModule({ user, notify }) {
  const [items, setItems] = useState([]), [students, setStudents] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const family = user?.role === 'acudiente'
  const load = async () => { const response = await fetch('/api/attendance/justifications', { credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron consultar las justificaciones.'); setItems(result.justifications || []) }
  useEffect(() => { load().catch(err => setError(err.message)); if (family) fetch('/api/portal/students', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { students: [] }).then(result => setStudents(result.students || [])).catch(() => setStudents([])) }, [])
  const submit = async event => {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError('')
    try {
      const formData = new FormData(form), file = formData.get('supportFile'), data = Object.fromEntries(formData.entries())
      delete data.supportFile
      if (file?.size) {
        if (file.size > 2 * 1024 * 1024) throw new Error('El soporte no puede superar 2 MB.')
        const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
        data.supportFileName = file.name; data.supportFileBase64 = btoa(binary)
      }
      const response = await fetch('/api/attendance/justifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo enviar.')
      await load(); form.reset(); notify('Justificación enviada a coordinación.')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') } finally { setBusy(false) }
  }
  const downloadSupport = async item => {
    try { const response = await fetch(`/api/attendance/justifications/${item.id}/file`, { credentials: 'same-origin' }); if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo descargar el soporte.') } const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = item.supportFileName || 'soporte'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) } catch (err) { setError(err.message) }
  }; const review = async (item, status) => { const note = window.prompt(status === 'Aprobada' ? 'Nota para la familia (opcional):' : 'Motivo del rechazo:') || ''; if (status === 'Rechazada' && note.trim().length < 3) return setError('Escribe un motivo breve para rechazar la solicitud.'); const response = await fetch(`/api/attendance/justifications/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ status, note }) }); const result = await response.json(); if (!response.ok) return setError(result.error || 'No se pudo revisar.'); await load(); notify(`Justificación ${status.toLocaleLowerCase('es')}.`) }
  const canReview = ['admin', 'rectoria', 'coordinacion', 'secretaria'].includes(user?.role)
  return <section className="students-page justifications-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ASISTENCIA Y ACOMPAÑAMIENTO</div><h1>Justificaciones</h1><p className="welcome-sub">Envía soportes de inasistencia o revisa solicitudes del colegio.</p></div></div>{error && <div className="login-message login-error" role="alert">{error}</div>}{user?.role === 'estudiante' && <div className="students-scope"><ShieldCheck size={14}/> El acudiente o padre autorizado debe enviar las solicitudes de justificación.</div>}{family && <form className="calendar-create justification-form" onSubmit={submit}><h2>Enviar justificación</h2><div className="calendar-form"><label>Estudiante<select name="studentId" required>{students.map(student => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label><label>Fecha de ausencia<input name="date" type="date" max={getLocalDate()} required/></label><label>Soporte (opcional)<input name="supportFile" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"/></label><label className="calendar-form-wide">Motivo<textarea name="reason" minLength="10" maxLength="1000" rows="3" required placeholder="Describe el motivo de la ausencia"/></label><div className="calendar-form-wide"><span className="field-hint">El envío queda pendiente de revisión. Puedes adjuntar un soporte PDF, PNG o JPG de hasta 2 MB.</span><button className="button button-primary" disabled={busy || !students.length}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button></div></div></form>}<div className="student-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>FECHA</th><th>MOTIVO</th><th>ESTADO</th><th>REVISIÓN</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.studentName}</strong><small className="history-secondary">{item.grade}</small></td><td>{item.attendanceDate}</td><td>{item.reason}{item.supportFileName && <button className="account-toggle" onClick={() => downloadSupport(item)}><Download size={14}/> {item.supportFileName}</button>}{item.reviewerNote && <small className="history-secondary">{item.reviewerNote}</small>}</td><td><span className={`student-status ${item.status === 'Aprobada' ? 'status-active' : item.status === 'Rechazada' ? 'status-inactive' : ''}`}>{item.status}</span></td><td>{canReview && item.status === 'Pendiente' ? <div className="table-row-actions"><button className="account-toggle" onClick={() => review(item, 'Aprobada')}>Aprobar</button><button className="account-toggle danger-action" onClick={() => review(item, 'Rechazada')}>Rechazar</button></div> : item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString('es-CO') : '—'}</td></tr>)}</tbody></table>{!items.length && <div className="students-empty">No hay justificaciones para mostrar.</div>}</div></section>
}

function ObservationsModule({ user, notify }) {
  const [items, setItems] = useState([]), [students, setStudents] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const canCreate = ['admin', 'rectoria', 'coordinacion', 'orientacion', 'docente'].includes(user?.role)
  const canDelete = ['admin', 'orientacion'].includes(user?.role)
  const load = async () => { const response = await fetch('/api/observations', { credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las observaciones.'); setItems(result.observations || []) }
  useEffect(() => { load().catch(err => setError(err.message)); if (canCreate) fetch('/api/observations/options', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { students: [] }).then(result => setStudents(result.students || [])).catch(() => setStudents([])) }, [])
  const save = async event => { event.preventDefault(); const formElement = event.currentTarget; setBusy(true); setError(''); const data = Object.fromEntries(new FormData(formElement)); data.confidential = data.confidential === 'on'; try { const response = await fetch('/api/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo guardar.'); await load(); formElement.reset(); notify('Seguimiento guardado con acceso restringido.') } catch (err) { setError(err.message) } finally { setBusy(false) } }
  const remove = async item => { if (!window.confirm('¿Eliminar este registro del observador?')) return; const response = await fetch(`/api/observations/${item.id}`, { method: 'DELETE', credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) return setError(result.error); await load() }
  return <section className="students-page observations-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ACCESO RESTRINGIDO</div><h1>Observador del estudiante</h1><p className="welcome-sub">Registros de convivencia y seguimiento con permisos limitados.</p></div></div><div className="students-scope"><ShieldCheck size={14}/> Las observaciones son privadas. Los docentes solo consultan registros no confidenciales y estudiantes de sus cursos.</div>{error && <div className="login-message login-error" role="alert">{error}</div>}{canCreate && <details className="calendar-create"><summary><Plus size={16}/> Registrar seguimiento</summary><form className="calendar-form" onSubmit={save}><label>Estudiante<select name="studentId" required>{students.map(student => <option key={student.id} value={student.id}>{student.grade} · {student.name}</option>)}</select></label><label>Categoría<input name="category" required minLength="2" maxLength="60" placeholder="Convivencia, orientación, logro…"/></label><label>Prioridad<select name="severity"><option>Seguimiento</option><option>Positiva</option><option>Prioritaria</option></select></label>{user?.role !== 'docente' && <label className="online-publish-check"><input type="checkbox" name="confidential" defaultChecked/> Confidencial</label>}<label className="calendar-form-wide">Detalle<textarea name="details" required minLength="10" maxLength="2000" rows="4" placeholder="Registra hechos concretos y acciones acordadas"/></label><div className="calendar-form-wide"><button className="button button-primary" disabled={busy || !students.length}>{busy ? 'Guardando…' : 'Guardar seguimiento'}</button></div></form></details>}<div className="observation-list">{items.map(item => <article className="panel observation-card" key={item.id}><div className="observation-heading"><div><span className="student-status">{item.severity}</span><h2>{item.studentName}</h2><small>{item.grade} · {item.category} · {new Date(item.createdAt).toLocaleString('es-CO')}</small></div><div>{item.confidential ? <span className="publication-status">Confidencial</span> : <span className="publication-status publication-live">Visible a docentes</span>}{canDelete && <button className="icon-btn" aria-label="Eliminar observación" onClick={() => remove(item)}><Trash2 size={15}/></button>}</div></div><p>{item.details}</p><small>Registró: {item.createdByName}</small></article>)}</div>{!items.length && <div className="students-empty">No hay seguimientos registrados.</div>}</section>
}

function AcademicPeriodsModule({ user, notify }) {
  const [periods, setPeriods] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const canEdit = ['admin', 'rectoria', 'secretaria'].includes(user?.role)
  const load = async () => { const response = await fetch('/api/academic-periods', { credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron consultar los periodos.'); setPeriods(result.periods || []) }
  useEffect(() => { load().catch(err => setError(err.message)) }, [])
  const save = async event => { event.preventDefault(); const formElement = event.currentTarget; setBusy(true); setError(''); const data = Object.fromEntries(new FormData(formElement)); try { const response = await fetch('/api/academic-periods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo guardar el periodo.'); await load(); formElement.reset(); notify('Periodo académico creado.') } catch (err) { setError(err.message) } finally { setBusy(false) } }
  const remove = async item => { if (!window.confirm(`¿Eliminar ${item.name} ${item.academicYear}?`)) return; const response = await fetch(`/api/academic-periods/${item.id}`, { method: 'DELETE', credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) return setError(result.error); await load() }
  return <section className="students-page periods-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CONFIGURACIÓN ACADÉMICA</div><h1>Periodos académicos</h1><p className="welcome-sub">Define fechas oficiales para cada periodo y año lectivo.</p></div></div>{error && <div className="login-message login-error" role="alert">{error}</div>}{canEdit && <form className="calendar-form period-form" onSubmit={save}><label>Año lectivo<input name="academicYear" required pattern="\d{4}-\d{4}" placeholder="2026-2027"/></label><label>Nombre del periodo<input name="name" required maxLength="40" placeholder="Periodo 1"/></label><label>Fecha inicial<input name="startDate" type="date" required/></label><label>Fecha final<input name="endDate" type="date" required/></label><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : <><Plus size={15}/> Crear periodo</>}</button></form>}<div className="student-table-wrap"><table className="student-table"><thead><tr><th>AÑO LECTIVO</th><th>PERIODO</th><th>DESDE</th><th>HASTA</th>{canEdit && <th>ACCIÓN</th>}</tr></thead><tbody>{periods.map(period => <tr key={period.id}><td>{period.academicYear}</td><td><strong>{period.name}</strong></td><td>{period.startDate}</td><td>{period.endDate}</td>{canEdit && <td><button className="account-toggle danger-action" onClick={() => remove(period)}><Trash2 size={14}/> Eliminar</button></td>}</tr>)}</tbody></table>{!periods.length && <div className="students-empty">No hay periodos configurados todavía.</div>}</div><div className="students-scope"><ShieldCheck size={14}/> Los periodos y reglas de escala son independientes; las notas anteriores se conservan al cambiar la configuración.</div></section>
}

function ImportStudentsModule({ notify }) {
  const [records, setRecords] = useState([]), [fileName, setFileName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const parse = text => {
    const rows = []; let row = [], field = '', quoted = false
    const firstLine = text.split(/\r?\n/).find(line => line.trim()) || ''
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','
    for (let index = 0; index < text.length; index++) { const char = text[index]; if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index++ } else if (char === '"') quoted = !quoted; else if (char === delimiter && !quoted) { row.push(field); field = '' } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index++; row.push(field); if (row.some(value => value.trim())) rows.push(row); row = []; field = '' } else field += char }
    row.push(field); if (row.some(value => value.trim())) rows.push(row)
    if (rows.length < 2) throw new Error('El CSV debe tener encabezados y al menos una fila.')
    const normalizeHeader = value => value.trim().replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]/g, '')
    const aliases = { name: ['name', 'nombre', 'nombrecompleto'], documentType: ['documenttype', 'tipodocumento', 'tipodedocumento', 'tipodeidentificacion'], document: ['document', 'documento', 'identificacion', 'numerodedocumento'], documentIssuedPlace: ['documentissuedplace', 'lugarexpedicion', 'lugardeexpedicion', 'municipiodeexpedicion'], grade: ['grade', 'grado', 'curso'], guardian: ['guardian', 'acudiente', 'responsable'], phone: ['phone', 'telefono', 'celular'], status: ['status', 'estado'] }
    const headers = rows[0].map(normalizeHeader)
    const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, headers.findIndex(header => names.includes(header))]))
    if (['name', 'documentType', 'document', 'documentIssuedPlace', 'grade'].some(key => indexes[key] < 0)) throw new Error('Incluye estas columnas: nombre, tipo_documento, documento, lugar_expedicion y grado.')
    return rows.slice(1).map(values => Object.fromEntries(Object.entries(indexes).filter(([, index]) => index >= 0).map(([key, index]) => [key, values[index] || ''])))
  }
  const readFile = async event => { const file = event.target.files?.[0]; setError(''); setRecords([]); if (!file) return; if (!file.name.toLocaleLowerCase().endsWith('.csv') || file.size > 2 * 1024 * 1024) return setError('Selecciona un CSV de máximo 2 MB.'); try { const result = parse(await file.text()); setRecords(result); setFileName(file.name) } catch (err) { setError(err.message) } }
  const importRows = async () => { setBusy(true); setError(''); try { const response = await fetch('/api/students/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ records }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo importar.'); setRecords([]); setFileName(''); notify(`Se importaron ${result.imported} estudiantes.`) } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <section className="students-page import-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CARGA SEGURA DE DATOS</div><h1>Importar estudiantes</h1><p className="welcome-sub">Previsualiza los datos y valida el archivo antes de guardarlo.</p></div></div><div className="students-scope"><FileText size={14}/> Acepta CSV separado por coma o punto y coma (formato habitual de Excel en español). Debe incluir tipo_documento y lugar_expedicion. Los documentos duplicados cancelan toda la importación.</div><div className="school-settings-card import-card"><label>Archivo CSV<input type="file" accept=".csv,text/csv" onChange={readFile}/></label><p className="field-hint">Plantilla: <code>nombre,tipo_documento,documento,lugar_expedicion,grado,acudiente,teléfono,estado</code></p>{fileName && <p>Archivo: <strong>{fileName}</strong> · {records.length} filas detectadas</p>}</div>{error && <div className="login-message login-error" role="alert">{error}</div>}{records.length > 0 && <><div className="report-result-summary">Vista previa: primeras {Math.min(8, records.length)} de {records.length} filas</div><div className="student-table-wrap"><table className="student-table"><thead><tr><th>NOMBRE</th><th>TIPO DOCUMENTO</th><th>DOCUMENTO</th><th>EXPEDIDO EN</th><th>GRADO</th><th>ACUDIENTE</th><th>TELÉFONO</th></tr></thead><tbody>{records.slice(0, 8).map((row, index) => <tr key={`${row.document}-${index}`}><td>{row.name}</td><td>{row.documentType || "—"}</td><td>{row.document}</td><td>{row.documentIssuedPlace || "—"}</td><td>{row.grade}</td><td>{row.guardian || '—'}</td><td>{row.phone || '—'}</td></tr>)}</tbody></table></div><button className="button button-primary" onClick={importRows} disabled={busy}>{busy ? 'Importando…' : `Importar ${records.length} estudiantes`}</button></>}</section>
}

function StudentPaymentsModule({ notify }) {
  const thisYear = new Date().getFullYear()
  const [academicYear, setAcademicYear] = useState(`${thisYear}-${thisYear + 1}`)
  const [feeType, setFeeType] = useState('Matrícula')
  const [students, setStudents] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('Pendiente')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/student-payments?academicYear=${encodeURIComponent(academicYear)}`, { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los pagos.')
      setStudents(result.students || []); setPayments(result.payments || [])
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [academicYear])
  const createPayment = async event => {
    event.preventDefault(); setBusy(true); setError('')
    const formElement = event.currentTarget
    const values = Object.fromEntries(new FormData(formElement).entries())
    try {
      const response = await fetch('/api/student-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar el cobro.')
      formElement.reset(); setFeeType('Matrícula'); await load(); notify('El cobro quedó registrado en la cuenta del estudiante.')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setBusy(false) }
  }
  const updatePaymentStatus = async (payment, status) => {
    const confirmation = status === 'Pagado' ? `¿Confirmas que se recibió el pago de ${payment.studentName}?` : `¿Cambiar este registro a ${status.toLocaleLowerCase('es')}?`
    if (!window.confirm(confirmation)) return
    setError('')
    try {
      const response = await fetch(`/api/student-payments/${payment.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ status, paymentReference: payment.paymentReference || '', notes: payment.notes || '' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el pago.')
      await load(); notify(status === 'Pagado' ? 'Pago marcado como recibido.' : 'Estado del pago actualizado.')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
  }
  const updateAccess = async student => {
    const suspend = student.accessStatus !== 'Suspendido'
    const reason = suspend ? window.prompt(`Confirma la suspensión del portal de ${student.name} por falta de pago. Indica si corresponde a Matrícula o Pensión, el periodo y el motivo (${academicYear}):`) : ''
    if (suspend && (reason === null || reason.trim().length < 5)) return
    if (!suspend && !window.confirm(`¿Reactivar el acceso de ${student.name}? Deberá iniciar sesión nuevamente.`)) return
    setError('')
    try {
      const response = await fetch(`/api/students/${student.id}/access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ accessStatus: suspend ? 'Suspendido' : 'Activo', reason, academicYear }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cambiar el acceso del estudiante.')
      await load(); notify(suspend ? `Acceso suspendido. Motivo registrado: ${reason.trim()}` : 'Acceso del estudiante reactivado.')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
  }
  const visiblePayments = payments.filter(payment => statusFilter === 'Todos' || payment.status === statusFilter)
  const pendingTotal = payments.filter(payment => payment.status === 'Pendiente').reduce((total, payment) => total + Number(payment.amount), 0)
  const money = amount => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(amount) || 0)
  return <section className="students-page student-payments-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ADMINISTRACIÓN FINANCIERA</div><h1>Matrículas y pensiones</h1><p className="welcome-sub">Registra cobros y pagos por estudiante y revisa saldos pendientes.</p></div><label className="student-filter">Año lectivo<input value={academicYear} onChange={event => setAcademicYear(event.target.value)} pattern="\d{4}-\d{4}" placeholder="2026-2027"/></label></div>
    <div className="payment-summary-grid"><article><span>Pendiente de pago</span><strong>{money(pendingTotal)}</strong><small>{payments.filter(payment => payment.status === 'Pendiente').length} cobros pendientes del año</small></article><article><span>Pagos recibidos</span><strong>{money(payments.filter(payment => payment.status === 'Pagado').reduce((total, payment) => total + Number(payment.amount), 0))}</strong><small>{payments.filter(payment => payment.status === 'Pagado').length} registros pagados</small></article><article><span>Estudiantes con saldo</span><strong>{students.filter(student => Number(student.pendingItems) > 0).length}</strong><small>Revisa el detalle antes de tomar medidas</small></article></div>
    {error && <div className="login-message login-error" role="alert">{error}</div>}
    <form className="school-settings-card payment-create-form" onSubmit={createPayment}><div className="school-settings-heading"><span className="stat-icon green"><Plus size={18}/></span><div><strong>Registrar matrícula o pensión</strong><span>El sistema guarda el concepto, el valor y su vencimiento.</span></div></div><label>Estudiante<select name="studentId" required defaultValue=""><option value="" disabled>Selecciona estudiante</option>{students.filter(student => student.status === 'Activo').map(student => <option value={student.id} key={student.id}>{student.name} · {student.grade}</option>)}</select></label><label>Concepto<select name="feeType" value={feeType} onChange={event => setFeeType(event.target.value)}><option>Matrícula</option><option>Pensión</option></select></label><label>Año lectivo<input name="academicYear" required pattern="\d{4}-\d{4}" defaultValue={academicYear}/></label>{feeType === 'Pensión' && <label>Mes facturado<input name="billingPeriod" type="month" required/></label>}{feeType === 'Matrícula' && <input type="hidden" name="billingPeriod" value=""/>}<label>Valor (COP)<input name="amount" type="number" required min="0" max="1000000000" step="1000" placeholder="350000"/></label><label>Fecha límite<input name="dueDate" type="date" required/></label><button className="button button-primary" disabled={busy || !students.length}>{busy ? 'Guardando…' : <><Plus size={15}/> Registrar cobro</>}</button></form>
    <article className="payment-students-panel"><div className="institution-list-heading"><div><h2>Estado de cuenta por estudiante</h2><p>Rectoría o administración puede suspender el portal por falta de pago, indicando concepto y periodo. El registro del cobro es independiente y esto no cambia el estado de matrícula.</p></div></div>{loading ? <div className="students-empty">Cargando estado de cuenta…</div> : <div className="student-table-wrap"><table className="student-table payment-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>SALDO PENDIENTE</th><th>ACCESO AL PORTAL</th><th>ACCIÓN</th></tr></thead><tbody>{students.map(student => <tr key={student.id}><td><strong>{student.name}</strong><small className="payment-document">{student.document}</small></td><td>{student.grade}</td><td><strong className={Number(student.pendingBalance) > 0 ? 'payment-balance-due' : 'payment-balance-clear'}>{money(student.pendingBalance)}</strong><small className="payment-document">{student.pendingItems} concepto{Number(student.pendingItems) === 1 ? '' : 's'} pendiente{Number(student.pendingItems) === 1 ? '' : 's'}</small></td><td><span className={`payment-access-pill ${student.accessStatus === 'Suspendido' ? 'payment-access-suspended' : 'payment-access-active'}`}>{student.accessStatus || 'Activo'}</span>{student.accessSuspensionReason && <small className="payment-document">{student.accessSuspensionReason}</small>}</td><td><button className={`account-toggle ${student.accessStatus === 'Suspendido' ? '' : 'danger-action'}`} onClick={() => updateAccess(student)}>{student.accessStatus === 'Suspendido' ? 'Reactivar acceso' : 'Suspender acceso'}</button></td></tr>)}</tbody></table>{!students.length && <div className="students-empty">No hay estudiantes activos.</div>}</div>}</article>
    <article className="payment-students-panel"><div className="institution-list-heading"><div><h2>Movimientos de pago</h2><p>Marca los cobros cuando el pago se confirme y registra una referencia si aplica.</p></div><label className="student-filter">Mostrar<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>Todos</option><option>Pendiente</option><option>Pagado</option><option>Exonerado</option></select></label></div>{loading ? <div className="students-empty">Cargando movimientos…</div> : <div className="student-table-wrap"><table className="student-table payment-table"><thead><tr><th>ESTUDIANTE</th><th>CONCEPTO</th><th>VALOR</th><th>VENCE</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{visiblePayments.map(payment => <tr key={payment.id}><td><strong>{payment.studentName}</strong><small className="payment-document">{payment.document} · {payment.grade}</small></td><td>{payment.feeType}<small className="payment-document">{payment.feeType === 'Pensión' ? payment.billingPeriod : payment.academicYear}</small></td><td>{money(payment.amount)}</td><td>{payment.dueDate}</td><td><span className={`payment-status-pill payment-${payment.status === 'Pagado' ? 'paid' : payment.status === 'Exonerado' ? 'waived' : 'pending'}`}>{payment.status}</span></td><td>{payment.status === 'Pendiente' ? <button className="account-toggle" onClick={() => updatePaymentStatus(payment, 'Pagado')}>Marcar pagado</button> : <button className="account-toggle" onClick={() => updatePaymentStatus(payment, 'Pendiente')}>Marcar pendiente</button>}</td></tr>)}</tbody></table>{!visiblePayments.length && <div className="students-empty">No hay movimientos para el filtro seleccionado.</div>}</div>}</article>
    <div className="students-scope"><ShieldCheck size={14}/> No almacenes datos de tarjetas. Los pagos quedan como registros administrativos y no procesan transacciones bancarias.</div>
  </section>
}

function StudentDirectoryModule({ user, students, studentsError, statusFilter, setStatusFilter, exportStudents, setEditingStudent, setStudentDialog, deleteStudent }) {
  const canManage = ['admin', 'rectoria', 'secretaria'].includes(user?.role)
  const canSeeSensitive = user?.role !== 'docente'
  return <section className="students-page">
    <div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN ACADÉMICA</div><h1>Estudiantes</h1><p className="welcome-sub">{canManage ? 'Consulta y administra los registros de estudiantes.' : 'Consulta los estudiantes que corresponden a tus permisos institucionales.'}</p></div><div className="students-actions">{canSeeSensitive && <button className="button button-soft" onClick={exportStudents}><Download size={16}/> Exportar CSV</button>}{canManage && <button className="button button-primary" onClick={() => { setEditingStudent(null); setStudentDialog(true) }}><Plus size={17}/> Nuevo estudiante</button>}</div></div>
    <div className="students-scope"><ShieldCheck size={14}/> {user?.role === 'docente' ? 'Solo se muestran estudiantes activos de tus cursos asignados; no se muestran datos de contacto ni documentos.' : user?.role === 'rectoria' ? 'Consulta institucional de estudiantes. La edición está reservada a administración y secretaría.' : 'Los registros se guardan en la base del colegio y solo el personal autorizado debe acceder.'}</div>
    {studentsError && <div className="login-message login-error" role="alert">{studentsError}</div>}
    <div className="students-toolbar"><div className="student-count"><strong>{students.length}</strong> {students.length === 1 ? 'estudiante registrado' : 'estudiantes registrados'}</div>{canSeeSensitive && <label className="student-filter">Estado <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>Todos</option><option>Activo</option><option>Retirado</option></select></label>}</div>
    <div className="student-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th>{canSeeSensitive && <><th>DOCUMENTO</th><th>ACUDIENTE</th><th>TELÉFONO</th></>}<th>GRADO / CURSO</th><th>ESTADO</th>{canSeeSensitive && <th>ACCIONES</th>}</tr></thead><tbody>{students.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td>{canSeeSensitive && <><td><strong>{student.documentType || 'Tipo pendiente'}</strong><small className="history-secondary">{student.document}</small><small className="history-secondary">Expedido en {student.documentIssuedPlace || 'pendiente'}</small></td><td>{student.guardian}</td><td>{student.phone || '—'}</td></>}<td>{student.grade}</td><td><span className={`student-status ${student.status === 'Activo' ? 'status-active' : 'status-inactive'}`}>{student.status}</span></td>{canSeeSensitive && <td><div className="table-row-actions">{canManage && <button className="account-toggle" onClick={() => { setEditingStudent(student); setStudentDialog(true) }}><Pencil size={14}/> Editar</button>}{user?.role === 'admin' && <button className="account-toggle delete-student-action" onClick={() => deleteStudent(student)}><Trash2 size={14}/> Eliminar</button>}</div></td>}</tr>)}</tbody></table>
      {students.length === 0 && <div className="students-empty"><span className="empty-icon"><Users size={22}/></span><strong>{studentsError ? 'No se pudo cargar la lista' : 'Aún no hay estudiantes'}</strong><p>{studentsError ? 'Comprueba que la cuenta tenga el rol y las asignaciones correctas.' : 'Registra un estudiante o revisa los cursos asignados.'}</p>{canManage && students.length === 0 && <button className="button button-primary" onClick={() => setStudentDialog(true)}><Plus size={16}/> Crear primer registro</button>}</div>}
    </div>
  </section>
}

function BackupModule({ notify }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const download = async () => { setBusy(true); setError(''); try { const response = await fetch('/api/admin/backup', { credentials: 'same-origin' }); if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo descargar el respaldo.') } const blob = await response.blob(); const disposition = response.headers.get('Content-Disposition') || ''; const name = disposition.match(/filename="([^"]+)"/)?.[1] || 'educa-respaldo.json'; const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Respaldo descargado. Guárdalo en una ubicación segura.') } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') } finally { setBusy(false) } }
  return <section className="students-page backup-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CONTINUIDAD OPERATIVA</div><h1>Respaldos</h1><p className="welcome-sub">Descarga una copia de los datos del colegio para conservación segura.</p></div></div><article className="school-settings-card backup-card"><span className="stat-icon violet"><Download size={18}/></span><div><strong>Respaldo de los datos institucionales</strong><p>Incluye cuentas sin credenciales, estudiantes, cursos, matrículas, asistencia, notas, eventos, horarios y seguimientos.</p><p>Este JSON no incluye los archivos adjuntos de justificaciones. Para restaurar PostgreSQL con todos sus datos y archivos, usa las copias de seguridad de Railway; este archivo sirve para conservar y consultar registros.</p></div><button className="button button-primary" onClick={download} disabled={busy}>{busy ? 'Preparando…' : 'Descargar respaldo JSON'}</button>{error && <div className="login-message login-error" role="alert">{error}</div>}</article><div className="students-scope"><ShieldCheck size={14}/> Solo el administrador puede descargar este archivo. Contiene información personal: almacénalo cifrado y limita el acceso.</div></section>
}

function InstitutionManagerModule({ user, notify, onCreated, onUpdated }) {
  const [institutions, setInstitutions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [editingId, setEditingId] = useState('')
  const [editLogoFile, setEditLogoFile] = useState(null)
  const [editBusy, setEditBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/institutions', { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las instituciones.')
      setInstitutions(result.institutions || [])
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setLoading(false) }
  }
  const changeInstitutionStatus = async (institution, action) => {
    let reason = ''
    if (action === 'suspend' || action === 'archive') {
      if (action === 'archive' && !window.confirm(`Se archivará ${institution.name} y se conservarán sus registros. Podrás restaurarla después. ¿Continuar?`)) return
      reason = window.prompt(action === 'archive' ? 'Motivo para archivar esta institución:' : 'Motivo de suspensión, por ejemplo falta de pago:')
      if (reason === null || reason.trim().length < 5) return
    }
    setError('')
    try {
      const response = await fetch(`/api/institutions/${institution.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action, reason }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cambiar el estado de la institución.')
      setInstitutions(current => current.map(item => item.id === institution.id ? { ...item, status: result.status, suspensionReason: result.suspensionReason || '' } : item))
      notify(action === 'suspend' ? 'Institución suspendida; se conservaron sus datos.' : action === 'archive' ? 'Institución archivada y disponible para restauración.' : 'Institución reactivada.')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
  }
  useEffect(() => { load() }, [])
  const create = async event => {
    event.preventDefault(); setBusy(true); setError('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const payload = Object.fromEntries([...form.entries()].filter(([key]) => key !== 'logo'))
    if (logoFile) {
      if (logoFile.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(logoFile.type)) {
        setBusy(false); setError('El logo debe ser PNG, JPG o WEBP y pesar máximo 1 MB.'); return
      }
      const bytes = new Uint8Array(await logoFile.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      payload.logo = { fileName: logoFile.name, contentType: logoFile.type, fileBase64: btoa(binary) }
    }
    try {
      const response = await fetch('/api/institutions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo crear la institución.')
      await load(); formElement.reset(); setLogoFile(null); onCreated(result.institution); notify('Institución creada con identidad institucional y cuenta administradora.')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setBusy(false) }
  }
  const saveInstitution = async event => {
    event.preventDefault(); setEditBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    const institutionId = String(form.get('institutionId') || '')
    const payload = Object.fromEntries([...form.entries()].filter(([key]) => !['institutionId', 'logo', 'removeLogo'].includes(key)))
    payload.removeLogo = form.has('removeLogo')
    if (editLogoFile) {
      if (editLogoFile.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(editLogoFile.type)) { setEditBusy(false); setError('El logo debe ser PNG, JPG o WEBP y pesar máximo 1 MB.'); return }
      const bytes = new Uint8Array(await editLogoFile.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      payload.logo = { fileName: editLogoFile.name, contentType: editLogoFile.type, fileBase64: btoa(binary) }
    }
    try {
      const response = await fetch(`/api/institutions/${institutionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron guardar los cambios.')
      setInstitutions(current => current.map(institution => institution.id === institutionId ? { ...institution, ...result.institution } : institution))
      onUpdated(result.institution); setEditingId(''); setEditLogoFile(null); notify('Identidad y datos de la institución actualizados.')
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setEditBusy(false) }
  }
  return <section className="students-page institution-manager-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ADMINISTRACIÓN EDUCA</div><h1>Instituciones</h1><p className="welcome-sub">Crea colegios y configura su identidad, información de contacto y cuenta administradora.</p></div></div>
    <article className="institution-manager-banner"><span className="stat-icon violet"><Building2 size={20}/></span><div><strong>Gestión de instituciones</strong><p>Cada institución conserva su propio espacio de estudiantes, personal, cursos y configuración. El administrador que registres gestionará su colegio.</p></div><span className="institution-total">{institutions.length} {institutions.length === 1 ? 'institución' : 'instituciones'}</span></article>
    {error && <div className="login-message login-error" role="alert">{error}</div>}
    <div className="institution-manager-grid"><form className="school-settings-card institution-create-form" onSubmit={create}><div className="school-settings-heading"><span className="stat-icon green"><Plus size={18}/></span><div><strong>Nueva institución</strong><span>Completa los datos y personaliza su apariencia.</span></div></div>
      <h2 className="institution-form-section">Datos del colegio</h2><label>Nombre de la institución<input name="schoolName" required minLength="2" maxLength="120" placeholder="Ej. Colegio San Martín"/></label><label>Correo institucional<input name="contactEmail" type="email" maxLength="254" placeholder="contacto@colegio.edu.co"/></label><label>Teléfono<input name="contactPhone" maxLength="30" placeholder="+57 300 000 0000"/></label><label>Dirección<input name="address" maxLength="240" placeholder="Ciudad y dirección"/></label>
      <h2 className="institution-form-section">Identidad visual</h2><label>Color principal<div className="school-color-input"><input name="primaryColor" type="color" defaultValue="#286887"/><span>El panel usará este color institucional.</span></div></label><label>Logo del colegio <span className="optional-label">PNG, JPG O WEBP · MÁXIMO 1 MB</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setLogoFile(event.target.files?.[0] || null)}/></label>{logoFile && <div className="selected-logo-file">Logo seleccionado: <strong>{logoFile.name}</strong></div>}
      <h2 className="institution-form-section">Cuenta administradora</h2><label>Nombre completo<input name="adminName" required minLength="2" maxLength="100" placeholder="Nombre de quien administra"/></label><label>Correo de acceso<input name="email" type="email" required maxLength="254" placeholder="admin@colegio.edu.co" autoComplete="off"/></label><label>Contraseña inicial <span className="optional-label">12 CARACTERES MÍNIMO</span><input name="password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" placeholder="Contraseña temporal segura"/></label><p className="field-hint">Entrega la contraseña inicial al administrador por un canal seguro. Podrá cambiarla desde su perfil.</p><button className="button button-primary" disabled={busy}>{busy ? 'Creando institución…' : <><Plus size={15}/> Crear institución</>}</button>
    </form><div className="institution-list-column"><div className="institution-list-heading"><div><h2>Instituciones registradas</h2><p>Personaliza identidad, color y datos institucionales cuando quieras.</p></div><button className="button button-soft" onClick={load} disabled={loading}><Activity size={15}/> Actualizar</button></div>{loading ? <div className="students-empty">Cargando instituciones…</div> : institutions.map(institution => <article className={`institution-list-card ${editingId === institution.id ? 'institution-list-card-editing' : ''}`} key={institution.id}><div className="institution-card-summary"><span className="institution-logo" style={{ background: institution.primaryColor || '#286887' }}>{institution.hasLogo ? <img src={`/api/schools/${institution.slug}/logo`} alt={`Logo de ${institution.name}`}/> : <GraduationCap size={19}/>}</span><div className="institution-list-copy"><strong>{institution.name}</strong><span>{institution.contactEmail || institution.slug}</span><small>{institution.activeAdmins} cuenta{institution.activeAdmins === 1 ? '' : 's'} administradora{institution.activeAdmins === 1 ? '' : 's'} activa{institution.activeAdmins === 1 ? '' : 's'}</small><span className={`institution-state-pill institution-state-${institution.status === 'Activa' ? 'active' : institution.status === 'Suspendida' ? 'suspended' : 'archived'}`}>{institution.status || 'Activa'}</span>{institution.suspensionReason && <small className="payment-document">Motivo: {institution.suspensionReason}</small>}</div><i style={{ background: institution.primaryColor || '#286887' }}/><button type="button" className="button button-soft institution-edit-button" onClick={() => { setEditingId(editingId === institution.id ? '' : institution.id); setEditLogoFile(null); setError('') }}><Pencil size={14}/>{editingId === institution.id ? 'Cerrar' : 'Personalizar'}</button>{institution.id !== user?.school?.id && <div className="institution-lifecycle-actions">{institution.status === 'Activa' && <><button type="button" onClick={() => changeInstitutionStatus(institution, 'suspend')}>Suspender</button><button type="button" className="danger-action" onClick={() => changeInstitutionStatus(institution, 'archive')}>Archivar</button></>}{institution.status === 'Suspendida' && <><button type="button" onClick={() => changeInstitutionStatus(institution, 'reactivate')}>Reactivar</button><button type="button" className="danger-action" onClick={() => changeInstitutionStatus(institution, 'archive')}>Archivar</button></>}{institution.status === 'Archivada' && <button type="button" onClick={() => changeInstitutionStatus(institution, 'restore')}>Restaurar</button>}</div>}</div>{editingId === institution.id && <form className="institution-inline-editor" onSubmit={saveInstitution}><input type="hidden" name="institutionId" value={institution.id}/><label>Nombre<input name="name" required minLength="2" maxLength="120" defaultValue={institution.name}/></label><label>Correo de contacto<input name="contactEmail" type="email" maxLength="254" defaultValue={institution.contactEmail || ''}/></label><label>Teléfono<input name="contactPhone" maxLength="30" defaultValue={institution.contactPhone || ''}/></label><label>Dirección<input name="address" maxLength="240" defaultValue={institution.address || ''}/></label><label>Color institucional<div className="school-color-input"><input name="primaryColor" type="color" defaultValue={institution.primaryColor || '#286887'}/><span>Identidad del colegio</span></div></label><label>Actualizar logo <span className="optional-label">PNG, JPG O WEBP · MÁXIMO 1 MB</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setEditLogoFile(event.target.files?.[0] || null)}/></label>{institution.hasLogo && <label className="institution-remove-logo"><input type="checkbox" name="removeLogo"/> Eliminar el logo actual</label>}<button className="button button-primary" disabled={editBusy}>{editBusy ? 'Guardando…' : <><Check size={14}/> Guardar identidad</>}</button></form>}</article>)}</div></div>
    <div className="students-scope"><ShieldCheck size={14}/> Este acceso está limitado a smiranda15@uan.edu.co. Las demás cuentas solo pueden personalizar su propia institución.</div>
  </section>
}

function DocumentControlModule({ user }) {
  const canDelete = ['admin', 'rectoria'].includes(user?.role)
  const [records, setRecords] = useState([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(''), [type, setType] = useState(''), [year, setYear] = useState(''), [offset, setOffset] = useState(0)
  const [deletingId, setDeletingId] = useState(''), [error, setError] = useState('')
  const limit = 100
  const load = async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      if (search.trim()) query.set('search', search.trim())
      if (type) query.set('type', type)
      if (year.trim()) query.set('year', year.trim())
      const response = await fetch(`/api/document-control?${query}`, { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar el registro documental.')
      setRecords(result.records || []); setTotal(result.total || 0)
    } catch { setRecords([]); setTotal(0) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [offset, type, year])
  const removeAnnulled = async record => {
    if (!window.confirm(`¿Eliminar del control documental el folio anulado ${record.documentNumber}? La acción quedará registrada en la bitácora.`)) return
    setDeletingId(record.id); setError('')
    try {
      const response = await fetch(`/api/document-control/${record.id}`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el registro anulado.')
      setRecords(current => current.filter(item => item.id !== record.id)); setTotal(current => Math.max(0, current - 1))
    } catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') } finally { setDeletingId('') }
  }
  const typeName = code => ({ CERT: 'Certificado o constancia', BOL: 'Boletín académico', MAT: 'Matrícula', SOLMAT: 'Solicitud de matrícula' }[code] || code)
  const exportUrl = `/api/document-control?${new URLSearchParams({ export: 'csv', ...(type ? { type } : {}), ...(year ? { year } : {}), ...(search.trim() ? { search: search.trim() } : {}) })}`
  return <section className="students-page document-control-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ARCHIVO Y TRAZABILIDAD</div><h1>Control documental</h1><p className="welcome-sub">Consulta y exporta los folios de documentos emitidos y registros académicos del colegio.</p></div><div className="students-actions"><a className="button button-soft" href={exportUrl}><Download size={15}/> Exportar CSV</a></div></div>
    <div className="students-scope"><ShieldCheck size={14}/> La numeración es única por institución, tipo y año lectivo. El registro conserva el estado, fecha y usuario que creó cada documento.</div>
    {error && <div className="login-message login-error" role="alert">{error}</div>}
    <div className="students-toolbar"><label className="student-filter">Buscar folio o estudiante<input type="search" value={search} maxLength={100} placeholder="Ej. EDU-BOL-2026-2027-00001" onChange={event => { setSearch(event.target.value); setOffset(0) }} onKeyDown={event => { if (event.key === 'Enter') load() }}/></label><label className="student-filter">Tipo<select value={type} onChange={event => { setType(event.target.value); setOffset(0) }}><option value="">Todos</option><option value="CERT">Certificados y constancias</option><option value="BOL">Boletines</option><option value="MAT">Matrículas</option><option value="SOLMAT">Solicitudes de matrícula</option></select></label><label className="student-filter">Año lectivo<input value={year} maxLength={9} placeholder="Ej. 2026-2027" onChange={event => { setYear(event.target.value); setOffset(0) }}/></label><button className="button button-primary" onClick={() => { setOffset(0); load() }}><Search size={15}/> Buscar</button><span className="student-count"><strong>{total.toLocaleString('es-CO')}</strong> registros</span></div>
    <div className="student-table-wrap"><table className="student-table"><thead><tr><th>NÚMERO DE CONTROL</th><th>DOCUMENTO</th><th>ESTUDIANTE</th><th>AÑO / PERIODO</th><th>ESTADO</th><th>FECHA Y RESPONSABLE</th>{canDelete && <th>ACCIÓN</th>}</tr></thead><tbody>{records.map(record => <tr key={record.id}><td><strong className="document-control-number">{record.documentNumber}</strong></td><td>{typeName(record.documentType)}</td><td>{record.studentName || '—'}</td><td>{record.academicYear}{record.period ? <small className="history-secondary">{record.period}</small> : null}</td><td><span className={`student-status ${['Emitida','Publicado','Activa','Aprobada'].includes(record.status) ? 'status-active' : ''}`}>{record.status}</span></td><td>{record.createdAt ? new Date(record.createdAt).toLocaleString('es-CO') : '—'}<small className="history-secondary">{record.createdByName}</small></td>{canDelete && <td>{record.status === 'Anulada' && <button className="account-toggle danger-action" disabled={deletingId === record.id} onClick={() => removeAnnulled(record)}><Trash2 size={14}/>{deletingId === record.id ? 'Eliminando…' : 'Eliminar'}</button>}</td>}</tr>)}</tbody></table>{loading && <div className="students-empty">Cargando registro documental…</div>}{!loading && !records.length && <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>No hay documentos en este filtro</strong><p>Al generar una constancia, boletín o matrícula aparecerá su número de control aquí.</p></div>}</div>
    <div className="pagination-bar"><span>Mostrando {records.length ? offset + 1 : 0}–{Math.min(offset + limit, total)} de {total}</span><div><button className="button button-soft" disabled={offset <= 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>Anterior</button><button className="button button-soft" disabled={offset + limit >= total || loading} onClick={() => setOffset(offset + limit)}>Siguiente</button></div></div>
  </section>
}

function PasswordRecoveryPage({ schools, initialSchool, onBack }) {
  const [school, setSchool] = useState(initialSchool || '')
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState('request')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeSchool = schools.find(item => item.slug === school)
  async function requestReset(event) {
    event.preventDefault(); setError(''); setBusy(true)
    const values = new FormData(event.currentTarget)
    const normalizedEmail = String(values.get('email') || '').trim().toLowerCase()
    try {
      const response = await fetch('/api/auth/password-reset-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ school, email: normalizedEmail }) })
      const result = await response.json()
      if (!response.ok) setError(result.error || 'No se pudo registrar la solicitud.')
      else { setEmail(normalizedEmail); setPhase('code') }
    } catch { setError('No se pudo conectar con el colegio. Inténtalo de nuevo.') }
    finally { setBusy(false) }
  }
  async function completeReset(event) {
    event.preventDefault(); setError(''); setBusy(true)
    const values = new FormData(event.currentTarget)
    const code = String(values.get('code') || '').trim()
    const newPassword = String(values.get('newPassword') || '')
    const confirmation = String(values.get('confirmPassword') || '')
    if (newPassword !== confirmation) { setError('Las contraseñas no coinciden.'); setBusy(false); return }
    try {
      const response = await fetch('/api/auth/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ school, email, code, newPassword }) })
      const result = await response.json()
      if (!response.ok) setError(result.error || 'No fue posible validar el código.')
      else setPhase('complete')
    } catch { setError('No se pudo conectar con el colegio. Inténtalo de nuevo.') }
    finally { setBusy(false) }
  }
  return <div className="recovery-page"><header className="recovery-top"><a className="login-brand" href="#inicio"><span className="brand-mark" style={activeSchool?.primaryColor ? { background: activeSchool.primaryColor } : undefined}>{activeSchool?.hasLogo ? <img src={`/api/schools/${activeSchool.slug}/logo`} alt="" className="brand-school-logo"/> : <GraduationCap size={21}/>}</span><span className="brand-name">{activeSchool?.name || 'educa'}<span>.</span></span></a><span><LockKeyhole size={14}/> Recuperación segura de acceso</span></header><main className="recovery-card"><span className="recovery-icon"><LockKeyhole size={21}/></span><div className="eyebrow"><span className="live-dot"/> SOPORTE DE ACCESO</div><h1>{phase === 'complete' ? 'Contraseña actualizada' : phase === 'code' ? 'Confirma tu solicitud' : '¿Olvidaste tu contraseña?'}</h1>{phase === 'request' ? <><p>Selecciona tu institución e indica el correo asociado a tu cuenta. La solicitud se enviará solo a rectoría y administración para revisión.</p><form className="login-form recovery-form" onSubmit={requestReset}><label className="login-label">Institución<select value={school} onChange={event => setSchool(event.target.value)} required><option value="">Selecciona tu colegio</option>{schools.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label><label className="login-label">Correo de tu cuenta<input name="email" type="email" required maxLength="254" autoComplete="email" placeholder="nombre@colegio.edu.co"/></label>{error && <div className="login-message login-error" role="alert">{error}</div>}<button className="login-submit" disabled={busy}>{busy ? 'Enviando solicitud…' : 'Enviar solicitud'} <ArrowRight size={16}/></button></form></> : phase === 'code' ? <><div className="login-message login-info" role="status">Si la cuenta existe, rectoría o administración revisará la solicitud. No se envía un correo automático. Si la aprueban, pide al colegio el código de un solo uso; vence en 30 minutos.</div><form className="login-form recovery-form" onSubmit={completeReset}><label className="login-label">Correo de la cuenta<input type="email" value={email} onChange={event => setEmail(event.target.value.trim().toLowerCase())} required maxLength="254" autoComplete="email"/></label><label className="login-label">Código entregado por soporte<input name="code" required autoComplete="one-time-code" maxLength="100" placeholder="Código de aprobación"/></label><label className="login-label">Nueva contraseña <span className="optional-label">12 CARACTERES MÍNIMO</span><input name="newPassword" type="password" required minLength="12" maxLength="128" autoComplete="new-password"/></label><label className="login-label">Confirma la contraseña<input name="confirmPassword" type="password" required minLength="12" maxLength="128" autoComplete="new-password"/></label>{error && <div className="login-message login-error" role="alert">{error}</div>}<button className="login-submit" disabled={busy}>{busy ? 'Actualizando…' : 'Cambiar contraseña'} <Check size={16}/></button></form></> : <><div className="login-message login-info" role="status">Tu contraseña se cambió. Las demás sesiones se cerraron por seguridad.</div><button className="login-submit" onClick={onBack}>Volver al inicio de sesión <ArrowRight size={16}/></button></>}<button className="recovery-back" onClick={onBack}><ChevronRight size={15}/> Volver al inicio de sesión</button><small><ShieldCheck size={14}/> No compartas tu código de aprobación con otras personas.</small></main><footer className="recovery-footer">© 2026 Educa · Gestión escolar</footer></div>
}

function PasswordResetRequestsModule({ notify }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [issuedCode, setIssuedCode] = useState(null)
  async function load() {
    setLoading(true); setError('')
    try { const response = await fetch('/api/password-reset-requests', { credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las solicitudes.'); setRequests(result.requests || []) }
    catch (err) { setError(err.message || 'No se pudo conectar con el servidor.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  async function review(request, action) {
    setBusyId(request.id); setError(''); setIssuedCode(null)
    try {
      const response = await fetch(`/api/password-reset-requests/${request.id}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la solicitud.')
      if (result.resetCode) setIssuedCode({ id: request.id, email: request.email, code: result.resetCode, expiresAt: result.expiresAt })
      notify(action === 'reject' ? 'Solicitud rechazada.' : action === 'renew' ? 'Se generó otro código de un solo uso.' : 'Solicitud aprobada. Entrega el código de forma privada.')
      await load()
    } catch (err) { setError(err.message || 'No se pudo completar la acción.') }
    finally { setBusyId('') }
  }
  async function copyCode() { try { await navigator.clipboard.writeText(issuedCode.code); notify('Código copiado. Entrégalo al usuario por un canal privado.') } catch { notify('Selecciona y copia el código para entregarlo de forma privada.') } }
  return <section className="students-page users-page password-reset-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> SOPORTE DE ACCESO</div><h1>Solicitudes de contraseña</h1><p className="welcome-sub">Revisa solicitudes de recuperación. Solo rectoría, coordinación, secretaría y administración pueden aprobarlas.</p></div><div className="students-actions"><button className="button button-soft" onClick={load} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div></div><div className="form-scope"><ShieldCheck size={15}/> Antes de aprobar, verifica la identidad por los canales del colegio. Se genera un código de un solo uso válido por 30 minutos; entrégalo directamente al usuario. EDUCA no lo envía por correo.</div>{issuedCode && <div className="reset-issued-code" role="status"><div><strong>Código aprobado para {issuedCode.email}</strong><p>Vence: {auditDateLabel(issuedCode.expiresAt)} · Entrégalo solo por un canal privado.</p><code>{issuedCode.code}</code></div><button className="button button-soft" onClick={copyCode}>Copiar código</button></div>}{error && <div className="login-message login-error" role="alert">{error}</div>}{loading ? <div className="panel">Cargando solicitudes…</div> : <div className="student-table-wrap"><table className="student-table reset-request-table"><thead><tr><th>CUENTA</th><th>ROL</th><th>ESTADO</th><th>FECHA</th><th>REVISIÓN</th></tr></thead><tbody>{requests.map(request => <tr key={request.id}><td><strong>{request.fullName || 'Cuenta no disponible'}</strong><small>{request.email}</small></td><td>{roleName(request.role)}</td><td><span className={`student-status ${request.status === 'Pendiente' ? 'status-pending' : request.status === 'Aprobada' ? 'status-active' : request.status === 'Rechazada' ? 'status-inactive' : 'status-complete'}`}>{request.status}</span></td><td>{auditDateLabel(request.requestedAt)}</td><td><div className="table-row-actions">{request.status === 'Pendiente' && <><button className="button button-primary" disabled={busyId === request.id} onClick={() => review(request, 'approve')}>Aprobar y generar código</button><button className="button button-danger" disabled={busyId === request.id} onClick={() => review(request, 'reject')}>Rechazar</button></>}{request.status === 'Aprobada' && <><small>{request.tokenExpiresAt ? `Código vence ${auditDateLabel(request.tokenExpiresAt)}` : 'Código no disponible'}</small><button className="button button-soft" disabled={busyId === request.id} onClick={() => review(request, 'renew')}>Generar otro código</button></>}{request.status !== 'Pendiente' && request.status !== 'Aprobada' && <small>{request.reviewerName ? `Revisó ${request.reviewerName}` : 'Solicitud finalizada'}</small>}</div></td></tr>)}</tbody></table>{!requests.length && <div className="students-empty"><span className="empty-icon"><LockKeyhole size={22}/></span><strong>No hay solicitudes de recuperación</strong><p>Las nuevas solicitudes de la institución aparecerán aquí para revisión administrativa.</p></div>}</div>}</section>
}

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsLoading, setTermsLoading] = useState(false)
  const [termsBusy, setTermsBusy] = useState(false)
  const [termsError, setTermsError] = useState('')
  const [user, setUser] = useState(null)
  const pushTokenRef = useRef('')
  const [profileRevision, setProfileRevision] = useState(0)
  const [schools, setSchools] = useState([])
  const [brandSettings, setBrandSettings] = useState(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [apiReady, setApiReady] = useState(false)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loginSchool, setLoginSchool] = useState('')
  const [loginStep, setLoginStep] = useState('select')
  const [schoolSearch, setSchoolSearch] = useState('')
  const [schoolPicker, setSchoolPicker] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false)
  const [passwordDialog, setPasswordDialog] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [schoolSettings, setSchoolSettings] = useState(null)
  const [schoolSettingsLoading, setSchoolSettingsLoading] = useState(false)
  const [schoolSettingsBusy, setSchoolSettingsBusy] = useState(false)
  const [schoolSettingsError, setSchoolSettingsError] = useState('')
  const [schoolLogoFile, setSchoolLogoFile] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [auditFrom, setAuditFrom] = useState('')
  const [auditTo, setAuditTo] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginNotice, setLoginNotice] = useState('')
  const [active, setActive] = useState('Resumen')
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchInputRef = useRef(null)
  const accountMenuRef = useRef(null)
  const [dashboardData, setDashboardData] = useState(null)
  const [dashboardDate, setDashboardDate] = useState(getLocalDate)
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  useEffect(() => {
    if (!authenticated) { setUnreadNotifications(0); return }
    let alive = true
    const refresh = () => fetch('/api/notifications', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : null).then(result => { if (alive && result) setUnreadNotifications(result.unread || 0) }).catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 30000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [authenticated])
  useEffect(() => {
    if (!authenticated || !user?.id || !Capacitor.isNativePlatform()) return
    let disposed = false
    const handles = []
    const attachPush = async () => {
      try {
        if (Capacitor.getPlatform() === 'android') await PushNotifications.createChannel({ id: 'educa_notifications', name: 'Avisos de EDUCA', description: 'Eventos, comunicados y novedades del colegio', importance: 5, sound: 'default', vibration: true })
        const registration = await PushNotifications.addListener('registration', async token => {
          if (disposed) return
          pushTokenRef.current = token.value
          try { await fetch('/api/push/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }) }) } catch { /* Los avisos internos siguen disponibles sin conexión. */ }
        })
        handles.push(registration)
        const receive = await PushNotifications.addListener('pushNotificationReceived', notification => {
          if (disposed) return
          window.dispatchEvent(new Event('educa:notifications-updated'))
          fetch('/api/notifications', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : null).then(result => { if (!disposed && result) setUnreadNotifications(result.unread || 0) }).catch(() => {})
          setNotice(notification.title ? `Nuevo aviso: ${notification.title}` : 'Tienes una notificación nueva.')
          window.setTimeout(() => setNotice(current => current.startsWith('Nuevo aviso:') || current === 'Tienes una notificación nueva.' ? '' : current), 5000)
        })
        handles.push(receive)
        const action = await PushNotifications.addListener('pushNotificationActionPerformed', () => {
          if (!disposed) { setActive('Notificaciones'); setMenuOpen(false) }
        })
        handles.push(action)
        const permission = await PushNotifications.checkPermissions()
        const receivePermission = permission.receive === 'prompt' ? (await PushNotifications.requestPermissions()).receive : permission.receive
        if (receivePermission === 'granted') await PushNotifications.register()
      } catch (error) { console.warn('No se pudo activar el registro de notificaciones en este dispositivo.', error) }
    }
    attachPush()
    return () => { disposed = true; handles.forEach(handle => handle.remove()) }
  }, [authenticated, user?.id])
  const [students, setStudents] = useState([])
  const [studentsError, setStudentsError] = useState('')
  const [studentDialog, setStudentDialog] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [studentSaveError, setStudentSaveError] = useState('')
  const [studentSaving, setStudentSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [schoolUsers, setSchoolUsers] = useState([])
  const [accountDialog, setAccountDialog] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [accountError, setAccountError] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [newAccountRole, setNewAccountRole] = useState('docente')
  const [linkableStudents, setLinkableStudents] = useState([])
  const [portalStudents, setPortalStudents] = useState([])
  const [courses, setCourses] = useState([])
  const [teacherCourses, setTeacherCourses] = useState([])
  const [teacherRoster, setTeacherRoster] = useState([])
  const [teachers, setTeachers] = useState([])
  const [courseError, setCourseError] = useState('')
  const [courseDialog, setCourseDialog] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)
  const [historyCourse, setHistoryCourse] = useState(null)
  const [historyKind, setHistoryKind] = useState('attendance')
  const [historyRecords, setHistoryRecords] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [enrollmentTab, setEnrollmentTab] = useState('requests')
  const [enrollmentRequests, setEnrollmentRequests] = useState([])
  const [enrollmentHistory, setEnrollmentHistory] = useState([])
  const [enrollmentSearch, setEnrollmentSearch] = useState('')
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState('Todos')
  const [enrollmentDialog, setEnrollmentDialog] = useState(false)
  const [enrollmentError, setEnrollmentError] = useState('')
  const [enrollmentBusy, setEnrollmentBusy] = useState(false)
  const [transferTarget, setTransferTarget] = useState(null)
  const [transferCourses, setTransferCourses] = useState([])
  const [communications, setCommunications] = useState([])
  const [communicationCourses, setCommunicationCourses] = useState([])
  const [communicationDialog, setCommunicationDialog] = useState(false)
  const [communicationAudience, setCommunicationAudience] = useState('school')
  const [communicationError, setCommunicationError] = useState('')
  const [communicationBusy, setCommunicationBusy] = useState(false)
  const [communicationDeletingId, setCommunicationDeletingId] = useState('')
  const [reportType, setReportType] = useState('students')
  const [reportFrom, setReportFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 30); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10) })
  const [reportTo, setReportTo] = useState(getLocalDate)
  const [reportCourseId, setReportCourseId] = useState('')
  const [reportAcademicYear, setReportAcademicYear] = useState('')
  const [reportCourses, setReportCourses] = useState([])
  const [reportRows, setReportRows] = useState([])
  const [reportTruncated, setReportTruncated] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [assignmentCourse, setAssignmentCourse] = useState(null)
  const [editingAssignment, setEditingAssignment] = useState(null)
  const [isCustomSubject, setIsCustomSubject] = useState(false)
  const [attendanceCourses, setAttendanceCourses] = useState([])
  const [attendanceCourseId, setAttendanceCourseId] = useState('')
  const [attendanceDate, setAttendanceDate] = useState(() => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10) })
  const [attendanceRows, setAttendanceRows] = useState([])
  const [attendanceSearch, setAttendanceSearch] = useState('')
  const [attendanceFilter, setAttendanceFilter] = useState('Todos')
  const [attendanceError, setAttendanceError] = useState('')
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceSaving, setAttendanceSaving] = useState(false)
  const [gradeAssignments, setGradeAssignments] = useState([])
  const [gradeAssignmentKey, setGradeAssignmentKey] = useState('')
  const [gradePeriod, setGradePeriod] = useState('Periodo 1')
  const [configuredAcademicPeriods, setConfiguredAcademicPeriods] = useState([])
  const [gradeAssessments, setGradeAssessments] = useState([])
  const [gradeAssessmentId, setGradeAssessmentId] = useState('')
  const [gradeAssessment, setGradeAssessment] = useState(null)
  const [gradeRows, setGradeRows] = useState([])
  const [gradeError, setGradeError] = useState('')
  const [gradeLoading, setGradeLoading] = useState(false)
  const [gradeSaving, setGradeSaving] = useState(false)
  const [gradeRule, setGradeRule] = useState(null)
  const [gradeRuleForm, setGradeRuleForm] = useState({ scaleMin: '', scaleMax: '', passingScore: '' })
  const [gradeRuleSaving, setGradeRuleSaving] = useState(false)
  const [assessmentWeight, setAssessmentWeight] = useState('100')
  const [assessmentWeightSaving, setAssessmentWeightSaving] = useState(false)
  const [assessmentDialog, setAssessmentDialog] = useState(false)
  const [assessmentCreating, setAssessmentCreating] = useState(false)
  const [assessmentMode, setAssessmentMode] = useState('file')
  const [assessmentCategory, setAssessmentCategory] = useState('assignment')
  const [assessmentIntegrityMonitoring, setAssessmentIntegrityMonitoring] = useState(true)
  const [integrityEventsDialog, setIntegrityEventsDialog] = useState(false)
  const [integrityEvents, setIntegrityEvents] = useState([])
  const [integrityEventsLoading, setIntegrityEventsLoading] = useState(false)
  const [assessmentPublished, setAssessmentPublished] = useState(true)
  const [assessmentQuestions, setAssessmentQuestions] = useState(() => [{ key: crypto.randomUUID(), prompt: '', options: ['', '', '', ''], correctOption: 0, points: '1' }])
  const [assessmentPublicationSaving, setAssessmentPublicationSaving] = useState(false)
  const [assessmentDeleting, setAssessmentDeleting] = useState(false)
  const [assessmentSubmissions, setAssessmentSubmissions] = useState([])
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false)
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [workStudentId, setWorkStudentId] = useState('')
  const [portalAssignments, setPortalAssignments] = useState([])
  const [portalCourseFilter, setPortalCourseFilter] = useState('Todos')
  const [portalAssignmentFilter, setPortalAssignmentFilter] = useState('Todas')
  const [portalAssignmentSearch, setPortalAssignmentSearch] = useState('')
  const [portalAssignmentsLoading, setPortalAssignmentsLoading] = useState(false)
  const [portalAssignmentsError, setPortalAssignmentsError] = useState('')
  const [submissionBusyId, setSubmissionBusyId] = useState('')
  const [submissionDeletingId, setSubmissionDeletingId] = useState('')
  const [submissionSearch, setSubmissionSearch] = useState('')
  const [submissionFilter, setSubmissionFilter] = useState('Todas')
  const [onlineExam, setOnlineExam] = useState(null)
  const [onlineExamAnswers, setOnlineExamAnswers] = useState({})
  const [onlineExamError, setOnlineExamError] = useState('')
  const [onlineExamBusy, setOnlineExamBusy] = useState(false)
  const [onlineDraftSaving, setOnlineDraftSaving] = useState(false)
  const [onlineDraftSaved, setOnlineDraftSaved] = useState(true)
  const onlineDraftQueue = useRef(Promise.resolve())
  const [reportCardOptions, setReportCardOptions] = useState({ students: [], years: [], courses: [] })
  const [reportCardStudentId, setReportCardStudentId] = useState('')
  const [reportCardYear, setReportCardYear] = useState('')
  const [reportCardCourseId, setReportCardCourseId] = useState('')
  const [reportCardPeriod, setReportCardPeriod] = useState('Periodo 1')
  const [reportCardData, setReportCardData] = useState(null)
  const [reportCardLoading, setReportCardLoading] = useState(false)
  const [reportCardError, setReportCardError] = useState('')
  const [publicationSaving, setPublicationSaving] = useState(false)
  const selectedGradeAssignment = gradeAssignments.find(item => `${item.courseId}|${item.subject}` === gradeAssignmentKey)
  const gradePeriodOptions = [...new Set(configuredAcademicPeriods.filter(period => !selectedGradeAssignment?.academicYear || period.academicYear === selectedGradeAssignment.academicYear).map(period => period.name))]
  const portalReportRole = ['acudiente', 'estudiante'].includes(user?.role)
  const reportCardPeriods = portalReportRole
    ? [...new Set((reportCardOptions.publications || []).filter(item => item.academicYear === reportCardYear && item.isPublished).map(item => item.period))]
    : [...new Set(configuredAcademicPeriods.filter(period => !reportCardYear || period.academicYear === reportCardYear).map(period => period.name))].length ? [...new Set(configuredAcademicPeriods.filter(period => !reportCardYear || period.academicYear === reportCardYear).map(period => period.name))] : ['Periodo 1', 'Periodo 2', 'Periodo 3', 'Periodo 4']
  const selectedPublication = (reportCardOptions.publications || []).find(item => item.academicYear === reportCardYear && item.period === reportCardPeriod)
  const selectedReportCourses = (reportCardOptions.courses || []).filter(item => item.studentId === reportCardStudentId && item.academicYear === reportCardYear)
  const portalStudent = portalStudents.find(student => student.id === workStudentId)
  const portalCourseOptions = [...new Set(portalAssignments.map(item => `${item.courseName} · ${item.academicYear}`))]
  const isPortalAssignmentSubmitted = item => item.deliveryMode === 'online' ? item.onlineStatus === 'submitted' : Boolean(item.submissionId)
  const isPortalAssignmentOverdue = item => !isPortalAssignmentSubmitted(item) && Boolean(item.dueAt && item.dueAt < getLocalDate())
  const filteredPortalAssignments = portalAssignments.filter(item => {
    const matchesCourse = portalCourseFilter === 'Todos' || `${item.courseName} · ${item.academicYear}` === portalCourseFilter
    const searchableText = `${item.title} ${item.subject} ${item.courseName} ${item.instructions || ''}`.toLocaleLowerCase('es')
    const matchesSearch = searchableText.includes(portalAssignmentSearch.trim().toLocaleLowerCase('es'))
    const matchesStatus = portalAssignmentFilter === 'Todas' ||
      (portalAssignmentFilter === 'Pendientes' && !isPortalAssignmentSubmitted(item)) ||
      (portalAssignmentFilter === 'Entregadas' && isPortalAssignmentSubmitted(item)) ||
      (portalAssignmentFilter === 'Calificadas' && item.score !== null) ||
      (portalAssignmentFilter === 'Vencidas' && isPortalAssignmentOverdue(item))
    return matchesCourse && matchesStatus && matchesSearch
  }).sort((a, b) => {
    const aSubmitted = isPortalAssignmentSubmitted(a)
    const bSubmitted = isPortalAssignmentSubmitted(b)
    if (aSubmitted !== bSubmitted) return aSubmitted ? 1 : -1
    if (!a.dueAt) return b.dueAt ? 1 : 0
    if (!b.dueAt) return -1
    return a.dueAt.localeCompare(b.dueAt)
  })
  const portalPendingCount = portalAssignments.filter(item => !isPortalAssignmentSubmitted(item)).length
  const portalOverdueCount = portalAssignments.filter(isPortalAssignmentOverdue).length
  const portalSubmittedCount = portalAssignments.filter(item => item.deliveryMode === 'online' ? item.onlineStatus === 'submitted' : Boolean(item.submissionId)).length
  const portalGradedCount = portalAssignments.filter(item => item.score !== null).length
  const filteredAssessmentSubmissions = assessmentSubmissions.filter(item => {
    const matchesSearch = item.studentName.toLocaleLowerCase('es').includes(submissionSearch.trim().toLocaleLowerCase('es'))
    const submitted = gradeAssessment?.deliveryMode === 'online' ? Boolean(item.onlineSubmittedAt) : Boolean(item.submissionId)
    const score = gradeAssessment?.deliveryMode === 'online' ? item.onlineScore : item.score
    const overdue = !submitted && Boolean(gradeAssessment?.dueAt && gradeAssessment.dueAt < getLocalDate())
    const matchesFilter = submissionFilter === 'Todas' ||
      (submissionFilter === 'Entregadas' && submitted) ||
      (submissionFilter === 'Pendientes' && !submitted) ||
      (submissionFilter === 'Vencidas' && overdue) ||
      (submissionFilter === 'Calificadas' && score !== null && score !== undefined)
    return matchesSearch && matchesFilter
  }).sort((a, b) => {
    const aSubmitted = gradeAssessment?.deliveryMode === 'online' ? Boolean(a.onlineSubmittedAt) : Boolean(a.submissionId)
    const bSubmitted = gradeAssessment?.deliveryMode === 'online' ? Boolean(b.onlineSubmittedAt) : Boolean(b.submissionId)
    return Number(aSubmitted) - Number(bSubmitted) || a.studentName.localeCompare(b.studentName, 'es')
  })

  const selectedSchool = schools.find(school => school.slug === loginSchool)
  const activeBrandSettings = selectedSchool || brandSettings
  const matchingSchools = schools.filter(school => `${school.name} ${school.slug}`.toLocaleLowerCase('es').includes(schoolSearch.trim().toLocaleLowerCase('es')))
  useEffect(() => {
    if (!accountMenuOpen) return
    const closeOnOutsideClick = event => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountMenuOpen])
  const logout = async () => {
    let confirmed = false
    try {
      if (pushTokenRef.current) await fetch('/api/push/unregister', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ token: pushTokenRef.current }) })
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      confirmed = response.ok
    } catch { /* Se cierra la vista local aunque el servidor no responda. */ }
    pushTokenRef.current = ''
    setAuthenticated(false); setTermsAccepted(false); setTermsLoading(false); setTermsError(''); setUser(null); setStudents([]); setDashboardData(null)
    setSchoolUsers([]); setPortalStudents([]); setPortalAssignments([]); setReportCardData(null)
    setAttendanceRows([]); setGradeRows([]); setAssessmentSubmissions([]); setUnreadNotifications(0); setQuery(''); setMenuOpen(false); setActive('Resumen')
    setLoginNotice(confirmed ? '' : 'No se pudo confirmar el cierre en el servidor. Comprueba tu conexión.')
  }
  const acceptTerms = async () => {
    setTermsBusy(true); setTermsError('')
    try {
      const response = await fetch('/api/legal/terms-acceptance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ version: LEGAL_TERMS_VERSION }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la aceptación.')
      setTermsAccepted(true)
    } catch (error) { setTermsError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setTermsBusy(false) }
  }
  useEffect(() => {
    if (!authenticated || !user?.id) { setTermsAccepted(false); setTermsLoading(false); return }
    let mounted = true
    setTermsLoading(true); setTermsError('')
    fetch('/api/legal/terms-status', { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar la aceptación de términos.')
      if (mounted) setTermsAccepted(Boolean(result.accepted && result.version === LEGAL_TERMS_VERSION))
    }).catch(error => { if (mounted) setTermsError(error.message || 'No se pudo consultar la aceptación de términos.') }).finally(() => { if (mounted) setTermsLoading(false) })
    return () => { mounted = false }
  }, [authenticated, user?.id])
  const login = async (event) => {
    event.preventDefault()
    setLoginError('')
    if (!loginSchool) return setLoginError('Selecciona tu colegio para continuar.')
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ school: loginSchool, email: form.get('email'), password: form.get('password') }) })
      const result = await response.json()
      if (!response.ok) return setLoginError(result.error || 'No pudimos iniciar sesión.')
      setTermsLoading(true)
      setUser(result.user)
      setLoginSchool(result.user.school.slug)
      setBrandSettings(schoolOption({ ...result.user.school, hasLogo: result.user.school.hasLogo }))
      setAuthenticated(true)
      setActive(['acudiente', 'estudiante'].includes(result.user.role) ? 'Mi aula' : 'Resumen')
      setLoginNotice('')
    } catch { setLoginError('No se pudo conectar con el servidor. Comprueba que esté en ejecución.') }
  }

  const changeOwnPassword = async event => {
    event.preventDefault(); setPasswordError('')
    const formElement = event.currentTarget; const form = new FormData(formElement)
    const currentPassword = String(form.get('currentPassword') || '')
    const newPassword = String(form.get('newPassword') || '')
    if (newPassword !== form.get('confirmPassword')) return setPasswordError('La confirmación no coincide con la nueva contraseña.')
    setPasswordBusy(true)
    try {
      const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ currentPassword, newPassword }) })
      const result = await response.json()
      if (!response.ok) return setPasswordError(result.error || 'No se pudo cambiar la contraseña.')
      setPasswordDialog(false); notify(result.message || 'Contraseña actualizada.')
    } catch { setPasswordError('No se pudo conectar con el servidor.') }
    finally { setPasswordBusy(false) }
  }

  useEffect(() => {
    if (!authenticated || active !== 'Configuración' || user?.role !== 'admin') return
    let alive = true
    setSchoolSettingsLoading(true); setSchoolSettingsError('')
    fetch('/api/school/settings', { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la configuración.')
      if (alive) { setSchoolSettings(result.settings); setSchoolLogoFile(null) }
    }).catch(error => { if (alive) setSchoolSettingsError(error.message || 'No se pudo conectar con el servidor.') }).finally(() => { if (alive) setSchoolSettingsLoading(false) })
    return () => { alive = false }
  }, [authenticated, active, user?.role])

  useEffect(() => {
    if (!authenticated || active !== 'Bitácora' || user?.role !== 'admin') return
    let alive = true
    setAuditLoading(true); setAuditError(''); setAuditEntries([]); setAuditTotal(0)
    const params = new URLSearchParams({ limit: '50', offset: String(auditOffset) })
    if (auditActionFilter.trim()) params.set('action', auditActionFilter.trim())
    if (auditFrom) params.set('from', auditFrom)
    if (auditTo) params.set('to', auditTo)
    fetch(`/api/audit-log?${params}`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar la bitácora.')
      if (alive) { setAuditEntries(result.entries || []); setAuditTotal(Number(result.total) || 0) }
    }).catch(error => { if (alive) setAuditError(error.message || 'No se pudo conectar con el servidor.') }).finally(() => { if (alive) setAuditLoading(false) })
    return () => { alive = false }
  }, [authenticated, active, user?.role, auditOffset, auditActionFilter, auditFrom, auditTo])

  const exportAudit = async () => {
    const params = new URLSearchParams()
    if (auditActionFilter.trim()) params.set('action', auditActionFilter.trim())
    if (auditFrom) params.set('from', auditFrom)
    if (auditTo) params.set('to', auditTo)
    try {
      const response = await fetch(`/api/audit-log/export?${params}`, { credentials: 'same-origin' })
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo exportar la bitácora.') }
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a')
      link.href = url; link.download = 'educa-bitacora.csv'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setAuditError(error.message || 'No se pudo exportar la bitácora.') }
  }

  const saveSchoolSettings = async event => {
    event.preventDefault(); setSchoolSettingsError(''); setSchoolSettingsBusy(true)
    const formElement = event.currentTarget; const form = new FormData(formElement)
    const payload = Object.fromEntries([...form.entries()].filter(([key]) => key !== 'logo' && key !== 'removeLogo'))
    payload.removeLogo = form.get('removeLogo') === 'on' && !schoolLogoFile
    try {
      if (schoolLogoFile) {
        const bytes = new Uint8Array(await schoolLogoFile.arrayBuffer())
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
        payload.logo = { fileName: schoolLogoFile.name, contentType: schoolLogoFile.type, fileBase64: btoa(binary) }
      }
      const response = await fetch('/api/school/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron guardar los cambios.')
      setSchoolSettings(result.settings); setSchoolLogoFile(null)
      setUser(current => current ? { ...current, school: { ...current.school, name: result.settings.name, primaryColor: result.settings.primaryColor, hasLogo: result.settings.hasLogo } } : current)
      notify('Datos y apariencia del colegio actualizados.')
    } catch (error) { setSchoolSettingsError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setSchoolSettingsBusy(false) }
  }

  useEffect(() => {
    let mounted = true
    Promise.all([fetch('/api/auth/me', { credentials: 'same-origin' }), fetch('/api/auth/setup-status'), fetch('/api/schools')]).then(async ([session, setup, schoolResponse]) => {
      const setupResult = await setup.json()
      const schoolResult = await schoolResponse.json()
      if (!mounted) return
      setApiReady(true)
      setSetupRequired(setupResult.setupRequired)
      setSchools((schoolResult.schools || []).map(schoolOption))
      setBrandSettings(schoolOption(schoolResult.schools?.find(school => school.slug === loginSchool) || schoolResult.schools?.[0] || { name: 'educa', slug: '' }))
      if (session.ok) { const data = await session.json(); setTermsLoading(true); setUser(data.user); setAuthenticated(true); setActive(['acudiente', 'estudiante'].includes(data.user.role) ? 'Mi aula' : 'Resumen') }
    }).catch(() => { if (mounted) setApiReady(false) }).finally(() => { if (mounted) setLoadingAuth(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!authenticated || active !== 'Resumen' || !['admin', 'rectoria'].includes(user?.role)) return
    let alive = true
    setDashboardLoading(true); setDashboardError('')
    const params = new URLSearchParams({ date: dashboardDate })
    fetch(`/api/dashboard?${params}`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar el panel.')
      if (alive) setDashboardData(result)
    }).catch(error => { if (alive) setDashboardError(error.message || 'No se pudo conectar con el servidor.') }).finally(() => { if (alive) setDashboardLoading(false) })
    return () => { alive = false }
  }, [authenticated, active, user?.role, dashboardDate])

  const notify = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800) }
  useEffect(() => { if (!authenticated || !['Calificaciones', 'Boletines'].includes(active)) return; fetch('/api/academic-periods', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { periods: [] }).then(result => setConfiguredAcademicPeriods(result.periods || [])).catch(() => setConfiguredAcademicPeriods([])) }, [authenticated, active])
  const loadStudents = async () => {
    setStudentsError('')
    const params = new URLSearchParams({ search: query, status: statusFilter })
    try {
      const response = await fetch(`/api/students?${params}`, { credentials: 'same-origin' })
      const result = await response.json()
      if (response.status === 401) { setAuthenticated(false); setUser(null); return }
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la lista de estudiantes.')
      setStudents(result.students || [])
    } catch (error) {
      setStudents([]); setStudentsError(error.message || 'No se pudo conectar con el servidor.')
    }
  }
  useEffect(() => {
    if (!authenticated || !['admin', 'secretaria', 'rectoria', 'docente'].includes(user?.role)) return
    const timer = window.setTimeout(() => loadStudents(), 250)
    return () => window.clearTimeout(timer)
  }, [authenticated, user?.role, query, statusFilter])
  useEffect(() => {
    const onKeyDown = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && ['admin', 'rectoria', 'secretaria'].includes(user?.role)) {
        event.preventDefault()
        setActive('Estudiantes')
        window.setTimeout(() => searchInputRef.current?.focus(), 0)
      }
      if (event.key === 'Escape') {
        if (menuOpen) setMenuOpen(false)
        if (document.activeElement === searchInputRef.current) { setQuery(''); searchInputRef.current?.blur() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [user?.role, menuOpen])
  const visibleStudents = students
  const filteredAttendanceRows = attendanceRows.filter(student => {
    const matchesSearch = student.name.toLocaleLowerCase('es').includes(attendanceSearch.trim().toLocaleLowerCase('es'))
    const matchesStatus = attendanceFilter === 'Todos' || (attendanceFilter === 'Sin registrar' ? !student.attendanceStatus : student.attendanceStatus === attendanceFilter)
    return matchesSearch && matchesStatus
  })
  const isAttendanceChanged = student => (student.attendanceStatus || null) !== (student.originalAttendanceStatus || null)
  const attendanceMarkedCount = attendanceRows.filter(student => student.attendanceStatus).length
  const attendanceProgress = attendanceRows.length ? Math.round(attendanceMarkedCount * 100 / attendanceRows.length) : 0
  const markUnmarkedPresent = () => setAttendanceRows(rows => rows.map(student => student.attendanceStatus ? student : { ...student, attendanceStatus: 'Presente' }))
  const loadUsers = async () => {
    const response = await fetch('/api/users', { credentials: 'same-origin' })
    const result = await response.json()
    if (response.ok) setSchoolUsers(result.users || [])
    else if (response.status === 401) { setAuthenticated(false); setUser(null) }
  }
  useEffect(() => { if (authenticated && active === 'Usuarios y accesos') loadUsers() }, [authenticated, active])
  useEffect(() => {
    if (!accountDialog && !(authenticated && active === 'Usuarios y accesos')) return
    fetch('/api/students?status=Activo', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { students: [] }).then(result => setLinkableStudents(result.students || [])).catch(() => setLinkableStudents([]))
  }, [accountDialog, authenticated, active])
  useEffect(() => {
    if (!authenticated || !['acudiente', 'estudiante'].includes(user?.role)) return
    fetch('/api/portal/students', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { students: [] }).then(result => setPortalStudents(result.students || [])).catch(() => setPortalStudents([]))
  }, [authenticated, user?.role])
  const loadCourses = async () => {
    const [courseResponse, userResponse] = await Promise.all([fetch('/api/courses', { credentials: 'same-origin' }), fetch('/api/teachers', { credentials: 'same-origin' })])
    const courseResult = await courseResponse.json()
    const userResult = await userResponse.json()
    if (courseResponse.ok) setCourses(courseResult.courses || [])
    if (userResponse.ok) setTeachers(userResult.teachers || [])
  }
  useEffect(() => { if (authenticated && active === 'Cursos y docentes') loadCourses() }, [authenticated, active])
  useEffect(() => {
    if (!authenticated || user?.role !== 'docente') return
    fetch('/api/teacher/courses', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { courses: [] }).then(result => setTeacherCourses(result.courses || [])).catch(() => setTeacherCourses([]))
  }, [authenticated, user?.role])
  const saveCourse = async event => {
    event.preventDefault(); setCourseError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch(editingCourse ? `/api/courses/${editingCourse.id}` : '/api/courses', { method: editingCourse ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) })
      const result = await response.json()
      if (!response.ok) return setCourseError(result.error || 'No se pudo guardar el curso.')
      await loadCourses(); setCourseDialog(false); setEditingCourse(null); notify(result.restored ? 'Curso reactivado y conservado con su historial.' : editingCourse ? 'Curso actualizado.' : 'Curso creado.')
    } catch { setCourseError('No se pudo conectar con el servidor.') }
  }
  const archiveCourse = async course => {
    if (!window.confirm(`¿Dar de baja el curso ${course.name} (${course.academicYear})? Se ocultará de asistencia y calificaciones, pero se conservarán sus datos y podrás reactivarlo.`)) return
    try {
      const response = await fetch(`/api/courses/${course.id}`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) return notify(result.error || 'No se pudo dar de baja el curso.')
      await loadCourses(); notify('Curso dado de baja; su historial se conservó.')
    } catch { notify('No se pudo conectar con el servidor.') }
  }
  const setCourseActive = async (course, active) => {
    try {
      const response = await fetch(`/api/courses/${course.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ active }) })
      const result = await response.json()
      if (!response.ok) return notify(result.error || 'No se pudo cambiar el estado del curso.')
      await loadCourses(); notify(active ? 'Curso reactivado.' : 'Curso dado de baja.')
    } catch { notify('No se pudo conectar con el servidor.') }
  }
  const loadCourseHistory = async (course, kind, offset = 0) => {
    if (!course) return
    setHistoryLoading(true); setHistoryError('')
    try {
      const params = new URLSearchParams({ kind, limit: '25', offset: String(offset) })
      const response = await fetch(`/api/courses/${course.id}/history?${params}`, { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar el historial.')
      setHistoryRecords(result.records || []); setHistoryTotal(result.total || 0); setHistoryOffset(result.offset || 0)
    } catch (error) { setHistoryRecords([]); setHistoryTotal(0); setHistoryError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setHistoryLoading(false) }
  }
  const openCourseHistory = (course, kind = 'attendance') => {
    setHistoryCourse(course); setHistoryKind(kind); setHistoryOffset(0); setHistoryRecords([]); setHistoryTotal(0)
    loadCourseHistory(course, kind, 0)
  }
  const loadEnrollmentRequests = async () => {
    const params = new URLSearchParams({ search: enrollmentSearch, status: enrollmentStatusFilter })
    const response = await fetch(`/api/enrollments?${params}`, { credentials: 'same-origin' })
    const result = await response.json()
    if (response.ok) setEnrollmentRequests(result.requests || [])
    else if (response.status !== 401) setEnrollmentError(result.error || 'No se pudieron cargar las solicitudes.')
  }
  const loadEnrollmentHistory = async () => {
    const response = await fetch('/api/enrollments/history', { credentials: 'same-origin' })
    const result = await response.json()
    if (response.ok) setEnrollmentHistory(result.records || [])
    else setEnrollmentError(result.error || 'No se pudo cargar el historial de matrículas.')
  }
  useEffect(() => {
    if (!authenticated || active !== 'Matrículas' || !['admin', 'rectoria', 'secretaria'].includes(user?.role)) return
    setEnrollmentError('')
    if (enrollmentTab === 'requests') loadEnrollmentRequests().catch(() => setEnrollmentError('No se pudo conectar con el servidor.'))
    else loadEnrollmentHistory().catch(() => setEnrollmentError('No se pudo conectar con el servidor.'))
  }, [authenticated, active, user?.role, enrollmentTab, enrollmentSearch, enrollmentStatusFilter])
  const createEnrollmentRequest = async event => {
    event.preventDefault(); setEnrollmentError(''); setEnrollmentBusy(true)
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch('/api/enrollments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) })
      const result = await response.json()
      if (!response.ok) return setEnrollmentError(result.error || 'No se pudo crear la solicitud.')
      setEnrollmentDialog(false); await loadEnrollmentRequests(); notify('Solicitud de matrícula creada.')
    } catch { setEnrollmentError('No se pudo conectar con el servidor.') }
    finally { setEnrollmentBusy(false) }
  }
  const updateEnrollmentRequest = async (request, status) => {
    setEnrollmentError('')
    try {
      const response = await fetch(`/api/enrollments/${request.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ status, pendingDocuments: request.pendingDocuments, notes: request.notes }) })
      const result = await response.json()
      if (!response.ok) return setEnrollmentError(result.error || 'No se pudo actualizar la solicitud.')
      await loadEnrollmentRequests(); if (status === 'Aprobada') await loadEnrollmentHistory()
      notify(status === 'Aprobada' ? 'Matrícula aprobada y añadida al historial.' : 'Estado de matrícula actualizado.')
    } catch { setEnrollmentError('No se pudo conectar con el servidor.') }
  }
  const openTransferDialog = async enrollment => {
    setEnrollmentError('')
    try {
      const response = await fetch('/api/courses', { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) return setEnrollmentError(result.error || 'No se pudieron consultar los cursos.')
      setTransferCourses((result.courses || []).filter(course => course.isActive && course.academicYear === enrollment.academicYear))
      setTransferTarget(enrollment)
    } catch { setEnrollmentError('No se pudo conectar con el servidor.') }
  }
  const transferStudent = async event => {
    event.preventDefault(); setEnrollmentError(''); setEnrollmentBusy(true)
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch(`/api/enrollments/history/${transferTarget.id}/transfer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) })
      const result = await response.json()
      if (!response.ok) return setEnrollmentError(result.error || 'No se pudo registrar el traslado.')
      setTransferTarget(null); await loadEnrollmentHistory(); notify('Traslado registrado y guardado en el historial.')
    } catch { setEnrollmentError('No se pudo conectar con el servidor.') }
    finally { setEnrollmentBusy(false) }
  }
  const loadCommunications = async () => {
    const response = await fetch('/api/communications', { credentials: 'same-origin' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las comunicaciones.')
    setCommunications(result.communications || [])
  }
  useEffect(() => {
    if (!authenticated || active !== 'Comunicaciones') return
    let alive = true
    setCommunicationError('')
    fetch('/api/communications', { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las comunicaciones.')
      if (alive) setCommunications(result.communications || [])
    }).catch(error => { if (alive) setCommunicationError(error.message || 'No se pudo conectar con el servidor.') })
    if (['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'orientacion'].includes(user?.role)) {
      fetch('/api/communications/options', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { courses: [] }).then(result => { if (alive) setCommunicationCourses(result.courses || []) }).catch(() => { if (alive) setCommunicationCourses([]) })
    }
    return () => { alive = false }
  }, [authenticated, active, user?.role])
  const createCommunication = async event => {
    event.preventDefault(); setCommunicationError(''); setCommunicationBusy(true)
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch('/api/communications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) })
      const result = await response.json()
      if (!response.ok) return setCommunicationError(result.error || 'No se pudo enviar la comunicación.')
      setCommunicationDialog(false); await loadCommunications(); notify(`Aviso enviado a ${result.recipientCount} cuentas del colegio.`)
    } catch (error) { setCommunicationError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setCommunicationBusy(false) }
  }
  const markCommunicationRead = async communication => {
    try {
      const response = await fetch(`/api/communications/${communication.id}/read`, { method: 'PATCH', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) return setCommunicationError(result.error || 'No se pudo marcar como leído.')
      setCommunications(items => items.map(item => item.id === communication.id ? { ...item, readAt: new Date().toISOString() } : item))
    } catch { setCommunicationError('No se pudo conectar con el servidor.') }
  }
  const deleteCommunication = async communication => {
    if (!window.confirm(`¿Eliminar “${communication.title}”? El aviso desaparecerá de las bandejas de sus destinatarios. Esta acción no se puede deshacer.`)) return
    setCommunicationDeletingId(communication.id); setCommunicationError('')
    try {
      const response = await fetch(`/api/communications/${communication.id}`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) return setCommunicationError(result.error || 'No se pudo eliminar el aviso.')
      setCommunications(items => items.filter(item => item.id !== communication.id))
      notify('Comunicación eliminada de las bandejas.')
    } catch { setCommunicationError('No se pudo conectar con el servidor.') }
    finally { setCommunicationDeletingId('') }
  }
  useEffect(() => {
    if (!authenticated || active !== 'Reportes' || !['admin', 'rectoria', 'secretaria', 'docente'].includes(user?.role)) return
    fetch('/api/reports/options', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { courses: [] }).then(result => setReportCourses(result.courses || [])).catch(() => setReportCourses([]))
  }, [authenticated, active, user?.role])
  const generateReport = async () => {
    setReportError(''); setReportLoading(true); setReportRows([]); setReportTruncated(false)
    try {
      const params = new URLSearchParams({ type: reportType, from: reportFrom, to: reportTo })
      if (reportCourseId) params.set('courseId', reportCourseId)
      if (reportAcademicYear) params.set('academicYear', reportAcademicYear)
      const response = await fetch(`/api/reports?${params}`, { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo generar el reporte.')
      setReportRows(result.records || []); setReportTruncated(Boolean(result.truncated))
    } catch (error) { setReportError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setReportLoading(false) }
  }
  const exportReport = () => {
    if (!reportRows.length) return notify('Genera un reporte con resultados antes de exportar.')
    const fields = Object.keys(reportRows[0])
    const safe = value => { const text = String(value ?? ''); const protect = '=+-@'.includes(text[0]) || text[0] === '\t' || text[0] === '\r'; return `"${(protect ? `'${text}` : text).replaceAll('"', '""')}"` }
    const csv = [fields.map(safe).join(','), ...reportRows.map(row => fields.map(field => safe(row[field])).join(','))].join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `reporte-${reportType}-${getLocalDate()}.csv`
    link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  const assignTeacher = async event => {
    event.preventDefault(); setCourseError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    if (values.subject === '__otra__') values.subject = values.customSubject
    delete values.customSubject
    const method = editingAssignment ? 'PUT' : 'POST'
    if (editingAssignment) { values.originalTeacherId = editingAssignment.id; values.originalSubject = editingAssignment.subject }
    try {
      const response = await fetch(`/api/courses/${assignmentCourse.id}/teachers`, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) })
      const result = await response.json()
      if (!response.ok) return setCourseError(result.error || 'No se pudo asignar el docente.')
      setAssignmentCourse(null); setEditingAssignment(null); await loadCourses(); notify(editingAssignment ? 'Asignación docente actualizada.' : 'Docente asignado al curso.')
    } catch { setCourseError('No se pudo conectar con el servidor.') }
  }
  const deleteTeacherAssignment = async (course, assignment) => {
    if (!window.confirm(`¿Quitar a ${assignment.name} de ${assignment.subject} en ${course.name}? Las notas y asistencias ya guardadas no se borrarán.`)) return
    try {
      const response = await fetch(`/api/courses/${course.id}/teachers`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ teacherId: assignment.id, subject: assignment.subject }) })
      const result = await response.json()
      if (!response.ok) return notify(result.error || 'No se pudo quitar la asignación.')
      await loadCourses(); notify('Asignación docente eliminada. Los registros académicos se conservaron.')
    } catch { notify('No se pudo conectar con el servidor.') }
  }
  const loadTeacherRoster = async course => {
    const response = await fetch(`/api/teacher/courses/${course.id}/students`, { credentials: 'same-origin' })
    const result = await response.json()
    if (!response.ok) return notify(result.error || 'No se pudo cargar el grupo.')
    setTeacherRoster(result.students || [])
  }
  useEffect(() => {
    if (!authenticated || active !== 'Asistencia' || !['admin', 'rectoria', 'secretaria', 'docente'].includes(user?.role)) return
    let alive = true
    const endpoint = user.role === 'docente' ? '/api/teacher/courses' : '/api/courses'
    fetch(endpoint, { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { courses: [] }).then(result => {
      if (!alive) return
      const list = (result.courses || []).filter(course => user.role === 'docente' || Boolean(course.isActive)).filter((course, index, all) => all.findIndex(item => item.id === course.id) === index)
      setAttendanceCourses(list)
      setAttendanceCourseId(current => list.some(course => course.id === current) ? current : list[0]?.id || '')
    }).catch(() => { if (alive) { setAttendanceCourses([]); setAttendanceCourseId('') } })
    return () => { alive = false }
  }, [authenticated, active, user?.role])
  useEffect(() => {
    if (!authenticated || active !== 'Asistencia') return
    if (!attendanceCourseId || !attendanceDate) { setAttendanceRows([]); setAttendanceLoading(false); return }
    let alive = true
    setAttendanceLoading(true); setAttendanceError('')
    const params = new URLSearchParams({ courseId: attendanceCourseId, date: attendanceDate })
    fetch(`/api/attendance?${params}`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la asistencia.')
      if (alive) setAttendanceRows((result.students || []).map(student => ({ ...student, originalAttendanceStatus: student.attendanceStatus || null })))
    }).catch(error => { if (alive) { setAttendanceRows([]); setAttendanceError(error.message || 'No se pudo conectar con el servidor.') } }).finally(() => { if (alive) setAttendanceLoading(false) })
    return () => { alive = false }
  }, [authenticated, active, attendanceCourseId, attendanceDate])
  const saveAttendance = async () => {
    const records = attendanceRows.filter(isAttendanceChanged).map(student => ({ studentId: student.id, status: student.attendanceStatus || '' }))
    if (!records.length) return notify('Marca al menos un estado antes de guardar.')
    setAttendanceSaving(true); setAttendanceError('')
    try {
      const response = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ courseId: attendanceCourseId, date: attendanceDate, records }) })
      const result = await response.json()
      if (!response.ok) return setAttendanceError(result.error || 'No se pudo guardar la asistencia.')
      notify(`Asistencia guardada para ${result.saved} estudiante${result.saved === 1 ? '' : 's'}.`)
      const params = new URLSearchParams({ courseId: attendanceCourseId, date: attendanceDate })
      const updated = await fetch(`/api/attendance?${params}`, { credentials: 'same-origin' })
      const data = await updated.json()
      if (updated.ok) setAttendanceRows(data.students || [])
    } catch { setAttendanceError('No se pudo conectar con el servidor.') }
    finally { setAttendanceSaving(false) }
  }
  useEffect(() => {
    if (!authenticated || active !== 'Calificaciones' || !['admin', 'rectoria', 'secretaria', 'docente'].includes(user?.role)) return
    let alive = true
    fetch('/api/grades/courses', { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las asignaturas.')
      if (!alive) return
      const unique = (result.assignments || []).filter((item, index, all) => all.findIndex(other => other.courseId === item.courseId && other.subject === item.subject) === index)
      setGradeAssignments(unique)
      setGradeAssignmentKey(current => unique.some(item => `${item.courseId}|${item.subject}` === current) ? current : unique[0] ? `${unique[0].courseId}|${unique[0].subject}` : '')
    }).catch(error => { if (alive) setGradeError(error.message || 'No se pudieron cargar las asignaturas.') })
    return () => { alive = false }
  }, [authenticated, active, user?.role])
  useEffect(() => {
    if (!authenticated || active !== 'Calificaciones' || !selectedGradeAssignment || !gradePeriod) return
    let alive = true
    setGradeError('')
    const params = new URLSearchParams({ courseId: selectedGradeAssignment.courseId, subject: selectedGradeAssignment.subject, period: gradePeriod })
    fetch(`/api/grades/assessments?${params}`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las evaluaciones.')
      if (!alive) return
      const list = result.assessments || []
      setGradeAssessments(list)
      setGradeAssessmentId(current => list.some(item => item.id === current) ? current : list[0]?.id || '')
      if (!list.length) { setGradeAssessment(null); setGradeRows([]) }
    }).catch(error => { if (alive) { setGradeAssessments([]); setGradeAssessmentId(''); setGradeAssessment(null); setGradeRows([]); setGradeError(error.message || 'No se pudieron cargar las evaluaciones.') } })
    return () => { alive = false }
  }, [authenticated, active, selectedGradeAssignment?.courseId, selectedGradeAssignment?.subject, gradePeriod])
  useEffect(() => {
    if (!authenticated || active !== 'Calificaciones' || !selectedGradeAssignment || !gradePeriod) return
    let alive = true
    const params = new URLSearchParams({ courseId: selectedGradeAssignment.courseId, subject: selectedGradeAssignment.subject, period: gradePeriod })
    fetch(`/api/grades/rule?${params}`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo consultar la escala.')
      if (!alive) return
      const rule = result.rule || null
      setGradeRule(rule)
      setGradeRuleForm(rule ? { scaleMin: String(rule.scaleMin), scaleMax: String(rule.scaleMax), passingScore: String(rule.passingScore) } : { scaleMin: '', scaleMax: '', passingScore: '' })
    }).catch(error => { if (alive) setGradeError(error.message || 'No se pudo consultar la escala.') })
    return () => { alive = false }
  }, [authenticated, active, selectedGradeAssignment?.courseId, selectedGradeAssignment?.subject, gradePeriod])
  const saveGradeRule = async event => {
    event.preventDefault(); setGradeError('')
    if (!selectedGradeAssignment) return setGradeError('Selecciona curso y asignatura.')
    setGradeRuleSaving(true)
    try {
      const response = await fetch('/api/grades/rule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ courseId: selectedGradeAssignment.courseId, subject: selectedGradeAssignment.subject, period: gradePeriod, scaleMin: Number(gradeRuleForm.scaleMin), scaleMax: Number(gradeRuleForm.scaleMax), passingScore: Number(gradeRuleForm.passingScore) }) })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudo guardar la escala.')
      setGradeRule(result.rule); notify('Escala y nota aprobatoria guardadas para este periodo.')
    } catch { setGradeError('No se pudo conectar con el servidor.') }
    finally { setGradeRuleSaving(false) }
  }
  useEffect(() => {
    if (!authenticated || active !== 'Calificaciones' || !gradeAssessmentId) return
    let alive = true
    setAssessmentSubmissions([]); setSubmissionsLoaded(false); setSubmissionSearch(''); setSubmissionFilter('Todas')
    setGradeLoading(true)
    fetch(`/api/grades/assessments/${gradeAssessmentId}`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la lista de estudiantes.')
      if (alive) { setGradeAssessment(result.assessment); setAssessmentWeight(String(result.assessment.weightPercent ?? 100)); setGradeRows(result.students || []) }
    }).catch(error => { if (alive) { setGradeAssessment(null); setGradeRows([]); setGradeError(error.message || 'No se pudo cargar la evaluación.') } }).finally(() => { if (alive) setGradeLoading(false) })
    return () => { alive = false }
  }, [authenticated, active, gradeAssessmentId])
  const createAssessment = async event => {
    event.preventDefault(); setGradeError('')
    if (!selectedGradeAssignment) return setGradeError('Selecciona primero curso y asignatura.')
    const formData = new FormData(event.currentTarget)
    const form = Object.fromEntries([...formData.entries()].filter(([key]) => key !== 'images'))
    const imageFiles = formData.getAll('images').filter(file => file instanceof File && file.size > 0)
    if (imageFiles.length > 5) return setGradeError('Puedes adjuntar hasta 5 imágenes.')
    if (imageFiles.some(file => file.size > 4 * 1024 * 1024) || imageFiles.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) return setGradeError('Cada imagen puede ocupar hasta 4 MB y el total no puede superar 20 MB.')
    const maxScore = assessmentMode === 'online' ? Number(assessmentQuestions.reduce((total, question) => total + Number(question.points || 0), 0).toFixed(2)) : Number(form.maxScore)
    const questions = assessmentMode === 'online' ? assessmentQuestions.map(({ prompt, options, correctOption, points }) => ({ prompt, options, correctOption, points: Number(points) })) : []
    const imageMimeByExtension = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
    const images = []
    for (const file of imageFiles) {
      const extension = file.name.split('.').pop().toLowerCase()
      const contentType = file.type || imageMimeByExtension[extension] || ''
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      images.push({ fileName: file.name, contentType, fileBase64: btoa(binary) })
    }
    setAssessmentCreating(true)
    try {
      const response = await fetch('/api/grades/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...form, courseId: selectedGradeAssignment.courseId, subject: selectedGradeAssignment.subject, period: gradePeriod, deliveryMode: assessmentCategory === 'class_activity' ? 'file' : assessmentMode, activityType: assessmentCategory, integrityMonitoring: assessmentCategory === 'assignment' && assessmentMode === 'online' && assessmentIntegrityMonitoring, isPublished: assessmentMode === 'file' || assessmentPublished, externalFormUrl: assessmentCategory === 'class_activity' ? '' : String(form.externalFormUrl || '').trim(), questions, images, maxScore, weightPercent: Number(form.weightPercent) }) })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudo crear la evaluación.')
      setGradeAssessments(current => [result.assessment, ...current]); setGradeAssessmentId(result.assessment.id); setAssessmentDialog(false); notify(assessmentCategory === 'class_activity' ? 'Actividad de clase creada. Ingresa sus notas por estudiante.' : 'Evaluación creada.')
    } catch { setGradeError('No se pudo conectar con el servidor.') }
    finally { setAssessmentCreating(false) }
  }
  const toggleAssessmentPublication = async () => {
    if (!gradeAssessment || gradeAssessment.deliveryMode !== 'online') return
    const isPublished = !Boolean(gradeAssessment.isPublished)
    setAssessmentPublicationSaving(true); setGradeError('')
    try {
      const response = await fetch(`/api/grades/assessments/${gradeAssessment.id}/publication`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ isPublished }) })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudo cambiar la publicación.')
      setGradeAssessment(current => current ? { ...current, isPublished: result.isPublished } : current)
      setGradeAssessments(items => items.map(item => item.id === gradeAssessment.id ? { ...item, isPublished: result.isPublished } : item))
      notify(isPublished ? 'Evaluación publicada en Mi aula.' : 'Evaluación retirada del portal.')
    } catch { setGradeError('No se pudo conectar con el servidor.') }
    finally { setAssessmentPublicationSaving(false) }
  }
  const deleteAssessment = async () => {
    if (!gradeAssessment) return
    if (!window.confirm(`¿Eliminar permanentemente “${gradeAssessment.title}”? También se eliminarán las notas, preguntas, intentos, imágenes y archivos entregados asociados. Esta acción no se puede deshacer.`)) return
    setAssessmentDeleting(true); setGradeError('')
    try {
      const response = await fetch(`/api/grades/assessments/${gradeAssessment.id}`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudo eliminar la evaluación.')
      setGradeAssessments(items => items.filter(item => item.id !== gradeAssessment.id))
      setGradeAssessmentId(''); setGradeAssessment(null); setGradeRows([]); setAssessmentSubmissions([]); setSubmissionsLoaded(false); setSubmissionSearch(''); setSubmissionFilter('Todas')
      notify('Evaluación y datos asociados eliminados.')
    } catch { setGradeError('No se pudo conectar con el servidor.') }
    finally { setAssessmentDeleting(false) }
  }
  const saveAssessmentWeight = async () => {
    if (!gradeAssessmentId) return
    setAssessmentWeightSaving(true); setGradeError('')
    try {
      const response = await fetch(`/api/grades/assessments/${gradeAssessmentId}/weight`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ weightPercent: Number(assessmentWeight) }) })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudo guardar la ponderación.')
      setAssessmentWeight(String(result.weightPercent)); setGradeAssessment(current => current ? { ...current, weightPercent: result.weightPercent } : current)
      setGradeAssessments(items => items.map(item => item.id === gradeAssessmentId ? { ...item, weightPercent: result.weightPercent } : item))
      notify('Ponderación de evaluación actualizada.')
    } catch { setGradeError('No se pudo conectar con el servidor.') }
    finally { setAssessmentWeightSaving(false) }
  }
  const saveGrades = async () => {
    const records = gradeRows.filter(student => student.score !== null && student.score !== '').map(student => ({ studentId: student.id, score: Number(student.score), comment: student.comment || '' }))
    if (!records.length) return notify('Ingresa al menos una nota antes de guardar.')
    setGradeSaving(true); setGradeError('')
    try {
      const response = await fetch(`/api/grades/assessments/${gradeAssessmentId}/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ records }) })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudieron guardar las notas.')
      const refreshed = await fetch(`/api/grades/assessments/${gradeAssessmentId}`, { credentials: 'same-origin' })
      const data = await refreshed.json()
      if (refreshed.ok) { setGradeAssessment(data.assessment); setGradeRows(data.students || []) }
      if (submissionsLoaded) await loadAssessmentSubmissions()
      notify(`Se guardaron ${result.saved} calificación${result.saved === 1 ? '' : 'es'}.`)
    } catch { setGradeError('No se pudo conectar con el servidor.') }
    finally { setGradeSaving(false) }
  }
  const loadIntegrityEvents = async () => {
    if (!gradeAssessmentId) return
    setIntegrityEventsLoading(true); setGradeError('')
    try {
      const response = await fetch(`/api/grades/assessments/${gradeAssessmentId}/integrity-events`, { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las incidencias.')
      setIntegrityEvents(result.events || []); setIntegrityEventsDialog(true)
    } catch (error) { setGradeError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setIntegrityEventsLoading(false) }
  }
  const loadAssessmentSubmissions = async () => {
    if (!gradeAssessmentId) return
    setSubmissionsLoading(true); setGradeError('')
    try {
      const response = await fetch(`/api/grades/assessments/${gradeAssessmentId}/submissions`, { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron consultar las entregas.')
      setAssessmentSubmissions(result.submissions || [])
      setSubmissionsLoaded(true)
    } catch (error) { setGradeError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setSubmissionsLoading(false) }
  }
  const downloadWorkFile = async (submissionId, suggestedName) => {
    try {
      const response = await fetch(`/api/grades/submissions/${submissionId}/file`, { credentials: 'same-origin' })
      if (!response.ok) { const result = await response.json(); return notify(result.error || 'No se pudo descargar el archivo.') }
      const blob = await response.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob); link.download = suggestedName || 'trabajo-entregado'; link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch { notify('No se pudo conectar con el servidor.') }
  }
  const deleteStudentSubmission = async submission => {
    if (!window.confirm(`¿Eliminar todas las versiones de la entrega de ${submission.studentName}? La nota de la evaluación no se borrará.`)) return
    setSubmissionDeletingId(submission.submissionId); setGradeError('')
    try {
      const response = await fetch(`/api/grades/submissions/${submission.submissionId}`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudo eliminar la entrega.')
      setAssessmentSubmissions(rows => rows.map(row => row.studentId === submission.studentId ? { ...row, submissionId: null, fileName: null, uploadedAt: null, submissionNo: null, attempts: 0 } : row))
      notify('Todas las versiones de la entrega fueron eliminadas. La calificación se conservó.')
    } catch { setGradeError('No se pudo conectar con el servidor.') }
    finally { setSubmissionDeletingId('') }
  }
  useEffect(() => {
    if (portalStudents.length && !portalStudents.some(student => student.id === workStudentId)) setWorkStudentId(portalStudents[0].id)
  }, [portalStudents, workStudentId])
  useEffect(() => {
    setPortalAssignments([]); setWorkStudentId(''); setReportCardData(null); setAssessmentSubmissions([]); setOnlineExam(null); setOnlineExamAnswers({})
  }, [user?.id])
  useEffect(() => {
    if (!authenticated || active !== 'Mi aula' || !workStudentId || !['acudiente', 'estudiante'].includes(user?.role)) return
    let alive = true
    setPortalAssignmentsLoading(true); setPortalAssignmentsError('')
    const params = new URLSearchParams({ studentId: workStudentId })
    fetch(`/api/portal/assignments?${params}`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los trabajos.')
      if (alive) setPortalAssignments(result.assignments || [])
    }).catch(error => { if (alive) { setPortalAssignments([]); setPortalAssignmentsError(error.message || 'No se pudo conectar con el servidor.') } }).finally(() => { if (alive) setPortalAssignmentsLoading(false) })
    return () => { alive = false }
  }, [authenticated, active, workStudentId, user?.role])
  useEffect(() => {
    if (!onlineExam?.attemptId || onlineExamBusy || !Object.keys(onlineExamAnswers).length) return
    const answers = { ...onlineExamAnswers }
    const timer = window.setTimeout(() => {
      onlineDraftQueue.current = onlineDraftQueue.current.catch(() => {}).then(async () => {
        setOnlineDraftSaving(true)
        try {
          const response = await fetch(`/api/portal/online-assessments/${onlineExam.id}/draft`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ studentId: workStudentId, answers }) })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'No se pudo guardar el borrador de respuestas.')
          setOnlineDraftSaved(true)
          setOnlineExamError('')
        } catch (error) { setOnlineDraftSaved(false); setOnlineExamError(error.message || 'No se pudo guardar el borrador de respuestas.') }
        finally { setOnlineDraftSaving(false) }
      })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [onlineExam?.attemptId, onlineExam?.id, onlineExamBusy, onlineExamAnswers, workStudentId])
  useEffect(() => {
    if (!onlineExam?.monitoringEnabled || !onlineExam?.attemptId) return
    const lastSent = new Map()
    const recordEvent = eventType => {
      const now = Date.now()
      if (now - (lastSent.get(eventType) || 0) < 1200) return
      lastSent.set(eventType, now)
      fetch(`/api/portal/online-assessments/${onlineExam.id}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true,
        body: JSON.stringify({ studentId: workStudentId, attemptId: onlineExam.attemptId, eventType }),
      }).catch(() => {})
    }
    const visibilityChanged = () => { if (document.visibilityState === 'hidden') recordEvent('tab_hidden') }
    const windowBlurred = () => recordEvent('window_blur')
    const pageLeaving = () => recordEvent('page_exit')
    document.addEventListener('visibilitychange', visibilityChanged)
    window.addEventListener('blur', windowBlurred)
    window.addEventListener('pagehide', pageLeaving)
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged)
      window.removeEventListener('blur', windowBlurred)
      window.removeEventListener('pagehide', pageLeaving)
    }
  }, [onlineExam?.monitoringEnabled, onlineExam?.attemptId, onlineExam?.id, workStudentId])
  const uploadStudentWork = async (event, assignment) => {
    event.preventDefault(); setPortalAssignmentsError('')
    const file = new FormData(event.currentTarget).get('workFile')
    if (!(file instanceof File) || !file.size) return setPortalAssignmentsError('Selecciona un archivo antes de entregar.')
    if (file.size > 8 * 1024 * 1024) return setPortalAssignmentsError('El archivo debe ocupar máximo 8 MB.')
    const mimeByExtension = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    const extension = file.name.split('.').pop().toLowerCase()
    const contentType = file.type || mimeByExtension[extension] || ''
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    setSubmissionBusyId(assignment.id)
    try {
      const response = await fetch(`/api/portal/assignments/${assignment.id}/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ studentId: workStudentId, fileName: file.name, contentType, fileBase64: btoa(binary) }) })
      const result = await response.json()
      if (!response.ok) return setPortalAssignmentsError(result.error || 'No se pudo entregar el trabajo.')
      const params = new URLSearchParams({ studentId: workStudentId })
      const updated = await fetch(`/api/portal/assignments?${params}`, { credentials: 'same-origin' })
      const data = await updated.json()
      if (updated.ok) setPortalAssignments(data.assignments || [])
      notify(`Trabajo entregado. Versión ${result.submissionNo}.`)
    } catch { setPortalAssignmentsError('No se pudo conectar con el servidor.') }
    finally { setSubmissionBusyId('') }
  }
  const startOnlineExam = async assignment => {
    if (user?.role !== 'estudiante') return notify('Inicia sesión con la cuenta del estudiante para responder la evaluación.')
    if (assignment.integrityMonitoring && !window.confirm('Esta evaluación registra cuándo cambias de pestaña, sales de la página o la ventana pierde el foco. El registro no identifica qué aplicación abriste ni demuestra uso de herramientas externas. ¿Deseas continuar?')) return
    setOnlineExamBusy(true); setOnlineExamError('')
    try {
      const response = await fetch(`/api/portal/online-assessments/${assignment.id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ studentId: workStudentId }) })
      const result = await response.json()
      if (!response.ok) return notify(result.error || 'No se pudo abrir la evaluación.')
      if (result.status === 'submitted') {
        setPortalAssignments(items => items.map(item => item.id === assignment.id ? { ...item, onlineStatus: 'submitted', score: result.score } : item))
        return notify(`Esta evaluación ya fue enviada. Resultado: ${result.score} / ${result.maxScore}.`)
      }
      setOnlineExam({ ...assignment, ...result })
      setOnlineExamAnswers(result.answers || {}); setOnlineDraftSaved(true)
    } catch { notify('No se pudo conectar con el servidor.') }
    finally { setOnlineExamBusy(false) }
  }
  const closeOnlineExam = async () => {
    if (!onlineExam || onlineExamBusy) return
    if (onlineExam.monitoringEnabled && onlineExam.attemptId) fetch(`/api/portal/online-assessments/${onlineExam.id}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', keepalive: true, body: JSON.stringify({ studentId: workStudentId, attemptId: onlineExam.attemptId, eventType: 'page_exit' }) }).catch(() => {})
    if (Object.keys(onlineExamAnswers).length) {
      const answers = { ...onlineExamAnswers }
      setOnlineDraftSaving(true)
      const request = onlineDraftQueue.current.catch(() => {}).then(async () => {
        const response = await fetch(`/api/portal/online-assessments/${onlineExam.id}/draft`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ studentId: workStudentId, answers }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar el borrador de respuestas.')
      })
      onlineDraftQueue.current = request
      try { await request; setOnlineDraftSaved(true) }
      catch (error) { setOnlineExamError(error.message || 'No se pudo guardar el borrador de respuestas.'); setOnlineDraftSaving(false); return }
      setOnlineDraftSaving(false)
    }
    setOnlineExam(null)
  }
  const submitOnlineExam = async event => {
    event.preventDefault()
    if (!onlineExam || onlineExam.questions.some(question => !Number.isInteger(onlineExamAnswers[question.id]))) return setOnlineExamError('Responde todas las preguntas antes de enviar.')
    if (!window.confirm('Al enviar, tus respuestas quedarán bloqueadas. ¿Deseas finalizar la evaluación?')) return
    setOnlineExamBusy(true); setOnlineExamError('')
    try {
      await onlineDraftQueue.current.catch(() => {})
      const response = await fetch(`/api/portal/online-assessments/${onlineExam.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ studentId: workStudentId, answers: onlineExamAnswers }) })
      const result = await response.json()
      if (!response.ok) return setOnlineExamError(result.error || 'No se pudo enviar la evaluación.')
      setPortalAssignments(items => items.map(item => item.id === onlineExam.id ? { ...item, onlineStatus: 'submitted', score: result.score } : item))
      notify(`Evaluación enviada. Resultado automático: ${result.score} / ${result.maxScore}.`)
      setOnlineExam(null); setOnlineExamAnswers({})
    } catch { setOnlineExamError('No se pudo conectar con el servidor.') }
    finally { setOnlineExamBusy(false) }
  }
  useEffect(() => {
    if (!authenticated || active !== 'Boletines' || !['admin', 'rectoria', 'secretaria', 'docente', 'acudiente'].includes(user?.role)) return
    let alive = true
    setReportCardError('')
    fetch('/api/grades/report-card/options', { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar los boletines disponibles.')
      if (!alive) return
      const publications = result.publications || []
      const years = result.years || []
      const nextYear = years.includes(reportCardYear) ? reportCardYear : years[0] || ''
      const availablePeriods = publications.filter(item => item.academicYear === nextYear && item.isPublished)
      setReportCardOptions({ students: result.students || [], years, publications, courses: result.courses || [] })
      setReportCardStudentId(current => result.students?.some(item => item.id === current) ? current : result.students?.[0]?.id || '')
      setReportCardYear(nextYear)
      setReportCardCourseId(current => (result.courses || []).some(item => item.studentId === reportCardStudentId && item.academicYear === nextYear && item.courseId === current) ? current : (result.courses || []).find(item => item.studentId === reportCardStudentId && item.academicYear === nextYear)?.courseId || '')
      if (['acudiente', 'estudiante'].includes(user?.role)) setReportCardPeriod(current => availablePeriods.some(item => item.period === current) ? current : availablePeriods[0]?.period || 'Periodo 1')
    }).catch(error => { if (alive) setReportCardError(error.message || 'No se pudo conectar con el servidor.') })
    return () => { alive = false }
  }, [authenticated, active, user?.role])
  const loadReportCard = async () => {
    if (!reportCardStudentId || !reportCardYear) return setReportCardError('Selecciona estudiante y año lectivo.')
    setReportCardLoading(true); setReportCardError(''); setReportCardData(null)
    try {
      const params = new URLSearchParams({ studentId: reportCardStudentId, academicYear: reportCardYear, period: reportCardPeriod })
      if (reportCardCourseId) params.set('courseId', reportCardCourseId)
      const response = await fetch(`/api/grades/report-card?${params}`, { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo generar el boletín.')
      setReportCardData(result)
    } catch (error) { setReportCardError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setReportCardLoading(false) }
  }
  const toggleGradePublication = async () => {
    if (!reportCardYear || !reportCardPeriod) return setReportCardError('Selecciona año lectivo y periodo.')
    const published = !selectedPublication?.isPublished
    if (!published && !window.confirm(`¿Retirar del portal el boletín de ${reportCardYear}, ${reportCardPeriod}?`)) return
    setPublicationSaving(true); setReportCardError('')
    try {
      const response = await fetch('/api/grades/publications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ academicYear: reportCardYear, period: reportCardPeriod, published }) })
      const result = await response.json()
      if (!response.ok) return setReportCardError(result.error || 'No se pudo cambiar la publicación.')
      setReportCardOptions(current => ({ ...current, publications: [...(current.publications || []).filter(item => !(item.academicYear === result.academicYear && item.period === result.period)), { ...result, isPublished: result.isPublished }] }))
      setReportCardData(null)
      notify(published ? 'Boletín publicado en el portal.' : 'Boletín retirado del portal.')
    } catch { setReportCardError('No se pudo conectar con el servidor.') }
    finally { setPublicationSaving(false) }
  }
  const saveAccount = async (event) => {
    event.preventDefault()
    setAccountError('')
    setAccountBusy(true)
    const formData = new FormData(event.currentTarget)
    const form = { ...Object.fromEntries(formData.entries()), studentIds: formData.getAll('studentIds') }
    try {
      const response = await fetch(editingAccount ? `/api/users/${editingAccount.id}` : '/api/users', { method: editingAccount ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(form) })
      const result = await response.json()
      if (!response.ok) return setAccountError(result.error || 'No se pudo guardar la cuenta.')
      await loadUsers()
      setAccountDialog(false)
      setEditingAccount(null)
      notify(editingAccount ? 'Cuenta actualizada.' : 'Cuenta creada para este colegio.')
    } catch { setAccountError('No se pudo conectar con el servidor.') }
    finally { setAccountBusy(false) }
  }
  const setAccountActive = async account => {
    const active = !Boolean(account.active)
    try {
      const response = await fetch(`/api/users/${account.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ active }) })
      const result = await response.json()
      if (!response.ok) return notify(result.error || 'No se pudo cambiar el estado.')
      await loadUsers()
      notify(active ? 'Cuenta activada.' : 'Cuenta desactivada y sesiones cerradas.')
    } catch { notify('No se pudo conectar con el servidor.') }
  }
  const deleteAccount = async account => {
    if (!window.confirm(`¿Eliminar el acceso de ${account.name}? Se cerrarán sus sesiones y se quitará de los listados; los registros de auditoría se conservarán.`)) return
    try {
      const response = await fetch(`/api/users/${account.id}`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) return notify(result.error || 'No se pudo eliminar el acceso.')
      await loadUsers(); await loadCourses()
      notify('Acceso eliminado. El historial administrativo se conservó.')
    } catch { notify('No se pudo conectar con el servidor.') }
  }
  const saveStudent = async (event) => {
    event.preventDefault()
    setStudentSaveError('')
    const form = event.currentTarget
    const student = Object.fromEntries(new FormData(form).entries())
    // FormData incluye un File vacío aunque no se haya elegido una foto; no lo serialices como {}.
    delete student.photo
    student.documentType = String(student.documentType || '').trim()
    student.documentIssuedPlace = String(student.documentIssuedPlace || '').trim()
    if (!student.documentType || student.documentIssuedPlace.length < 3) return setStudentSaveError('Selecciona el tipo de documento e indica el municipio y departamento donde fue expedido (por ejemplo: Flandes, Tolima).')
    const photoFile = form.elements.photo?.files?.[0]
    if (photoFile) {
      if (photoFile.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(photoFile.type)) return notify('La foto debe ser JPG, PNG o WEBP y pesar máximo 2 MB.')
      student.photo = { fileName: photoFile.name, data: await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(photoFile) }) }
    }
    student.removePhoto = student.removePhoto === 'on'
    setStudentSaving(true)
    try {
      const response = await fetch(editingStudent ? `/api/students/${editingStudent.id}` : '/api/students', { method: editingStudent ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(student) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el estudiante.')
      if (result.student?.documentType !== student.documentType || result.student?.documentIssuedPlace !== student.documentIssuedPlace) throw new Error('El servidor no confirmó el tipo y lugar de expedición. Recarga la aplicación y, si persiste, publica la actualización del backend.')
      await loadStudents()
      setStudentDialog(false)
      setEditingStudent(null)
      notify(editingStudent ? 'Estudiante actualizado.' : 'Estudiante guardado en el colegio.')
    } catch (error) { setStudentSaveError(error.message || 'No se pudo conectar con el servidor.') }
    finally { setStudentSaving(false) }
  }
  const deleteStudent = async student => {
    if (!window.confirm(`¿Eliminar definitivamente a ${student.name}? Se quitará también su vínculo con las cuentas de acudientes y esta acción no se puede deshacer.`)) return
    try {
      const response = await fetch(`/api/students/${student.id}`, { method: 'DELETE', credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok) return notify(result.error || 'No se pudo eliminar el estudiante.')
      await loadStudents()
      notify('Estudiante eliminado.')
    } catch { notify('No se pudo conectar con el servidor.') }
  }
  const exportStudents = () => {
    if (!visibleStudents.length) return notify('No hay estudiantes para exportar.')
    const fields = ['name', 'documentType', 'document', 'documentIssuedPlace', 'grade', 'guardian', 'phone', 'status']
    const csv = [fields.join(','), ...visibleStudents.map(student => fields.map(field => `"${String(student[field] || '').replaceAll('"', '""')}"`).join(','))].join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
    link.download = 'estudiantes.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  const publicVerification = window.location.pathname.match(/^\/validar\/(constancia|boletin)\/([0-9a-f-]{36})\/?$/i)
  if (window.location.pathname === '/privacidad' || window.location.pathname === '/privacidad/') return <LegalDocumentPage documentType="privacy"/>
  if (window.location.pathname === '/terminos' || window.location.pathname === '/terminos/') return <LegalDocumentPage documentType="terms"/>
  if (publicVerification) return <PublicDocumentVerification documentKind={publicVerification[1].toLowerCase()} token={publicVerification[2]}/>
  if (loadingAuth) return <div className="auth-loading"><span className="brand-mark"><GraduationCap size={21}/></span><p>Conectando con el colegio…</p></div>
  if (authenticated && termsLoading) return <div className="auth-loading"><span className="brand-mark"><GraduationCap size={21}/></span><p>Verificando términos de uso…</p></div>
  if (authenticated && !termsAccepted) return <TermsAcceptanceDialog schoolName={user?.school?.name} busy={termsBusy} error={termsError} onAccept={acceptTerms} onLogout={logout}/>
  if (!authenticated && !setupRequired && passwordRecoveryOpen) return <PasswordRecoveryPage schools={schools} initialSchool={loginSchool} onBack={() => { setPasswordRecoveryOpen(false); setLoginError(''); setLoginNotice('') }}/>
  if (!authenticated && !setupRequired && loginStep === 'select') return <InstitutionChooser schools={schools} search={schoolSearch} setSearch={setSchoolSearch} onSelect={school => { setLoginSchool(school.slug); setBrandSettings(schoolOption(school)); setLoginStep('home'); setLoginError(''); setLoginNotice('') }}/>
  if (!authenticated && !setupRequired && loginStep === 'home' && selectedSchool) return <InstitutionHome school={selectedSchool} onEnter={() => { setLoginStep('login'); setLoginError(''); setLoginNotice('') }} onChange={() => { setLoginStep('select'); setLoginSchool(''); setSchoolSearch(''); setLoginError(''); setLoginNotice('') }}/>
  if (!authenticated) return <div className="login-page"><div className="login-decoration decoration-one"/><div className="login-decoration decoration-two"/><div className="login-top"><a className="login-brand" href="#inicio"><span className="brand-mark" style={activeBrandSettings?.primaryColor ? { background: activeBrandSettings.primaryColor } : undefined}>{activeBrandSettings?.logoUrl ? <img src={activeBrandSettings.logoUrl} alt="" className="brand-school-logo"/> : <GraduationCap size={21}/>}</span><span className="brand-name">{activeBrandSettings?.name || 'educa'}<span>.</span></span></a><span className="login-top-note"><LockKeyhole size={14}/> Acceso para personal autorizado</span></div><main className="login-layout"><section className="login-intro"><div className="login-overline"><span className="live-dot"/> GESTIÓN ESCOLAR, EN UN SOLO LUGAR</div><h1>Todo el colegio<br/>en sintonía<br/><span>cada día.</span></h1><p>Coordina el trabajo académico y administrativo, mantén informadas a las familias y acompaña el progreso de cada estudiante desde un solo espacio.</p><div className="login-benefits"><article><span><BookOpen size={17}/></span><div><strong>Seguimiento académico</strong><small>Cursos, evaluaciones y boletines</small></div></article><article><span><CalendarDays size={17}/></span><div><strong>Asistencia al día</strong><small>Novedades con historial claro</small></div></article><article><span><Bell size={17}/></span><div><strong>Familias informadas</strong><small>Comunicaciones por comunidad</small></div></article></div><div className="login-art" aria-hidden="true"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="art-book"><BookOpen size={56}/></div><span className="art-star star-a">✦</span><span className="art-star star-b">✳</span><span className="art-dot dot-a"/><span className="art-dot dot-b"/><div className="art-caption"><GraduationCap size={16}/> Aprender juntos</div></div></section><section className="login-card"><div className="login-card-heading"><div className="login-card-icon"><LockKeyhole size={19}/></div><h2>{setupRequired ? 'Configura tu colegio' : 'Inicia sesión'}</h2><p>{setupRequired ? 'Crea la institución y la cuenta administradora inicial.' : 'Ingresa con la cuenta autorizada de este plantel.'}</p></div>{setupRequired ? <SetupForm onComplete={async () => { const response = await fetch('/api/schools'); const result = await response.json(); setSchools((result.schools || []).map(schoolOption)); setSetupRequired(false); setLoginNotice('Colegio configurado. Ya puedes iniciar sesión.') }}/> : <form className="login-form" onSubmit={login}><div className="login-selected-institution"><SchoolMark school={selectedSchool}/><span><small>Ingresando a</small><strong>{selectedSchool?.name}</strong></span><button type="button" onClick={() => { setLoginStep('select'); setLoginSchool(''); setSchoolSearch(''); setLoginError('') }}>Cambiar institución</button></div><label className="login-label" htmlFor="login-email">Correo electrónico</label><div className="login-input-wrap"><Users size={16}/><input id="login-email" name="email" type="email" placeholder="nombre@colegio.edu.co" autoComplete="username" required maxLength="254"/></div><div className="password-label-row"><label className="login-label" htmlFor="login-password">Contraseña</label><button type="button" className="forgot-link" onClick={() => { setPasswordRecoveryOpen(true); setLoginNotice(''); setLoginError('') }}>¿Olvidaste tu contraseña?</button></div><div className="login-input-wrap"><LockKeyhole size={16}/><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Ingresa tu contraseña" autoComplete="current-password" required maxLength="128"/><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{loginError && <div className="login-message login-error" role="alert">{loginError}</div>}{loginNotice && <div className="login-message login-info" role="status">{loginNotice}</div>}<button type="submit" className="login-submit" disabled={!apiReady || !loginSchool}>{!apiReady ? 'Servidor no disponible' : !loginSchool ? 'Selecciona tu institución' : 'Iniciar sesión'} <ArrowRight size={16}/></button>{!apiReady && <div className="login-message login-info">Inicia también la API local. Consulta README.md.</div>}</form>}<div className="login-divider"><span/> o <span/></div><p className="login-help">¿Necesitas una cuenta? <button onClick={() => setLoginNotice('Solicita una invitación al administrador de tu colegio.')}>Contacta al administrador</button></p><div className="login-security"><ShieldCheck size={15}/><span>Tu información se maneja de forma confidencial.</span></div></section></main><footer className="login-footer"><span>© 2025 Educa · Gestión escolar</span><span>Acceso exclusivo para personal autorizado</span><nav className="legal-footer-links" aria-label="Información legal"><a href="/privacidad">Privacidad</a><a href="/terminos">Términos de uso</a></nav></footer></div>

  return <div className="app-shell" style={{ '--school-accent': user?.school?.primaryColor || '#6c70df' }}>
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><GraduationCap size={21} strokeWidth={2.3} /></span><span className="brand-name">educa<span>.</span></span><button className="close-menu icon-btn" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={19} /></button></div>
      <button className="school-switch" onClick={() => notify('La configuración del colegio está en el módulo Configuración.')}><div className="school-avatar">{user?.school?.hasLogo ? <img src="/api/school/logo" alt="Logo del colegio"/> : user?.school?.name?.slice(0, 1).toLocaleUpperCase('es') || selectedSchool?.initials || 'C'}</div><div className="school-copy"><strong>{user?.school?.name || selectedSchool?.name || 'Colegio Altamira'}</strong><span>Sede principal</span></div><ChevronDown size={16} className="muted-icon" /></button>
      <div className="side-scroll">
        {navGroups.map(group => <section className="nav-section" key={group.title}><div className="nav-heading">{group.title}</div>{group.items.filter(item => (item.label !== 'Personal Institucional y Firmas' || ['admin','rectoria'].includes(user?.role)) && (item.label !== 'Trayectoria académica' || ['acudiente','estudiante'].includes(user?.role)) && (item.label !== 'Matrículas' || ['admin', 'rectoria', 'secretaria'].includes(user?.role)) && (item.label !== 'Usuarios y accesos' || user?.role === 'admin') && (item.label !== 'Solicitudes de contraseña' || ['admin','rectoria','coordinacion','secretaria'].includes(user?.role)) && (item.label !== 'Cursos y docentes' || ['admin', 'rectoria', 'secretaria'].includes(user?.role)) && (item.label !== 'Mis cursos' || user?.role === 'docente') && (item.label !== 'Estudiantes' || ['admin', 'secretaria', 'rectoria', 'docente'].includes(user?.role)) && (item.label !== 'Asistencia' || ['admin', 'rectoria', 'secretaria', 'docente'].includes(user?.role)) && (item.label !== 'Calificaciones' || ['admin', 'rectoria', 'secretaria', 'docente'].includes(user?.role)) && (item.label !== 'Reportes' || ['admin', 'rectoria', 'secretaria', 'docente'].includes(user?.role)) && (item.label !== 'Bitácora' || ['admin','rectoria'].includes(user?.role)) && (item.label !== 'Control documental' || ['admin','rectoria','secretaria'].includes(user?.role)) && (item.label !== 'Boletines' || ['admin', 'rectoria', 'secretaria', 'docente', 'acudiente'].includes(user?.role)) && (item.label !== 'Mi aula' || ['acudiente', 'estudiante'].includes(user?.role)) && (item.label !== 'Justificaciones' || ['admin','rectoria','coordinacion','secretaria','docente','orientacion','acudiente','estudiante'].includes(user?.role)) && (item.label !== 'Observador del estudiante' || ['admin','rectoria','coordinacion','orientacion','docente'].includes(user?.role)) && (item.label !== 'Periodos académicos' || ['admin','rectoria','secretaria'].includes(user?.role)) && (item.label !== 'Importar estudiantes' || ['admin','rectoria','secretaria'].includes(user?.role)) && (item.label !== 'Respaldos' || user?.role === 'admin') && (item.label !== 'Pagos estudiantiles' || ['admin', 'rectoria', 'tesoreria'].includes(user?.role)) && (item.label !== 'Carné digital' || ['acudiente','estudiante'].includes(user?.role)) && (item.label !== 'Certificados y constancias' || ['admin','rectoria','coordinacion','secretaria','acudiente'].includes(user?.role)) && (item.label !== 'Actividades y eventos' || ['admin','rectoria','coordinacion','secretaria','docente','acudiente','estudiante'].includes(user?.role))).map(item => <button key={item.label} className={`nav-item ${active === item.label ? 'selected' : ''}`} aria-current={active === item.label ? 'page' : undefined} onClick={() => { setActive(item.label); setMenuOpen(false) }}><item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}</button>)}</section>)}
        <div className="sidebar-note"><span className="note-icon"><Sparkles size={16} /></span><div><strong>Todo en orden</strong><p>Tu institución está al día.</p></div><ArrowRight size={15} className="note-arrow" /></div>
      </div>
      <div className="sidebar-bottom">{user?.role === 'admin' && <button className="nav-item" onClick={() => { setActive('Configuración'); setSchoolSettingsError('') }}><Settings2 size={18} /><span>Configuración</span></button>}{user?.role === 'admin' && user?.email?.toLowerCase() === institutionManagerEmail && <button className={`nav-item ${active === 'Instituciones' ? 'selected' : ''}`} onClick={() => setActive('Instituciones')}><Building2 size={18}/><span>Instituciones</span></button>}<div className="user-card"><ProfileAvatar user={user} revision={profileRevision}/><div className="user-copy"><strong>{user?.name || 'Usuario'}</strong><span>{user?.role === 'admin' ? 'Administrador' : user?.role || 'Personal'}</span></div><button className="icon-btn" title="Cambiar contraseña" aria-label="Cambiar contraseña" onClick={() => { setPasswordError(''); setPasswordDialog(true) }}><LockKeyhole size={16}/></button></div><button type="button" className="logout-button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={logout}><LogOut size={17}/><span>Cerrar sesión</span></button></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="icon-btn mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button><div className="breadcrumb"><span className="breadcrumb-root">Institución</span><ChevronRight size={14} /><span>{active}</span></div></div><div className="top-actions">{['admin','secretaria'].includes(user?.role) && <label className="search-box"><Search size={17} /><input ref={searchInputRef} aria-label="Buscar estudiantes" placeholder="Buscar estudiante, documento o grado" value={query} onFocus={() => active !== 'Estudiantes' && setActive('Estudiantes')} onChange={e => setQuery(e.target.value)} />{query && <button type="button" className="search-clear" aria-label="Limpiar búsqueda" onClick={() => { setQuery(''); searchInputRef.current?.focus() }}><X size={14}/></button>}<kbd>{navigator.userAgent.includes('Mac') ? '⌘ K' : 'Ctrl K'}</kbd></label>}<button className="icon-btn notification-btn" aria-label={`Notificaciones${unreadNotifications ? `, ${unreadNotifications} sin leer` : ''}`} onClick={() => setActive('Notificaciones')}><Bell size={19} />{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}</button><div className="top-divider" /><div className="account-menu-wrap" ref={accountMenuRef}><button className="profile-mini" aria-label="Abrir menú de cuenta" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}><ProfileAvatar user={user} small revision={profileRevision}/><ChevronDown size={15} className={`muted-icon ${accountMenuOpen ? 'account-chevron-open' : ''}`} /></button>{accountMenuOpen && <div className="account-dropdown" role="menu"><div className="account-menu-identity"><ProfileAvatar user={user} revision={profileRevision}/><div><strong>{user?.name || 'Mi cuenta'}</strong><span>{user?.email || ''}</span></div></div><div className="account-menu-role">{roleName(user?.role) || 'Usuario'}</div><div className="account-menu-divider"/><button role="menuitem" onClick={() => { setActive('Mi perfil'); setAccountMenuOpen(false); setMenuOpen(false) }}><UserRound size={16}/>Mi perfil</button><button role="menuitem" onClick={() => { setPasswordError(''); setPasswordDialog(true); setAccountMenuOpen(false) }}><LockKeyhole size={16}/>Cambiar contraseña</button><div className="account-menu-divider"/><button className="account-menu-logout" role="menuitem" onClick={() => { setAccountMenuOpen(false); logout() }}><LogOut size={16}/>Cerrar sesión</button></div>}</div></div></header>
      <div className="content-wrap container-fluid">
        {active === 'Trayectoria académica' ? <AcademicTrajectoryModule students={portalStudents} allowReportAccess={user?.role !== 'estudiante'} onViewReport={(studentId, record, period) => { setReportCardStudentId(studentId); setReportCardYear(record.academicYear); setReportCardCourseId(record.courseId || ''); setReportCardPeriod(period); setReportCardData(null); setReportCardError(''); setActive('Boletines') }}/> : active === 'Personal Institucional y Firmas' ? <InstitutionalStaffModule notify={notify}/> : active === 'Mi perfil' ? <ProfileModule user={user} notify={notify} onChangePassword={() => { setPasswordError(''); setPasswordDialog(true) }} onProfileUpdated={() => setProfileRevision(Date.now())}/> : active === 'Carné digital' ? <DigitalCardModule notify={notify}/> : active === 'Certificados y constancias' ? <CertificatesModule user={user} notify={notify}/> : active === 'Actividades y eventos' ? <ActivitiesModule user={user} notify={notify} onGoCalendar={() => setActive('Calendario')}/> : active === 'Calendario' ? <CalendarModule user={user} notify={notify}/> : active === 'Notificaciones' ? <NotificationsModule notify={notify}/> : active === 'Horario' ? <ScheduleModule user={user} notify={notify}/> : active === 'Justificaciones' ? <JustificationsModule user={user} notify={notify}/> : active === 'Observador del estudiante' ? <ObservationsModule user={user} notify={notify}/> : active === 'Periodos académicos' ? <AcademicPeriodsModule user={user} notify={notify}/> : active === 'Importar estudiantes' ? <ImportStudentsModule notify={notify}/> : active === 'Respaldos' ? <BackupModule notify={notify}/> : active === 'Control documental' ? <DocumentControlModule user={user}/> : active === 'Bitácora' ? <section className="students-page audit-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> SEGURIDAD Y SEGUIMIENTO</div><h1>Bitácora de actividad</h1><p className="welcome-sub">Consulta las acciones registradas en este colegio.</p></div><div className="students-actions"><div className="audit-total"><strong>{auditTotal.toLocaleString('es-CO')}</strong><span>eventos</span></div><button className="button button-soft" onClick={exportAudit}><Download size={16}/> Exportar CSV</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Administración y rectoría pueden consultar la actividad. Los registros están limitados al colegio de la sesión.</div><div className="students-toolbar audit-filters"><label className="student-filter">Buscar acción<input type="search" maxLength="100" value={auditActionFilter} onChange={event => { setAuditActionFilter(event.target.value); setAuditOffset(0) }} placeholder="Ej. attendance, user_created, grade_records"/></label><label className="student-filter">Desde<input type="date" value={auditFrom} onChange={event => { setAuditFrom(event.target.value); setAuditOffset(0) }}/></label><label className="student-filter">Hasta<input type="date" value={auditTo} onChange={event => { setAuditTo(event.target.value); setAuditOffset(0) }}/></label></div>{auditError && <div className="login-message login-error" role="alert">{auditError}</div>}<div className="student-table-wrap audit-table-wrap"><table className="student-table"><thead><tr><th>FECHA Y HORA</th><th>USUARIO</th><th>ACCIÓN</th></tr></thead><tbody>{auditEntries.map(entry => <tr key={entry.id}><td>{auditDateLabel(entry.createdAt)}</td><td><strong>{entry.actorName}</strong>{entry.actorEmail && <small className="history-secondary">{entry.actorEmail}</small>}</td><td><span className="audit-action-label">{auditActionName(entry.action)}</span></td></tr>)}</tbody></table>{auditLoading && <div className="students-empty">Cargando actividad…</div>}{!auditLoading && !auditEntries.length && <div className="students-empty"><span className="empty-icon"><History size={22}/></span><strong>{auditError ? 'No se pudo cargar la bitácora' : 'No hay eventos para mostrar'}</strong><p>{auditError ? 'Intenta cargar la sección nuevamente.' : 'Las acciones administrativas aparecerán aquí.'}</p></div>}</div><div className="audit-pagination"><span>{auditTotal ? `Mostrando ${auditOffset + 1}–${Math.min(auditOffset + auditEntries.length, auditTotal)} de ${auditTotal}` : 'Sin registros'}</span><div><button className="button button-soft" disabled={auditLoading || auditOffset === 0} onClick={() => setAuditOffset(Math.max(0, auditOffset - 50))}>Anterior</button><button className="button button-soft" disabled={auditLoading || auditOffset + auditEntries.length >= auditTotal} onClick={() => setAuditOffset(auditOffset + 50)}>Siguiente</button></div></div></section> : active === 'Pagos estudiantiles' && ['admin', 'rectoria', 'tesoreria'].includes(user?.role) ? <StudentPaymentsModule notify={notify}/> : active === 'Instituciones' && user?.role === 'admin' && user?.email?.toLowerCase() === institutionManagerEmail ? <InstitutionManagerModule user={user} notify={notify} onCreated={institution => setSchools(current => [...current.filter(school => school.id !== institution.id), schoolOption(institution)].sort((a, b) => a.name.localeCompare(b.name, 'es')))} onUpdated={institution => setSchools(current => current.map(school => school.id === institution.id ? schoolOption(institution) : school))} /> : active === 'Configuración' ? <section className="students-page school-settings-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ADMINISTRACIÓN DEL COLEGIO</div><h1>Configuración</h1><p className="welcome-sub">Personaliza la identidad y los datos de contacto de tu institución.</p></div></div>{schoolSettingsError && <div className="login-message login-error" role="alert">{schoolSettingsError}</div>}{schoolSettingsLoading || !schoolSettings ? <div className="students-empty">{schoolSettingsLoading ? 'Cargando configuración…' : 'No se pudo cargar la configuración.'}</div> : <form className="school-settings-form" onSubmit={saveSchoolSettings}><div className="school-settings-card"><div className="school-settings-heading"><span className="stat-icon violet"><GraduationCap size={18}/></span><div><strong>Identidad institucional</strong><span>El nombre y el color se mostrarán en el panel del colegio.</span></div></div><label>Nombre del colegio<input name="name" required minLength="2" maxLength="120" defaultValue={schoolSettings.name}/></label><label>Color principal<div className="school-color-input"><input type="color" name="primaryColor" defaultValue={schoolSettings.primaryColor || '#6c70df'}/><span>{schoolSettings.primaryColor || '#6c70df'}</span></div></label><label>Logo del colegio <span className="optional-label">JPG, PNG O WEBP · MÁXIMO 1 MB</span><input type="file" name="logo" accept="image/jpeg,image/png,image/webp" onChange={event => setSchoolLogoFile(event.target.files?.[0] || null)}/></label>{schoolLogoFile && <div className="selected-logo-file">Archivo seleccionado: <strong>{schoolLogoFile.name}</strong></div>}{schoolSettings.hasLogo && !schoolLogoFile && <div className="school-logo-preview"><img src="/api/school/logo" alt="Logo actual del colegio"/><span>Logo actual</span><label><input type="checkbox" name="removeLogo"/> Eliminar logo actual</label></div>}</div><div className="school-settings-card"><div className="school-settings-heading"><span className="stat-icon green"><Users size={18}/></span><div><strong>Datos de contacto</strong><span>Información administrativa de la institución.</span></div></div><label>Correo de contacto<input name="contactEmail" type="email" maxLength="254" defaultValue={schoolSettings.contactEmail || ''} placeholder="contacto@colegio.edu.co"/></label><label>Teléfono<input name="contactPhone" type="tel" maxLength="30" defaultValue={schoolSettings.contactPhone || ''} placeholder="+57 300 000 0000"/></label><label>Dirección<textarea name="address" maxLength="240" rows="3" defaultValue={schoolSettings.address || ''} placeholder="Dirección de la institución"/></label></div><div className="school-settings-footer"><button className="button button-primary" type="submit" disabled={schoolSettingsBusy}>{schoolSettingsBusy ? 'Guardando…' : <><Check size={15}/> Guardar configuración</>}</button></div></form>}</section> : active === 'Calificaciones' ? <section className="students-page grades-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN ACADÉMICA</div><h1>Calificaciones</h1><p className="welcome-sub">Organiza evaluaciones y registra resultados por estudiante.</p></div><div className="students-actions">{gradeAssessment?.deliveryMode === 'online' && gradeAssessment?.integrityMonitoring && <button className="button button-soft" onClick={loadIntegrityEvents} disabled={integrityEventsLoading}><Activity size={15}/> {integrityEventsLoading ? 'Cargando incidencias…' : 'Ver incidencias'}</button>}{gradeAssessment && <button className="button button-soft danger-action" onClick={deleteAssessment} disabled={assessmentDeleting}>{assessmentDeleting ? 'Eliminando…' : <><Trash2 size={15}/> Eliminar evaluación</>}</button>}<button className="button button-primary" disabled={!selectedGradeAssignment} onClick={() => { setGradeError(''); setAssessmentCategory('assignment'); setAssessmentMode('file'); setAssessmentIntegrityMonitoring(true); setAssessmentPublished(true); setAssessmentQuestions([{ key: crypto.randomUUID(), prompt: '', options: ['', '', '', ''], correctOption: 0, points: '1' }]); setAssessmentDialog(true) }}><Plus size={17}/> Nueva evaluación</button><button className="button button-soft" disabled={!selectedGradeAssignment} onClick={() => { setGradeError(''); setAssessmentCategory('class_activity'); setAssessmentMode('file'); setAssessmentPublished(true); setAssessmentQuestions([]); setAssessmentDialog(true) }}><BookOpen size={16}/> Nota de actividad en clase</button></div></div><div className="students-toolbar grades-toolbar"><label className="student-filter">Curso y asignatura <select value={gradeAssignmentKey} onChange={event => { setGradeAssignmentKey(event.target.value); setGradeAssessmentId(''); setGradeAssessment(null); setGradeRows([]) }}><option value="">Selecciona una asignatura</option>{gradeAssignments.map(item => <option key={`${item.courseId}|${item.subject}`} value={`${item.courseId}|${item.subject}`}>{item.grade} · {item.courseName} · {item.subject}{user?.role !== 'docente' ? ` · ${item.teacherName}` : ''}</option>)}</select></label><label className="student-filter">Periodo <select value={gradePeriod} onChange={event => { setGradePeriod(event.target.value); setGradeAssessmentId('') }}>{(gradePeriodOptions.length ? gradePeriodOptions : ['Periodo 1','Periodo 2','Periodo 3','Periodo 4']).map(period => <option key={period}>{period}</option>)}</select></label><label className="student-filter">Evaluación <select value={gradeAssessmentId} onChange={event => setGradeAssessmentId(event.target.value)} disabled={!gradeAssessments.length}><option value="">Selecciona evaluación</option>{gradeAssessments.map(item => <option key={item.id} value={item.id}>{item.activityType === 'class_activity' ? 'Actividad en clase · ' : ''}{item.title} · hasta {item.maxScore}{item.dueAt ? ` · vence ${item.dueAt}` : ''}</option>)}</select></label></div><div className="students-scope"><ShieldCheck size={14}/> Las notas se limitan al colegio y a las asignaturas asignadas. El puntaje máximo se define en cada evaluación; los promedios y boletines usan las reglas de ponderación y escala configuradas para el periodo.</div><div className="grade-rule-panel"><div className="grade-rule-copy"><strong>Escala institucional de este periodo</strong><span>{gradeRule ? 'Regla guardada para curso y asignatura seleccionados.' : 'Configura el rango y la nota mínima para aprobar.'}</span></div><form className="grade-rule-form" onSubmit={saveGradeRule}><label>Mínimo<input aria-label="Nota mínima institucional" type="number" min="0" max="100" step="any" required value={gradeRuleForm.scaleMin} onChange={event => setGradeRuleForm(form => ({ ...form, scaleMin: event.target.value }))}/></label><label>Máximo<input aria-label="Nota máxima institucional" type="number" min="0.01" max="100" step="any" required value={gradeRuleForm.scaleMax} onChange={event => setGradeRuleForm(form => ({ ...form, scaleMax: event.target.value }))}/></label><label>Aprobación<input aria-label="Nota mínima aprobatoria" type="number" min="0" max="100" step="any" required value={gradeRuleForm.passingScore} onChange={event => setGradeRuleForm(form => ({ ...form, passingScore: event.target.value }))}/></label><button className="button button-soft" type="submit" disabled={gradeRuleSaving || !selectedGradeAssignment}>{gradeRuleSaving ? 'Guardando…' : 'Guardar escala'}</button></form></div>{gradeError && <div className="login-message login-error" role="alert">{gradeError}</div>}{!gradeAssignments.length ? <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>No hay asignaturas asignadas</strong><p>Crea un curso, asigna una asignatura y vincula un docente para empezar.</p></div> : !gradeAssessmentId ? <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>{gradeAssessments.length ? 'Selecciona una evaluación' : 'Aún no hay evaluaciones en este periodo'}</strong><p>{gradeAssessments.length ? 'Elige una evaluación para consultar o registrar calificaciones.' : 'Crea una evaluación para la asignatura y el periodo seleccionados.'}</p>{!gradeAssessments.length && <button className="button button-primary" onClick={() => { setAssessmentMode('file'); setAssessmentPublished(true); setAssessmentQuestions([{ key: crypto.randomUUID(), prompt: '', options: ['', '', '', ''], correctOption: 0, points: '1' }]); setAssessmentDialog(true) }}><Plus size={16}/> Crear evaluación</button>}</div> : gradeLoading ? <div className="students-empty">Cargando calificaciones…</div> : <><div className="grade-assessment-summary"><div><span>Evaluación</span><strong>{gradeAssessment?.title}</strong></div><div><span>Curso y asignatura</span><strong>{gradeAssessment?.courseName} · {gradeAssessment?.subject}</strong></div><div><span>Periodo</span><strong>{gradeAssessment?.period}</strong></div><div><span>Puntaje máximo</span><strong>{gradeAssessment?.maxScore}</strong></div><div className="grade-weight-control"><label>Ponderación relativa (%)<input type="number" min="0.01" max="100" step="any" value={assessmentWeight} onChange={event => setAssessmentWeight(event.target.value)}/></label><button type="button" className="button button-soft" onClick={saveAssessmentWeight} disabled={assessmentWeightSaving}>{assessmentWeightSaving ? 'Guardando…' : 'Guardar'}</button></div>{gradeAssessment?.deliveryMode === 'online' && <button type="button" className={gradeAssessment.isPublished ? 'button button-soft' : 'button button-primary'} onClick={toggleAssessmentPublication} disabled={assessmentPublicationSaving}>{assessmentPublicationSaving ? 'Guardando…' : gradeAssessment.isPublished ? 'Retirar del portal' : 'Publicar para estudiantes'}</button>}<button className="button button-soft" onClick={loadAssessmentSubmissions} disabled={submissionsLoading}><ClipboardCheck size={15}/>{submissionsLoading ? 'Cargando…' : 'Ver entregas'}</button><button className="button button-primary" onClick={saveGrades} disabled={gradeSaving || !gradeRows.some(student => student.score !== null && student.score !== '')}><Check size={15}/>{gradeSaving ? 'Guardando…' : 'Guardar notas'}</button></div>{(gradeAssessment?.externalFormUrl || gradeAssessment?.images?.length > 0) && <div className="assessment-resources">{gradeAssessment.externalFormUrl && <a className="external-form-link" href={gradeAssessment.externalFormUrl} target="_blank" rel="noopener noreferrer">Abrir Google Forms <ArrowRight size={14}/></a>}{gradeAssessment.images?.map((image, index) => <a className="assessment-resource-thumb" key={image.id} href={`/api/assessment-images/${image.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/assessment-images/${image.id}`} alt={`Imagen ${index + 1} de ${gradeAssessment.title}`}/><span>{image.fileName}</span></a>)}</div>}{submissionsLoaded && <div className="student-table-wrap work-submissions-panel"><h2>Entregas de estudiantes <span>{assessmentSubmissions.filter(item => gradeAssessment?.deliveryMode === 'online' ? item.onlineSubmittedAt : item.submissionId).length} de {assessmentSubmissions.length} entregadas</span></h2><div className="submission-filters"><label>Buscar estudiante<input type="search" maxLength="100" value={submissionSearch} onChange={event => setSubmissionSearch(event.target.value)} placeholder="Nombre del estudiante"/></label><label>Estado<select value={submissionFilter} onChange={event => setSubmissionFilter(event.target.value)}>{['Todas','Entregadas','Pendientes','Vencidas','Calificadas'].map(status => <option key={status}>{status}</option>)}</select></label></div><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>ESTADO</th><th>FECHA DE ENTREGA</th><th>VERSIONES</th><th>ARCHIVO / PUNTAJE</th></tr></thead><tbody>{filteredAssessmentSubmissions.map(item => <tr key={item.studentId}><td><strong>{item.studentName}</strong></td><td>{gradeAssessment?.deliveryMode === 'online' ? (item.onlineSubmittedAt ? 'Completada' : 'Sin iniciar') : item.submissionId ? 'Entregado' : 'Pendiente'}</td><td>{(gradeAssessment?.deliveryMode === 'online' ? item.onlineSubmittedAt : item.uploadedAt) ? new Date(gradeAssessment?.deliveryMode === 'online' ? item.onlineSubmittedAt : item.uploadedAt).toLocaleString('es-CO') : '—'}</td><td>{gradeAssessment?.deliveryMode === 'online' ? (item.onlineSubmittedAt ? '1 intento' : '—') : item.attempts}</td><td>{gradeAssessment?.deliveryMode === 'online' ? (item.onlineSubmittedAt ? `${item.onlineScore ?? 0} / ${gradeAssessment.maxScore}` : '—') : item.submissionId ? <div className="submission-file-actions"><button className="account-toggle" onClick={() => downloadWorkFile(item.submissionId,item.fileName)}><Download size={14}/>{item.fileName}</button>{item.score !== null && item.score !== undefined && <span>Nota: {item.score} / {gradeAssessment.maxScore}</span>}<button type="button" className="account-toggle danger-action" onClick={() => deleteStudentSubmission(item)} disabled={submissionDeletingId === item.submissionId} aria-label={`Eliminar entrega de ${item.studentName}`} title="Eliminar entrega">{submissionDeletingId === item.submissionId ? '…' : <Trash2 size={14}/>}</button></div> : '—'}</td></tr>)}</tbody></table>{filteredAssessmentSubmissions.length === 0 && <p className="submission-empty">{assessmentSubmissions.length ? 'No hay estudiantes que coincidan con los filtros.' : 'No hay estudiantes activos asociados al grado de este curso.'}</p>}</div>}<div className="student-table-wrap"><table className="student-table grade-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>NOTA / {gradeAssessment?.maxScore}</th><th>OBSERVACIÓN (OPCIONAL)</th></tr></thead><tbody>{gradeRows.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><input className="grade-score-input" type="number" min="0" max={gradeAssessment?.maxScore} step="any" value={student.score ?? ''} aria-label={`Nota de ${student.name}`} onChange={event => setGradeRows(rows => rows.map(row => row.id === student.id ? { ...row, score: event.target.value } : row))}/></td><td><input className="grade-comment-input" maxLength="500" value={student.comment || ''} placeholder="Opcional" aria-label={`Observación de ${student.name}`} onChange={event => setGradeRows(rows => rows.map(row => row.id === student.id ? { ...row, comment: event.target.value } : row))}/></td></tr>)}</tbody></table>{!gradeRows.length && <div className="students-empty">No hay estudiantes activos en el grado de este curso.</div>}</div></>}</section> : active === 'Asistencia' ? <section className="students-page attendance-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CONTROL ACADÉMICO</div><h1>Asistencia</h1><p className="welcome-sub">Registra la asistencia del grupo por fecha.</p></div><div className="students-actions"><button className="button button-primary" onClick={saveAttendance} disabled={attendanceSaving || !attendanceRows.some(isAttendanceChanged)}><Check size={16}/>{attendanceSaving ? 'Guardando…' : 'Guardar asistencia'}</button></div></div><div className="students-toolbar attendance-toolbar"><label className="student-filter">Curso <select value={attendanceCourseId} onChange={event => setAttendanceCourseId(event.target.value)}><option value="">Selecciona un curso</option>{attendanceCourses.map(course => <option key={course.id} value={course.id}>{course.grade} · {course.name} · {course.academicYear}</option>)}</select></label><label className="student-filter">Fecha <input type="date" value={attendanceDate} onChange={event => setAttendanceDate(event.target.value)}/></label><div className="student-count"><strong>{attendanceMarkedCount}</strong> de {attendanceRows.length} marcados</div></div>{attendanceRows.length > 0 && <><div className="attendance-progress" role="status"><div><span>Progreso del grupo</span><strong>{attendanceProgress}%</strong></div><progress value={attendanceMarkedCount} max={attendanceRows.length}/></div><div className="attendance-tools"><label className="student-filter">Buscar estudiante<input type="search" maxLength="100" value={attendanceSearch} onChange={event => setAttendanceSearch(event.target.value)} placeholder="Nombre del estudiante"/></label><label className="student-filter">Filtrar por estado<select value={attendanceFilter} onChange={event => setAttendanceFilter(event.target.value)}>{['Todos','Sin registrar','Presente','Ausente','Tarde','Justificado'].map(status => <option key={status}>{status}</option>)}</select></label><button type="button" className="button button-soft" onClick={markUnmarkedPresent} disabled={attendanceSaving || attendanceRows.every(student => student.attendanceStatus)}>Completar pendientes como presentes</button></div><div className="attendance-summary-chips" aria-label="Resumen de asistencia"><span>Presentes <strong>{attendanceRows.filter(student => student.attendanceStatus === 'Presente').length}</strong></span><span>Ausentes <strong>{attendanceRows.filter(student => student.attendanceStatus === 'Ausente').length}</strong></span><span>Tarde <strong>{attendanceRows.filter(student => student.attendanceStatus === 'Tarde').length}</strong></span><span>Justificados <strong>{attendanceRows.filter(student => student.attendanceStatus === 'Justificado').length}</strong></span></div></>}<div className="students-scope"><ShieldCheck size={14}/> Solo puedes registrar asistencia en cursos de tu colegio y, si eres docente, en cursos asignados a tu cuenta. Puedes guardar el grupo por partes; cada estudiante solo tiene un registro por curso y fecha. Para borrar una marca, selecciona «Sin registrar» y guarda los cambios.</div>{attendanceError && <div className="login-message login-error" role="alert">{attendanceError}</div>}{attendanceLoading ? <div className="students-empty">Cargando lista del grupo…</div> : attendanceRows.length ? <div className="student-table-wrap"><table className="student-table attendance-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>ESTADO DE ASISTENCIA</th><th>REGISTRO</th></tr></thead><tbody>{filteredAttendanceRows.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><select aria-label={`Asistencia de ${student.name}`} className={`attendance-status-select ${student.attendanceStatus ? `attendance-${student.attendanceStatus.toLowerCase()}` : ''}`} value={student.attendanceStatus || ''} onChange={event => setAttendanceRows(rows => rows.map(row => row.id === student.id ? { ...row, attendanceStatus: event.target.value || null } : row))}><option value="">Sin registrar</option><option value="Presente">Presente</option><option value="Ausente">Ausente</option><option value="Tarde">Tarde</option><option value="Justificado">Justificado</option></select></td><td>{isAttendanceChanged(student) ? student.attendanceStatus ? 'Cambio pendiente de guardar' : 'Se eliminará al guardar' : student.markedAt ? `Guardado · ${new Date(student.markedAt).toLocaleString('es-CO')}` : 'Pendiente'}</td></tr>)}{attendanceRows.length > 0 && filteredAttendanceRows.length === 0 && <tr><td colSpan="4">No hay estudiantes que coincidan con la búsqueda o el estado seleccionado.</td></tr>}</tbody></table></div> : <div className="students-empty"><span className="empty-icon"><ClipboardCheck size={22}/></span><strong>{attendanceCourseId ? 'No hay estudiantes activos en este grupo' : 'Selecciona un curso'}</strong><p>{attendanceCourseId ? 'Verifica que los estudiantes activos tengan el mismo grado o grupo configurado en este curso.' : attendanceCourses.length ? 'Elige un curso y una fecha para consultar la lista.' : 'Todavía no hay cursos disponibles o asignados para tomar asistencia.'}</p></div>}</section> : active === 'Cursos y docentes' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ORGANIZACIÓN ACADÉMICA</div><h1>Cursos y docentes</h1><p className="welcome-sub">Crea cursos, actualiza sus datos y administra sus asignaciones docentes.</p></div><div className="students-actions"><button className="button button-primary" onClick={() => { setCourseError(''); setEditingCourse(null); setCourseDialog(true) }}><Plus size={17}/> Crear curso</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Los cursos dados de baja se ocultan de asistencia y calificaciones; su historial se conserva y puedes reactivarlos.</div><div className="course-grid">{courses.map(course => <article className={`course-card ${course.isActive ? '' : 'course-archived'}`} key={course.id}><div className="course-card-top"><span className="stat-icon violet"><BookOpen size={17}/></span><span className="course-badges"><span className="role-chip">{course.academicYear}</span><span className={`course-state-chip ${course.isActive ? 'course-state-active' : 'course-state-archived'}`}>{course.isActive ? 'Activo' : 'Archivado'}</span></span></div><h2>{course.name}</h2><p>{course.grade}</p><div className="course-teacher-list">{course.teachers.map(teacher => <div className="course-assignment-row" key={`${teacher.id}-${teacher.subject}`}><span><strong>{teacher.name}</strong><small>{teacher.subject}</small></span>{Boolean(course.isActive) && <span className="course-assignment-actions"><button className="account-toggle" title="Editar asignación" aria-label={`Editar ${teacher.subject} de ${teacher.name}`} onClick={() => { setCourseError(''); setIsCustomSubject(!commonSubjects.includes(teacher.subject)); setEditingAssignment(teacher); setAssignmentCourse(course) }}><Pencil size={14}/> Editar</button><button className="account-toggle delete-student-action" title="Quitar docente" aria-label={`Quitar ${teacher.name} de ${teacher.subject}`} onClick={() => deleteTeacherAssignment(course, teacher)}><Trash2 size={14}/> Quitar</button></span>}</div>)}{!course.teachers.length && <span>Aún no hay docentes asignados.</span>}</div><div className="course-card-actions"><button className="account-toggle" onClick={() => openCourseHistory(course)}><Clock3 size={14}/> Historial</button><button className="account-toggle" onClick={() => { setCourseError(''); setEditingCourse(course); setCourseDialog(true) }}><Pencil size={14}/> Editar curso</button>{course.isActive ? <button className="account-toggle delete-student-action" onClick={() => archiveCourse(course)}><Trash2 size={14}/> Dar de baja</button> : <button className="account-toggle course-reactivate" onClick={() => setCourseActive(course, true)}><Check size={14}/> Reactivar</button>}</div>{Boolean(course.isActive) && <button className="button button-soft" onClick={() => { setCourseError(''); setIsCustomSubject(false); setEditingAssignment(null); setAssignmentCourse(course) }}><Plus size={15}/> Asignar docente</button>}</article>)}{!courses.length && <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>Aún no hay cursos</strong><p>Crea el primer grupo para organizar las asignaturas y asignaciones docentes.</p></div>}</div></section> : active === 'Solicitudes de contraseña' ? <PasswordResetRequestsModule notify={notify}/> : active === 'Usuarios y accesos' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ADMINISTRACIÓN DEL COLEGIO</div><h1>Usuarios y accesos</h1><p className="welcome-sub">Crea cuentas por rol y controla quién puede iniciar sesión en este colegio.</p></div><div className="students-actions"><button className="button button-primary" onClick={() => { setAccountError(''); setEditingAccount(null); setNewAccountRole('docente'); setAccountDialog(true) }}><Plus size={17}/> Crear cuenta</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Solo administradores pueden gestionar cuentas. Cada persona inicia sesión con el nombre del colegio, su correo y contraseña.</div><div className="students-toolbar"><div className="student-count"><strong>{schoolUsers.length}</strong> {schoolUsers.length === 1 ? 'cuenta del colegio' : 'cuentas del colegio'}</div></div><div className="student-table-wrap"><table className="student-table user-table"><thead><tr><th>PERSONA</th><th>CORREO</th><th>ROL</th><th>HIJOS VINCULADOS</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{schoolUsers.map(account => <tr key={account.id}><td><span className="student-initials">{account.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{account.name}</strong></td><td>{account.email}</td><td><span className="role-chip">{roleName(account.role)}</span></td><td>{account.role === 'acudiente' ? <div className="guardian-linked-students">{(account.studentIds || []).map(id => linkableStudents.find(student => student.id === id)).filter(Boolean).map(student => <span key={student.id}>{student.name} · {student.grade}</span>)}<small>{(account.studentIds || []).length} {(account.studentIds || []).length === 1 ? 'hijo vinculado' : 'hijos vinculados'}</small></div> : <span className="muted-dash">—</span>}</td><td><span className={`student-status ${Boolean(account.active) ? 'status-active' : 'status-inactive'}`}>{Boolean(account.active) ? 'Activa' : 'Desactivada'}</span></td><td><div className="table-row-actions"><button className="account-toggle" onClick={() => { setAccountError(''); setEditingAccount(account); setNewAccountRole(account.role); setAccountDialog(true) }}><Pencil size={14}/> Editar</button><button className="account-toggle" disabled={account.id === user?.id} onClick={() => setAccountActive(account)}>{Boolean(account.active) ? 'Desactivar' : 'Activar'}</button><button className="account-toggle delete-student-action" disabled={account.id === user?.id} onClick={() => deleteAccount(account)}><Trash2 size={14}/> Eliminar</button></div></td></tr>)}</tbody></table>{schoolUsers.length === 0 && <div className="students-empty"><span className="empty-icon"><Users size={22}/></span><strong>No se pudieron cargar las cuentas</strong><p>Vuelve a entrar en esta sección o revisa la conexión con el servidor.</p></div>}</div><p className="users-footnote">Puedes editar datos, rol y vínculos; al eliminar una cuenta se revoca el acceso y se conserva la auditoría. La recuperación automática de contraseñas aún no está disponible.</p></section> : active === 'Mi aula' && ['acudiente','estudiante'].includes(user?.role) ? <section className="students-page portal-work-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ESPACIO DE APRENDIZAJE</div><h1>Mi aula</h1><p className="welcome-sub">Tus cursos, actividades, fechas de entrega y trabajos enviados.</p></div></div>{portalStudent && <div className="portal-student-summary"><span>ESTUDIANTE</span><strong>{portalStudent.name}</strong><small>{portalStudent.grade}</small></div>}{portalStudents.length > 1 && <label className="student-filter work-student-picker">Estudiante<select value={workStudentId} onChange={event => { setWorkStudentId(event.target.value); setPortalCourseFilter('Todos') }}>{portalStudents.map(student => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label>}{portalAssignmentsError && <div className="login-message login-error" role="alert">{portalAssignmentsError}</div>}{!portalAssignmentsLoading && portalAssignments.length > 0 && <><div className="portal-work-stats"><article><span>Actividades</span><strong>{portalAssignments.length}</strong></article><article><span>Pendientes</span><strong>{portalPendingCount}</strong></article><article><span>Entregadas</span><strong>{portalSubmittedCount}</strong></article><article><span>Calificadas</span><strong>{portalGradedCount}</strong></article><article className="portal-overdue-stat"><span>Vencidas</span><strong>{portalOverdueCount}</strong></article></div><div className="portal-assignment-filters"><label className="student-filter">Curso<select value={portalCourseFilter} onChange={event => setPortalCourseFilter(event.target.value)}><option>Todos</option>{portalCourseOptions.map(course => <option key={course}>{course}</option>)}</select></label><label className="student-filter">Estado<select value={portalAssignmentFilter} onChange={event => setPortalAssignmentFilter(event.target.value)}>{['Todas','Pendientes','Entregadas','Calificadas','Vencidas'].map(status => <option key={status}>{status}</option>)}</select></label><label className="student-filter">Buscar actividad<input type="search" maxLength="100" value={portalAssignmentSearch} onChange={event => setPortalAssignmentSearch(event.target.value)} placeholder="Título, asignatura o curso"/></label></div>{portalOverdueCount > 0 && <div className="login-message login-error" role="status">Tienes {portalOverdueCount} {portalOverdueCount === 1 ? 'actividad vencida' : 'actividades vencidas'} pendiente{portalOverdueCount === 1 ? '' : 's'}. Revisa las fechas con tu docente.</div>}</>}{portalAssignmentsLoading ? <div className="students-empty">Cargando trabajos...</div> : <div className="assignment-list">{filteredPortalAssignments.map(item => <article className="assignment-card" key={item.id}><div className="assignment-heading"><div><span className="assignment-subject">{item.subject} · {item.period}</span><h2>{item.title}</h2><p>{item.courseName} · {item.academicYear}</p></div><span className={isPortalAssignmentOverdue(item) ? 'assignment-due assignment-late' : 'assignment-due'}>{item.dueAt ? `Entrega: ${item.dueAt}` : 'Sin fecha límite'}</span></div>{item.instructions && <p className="assignment-instructions">{item.instructions}</p>}{item.externalFormUrl && <a className="external-form-link" href={item.externalFormUrl} target="_blank" rel="noopener noreferrer">Abrir evaluación en Google Forms <ArrowRight size={14}/></a>}{item.images?.length > 0 && <div className="assessment-image-grid">{item.images.map((image, index) => <a key={image.id} href={`/api/assessment-images/${image.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/assessment-images/${image.id}`} loading="lazy" alt={`Imagen ${index + 1} de ${item.title}`}/><span>{image.fileName}</span></a>)}</div>}<div className="assignment-grade-line"><span>Calificación: <strong>{item.score === null ? 'Pendiente' : `${item.score} / ${item.maxScore}`}</strong></span>{item.comment && <span>Observación: {item.comment}</span>}</div><div className="assignment-submission-line">{item.deliveryMode === 'online' ? <><span className={item.onlineStatus === 'submitted' ? 'student-status status-active' : 'student-status status-inactive'}>{item.onlineStatus === 'submitted' ? 'Evaluación completada' : item.onlineStatus === 'started' ? 'Evaluación iniciada' : 'Pendiente'}</span>{item.onlineStatus === 'submitted' ? <span>Intento enviado · calificación: {item.score === null ? 'Pendiente de actualización' : item.score + ' / ' + item.maxScore}</span> : user?.role === 'estudiante' ? <button type="button" className="button button-primary" onClick={() => startOnlineExam(item)} disabled={onlineExamBusy}>{onlineExamBusy ? 'Abriendo…' : item.onlineStatus === 'started' ? 'Continuar evaluación' : 'Iniciar evaluación'}</button> : <span>El estudiante debe iniciar sesión con su propia cuenta para responder.</span>}</> : item.submissionId ? <><span className="student-status status-active">Entregado · versión {item.submissionNo}</span><span>{item.fileName} · {item.uploadedAt ? new Date(item.uploadedAt).toLocaleString('es-CO') : ''}</span><button className="account-toggle" onClick={() => downloadWorkFile(item.submissionId,item.fileName)}><Download size={14}/> Descargar</button></> : <span className="student-status status-inactive">Sin entregar</span>}</div>{item.deliveryMode !== 'online' && <form className="assignment-upload" onSubmit={event => uploadStudentWork(event,item)}><label>Subir o reemplazar trabajo<input name="workFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" required/></label><span className="field-hint">PDF, imagen, Word o Excel · máximo 8 MB. Se conservan hasta 10 versiones.</span><button type="submit" className="button button-primary" disabled={submissionBusyId === item.id}>{submissionBusyId === item.id ? 'Subiendo...' : <><Download size={15}/> Entregar trabajo</>}</button></form>}</article>)}{!filteredPortalAssignments.length && !portalAssignmentsLoading && <div className="students-empty"><span className="empty-icon"><ClipboardCheck size={22}/></span><strong>{portalAssignments.length ? 'No hay actividades para el curso elegido' : 'No hay trabajos activos para este estudiante'}</strong><p>{portalAssignments.length ? 'Elige otro curso para consultar sus actividades.' : 'Las actividades de sus cursos aparecerán aquí cuando un docente las cree.'}</p></div>}</div>}</section> : active === 'Boletines' && ['admin','secretaria','docente','acudiente','estudiante'].includes(user?.role) ? <section className="students-page report-card-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> INFORME ACADÉMICO</div><h1>Boletines</h1><p className="welcome-sub">Consulta notas y observaciones por estudiante, año lectivo y periodo.</p></div></div><div className="students-scope"><ShieldCheck size={14}/> El boletín solo incluye las asignaturas visibles para tu rol. Los promedios se expresan como porcentaje normalizado y no reemplazan la escala oficial del colegio.</div>{['admin','secretaria'].includes(user?.role) && <div className="publication-panel"><div><strong>Publicación del periodo</strong><span>{selectedPublication?.isPublished ? 'Publicado para acudientes y estudiantes.' : 'Todavía no aparece en el portal de estudiantes.'}</span></div><span className={selectedPublication?.isPublished ? 'publication-status publication-live' : 'publication-status'}>{selectedPublication?.isPublished ? 'Publicado' : 'Borrador'}</span><button className={selectedPublication?.isPublished ? 'button button-soft' : 'button button-primary'} onClick={toggleGradePublication} disabled={publicationSaving || !reportCardYear}>{publicationSaving ? 'Guardando…' : selectedPublication?.isPublished ? 'Retirar del portal' : 'Publicar en el portal'}</button></div>}<div className="report-filters report-card-filters"><label className="student-filter">Estudiante<select value={reportCardStudentId} onChange={event => { setReportCardStudentId(event.target.value); setReportCardCourseId(reportCardOptions.courses?.find(item => item.studentId === event.target.value && item.academicYear === reportCardYear)?.courseId || ''); setReportCardData(null) }}><option value="">Selecciona estudiante</option>{reportCardOptions.students.map(student => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label><label className="student-filter">Año lectivo<select value={reportCardYear} onChange={event => { const year = event.target.value; setReportCardYear(year); setReportCardCourseId(reportCardOptions.courses?.find(item => item.studentId === reportCardStudentId && item.academicYear === year)?.courseId || ''); setReportCardData(null); if (portalReportRole) setReportCardPeriod(reportCardOptions.publications?.find(item => item.academicYear === year && item.isPublished)?.period || '') }}><option value="">Selecciona año</option>{reportCardOptions.years.map(year => <option key={year}>{year}</option>)}</select></label>{portalReportRole && <label className="student-filter">Grado y curso<select value={reportCardCourseId} onChange={event => { setReportCardCourseId(event.target.value); setReportCardData(null) }}><option value="">{selectedReportCourses.length ? 'Selecciona el curso' : 'Grado actual / registro disponible'}</option>{selectedReportCourses.map(item => <option key={item.courseId} value={item.courseId}>{item.grade} · {item.courseName}</option>)}</select></label>}<label className="student-filter">Periodo<select value={reportCardPeriod} onChange={event => { setReportCardPeriod(event.target.value); setReportCardData(null) }}><option value="">Selecciona periodo</option>{reportCardPeriods.map(period => <option key={period}>{period}</option>)}</select></label><button className="button button-primary" onClick={loadReportCard} disabled={reportCardLoading || !reportCardStudentId || !reportCardYear}>{reportCardLoading ? 'Generando...' : <><Search size={15}/> Consultar boletín</>}</button>{reportCardData && <button className="button button-soft" onClick={() => window.print()}><Download size={15}/> Imprimir / guardar PDF</button>}</div>{reportCardError && <div className="login-message login-error" role="alert">{reportCardError}</div>}{portalReportRole && !(reportCardOptions.publications || []).some(item => item.isPublished) && <div className="login-message login-info">El colegio todavía no ha publicado boletines para el portal.</div>}{reportCardData ? <article className="report-card-document" style={{ "--document-accent": reportCardData.school?.primaryColor || user?.school?.primaryColor || "#286b83" }}><div className="report-card-header"><span className="report-card-institution-logo">{reportCardData.school?.hasLogo ? <img src={`/api/schools/${reportCardData.school.slug}/logo`} alt={`Logo de ${reportCardData.school.name}`}/> : <GraduationCap size={24}/>}</span><div><span>INFORME ACADÉMICO</span><h2>{reportCardData.school?.name || user?.school?.name}</h2><small>{[reportCardData.school?.address, reportCardData.school?.contactPhone, reportCardData.school?.contactEmail].filter(Boolean).join(" · ")}</small></div><div className="report-card-period"><strong>{reportCardData.period}</strong><span>Año lectivo {reportCardData.academicYear}</span><span className={reportCardData.isPublished ? 'publication-live' : 'report-preview-label'}>{reportCardData.isPublished ? 'Publicado en portal' : 'Vista administrativa'}</span></div></div><div className="report-card-student"><div><span>ESTUDIANTE</span><strong>{reportCardData.student.name}</strong></div><div><span>GRADO</span><strong>{reportCardData.student.grade}</strong></div>{reportCardData.student.courseName && <div><span>CURSO</span><strong>{reportCardData.student.courseName}</strong></div>}<div><span>GENERADO</span><strong>{new Date(reportCardData.generatedAt).toLocaleDateString('es-CO')}</strong></div></div>{reportCardData.subjects.length ? reportCardData.subjects.map(subject => <section className="report-subject" key={subject.subject}><div className="report-subject-heading"><div><h3>{subject.subject}</h3><span>{subject.teacherName || 'Asignatura'}</span></div>{subject.institutionalScore !== null ? <><strong>{subject.institutionalScore} / {subject.scaleMax}</strong><span className={subject.result === 'Aprobado' ? 'report-approved' : 'report-followup'}>{subject.result} · mínimo {subject.passingScore}</span><small>{subject.averagePercent}% normalizado</small></> : <strong>{subject.averagePercent === null ? 'Sin notas' : subject.averagePercent + '%'}</strong>}</div><table className="report-mark-table"><thead><tr><th>Evaluación</th><th>Nota</th><th>Ponderación</th><th>Observación</th></tr></thead><tbody>{subject.assessments.map((assessment,index) => <tr key={`${assessment.title}-${index}`}><td>{assessment.title}</td><td>{assessment.score === null ? 'Pendiente' : `${assessment.score} / ${assessment.maxScore}`}</td><td>{assessment.weightPercent}%</td><td>{assessment.comment || '—'}</td></tr>)}</tbody></table></section>) : <div className="students-empty"><strong>No hay evaluaciones registradas para este periodo</strong><p>El boletín aparecera cuando los docentes creen actividades para el estudiante.</p></div>}<div className="report-card-disclaimer">El resultado por asignatura se calcula con las notas normalizadas y las reglas de escala configuradas por el colegio.</div><div className="report-card-document-footer">{(reportCardData.signatures || []).map((signer,index) => <div className="report-card-signature" key={`${signer.id}-${index}`}>{signer.signature ? <img className="document-signature-image" src={signer.signature} alt=""/> : <span></span>}<strong>{signer.fullName}</strong><small>{signer.positionTitle}</small></div>)}{!(reportCardData.signatures || []).length && <div className="report-card-signature report-no-signatures">No hay firmantes configurados</div>}<div className="report-card-qr">{reportCardData.verificationCode && <QRCodeSVG value={`${window.location.origin}/validar/boletin/${reportCardData.verificationCode}`} size={88} level="M" title="Código para validar el boletín"/>}<span>{reportCardData.isPublished ? "Verifica la autenticidad del boletín" : "Vista previa; verificable al publicar"}</span><small>Número de control: {reportCardData.documentNumber}</small><small>Escanea el código QR para validar el boletín</small></div></div></article> : !reportCardLoading && <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>Selecciona estudiante y periodo</strong><p>Elige los filtros para consultar el boletín. Puedes imprimirlo o guardarlo como PDF desde el navegador.</p></div>}</section> : active === 'Reportes' ? <section className="students-page reports-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CONSULTA DE DATOS</div><h1>Reportes</h1><p className="welcome-sub">Genera informes desde los registros reales de tu colegio.</p></div></div><div className="students-scope"><ShieldCheck size={14}/> El acceso a cada reporte depende de tu rol. Los docentes solo consultan cursos y asignaturas que tienen asignados.</div><div className="report-filters"><label className="student-filter">Tipo de reporte<select value={reportType} onChange={event => { setReportType(event.target.value); setReportRows([]); setReportError('') }}><option value="students">Estudiantes</option><option value="attendance">Asistencia</option><option value="grades">Calificaciones</option>{['admin','secretaria'].includes(user?.role) && <><option value="enrollments">Matrículas</option><option value="guardians">Acudientes</option></>}</select></label><label className="student-filter">Año lectivo<select value={reportAcademicYear} onChange={event => setReportAcademicYear(event.target.value)}><option value="">Todos</option>{[...new Set(reportCourses.map(course => course.academicYear))].map(year => <option key={year}>{year}</option>)}</select></label><label className="student-filter">Curso<select value={reportCourseId} onChange={event => setReportCourseId(event.target.value)}><option value="">Todos</option>{reportCourses.filter(course => !reportAcademicYear || course.academicYear === reportAcademicYear).map(course => <option key={course.id} value={course.id}>{course.grade} · {course.name} · {course.academicYear}</option>)}</select></label>{!['students','guardians'].includes(reportType) && <><label className="student-filter">Desde<input type="date" value={reportFrom} max={reportTo} onChange={event => setReportFrom(event.target.value)}/></label><label className="student-filter">Hasta<input type="date" value={reportTo} min={reportFrom} onChange={event => setReportTo(event.target.value)}/></label></>}<div className="report-actions"><button className="button button-soft" onClick={exportReport} disabled={!reportRows.length}><Download size={15}/> Exportar CSV</button><button className="button button-primary" onClick={generateReport} disabled={reportLoading}>{reportLoading ? 'Generando…' : <><Search size={15}/> Generar reporte</>}</button></div></div>{reportError && <div className="login-message login-error" role="alert">{reportError}</div>}{reportTruncated && <div className="login-message login-info" role="status">El resultado supera 5.000 filas. Se muestran y exportan las primeras 5.000; reduce los filtros para obtener un informe completo.</div>}{reportRows.length > 0 ? <><div className="report-result-summary"><strong>{reportRows.length}</strong> registros{reportRows.length > 100 && <span> · vista previa de los primeros 100</span>}</div><div className="student-table-wrap"><table className="student-table report-table"><thead><tr>{Object.keys(reportRows[0]).map(column => <th key={column}>{column.toLocaleUpperCase('es')}</th>)}</tr></thead><tbody>{reportRows.slice(0,100).map((row,index) => <tr key={index}>{Object.entries(row).map(([key,value]) => <td key={key}>{String(value ?? '—')}</td>)}</tr>)}</tbody></table></div></> : <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>{reportLoading ? 'Consultando registros…' : 'Configura los filtros y genera el reporte'}</strong><p>Los resultados se consultan únicamente cuando presionas «Generar reporte».</p></div>}</section> : active === 'Comunicaciones' ? <section className="students-page communications-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> COMUNICACIÓN DEL COLEGIO</div><h1>Comunicaciones</h1><p className="welcome-sub">Consulta los avisos que recibiste y envía comunicados internos según tus permisos.</p></div>{['admin','rectoria','coordinacion','secretaria','docente','orientacion'].includes(user?.role) && <div className="students-actions"><button className="button button-primary" onClick={() => { setCommunicationError(''); setCommunicationAudience(user?.role === 'docente' ? 'course' : 'school'); setCommunicationDialog(true) }}><Plus size={17}/> Nuevo aviso</button></div>}</div><div className="students-scope"><ShieldCheck size={14}/> Los avisos se entregan dentro de la plataforma. No se envían correos ni mensajes externos en esta etapa.</div>{communicationError && <div className="login-message login-error" role="alert">{communicationError}</div>}<div className="communication-list">{communications.map(item => <article className="communication-card" key={item.id}><div className="communication-card-heading"><span className="communication-icon"><Bell size={17}/></span><div className="communication-title"><h2>{item.title}</h2><p>{item.audience === 'school' ? 'Todo el colegio' : item.courseName || 'Curso'} · {item.authorName} · {item.createdAt ? new Date(item.createdAt).toLocaleString('es-CO') : ''}</p></div>{item.isAuthor ? <span className="communication-read-count">{item.readCount}/{item.recipientCount} leídos</span> : item.readAt ? <span className="communication-read">Leído</span> : <span className="communication-unread">Nuevo</span>}</div><p className="communication-body">{item.body}</p>{(item.isAuthor || user?.role === 'admin') && <div className="communication-actions"><button className="account-toggle danger-action" onClick={() => deleteCommunication(item)} disabled={communicationDeletingId === item.id}>{communicationDeletingId === item.id ? 'Eliminando…' : <><Trash2 size={14}/> Eliminar aviso</>}</button></div>}{!item.isAuthor && !item.readAt && <div className="communication-actions"><button className="account-toggle" onClick={() => markCommunicationRead(item)}><Check size={14}/> Marcar como leído</button></div>}</article>)}{communications.length === 0 && <div className="students-empty"><span className="empty-icon"><Bell size={22}/></span><strong>No tienes comunicaciones todavía</strong><p>Los avisos dirigidos a tu cuenta aparecerán aquí.</p></div>}</div>{communicationDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !communicationBusy) setCommunicationDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="communication-dialog-title"><div className="dialog-heading"><div><h2 id="communication-dialog-title">Nuevo aviso</h2><p>Se guardará en el historial de comunicaciones del colegio.</p></div><button className="icon-btn" onClick={() => setCommunicationDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createCommunication}><label>Destinatarios<select name="audience" value={communicationAudience} onChange={event => setCommunicationAudience(event.target.value)}>{user?.role !== 'docente' && <option value="school">Todo el colegio</option>}<option value="course">Un curso</option></select></label>{communicationAudience === 'course' && <label>Curso<select name="courseId" required defaultValue=""><option value="" disabled>Selecciona el curso</option>{communicationCourses.map(course => <option key={course.id} value={course.id}>{course.grade} · {course.name} · {course.academicYear}</option>)}</select>{communicationCourses.length === 0 && <span className="field-hint">No tienes cursos activos asignados para enviar avisos.</span>}</label>}<label>Asunto<input name="title" required minLength="3" maxLength="160" placeholder="Escribe un asunto claro"/></label><label>Mensaje<textarea name="body" required minLength="3" maxLength="5000" rows="6" placeholder="Escribe la información que necesitan conocer…"/></label>{communicationError && <div className="login-message login-error" role="alert">{communicationError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setCommunicationDialog(false)} disabled={communicationBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={communicationBusy || (communicationAudience === 'course' && !communicationCourses.length)}>{communicationBusy ? 'Enviando…' : <><Bell size={15}/> Enviar aviso</>}</button></div></form></section></div>}</section> : active === 'Matrículas' ? <section className="students-page enrollment-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> PROCESO DE ADMISIÓN</div><h1>Matrículas</h1><p className="welcome-sub">Gestiona solicitudes y consulta el historial de traslados por año lectivo.</p></div><div className="students-actions"><button className="button button-primary" disabled={enrollmentTab !== 'requests'} onClick={() => { setEnrollmentError(''); setEnrollmentDialog(true) }}><Plus size={17}/> Nueva solicitud</button></div></div><div className="enrollment-tabs"><button className={enrollmentTab === 'requests' ? 'history-tab-selected' : ''} onClick={() => setEnrollmentTab('requests')}><ClipboardCheck size={15}/> Solicitudes</button><button className={enrollmentTab === 'history' ? 'history-tab-selected' : ''} onClick={() => setEnrollmentTab('history')}><Clock3 size={15}/> Historial y traslados</button></div>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}{enrollmentTab === 'requests' ? <><div className="students-toolbar enrollment-toolbar"><label className="student-filter">Buscar <input value={enrollmentSearch} onChange={event => setEnrollmentSearch(event.target.value)} placeholder="Nombre o documento"/></label><label className="student-filter">Estado <select value={enrollmentStatusFilter} onChange={event => setEnrollmentStatusFilter(event.target.value)}>{['Todos','Solicitada','En revisión','Pendiente documentos','Aprobada','Rechazada'].map(status => <option key={status}>{status}</option>)}</select></label><div className="student-count"><strong>{enrollmentRequests.length}</strong> solicitudes</div></div><div className="student-table-wrap"><table className="student-table enrollment-table"><thead><tr><th>ESTUDIANTE</th><th>DOCUMENTO / GRADO</th><th>ACUDIENTE</th><th>AÑO LECTIVO</th><th>DOCUMENTOS PENDIENTES</th><th>ESTADO</th></tr></thead><tbody>{enrollmentRequests.map(request => <tr key={request.id}><td><strong>{request.studentName}</strong><small className="history-secondary">{request.createdAt ? new Date(request.createdAt).toLocaleDateString('es-CO') : ''}</small></td><td>{request.document}<small className="history-secondary">{request.gradeRequested}</small></td><td>{request.guardianName}<small className="history-secondary">{request.guardianPhone || 'Sin teléfono'}</small></td><td>{request.academicYear}<small className="history-secondary">{request.documentNumber || '—'}</small></td><td>{request.pendingDocuments ? request.pendingDocuments.split('\n').join(', ') : 'Ninguno'}</td><td><select className={`enrollment-status-select enrollment-status-${request.status.toLowerCase().replaceAll(' ','-')}`} aria-label={`Estado de matrícula de ${request.studentName}`} value={request.status} disabled={request.status === 'Aprobada'} onChange={event => updateEnrollmentRequest(request,event.target.value)}>{['Solicitada','En revisión','Pendiente documentos','Aprobada','Rechazada'].map(status => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table>{!enrollmentRequests.length && <div className="students-empty"><span className="empty-icon"><ClipboardCheck size={22}/></span><strong>No hay solicitudes de matrícula</strong><p>Registra una solicitud nueva o ajusta los filtros.</p></div>}</div></> : <div className="student-table-wrap"><table className="student-table enrollment-table"><thead><tr><th>ESTUDIANTE</th><th>AÑO LECTIVO</th><th>CURSO</th><th>FECHAS</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{enrollmentHistory.map(record => <tr key={record.id}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.document} · {record.grade}</small></td><td>{record.academicYear}<small className="history-secondary">{record.documentNumber || 'Control pendiente'}</small></td><td>{record.courseName || 'Curso sin asignar'}</td><td>{record.startDate}{record.endDate ? ` → ${record.endDate}` : ''}</td><td><span className={`student-status ${record.status === 'Activa' ? 'status-active' : 'status-inactive'}`}>{record.status}</span></td><td>{record.status === 'Activa' && <button className="account-toggle" onClick={() => openTransferDialog(record)}><ArrowRight size={14}/> Trasladar</button>}</td></tr>)}</tbody></table>{!enrollmentHistory.length && <div className="students-empty"><span className="empty-icon"><Clock3 size={22}/></span><strong>Aún no hay matrículas aprobadas</strong><p>Al aprobar una solicitud se registrará aquí el historial por curso y año.</p></div>}</div>}</section> : active === 'Estudiantes' ? <StudentDirectoryModule user={user} students={students} studentsError={studentsError} statusFilter={statusFilter} setStatusFilter={setStatusFilter} exportStudents={exportStudents} setEditingStudent={setEditingStudent} setStudentDialog={setStudentDialog} deleteStudent={deleteStudent}/> : active === 'Mis cursos' && user?.role === 'docente' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ESPACIO DOCENTE</div><h1>Mis cursos</h1><p className="welcome-sub">Consulta los grupos y estudiantes asignados a tu cuenta.</p></div></div><div className="teacher-course-grid">{teacherCourses.map(course => <article className="course-card teacher-course-card" key={`${course.id}-${course.subject}`}><div className="course-card-top"><span className="stat-icon violet"><BookOpen size={17}/></span><span className="role-chip">{course.academicYear}</span></div><h2>{course.name}</h2><p>{course.grade} · {course.subject}</p><div className="course-roster-count"><Users size={16}/> {course.studentCount} estudiantes activos</div><button className="button button-primary" onClick={() => loadTeacherRoster(course)}>Ver lista de estudiantes</button></article>)}{!teacherCourses.length && <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>No tienes cursos asignados</strong><p>Solicita al administrador que te asigne un curso y una asignatura.</p></div>}</div>{teacherRoster.length > 0 && <div className="student-table-wrap teacher-roster"><h2>Estudiantes del grupo</h2><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>ESTADO</th></tr></thead><tbody>{teacherRoster.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><span className="student-status status-active">{student.status}</span></td></tr>)}</tbody></table></div>}</section> : !['admin', 'rectoria'].includes(user?.role) ? <section className="role-home"><div className="role-home-icon"><LockKeyhole size={21}/></div><div className="eyebrow">ACCESO DEL COLEGIO</div><h1>Hola, {user?.name?.split(/\s+/)[0]}</h1><p>Tu cuenta tiene el rol de <strong>{roleName(user?.role)}</strong>.</p>{['acudiente', 'estudiante'].includes(user?.role) ? portalStudents.length ? <div className="portal-student-list">{portalStudents.map(student => <article className="portal-student-card" key={student.id}><div className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</div><div><strong>{student.name}</strong><span>{student.relationship === 'acudiente' ? 'Estudiante a cargo' : 'Mi registro'} · {student.grade} · {student.status}</span></div></article>)}</div> : <div className="login-message login-info">Tu cuenta aún no está vinculada a un estudiante. Contacta al administrador del colegio.</div> : <div className="login-message login-info">Abre «Mis cursos» para consultar tus grupos asignados.</div>}<span className="role-home-note"><ShieldCheck size={14}/> Solo ves los registros asociados a tu cuenta.</span></section> : <><div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> {new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es-CO'))}</div><h1>Buenos días, {user?.name?.split(/\s+/)[0] || ''} <span className="wave">✳</span></h1><p className="welcome-sub">Resumen actualizado con los registros de tu colegio.</p></div><div className="welcome-actions"><button className="button button-primary" onClick={() => { setActive('Estudiantes'); setEditingStudent(null); setStudentDialog(true) }}><Plus size={17}/> Nuevo estudiante</button></div></div>
        <div className="period-toolbar"><label className="dashboard-date-filter"><CalendarDays size={16}/><span>Fecha de consulta</span><input type="date" value={dashboardDate} onChange={event => setDashboardDate(event.target.value)}/></label><span className="dashboard-source">{dashboardLoading ? 'Actualizando datos…' : 'Métricas consultadas en la base del colegio'}</span></div>
        {dashboardError && <div className="login-message login-error" role="alert">{dashboardError}</div>}
        <section className="stats-grid" aria-label="Indicadores escolares">
          <article className="stat-card"><div className="stat-top"><span>Estudiantes activos</span><span className="stat-icon blue"><Users size={17}/></span></div><div className="stat-number">{dashboardData ? dashboardData.activeStudents.toLocaleString('es-CO') : '—'}</div><div className="stat-foot"><span>Registros con matrícula activa</span></div></article>
          <article className="stat-card"><div className="stat-top"><span>Asistencia de la fecha</span><span className="stat-icon green"><Activity size={17}/></span></div><div className="stat-number">{dashboardData?.attendance.rate == null ? '—' : <>{dashboardData.attendance.rate}<span className="unit">%</span></>}</div><div className="stat-foot"><span>{dashboardData?.attendance.total ? `${dashboardData.attendance.total} registros` : 'Sin registros para esta fecha'}</span></div></article>
          <article className="stat-card"><div className="stat-top"><span>Ausencias registradas</span><span className="stat-icon amber"><ClipboardCheck size={17}/></span></div><div className="stat-number">{dashboardData?.attendance.total ? dashboardData.attendance.absent.toLocaleString('es-CO') : '—'}</div><div className="stat-foot"><span>{dashboardData?.attendance.total ? `De ${dashboardData.attendance.total} marcas de asistencia` : 'Aún no hay marcas de asistencia'}</span></div></article>
          <article className="stat-card"><div className="stat-top"><span>Cursos registrados</span><span className="stat-icon violet"><BookOpen size={17}/></span></div><div className="stat-number">{dashboardData ? dashboardData.courses.toLocaleString('es-CO') : '—'}</div><div className="stat-foot"><span>Incluye todos los años lectivos</span></div></article>
        </section>
        <section className="main-grid dashboard-main-grid">
          <article className="panel attendance-panel"><div className="panel-heading"><div><h2>Asistencia de los últimos 7 días</h2><p>Presentes y tardanzas sobre las marcas guardadas cada día</p></div></div>{dashboardData?.weeklyAttendance?.some(day => day.rate !== null) ? <div className="dashboard-week-chart" role="img" aria-label="Porcentaje de asistencia registrado durante los últimos siete días">{dashboardData.weeklyAttendance.map(day => <div className="dashboard-week-day" key={day.date}><span className="dashboard-week-value">{day.rate == null ? '—' : `${day.rate}%`}</span><div className="dashboard-week-track"><i style={{ height: `${day.rate || 0}%` }}/></div><span className="dashboard-week-label">{day.label}</span></div>)}</div> : <div className="dashboard-no-data"><ClipboardCheck size={22}/><strong>Aún no hay registros de asistencia</strong><span>Cuando se marque asistencia, aquí aparecerá el resumen diario.</span><button className="button button-soft" onClick={() => setActive('Asistencia')}>Abrir asistencia <ArrowRight size={14}/></button></div>}</article>
          <article className="panel attendance-today-panel"><div className="panel-heading"><div><h2>Marcas de asistencia</h2><p>{new Date(`${dashboardDate}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><span className="stat-icon green"><CalendarDays size={17}/></span></div>{dashboardData?.attendance.total ? <div className="dashboard-status-list"><div><span className="attendance-status-dot present-dot"/><span>Presente</span><strong>{dashboardData.attendance.present}</strong></div><div><span className="attendance-status-dot late-dot"/><span>Tarde</span><strong>{dashboardData.attendance.late}</strong></div><div><span className="attendance-status-dot absent-dot"/><span>Ausente</span><strong>{dashboardData.attendance.absent}</strong></div><div><span className="attendance-status-dot justified-dot"/><span>Justificado</span><strong>{dashboardData.attendance.justified}</strong></div></div> : <div className="dashboard-no-data dashboard-small-empty"><span>No hay asistencia registrada para esta fecha.</span><button className="agenda-link" onClick={() => setActive('Asistencia')}>Ir a asistencia <ArrowRight size={14}/></button></div>}</article>
        </section>
        <section className="bottom-grid dashboard-bottom-grid"><article className="panel quick-panel"><div className="panel-heading"><div><h2>Accesos rápidos</h2><p>Abre un módulo del colegio</p></div><span className="quick-spark"><Sparkles size={17}/></span></div><div className="quick-grid"><button onClick={() => { setActive('Estudiantes'); setEditingStudent(null); setStudentDialog(true) }}><span className="quick-icon q-blue"><Users size={17}/></span><strong>Registrar estudiante</strong><ArrowRight size={14}/></button><button onClick={() => setActive('Asistencia')}><span className="quick-icon q-green"><ClipboardCheck size={17}/></span><strong>Tomar asistencia</strong><ArrowRight size={14}/></button><button onClick={() => setActive('Calificaciones')}><span className="quick-icon q-violet"><BookOpen size={17}/></span><strong>Registrar calificaciones</strong><ArrowRight size={14}/></button><button onClick={() => setActive('Cursos y docentes')}><span className="quick-icon q-amber"><GraduationCap size={17}/></span><strong>Gestionar cursos</strong><ArrowRight size={14}/></button></div></article></section>
        <footer className="footer"><span>© {new Date().getFullYear()} Educa · Gestión escolar</span><span><ShieldCheck size={14}/> Datos consultados desde la institución <i/> {dashboardLoading ? 'Actualizando' : 'Actualizado al consultar'}</span></footer></>}
      </div>
    </main>
    {notice && <div className="toast"><span><Check size={15}/></span>{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={15}/></button></div>}
    {studentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setStudentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><div><h2 id="dialog-title">{editingStudent ? 'Editar estudiante' : 'Nuevo estudiante'}</h2><p>Completa la información básica del registro.</p></div><button className="icon-btn" onClick={() => { setStudentDialog(false); setEditingStudent(null) }} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> El tipo y lugar de expedición son obligatorios y se guardan junto al documento para emitir constancias.</div><form key={editingStudent?.id || "new-student"} onSubmit={saveStudent} onChange={() => studentSaveError && setStudentSaveError("")}><label>Nombre completo<input name="name" required defaultValue={editingStudent?.name || ''} maxLength="100" autoComplete="off" placeholder="Nombre y apellidos"/></label><div className="form-row"><label>Tipo de documento<select name="documentType" required defaultValue={editingStudent?.documentType || ''}><option value="">Selecciona el tipo</option><option>Registro civil</option><option>Tarjeta de identidad</option><option>Cédula de ciudadanía</option><option>Cédula de extranjería</option><option>Pasaporte</option><option>Permiso por protección temporal</option><option>Otro</option></select></label><label>Número de documento<input name="document" required defaultValue={editingStudent?.document || ''} maxLength="30" autoComplete="off" placeholder="Ej. 1.108.452.215"/></label></div><label>Lugar de expedición (municipio y departamento)<input name="documentIssuedPlace" required minLength="3" maxLength="120" defaultValue={editingStudent?.documentIssuedPlace || ''} placeholder="Ej. Flandes, Tolima"/></label><div className="form-row"><label>Grado y curso<input name="grade" required defaultValue={editingStudent?.grade || ''} maxLength="40" placeholder="Ej. 6° A"/></label></div><div className="form-row"><label>Acudiente autorizado<input name="guardian" required defaultValue={editingStudent?.guardian || ''} maxLength="100" placeholder="Nombre del acudiente"/></label><label>Teléfono de contacto<input name="phone" type="tel" maxLength="25" defaultValue={editingStudent?.phone || ''} autoComplete="off" placeholder="Opcional"/></label></div><label>Foto del estudiante<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"/><small>JPG, PNG o WEBP · máximo 2 MB. {editingStudent?.hasPhoto ? 'Deja el selector vacío para conservar la foto actual.' : 'Opcional; se muestra en el carné privado.'}</small></label>{editingStudent?.hasPhoto && <label className="checkbox-label"><input name="removePhoto" type="checkbox"/> Quitar la foto actual</label>}<label>Estado de matrícula<select name="status" defaultValue={editingStudent?.status || 'Activo'}><option>Activo</option><option>Retirado</option></select></label>{studentSaveError && <div className="login-message login-error" role="alert">{studentSaveError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setStudentDialog(false); setEditingStudent(null); setStudentSaveError("") }} disabled={studentSaving}>Cancelar</button><button type="submit" className="button button-primary" disabled={studentSaving}><Check size={15}/> {studentSaving ? 'Guardando…' : editingStudent ? 'Guardar cambios' : 'Guardar estudiante'}</button></div></form></section></div>}
    {assessmentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAssessmentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-dialog-title"><div className="dialog-heading"><div><h2 id="assessment-dialog-title">{assessmentCategory === 'class_activity' ? 'Registrar actividad de clase' : 'Nueva evaluación o trabajo'}</h2><p>{selectedGradeAssignment?.courseName} · {selectedGradeAssignment?.subject} · {gradePeriod}</p></div><button className="icon-btn" onClick={() => setAssessmentDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createAssessment}><label>Nombre<input name="title" required minLength="2" maxLength="120" placeholder={assessmentCategory === 'class_activity' ? 'Ej. Participación en clase' : 'Ej. Taller de fracciones'} autoComplete="off"/></label><label>Registro<select value={assessmentCategory} onChange={event => { setAssessmentCategory(event.target.value); if (event.target.value === 'class_activity') { setAssessmentMode('file'); setAssessmentPublished(true) } else if (!assessmentQuestions.length) setAssessmentQuestions([{ key: crypto.randomUUID(), prompt: '', options: ['', '', '', ''], correctOption: 0, points: '1' }]) }}><option value="assignment">Tarea o evaluación para estudiantes</option><option value="class_activity">Actividad realizada en clase · solo notas</option></select></label>{assessmentCategory === 'assignment' && <label>Tipo de actividad<select value={assessmentMode} onChange={event => { setAssessmentMode(event.target.value); setAssessmentPublished(event.target.value === 'file') }}><option value="file">Trabajo para entregar como archivo</option><option value="online">Evaluación en línea</option></select></label>}{assessmentCategory === 'class_activity' && <div className="students-scope"><BookOpen size={15}/> Registro exclusivo del docente para calificar actividades realizadas en clase. No se publicará como tarea ni generará una entrega para el estudiante.</div>}<label>Instrucciones<textarea name="instructions" maxLength="2000" rows="3" placeholder={assessmentCategory === 'class_activity' ? 'Describe brevemente la actividad para identificarla en el registro.' : assessmentMode === 'online' ? 'Indicaciones que verá el estudiante antes de responder.' : 'Describe la actividad y cómo deben entregar el trabajo.'}/></label>{assessmentCategory === 'assignment' && <><label>Fecha límite<input name="dueAt" type="date"/></label>{assessmentMode === 'file' && <><label>Enlace de Google Forms (opcional)<input name="externalFormUrl" type="url" maxLength="1000" placeholder="https://forms.gle/…"/><span className="field-hint">Se abrirá en Google Forms cuando el estudiante pulse el enlace.</span></label><label>Imágenes de apoyo (opcional)<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple/><span className="field-hint">Hasta 5 imágenes JPG, PNG o WEBP · máximo 4 MB cada una.</span></label></>}</>}<label>Ponderación relativa (%)<input name="weightPercent" type="number" required min="0.01" max="100" step="any" defaultValue="100"/></label>{assessmentCategory === 'assignment' && assessmentMode === 'online' ? <><OnlineQuestionEditor questions={assessmentQuestions} onChange={setAssessmentQuestions}/><div className="students-scope"><ShieldCheck size={14}/> Puntaje máximo automático: {assessmentQuestions.reduce((total, question) => total + Number(question.points || 0), 0).toFixed(2)}. Las respuestas se califican al enviar.</div><label className="online-publish-check"><input type="checkbox" checked={assessmentIntegrityMonitoring} onChange={event => setAssessmentIntegrityMonitoring(event.target.checked)}/> Registrar cambios de pestaña o pérdida de foco</label>{assessmentIntegrityMonitoring && <div className="login-message login-info">Se avisará al estudiante y se guardarán la hora y el tipo de incidencia. El navegador no puede determinar qué aplicación abrió ni demostrar uso de herramientas externas.</div>}<label className="online-publish-check"><input type="checkbox" checked={assessmentPublished} onChange={event => setAssessmentPublished(event.target.checked)}/> Publicar inmediatamente en Mi aula</label></> : <label>Puntaje máximo<input name="maxScore" type="number" required min="0.01" max="10000" step="any" defaultValue="5"/></label>}{gradeError && <div className="login-message login-error" role="alert">{gradeError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setAssessmentDialog(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={assessmentCreating}><Check size={15}/> {assessmentCreating ? 'Guardando…' : assessmentCategory === 'class_activity' ? 'Crear registro de notas' : assessmentMode === 'online' ? 'Crear evaluación en línea' : 'Crear trabajo'}</button></div></form></section></div>}
    {onlineExam && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !onlineExamBusy) closeOnlineExam() }}><section className="student-dialog online-exam-dialog" role="dialog" aria-modal="true" aria-labelledby="online-exam-title"><div className="dialog-heading"><div><div className="eyebrow">EVALUACIÓN EN LÍNEA · {onlineExam.subject}</div><h2 id="online-exam-title">{onlineExam.title}</h2><p>Responde todas las preguntas y envía una sola vez. Puntaje máximo: {onlineExam.maxScore}.</p></div><button type="button" className="icon-btn" onClick={closeOnlineExam} disabled={onlineExamBusy || onlineDraftSaving} aria-label="Cerrar"><X size={19}/></button></div>{onlineExam.monitoringEnabled && <div className="login-message login-info" role="status"><Activity size={15}/> Esta evaluación registra la hora de los cambios de pestaña, salida de la página o pérdida de foco. Esto no identifica qué aplicación se abrió ni demuestra uso de herramientas externas.</div>}{onlineExam.instructions && <p className="assignment-instructions">{onlineExam.instructions}</p>}<form onSubmit={submitOnlineExam} className="online-exam-form">{onlineExam.questions.map(question => <fieldset className="online-exam-question" key={question.id}><legend>{question.questionNo}. {question.prompt} <span>{question.points} pts</span></legend>{question.options.map((option, index) => <label className="online-exam-option" key={index}><input type="radio" name={question.id} checked={onlineExamAnswers[question.id] === index} onChange={() => { setOnlineDraftSaved(false); setOnlineExamAnswers(answers => ({ ...answers, [question.id]: index })) }}/><span>{option}</span></label>)}</fieldset>)}{onlineExamError && <div className="login-message login-error" role="alert">{onlineExamError}</div>}<div className="online-draft-state" role="status">{onlineDraftSaving ? 'Guardando respuestas…' : onlineDraftSaved ? 'Las respuestas se guardan automáticamente.' : 'Esperando a que se guarde el borrador…'}</div><div className="dialog-actions"><button type="button" className="button button-soft" onClick={closeOnlineExam} disabled={onlineExamBusy || onlineDraftSaving}>Cerrar y continuar después</button><button type="submit" className="button button-primary" disabled={onlineExamBusy}>{onlineExamBusy ? 'Enviando…' : 'Finalizar y enviar'}</button></div></form></section></div>}
    {integrityEventsDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setIntegrityEventsDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="integrity-events-title"><div className="dialog-heading"><div><div className="eyebrow">SEGUIMIENTO DE LA EVALUACIÓN</div><h2 id="integrity-events-title">Incidencias de foco</h2><p>Estos registros indican pérdida de foco o salida de página. Por sí solos no prueban una conducta ni identifican la aplicación utilizada.</p></div><button type="button" className="icon-btn" onClick={() => setIntegrityEventsDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><div className="student-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>EVENTO</th><th>VECES</th><th>PRIMERA VEZ</th><th>ÚLTIMA VEZ</th></tr></thead><tbody>{integrityEvents.map(item => <tr key={item.studentId + item.eventType}><td>{item.studentName}</td><td>{{tab_hidden:'Pestaña oculta',window_blur:'Ventana perdió foco',fullscreen_exit:'Salió de pantalla completa',page_exit:'Salió de la página'}[item.eventType] || item.eventType}</td><td>{item.count}</td><td>{item.firstAt ? new Date(item.firstAt).toLocaleString('es-CO') : '—'}</td><td>{item.lastAt ? new Date(item.lastAt).toLocaleString('es-CO') : '—'}</td></tr>)}</tbody></table>{!integrityEvents.length && <div className="students-empty">No se han registrado cambios de foco.</div>}</div><div className="dialog-actions"><button className="button button-primary" onClick={() => setIntegrityEventsDialog(false)}>Cerrar</button></div></section></div>}
    {enrollmentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !enrollmentBusy) setEnrollmentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="enrollment-dialog-title"><div className="dialog-heading"><div><h2 id="enrollment-dialog-title">Nueva solicitud de matrícula</h2><p>Completa la información del aspirante y los documentos faltantes.</p></div><button className="icon-btn" onClick={() => setEnrollmentDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createEnrollmentRequest}><label>Nombre completo del estudiante<input name="studentName" required minLength="2" maxLength="100" placeholder="Nombre y apellidos"/></label><div className="form-row"><label>Documento<input name="document" required maxLength="30" placeholder="Identificación"/></label><label>Grado solicitado<input name="gradeRequested" required maxLength="40" placeholder="Ej. 6° A"/></label></div><label>Año lectivo<input name="academicYear" required pattern="[0-9]{4}-[0-9]{4}" defaultValue={`${new Date().getFullYear()}-${new Date().getFullYear()+1}`}/></label><div className="form-row"><label>Nombre del acudiente<input name="guardianName" required maxLength="100" placeholder="Nombre completo"/></label><label>Teléfono<input name="guardianPhone" type="tel" maxLength="25" placeholder="Opcional"/></label></div><label>Documentos pendientes <span className="optional-label">SEPARADOS POR COMAS</span><input name="pendingDocuments" maxLength="1000" placeholder="Registro civil, certificado de notas"/></label><label>Observaciones<textarea name="notes" maxLength="1000" rows="3" placeholder="Opcional"/></label>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setEnrollmentDialog(false)} disabled={enrollmentBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={enrollmentBusy}>{enrollmentBusy ? 'Guardando…' : <><Check size={15}/> Crear solicitud</>}</button></div></form></section></div>}
    {transferTarget && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !enrollmentBusy) setTransferTarget(null) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title"><div className="dialog-heading"><div><h2 id="transfer-dialog-title">Trasladar estudiante</h2><p>{transferTarget.studentName} · {transferTarget.academicYear} · {transferTarget.courseName || 'Curso sin asignar'}</p></div><button className="icon-btn" onClick={() => setTransferTarget(null)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={transferStudent}><label>Curso destino<select name="courseId" required defaultValue=""><option value="" disabled>Selecciona el curso destino</option>{transferCourses.filter(course => course.id !== transferTarget.courseId).map(course => <option key={course.id} value={course.id}>{course.name} · {course.grade}</option>)}</select></label>{transferCourses.filter(course => course.id !== transferTarget.courseId).length === 0 && <div className="login-message login-info">No hay otro curso activo para este mismo año lectivo.</div>}<label>Fecha efectiva<input name="effectiveDate" type="date" required defaultValue={getLocalDate()}/></label><label>Observación<textarea name="notes" maxLength="1000" rows="3" placeholder="Motivo o detalle del traslado"/></label>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setTransferTarget(null)} disabled={enrollmentBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={enrollmentBusy || !transferCourses.some(course => course.id !== transferTarget.courseId)}>{enrollmentBusy ? 'Guardando…' : <><Check size={15}/> Registrar traslado</>}</button></div></form></section></div>}
    {historyCourse && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHistoryCourse(null) }}><section className="student-dialog course-history-dialog" role="dialog" aria-modal="true" aria-labelledby="course-history-title"><div className="dialog-heading"><div><h2 id="course-history-title">Historial del curso</h2><p>{historyCourse.name} · {historyCourse.grade} · {historyCourse.academicYear}{historyCourse.isActive ? '' : ' · Archivado'}</p></div><button className="icon-btn" onClick={() => setHistoryCourse(null)} aria-label="Cerrar historial"><X size={19}/></button></div><div className="course-history-tabs"><button className={historyKind === 'attendance' ? 'history-tab-selected' : ''} onClick={() => { setHistoryKind('attendance'); loadCourseHistory(historyCourse, 'attendance', 0) }}><CalendarDays size={15}/> Asistencia</button><button className={historyKind === 'grades' ? 'history-tab-selected' : ''} onClick={() => { setHistoryKind('grades'); loadCourseHistory(historyCourse, 'grades', 0) }}><BookOpen size={15}/> Calificaciones</button></div><div className="course-history-body">{historyError && <div className="login-message login-error" role="alert">{historyError}</div>}{historyLoading ? <div className="students-empty">Cargando historial…</div> : historyRecords.length ? historyKind === 'attendance' ? <div className="student-table-wrap history-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>FECHA</th><th>ESTADO</th><th>REGISTRÓ</th><th>GUARDADO</th></tr></thead><tbody>{historyRecords.map((record,index) => <tr key={`${record.studentName}-${record.attendanceDate}-${index}`}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.grade}</small></td><td>{record.attendanceDate}</td><td><span className={`student-status ${record.status === 'Presente' || record.status === 'Tarde' ? 'status-active' : 'status-inactive'}`}>{record.status}</span></td><td>{record.markedBy}</td><td>{new Date(record.markedAt).toLocaleString('es-CO')}</td></tr>)}</tbody></table></div> : <div className="student-table-wrap history-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>EVALUACIÓN</th><th>PERIODO</th><th>NOTA</th><th>OBSERVACIÓN</th><th>ACTUALIZÓ</th></tr></thead><tbody>{historyRecords.map((record,index) => <tr key={`${record.studentName}-${record.assessmentTitle}-${index}`}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.grade}</small></td><td><strong>{record.assessmentTitle}</strong><small className="history-secondary">{record.subject}</small></td><td>{record.period}</td><td>{record.score} / {record.maxScore}</td><td>{record.comment || '—'}</td><td><strong>{record.updatedBy}</strong><small className="history-secondary">{new Date(record.updatedAt).toLocaleString('es-CO')}</small></td></tr>)}</tbody></table></div> : <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>No hay registros de {historyKind === 'attendance' ? 'asistencia' : 'calificaciones'} todavía</strong><p>Los datos históricos aparecerán aquí cuando existan registros asociados al curso.</p></div>}</div><div className="course-history-footer"><span>{historyTotal ? `Mostrando ${historyOffset + 1}–${Math.min(historyOffset + historyRecords.length, historyTotal)} de ${historyTotal}` : 'Sin registros'}</span><div><button className="button button-soft" disabled={historyLoading || historyOffset === 0} onClick={() => loadCourseHistory(historyCourse, historyKind, Math.max(0, historyOffset - 25))}>Anterior</button><button className="button button-soft" disabled={historyLoading || historyOffset + historyRecords.length >= historyTotal} onClick={() => loadCourseHistory(historyCourse, historyKind, historyOffset + 25)}>Siguiente</button></div></div></section></div>}
    {courseDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCourseDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title"><div className="dialog-heading"><div><h2 id="course-dialog-title">{editingCourse ? 'Editar curso' : 'Crear curso'}</h2><p>Registra el grupo y el año lectivo.</p></div><button className="icon-btn" onClick={() => { setCourseDialog(false); setEditingCourse(null) }} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={saveCourse}><label>Nombre del curso<input name="name" required minLength="2" maxLength="80" placeholder="Ej. 6° A" defaultValue={editingCourse?.name || ''}/></label><label>Grado o grupo<input name="grade" required minLength="2" maxLength="40" placeholder="Debe coincidir con el grado de los estudiantes" defaultValue={editingCourse?.grade || ''}/></label><label>Año lectivo<input name="academicYear" required pattern="[0-9]{4}-[0-9]{4}" defaultValue={editingCourse?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear()+1}`} placeholder="2026-2027"/></label>{courseError && <div className="login-message login-error" role="alert">{courseError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setCourseDialog(false); setEditingCourse(null) }}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15}/> {editingCourse ? 'Guardar cambios' : 'Guardar curso'}</button></div></form></section></div>}
    {assignmentCourse && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAssignmentCourse(null) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title"><div className="dialog-heading"><div><h2 id="assignment-dialog-title">{editingAssignment ? 'Editar asignación' : 'Asignar docente'}</h2><p>{assignmentCourse.name} · {assignmentCourse.academicYear}</p></div><button className="icon-btn" onClick={() => { setAssignmentCourse(null); setEditingAssignment(null) }} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={assignTeacher}><label>Docente<select name="teacherId" required defaultValue={editingAssignment?.id || ''}><option value="" disabled>Selecciona docente</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label><label>Asignatura<select name="subject" required defaultValue={editingAssignment ? (commonSubjects.includes(editingAssignment.subject) ? editingAssignment.subject : '__otra__') : ''} onChange={event => setIsCustomSubject(event.target.value === '__otra__')}><option value="" disabled>Selecciona asignatura</option>{commonSubjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}<option value="__otra__">Otra asignatura…</option></select></label>{isCustomSubject && <label>Nombre de la asignatura<input name="customSubject" required minLength="2" maxLength="80" placeholder="Escribe el nombre" autoComplete="off" defaultValue={editingAssignment?.subject || ''}/></label>}{teachers.length === 0 && <div className="login-message login-info">Primero crea y activa una cuenta con rol Docente en «Usuarios y accesos».</div>}{courseError && <div className="login-message login-error" role="alert">{courseError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setAssignmentCourse(null); setEditingAssignment(null) }}>Cancelar</button><button type="submit" className="button button-primary" disabled={!teachers.length}><Check size={15}/> {editingAssignment ? 'Guardar cambios' : 'Asignar'}</button></div></form></section></div>}
    {passwordDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !passwordBusy) setPasswordDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title"><div className="dialog-heading"><div><h2 id="password-dialog-title">Cambiar contraseña</h2><p>Actualiza la clave de acceso de tu cuenta.</p></div><button type="button" className="icon-btn" onClick={() => setPasswordDialog(false)} disabled={passwordBusy} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> Se cerrarán las demás sesiones de tu cuenta al guardar.</div><form onSubmit={changeOwnPassword}><label>Contraseña actual<input name="currentPassword" type="password" required maxLength="128" autoComplete="current-password"/></label><label>Nueva contraseña <span className="optional-label">12 CARACTERES MÍNIMO</span><input name="newPassword" type="password" required minLength="12" maxLength="128" autoComplete="new-password"/></label><label>Confirmar nueva contraseña<input name="confirmPassword" type="password" required minLength="12" maxLength="128" autoComplete="new-password"/></label>{passwordError && <div className="login-message login-error" role="alert">{passwordError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setPasswordDialog(false)} disabled={passwordBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={passwordBusy}>{passwordBusy ? 'Actualizando…' : <><LockKeyhole size={15}/> Guardar contraseña</>}</button></div></form></section></div>}
    {accountDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !accountBusy) setAccountDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><div className="dialog-heading"><div><h2 id="account-dialog-title">{editingAccount ? 'Editar cuenta' : 'Crear acceso al colegio'}</h2><p>{editingAccount ? 'Actualiza los datos y permisos de esta cuenta.' : 'La persona iniciará sesión con el colegio, correo y contraseña inicial.'}</p></div><button className="icon-btn" onClick={() => setAccountDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> La cuenta queda asociada únicamente a {user?.school?.name || 'este colegio'}.</div><form onSubmit={saveAccount}><label>Nombre completo<input name="name" required minLength="2" maxLength="100" autoComplete="off" placeholder="Nombre y apellidos" defaultValue={editingAccount?.name || ''}/></label><label>Correo electrónico<input name="email" type="email" required maxLength="254" autoComplete="off" placeholder="persona@colegio.edu.co" defaultValue={editingAccount?.email || ''}/></label><label>Rol de acceso{editingAccount?.id === user?.id && <input type="hidden" name="role" value={newAccountRole}/>}<select name="role" value={newAccountRole} disabled={editingAccount?.id === user?.id} onChange={event => setNewAccountRole(event.target.value)}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>{['acudiente', 'estudiante'].includes(newAccountRole) && <fieldset className="student-link-fieldset"><legend>{newAccountRole === 'acudiente' ? 'Hijos vinculados a esta cuenta' : 'Registro del estudiante'}</legend>{newAccountRole === 'acudiente' && <p className="student-links-help">Selecciona todos los hijos de esta familia. El acudiente usará una sola cuenta para consultar cada perfil.</p>}{linkableStudents.length ? linkableStudents.map((student, index) => <label className="student-link-option" key={student.id}><input type={newAccountRole === 'estudiante' ? 'radio' : 'checkbox'} name="studentIds" value={student.id} defaultChecked={editingAccount?.studentIds?.includes(student.id)} required={newAccountRole === 'estudiante' && index === 0}/><span><strong>{student.name}</strong><small>{student.document} · {student.grade}</small></span></label>) : <p>No hay estudiantes activos para asociar. Registra primero al estudiante en el módulo Estudiantes.</p>}</fieldset>}<label>{editingAccount ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} <span className="optional-label">12 CARACTERES MÍNIMO</span><input name="password" type="password" required={!editingAccount} minLength="12" maxLength="128" autoComplete="new-password" placeholder={editingAccount ? 'Déjala vacía para conservarla' : 'Contraseña temporal segura'}/></label><p className="users-footnote">{editingAccount ? 'Déjala vacía para conservar la contraseña actual.' : 'Comparte la contraseña inicial directamente por un canal seguro.'}</p>{accountError && <div className="login-message login-error" role="alert">{accountError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setAccountDialog(false)} disabled={accountBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={accountBusy}>{accountBusy ? 'Guardando…' : <><Check size={15}/> {editingAccount ? 'Guardar cambios' : 'Crear cuenta'}</>}</button></div></form></section></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
