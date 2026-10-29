import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen,
  CalendarDays, Check, ChevronDown, ChevronRight, ClipboardCheck,
  Clock3, Download, Eye, EyeOff, FileText, GraduationCap, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal,
  Plus, Pencil, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Users, X,
} from 'lucide-react'
import './style.css'

const navGroups = [
  { title: 'GENERAL', items: [{ label: 'Resumen', icon: LayoutDashboard }, { label: 'Estudiantes', icon: Users }, { label: 'Matrículas', icon: ClipboardCheck }, { label: 'Asistencia', icon: CalendarDays }, { label: 'Calificaciones', icon: BookOpen }, { label: 'Boletines', icon: FileText }, { label: 'Mi aula', icon: ClipboardCheck }] },
  { title: 'GESTIÓN', items: [{ label: 'Usuarios y accesos', icon: LockKeyhole }, { label: 'Cursos y docentes', icon: GraduationCap }, { label: 'Mis cursos', icon: BookOpen }, { label: 'Comunicaciones', icon: Bell }, { label: 'Reportes', icon: FileText }] },
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
const roleName = value => roles.find(role => role.value === value)?.label || value
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

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [schools, setSchools] = useState([])
  const [setupRequired, setSetupRequired] = useState(false)
  const [apiReady, setApiReady] = useState(false)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loginSchool, setLoginSchool] = useState('')
  const [schoolSearch, setSchoolSearch] = useState('')
  const [schoolPicker, setSchoolPicker] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordDialog, setPasswordDialog] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginNotice, setLoginNotice] = useState('')
  const [active, setActive] = useState('Resumen')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dashboardData, setDashboardData] = useState(null)
  const [dashboardDate, setDashboardDate] = useState(getLocalDate)
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [students, setStudents] = useState([])
  const [studentDialog, setStudentDialog] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
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
  const [attendanceError, setAttendanceError] = useState('')
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [attendanceSaving, setAttendanceSaving] = useState(false)
  const [gradeAssignments, setGradeAssignments] = useState([])
  const [gradeAssignmentKey, setGradeAssignmentKey] = useState('')
  const [gradePeriod, setGradePeriod] = useState('Periodo 1')
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
  const [portalAssignmentsLoading, setPortalAssignmentsLoading] = useState(false)
  const [portalAssignmentsError, setPortalAssignmentsError] = useState('')
  const [submissionBusyId, setSubmissionBusyId] = useState('')
  const [submissionDeletingId, setSubmissionDeletingId] = useState('')
  const [onlineExam, setOnlineExam] = useState(null)
  const [onlineExamAnswers, setOnlineExamAnswers] = useState({})
  const [onlineExamError, setOnlineExamError] = useState('')
  const [onlineExamBusy, setOnlineExamBusy] = useState(false)
  const [onlineDraftSaving, setOnlineDraftSaving] = useState(false)
  const [onlineDraftSaved, setOnlineDraftSaved] = useState(true)
  const onlineDraftQueue = useRef(Promise.resolve())
  const [reportCardOptions, setReportCardOptions] = useState({ students: [], years: [] })
  const [reportCardStudentId, setReportCardStudentId] = useState('')
  const [reportCardYear, setReportCardYear] = useState('')
  const [reportCardPeriod, setReportCardPeriod] = useState('Periodo 1')
  const [reportCardData, setReportCardData] = useState(null)
  const [reportCardLoading, setReportCardLoading] = useState(false)
  const [reportCardError, setReportCardError] = useState('')
  const [publicationSaving, setPublicationSaving] = useState(false)
  const selectedGradeAssignment = gradeAssignments.find(item => `${item.courseId}|${item.subject}` === gradeAssignmentKey)
  const portalReportRole = ['acudiente', 'estudiante'].includes(user?.role)
  const reportCardPeriods = portalReportRole
    ? [...new Set((reportCardOptions.publications || []).filter(item => item.academicYear === reportCardYear && item.isPublished).map(item => item.period))]
    : ['Periodo 1', 'Periodo 2', 'Periodo 3', 'Periodo 4']
  const selectedPublication = (reportCardOptions.publications || []).find(item => item.academicYear === reportCardYear && item.period === reportCardPeriod)
  const portalStudent = portalStudents.find(student => student.id === workStudentId)
  const portalCourseOptions = [...new Set(portalAssignments.map(item => `${item.courseName} · ${item.academicYear}`))]
  const filteredPortalAssignments = portalAssignments.filter(item => portalCourseFilter === 'Todos' || `${item.courseName} · ${item.academicYear}` === portalCourseFilter)
  const portalPendingCount = portalAssignments.filter(item => item.deliveryMode === 'online' ? item.onlineStatus !== 'submitted' : !item.submissionId).length
  const portalSubmittedCount = portalAssignments.filter(item => item.deliveryMode === 'online' ? item.onlineStatus === 'submitted' : Boolean(item.submissionId)).length
  const portalGradedCount = portalAssignments.filter(item => item.score !== null).length

  const selectedSchool = schools.find(school => school.slug === loginSchool)
  const matchingSchools = schools.filter(school => `${school.name} ${school.slug}`.toLocaleLowerCase('es').includes(schoolSearch.trim().toLocaleLowerCase('es')))
  const login = async (event) => {
    event.preventDefault()
    setLoginError('')
    if (!loginSchool) return setLoginError('Selecciona tu colegio para continuar.')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ school: loginSchool, email: form.get('email'), password: form.get('password') }) })
      const result = await response.json()
      if (!response.ok) return setLoginError(result.error || 'No pudimos iniciar sesión.')
      setUser(result.user)
      setLoginSchool(result.user.school.slug)
      setAuthenticated(true)
      setActive(['acudiente', 'estudiante'].includes(result.user.role) ? 'Mi aula' : 'Resumen')
      setLoginNotice('')
    } catch { setLoginError('No se pudo conectar con el servidor. Comprueba que esté en ejecución.') }
  }

  const changeOwnPassword = async event => {
    event.preventDefault(); setPasswordError('')
    const form = new FormData(event.currentTarget)
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
    let mounted = true
    Promise.all([fetch('/api/auth/me', { credentials: 'same-origin' }), fetch('/api/auth/setup-status'), fetch('/api/schools')]).then(async ([session, setup, schoolResponse]) => {
      const setupResult = await setup.json()
      const schoolResult = await schoolResponse.json()
      if (!mounted) return
      setApiReady(true)
      setSetupRequired(setupResult.setupRequired)
      setSchools((schoolResult.schools || []).map(school => ({ ...school, initials: school.name.slice(0, 1).toLocaleUpperCase('es'), color: 'school-lilac', city: `Código: ${school.slug}` })))
      if (session.ok) { const data = await session.json(); setUser(data.user); setAuthenticated(true); setActive(['acudiente', 'estudiante'].includes(data.user.role) ? 'Mi aula' : 'Resumen') }
    }).catch(() => { if (mounted) setApiReady(false) }).finally(() => { if (mounted) setLoadingAuth(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!authenticated || active !== 'Resumen' || user?.role !== 'admin') return
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
  const loadStudents = async () => {
    const params = new URLSearchParams({ search: query, status: statusFilter })
    const response = await fetch(`/api/students?${params}`, { credentials: 'same-origin' })
    const result = await response.json()
    if (response.ok) setStudents(result.students || [])
    else if (response.status === 401) { setAuthenticated(false); setUser(null) }
  }
  useEffect(() => { if (authenticated) loadStudents() }, [authenticated, query, statusFilter])
  const visibleStudents = students
  const loadUsers = async () => {
    const response = await fetch('/api/users', { credentials: 'same-origin' })
    const result = await response.json()
    if (response.ok) setSchoolUsers(result.users || [])
    else if (response.status === 401) { setAuthenticated(false); setUser(null) }
  }
  useEffect(() => { if (authenticated && active === 'Usuarios y accesos') loadUsers() }, [authenticated, active])
  useEffect(() => {
    if (!accountDialog) return
    fetch('/api/students?status=Activo', { credentials: 'same-origin' }).then(response => response.ok ? response.json() : { students: [] }).then(result => setLinkableStudents(result.students || [])).catch(() => setLinkableStudents([]))
  }, [accountDialog])
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
    if (!authenticated || active !== 'Matrículas' || !['admin', 'secretaria'].includes(user?.role)) return
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
    if (!authenticated || active !== 'Reportes' || !['admin', 'secretaria', 'docente'].includes(user?.role)) return
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
    if (!authenticated || active !== 'Asistencia' || !['admin', 'secretaria', 'docente'].includes(user?.role)) return
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
      if (alive) setAttendanceRows(result.students || [])
    }).catch(error => { if (alive) { setAttendanceRows([]); setAttendanceError(error.message || 'No se pudo conectar con el servidor.') } }).finally(() => { if (alive) setAttendanceLoading(false) })
    return () => { alive = false }
  }, [authenticated, active, attendanceCourseId, attendanceDate])
  const saveAttendance = async () => {
    const records = attendanceRows.filter(student => student.attendanceStatus).map(student => ({ studentId: student.id, status: student.attendanceStatus }))
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
    if (!authenticated || active !== 'Calificaciones' || !['admin', 'secretaria', 'docente'].includes(user?.role)) return
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
    setAssessmentSubmissions([]); setSubmissionsLoaded(false)
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
      const response = await fetch('/api/grades/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...form, courseId: selectedGradeAssignment.courseId, subject: selectedGradeAssignment.subject, period: gradePeriod, deliveryMode: assessmentMode, isPublished: assessmentMode === 'file' || assessmentPublished, externalFormUrl: String(form.externalFormUrl || '').trim(), questions, images, maxScore, weightPercent: Number(form.weightPercent) }) })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudo crear la evaluación.')
      setGradeAssessments(current => [result.assessment, ...current]); setGradeAssessmentId(result.assessment.id); setAssessmentDialog(false); notify('Evaluación creada.')
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
      setGradeAssessmentId(''); setGradeAssessment(null); setGradeRows([]); setAssessmentSubmissions([]); setSubmissionsLoaded(false)
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
      notify(`Se guardaron ${result.saved} calificación${result.saved === 1 ? '' : 'es'}.`)
    } catch { setGradeError('No se pudo conectar con el servidor.') }
    finally { setGradeSaving(false) }
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
    if (!authenticated || active !== 'Boletines' || !['admin', 'secretaria', 'docente', 'acudiente', 'estudiante'].includes(user?.role)) return
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
      setReportCardOptions({ students: result.students || [], years, publications })
      setReportCardStudentId(current => result.students?.some(item => item.id === current) ? current : result.students?.[0]?.id || '')
      setReportCardYear(nextYear)
      if (['acudiente', 'estudiante'].includes(user?.role)) setReportCardPeriod(current => availablePeriods.some(item => item.period === current) ? current : availablePeriods[0]?.period || 'Periodo 1')
    }).catch(error => { if (alive) setReportCardError(error.message || 'No se pudo conectar con el servidor.') })
    return () => { alive = false }
  }, [authenticated, active, user?.role])
  const loadReportCard = async () => {
    if (!reportCardStudentId || !reportCardYear) return setReportCardError('Selecciona estudiante y año lectivo.')
    setReportCardLoading(true); setReportCardError(''); setReportCardData(null)
    try {
      const params = new URLSearchParams({ studentId: reportCardStudentId, academicYear: reportCardYear, period: reportCardPeriod })
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
    const student = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch(editingStudent ? `/api/students/${editingStudent.id}` : '/api/students', { method: editingStudent ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(student) })
      const result = await response.json()
      if (!response.ok) return notify(result.error || 'No se pudo guardar el estudiante.')
      await loadStudents()
      setStudentDialog(false)
      setEditingStudent(null)
      notify(editingStudent ? 'Estudiante actualizado.' : 'Estudiante guardado en el colegio.')
    } catch { notify('No se pudo conectar con el servidor.') }
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
    const fields = ['name', 'document', 'grade', 'guardian', 'phone', 'status']
    const csv = [fields.join(','), ...visibleStudents.map(student => fields.map(field => `"${String(student[field] || '').replaceAll('"', '""')}"`).join(','))].join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
    link.download = 'estudiantes.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  if (loadingAuth) return <div className="auth-loading"><span className="brand-mark"><GraduationCap size={21}/></span><p>Conectando con el colegio…</p></div>
  if (!authenticated) return <div className="login-page"><div className="login-decoration decoration-one"/><div className="login-decoration decoration-two"/><div className="login-top"><a className="login-brand" href="#inicio"><span className="brand-mark"><GraduationCap size={21}/></span><span className="brand-name">educa<span>.</span></span></a><span className="login-top-note"><LockKeyhole size={14}/> Acceso para personal autorizado</span></div><main className="login-layout"><section className="login-intro"><div className="login-overline"><span className="live-dot"/> TU COLEGIO, EN UN SOLO LUGAR</div><h1>Todo empieza<br/>con una buena<br/><span>educación.</span></h1><p>Una plataforma sencilla para acompañar cada paso de la comunidad escolar.</p><div className="login-art" aria-hidden="true"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="art-book"><BookOpen size={56}/></div><span className="art-star star-a">✦</span><span className="art-star star-b">✳</span><span className="art-dot dot-a"/><span className="art-dot dot-b"/><div className="art-caption"><GraduationCap size={16}/> Aprender juntos</div></div></section><section className="login-card"><div className="login-card-heading"><div className="login-card-icon"><LockKeyhole size={19}/></div><h2>{setupRequired ? 'Configura tu colegio' : 'Inicia sesión'}</h2><p>{setupRequired ? 'Crea la institución y la cuenta administradora inicial.' : 'Selecciona tu institución e ingresa tus datos.'}</p></div>{setupRequired ? <SetupForm onComplete={async () => { const response = await fetch('/api/schools'); const result = await response.json(); setSchools((result.schools || []).map(school => ({ ...school, initials: school.name.slice(0, 1).toLocaleUpperCase('es'), color: 'school-lilac', city: `Código: ${school.slug}` }))); setSetupRequired(false); setLoginNotice('Colegio configurado. Ya puedes iniciar sesión.') }}/> : <form className="login-form" onSubmit={login}><label className="login-label">Tu institución</label><div className="school-picker-wrap"><button type="button" className={`school-picker ${schoolPicker ? 'picker-open' : ''}`} onClick={() => { setSchoolPicker(!schoolPicker); setLoginError('') }}>{selectedSchool ? <><span className={`school-option-avatar ${selectedSchool.color}`}>{selectedSchool.initials}</span><span className="school-option-copy"><strong>{selectedSchool.name}</strong><small>{selectedSchool.city}</small></span></> : <span className="school-placeholder">Selecciona tu colegio</span>}<ChevronDown size={17}/></button>{schoolPicker && <div className="school-dropdown"><label className="school-search"><Search size={15}/><input autoFocus value={schoolSearch} onChange={event => setSchoolSearch(event.target.value)} placeholder="Buscar institución"/></label><div className="school-options">{matchingSchools.map(school => <button type="button" key={school.id} onClick={() => { setLoginSchool(school.slug); setSchoolPicker(false); setSchoolSearch(''); setLoginError('') }}><span className={`school-option-avatar ${school.color}`}>{school.initials}</span><span className="school-option-copy"><strong>{school.name}</strong><small>{school.city}</small></span>{school.slug === loginSchool && <Check size={16}/>}</button>)}{matchingSchools.length === 0 && <p className="no-schools">No encontramos instituciones. Pide al administrador que configure el colegio.</p>}</div><div className="school-dropdown-footer">¿No aparece tu colegio? Solicita acceso al administrador.</div></div>}</div><label className="login-label" htmlFor="login-email">Correo electrónico</label><div className="login-input-wrap"><Users size={16}/><input id="login-email" name="email" type="email" placeholder="nombre@colegio.edu.co" autoComplete="username" required maxLength="254"/></div><div className="password-label-row"><label className="login-label" htmlFor="login-password">Contraseña</label><button type="button" className="forgot-link" onClick={() => setLoginNotice('La recuperación de contraseña requiere configurar el flujo de restablecimiento del backend.')}>¿Olvidaste tu contraseña?</button></div><div className="login-input-wrap"><LockKeyhole size={16}/><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Ingresa tu contraseña" autoComplete="current-password" required maxLength="128"/><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{loginError && <div className="login-message login-error" role="alert">{loginError}</div>}{loginNotice && <div className="login-message login-info" role="status">{loginNotice}</div>}<button type="submit" className="login-submit" disabled={!apiReady}>{apiReady ? 'Iniciar sesión' : 'Servidor no disponible'} <ArrowRight size={16}/></button>{!apiReady && <div className="login-message login-info">Inicia también la API local. Consulta README.md.</div>}</form>}<div className="login-divider"><span/> o <span/></div><p className="login-help">¿Necesitas una cuenta? <button onClick={() => setLoginNotice('Solicita una invitación al administrador de tu colegio.')}>Contacta al administrador</button></p><div className="login-security"><ShieldCheck size={15}/><span>Tu información se maneja de forma confidencial.</span></div></section></main><footer className="login-footer"><span>© 2025 Educa · Gestión escolar</span><span>Acceso exclusivo para personal autorizado</span></footer></div>

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><GraduationCap size={21} strokeWidth={2.3} /></span><span className="brand-name">educa<span>.</span></span><button className="close-menu icon-btn" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={19} /></button></div>
      <button className="school-switch" onClick={() => notify('El cambio de institución estará disponible próximamente.')}><div className="school-avatar">{selectedSchool?.initials || 'C'}</div><div className="school-copy"><strong>{selectedSchool?.name || 'Colegio Altamira'}</strong><span>Sede principal</span></div><ChevronDown size={16} className="muted-icon" /></button>
      <div className="side-scroll">
        {navGroups.map(group => <section className="nav-section" key={group.title}><div className="nav-heading">{group.title}</div>{group.items.filter(item => (item.label !== 'Matrículas' || ['admin', 'secretaria'].includes(user?.role)) && (item.label !== 'Usuarios y accesos' || user?.role === 'admin') && (item.label !== 'Cursos y docentes' || ['admin', 'secretaria'].includes(user?.role)) && (item.label !== 'Mis cursos' || user?.role === 'docente') && (item.label !== 'Estudiantes' || ['admin', 'secretaria'].includes(user?.role)) && (item.label !== 'Asistencia' || ['admin', 'secretaria', 'docente'].includes(user?.role)) && (item.label !== 'Calificaciones' || ['admin', 'secretaria', 'docente'].includes(user?.role)) && (item.label !== 'Reportes' || ['admin', 'secretaria', 'docente'].includes(user?.role)) && (item.label !== 'Boletines' || ['admin', 'secretaria', 'docente', 'acudiente', 'estudiante'].includes(user?.role)) && (item.label !== 'Mi aula' || ['acudiente', 'estudiante'].includes(user?.role))).map(item => <button key={item.label} className={`nav-item ${active === item.label ? 'selected' : ''}`} onClick={() => { setActive(item.label); setMenuOpen(false) }}><item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}</button>)}</section>)}
        <div className="sidebar-note"><span className="note-icon"><Sparkles size={16} /></span><div><strong>Todo en orden</strong><p>Tu institución está al día.</p></div><ArrowRight size={15} className="note-arrow" /></div>
      </div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => notify('La configuración estará disponible próximamente.')}><Settings2 size={18} /><span>Configuración</span></button><div className="user-card"><div className="user-avatar">{user?.name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es') || 'U'}</div><div className="user-copy"><strong>{user?.name || 'Usuario'}</strong><span>{user?.role === 'admin' ? 'Administrador' : user?.role || 'Personal'}</span></div><button className="icon-btn" title="Cambiar contraseña" aria-label="Cambiar contraseña" onClick={() => { setPasswordError(''); setPasswordDialog(true) }}><LockKeyhole size={16}/></button><button className="logout-button" title="Cerrar sesión" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); setAuthenticated(false); setUser(null); setStudents([]); setDashboardData(null) }}><MoreHorizontal size={19} className="muted-icon" /></button></div></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="icon-btn mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button><div className="breadcrumb">Institución <ChevronRight size={14} /><span>{active}</span></div></div><div className="top-actions"><label className="search-box"><Search size={17} /><input aria-label="Buscar" placeholder="Buscar estudiante, curso..." value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label><button className="icon-btn notification-btn" aria-label="Notificaciones" onClick={() => notify('No tienes notificaciones nuevas.')}><Bell size={19} /><i /></button><div className="top-divider" /><button className="profile-mini" onClick={() => { setPasswordError(''); setPasswordDialog(true) }} title="Cambiar contraseña"><span className="user-avatar small">{user?.name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es') || 'U'}</span><ChevronDown size={15} className="muted-icon" /></button></div></header>
      <div className="content-wrap">
        {active === 'Calificaciones' ? <section className="students-page grades-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN ACADÉMICA</div><h1>Calificaciones</h1><p className="welcome-sub">Organiza evaluaciones y registra resultados por estudiante.</p></div><div className="students-actions">{gradeAssessment && <button className="button button-soft danger-action" onClick={deleteAssessment} disabled={assessmentDeleting}>{assessmentDeleting ? 'Eliminando…' : <><Trash2 size={15}/> Eliminar evaluación</>}</button>}<button className="button button-primary" disabled={!selectedGradeAssignment} onClick={() => { setGradeError(''); setAssessmentMode('file'); setAssessmentPublished(true); setAssessmentQuestions([{ key: crypto.randomUUID(), prompt: '', options: ['', '', '', ''], correctOption: 0, points: '1' }]); setAssessmentDialog(true) }}><Plus size={17}/> Nueva evaluación</button></div></div><div className="students-toolbar grades-toolbar"><label className="student-filter">Curso y asignatura <select value={gradeAssignmentKey} onChange={event => { setGradeAssignmentKey(event.target.value); setGradeAssessmentId(''); setGradeAssessment(null); setGradeRows([]) }}><option value="">Selecciona una asignatura</option>{gradeAssignments.map(item => <option key={`${item.courseId}|${item.subject}`} value={`${item.courseId}|${item.subject}`}>{item.grade} · {item.courseName} · {item.subject}{user?.role !== 'docente' ? ` · ${item.teacherName}` : ''}</option>)}</select></label><label className="student-filter">Periodo <select value={gradePeriod} onChange={event => { setGradePeriod(event.target.value); setGradeAssessmentId('') }}>{['Periodo 1','Periodo 2','Periodo 3','Periodo 4'].map(period => <option key={period}>{period}</option>)}</select></label><label className="student-filter">Evaluación <select value={gradeAssessmentId} onChange={event => setGradeAssessmentId(event.target.value)} disabled={!gradeAssessments.length}><option value="">Selecciona evaluación</option>{gradeAssessments.map(item => <option key={item.id} value={item.id}>{item.title} · hasta {item.maxScore}{item.dueAt ? ` · vence ${item.dueAt}` : ''}</option>)}</select></label></div><div className="students-scope"><ShieldCheck size={14}/> Las notas se limitan al colegio y a las asignaturas asignadas. El puntaje máximo se define en cada evaluación; los promedios y boletines usan las reglas de ponderación y escala configuradas para el periodo.</div><div className="grade-rule-panel"><div className="grade-rule-copy"><strong>Escala institucional de este periodo</strong><span>{gradeRule ? 'Regla guardada para curso y asignatura seleccionados.' : 'Configura el rango y la nota mínima para aprobar.'}</span></div><form className="grade-rule-form" onSubmit={saveGradeRule}><label>Mínimo<input aria-label="Nota mínima institucional" type="number" min="0" max="100" step="any" required value={gradeRuleForm.scaleMin} onChange={event => setGradeRuleForm(form => ({ ...form, scaleMin: event.target.value }))}/></label><label>Máximo<input aria-label="Nota máxima institucional" type="number" min="0.01" max="100" step="any" required value={gradeRuleForm.scaleMax} onChange={event => setGradeRuleForm(form => ({ ...form, scaleMax: event.target.value }))}/></label><label>Aprobación<input aria-label="Nota mínima aprobatoria" type="number" min="0" max="100" step="any" required value={gradeRuleForm.passingScore} onChange={event => setGradeRuleForm(form => ({ ...form, passingScore: event.target.value }))}/></label><button className="button button-soft" type="submit" disabled={gradeRuleSaving || !selectedGradeAssignment}>{gradeRuleSaving ? 'Guardando…' : 'Guardar escala'}</button></form></div>{gradeError && <div className="login-message login-error" role="alert">{gradeError}</div>}{!gradeAssignments.length ? <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>No hay asignaturas asignadas</strong><p>Crea un curso, asigna una asignatura y vincula un docente para empezar.</p></div> : !gradeAssessmentId ? <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>{gradeAssessments.length ? 'Selecciona una evaluación' : 'Aún no hay evaluaciones en este periodo'}</strong><p>{gradeAssessments.length ? 'Elige una evaluación para consultar o registrar calificaciones.' : 'Crea una evaluación para la asignatura y el periodo seleccionados.'}</p>{!gradeAssessments.length && <button className="button button-primary" onClick={() => { setAssessmentMode('file'); setAssessmentPublished(true); setAssessmentQuestions([{ key: crypto.randomUUID(), prompt: '', options: ['', '', '', ''], correctOption: 0, points: '1' }]); setAssessmentDialog(true) }}><Plus size={16}/> Crear evaluación</button>}</div> : gradeLoading ? <div className="students-empty">Cargando calificaciones…</div> : <><div className="grade-assessment-summary"><div><span>Evaluación</span><strong>{gradeAssessment?.title}</strong></div><div><span>Curso y asignatura</span><strong>{gradeAssessment?.courseName} · {gradeAssessment?.subject}</strong></div><div><span>Periodo</span><strong>{gradeAssessment?.period}</strong></div><div><span>Puntaje máximo</span><strong>{gradeAssessment?.maxScore}</strong></div><div className="grade-weight-control"><label>Ponderación relativa (%)<input type="number" min="0.01" max="100" step="any" value={assessmentWeight} onChange={event => setAssessmentWeight(event.target.value)}/></label><button type="button" className="button button-soft" onClick={saveAssessmentWeight} disabled={assessmentWeightSaving}>{assessmentWeightSaving ? 'Guardando…' : 'Guardar'}</button></div>{gradeAssessment?.deliveryMode === 'online' && <button type="button" className={gradeAssessment.isPublished ? 'button button-soft' : 'button button-primary'} onClick={toggleAssessmentPublication} disabled={assessmentPublicationSaving}>{assessmentPublicationSaving ? 'Guardando…' : gradeAssessment.isPublished ? 'Retirar del portal' : 'Publicar para estudiantes'}</button>}<button className="button button-soft" onClick={loadAssessmentSubmissions} disabled={submissionsLoading}><ClipboardCheck size={15}/>{submissionsLoading ? 'Cargando…' : 'Ver entregas'}</button><button className="button button-primary" onClick={saveGrades} disabled={gradeSaving || !gradeRows.some(student => student.score !== null && student.score !== '')}><Check size={15}/>{gradeSaving ? 'Guardando…' : 'Guardar notas'}</button></div>{(gradeAssessment?.externalFormUrl || gradeAssessment?.images?.length > 0) && <div className="assessment-resources">{gradeAssessment.externalFormUrl && <a className="external-form-link" href={gradeAssessment.externalFormUrl} target="_blank" rel="noopener noreferrer">Abrir Google Forms <ArrowRight size={14}/></a>}{gradeAssessment.images?.map((image, index) => <a className="assessment-resource-thumb" key={image.id} href={`/api/assessment-images/${image.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/assessment-images/${image.id}`} alt={`Imagen ${index + 1} de ${gradeAssessment.title}`}/><span>{image.fileName}</span></a>)}</div>}{submissionsLoaded && <div className="student-table-wrap work-submissions-panel"><h2>Entregas de estudiantes <span>{assessmentSubmissions.filter(item => gradeAssessment?.deliveryMode === 'online' ? item.onlineSubmittedAt : item.submissionId).length} de {assessmentSubmissions.length} entregadas</span></h2><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>ESTADO</th><th>FECHA DE ENTREGA</th><th>VERSIONES</th><th>ARCHIVO / PUNTAJE</th></tr></thead><tbody>{assessmentSubmissions.map(item => <tr key={item.studentId}><td><strong>{item.studentName}</strong></td><td>{gradeAssessment?.deliveryMode === 'online' ? (item.onlineSubmittedAt ? 'Completada' : 'Sin iniciar') : item.submissionId ? 'Entregado' : 'Pendiente'}</td><td>{(gradeAssessment?.deliveryMode === 'online' ? item.onlineSubmittedAt : item.uploadedAt) ? new Date(gradeAssessment?.deliveryMode === 'online' ? item.onlineSubmittedAt : item.uploadedAt).toLocaleString('es-CO') : '—'}</td><td>{gradeAssessment?.deliveryMode === 'online' ? (item.onlineSubmittedAt ? '1 intento' : '—') : item.attempts}</td><td>{gradeAssessment?.deliveryMode === 'online' ? (item.onlineSubmittedAt ? `${item.onlineScore ?? 0} / ${gradeAssessment.maxScore}` : '—') : item.submissionId ? <div className="submission-file-actions"><button className="account-toggle" onClick={() => downloadWorkFile(item.submissionId,item.fileName)}><Download size={14}/>{item.fileName}</button><button type="button" className="account-toggle danger-action" onClick={() => deleteStudentSubmission(item)} disabled={submissionDeletingId === item.submissionId} aria-label={`Eliminar entrega de ${item.studentName}`} title="Eliminar entrega">{submissionDeletingId === item.submissionId ? '…' : <Trash2 size={14}/>}</button></div> : '—'}</td></tr>)}</tbody></table>{assessmentSubmissions.length === 0 && <p className="submission-empty">No hay estudiantes activos asociados al grado de este curso.</p>}</div>}<div className="student-table-wrap"><table className="student-table grade-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>NOTA / {gradeAssessment?.maxScore}</th><th>OBSERVACIÓN (OPCIONAL)</th></tr></thead><tbody>{gradeRows.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><input className="grade-score-input" type="number" min="0" max={gradeAssessment?.maxScore} step="any" value={student.score ?? ''} aria-label={`Nota de ${student.name}`} onChange={event => setGradeRows(rows => rows.map(row => row.id === student.id ? { ...row, score: event.target.value } : row))}/></td><td><input className="grade-comment-input" maxLength="500" value={student.comment || ''} placeholder="Opcional" aria-label={`Observación de ${student.name}`} onChange={event => setGradeRows(rows => rows.map(row => row.id === student.id ? { ...row, comment: event.target.value } : row))}/></td></tr>)}</tbody></table>{!gradeRows.length && <div className="students-empty">No hay estudiantes activos en el grado de este curso.</div>}</div></>}</section> : active === 'Asistencia' ? <section className="students-page attendance-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CONTROL ACADÉMICO</div><h1>Asistencia</h1><p className="welcome-sub">Registra la asistencia del grupo por fecha.</p></div><div className="students-actions"><button className="button button-primary" onClick={saveAttendance} disabled={attendanceSaving || !attendanceRows.some(student => student.attendanceStatus)}><Check size={16}/>{attendanceSaving ? 'Guardando…' : 'Guardar asistencia'}</button></div></div><div className="students-toolbar attendance-toolbar"><label className="student-filter">Curso <select value={attendanceCourseId} onChange={event => setAttendanceCourseId(event.target.value)}><option value="">Selecciona un curso</option>{attendanceCourses.map(course => <option key={course.id} value={course.id}>{course.grade} · {course.name} · {course.academicYear}</option>)}</select></label><label className="student-filter">Fecha <input type="date" value={attendanceDate} onChange={event => setAttendanceDate(event.target.value)}/></label><div className="student-count"><strong>{attendanceRows.filter(student => student.attendanceStatus).length}</strong> de {attendanceRows.length} marcados</div></div><div className="students-scope"><ShieldCheck size={14}/> Solo puedes registrar asistencia en cursos de tu colegio y, si eres docente, en cursos asignados a tu cuenta. Puedes guardar el grupo por partes; cada estudiante solo tiene un registro por curso y fecha.</div>{attendanceError && <div className="login-message login-error" role="alert">{attendanceError}</div>}{attendanceLoading ? <div className="students-empty">Cargando lista del grupo…</div> : attendanceRows.length ? <div className="student-table-wrap"><table className="student-table attendance-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>ESTADO DE ASISTENCIA</th><th>REGISTRO</th></tr></thead><tbody>{attendanceRows.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><select aria-label={`Asistencia de ${student.name}`} className={`attendance-status-select ${student.attendanceStatus ? `attendance-${student.attendanceStatus.toLowerCase()}` : ''}`} value={student.attendanceStatus || ''} onChange={event => setAttendanceRows(rows => rows.map(row => row.id === student.id ? { ...row, attendanceStatus: event.target.value || null } : row))}><option value="">Sin registrar</option><option value="Presente">Presente</option><option value="Ausente">Ausente</option><option value="Tarde">Tarde</option><option value="Justificado">Justificado</option></select></td><td>{student.markedAt ? `Guardado · ${new Date(student.markedAt).toLocaleString('es-CO')}` : 'Pendiente'}</td></tr>)}</tbody></table></div> : <div className="students-empty"><span className="empty-icon"><ClipboardCheck size={22}/></span><strong>{attendanceCourseId ? 'No hay estudiantes activos en este grupo' : 'Selecciona un curso'}</strong><p>{attendanceCourseId ? 'Verifica que los estudiantes activos tengan el mismo grado o grupo configurado en este curso.' : attendanceCourses.length ? 'Elige un curso y una fecha para consultar la lista.' : 'Todavía no hay cursos disponibles o asignados para tomar asistencia.'}</p></div>}</section> : active === 'Cursos y docentes' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ORGANIZACIÓN ACADÉMICA</div><h1>Cursos y docentes</h1><p className="welcome-sub">Crea cursos, actualiza sus datos y administra sus asignaciones docentes.</p></div><div className="students-actions"><button className="button button-primary" onClick={() => { setCourseError(''); setEditingCourse(null); setCourseDialog(true) }}><Plus size={17}/> Crear curso</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Los cursos dados de baja se ocultan de asistencia y calificaciones; su historial se conserva y puedes reactivarlos.</div><div className="course-grid">{courses.map(course => <article className={`course-card ${course.isActive ? '' : 'course-archived'}`} key={course.id}><div className="course-card-top"><span className="stat-icon violet"><BookOpen size={17}/></span><span className="course-badges"><span className="role-chip">{course.academicYear}</span><span className={`course-state-chip ${course.isActive ? 'course-state-active' : 'course-state-archived'}`}>{course.isActive ? 'Activo' : 'Archivado'}</span></span></div><h2>{course.name}</h2><p>{course.grade}</p><div className="course-teacher-list">{course.teachers.map(teacher => <div className="course-assignment-row" key={`${teacher.id}-${teacher.subject}`}><span><strong>{teacher.name}</strong><small>{teacher.subject}</small></span>{Boolean(course.isActive) && <span className="course-assignment-actions"><button className="account-toggle" title="Editar asignación" aria-label={`Editar ${teacher.subject} de ${teacher.name}`} onClick={() => { setCourseError(''); setIsCustomSubject(!commonSubjects.includes(teacher.subject)); setEditingAssignment(teacher); setAssignmentCourse(course) }}><Pencil size={14}/> Editar</button><button className="account-toggle delete-student-action" title="Quitar docente" aria-label={`Quitar ${teacher.name} de ${teacher.subject}`} onClick={() => deleteTeacherAssignment(course, teacher)}><Trash2 size={14}/> Quitar</button></span>}</div>)}{!course.teachers.length && <span>Aún no hay docentes asignados.</span>}</div><div className="course-card-actions"><button className="account-toggle" onClick={() => openCourseHistory(course)}><Clock3 size={14}/> Historial</button><button className="account-toggle" onClick={() => { setCourseError(''); setEditingCourse(course); setCourseDialog(true) }}><Pencil size={14}/> Editar curso</button>{course.isActive ? <button className="account-toggle delete-student-action" onClick={() => archiveCourse(course)}><Trash2 size={14}/> Dar de baja</button> : <button className="account-toggle course-reactivate" onClick={() => setCourseActive(course, true)}><Check size={14}/> Reactivar</button>}</div>{Boolean(course.isActive) && <button className="button button-soft" onClick={() => { setCourseError(''); setIsCustomSubject(false); setEditingAssignment(null); setAssignmentCourse(course) }}><Plus size={15}/> Asignar docente</button>}</article>)}{!courses.length && <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>Aún no hay cursos</strong><p>Crea el primer grupo para organizar las asignaturas y asignaciones docentes.</p></div>}</div></section> : active === 'Usuarios y accesos' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ADMINISTRACIÓN DEL COLEGIO</div><h1>Usuarios y accesos</h1><p className="welcome-sub">Crea cuentas por rol y controla quién puede iniciar sesión en este colegio.</p></div><div className="students-actions"><button className="button button-primary" onClick={() => { setAccountError(''); setEditingAccount(null); setNewAccountRole('docente'); setAccountDialog(true) }}><Plus size={17}/> Crear cuenta</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Solo administradores pueden gestionar cuentas. Cada persona inicia sesión con el nombre del colegio, su correo y contraseña.</div><div className="students-toolbar"><div className="student-count"><strong>{schoolUsers.length}</strong> {schoolUsers.length === 1 ? 'cuenta del colegio' : 'cuentas del colegio'}</div></div><div className="student-table-wrap"><table className="student-table user-table"><thead><tr><th>PERSONA</th><th>CORREO</th><th>ROL</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{schoolUsers.map(account => <tr key={account.id}><td><span className="student-initials">{account.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{account.name}</strong></td><td>{account.email}</td><td><span className="role-chip">{roleName(account.role)}</span></td><td><span className={`student-status ${Boolean(account.active) ? 'status-active' : 'status-inactive'}`}>{Boolean(account.active) ? 'Activa' : 'Desactivada'}</span></td><td><div className="table-row-actions"><button className="account-toggle" onClick={() => { setAccountError(''); setEditingAccount(account); setNewAccountRole(account.role); setAccountDialog(true) }}><Pencil size={14}/> Editar</button><button className="account-toggle" disabled={account.id === user?.id} onClick={() => setAccountActive(account)}>{Boolean(account.active) ? 'Desactivar' : 'Activar'}</button><button className="account-toggle delete-student-action" disabled={account.id === user?.id} onClick={() => deleteAccount(account)}><Trash2 size={14}/> Eliminar</button></div></td></tr>)}</tbody></table>{schoolUsers.length === 0 && <div className="students-empty"><span className="empty-icon"><Users size={22}/></span><strong>No se pudieron cargar las cuentas</strong><p>Vuelve a entrar en esta sección o revisa la conexión con el servidor.</p></div>}</div><p className="users-footnote">Puedes editar datos, rol y vínculos; al eliminar una cuenta se revoca el acceso y se conserva la auditoría. La recuperación automática de contraseñas aún no está disponible.</p></section> : active === 'Mi aula' && ['acudiente','estudiante'].includes(user?.role) ? <section className="students-page portal-work-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ESPACIO DE APRENDIZAJE</div><h1>Mi aula</h1><p className="welcome-sub">Tus cursos, actividades, fechas de entrega y trabajos enviados.</p></div></div>{portalStudent && <div className="portal-student-summary"><span>ESTUDIANTE</span><strong>{portalStudent.name}</strong><small>{portalStudent.grade}</small></div>}{portalStudents.length > 1 && <label className="student-filter work-student-picker">Estudiante<select value={workStudentId} onChange={event => { setWorkStudentId(event.target.value); setPortalCourseFilter('Todos') }}>{portalStudents.map(student => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label>}{portalAssignmentsError && <div className="login-message login-error" role="alert">{portalAssignmentsError}</div>}{!portalAssignmentsLoading && portalAssignments.length > 0 && <><div className="portal-work-stats"><article><span>Actividades</span><strong>{portalAssignments.length}</strong></article><article><span>Pendientes</span><strong>{portalPendingCount}</strong></article><article><span>Entregadas</span><strong>{portalSubmittedCount}</strong></article><article><span>Calificadas</span><strong>{portalGradedCount}</strong></article></div><label className="student-filter portal-course-filter">Curso<select value={portalCourseFilter} onChange={event => setPortalCourseFilter(event.target.value)}><option>Todos</option>{portalCourseOptions.map(course => <option key={course}>{course}</option>)}</select></label></>}{portalAssignmentsLoading ? <div className="students-empty">Cargando trabajos...</div> : <div className="assignment-list">{filteredPortalAssignments.map(item => <article className="assignment-card" key={item.id}><div className="assignment-heading"><div><span className="assignment-subject">{item.subject} · {item.period}</span><h2>{item.title}</h2><p>{item.courseName} · {item.academicYear}</p></div><span className={item.dueAt && item.dueAt < getLocalDate() ? 'assignment-due assignment-late' : 'assignment-due'}>{item.dueAt ? `Entrega: ${item.dueAt}` : 'Sin fecha límite'}</span></div>{item.instructions && <p className="assignment-instructions">{item.instructions}</p>}{item.externalFormUrl && <a className="external-form-link" href={item.externalFormUrl} target="_blank" rel="noopener noreferrer">Abrir evaluación en Google Forms <ArrowRight size={14}/></a>}{item.images?.length > 0 && <div className="assessment-image-grid">{item.images.map((image, index) => <a key={image.id} href={`/api/assessment-images/${image.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/assessment-images/${image.id}`} loading="lazy" alt={`Imagen ${index + 1} de ${item.title}`}/><span>{image.fileName}</span></a>)}</div>}<div className="assignment-grade-line"><span>Calificación: <strong>{item.score === null ? 'Pendiente' : `${item.score} / ${item.maxScore}`}</strong></span>{item.comment && <span>Observación: {item.comment}</span>}</div><div className="assignment-submission-line">{item.deliveryMode === 'online' ? <><span className={item.onlineStatus === 'submitted' ? 'student-status status-active' : 'student-status status-inactive'}>{item.onlineStatus === 'submitted' ? 'Evaluación completada' : item.onlineStatus === 'started' ? 'Evaluación iniciada' : 'Pendiente'}</span>{item.onlineStatus === 'submitted' ? <span>Intento enviado · calificación: {item.score === null ? 'Pendiente de actualización' : item.score + ' / ' + item.maxScore}</span> : user?.role === 'estudiante' ? <button type="button" className="button button-primary" onClick={() => startOnlineExam(item)} disabled={onlineExamBusy}>{onlineExamBusy ? 'Abriendo…' : item.onlineStatus === 'started' ? 'Continuar evaluación' : 'Iniciar evaluación'}</button> : <span>El estudiante debe iniciar sesión con su propia cuenta para responder.</span>}</> : item.submissionId ? <><span className="student-status status-active">Entregado · versión {item.submissionNo}</span><span>{item.fileName} · {item.uploadedAt ? new Date(item.uploadedAt).toLocaleString('es-CO') : ''}</span><button className="account-toggle" onClick={() => downloadWorkFile(item.submissionId,item.fileName)}><Download size={14}/> Descargar</button></> : <span className="student-status status-inactive">Sin entregar</span>}</div>{item.deliveryMode !== 'online' && <form className="assignment-upload" onSubmit={event => uploadStudentWork(event,item)}><label>Subir o reemplazar trabajo<input name="workFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" required/></label><span className="field-hint">PDF, imagen, Word o Excel · máximo 8 MB. Se conservan hasta 10 versiones.</span><button type="submit" className="button button-primary" disabled={submissionBusyId === item.id}>{submissionBusyId === item.id ? 'Subiendo...' : <><Download size={15}/> Entregar trabajo</>}</button></form>}</article>)}{!filteredPortalAssignments.length && !portalAssignmentsLoading && <div className="students-empty"><span className="empty-icon"><ClipboardCheck size={22}/></span><strong>{portalAssignments.length ? 'No hay actividades para el curso elegido' : 'No hay trabajos activos para este estudiante'}</strong><p>{portalAssignments.length ? 'Elige otro curso para consultar sus actividades.' : 'Las actividades de sus cursos aparecerán aquí cuando un docente las cree.'}</p></div>}</div>}</section> : active === 'Boletines' && ['admin','secretaria','docente','acudiente','estudiante'].includes(user?.role) ? <section className="students-page report-card-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> INFORME ACADÉMICO</div><h1>Boletines</h1><p className="welcome-sub">Consulta notas y observaciones por estudiante, año lectivo y periodo.</p></div></div><div className="students-scope"><ShieldCheck size={14}/> El boletín solo incluye las asignaturas visibles para tu rol. Los promedios se expresan como porcentaje normalizado y no reemplazan la escala oficial del colegio.</div>{['admin','secretaria'].includes(user?.role) && <div className="publication-panel"><div><strong>Publicación del periodo</strong><span>{selectedPublication?.isPublished ? 'Publicado para acudientes y estudiantes.' : 'Todavía no aparece en el portal de estudiantes.'}</span></div><span className={selectedPublication?.isPublished ? 'publication-status publication-live' : 'publication-status'}>{selectedPublication?.isPublished ? 'Publicado' : 'Borrador'}</span><button className={selectedPublication?.isPublished ? 'button button-soft' : 'button button-primary'} onClick={toggleGradePublication} disabled={publicationSaving || !reportCardYear}>{publicationSaving ? 'Guardando…' : selectedPublication?.isPublished ? 'Retirar del portal' : 'Publicar en el portal'}</button></div>}<div className="report-filters report-card-filters"><label className="student-filter">Estudiante<select value={reportCardStudentId} onChange={event => { setReportCardStudentId(event.target.value); setReportCardData(null) }}><option value="">Selecciona estudiante</option>{reportCardOptions.students.map(student => <option key={student.id} value={student.id}>{student.name} · {student.grade}</option>)}</select></label><label className="student-filter">Año lectivo<select value={reportCardYear} onChange={event => { const year = event.target.value; setReportCardYear(year); setReportCardData(null); if (portalReportRole) setReportCardPeriod(reportCardOptions.publications?.find(item => item.academicYear === year && item.isPublished)?.period || '') }}><option value="">Selecciona año</option>{reportCardOptions.years.map(year => <option key={year}>{year}</option>)}</select></label><label className="student-filter">Periodo<select value={reportCardPeriod} onChange={event => { setReportCardPeriod(event.target.value); setReportCardData(null) }}><option value="">Selecciona periodo</option>{reportCardPeriods.map(period => <option key={period}>{period}</option>)}</select></label><button className="button button-primary" onClick={loadReportCard} disabled={reportCardLoading || !reportCardStudentId || !reportCardYear}>{reportCardLoading ? 'Generando...' : <><Search size={15}/> Consultar boletín</>}</button>{reportCardData && <button className="button button-soft" onClick={() => window.print()}><Download size={15}/> Imprimir / guardar PDF</button>}</div>{reportCardError && <div className="login-message login-error" role="alert">{reportCardError}</div>}{portalReportRole && !(reportCardOptions.publications || []).some(item => item.isPublished) && <div className="login-message login-info">El colegio todavía no ha publicado boletines para el portal.</div>}{reportCardData ? <article className="report-card-document"><div className="report-card-header"><div className="brand-mark"><GraduationCap size={21}/></div><div><span>INFORME ACADÉMICO</span><h2>{user?.school?.name}</h2></div><div className="report-card-period"><strong>{reportCardData.period}</strong><span>Año lectivo {reportCardData.academicYear}</span><span className={reportCardData.isPublished ? 'publication-live' : 'report-preview-label'}>{reportCardData.isPublished ? 'Publicado en portal' : 'Vista administrativa'}</span></div></div><div className="report-card-student"><div><span>ESTUDIANTE</span><strong>{reportCardData.student.name}</strong></div><div><span>GRADO</span><strong>{reportCardData.student.grade}</strong></div><div><span>GENERADO</span><strong>{new Date(reportCardData.generatedAt).toLocaleDateString('es-CO')}</strong></div></div>{reportCardData.subjects.length ? reportCardData.subjects.map(subject => <section className="report-subject" key={subject.subject}><div className="report-subject-heading"><div><h3>{subject.subject}</h3><span>{subject.teacherName || 'Asignatura'}</span></div>{subject.institutionalScore !== null ? <><strong>{subject.institutionalScore} / {subject.scaleMax}</strong><span className={subject.result === 'Aprobado' ? 'report-approved' : 'report-followup'}>{subject.result} · mínimo {subject.passingScore}</span><small>{subject.averagePercent}% normalizado</small></> : <strong>{subject.averagePercent === null ? 'Sin notas' : subject.averagePercent + '%'}</strong>}</div><table className="report-mark-table"><thead><tr><th>Evaluación</th><th>Nota</th><th>Ponderación</th><th>Observación</th></tr></thead><tbody>{subject.assessments.map((assessment,index) => <tr key={`${assessment.title}-${index}`}><td>{assessment.title}</td><td>{assessment.score === null ? 'Pendiente' : `${assessment.score} / ${assessment.maxScore}`}</td><td>{assessment.weightPercent}%</td><td>{assessment.comment || '—'}</td></tr>)}</tbody></table></section>) : <div className="students-empty"><strong>No hay evaluaciones registradas para este periodo</strong><p>El boletín aparecera cuando los docentes creen actividades para el estudiante.</p></div>}<div className="report-card-disclaimer">Promedio por asignatura: promedio de notas normalizadas al porcentaje del puntaje máximo de cada evaluacion. No se aplicaron ponderaciones ni reglas institucionales.</div></article> : !reportCardLoading && <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>Selecciona estudiante y periodo</strong><p>Elige los filtros para consultar el boletín. Puedes imprimirlo o guardarlo como PDF desde el navegador.</p></div>}</section> : active === 'Reportes' ? <section className="students-page reports-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CONSULTA DE DATOS</div><h1>Reportes</h1><p className="welcome-sub">Genera informes desde los registros reales de tu colegio.</p></div></div><div className="students-scope"><ShieldCheck size={14}/> El acceso a cada reporte depende de tu rol. Los docentes solo consultan cursos y asignaturas que tienen asignados.</div><div className="report-filters"><label className="student-filter">Tipo de reporte<select value={reportType} onChange={event => { setReportType(event.target.value); setReportRows([]); setReportError('') }}><option value="students">Estudiantes</option><option value="attendance">Asistencia</option><option value="grades">Calificaciones</option>{['admin','secretaria'].includes(user?.role) && <option value="enrollments">Matrículas</option>}</select></label><label className="student-filter">Año lectivo<select value={reportAcademicYear} onChange={event => setReportAcademicYear(event.target.value)}><option value="">Todos</option>{[...new Set(reportCourses.map(course => course.academicYear))].map(year => <option key={year}>{year}</option>)}</select></label><label className="student-filter">Curso<select value={reportCourseId} onChange={event => setReportCourseId(event.target.value)}><option value="">Todos</option>{reportCourses.filter(course => !reportAcademicYear || course.academicYear === reportAcademicYear).map(course => <option key={course.id} value={course.id}>{course.grade} · {course.name} · {course.academicYear}</option>)}</select></label>{reportType !== 'students' && <><label className="student-filter">Desde<input type="date" value={reportFrom} max={reportTo} onChange={event => setReportFrom(event.target.value)}/></label><label className="student-filter">Hasta<input type="date" value={reportTo} min={reportFrom} onChange={event => setReportTo(event.target.value)}/></label></>}<div className="report-actions"><button className="button button-soft" onClick={exportReport} disabled={!reportRows.length}><Download size={15}/> Exportar CSV</button><button className="button button-primary" onClick={generateReport} disabled={reportLoading}>{reportLoading ? 'Generando…' : <><Search size={15}/> Generar reporte</>}</button></div></div>{reportError && <div className="login-message login-error" role="alert">{reportError}</div>}{reportTruncated && <div className="login-message login-info" role="status">El resultado supera 5.000 filas. Se muestran y exportan las primeras 5.000; reduce los filtros para obtener un informe completo.</div>}{reportRows.length > 0 ? <><div className="report-result-summary"><strong>{reportRows.length}</strong> registros{reportRows.length > 100 && <span> · vista previa de los primeros 100</span>}</div><div className="student-table-wrap"><table className="student-table report-table"><thead><tr>{Object.keys(reportRows[0]).map(column => <th key={column}>{column.toLocaleUpperCase('es')}</th>)}</tr></thead><tbody>{reportRows.slice(0,100).map((row,index) => <tr key={index}>{Object.entries(row).map(([key,value]) => <td key={key}>{String(value ?? '—')}</td>)}</tr>)}</tbody></table></div></> : <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>{reportLoading ? 'Consultando registros…' : 'Configura los filtros y genera el reporte'}</strong><p>Los resultados se consultan únicamente cuando presionas «Generar reporte».</p></div>}</section> : active === 'Comunicaciones' ? <section className="students-page communications-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> COMUNICACIÓN DEL COLEGIO</div><h1>Comunicaciones</h1><p className="welcome-sub">Consulta los avisos que recibiste y envía comunicados internos según tus permisos.</p></div>{['admin','rectoria','coordinacion','secretaria','docente','orientacion'].includes(user?.role) && <div className="students-actions"><button className="button button-primary" onClick={() => { setCommunicationError(''); setCommunicationAudience(user?.role === 'docente' ? 'course' : 'school'); setCommunicationDialog(true) }}><Plus size={17}/> Nuevo aviso</button></div>}</div><div className="students-scope"><ShieldCheck size={14}/> Los avisos se entregan dentro de la plataforma. No se envían correos ni mensajes externos en esta etapa.</div>{communicationError && <div className="login-message login-error" role="alert">{communicationError}</div>}<div className="communication-list">{communications.map(item => <article className="communication-card" key={item.id}><div className="communication-card-heading"><span className="communication-icon"><Bell size={17}/></span><div className="communication-title"><h2>{item.title}</h2><p>{item.audience === 'school' ? 'Todo el colegio' : item.courseName || 'Curso'} · {item.authorName} · {item.createdAt ? new Date(item.createdAt).toLocaleString('es-CO') : ''}</p></div>{item.isAuthor ? <span className="communication-read-count">{item.readCount}/{item.recipientCount} leídos</span> : item.readAt ? <span className="communication-read">Leído</span> : <span className="communication-unread">Nuevo</span>}</div><p className="communication-body">{item.body}</p>{(item.isAuthor || user?.role === 'admin') && <div className="communication-actions"><button className="account-toggle danger-action" onClick={() => deleteCommunication(item)} disabled={communicationDeletingId === item.id}>{communicationDeletingId === item.id ? 'Eliminando…' : <><Trash2 size={14}/> Eliminar aviso</>}</button></div>}{!item.isAuthor && !item.readAt && <div className="communication-actions"><button className="account-toggle" onClick={() => markCommunicationRead(item)}><Check size={14}/> Marcar como leído</button></div>}</article>)}{communications.length === 0 && <div className="students-empty"><span className="empty-icon"><Bell size={22}/></span><strong>No tienes comunicaciones todavía</strong><p>Los avisos dirigidos a tu cuenta aparecerán aquí.</p></div>}</div>{communicationDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !communicationBusy) setCommunicationDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="communication-dialog-title"><div className="dialog-heading"><div><h2 id="communication-dialog-title">Nuevo aviso</h2><p>Se guardará en el historial de comunicaciones del colegio.</p></div><button className="icon-btn" onClick={() => setCommunicationDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createCommunication}><label>Destinatarios<select name="audience" value={communicationAudience} onChange={event => setCommunicationAudience(event.target.value)}>{user?.role !== 'docente' && <option value="school">Todo el colegio</option>}<option value="course">Un curso</option></select></label>{communicationAudience === 'course' && <label>Curso<select name="courseId" required defaultValue=""><option value="" disabled>Selecciona el curso</option>{communicationCourses.map(course => <option key={course.id} value={course.id}>{course.grade} · {course.name} · {course.academicYear}</option>)}</select>{communicationCourses.length === 0 && <span className="field-hint">No tienes cursos activos asignados para enviar avisos.</span>}</label>}<label>Asunto<input name="title" required minLength="3" maxLength="160" placeholder="Escribe un asunto claro"/></label><label>Mensaje<textarea name="body" required minLength="3" maxLength="5000" rows="6" placeholder="Escribe la información que necesitan conocer…"/></label>{communicationError && <div className="login-message login-error" role="alert">{communicationError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setCommunicationDialog(false)} disabled={communicationBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={communicationBusy || (communicationAudience === 'course' && !communicationCourses.length)}>{communicationBusy ? 'Enviando…' : <><Bell size={15}/> Enviar aviso</>}</button></div></form></section></div>}</section> : active === 'Matrículas' ? <section className="students-page enrollment-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> PROCESO DE ADMISIÓN</div><h1>Matrículas</h1><p className="welcome-sub">Gestiona solicitudes y consulta el historial de traslados por año lectivo.</p></div><div className="students-actions"><button className="button button-primary" disabled={enrollmentTab !== 'requests'} onClick={() => { setEnrollmentError(''); setEnrollmentDialog(true) }}><Plus size={17}/> Nueva solicitud</button></div></div><div className="enrollment-tabs"><button className={enrollmentTab === 'requests' ? 'history-tab-selected' : ''} onClick={() => setEnrollmentTab('requests')}><ClipboardCheck size={15}/> Solicitudes</button><button className={enrollmentTab === 'history' ? 'history-tab-selected' : ''} onClick={() => setEnrollmentTab('history')}><Clock3 size={15}/> Historial y traslados</button></div>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}{enrollmentTab === 'requests' ? <><div className="students-toolbar enrollment-toolbar"><label className="student-filter">Buscar <input value={enrollmentSearch} onChange={event => setEnrollmentSearch(event.target.value)} placeholder="Nombre o documento"/></label><label className="student-filter">Estado <select value={enrollmentStatusFilter} onChange={event => setEnrollmentStatusFilter(event.target.value)}>{['Todos','Solicitada','En revisión','Pendiente documentos','Aprobada','Rechazada'].map(status => <option key={status}>{status}</option>)}</select></label><div className="student-count"><strong>{enrollmentRequests.length}</strong> solicitudes</div></div><div className="student-table-wrap"><table className="student-table enrollment-table"><thead><tr><th>ESTUDIANTE</th><th>DOCUMENTO / GRADO</th><th>ACUDIENTE</th><th>AÑO LECTIVO</th><th>DOCUMENTOS PENDIENTES</th><th>ESTADO</th></tr></thead><tbody>{enrollmentRequests.map(request => <tr key={request.id}><td><strong>{request.studentName}</strong><small className="history-secondary">{request.createdAt ? new Date(request.createdAt).toLocaleDateString('es-CO') : ''}</small></td><td>{request.document}<small className="history-secondary">{request.gradeRequested}</small></td><td>{request.guardianName}<small className="history-secondary">{request.guardianPhone || 'Sin teléfono'}</small></td><td>{request.academicYear}</td><td>{request.pendingDocuments ? request.pendingDocuments.split('\n').join(', ') : 'Ninguno'}</td><td><select className={`enrollment-status-select enrollment-status-${request.status.toLowerCase().replaceAll(' ','-')}`} aria-label={`Estado de matrícula de ${request.studentName}`} value={request.status} disabled={request.status === 'Aprobada'} onChange={event => updateEnrollmentRequest(request,event.target.value)}>{['Solicitada','En revisión','Pendiente documentos','Aprobada','Rechazada'].map(status => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table>{!enrollmentRequests.length && <div className="students-empty"><span className="empty-icon"><ClipboardCheck size={22}/></span><strong>No hay solicitudes de matrícula</strong><p>Registra una solicitud nueva o ajusta los filtros.</p></div>}</div></> : <div className="student-table-wrap"><table className="student-table enrollment-table"><thead><tr><th>ESTUDIANTE</th><th>AÑO LECTIVO</th><th>CURSO</th><th>FECHAS</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{enrollmentHistory.map(record => <tr key={record.id}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.document} · {record.grade}</small></td><td>{record.academicYear}</td><td>{record.courseName || 'Curso sin asignar'}</td><td>{record.startDate}{record.endDate ? ` → ${record.endDate}` : ''}</td><td><span className={`student-status ${record.status === 'Activa' ? 'status-active' : 'status-inactive'}`}>{record.status}</span></td><td>{record.status === 'Activa' && <button className="account-toggle" onClick={() => openTransferDialog(record)}><ArrowRight size={14}/> Trasladar</button>}</td></tr>)}</tbody></table>{!enrollmentHistory.length && <div className="students-empty"><span className="empty-icon"><Clock3 size={22}/></span><strong>Aún no hay matrículas aprobadas</strong><p>Al aprobar una solicitud se registrará aquí el historial por curso y año.</p></div>}</div>}</section> : active === 'Estudiantes' ? <section className="students-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN ACADÉMICA</div><h1>Estudiantes</h1><p className="welcome-sub">Consulta y administra los registros de estudiantes.</p></div><div className="students-actions"><button className="button button-soft" onClick={exportStudents}><Download size={16}/> Exportar CSV</button><button className="button button-primary" onClick={() => { setEditingStudent(null); setStudentDialog(true) }}><Plus size={17}/> Nuevo estudiante</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Los registros se guardan en la base del colegio y solo el personal autorizado debe acceder.</div><div className="students-toolbar"><div className="student-count"><strong>{students.length}</strong> {students.length === 1 ? 'estudiante registrado' : 'estudiantes registrados'}</div><label className="student-filter">Estado <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>Todos</option><option>Activo</option><option>Retirado</option></select></label></div><div className="student-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>DOCUMENTO</th><th>GRADO / CURSO</th><th>ACUDIENTE</th><th>TELÉFONO</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{visibleStudents.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.document}</td><td>{student.grade}</td><td>{student.guardian}</td><td>{student.phone || '—'}</td><td><span className={`student-status ${student.status === 'Activo' ? 'status-active' : 'status-inactive'}`}>{student.status}</span></td><td><div className="table-row-actions"><button className="account-toggle" onClick={() => { setEditingStudent(student); setStudentDialog(true) }}><Pencil size={14}/> Editar</button>{user?.role === 'admin' && <button className="account-toggle delete-student-action" onClick={() => deleteStudent(student)}><Trash2 size={14}/> Eliminar</button>}</div></td></tr>)}</tbody></table>{visibleStudents.length === 0 && <div className="students-empty"><span className="empty-icon"><Users size={22}/></span><strong>{students.length ? 'No hay resultados' : 'Aún no hay estudiantes'}</strong><p>{students.length ? 'Prueba con otra búsqueda o cambia el filtro de estado.' : 'Registra un estudiante para empezar a organizar los datos.'}</p>{!students.length && <button className="button button-primary" onClick={() => setStudentDialog(true)}><Plus size={16}/> Crear primer registro</button>}</div>}</div></section> : active === 'Mis cursos' && user?.role === 'docente' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ESPACIO DOCENTE</div><h1>Mis cursos</h1><p className="welcome-sub">Consulta los grupos y estudiantes asignados a tu cuenta.</p></div></div><div className="teacher-course-grid">{teacherCourses.map(course => <article className="course-card teacher-course-card" key={`${course.id}-${course.subject}`}><div className="course-card-top"><span className="stat-icon violet"><BookOpen size={17}/></span><span className="role-chip">{course.academicYear}</span></div><h2>{course.name}</h2><p>{course.grade} · {course.subject}</p><div className="course-roster-count"><Users size={16}/> {course.studentCount} estudiantes activos</div><button className="button button-primary" onClick={() => loadTeacherRoster(course)}>Ver lista de estudiantes</button></article>)}{!teacherCourses.length && <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>No tienes cursos asignados</strong><p>Solicita al administrador que te asigne un curso y una asignatura.</p></div>}</div>{teacherRoster.length > 0 && <div className="student-table-wrap teacher-roster"><h2>Estudiantes del grupo</h2><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>ESTADO</th></tr></thead><tbody>{teacherRoster.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><span className="student-status status-active">{student.status}</span></td></tr>)}</tbody></table></div>}</section> : user?.role !== 'admin' ? <section className="role-home"><div className="role-home-icon"><LockKeyhole size={21}/></div><div className="eyebrow">ACCESO DEL COLEGIO</div><h1>Hola, {user?.name?.split(/\s+/)[0]}</h1><p>Tu cuenta tiene el rol de <strong>{roleName(user?.role)}</strong>.</p>{['acudiente', 'estudiante'].includes(user?.role) ? portalStudents.length ? <div className="portal-student-list">{portalStudents.map(student => <article className="portal-student-card" key={student.id}><div className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</div><div><strong>{student.name}</strong><span>{student.relationship === 'acudiente' ? 'Estudiante a cargo' : 'Mi registro'} · {student.grade} · {student.status}</span></div></article>)}</div> : <div className="login-message login-info">Tu cuenta aún no está vinculada a un estudiante. Contacta al administrador del colegio.</div> : <div className="login-message login-info">Abre «Mis cursos» para consultar tus grupos asignados.</div>}<span className="role-home-note"><ShieldCheck size={14}/> Solo ves los registros asociados a tu cuenta.</span></section> : <><div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> {new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es-CO'))}</div><h1>Buenos días, {user?.name?.split(/\s+/)[0] || ''} <span className="wave">✳</span></h1><p className="welcome-sub">Resumen actualizado con los registros de tu colegio.</p></div><div className="welcome-actions"><button className="button button-primary" onClick={() => { setActive('Estudiantes'); setEditingStudent(null); setStudentDialog(true) }}><Plus size={17}/> Nuevo estudiante</button></div></div>
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
    {studentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setStudentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><div><h2 id="dialog-title">{editingStudent ? 'Editar estudiante' : 'Nuevo estudiante'}</h2><p>Completa la información básica del registro.</p></div><button className="icon-btn" onClick={() => { setStudentDialog(false); setEditingStudent(null) }} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> El registro se guarda en la base de datos del colegio.</div><form onSubmit={saveStudent}><label>Nombre completo<input name="name" required defaultValue={editingStudent?.name || ''} maxLength="100" autoComplete="off" placeholder="Nombre y apellidos"/></label><div className="form-row"><label>Documento<input name="document" required defaultValue={editingStudent?.document || ''} maxLength="30" autoComplete="off" placeholder="Número de identificación"/></label><label>Grado y curso<input name="grade" required defaultValue={editingStudent?.grade || ''} maxLength="40" placeholder="Ej. 6° A"/></label></div><div className="form-row"><label>Acudiente autorizado<input name="guardian" required defaultValue={editingStudent?.guardian || ''} maxLength="100" placeholder="Nombre del acudiente"/></label><label>Teléfono de contacto<input name="phone" type="tel" maxLength="25" autoComplete="off" placeholder="Opcional"/></label></div><label>Estado de matrícula<select name="status" defaultValue={editingStudent?.status || 'Activo'}><option>Activo</option><option>Retirado</option></select></label><div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setStudentDialog(false); setEditingStudent(null) }}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15}/> {editingStudent ? 'Guardar cambios' : 'Guardar estudiante'}</button></div></form></section></div>}
    {assessmentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAssessmentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-dialog-title"><div className="dialog-heading"><div><h2 id="assessment-dialog-title">Nueva evaluación o trabajo</h2><p>{selectedGradeAssignment?.courseName} · {selectedGradeAssignment?.subject} · {gradePeriod}</p></div><button className="icon-btn" onClick={() => setAssessmentDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createAssessment}><label>Nombre de la evaluación o trabajo<input name="title" required minLength="2" maxLength="120" placeholder="Ej. Taller de fracciones" autoComplete="off"/></label><label>Tipo de actividad<select value={assessmentMode} onChange={event => { setAssessmentMode(event.target.value); setAssessmentPublished(event.target.value === 'file') }}><option value="file">Trabajo para entregar como archivo</option><option value="online">Evaluación en línea</option></select></label><label>Instrucciones<textarea name="instructions" maxLength="2000" rows="4" placeholder={assessmentMode === 'online' ? 'Indicaciones que verá el estudiante antes de responder.' : 'Describe la actividad y cómo deben entregar el trabajo.'}/></label><label>Fecha límite<input name="dueAt" type="date"/></label><label>Enlace de Google Forms (opcional)<input name="externalFormUrl" type="url" maxLength="1000" placeholder="https://forms.gle/…"/><span className="field-hint">Se abrirá en Google Forms cuando el estudiante pulse el enlace.</span></label><label>Imágenes de apoyo (opcional)<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple/><span className="field-hint">Hasta 5 imágenes JPG, PNG o WEBP · máximo 4 MB cada una.</span></label><label>Ponderación relativa (%)<input name="weightPercent" type="number" required min="0.01" max="100" step="any" defaultValue="100"/></label>{assessmentMode === 'online' ? <><OnlineQuestionEditor questions={assessmentQuestions} onChange={setAssessmentQuestions}/><div className="students-scope"><ShieldCheck size={14}/> Puntaje máximo automático: {assessmentQuestions.reduce((total, question) => total + Number(question.points || 0), 0).toFixed(2)}. Las respuestas se califican al enviar.</div><label className="online-publish-check"><input type="checkbox" checked={assessmentPublished} onChange={event => setAssessmentPublished(event.target.checked)}/> Publicar inmediatamente en Mi aula</label></> : <label>Puntaje máximo<input name="maxScore" type="number" required min="0.01" max="10000" step="any" defaultValue="5"/></label>}{gradeError && <div className="login-message login-error" role="alert">{gradeError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setAssessmentDialog(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={assessmentCreating}><Check size={15}/> {assessmentCreating ? 'Guardando…' : `Crear ${assessmentMode === 'online' ? 'evaluación en línea' : 'trabajo'}`}</button></div></form></section></div>}
    {onlineExam && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !onlineExamBusy) closeOnlineExam() }}><section className="student-dialog online-exam-dialog" role="dialog" aria-modal="true" aria-labelledby="online-exam-title"><div className="dialog-heading"><div><div className="eyebrow">EVALUACIÓN EN LÍNEA · {onlineExam.subject}</div><h2 id="online-exam-title">{onlineExam.title}</h2><p>Responde todas las preguntas y envía una sola vez. Puntaje máximo: {onlineExam.maxScore}.</p></div><button type="button" className="icon-btn" onClick={closeOnlineExam} disabled={onlineExamBusy || onlineDraftSaving} aria-label="Cerrar"><X size={19}/></button></div>{onlineExam.instructions && <p className="assignment-instructions">{onlineExam.instructions}</p>}<form onSubmit={submitOnlineExam} className="online-exam-form">{onlineExam.questions.map(question => <fieldset className="online-exam-question" key={question.id}><legend>{question.questionNo}. {question.prompt} <span>{question.points} pts</span></legend>{question.options.map((option, index) => <label className="online-exam-option" key={index}><input type="radio" name={question.id} checked={onlineExamAnswers[question.id] === index} onChange={() => { setOnlineDraftSaved(false); setOnlineExamAnswers(answers => ({ ...answers, [question.id]: index })) }}/><span>{option}</span></label>)}</fieldset>)}{onlineExamError && <div className="login-message login-error" role="alert">{onlineExamError}</div>}<div className="online-draft-state" role="status">{onlineDraftSaving ? 'Guardando respuestas…' : onlineDraftSaved ? 'Las respuestas se guardan automáticamente.' : 'Esperando a que se guarde el borrador…'}</div><div className="dialog-actions"><button type="button" className="button button-soft" onClick={closeOnlineExam} disabled={onlineExamBusy || onlineDraftSaving}>Cerrar y continuar después</button><button type="submit" className="button button-primary" disabled={onlineExamBusy}>{onlineExamBusy ? 'Enviando…' : 'Finalizar y enviar'}</button></div></form></section></div>}
    {enrollmentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !enrollmentBusy) setEnrollmentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="enrollment-dialog-title"><div className="dialog-heading"><div><h2 id="enrollment-dialog-title">Nueva solicitud de matrícula</h2><p>Completa la información del aspirante y los documentos faltantes.</p></div><button className="icon-btn" onClick={() => setEnrollmentDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createEnrollmentRequest}><label>Nombre completo del estudiante<input name="studentName" required minLength="2" maxLength="100" placeholder="Nombre y apellidos"/></label><div className="form-row"><label>Documento<input name="document" required maxLength="30" placeholder="Identificación"/></label><label>Grado solicitado<input name="gradeRequested" required maxLength="40" placeholder="Ej. 6° A"/></label></div><label>Año lectivo<input name="academicYear" required pattern="[0-9]{4}-[0-9]{4}" defaultValue={`${new Date().getFullYear()}-${new Date().getFullYear()+1}`}/></label><div className="form-row"><label>Nombre del acudiente<input name="guardianName" required maxLength="100" placeholder="Nombre completo"/></label><label>Teléfono<input name="guardianPhone" type="tel" maxLength="25" placeholder="Opcional"/></label></div><label>Documentos pendientes <span className="optional-label">SEPARADOS POR COMAS</span><input name="pendingDocuments" maxLength="1000" placeholder="Registro civil, certificado de notas"/></label><label>Observaciones<textarea name="notes" maxLength="1000" rows="3" placeholder="Opcional"/></label>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setEnrollmentDialog(false)} disabled={enrollmentBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={enrollmentBusy}>{enrollmentBusy ? 'Guardando…' : <><Check size={15}/> Crear solicitud</>}</button></div></form></section></div>}
    {transferTarget && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !enrollmentBusy) setTransferTarget(null) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title"><div className="dialog-heading"><div><h2 id="transfer-dialog-title">Trasladar estudiante</h2><p>{transferTarget.studentName} · {transferTarget.academicYear} · {transferTarget.courseName || 'Curso sin asignar'}</p></div><button className="icon-btn" onClick={() => setTransferTarget(null)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={transferStudent}><label>Curso destino<select name="courseId" required defaultValue=""><option value="" disabled>Selecciona el curso destino</option>{transferCourses.filter(course => course.id !== transferTarget.courseId).map(course => <option key={course.id} value={course.id}>{course.name} · {course.grade}</option>)}</select></label>{transferCourses.filter(course => course.id !== transferTarget.courseId).length === 0 && <div className="login-message login-info">No hay otro curso activo para este mismo año lectivo.</div>}<label>Fecha efectiva<input name="effectiveDate" type="date" required defaultValue={getLocalDate()}/></label><label>Observación<textarea name="notes" maxLength="1000" rows="3" placeholder="Motivo o detalle del traslado"/></label>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setTransferTarget(null)} disabled={enrollmentBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={enrollmentBusy || !transferCourses.some(course => course.id !== transferTarget.courseId)}>{enrollmentBusy ? 'Guardando…' : <><Check size={15}/> Registrar traslado</>}</button></div></form></section></div>}
    {historyCourse && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHistoryCourse(null) }}><section className="student-dialog course-history-dialog" role="dialog" aria-modal="true" aria-labelledby="course-history-title"><div className="dialog-heading"><div><h2 id="course-history-title">Historial del curso</h2><p>{historyCourse.name} · {historyCourse.grade} · {historyCourse.academicYear}{historyCourse.isActive ? '' : ' · Archivado'}</p></div><button className="icon-btn" onClick={() => setHistoryCourse(null)} aria-label="Cerrar historial"><X size={19}/></button></div><div className="course-history-tabs"><button className={historyKind === 'attendance' ? 'history-tab-selected' : ''} onClick={() => { setHistoryKind('attendance'); loadCourseHistory(historyCourse, 'attendance', 0) }}><CalendarDays size={15}/> Asistencia</button><button className={historyKind === 'grades' ? 'history-tab-selected' : ''} onClick={() => { setHistoryKind('grades'); loadCourseHistory(historyCourse, 'grades', 0) }}><BookOpen size={15}/> Calificaciones</button></div><div className="course-history-body">{historyError && <div className="login-message login-error" role="alert">{historyError}</div>}{historyLoading ? <div className="students-empty">Cargando historial…</div> : historyRecords.length ? historyKind === 'attendance' ? <div className="student-table-wrap history-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>FECHA</th><th>ESTADO</th><th>REGISTRÓ</th><th>GUARDADO</th></tr></thead><tbody>{historyRecords.map((record,index) => <tr key={`${record.studentName}-${record.attendanceDate}-${index}`}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.grade}</small></td><td>{record.attendanceDate}</td><td><span className={`student-status ${record.status === 'Presente' || record.status === 'Tarde' ? 'status-active' : 'status-inactive'}`}>{record.status}</span></td><td>{record.markedBy}</td><td>{new Date(record.markedAt).toLocaleString('es-CO')}</td></tr>)}</tbody></table></div> : <div className="student-table-wrap history-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>EVALUACIÓN</th><th>PERIODO</th><th>NOTA</th><th>OBSERVACIÓN</th><th>ACTUALIZÓ</th></tr></thead><tbody>{historyRecords.map((record,index) => <tr key={`${record.studentName}-${record.assessmentTitle}-${index}`}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.grade}</small></td><td><strong>{record.assessmentTitle}</strong><small className="history-secondary">{record.subject}</small></td><td>{record.period}</td><td>{record.score} / {record.maxScore}</td><td>{record.comment || '—'}</td><td><strong>{record.updatedBy}</strong><small className="history-secondary">{new Date(record.updatedAt).toLocaleString('es-CO')}</small></td></tr>)}</tbody></table></div> : <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>No hay registros de {historyKind === 'attendance' ? 'asistencia' : 'calificaciones'} todavía</strong><p>Los datos históricos aparecerán aquí cuando existan registros asociados al curso.</p></div>}</div><div className="course-history-footer"><span>{historyTotal ? `Mostrando ${historyOffset + 1}–${Math.min(historyOffset + historyRecords.length, historyTotal)} de ${historyTotal}` : 'Sin registros'}</span><div><button className="button button-soft" disabled={historyLoading || historyOffset === 0} onClick={() => loadCourseHistory(historyCourse, historyKind, Math.max(0, historyOffset - 25))}>Anterior</button><button className="button button-soft" disabled={historyLoading || historyOffset + historyRecords.length >= historyTotal} onClick={() => loadCourseHistory(historyCourse, historyKind, historyOffset + 25)}>Siguiente</button></div></div></section></div>}
    {courseDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCourseDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title"><div className="dialog-heading"><div><h2 id="course-dialog-title">{editingCourse ? 'Editar curso' : 'Crear curso'}</h2><p>Registra el grupo y el año lectivo.</p></div><button className="icon-btn" onClick={() => { setCourseDialog(false); setEditingCourse(null) }} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={saveCourse}><label>Nombre del curso<input name="name" required minLength="2" maxLength="80" placeholder="Ej. 6° A" defaultValue={editingCourse?.name || ''}/></label><label>Grado o grupo<input name="grade" required minLength="2" maxLength="40" placeholder="Debe coincidir con el grado de los estudiantes" defaultValue={editingCourse?.grade || ''}/></label><label>Año lectivo<input name="academicYear" required pattern="[0-9]{4}-[0-9]{4}" defaultValue={editingCourse?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear()+1}`} placeholder="2026-2027"/></label>{courseError && <div className="login-message login-error" role="alert">{courseError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setCourseDialog(false); setEditingCourse(null) }}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15}/> {editingCourse ? 'Guardar cambios' : 'Guardar curso'}</button></div></form></section></div>}
    {assignmentCourse && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAssignmentCourse(null) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title"><div className="dialog-heading"><div><h2 id="assignment-dialog-title">{editingAssignment ? 'Editar asignación' : 'Asignar docente'}</h2><p>{assignmentCourse.name} · {assignmentCourse.academicYear}</p></div><button className="icon-btn" onClick={() => { setAssignmentCourse(null); setEditingAssignment(null) }} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={assignTeacher}><label>Docente<select name="teacherId" required defaultValue={editingAssignment?.id || ''}><option value="" disabled>Selecciona docente</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label><label>Asignatura<select name="subject" required defaultValue={editingAssignment ? (commonSubjects.includes(editingAssignment.subject) ? editingAssignment.subject : '__otra__') : ''} onChange={event => setIsCustomSubject(event.target.value === '__otra__')}><option value="" disabled>Selecciona asignatura</option>{commonSubjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}<option value="__otra__">Otra asignatura…</option></select></label>{isCustomSubject && <label>Nombre de la asignatura<input name="customSubject" required minLength="2" maxLength="80" placeholder="Escribe el nombre" autoComplete="off" defaultValue={editingAssignment?.subject || ''}/></label>}{teachers.length === 0 && <div className="login-message login-info">Primero crea y activa una cuenta con rol Docente en «Usuarios y accesos».</div>}{courseError && <div className="login-message login-error" role="alert">{courseError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setAssignmentCourse(null); setEditingAssignment(null) }}>Cancelar</button><button type="submit" className="button button-primary" disabled={!teachers.length}><Check size={15}/> {editingAssignment ? 'Guardar cambios' : 'Asignar'}</button></div></form></section></div>}
    {passwordDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !passwordBusy) setPasswordDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title"><div className="dialog-heading"><div><h2 id="password-dialog-title">Cambiar contraseña</h2><p>Actualiza la clave de acceso de tu cuenta.</p></div><button type="button" className="icon-btn" onClick={() => setPasswordDialog(false)} disabled={passwordBusy} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> Se cerrarán las demás sesiones de tu cuenta al guardar.</div><form onSubmit={changeOwnPassword}><label>Contraseña actual<input name="currentPassword" type="password" required maxLength="128" autoComplete="current-password"/></label><label>Nueva contraseña <span className="optional-label">12 CARACTERES MÍNIMO</span><input name="newPassword" type="password" required minLength="12" maxLength="128" autoComplete="new-password"/></label><label>Confirmar nueva contraseña<input name="confirmPassword" type="password" required minLength="12" maxLength="128" autoComplete="new-password"/></label>{passwordError && <div className="login-message login-error" role="alert">{passwordError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setPasswordDialog(false)} disabled={passwordBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={passwordBusy}>{passwordBusy ? 'Actualizando…' : <><LockKeyhole size={15}/> Guardar contraseña</>}</button></div></form></section></div>}
    {accountDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !accountBusy) setAccountDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><div className="dialog-heading"><div><h2 id="account-dialog-title">{editingAccount ? 'Editar cuenta' : 'Crear acceso al colegio'}</h2><p>{editingAccount ? 'Actualiza los datos y permisos de esta cuenta.' : 'La persona iniciará sesión con el colegio, correo y contraseña inicial.'}</p></div><button className="icon-btn" onClick={() => setAccountDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> La cuenta queda asociada únicamente a {user?.school?.name || 'este colegio'}.</div><form onSubmit={saveAccount}><label>Nombre completo<input name="name" required minLength="2" maxLength="100" autoComplete="off" placeholder="Nombre y apellidos" defaultValue={editingAccount?.name || ''}/></label><label>Correo electrónico<input name="email" type="email" required maxLength="254" autoComplete="off" placeholder="persona@colegio.edu.co" defaultValue={editingAccount?.email || ''}/></label><label>Rol de acceso{editingAccount?.id === user?.id && <input type="hidden" name="role" value={newAccountRole}/>}<select name="role" value={newAccountRole} disabled={editingAccount?.id === user?.id} onChange={event => setNewAccountRole(event.target.value)}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>{['acudiente', 'estudiante'].includes(newAccountRole) && <fieldset className="student-link-fieldset"><legend>{newAccountRole === 'acudiente' ? 'Estudiantes a cargo' : 'Registro del estudiante'}</legend>{linkableStudents.length ? linkableStudents.map((student, index) => <label className="student-link-option" key={student.id}><input type={newAccountRole === 'estudiante' ? 'radio' : 'checkbox'} name="studentIds" value={student.id} defaultChecked={editingAccount?.studentIds?.includes(student.id)} required={newAccountRole === 'estudiante' && index === 0}/><span><strong>{student.name}</strong><small>{student.document} · {student.grade}</small></span></label>) : <p>No hay estudiantes activos para asociar. Registra primero al estudiante en el módulo Estudiantes.</p>}</fieldset>}<label>{editingAccount ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} <span className="optional-label">12 CARACTERES MÍNIMO</span><input name="password" type="password" required={!editingAccount} minLength="12" maxLength="128" autoComplete="new-password" placeholder={editingAccount ? 'Déjala vacía para conservarla' : 'Contraseña temporal segura'}/></label><p className="users-footnote">{editingAccount ? 'Déjala vacía para conservar la contraseña actual.' : 'Comparte la contraseña inicial directamente por un canal seguro.'}</p>{accountError && <div className="login-message login-error" role="alert">{accountError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setAccountDialog(false)} disabled={accountBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={accountBusy}>{accountBusy ? 'Guardando…' : <><Check size={15}/> {editingAccount ? 'Guardar cambios' : 'Crear cuenta'}</>}</button></div></form></section></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
