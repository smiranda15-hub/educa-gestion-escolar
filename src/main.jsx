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
  { title: 'GENERAL', items: [{ label: 'Resumen', icon: LayoutDashboard }, { label: 'Estudiantes', icon: Users, badge: '2,418' }, { label: 'Matrículas', icon: ClipboardCheck, badge: '12' }, { label: 'Asistencia', icon: CalendarDays }, { label: 'Académico', icon: BookOpen }] },
  { title: 'GESTIÓN', items: [{ label: 'Usuarios y accesos', icon: LockKeyhole }, { label: 'Cursos y docentes', icon: GraduationCap }, { label: 'Mis cursos', icon: BookOpen }, { label: 'Comunicaciones', icon: Bell }, { label: 'Reportes', icon: FileText }] },
]

const roles = [
  { value: 'rectoria', label: 'Rectoría' }, { value: 'coordinacion', label: 'Coordinación' },
  { value: 'secretaria', label: 'Secretaría' }, { value: 'docente', label: 'Docente' },
  { value: 'orientacion', label: 'Orientación' }, { value: 'tesoreria', label: 'Tesorería' },
  { value: 'acudiente', label: 'Acudiente' }, { value: 'estudiante', label: 'Estudiante' },
  { value: 'admin', label: 'Administrador' },
]
const roleName = value => roles.find(role => role.value === value)?.label || value

const agenda = [
  { time: '08:00', title: 'Reunión de coordinación', detail: 'Sala de juntas · Equipo académico', color: 'lavender', initials: 'AC' },
  { time: '10:30', title: 'Entrega de boletines', detail: 'Grado 8° · Sede principal', color: 'mint', initials: '8°' },
  { time: '14:00', title: 'Consejo de padres', detail: 'Auditorio · 24 asistentes', color: 'peach', initials: 'CP' },
]

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
  const [period, setPeriod] = useState('2024 — 2025')
  const [notice, setNotice] = useState('')
  const [students, setStudents] = useState([])
  const [studentDialog, setStudentDialog] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [schoolUsers, setSchoolUsers] = useState([])
  const [accountDialog, setAccountDialog] = useState(false)
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
  const [assignmentCourse, setAssignmentCourse] = useState(null)

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
  const createCourse = async event => {
    event.preventDefault(); setCourseError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) })
      const result = await response.json()
      if (!response.ok) return setCourseError(result.error || 'No se pudo crear el curso.')
      await loadCourses(); setCourseDialog(false); notify('Curso creado.')
    } catch { setCourseError('No se pudo conectar con el servidor.') }
  }
  const assignTeacher = async event => {
    event.preventDefault(); setCourseError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch(`/api/courses/${assignmentCourse.id}/teachers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(values) })
      const result = await response.json()
      if (!response.ok) return setCourseError(result.error || 'No se pudo asignar el docente.')
      setAssignmentCourse(null); await loadCourses(); notify('Docente asignado al curso.')
    } catch { setCourseError('No se pudo conectar con el servidor.') }
  }
  const loadTeacherRoster = async course => {
    const response = await fetch(`/api/teacher/courses/${course.id}/students`, { credentials: 'same-origin' })
    const result = await response.json()
    if (!response.ok) return notify(result.error || 'No se pudo cargar el grupo.')
    setTeacherRoster(result.students || [])
  }
  const createAccount = async (event) => {
    event.preventDefault()
    setAccountError('')
    setAccountBusy(true)
    const formData = new FormData(event.currentTarget)
    const form = { ...Object.fromEntries(formData.entries()), studentIds: formData.getAll('studentIds') }
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(form) })
      const result = await response.json()
      if (!response.ok) return setAccountError(result.error || 'No se pudo crear la cuenta.')
      await loadUsers()
      setAccountDialog(false)
      notify('Cuenta creada para este colegio.')
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
        {navGroups.map(group => <section className="nav-section" key={group.title}><div className="nav-heading">{group.title}</div>{group.items.filter(item => (item.label !== 'Usuarios y accesos' || user?.role === 'admin') && (item.label !== 'Cursos y docentes' || ['admin', 'secretaria'].includes(user?.role)) && (item.label !== 'Mis cursos' || user?.role === 'docente') && (item.label !== 'Estudiantes' || ['admin', 'secretaria'].includes(user?.role))).map(item => <button key={item.label} className={`nav-item ${active === item.label ? 'selected' : ''}`} onClick={() => { setActive(item.label); setMenuOpen(false) }}><item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}</button>)}</section>)}
        <div className="sidebar-note"><span className="note-icon"><Sparkles size={16} /></span><div><strong>Todo en orden</strong><p>Tu institución está al día.</p></div><ArrowRight size={15} className="note-arrow" /></div>
      </div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => notify('La configuración estará disponible próximamente.')}><Settings2 size={18} /><span>Configuración</span></button><div className="user-card"><div className="user-avatar">{user?.name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es') || 'U'}</div><div className="user-copy"><strong>{user?.name || 'Usuario'}</strong><span>{user?.role === 'admin' ? 'Administrador' : user?.role || 'Personal'}</span></div><button className="logout-button" title="Cerrar sesión" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); setAuthenticated(false); setUser(null); setStudents([]) }}><MoreHorizontal size={19} className="muted-icon" /></button></div></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="icon-btn mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button><div className="breadcrumb">Institución <ChevronRight size={14} /><span>{active}</span></div></div><div className="top-actions"><label className="search-box"><Search size={17} /><input aria-label="Buscar" placeholder="Buscar estudiante, curso..." value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label><button className="icon-btn notification-btn" aria-label="Notificaciones" onClick={() => notify('No tienes notificaciones nuevas.')}><Bell size={19} /><i /></button><div className="top-divider" /><button className="profile-mini" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); setAuthenticated(false); setUser(null); setStudents([]) }} title="Cerrar sesión"><span className="user-avatar small">{user?.name?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es') || 'U'}</span><ChevronDown size={15} className="muted-icon" /></button></div></header>
      <div className="content-wrap">
        {active === 'Cursos y docentes' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ORGANIZACIÓN ACADÉMICA</div><h1>Cursos y docentes</h1><p className="welcome-sub">Crea los grupos y asigna docentes y asignaturas.</p></div><div className="students-actions"><button className="button button-primary" onClick={() => { setCourseError(''); setCourseDialog(true) }}><Plus size={17}/> Crear curso</button></div></div><div className="students-scope"><ShieldCheck size={14}/> El docente solo consulta estudiantes activos del grado asignado. Las notas y la asistencia se agregarán en una etapa posterior.</div><div className="course-grid">{courses.map(course => <article className="course-card" key={course.id}><div className="course-card-top"><span className="stat-icon violet"><BookOpen size={17}/></span><span className="role-chip">{course.academicYear}</span></div><h2>{course.name}</h2><p>{course.grade}</p><div className="course-teacher-list">{course.teachers.map((teacher, index) => <div key={`${teacher.id}-${teacher.subject}`}><strong>{teacher.name}</strong><span>{teacher.subject}</span></div>)}{!course.teachers.length && <span>Aún no hay docentes asignados.</span>}</div><button className="button button-soft" onClick={() => { setCourseError(''); setAssignmentCourse(course) }}><Plus size={15}/> Asignar docente</button></article>)}{!courses.length && <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>Aún no hay cursos</strong><p>Crea el primer grupo para organizar las asignaturas y asignaciones docentes.</p></div>}</div></section> : active === 'Usuarios y accesos' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ADMINISTRACIÓN DEL COLEGIO</div><h1>Usuarios y accesos</h1><p className="welcome-sub">Crea cuentas por rol y controla quién puede iniciar sesión en este colegio.</p></div><div className="students-actions"><button className="button button-primary" onClick={() => { setAccountError(''); setNewAccountRole('docente'); setAccountDialog(true) }}><Plus size={17}/> Crear cuenta</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Solo administradores pueden gestionar cuentas. Cada persona inicia sesión con el nombre del colegio, su correo y contraseña.</div><div className="students-toolbar"><div className="student-count"><strong>{schoolUsers.length}</strong> {schoolUsers.length === 1 ? 'cuenta del colegio' : 'cuentas del colegio'}</div></div><div className="student-table-wrap"><table className="student-table user-table"><thead><tr><th>PERSONA</th><th>CORREO</th><th>ROL</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{schoolUsers.map(account => <tr key={account.id}><td><span className="student-initials">{account.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{account.name}</strong></td><td>{account.email}</td><td><span className="role-chip">{roleName(account.role)}</span></td><td><span className={`student-status ${Boolean(account.active) ? 'status-active' : 'status-inactive'}`}>{Boolean(account.active) ? 'Activa' : 'Desactivada'}</span></td><td><button className="account-toggle" disabled={account.id === user?.id} onClick={() => setAccountActive(account)}>{account.id === user?.id ? 'Tu cuenta' : Boolean(account.active) ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table>{schoolUsers.length === 0 && <div className="students-empty"><span className="empty-icon"><Users size={22}/></span><strong>No se pudieron cargar las cuentas</strong><p>Vuelve a entrar en esta sección o revisa la conexión con el servidor.</p></div>}</div><p className="users-footnote">La contraseña inicial se define al crear cada cuenta. La recuperación de contraseñas todavía no está disponible.</p></section> : active === 'Estudiantes' ? <section className="students-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN ACADÉMICA</div><h1>Estudiantes</h1><p className="welcome-sub">Consulta y administra los registros de estudiantes.</p></div><div className="students-actions"><button className="button button-soft" onClick={exportStudents}><Download size={16}/> Exportar CSV</button><button className="button button-primary" onClick={() => { setEditingStudent(null); setStudentDialog(true) }}><Plus size={17}/> Nuevo estudiante</button></div></div><div className="students-scope"><ShieldCheck size={14}/> Los registros se guardan en la base del colegio y solo el personal autorizado debe acceder.</div><div className="students-toolbar"><div className="student-count"><strong>{students.length}</strong> {students.length === 1 ? 'estudiante registrado' : 'estudiantes registrados'}</div><label className="student-filter">Estado <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>Todos</option><option>Activo</option><option>Retirado</option></select></label></div><div className="student-table-wrap"><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>DOCUMENTO</th><th>GRADO / CURSO</th><th>ACUDIENTE</th><th>TELÉFONO</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{visibleStudents.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.document}</td><td>{student.grade}</td><td>{student.guardian}</td><td>{student.phone || '—'}</td><td><span className={`student-status ${student.status === 'Activo' ? 'status-active' : 'status-inactive'}`}>{student.status}</span></td><td><div className="table-row-actions"><button className="account-toggle" onClick={() => { setEditingStudent(student); setStudentDialog(true) }}><Pencil size={14}/> Editar</button>{user?.role === 'admin' && <button className="account-toggle delete-student-action" onClick={() => deleteStudent(student)}><Trash2 size={14}/> Eliminar</button>}</div></td></tr>)}</tbody></table>{visibleStudents.length === 0 && <div className="students-empty"><span className="empty-icon"><Users size={22}/></span><strong>{students.length ? 'No hay resultados' : 'Aún no hay estudiantes'}</strong><p>{students.length ? 'Prueba con otra búsqueda o cambia el filtro de estado.' : 'Registra un estudiante para empezar a organizar los datos.'}</p>{!students.length && <button className="button button-primary" onClick={() => setStudentDialog(true)}><Plus size={16}/> Crear primer registro</button>}</div>}</div></section> : active === 'Mis cursos' && user?.role === 'docente' ? <section className="students-page users-page"><div className="students-title"><div><div className="eyebrow"><span className="live-dot"/> ESPACIO DOCENTE</div><h1>Mis cursos</h1><p className="welcome-sub">Consulta los grupos y estudiantes asignados a tu cuenta.</p></div></div><div className="teacher-course-grid">{teacherCourses.map(course => <article className="course-card teacher-course-card" key={`${course.id}-${course.subject}`}><div className="course-card-top"><span className="stat-icon violet"><BookOpen size={17}/></span><span className="role-chip">{course.academicYear}</span></div><h2>{course.name}</h2><p>{course.grade} · {course.subject}</p><div className="course-roster-count"><Users size={16}/> {course.studentCount} estudiantes activos</div><button className="button button-primary" onClick={() => loadTeacherRoster(course)}>Ver lista de estudiantes</button></article>)}{!teacherCourses.length && <div className="students-empty"><span className="empty-icon"><BookOpen size={22}/></span><strong>No tienes cursos asignados</strong><p>Solicita al administrador que te asigne un curso y una asignatura.</p></div>}</div>{teacherRoster.length > 0 && <div className="student-table-wrap teacher-roster"><h2>Estudiantes del grupo</h2><table className="student-table"><thead><tr><th>ESTUDIANTE</th><th>GRADO</th><th>ESTADO</th></tr></thead><tbody>{teacherRoster.map(student => <tr key={student.id}><td><span className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</span><strong>{student.name}</strong></td><td>{student.grade}</td><td><span className="student-status status-active">{student.status}</span></td></tr>)}</tbody></table></div>}</section> : user?.role !== 'admin' ? <section className="role-home"><div className="role-home-icon"><LockKeyhole size={21}/></div><div className="eyebrow">ACCESO DEL COLEGIO</div><h1>Hola, {user?.name?.split(/\s+/)[0]}</h1><p>Tu cuenta tiene el rol de <strong>{roleName(user?.role)}</strong>.</p>{['acudiente', 'estudiante'].includes(user?.role) ? portalStudents.length ? <div className="portal-student-list">{portalStudents.map(student => <article className="portal-student-card" key={student.id}><div className="student-initials">{student.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase()}</div><div><strong>{student.name}</strong><span>{student.relationship === 'acudiente' ? 'Estudiante a cargo' : 'Mi registro'} · {student.grade} · {student.status}</span></div></article>)}</div> : <div className="login-message login-info">Tu cuenta aún no está vinculada a un estudiante. Contacta al administrador del colegio.</div> : <div className="login-message login-info">Abre «Mis cursos» para consultar tus grupos asignados.</div>}<span className="role-home-note"><ShieldCheck size={14}/> Solo ves los registros asociados a tu cuenta.</span></section> : <><div className="welcome-row"><div><div className="eyebrow"><span className="live-dot" /> MIÉRCOLES, 22 DE ENERO DE 2025</div><h1>Buenos días, {user?.name?.split(/\s+/)[0] || ""} <span className="wave">✳</span></h1><p className="welcome-sub">Aquí tienes el resumen de tu institución para hoy.</p></div><div className="welcome-actions"><button className="button button-soft" onClick={() => notify('Preparando el reporte del periodo.')}><Download size={16} /> Exportar</button><button className="button button-primary" onClick={() => { setActive('Estudiantes'); setStudentDialog(true) }}><Plus size={17} /> Nuevo estudiante</button></div></div>
        <div className="period-toolbar"><div className="period-label"><CalendarDays size={16} /><span>Año lectivo</span><button className="period-select" onClick={() => setPeriod(period === '2024 — 2025' ? '2025 — 2026' : '2024 — 2025')}>{period}<ChevronDown size={15} /></button></div><span className="sample-notice">Vista de muestra · Sin datos reales</span><button className="filter-button" onClick={() => notify('Selecciona los filtros en cada módulo.')}><SlidersHorizontal size={15} /> Filtros <span className="filter-count">2</span></button></div>
        <section className="stats-grid" aria-label="Indicadores escolares">
          <article className="stat-card"><div className="stat-top"><span>Estudiantes matriculados</span><span className="stat-icon blue"><Users size={17} /></span></div><div className="stat-number">2,418</div><div className="stat-foot"><span className="trend positive"><ArrowUpRight size={14} /> 8.2%</span><span>vs. año anterior</span><span className="sparkline spark-blue"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></div></article>
          <article className="stat-card"><div className="stat-top"><span>Asistencia de hoy</span><span className="stat-icon green"><Activity size={17} /></span></div><div className="stat-number">94.6<span className="unit">%</span></div><div className="stat-foot"><span className="trend positive"><ArrowUpRight size={14} /> 2.4%</span><span>vs. semana pasada</span><span className="sparkline spark-green"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></div></article>
          <article className="stat-card"><div className="stat-top"><span>Matrículas pendientes</span><span className="stat-icon amber"><ClipboardCheck size={17} /></span></div><div className="stat-number">12</div><div className="stat-foot"><span className="trend caution"><Clock3 size={13} /> 5 urgentes</span><span>requieren atención</span><span className="sparkline spark-amber"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></div></article>
          <article className="stat-card"><div className="stat-top"><span>Cursos activos</span><span className="stat-icon violet"><BookOpen size={17} /></span></div><div className="stat-number">36</div><div className="stat-foot"><span className="trend neutral"><Check size={13} /> Completo</span><span>en 3 sedes</span><span className="sparkline spark-violet"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></span></div></article>
        </section>
        <section className="main-grid">
          <article className="panel attendance-panel"><div className="panel-heading"><div><h2>Asistencia semanal</h2><p>Porcentaje de asistencia · último periodo</p></div><button className="select-small" onClick={() => notify('Mostrando el último periodo registrado.')}>Esta semana <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-dot blue-dot" /> Asistencia</span><span><i className="legend-dot gray-dot" /> Meta institucional</span></div><div className="chart-area"><div className="y-axis"><span>100%</span><span>90%</span><span>80%</span><span>70%</span></div><div className="chart-main"><div className="chart-lines"><i/><i/><i/><i/></div><div className="target-line"><span>Meta 90%</span></div><svg className="chart-svg" viewBox="0 0 620 184" preserveAspectRatio="none" aria-label="Asistencia de lunes a viernes"><defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6f72e9" stopOpacity=".18"/><stop offset="100%" stopColor="#6f72e9" stopOpacity=".01"/></linearGradient></defs><path d="M0,96 C45,88 52,76 103,82 S160,104 207,72 S263,51 310,65 S368,79 413,46 S468,58 517,42 S569,20 620,28 L620,184 L0,184 Z" fill="url(#areaFill)"/><path d="M0,96 C45,88 52,76 103,82 S160,104 207,72 S263,51 310,65 S368,79 413,46 S468,58 517,42 S569,20 620,28" fill="none" stroke="#7073e8" strokeWidth="3" strokeLinecap="round"/><circle cx="0" cy="96" r="4" fill="white" stroke="#7073e8" strokeWidth="2"/><circle cx="155" cy="91" r="4" fill="white" stroke="#7073e8" strokeWidth="2"/><circle cx="310" cy="65" r="4" fill="white" stroke="#7073e8" strokeWidth="2"/><circle cx="465" cy="51" r="4" fill="white" stroke="#7073e8" strokeWidth="2"/><circle cx="620" cy="28" r="4" fill="white" stroke="#7073e8" strokeWidth="2"/></svg><div className="x-axis"><span>Lun 20</span><span>Mar 21</span><span>Mié 22</span><span>Jue 23</span><span>Vie 24</span></div></div></div><div className="chart-caption"><span className="caption-check"><Check size={13} /></span><span>La asistencia está <strong>4.6% por encima</strong> de la meta institucional.</span><button onClick={() => setActive('Asistencia')}>Ver reporte <ArrowRight size={14} /></button></div></article>
          <article className="panel agenda-panel"><div className="panel-heading"><div><h2>Agenda de hoy</h2><p>Miércoles, 22 de enero</p></div><button className="icon-btn subtle-btn" aria-label="Ver calendario" onClick={() => notify('Abriendo calendario escolar.')}><CalendarDays size={17} /></button></div><div className="agenda-list">{agenda.map(event => <div className="agenda-event" key={event.time}><div className="event-time">{event.time}</div><div className={`event-badge ${event.color}`}>{event.initials}</div><div className="event-copy"><strong>{event.title}</strong><span>{event.detail}</span></div><button aria-label={`Opciones: ${event.title}`} className="event-more" onClick={() => notify(`Evento: ${event.title}`)}><MoreHorizontal size={18} /></button></div>)}</div><button className="agenda-link" onClick={() => notify('Abriendo calendario escolar.')}>Ver calendario completo <ArrowRight size={15} /></button></article>
        </section>
        <section className="bottom-grid"><article className="panel attention-panel"><div className="panel-heading"><div><h2>Requiere atención</h2><p>Temas que necesitan seguimiento</p></div><span className="attention-count">3</span></div><div className="attention-row"><span className="attention-indicator amber-indicator"/><div><strong>Solicitudes de matrícula pendientes</strong><span>5 solicitudes llevan más de 3 días</span></div><button onClick={() => setActive('Matrículas')}><ArrowRight size={16}/></button></div><div className="attention-row"><span className="attention-indicator coral-indicator"/><div><strong>Ausencias sin justificar</strong><span>8 estudiantes · requiere seguimiento</span></div><button onClick={() => setActive('Asistencia')}><ArrowRight size={16}/></button></div><div className="attention-row"><span className="attention-indicator violet-indicator"/><div><strong>Documentos por validar</strong><span>14 expedientes incompletos</span></div><button onClick={() => setActive('Estudiantes')}><ArrowRight size={16}/></button></div></article>
          <article className="panel quick-panel"><div className="panel-heading"><div><h2>Accesos rápidos</h2><p>Lo que necesitas, a un clic</p></div><span className="quick-spark"><Sparkles size={17}/></span></div><div className="quick-grid"><button onClick={() => notify('El registro de estudiantes estará disponible próximamente.')}><span className="quick-icon q-blue"><Users size={17}/></span><strong>Registrar estudiante</strong><ArrowRight size={14}/></button><button onClick={() => notify('La toma de asistencia estará disponible próximamente.')}><span className="quick-icon q-green"><ClipboardCheck size={17}/></span><strong>Tomar asistencia</strong><ArrowRight size={14}/></button><button onClick={() => notify('El envío de comunicados estará disponible próximamente.')}><span className="quick-icon q-amber"><Bell size={17}/></span><strong>Enviar comunicado</strong><ArrowRight size={14}/></button><button onClick={() => notify('La exportación de reportes estará disponible próximamente.')}><span className="quick-icon q-violet"><FileText size={17}/></span><strong>Generar reporte</strong><ArrowRight size={14}/></button></div></article></section>
        <footer className="footer"><span>© 2025 Educa · Gestión escolar</span><span><ShieldCheck size={14}/> Plataforma protegida <i/> Última actualización hace 2 min</span></footer></>}
      </div>
    </main>
    {notice && <div className="toast"><span><Check size={15}/></span>{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={15}/></button></div>}
    {studentDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setStudentDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><div><h2 id="dialog-title">{editingStudent ? 'Editar estudiante' : 'Nuevo estudiante'}</h2><p>Completa la información básica del registro.</p></div><button className="icon-btn" onClick={() => { setStudentDialog(false); setEditingStudent(null) }} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> El registro se guarda en la base de datos del colegio.</div><form onSubmit={saveStudent}><label>Nombre completo<input name="name" required defaultValue={editingStudent?.name || ''} maxLength="100" autoComplete="off" placeholder="Nombre y apellidos"/></label><div className="form-row"><label>Documento<input name="document" required defaultValue={editingStudent?.document || ''} maxLength="30" autoComplete="off" placeholder="Número de identificación"/></label><label>Grado y curso<input name="grade" required defaultValue={editingStudent?.grade || ''} maxLength="40" placeholder="Ej. 6° A"/></label></div><div className="form-row"><label>Acudiente autorizado<input name="guardian" required defaultValue={editingStudent?.guardian || ''} maxLength="100" placeholder="Nombre del acudiente"/></label><label>Teléfono de contacto<input name="phone" type="tel" maxLength="25" autoComplete="off" placeholder="Opcional"/></label></div><label>Estado de matrícula<select name="status" defaultValue={editingStudent?.status || 'Activo'}><option>Activo</option><option>Retirado</option></select></label><div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => { setStudentDialog(false); setEditingStudent(null) }}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15}/> {editingStudent ? 'Guardar cambios' : 'Guardar estudiante'}</button></div></form></section></div>}
    {courseDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCourseDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title"><div className="dialog-heading"><div><h2 id="course-dialog-title">Crear curso</h2><p>Registra el grupo y el año lectivo.</p></div><button className="icon-btn" onClick={() => setCourseDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={createCourse}><label>Nombre del curso<input name="name" required minLength="2" maxLength="80" placeholder="Ej. 6° A"/></label><label>Grado o grupo<input name="grade" required minLength="2" maxLength="40" placeholder="Debe coincidir con el grado de los estudiantes"/></label><label>Año lectivo<input name="academicYear" required pattern="[0-9]{4}-[0-9]{4}" defaultValue={`${new Date().getFullYear()}-${new Date().getFullYear()+1}`} placeholder="2026-2027"/></label>{courseError && <div className="login-message login-error" role="alert">{courseError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setCourseDialog(false)}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15}/> Guardar curso</button></div></form></section></div>}
    {assignmentCourse && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setAssignmentCourse(null) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title"><div className="dialog-heading"><div><h2 id="assignment-dialog-title">Asignar docente</h2><p>{assignmentCourse.name} · {assignmentCourse.academicYear}</p></div><button className="icon-btn" onClick={() => setAssignmentCourse(null)} aria-label="Cerrar"><X size={19}/></button></div><form onSubmit={assignTeacher}><label>Docente<select name="teacherId" required defaultValue=""><option value="" disabled>Selecciona docente</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label><label>Asignatura<input name="subject" required minLength="2" maxLength="80" placeholder="Ej. Matemáticas"/></label>{teachers.length === 0 && <div className="login-message login-info">Primero crea y activa una cuenta con rol Docente en «Usuarios y accesos».</div>}{courseError && <div className="login-message login-error" role="alert">{courseError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setAssignmentCourse(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={!teachers.length}><Check size={15}/> Asignar</button></div></form></section></div>}
    {accountDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !accountBusy) setAccountDialog(false) }}><section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><div className="dialog-heading"><div><h2 id="account-dialog-title">Crear acceso al colegio</h2><p>La persona iniciará sesión con el colegio, correo y contraseña inicial.</p></div><button className="icon-btn" onClick={() => setAccountDialog(false)} aria-label="Cerrar"><X size={19}/></button></div><div className="form-scope"><ShieldCheck size={15}/> La cuenta queda asociada únicamente a {user?.school?.name || 'este colegio'}.</div><form onSubmit={createAccount}><label>Nombre completo<input name="name" required minLength="2" maxLength="100" autoComplete="off" placeholder="Nombre y apellidos"/></label><label>Correo electrónico<input name="email" type="email" required maxLength="254" autoComplete="off" placeholder="persona@colegio.edu.co"/></label><label>Rol de acceso<select name="role" value={newAccountRole} onChange={event => setNewAccountRole(event.target.value)}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>{['acudiente', 'estudiante'].includes(newAccountRole) && <fieldset className="student-link-fieldset"><legend>{newAccountRole === 'acudiente' ? 'Estudiantes a cargo' : 'Registro del estudiante'}</legend>{linkableStudents.length ? linkableStudents.map((student, index) => <label className="student-link-option" key={student.id}><input type={newAccountRole === 'estudiante' ? 'radio' : 'checkbox'} name="studentIds" value={student.id} required={index === 0}/><span><strong>{student.name}</strong><small>{student.document} · {student.grade}</small></span></label>) : <p>No hay estudiantes activos para asociar. Registra primero al estudiante en el módulo Estudiantes.</p>}</fieldset>}<label>Contraseña inicial <span className="optional-label">12 CARACTERES MÍNIMO</span><input name="password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" placeholder="Contraseña temporal segura"/></label><p className="users-footnote">Comparte la contraseña inicial directamente con la persona por un canal seguro. La recuperación de contraseña aún no está disponible.</p>{accountError && <div className="login-message login-error" role="alert">{accountError}</div>}<div className="dialog-actions"><button type="button" className="button button-soft" onClick={() => setAccountDialog(false)} disabled={accountBusy}>Cancelar</button><button type="submit" className="button button-primary" disabled={accountBusy}>{accountBusy ? 'Creando…' : <><Check size={15}/> Crear cuenta</>}</button></div></form></section></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
