import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { extname, resolve, sep } from 'node:path'
import { db, logAudit, migrate, databaseType } from './db.js'

const scrypt = promisify(scryptCallback)
const port = Number(process.env.PORT || process.env.API_PORT || 3001)
const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : ''
const sessionTtl = 8 * 60 * 60 * 1000
const loginAttempts = new Map()
const accountRoles = new Set(['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'orientacion', 'tesoreria', 'acudiente', 'estudiante'])
const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...headers })
  response.end(JSON.stringify(body))
}
const readBody = async (request) => {
  let data = ''
  for await (const chunk of request) {
    data += chunk
    if (data.length > 128 * 1024) throw Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 })
  }
  try { return JSON.parse(data || '{}') } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }) }
}
const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const hashPassword = async password => {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}
const verifyPassword = async (password, stored) => {
  const [saltHex, hashHex] = String(stored).split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
const cookieToken = request => request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('educa_session='))?.slice('educa_session='.length) || ''
const hashToken = token => createHash('sha256').update(token).digest('hex')
const getSession = async request => {
  const token = cookieToken(request)
  if (!token || token.length > 200) return null
  return db.get(`SELECT u.id, u.school_id, u.email, u.full_name, u.role, s.name AS school_name, s.slug AS school_slug
    FROM sessions x JOIN users u ON x.user_id = u.id JOIN schools s ON s.id = u.school_id
    WHERE x.token_hash = ? AND x.expires_at > ? AND u.is_active = 1`, hashToken(token), Date.now())
}
const sessionCookie = (token, maxAge) => `educa_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie}`
const safeUser = user => ({ id: user.id, email: user.email, name: user.full_name, role: user.role, school: { id: user.school_id, name: user.school_name, slug: user.school_slug } })

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  const method = request.method || 'GET'

  if (method === 'GET' && url.pathname === '/api/health') return json(response, 200, { status: 'ok' })
  if (method === 'GET' && url.pathname === '/api/auth/setup-status') {
    const count = Number((await db.get('SELECT COUNT(*) AS count FROM users')).count)
    return json(response, 200, { setupRequired: count === 0 })
  }
  if (method === 'GET' && url.pathname === '/api/schools') {
    const schools = await db.all('SELECT id, slug, name FROM schools ORDER BY name')
    return json(response, 200, { schools })
  }
  if (method === 'POST' && url.pathname === '/api/auth/setup') {
    if (Number((await db.get('SELECT COUNT(*) AS count FROM users')).count) !== 0) return json(response, 409, { error: 'La configuración inicial ya se completó.' })
    const body = await readBody(request)
    const setupKey = process.env.EDUCA_SETUP_KEY || ''
    if (!setupKey || request.headers['x-setup-key'] !== setupKey) return json(response, 403, { error: 'Clave de configuración incorrecta.' })
    const schoolName = String(body.schoolName || '').trim()
    const adminName = String(body.adminName || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (schoolName.length < 2 || schoolName.length > 120 || adminName.length < 2 || adminName.length > 100) return json(response, 400, { error: 'Revisa el nombre del colegio y del administrador.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(response, 400, { error: 'Ingresa un correo válido.' })
    if (password.length < 12 || password.length > 128) return json(response, 400, { error: 'La contraseña inicial debe tener al menos 12 caracteres.' })
    let slug = slugify(schoolName) || 'colegio'
    if (await db.get('SELECT 1 FROM schools WHERE slug = ?', slug)) slug = `${slug}-${randomBytes(3).toString('hex')}`
    const schoolId = randomUUID()
    const userId = randomUUID()
    const passwordHash = await hashPassword(password)
    await db.transaction(async tx => {
      await tx.run('INSERT INTO schools (id, slug, name) VALUES (?, ?, ?)', schoolId, slug, schoolName)
      await tx.run('INSERT INTO users (id, school_id, email, full_name, password_hash) VALUES (?, ?, ?, ?, ?)', userId, schoolId, email, adminName, passwordHash)
      await tx.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', schoolId, userId, 'initial_setup')
    })
    return json(response, 201, { created: true, school: { id: schoolId, name: schoolName, slug }, message: 'Configuración inicial completada. Ya puedes iniciar sesión.' })
  }
  if (method === 'POST' && url.pathname === '/api/auth/login') {
    const address = request.socket.remoteAddress || 'unknown'
    const attempts = loginAttempts.get(address) || { count: 0, until: 0 }
    if (attempts.until > Date.now()) return json(response, 429, { error: 'Demasiados intentos. Espera unos minutos.' }, { 'Retry-After': String(Math.ceil((attempts.until - Date.now()) / 1000)) })
    const body = await readBody(request)
    const slug = slugify(String(body.school || '').trim())
    const email = String(body.email || '').trim().toLowerCase()
    const user = await db.get(`SELECT u.*, s.name AS school_name, s.slug AS school_slug FROM users u JOIN schools s ON s.id = u.school_id
      WHERE s.slug = ? AND u.email = ? AND u.is_active = 1`, slug, email)
    const matched = await verifyPassword(String(body.password || ''), user?.password_hash || '00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')
    if (!user || !matched) {
      attempts.count += 1
      if (attempts.count >= 5) { attempts.count = 0; attempts.until = Date.now() + 5 * 60_000 }
      loginAttempts.set(address, attempts)
      return json(response, 401, { error: 'No pudimos validar esos datos. Revisa el colegio, el correo y la contraseña.' })
    }
    loginAttempts.delete(address)
    await db.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now())
    const token = randomBytes(32).toString('base64url')
    await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', hashToken(token), user.id, Date.now() + sessionTtl)
    await logAudit(user.school_id, user.id, 'login')
    return json(response, 200, { user: safeUser(user) }, { 'Set-Cookie': sessionCookie(token, Math.floor(sessionTtl / 1000)) })
  }
  if (method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await getSession(request)
    return user ? json(response, 200, { user: safeUser(user) }) : json(response, 401, { error: 'Sesión no válida.' }, { 'Set-Cookie': sessionCookie('', 0) })
  }
  if (method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = cookieToken(request)
    if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token))
    return json(response, 200, { loggedOut: true }, { 'Set-Cookie': sessionCookie('', 0) })
  }
  if (!url.pathname.startsWith('/api/')) {
    const distRoot = resolve('./dist')
    let requestedPath
    try { requestedPath = decodeURIComponent(url.pathname) } catch { return json(response, 400, { error: 'Ruta inválida.' }) }
    let filePath = resolve(distRoot, `.${requestedPath}`)
    if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${sep}`)) return json(response, 403, { error: 'Ruta no permitida.' })
    if (!extname(filePath)) filePath = resolve(distRoot, 'index.html')
    try {
      const content = await readFile(filePath)
      const contentType = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' })[extname(filePath)] || 'application/octet-stream'
      response.writeHead(200, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' })
      response.end(content)
    } catch { json(response, 404, { error: 'Recurso no encontrado.' }) }
    return
  }
  const user = await getSession(request)
  if (!user) return json(response, 401, { error: 'Inicia sesión para continuar.' })

  if (url.pathname === '/api/dashboard' && method === 'GET') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo el administrador puede consultar este panel.' })
    const date = String(url.searchParams.get('date') || '')
    if (!validDate(date)) return json(response, 400, { error: 'La fecha del panel no es válida.' })
    const activeStudents = Number((await db.get("SELECT COUNT(*) AS count FROM students WHERE school_id = ? AND status = 'Activo'", user.school_id)).count)
    const courses = Number((await db.get('SELECT COUNT(*) AS count FROM courses WHERE school_id = ?', user.school_id)).count)
    const rows = await db.all(`SELECT status, COUNT(*) AS count FROM attendance_records
      WHERE school_id = ? AND attendance_date = ? GROUP BY status`, user.school_id, date)
    const attendance = { total: 0, present: 0, absent: 0, late: 0, justified: 0, rate: null }
    for (const row of rows) {
      const count = Number(row.count)
      attendance.total += count
      if (row.status === 'Presente') attendance.present += count
      if (row.status === 'Ausente') attendance.absent += count
      if (row.status === 'Tarde') attendance.late += count
      if (row.status === 'Justificado') attendance.justified += count
    }
    if (attendance.total) attendance.rate = Math.round(((attendance.present + attendance.late) / attendance.total) * 1000) / 10
    const start = new Date(`${date}T00:00:00.000Z`)
    start.setUTCDate(start.getUTCDate() - 6)
    const startDate = start.toISOString().slice(0, 10)
    const weeklyRows = await db.all(`SELECT attendance_date AS "date", COUNT(*) AS total,
      SUM(CASE WHEN status IN ('Presente','Tarde') THEN 1 ELSE 0 END) AS attended
      FROM attendance_records WHERE school_id = ? AND attendance_date >= ? AND attendance_date <= ?
      GROUP BY attendance_date ORDER BY attendance_date`, user.school_id, startDate, date)
    const byDate = new Map(weeklyRows.map(row => [row.date, { total: Number(row.total), attended: Number(row.attended) }]))
    const weeklyAttendance = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(`${startDate}T12:00:00.000Z`)
      day.setUTCDate(day.getUTCDate() + index)
      const dayKey = day.toISOString().slice(0, 10)
      const values = byDate.get(dayKey) || { total: 0, attended: 0 }
      return { date: dayKey, label: new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(day), total: values.total, rate: values.total ? Math.round((values.attended / values.total) * 1000) / 10 : null }
    })
    return json(response, 200, { date, activeStudents, courses, attendance, weeklyAttendance })
  }

  if (url.pathname === '/api/users' && method === 'GET') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo un administrador puede consultar las cuentas del colegio.' })
    const users = await db.all(`SELECT id, email, full_name AS name, role, is_active AS active, created_at AS "createdAt"
      FROM users WHERE school_id = ? ORDER BY full_name`, user.school_id)
    return json(response, 200, { users })
  }
  if (url.pathname === '/api/users' && method === 'POST') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo un administrador puede crear cuentas.' })
    const body = await readBody(request)
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const role = String(body.role || '')
    const password = String(body.password || '')
    const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds.map(value => String(value)))] : []
    if (name.length < 2 || name.length > 100) return json(response, 400, { error: 'Escribe un nombre entre 2 y 100 caracteres.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(response, 400, { error: 'Ingresa un correo válido.' })
    if (!accountRoles.has(role)) return json(response, 400, { error: 'El rol seleccionado no es válido.' })
    if (password.length < 12 || password.length > 128) return json(response, 400, { error: 'La contraseña inicial debe tener entre 12 y 128 caracteres.' })
    if (role === 'acudiente' && studentIds.length === 0) return json(response, 400, { error: 'Asocia al menos un estudiante a la cuenta del acudiente.' })
    if (role === 'estudiante' && studentIds.length !== 1) return json(response, 400, { error: 'Asocia exactamente un registro a la cuenta del estudiante.' })
    if (!['acudiente', 'estudiante'].includes(role) && studentIds.length) return json(response, 400, { error: 'Este rol no puede asociarse directamente a un estudiante.' })
    for (const studentId of studentIds) {
      if (!await db.get("SELECT id FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", studentId, user.school_id)) return json(response, 400, { error: 'Uno de los estudiantes seleccionados no está activo en este colegio.' })
    }
    const id = randomUUID()
    try {
      const passwordHash = await hashPassword(password)
      await db.transaction(async tx => {
        await tx.run('INSERT INTO users (id, school_id, email, full_name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)', id, user.school_id, email, name, passwordHash, role)
        for (const studentId of studentIds) await tx.run('INSERT INTO user_students (user_id, student_id, relationship) VALUES (?, ?, ?)', id, studentId, role)
      })
    } catch (error) {
      if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya existe una cuenta con ese correo en el colegio.' })
      throw error
    }
    await logAudit(user.school_id, user.id, 'user_created')
    return json(response, 201, { user: { id, email, name, role, active: 1 } })
  }
  const userStatusMatch = url.pathname.match(/^\/api\/users\/([0-9a-f-]{36})\/status$/i)
  if (userStatusMatch && method === 'PATCH') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo un administrador puede cambiar el estado de una cuenta.' })
    const targetId = userStatusMatch[1]
    if (targetId === user.id) return json(response, 400, { error: 'No puedes desactivar tu propia cuenta.' })
    const body = await readBody(request)
    if (typeof body.active !== 'boolean') return json(response, 400, { error: 'Indica el nuevo estado de la cuenta.' })
    const result = await db.run('UPDATE users SET is_active = ? WHERE id = ? AND school_id = ?', body.active ? 1 : 0, targetId, user.school_id)
    if ((result.rowCount ?? result.changes) === 0) return json(response, 404, { error: 'No encontramos esa cuenta en tu colegio.' })
    if (!body.active) await db.run('DELETE FROM sessions WHERE user_id = ?', targetId)
    await logAudit(user.school_id, user.id, body.active ? 'user_activated' : 'user_deactivated')
    return json(response, 200, { id: targetId, active: body.active })
  }

  if (url.pathname === '/api/portal/students' && method === 'GET') {
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'Este portal es solo para acudientes y estudiantes.' })
    const students = await db.all(`SELECT st.id, st.full_name AS name, st.grade, st.status, us.relationship
      FROM user_students us JOIN students st ON st.id = us.student_id
      WHERE us.user_id = ? AND st.school_id = ? ORDER BY st.full_name`, user.id, user.school_id)
    return json(response, 200, { students })
  }
  if (url.pathname === '/api/teachers' && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar docentes.' })
    const teachers = await db.all("SELECT id, full_name AS name FROM users WHERE school_id = ? AND role = 'docente' AND is_active = 1 ORDER BY full_name", user.school_id)
    return json(response, 200, { teachers })
  }

  if (url.pathname === '/api/courses' && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar los cursos.' })
    const courses = await db.all(`SELECT c.id, c.name, c.grade, c.academic_year AS "academicYear",
      COUNT(DISTINCT ct.user_id) AS "teacherCount"
      FROM courses c LEFT JOIN course_teachers ct ON ct.course_id = c.id
      WHERE c.school_id = ? GROUP BY c.id ORDER BY c.academic_year DESC, c.grade`, user.school_id)
    const mapped = await Promise.all(courses.map(async course => ({ ...course, teacherCount: Number(course.teacherCount), teachers: await db.all(`SELECT u.id, u.full_name AS name, ct.subject
      FROM course_teachers ct JOIN users u ON u.id = ct.user_id WHERE ct.course_id = ? ORDER BY u.full_name, ct.subject`, course.id) })))
    return json(response, 200, { courses: mapped })
  }
  if (url.pathname === '/api/courses' && method === 'POST') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear cursos.' })
    const body = await readBody(request)
    const name = String(body.name || '').trim()
    const grade = String(body.grade || '').trim()
    const academicYear = String(body.academicYear || '').trim()
    if (name.length < 2 || name.length > 80 || grade.length < 2 || grade.length > 40 || !/^\d{4}-\d{4}$/.test(academicYear)) return json(response, 400, { error: 'Revisa el curso, el grado y el año lectivo (AAAA-AAAA).' })
    const id = randomUUID()
    try { await db.run('INSERT INTO courses (id, school_id, name, grade, academic_year) VALUES (?, ?, ?, ?, ?)', id, user.school_id, name, grade, academicYear) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya existe un curso para ese grado y año lectivo.' }); throw error }
    await logAudit(user.school_id, user.id, 'course_created')
    return json(response, 201, { course: { id, name, grade, academicYear, teachers: [] } })
  }
  const courseTeacherMatch = url.pathname.match(/^\/api\/courses\/([0-9a-f-]{36})\/teachers$/i)
  if (courseTeacherMatch && method === 'POST') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para asignar docentes.' })
    const body = await readBody(request)
    const teacherId = String(body.teacherId || '')
    const subject = String(body.subject || '').trim()
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ?', courseTeacherMatch[1], user.school_id)
    const teacher = await db.get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'docente' AND is_active = 1", teacherId, user.school_id)
    if (!course || !teacher) return json(response, 404, { error: 'No encontramos el curso o el docente activo en este colegio.' })
    if (subject.length < 2 || subject.length > 80) return json(response, 400, { error: 'Escribe una asignatura válida.' })
    try { await db.run('INSERT INTO course_teachers (course_id, user_id, subject) VALUES (?, ?, ?)', course.id, teacher.id, subject) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ese docente ya tiene asignada esa asignatura en el curso.' }); throw error }
    await logAudit(user.school_id, user.id, 'teacher_assigned')
    return json(response, 201, { assigned: true })
  }
  if (url.pathname === '/api/teacher/courses' && method === 'GET') {
    if (user.role !== 'docente') return json(response, 403, { error: 'Este acceso es solo para docentes.' })
    const courses = await db.all(`SELECT c.id, c.name, c.grade, c.academic_year AS "academicYear", ct.subject,
      (SELECT COUNT(*) FROM students st WHERE st.school_id = c.school_id AND st.grade = c.grade AND st.status = 'Activo') AS "studentCount"
      FROM course_teachers ct JOIN courses c ON c.id = ct.course_id
      WHERE ct.user_id = ? AND c.school_id = ? ORDER BY c.academic_year DESC, c.grade, ct.subject`, user.id, user.school_id)
    return json(response, 200, { courses: courses.map(course => ({ ...course, studentCount: Number(course.studentCount) })) })
  }
  const teacherRosterMatch = url.pathname.match(/^\/api\/teacher\/courses\/([0-9a-f-]{36})\/students$/i)
  if (teacherRosterMatch && method === 'GET') {
    if (user.role !== 'docente') return json(response, 403, { error: 'Este acceso es solo para docentes.' })
    const course = await db.get(`SELECT c.id, c.grade FROM course_teachers ct JOIN courses c ON c.id = ct.course_id
      WHERE c.id = ? AND ct.user_id = ? AND c.school_id = ?`, teacherRosterMatch[1], user.id, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso asignado a tu cuenta.' })
    const students = await db.all("SELECT id, full_name AS name, grade, status FROM students WHERE school_id = ? AND grade = ? AND status = 'Activo' ORDER BY full_name", user.school_id, course.grade)
    return json(response, 200, { students })
  }

  if (url.pathname === '/api/attendance' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar asistencia.' })
    const courseId = String(url.searchParams.get('courseId') || '')
    const attendanceDate = String(url.searchParams.get('date') || '')
    if (!validDate(attendanceDate)) return json(response, 400, { error: 'Selecciona una fecha válida.' })
    const course = await db.get('SELECT id, grade, name, academic_year AS "academicYear" FROM courses WHERE id = ? AND school_id = ?', courseId, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', course.id, user.id)) return json(response, 403, { error: 'Ese curso no está asignado a tu cuenta.' })
    const students = await db.all(`SELECT st.id, st.full_name AS name, st.grade, st.status,
      ar.status AS "attendanceStatus", ar.marked_at AS "markedAt"
      FROM students st LEFT JOIN attendance_records ar
      ON ar.student_id = st.id AND ar.course_id = ? AND ar.attendance_date = ?
      WHERE st.school_id = ? AND st.grade = ? AND st.status = 'Activo'
      ORDER BY st.full_name`, course.id, attendanceDate, user.school_id, course.grade)
    return json(response, 200, { course, date: attendanceDate, students })
  }
  if (url.pathname === '/api/attendance' && method === 'POST') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para registrar asistencia.' })
    const body = await readBody(request)
    const courseId = String(body.courseId || '')
    const attendanceDate = String(body.date || '')
    const allowedStatuses = new Set(['Presente', 'Ausente', 'Tarde', 'Justificado'])
    if (!validDate(attendanceDate)) return json(response, 400, { error: 'Selecciona una fecha válida.' })
    if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 500) return json(response, 400, { error: 'Selecciona al menos un estudiante para guardar.' })
    const records = body.records.map(record => ({ studentId: String(record.studentId || ''), status: String(record.status || '') }))
    if (records.some(record => !/^[0-9a-f-]{36}$/i.test(record.studentId) || !allowedStatuses.has(record.status)) || new Set(records.map(record => record.studentId)).size !== records.length) return json(response, 400, { error: 'Revisa los estados de asistencia seleccionados; no se permiten estudiantes repetidos.' })
    const course = await db.get('SELECT id, grade FROM courses WHERE id = ? AND school_id = ?', courseId, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', course.id, user.id)) return json(response, 403, { error: 'Ese curso no está asignado a tu cuenta.' })
    for (const record of records) {
      if (!await db.get("SELECT id FROM students WHERE id = ? AND school_id = ? AND grade = ? AND status = 'Activo'", record.studentId, user.school_id, course.grade)) return json(response, 400, { error: 'Uno de los estudiantes no pertenece a este grupo activo.' })
    }
    await db.transaction(async tx => {
      for (const record of records) await tx.run(`INSERT INTO attendance_records (id, school_id, course_id, student_id, attendance_date, status, marked_by, marked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(course_id, student_id, attendance_date) DO UPDATE SET
          status = excluded.status, marked_by = excluded.marked_by, marked_at = excluded.marked_at`,
        randomUUID(), user.school_id, course.id, record.studentId, attendanceDate, record.status, user.id, new Date().toISOString())
    })
    await logAudit(user.school_id, user.id, 'attendance_saved')
    return json(response, 200, { saved: records.length })
  }

  if (url.pathname === '/api/grades/courses' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const assignments = await db.all(`SELECT c.id AS "courseId", c.name AS "courseName", c.grade,
      c.academic_year AS "academicYear", ct.subject, u.full_name AS "teacherName"
      FROM course_teachers ct JOIN courses c ON c.id = ct.course_id JOIN users u ON u.id = ct.user_id
      WHERE c.school_id = ? AND (? <> 'docente' OR ct.user_id = ?)
      ORDER BY c.academic_year DESC, c.grade, ct.subject, u.full_name`, user.school_id, user.role, user.id)
    return json(response, 200, { assignments })
  }
  if (url.pathname === '/api/grades/assessments' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const courseId = String(url.searchParams.get('courseId') || '')
    const subject = String(url.searchParams.get('subject') || '')
    const period = String(url.searchParams.get('period') || '')
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ?', courseId, user.school_id)
    if (!course || !subject || !period) return json(response, 400, { error: 'Selecciona curso, asignatura y periodo.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, course.id, subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa asignatura en el curso.' })
    const assessments = await db.all(`SELECT id, title, subject, period, max_score AS "maxScore", created_at AS "createdAt"
      FROM grade_assessments WHERE school_id = ? AND course_id = ? AND subject = ? AND period = ?
      ORDER BY created_at DESC`, user.school_id, course.id, subject, period)
    return json(response, 200, { assessments })
  }
  if (url.pathname === '/api/grades/assessments' && method === 'POST') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear evaluaciones.' })
    const body = await readBody(request)
    const courseId = String(body.courseId || '')
    const subject = String(body.subject || '').trim()
    const period = String(body.period || '').trim()
    const title = String(body.title || '').trim()
    const maxScore = Number(body.maxScore)
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ?', courseId, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, course.id, subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa asignatura en el curso.' })
    if (subject.length > 80 || period.length < 2 || period.length > 40 || title.length < 2 || title.length > 120 || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 10000) return json(response, 400, { error: 'Revisa el periodo, el nombre de la evaluación y su puntaje máximo.' })
    const id = randomUUID()
    await db.run('INSERT INTO grade_assessments (id, school_id, course_id, subject, period, title, max_score, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, course.id, subject, period, title, maxScore, user.id)
    await logAudit(user.school_id, user.id, 'grade_assessment_created')
    return json(response, 201, { assessment: { id, courseId, subject, period, title, maxScore } })
  }
  const gradeAssessmentMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})$/i)
  if (gradeAssessmentMatch && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const assessment = await db.get(`SELECT a.id, a.course_id AS "courseId", c.name AS "courseName", c.grade,
      c.academic_year AS "academicYear", a.subject, a.period, a.title, a.max_score AS "maxScore"
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.school_id = ? AND c.school_id = ?`, gradeAssessmentMatch[1], user.school_id, user.school_id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa evaluación en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, assessment.courseId, assessment.subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa evaluación.' })
    const students = await db.all(`SELECT st.id, st.full_name AS name, st.grade, sg.score, sg.comment, sg.updated_at AS "updatedAt"
      FROM students st LEFT JOIN student_grades sg ON sg.student_id = st.id AND sg.assessment_id = ?
      WHERE st.school_id = ? AND st.grade = ? AND st.status = 'Activo' ORDER BY st.full_name`, assessment.id, user.school_id, assessment.grade)
    return json(response, 200, { assessment: { ...assessment, maxScore: Number(assessment.maxScore) }, students: students.map(student => ({ ...student, score: student.score === null ? null : Number(student.score) })) })
  }
  const gradeScoresMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})\/scores$/i)
  if (gradeScoresMatch && method === 'POST') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para registrar calificaciones.' })
    const body = await readBody(request)
    if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 500) return json(response, 400, { error: 'Selecciona al menos una calificación para guardar.' })
    const assessment = await db.get(`SELECT a.id, a.course_id AS "courseId", a.subject, a.max_score AS "maxScore", c.grade
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.school_id = ? AND c.school_id = ?`, gradeScoresMatch[1], user.school_id, user.school_id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa evaluación en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, assessment.courseId, assessment.subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa evaluación.' })
    const maxScore = Number(assessment.maxScore)
    const records = body.records.map(record => ({ studentId: String(record.studentId || ''), score: record.score, comment: String(record.comment || '').trim() }))
    if (records.some(record => !/^[0-9a-f-]{36}$/i.test(record.studentId) || typeof record.score !== 'number' || !Number.isFinite(record.score) || record.score < 0 || record.score > maxScore || record.comment.length > 500) || new Set(records.map(record => record.studentId)).size !== records.length) return json(response, 400, { error: `Revisa las notas: deben estar entre 0 y ${maxScore}, sin estudiantes repetidos.` })
    for (const record of records) if (!await db.get("SELECT id FROM students WHERE id = ? AND school_id = ? AND grade = ? AND status = 'Activo'", record.studentId, user.school_id, assessment.grade)) return json(response, 400, { error: 'Uno de los estudiantes no pertenece a este grupo activo.' })
    await db.transaction(async tx => {
      for (const record of records) await tx.run(`INSERT INTO student_grades (assessment_id, student_id, score, comment, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(assessment_id, student_id) DO UPDATE SET score = excluded.score, comment = excluded.comment, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        assessment.id, record.studentId, record.score, record.comment, user.id, new Date().toISOString())
    })
    await logAudit(user.school_id, user.id, 'grade_records_saved')
    return json(response, 200, { saved: records.length })
  }

  if (url.pathname === '/api/students' && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'El acceso a la lista completa de estudiantes está limitado a administración y secretaría.' })
    const search = `%${String(url.searchParams.get('search') || '').slice(0, 100)}%`
    const status = url.searchParams.get('status') || 'Todos'
    const students = await db.all(`SELECT id, full_name AS name, document, grade, guardian_name AS guardian, guardian_phone AS phone, status, created_at AS "createdAt"
      FROM students WHERE school_id = ? AND (full_name LIKE ? OR document LIKE ? OR grade LIKE ? OR guardian_name LIKE ?)
      AND (? = 'Todos' OR status = ?) ORDER BY created_at DESC LIMIT 500`, user.school_id, search, search, search, search, status, status)
    return json(response, 200, { students })
  }
  if (url.pathname === '/api/students' && method === 'POST') {
    if (user.role !== 'admin' && user.role !== 'secretaria') return json(response, 403, { error: 'No tienes permiso para crear estudiantes.' })
    const body = await readBody(request)
    const name = String(body.name || '').trim()
    const documentNumber = String(body.document || '').trim()
    const grade = String(body.grade || '').trim()
    const guardian = String(body.guardian || '').trim()
    const phone = String(body.phone || '').trim()
    const status = body.status === 'Retirado' ? 'Retirado' : 'Activo'
    if (name.length < 2 || name.length > 100 || !/^[\p{L}\p{N}.-]{3,30}$/u.test(documentNumber) || grade.length < 2 || grade.length > 40 || guardian.length < 2 || guardian.length > 100 || phone.length > 25) return json(response, 400, { error: 'Revisa los campos obligatorios del estudiante.' })
    const id = randomUUID()
    try {
      await db.run('INSERT INTO students (id, school_id, full_name, document, grade, guardian_name, guardian_phone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, name, documentNumber, grade, guardian, phone, status)
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ese documento ya está registrado en este colegio.' })
      throw error
    }
    await logAudit(user.school_id, user.id, 'student_created')
    return json(response, 201, { student: await db.get('SELECT id, full_name AS name, document, grade, guardian_name AS guardian, guardian_phone AS phone, status, created_at AS "createdAt" FROM students WHERE id = ?', id) })
  }
  const studentMatch = url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})$/i)
  if (studentMatch && method === 'PATCH') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para modificar estudiantes.' })
    const id = studentMatch[1]
    const existing = await db.get('SELECT id FROM students WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!existing) return json(response, 404, { error: 'No encontramos ese estudiante en este colegio.' })
    const body = await readBody(request)
    const name = String(body.name || '').trim()
    const documentNumber = String(body.document || '').trim()
    const grade = String(body.grade || '').trim()
    const guardian = String(body.guardian || '').trim()
    const phone = String(body.phone || '').trim()
    const status = String(body.status || '')
    if (name.length < 2 || name.length > 100 || !/^[\p{L}\p{N}.-]{3,30}$/u.test(documentNumber) || grade.length < 2 || grade.length > 40 || guardian.length < 2 || guardian.length > 100 || phone.length > 25 || !['Activo', 'Retirado'].includes(status)) return json(response, 400, { error: 'Revisa los campos obligatorios del estudiante.' })
    try { await db.run('UPDATE students SET full_name = ?, document = ?, grade = ?, guardian_name = ?, guardian_phone = ?, status = ? WHERE id = ? AND school_id = ?', name, documentNumber, grade, guardian, phone, status, id, user.school_id) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ese documento ya está registrado en este colegio.' }); throw error }
    await logAudit(user.school_id, user.id, 'student_updated')
    return json(response, 200, { student: await db.get('SELECT id, full_name AS name, document, grade, guardian_name AS guardian, guardian_phone AS phone, status, created_at AS "createdAt" FROM students WHERE id = ? AND school_id = ?', id, user.school_id) })
  }
  if (studentMatch && method === 'DELETE') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo un administrador puede eliminar estudiantes.' })
    const id = studentMatch[1]
    const existing = await db.get('SELECT id FROM students WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!existing) return json(response, 404, { error: 'No encontramos ese estudiante en este colegio.' })
    await db.transaction(async tx => {
      await tx.run('DELETE FROM user_students WHERE student_id = ?', id)
      await tx.run('DELETE FROM students WHERE id = ? AND school_id = ?', id, user.school_id)
    })
    await logAudit(user.school_id, user.id, 'student_deleted')
    return json(response, 200, { deleted: true })
  }
  if (url.pathname.startsWith('/api/')) return json(response, 404, { error: 'Ruta no encontrada.' })
  return json(response, 404, { error: 'Recurso no encontrado.' })
}

const server = createServer((request, response) => {
  route(request, response).catch(error => {
    console.error('API request error:', error.message)
    if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : 'Error interno del servidor.' })
    else response.destroy()
  })
})

await migrate()
server.listen(port, '0.0.0.0', () => console.log(`Educa API (${databaseType}) disponible en puerto ${port}`))
