import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen,
  CalendarDays, Check, ChevronDown, ChevronRight, ClipboardCheck,
  Clock3, Download, Eye, EyeOff, FileText, GraduationCap, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal,
  Plus, Pencil, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Users, X,
} from 'lucide-react'
import './style.css'

const navGroups = [
  { title: 'GENERAL', items: [{ label: 'Resumen', icon: LayoutDashboard }, { label: 'Estudiantes', icon: Users }, { label: 'Matrículas', icon: ClipboardCheck }, { label: 'Asistencia', icon: CalendarDays }, { label: 'Calificaciones', icon: BookOpen }] },
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
  const [assessmentDialog, setAssessmentDialog] = useState(false)
  const selectedGradeAssignment = gradeAssignments.find(item => `${item.courseId}|${item.subject}` === gradeAssignmentKey)

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
      setLoginNotice('')
    } catch { setLoginError('No se pudo conectar con el servidor. Comprueba que esté en ejecución.') }
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
      if (session.ok) { const data = await session.json(); setUser(data.user); setAuthenticated(true) }
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
    if (!authenticated || active !== 'Calificaciones' || !gradeAssessmentId) return
    let alive = true
    setGradeLoading(true)
    fetch(`/api/grades/assessments/${gradeAssessmentId}`, { credentials: 'same-origin' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la lista de estudiantes.')
      if (alive) { setGradeAssessment(result.assessment); setGradeRows(result.students || []) }
    }).catch(error => { if (alive) { setGradeAssessment(null); setGradeRows([]); setGradeError(error.message || 'No se pudo cargar la evaluación.') } }).finally(() => { if (alive) setGradeLoading(false) })
    return () => { alive = false }
  }, [authenticated, active, gradeAssessmentId])
  const createAssessment = async event => {
    event.preventDefault(); setGradeError('')
    if (!selectedGradeAssignment) return setGradeError('Selecciona primero curso y asignatura.')
    const form = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch('/api/grades/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...form, courseId: selectedGradeAssignment.courseId, subject: selectedGradeAssignment.subject, period: gradePeriod, maxScore: Number(form.maxScore) }) })
      const result = await response.json()
      if (!response.ok) return setGradeError(result.error || 'No se pudo crear la evaluación.')
      setGradeAssessments(current => [result.assessment, ...current]); setGradeAssessmentId(result.assessment.id); setAssessmentDialog(false); notify('Evaluación creada.')
    } catch { setGradeError('No se pudo conectar con el servidor.') }
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
        {navGroups.map(group => <section className="nav-section" key={group.title}><div className="nav-heading">{group.title}</div>{group.items.filter(item => (item.label !== 'Matrículas' || ['admin', 'secretaria'].includes(user?.role)) && (item.label !== 'Usuarios y accesos' || user?.role === 'admin') && (item.label !== 'Cursos y docentes' || ['admin', 'secretaria'].includes(user?.role)) && (item.label !== 'Mis cursos' || user?.role === 'docente') && (item.label !== 'Estudiantes' || ['admin', 'secretaria'].includes(user?.role)) && (item.label !== 'Asistencia' || ['admin', 'secretaria', 'docente'].includes(user?.role)) && (item.label !== 'Calificaciones' || ['admin', 'secretaria', 'docente'].includes(user?.role))).map(item => <button key={item.label} className={`nav-item ${active === item.label ? 'selected' : ''}`} onClick={() => { setActive(item.label); setMenuOpen(false) }}><item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}</button>)}</section>)}
        <div className="sidebar-note"><span className="note-icon"><Sparkles size={16} /></span><div><strong>Todo en orden</strong><p>Tu institución está al día.</p></div><ArrowRight size={15} className="note-arrow" /></div>
      </div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => notify('La configuración estará disponible próximamente.')}><Settings2 size={18} /><span>Configuración</span></button><div className="user-card"><div className="user-avatar">{user?.name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es') || 'U'}</div><div className="user-copy"><strong>{user?.name || 'Usuario'}</strong><span>{user?.role === 'admin' ? 'Administrador' : user?.role || 'Personal'}</span></div><button className="logout-button" title="Cerrar sesión" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); setAuthenticated(false); setUser(null); setStudents([]); setDashboardData(null) }}><MoreHorizontal size={19} className="muted-icon" /></button></div></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="icon-btn mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button><div className="breadcrumb">Institución <ChevronRight size={14} /><span>{active}</span></div></div><div className="top-actions"><label className="search-box"><Search size={17} /><input aria-label="Buscar" placeholder="Buscar estudiante, curso..." value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label><button className="icon-btn notification-btn" aria-label="Notificaciones" onClick={() => notify('No tienes notificaciones nuevas.')}><Bell size={19} /><i /></button><div className="top-divider" /><button className="profile-mini" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); setAuthenticated(false); setUser(null); setStudents([]); setDashboardData(null) }} title="Cerrar sesión"><span className="user-avatar small">{user?.name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es') || 'U'}</span><ChevronDown size={15} className="muted-icon" /></button></div></header>
      <div className="content-wrap">
        {active === 'Calificaciones' ? <section className="students-page grades-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN ACADÉMICA</div><h1>Calificaciones</h1><p className="welcome-sub">Organiza evaluaciones y registra resultados por estudiante.</p></div><div className="students-actions"><button className="button button-primary" disabled={!selectedGradeAssignment} onClick={() => { setGradeError(''); setAssessmentDialog(true) }}><Plus size={17}/> Nueva evaluación</button></div></div><div className="students-toolbar grades-toolbar"><label className="student-filter">Curso y asignatura <select value={gradeAssignmentKey} onChange={event => { setGradeAssignmentKey(event.target.value); setGradeAssessmentId(''); setGradeAssessment(null); setGradeRows([]) }}><option value="">Selecciona una asignatura</option>{gradeAssignments.map(item => <option key={`${item.courseId}|${item.subject}`} value={`${item.courseId}|${item.subject}`}>{item.grade} · {item.courseName} · {item.subject}{user?.role !== 'docente' ? ` · ${item.teacherName}` : ''}</option>)}</select></label><label className="student-filter">Periodo <select value={gradePeriod} onChange={event => { setGradePeriod(event.target.value); setGradeAssessmentId('') }}>{['Periodo 1','Periodo 2','Periodo 3','Periodo 4'].map(period => <option key={period}>{period}</option>)}</select></label><label className="student-filter">Evaluación <select value={gradeAssessmentId} onChange={event => setGradeAssessmentId(event.target.value)} disabled={!gradeAssessments.length}><option value="">Selecciona evaluación</option>{gradeAssessments.map(item => <option key={item.id} value={item.id}>{item.title} · hasta {item.maxScore}</option>)}</select></label></div><div className="students-scope"><ShieldCheck size={14}/> Las notas se limitan al colegio y a las asignaturas asignadas. El puntaje máximo se define en cada evaluación; los promedios y boletines institucionales requieren configurar las reglas académicas del colegio.</div>{gradeError && <div className="login-message login-error" role="alert">{gradeError}</div>}{!gradeAssignments.length ? <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>No hay asignaturas asignadas</strong><p>Crea un curso, asigna una asignatura y vincula un docente para empezar.</p></div> : !gradeAssessmentId ? <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>{gradeAssessments.length ? 'Selecciona una evaluación' : 'Aún no hay evaluaciones en este periodo'}</strong><p>{gradeAssessments.length ? 'Elige una evaluación para consultar o registrar calificaciones.' : 'Crea una evaluación para la asignatura y el periodo seleccionados.'}</p>{!gradeAssessments.length && <button className="button button-primary" onClick={() => setAssessmentDialog(true)}><Plus size={16}/> Crear evaluación</button>}</div> : gradeLoading ? <div className="students-empty">Cargando calificaciones…</div> : <><div className="grade-assessment-summary"><div><span>Evaluación</span><strong>{gradeAssessment?.title}</strong></div><div><span>Curso y asignatura</span><strong>{gradeAssessment?.courseName} · {gradeAssessment?.subject}</strong></div><div><span>Periodo</span><strong>{gradeAssessment?.period}</strong></div><div><span>Puntaje máximo</span><strong>{gradeAssessment?.maxScore}</strong></div><button className="button button-primary" onClick={saveGrades} disabled={gradeSaving || !gradeRows.some(student => student.score !== null && student.score !== '')}><Check size={15}/>{gradeSaving ? 'Guardando…' : 'Guardar notas'}</button></div><div className="student-table-wrap"><table className="student-table grade-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>NOTA / {gradeAssessment?.maxScore}</th><th>OBSERVACIÓN (OPCIONAL)</th></tr></thead><tbody>{gradeRows.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><input className="grade-score-input" type="number" min="0" max={gradeAssessment?.maxScore} step="any" value={student.score ?? ''} aria-label={`Nota de ${student.name}`} onChange={event => setGradeRows(rows => rows.map(row => row.id === student.id ? { ...row, score: event.target.value } : row))}/></td><td><input className="grade-comment-input" maxLength="500" value={student.comment || ''} placeholder="Opcional" aria-label={`Observación de ${student.name}`} onChange={event => setGradeRows(rows => rows.map(row => row.id === student.id ? { ...row, comment: event.target.value } : row))}/></td></tr>)}</tbody></table>{!gradeRows.length && <div className="students-empty">No hay estudiantes activos en el grado de este curso.</div>}</div></>}</section> : active === 'Asistencia' ? <section className="students-page attendance-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> CONTROL ACADÉMICO</div><h1>Asistencia</h1><p className="welcome-sub">Registra la asistencia del grupo por fecha.</p></div><div className="students-actions"><button className="button button-primary" onClick={saveAttendance} disabled={attendanceSaving || !attendanceRows.some(student => student.attendanceStatus)}><Check size={16}/>{attendanceSaving ? 'Guardando…' : 'Guardar asistencia'}</button></div></div><div className="students-toolbar attendance-toolbar"><label className="student-filter">Curso <select value={attendanceCourseId} onChange={event => setAttendanceCourseId(event.target.value)}><option value="">Selecciona un curso</option>{attendanceCourses.map(course => <option key={course.id} value={course.id}>{course.grade} · {course.name} · {course.academicYear}</option>)}</select></label><label className="student-filter">Fecha <input type="date" value={attendanceDate} onChange={event => setAttendanceDate(event.target.value)}/></label><div className="student-count"><strong>{attendanceRows.filter(student => student.attendanceStatus).length}</strong> de {attendanceRows.length} marcados</div></div><div className="students-scope"><ShieldCheck size={14}/> Solo puedes registrar asistencia en cursos de tu colegio y, si eres docente, en cursos asignados a tu cuenta. Puedes guardar el grupo por partes; cada estudiante solo tiene un registro por curso y fecha.</div>{attendanceError && <div className="login-message login-error" role="alert">{attendanceError}</div>}{attendanceLoading ? <div className="students-empty">Cargando lista del grupo…</div> : attendanceRows.length ? <div className="student-table-wrap"><table className="student-table attendance-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>ESTADO DE ASISTENCIA</th><th>REGISTRO</th></tr></thead><tbody>{attendanceRows.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><select aria-label={`Asistencia de ${student.name}`} className={`attendance-status-select ${student.attendanceStatus ? `attendance-${student.attendanceStatus.toLowerCase()}` : ''}`} value={student.attendanceStatus || ''} onChange={event => setAttendanceRows(rows => rows.map(row => row.id === student.id ? { ...row, attendanceStatus: event.target.value || null } : row))}><option value="">Sin registrar</option><option value="Presente">Presente</option><option value="Ausente">Ausente</option><option value="Tarde">Tarde</option><option value="Justificado">Justificado</option></select></td><td>{student.markedAt ? `Guardado · ${new Date(student.markedAt).toLocaleString('es-CO')}` : 'Pendiente'}</td></tr>)}</tbody></table></div> : <div className="students-empty"><span className="empty-icon"><ClipboardCheck size={22}/></span><strong>{attendanceCourseId ? 'No hay estudiantes activos en este grupo' : 'Selecciona un curso'}</strong><p>{attendanceCourseId ? 'Verifica que los estudiantes activos tengan el mismo grado o grupo configurado en este curso.' : attendanceCourses.length ? 'Elige un curso y una fecha para consultar la lista.' : 'Todavía no hay cursos disponibles o asignados para tomar asistencia.'}</p></div>}</section> : active === 'Cursos y docentes' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ORGANIZACIÓN ACADÉMICA</div><h1>Cursos y docentes</h1><p className="welcome-sub">Crea cursos, actualiza sus datos y administra sus asignaciones docentes.</p></div><div className="students-actions"><button className="button button-primary" onClick={() => { setCourseError(''); setEditingCourse(null); setCourseDialog(true) }}><Plus size={17}/> Crear curso</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Los cursos dados de baja se ocultan de asistencia y calificaciones; su historial se conserva y puedes reactivarlos.</div><div className="course-grid">{courses.map(course => <article className={`course-card ${course.isActive ? '' : 'course-archived'}`} key={course.id}><div className="course-card-top"><span className="stat-icon violet"><BookOpen size={17}/></span><span className="course-badges"><span className="role-chip">{course.academicYear}</span><span className={`course-state-chip ${course.isActive ? 'course-state-active' : 'course-state-archived'}`}>{course.isActive ? 'Activo' : 'Archivado'}</span></span></div><h2>{course.name}</h2><p>{course.grade}</p><div className="course-teacher-list">{course.teachers.map(teacher => <div className="course-assignment-row" key={`${teacher.id}-${teacher.subject}`}><span><strong>{teacher.name}</strong><small>{teacher.subject}</small></span>{Boolean(course.isActive) && <span className="course-assignment-actions"><button className="account-toggle" title="Editar asignación" aria-label={`Editar ${teacher.subject} de ${teacher.name}`} onClick={() => { setCourseError(''); setIsCustomSubject(!commonSubjects.includes(teacher.subject)); setEditingAssignment(teacher); setAssignmentCourse(course) }}><Pencil size={14}/> Editar</button><button className="account-toggle delete-student-action" title="Quitar docente" aria-label={`Quitar ${teacher.name} de ${teacher.subject}`} onClick={() => deleteTeacherAssignment(course, teacher)}><Trash2 size={14}/> Quitar</button></span>}</div>)}{!course.teachers.length && <span>Aún no hay docentes asignados.</span>}</div><div className="course-card-actions"><button className="account-toggle" onClick={() => openCourseHistory(course)}><Clock3 size={14}/> Historial</button><button className="account-toggle" onClick={() => { setCourseError(''); setEditingCourse(course); setCourseDialog(true) }}><Pencil size={14}/> Editar curso</button>{course.isActive ? <button className="account-toggle delete-student-action" onClick={() => archiveCourse(course)}><Trash2 size={14}/> Dar de baja</button> : <button className="account-toggle course-reactivate" onClick={() => setCourseActive(course, true)}><Check size={14}/> Reactivar</button>}</div>{Boolean(course.isActive) && <button className="button button-soft" onClick={() => { setCourseError(''); setIsCustomSubject(false); setEditingAssignment(null); setAssignmentCourse(course) }}><Plus size={15}/> Asignar docente</button>}</article>)}{!courses.length && <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>Aún no hay cursos</strong><p>Crea el primer grupo para organizar las asignaturas y asignaciones docentes.</p></div>}</div></section> : active === 'Usuarios y accesos' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ADMINISTRACIÓN DEL COLEGIO</div><h1>Usuarios y accesos</h1><p className="welcome-sub">Crea cuentas por rol y controla quién puede iniciar sesión en este colegio.</p></div><div className="students-actions"><button className="button button-primary" onClick={() => { setAccountError(''); setEditingAccount(null); setNewAccountRole('docente'); setAccountDialog(true) }}><Plus size={17}/> Crear cuenta</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Solo administradores pueden gestionar cuentas. Cada persona inicia sesión con el nombre del colegio, su correo y contraseña.</div><div className="students-toolbar"><div className="student-count"><strong>{schoolUsers.length}</strong> {schoolUsers.length === 1 ? 'cuenta del colegio' : 'cuentas del colegio'}</div></div><div className="student-table-wrap"><table className="student-table user-table"><thead><tr><th>PERSONA</th><th>CORREO</th><th>ROL</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{schoolUsers.map(account => <tr key={account.id}><td><span className="student-initials">{account.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{account.name}</strong></td><td>{account.email}</td><td><span className="role-chip">{roleName(account.role)}</span></td><td><span className={`student-status ${Boolean(account.active) ? 'status-active' : 'status-inactive'}`}>{Boolean(account.active) ? 'Activa' : 'Desactivada'}</span></td><td><div className="table-row-actions"><button className="account-toggle" onClick={() => { setAccountError(''); setEditingAccount(account); setNewAccountRole(account.role); setAccountDialog(true) }}><Pencil size={14}/> Editar</button><button className="account-toggle" disabled={account.id === user?.id} onClick={() => setAccountActive(account)}>{Boolean(account.active) ? 'Desactivar' : 'Activar'}</button><button className="account-toggle delete-student-action" disabled={account.id === user?.id} onClick={() => deleteAccount(account)}><Trash2 size={14}/> Eliminar</button></div></td></tr>)}</tbody></table>{schoolUsers.length === 0 && <div className="students-empty"><span className="empty-icon"><Users size={22}/></span><strong>No se pudieron cargar las cuentas</strong><p>Vuelve a entrar en esta sección o revisa la conexión con el servidor.</p></div>}</div><p className="users-footnote">Puedes editar datos, rol y vínculos; al eliminar una cuenta se revoca el acceso y se conserva la auditoría. La recuperación automática de contraseñas aún no está disponible.</p></section> : active === 'Matrículas' ? <section className="students-page enrollment-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> PROCESO DE ADMISIÓN</div><h1>Matrículas</h1><p className="welcome-sub">Gestiona solicitudes y consulta el historial de traslados por año lectivo.</p></div><div className="students-actions"><button className="button button-primary" disabled={enrollmentTab !== 'requests'} onClick={() => { setEnrollmentError(''); setEnrollmentDialog(true) }}><Plus size={17}/> Nueva solicitud</button></div></div><div className="enrollment-tabs"><button className={enrollmentTab === 'requests' ? 'history-tab-selected' : ''} onClick={() => setEnrollmentTab('requests')}><ClipboardCheck size={15}/> Solicitudes</button><button className={enrollmentTab === 'history' ? 'history-tab-selected' : ''} onClick={() => setEnrollmentTab('history')}><Clock3 size={15}/> Historial y traslados</button></div>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}{enrollmentTab === 'requests' ? <><div className="students-toolbar enrollment-toolbar"><label className="student-filter">Buscar <input value={enrollmentSearch} onChange={event => setEnrollmentSearch(event.target.value)} placeholder="Nombre o documento"/></label><label className="student-filter">Estado <select value={enrollmentStatusFilter} onChange={event => setEnrollmentStatusFilter(event.target.value)}>{['Todos','Solicitada','En revisión','Pendiente documentos','Aprobada','Rechazada'].map(status => <option key={status}>{status}</option>)}</select></label><div className="student-count"><strong>{enrollmentRequests.length}</strong> solicitudes</div></div><div className="student-table-wrap"><table className="student-table enrollment-table"><thead><tr><th>ESTUDIANTE</th><th>DOCUMENTO / GRADO</th><th>ACUDIENTE</th><th>AÑO LECTIVO</th><th>DOCUMENTOS PENDIENTES</th><th>ESTADO</th></tr></thead><tbody>{enrollmentRequests.map(request => <tr key={request.id}><td><strong>{request.studentName}</strong><small className="history-secondary">{request.createdAt ? new Date(request.createdAt).toLocaleDateString('es-CO') : ''}</small></td><td>{request.document}<small className="history-secondary">{request.gradeRequested}</small></td><td>{request.guardianName}<small className="history-secondary">{request.guardianPhone || 'Sin teléfono'}</small></td><td>{request.academicYear}</td><td>{request.pendingDocuments ? request.pendingDocuments.split('\n').join(', ') : 'Ninguno'}</td><td><select className={`enrollment-status-select enrollment-status-${request.status.toLowerCase().replaceAll(' ','-')}`} aria-label={`Estado de matrícula de ${request.studentName}`} value={request.status} disabled={request.status === 'Aprobada'} onChange={event => updateEnrollmentRequest(request,event.target.value)}>{['Solicitada','En revisión','Pendiente documentos','Aprobada','Rechazada'].map(status => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table>{!enrollmentRequests.length && <div className="students-empty"><span className="empty-icon"><ClipboardCheck size={22}/></span><strong>No hay solicitudes de matrícula</strong><p>Registra una solicitud nueva o ajusta los filtros.</p></div>}</div></> : <div className="student-table-wrap"><table className="student-table enrollment-table"><thead><tr><th>ESTUDIANTE</th><th>AÑO LECTIVO</th><th>CURSO</th><th>FECHAS</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{enrollmentHistory.map(record => <tr key={record.id}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.document} · {record.grade}</small></td><td>{record.academicYear}</td><td>{record.courseName || 'Curso sin asignar'}</td><td>{record.startDate}{record.endDate ? ` → ${record.endDate}` : ''}</td><td><span className={`student-status ${record.status === 'Activa' ? 'status-active' : 'status-inactive'}`}>{record.status}</span></td><td>{record.status === 'Activa' && <button className="account-toggle" onClick={() => openTransferDialog(record)}><ArrowRight size={14}/> Trasladar</button>}</td></tr>)}</tbody></table>{!enrollmentHistory.length && <div className="students-empty"><span className="empty-icon"><Clock3 size={22}/></span><strong>Aún no hay matrículas aprobadas</strong><p>Al aprobar una solicitud se registrará aquí el historial por curso y año.</p></div>}</div>}</section> : active === 'Estudiantes' ? <section className="students-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN ACADÉMICA</div><h1>Estudiantes</h1><p className="welcome-sub">Consulta y administra los registros de estudiantes.</p></div><div className="students-actions"><button className="button button-soft" onClick={exportStudents}><Download size={16}/> Exportar CSV</button><button className="button button-primary" onClick={() => { setEditingStudent(null); setStudentDialog(true) }}><Plus size={17}/> Nuevo estudiante</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Los registros se guardan en la base del colegio y solo el personal autorizado debe acceder.</div><div className="students-toolbar"><div className="student-count"><strong>{students.length}</strong> {students.length === 1 ? 'estudiante registrado' : 'estudiantes registrados'}</div><label className="student-filter">Estado <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>Todos</option><option>Activo</option><option>Retirado</option></select></label></div><div className="student-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>DOCUMENTO</th><th>GRADO / CURSO</th><th>ACUDIENTE</th><th>TELÉFONO</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{visibleStudents.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.document}</td><td>{student.grade}</td><td>{student.guardian}</td><td>{student.phone || '—'}</td><td><span className={`student-status ${student.status === 'Activo' ? 'status-active' : 'status-inactive'}`}>{student.status}</span></td><td><div className="table-row-actions"><button className="account-toggle" onClick={() => { setEditingStudent(student); setStudentDialog(true) }}><Pencil size={14}/> Editar</button>{user?.role === 'admin' && <button className="account-toggle delete-student-action" onClick={() => deleteStudent(student)}><Trash2 size={14}/> Eliminar</button>}</div></td></tr>)}</tbody></table>{visibleStudents.length === 0 && <div className="students-empty"><span className="empty-icon"><Users size={22}/></span><strong>{students.length ? 'No hay resultados' : 'Aún no hay estudiantes'}</strong><p>{students.length ? 'Prueba con otra búsqueda o cambia el filtro de estado.' : 'Registra un estudiante para empezar a organizar los datos.'}</p>{!students.length && <button className="button button-primary" onClick={() => setStudentDialog(true)}><Plus size={16}/> Crear primer registro</button>}</div>}</div></section> : active === 'Mis cursos' && user?.role === 'docente' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ESPACIO DOCENTE</div><h1>Mis cursos</h1><p className="welcome-sub">Consulta los grupos y estudiantes asignados a tu cuenta.</p></div></div><div className="teacher-course-grid">{teacherCourses.map(course => <article className="course-card teacher-course-card" key={`${course.id}-${course.subject}`}><div className="course-card-top"><span className="stat-icon violet"><BookOpen size={17}/></span><span className="role-chip">{course.academicYear}</span></div><h2>{course.name}</h2><p>{course.grade} · {course.subject}</p><div className="course-roster-count"><Users size={16}/> {course.studentCount} estudiantes activos</div><button className="button button-primary" onClick={() => loadTeacherRoster(course)}>Ver lista de estudiantes</button></article>)}{!teacherCourses.length && <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>No tienes cursos asignados</strong><p>Solicita al administrador que te asigne un curso y una asignatura.</p></div>}</div>{teacherRoster.length > 0 && <div className="student-table-wrap teacher-roster"><h2>Estudiantes del grupo</h2><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>ESTADO</th></tr></thead><tbody>{teacherRoster.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><span className="student-status status-active">{student.status}</span></td></tr>)}</tbody></table></div>}</section> : user?.role !== 'admin' ? <section className="role-home"><div className="role-home-icon"><LockKeyhole size={21}/></div><div className="eyebrow">ACCESO DEL COLEGIO</div><h1>Hola, {user?.name?.split(/\s+/)[0]}</h1><p>Tu cuenta tiene el rol de <strong>{roleName(user?.role)}</strong>.</p>{['acudiente', 'estudiante'].includes(user?.role) ? portalStudents.length ? <div className="portal-student-list">{portalStudents.map(student => <article className="portal-student-card" key={student.id}><div className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</div><div><strong>{student.name}</strong><span>{student.relationship === 'acudiente' ? 'Estudiante a cargo' : 'Mi registro'} · {student.grade} · {student.status}</span></div></article>)}</div> : <div className="login-message login-info">Tu cuenta aún no está vinculada a un estudiante. Contacta al administrador del colegio.</div> : <div className="login-message login-info">Abre «Mis cursos» para consultar tus grupos asignados.</div>}<span className="role-home-note"><ShieldCheck size={14}/> Solo ves los registros asociados a tu cuenta.</span></section> : <><div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> {new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).replace(/^\p{L}/u, letter => letter.toLocaleUpperCase('es-CO'))}</div><h1>Buenos días, {user?.name?.split(/\s+/)[0] || ''} <span className="wave">✳</span></h1><p className="welcome-sub">Resumen actualizado con los registros de tu colegio.</p></div><div className="welcome-actions"><button className="button button-primary" onClick={() => { setActive('Estudiantes'); setEditingStudent(null); setStudentDialog(true) }}><Plus size={17}/> Nuevo estudiante</button></div></div>
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
    {assessmentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAssessmentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-dialog-title"><div className="dialog-heading"><div><h2 id="assessment-dialog-title">Nueva evaluación</h2><p>{selectedGradeAssignment?.courseName} · {selectedGradeAssignment?.subject} · {gradePeriod}</p></div><button className="icon-btn" onClick={() => setAssessmentDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createAssessment}><label>Nombre de la evaluación<input name="title" required minLength="2" maxLength="120" placeholder="Ej. Taller de fracciones" autoComplete="off"/></label><label>Puntaje máximo<input name="maxScore" type="number" required min="0.01" max="10000" step="any" defaultValue="5"/></label><div className="students-scope"><ShieldCheck size={14}/> Define el máximo según la escala que uses. Cada nota deberá estar entre cero y ese máximo.</div>{gradeError && <div className="login-message login-error" role="alert">{gradeError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setAssessmentDialog(false)}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15}/> Crear evaluación</button></div></form></section></div>}
    {enrollmentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !enrollmentBusy) setEnrollmentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="enrollment-dialog-title"><div className="dialog-heading"><div><h2 id="enrollment-dialog-title">Nueva solicitud de matrícula</h2><p>Completa la información del aspirante y los documentos faltantes.</p></div><button className="icon-btn" onClick={() => setEnrollmentDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createEnrollmentRequest}><label>Nombre completo del estudiante<input name="studentName" required minLength="2" maxLength="100" placeholder="Nombre y apellidos"/></label><div className="form-row"><label>Documento<input name="document" required maxLength="30" placeholder="Identificación"/></label><label>Grado solicitado<input name="gradeRequested" required maxLength="40" placeholder="Ej. 6° A"/></label></div><label>Año lectivo<input name="academicYear" required pattern="[0-9]{4}-[0-9]{4}" defaultValue={`${new Date().getFullYear()}-${new Date().getFullYear()+1}`}/></label><div className="form-row"><label>Nombre del acudiente<input name="guardianName" required maxLength="100" placeholder="Nombre completo"/></label><label>Teléfono<input name="guardianPhone" type="tel" maxLength="25" placeholder="Opcional"/></label></div><label>Documentos pendientes <span className="optional-label">SEPARADOS POR COMAS</span><input name="pendingDocuments" maxLength="1000" placeholder="Registro civil, certificado de notas"/></label><label>Observaciones<textarea name="notes" maxLength="1000" rows="3" placeholder="Opcional"/></label>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setEnrollmentDialog(false)} disabled={enrollmentBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={enrollmentBusy}>{enrollmentBusy ? 'Guardando…' : <><Check size={15}/> Crear solicitud</>}</button></div></form></section></div>}
    {transferTarget && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !enrollmentBusy) setTransferTarget(null) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title"><div className="dialog-heading"><div><h2 id="transfer-dialog-title">Trasladar estudiante</h2><p>{transferTarget.studentName} · {transferTarget.academicYear} · {transferTarget.courseName || 'Curso sin asignar'}</p></div><button className="icon-btn" onClick={() => setTransferTarget(null)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={transferStudent}><label>Curso destino<select name="courseId" required defaultValue=""><option value="" disabled>Selecciona el curso destino</option>{transferCourses.filter(course => course.id !== transferTarget.courseId).map(course => <option key={course.id} value={course.id}>{course.name} · {course.grade}</option>)}</select></label>{transferCourses.filter(course => course.id !== transferTarget.courseId).length === 0 && <div className="login-message login-info">No hay otro curso activo para este mismo año lectivo.</div>}<label>Fecha efectiva<input name="effectiveDate" type="date" required defaultValue={getLocalDate()}/></label><label>Observación<textarea name="notes" maxLength="1000" rows="3" placeholder="Motivo o detalle del traslado"/></label>{enrollmentError && <div className="login-message login-error" role="alert">{enrollmentError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setTransferTarget(null)} disabled={enrollmentBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={enrollmentBusy || !transferCourses.some(course => course.id !== transferTarget.courseId)}>{enrollmentBusy ? 'Guardando…' : <><Check size={15}/> Registrar traslado</>}</button></div></form></section></div>}
    {historyCourse && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHistoryCourse(null) }}><section className="student-dialog course-history-dialog" role="dialog" aria-modal="true" aria-labelledby="course-history-title"><div className="dialog-heading"><div><h2 id="course-history-title">Historial del curso</h2><p>{historyCourse.name} · {historyCourse.grade} · {historyCourse.academicYear}{historyCourse.isActive ? '' : ' · Archivado'}</p></div><button className="icon-btn" onClick={() => setHistoryCourse(null)} aria-label="Cerrar historial"><X size={19}/></button></div><div className="course-history-tabs"><button className={historyKind === 'attendance' ? 'history-tab-selected' : ''} onClick={() => { setHistoryKind('attendance'); loadCourseHistory(historyCourse, 'attendance', 0) }}><CalendarDays size={15}/> Asistencia</button><button className={historyKind === 'grades' ? 'history-tab-selected' : ''} onClick={() => { setHistoryKind('grades'); loadCourseHistory(historyCourse, 'grades', 0) }}><BookOpen size={15}/> Calificaciones</button></div><div className="course-history-body">{historyError && <div className="login-message login-error" role="alert">{historyError}</div>}{historyLoading ? <div className="students-empty">Cargando historial…</div> : historyRecords.length ? historyKind === 'attendance' ? <div className="student-table-wrap history-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>FECHA</th><th>ESTADO</th><th>REGISTRÓ</th><th>GUARDADO</th></tr></thead><tbody>{historyRecords.map((record,index) => <tr key={`${record.studentName}-${record.attendanceDate}-${index}`}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.grade}</small></td><td>{record.attendanceDate}</td><td><span className={`student-status ${record.status === 'Presente' || record.status === 'Tarde' ? 'status-active' : 'status-inactive'}`}>{record.status}</span></td><td>{record.markedBy}</td><td>{new Date(record.markedAt).toLocaleString('es-CO')}</td></tr>)}</tbody></table></div> : <div className="student-table-wrap history-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>EVALUACIÓN</th><th>PERIODO</th><th>NOTA</th><th>OBSERVACIÓN</th><th>ACTUALIZÓ</th></tr></thead><tbody>{historyRecords.map((record,index) => <tr key={`${record.studentName}-${record.assessmentTitle}-${index}`}><td><strong>{record.studentName}</strong><small className="history-secondary">{record.grade}</small></td><td><strong>{record.assessmentTitle}</strong><small className="history-secondary">{record.subject}</small></td><td>{record.period}</td><td>{record.score} / {record.maxScore}</td><td>{record.comment || '—'}</td><td><strong>{record.updatedBy}</strong><small className="history-secondary">{new Date(record.updatedAt).toLocaleString('es-CO')}</small></td></tr>)}</tbody></table></div> : <div className="students-empty"><span className="empty-icon"><FileText size={22}/></span><strong>No hay registros de {historyKind === 'attendance' ? 'asistencia' : 'calificaciones'} todavía</strong><p>Los datos históricos aparecerán aquí cuando existan registros asociados al curso.</p></div>}</div><div className="course-history-footer"><span>{historyTotal ? `Mostrando ${historyOffset + 1}–${Math.min(historyOffset + historyRecords.length, historyTotal)} de ${historyTotal}` : 'Sin registros'}</span><div><button className="button button-soft" disabled={historyLoading || historyOffset === 0} onClick={() => loadCourseHistory(historyCourse, historyKind, Math.max(0, historyOffset - 25))}>Anterior</button><button className="button button-soft" disabled={historyLoading || historyOffset + historyRecords.length >= historyTotal} onClick={() => loadCourseHistory(historyCourse, historyKind, historyOffset + 25)}>Siguiente</button></div></div></section></div>}
    {courseDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCourseDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title"><div className="dialog-heading"><div><h2 id="course-dialog-title">{editingCourse ? 'Editar curso' : 'Crear curso'}</h2><p>Registra el grupo y el año lectivo.</p></div><button className="icon-btn" onClick={() => { setCourseDialog(false); setEditingCourse(null) }} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={saveCourse}><label>Nombre del curso<input name="name" required minLength="2" maxLength="80" placeholder="Ej. 6° A" defaultValue={editingCourse?.name || ''}/></label><label>Grado o grupo<input name="grade" required minLength="2" maxLength="40" placeholder="Debe coincidir con el grado de los estudiantes" defaultValue={editingCourse?.grade || ''}/></label><label>Año lectivo<input name="academicYear" required pattern="[0-9]{4}-[0-9]{4}" defaultValue={editingCourse?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear()+1}`} placeholder="2026-2027"/></label>{courseError && <div className="login-message login-error" role="alert">{courseError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setCourseDialog(false); setEditingCourse(null) }}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15}/> {editingCourse ? 'Guardar cambios' : 'Guardar curso'}</button></div></form></section></div>}
    {assignmentCourse && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAssignmentCourse(null) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title"><div className="dialog-heading"><div><h2 id="assignment-dialog-title">{editingAssignment ? 'Editar asignación' : 'Asignar docente'}</h2><p>{assignmentCourse.name} · {assignmentCourse.academicYear}</p></div><button className="icon-btn" onClick={() => { setAssignmentCourse(null); setEditingAssignment(null) }} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={assignTeacher}><label>Docente<select name="teacherId" required defaultValue={editingAssignment?.id || ''}><option value="" disabled>Selecciona docente</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label><label>Asignatura<select name="subject" required defaultValue={editingAssignment ? (commonSubjects.includes(editingAssignment.subject) ? editingAssignment.subject : '__otra__') : ''} onChange={event => setIsCustomSubject(event.target.value === '__otra__')}><option value="" disabled>Selecciona asignatura</option>{commonSubjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}<option value="__otra__">Otra asignatura…</option></select></label>{isCustomSubject && <label>Nombre de la asignatura<input name="customSubject" required minLength="2" maxLength="80" placeholder="Escribe el nombre" autoComplete="off" defaultValue={editingAssignment?.subject || ''}/></label>}{teachers.length === 0 && <div className="login-message login-info">Primero crea y activa una cuenta con rol Docente en «Usuarios y accesos».</div>}{courseError && <div className="login-message login-error" role="alert">{courseError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setAssignmentCourse(null); setEditingAssignment(null) }}>Cancelar</button><button type="submit" className="button button-primary" disabled={!teachers.length}><Check size={15}/> {editingAssignment ? 'Guardar cambios' : 'Asignar'}</button></div></form></section></div>}
    {accountDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !accountBusy) setAccountDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><div className="dialog-heading"><div><h2 id="account-dialog-title">{editingAccount ? 'Editar cuenta' : 'Crear acceso al colegio'}</h2><p>{editingAccount ? 'Actualiza los datos y permisos de esta cuenta.' : 'La persona iniciará sesión con el colegio, correo y contraseña inicial.'}</p></div><button className="icon-btn" onClick={() => setAccountDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> La cuenta queda asociada únicamente a {user?.school?.name || 'este colegio'}.</div><form onSubmit={saveAccount}><label>Nombre completo<input name="name" required minLength="2" maxLength="100" autoComplete="off" placeholder="Nombre y apellidos" defaultValue={editingAccount?.name || ''}/></label><label>Correo electrónico<input name="email" type="email" required maxLength="254" autoComplete="off" placeholder="persona@colegio.edu.co" defaultValue={editingAccount?.email || ''}/></label><label>Rol de acceso{editingAccount?.id === user?.id && <input type="hidden" name="role" value={newAccountRole}/>}<select name="role" value={newAccountRole} disabled={editingAccount?.id === user?.id} onChange={event => setNewAccountRole(event.target.value)}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>{['acudiente', 'estudiante'].includes(newAccountRole) && <fieldset className="student-link-fieldset"><legend>{newAccountRole === 'acudiente' ? 'Estudiantes a cargo' : 'Registro del estudiante'}</legend>{linkableStudents.length ? linkableStudents.map((student, index) => <label className="student-link-option" key={student.id}><input type={newAccountRole === 'estudiante' ? 'radio' : 'checkbox'} name="studentIds" value={student.id} defaultChecked={editingAccount?.studentIds?.includes(student.id)} required={newAccountRole === 'estudiante' && index === 0}/><span><strong>{student.name}</strong><small>{student.document} · {student.grade}</small></span></label>) : <p>No hay estudiantes activos para asociar. Registra primero al estudiante en el módulo Estudiantes.</p>}</fieldset>}<label>{editingAccount ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} <span className="optional-label">12 CARACTERES MÍNIMO</span><input name="password" type="password" required={!editingAccount} minLength="12" maxLength="128" autoComplete="new-password" placeholder={editingAccount ? 'Déjala vacía para conservarla' : 'Contraseña temporal segura'}/></label><p className="users-footnote">{editingAccount ? 'Déjala vacía para conservar la contraseña actual.' : 'Comparte la contraseña inicial directamente por un canal seguro.'}</p>{accountError && <div className="login-message login-error" role="alert">{accountError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setAccountDialog(false)} disabled={accountBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={accountBusy}>{accountBusy ? 'Guardando…' : <><Check size={15}/> {editingAccount ? 'Guardar cambios' : 'Crear cuenta'}</>}</button></div></form></section></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
