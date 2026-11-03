import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { basename, extname, resolve, sep } from 'node:path'
import { db, logAudit, migrate, databaseType } from './db.js'

const scrypt = promisify(scryptCallback)
const port = Number(process.env.PORT || process.env.API_PORT || 3001)
const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : ''
const sessionTtl = 8 * 60 * 60 * 1000
const institutionManagerEmail = 'smiranda15@uan.edu.co'
const loginAttempts = new Map()
const accountRoles = new Set(['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'orientacion', 'tesoreria', 'acudiente', 'estudiante'])
const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const configuredOrigins = new Set((process.env.EDUCA_ALLOWED_ORIGINS || '').split(',').map(value => {
  try { return new URL(value.trim()).origin } catch { return '' }
}).filter(Boolean))
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
const readLargeJsonBody = async (request, maxBytes = 12 * 1024 * 1024) => {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw Object.assign(new Error('El archivo supera el tamaño máximo permitido.'), { status: 413 })
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }) }
}
const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const workFileTypes = new Map([
  ['.pdf', { mime: 'application/pdf', magic: bytes => bytes.subarray(0, 5).toString() === '%PDF-' }],
  ['.png', { mime: 'image/png', magic: bytes => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' }],
  ['.jpg', { mime: 'image/jpeg', magic: bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' }],
  ['.jpeg', { mime: 'image/jpeg', magic: bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' }],
  ['.docx', { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: bytes => bytes.subarray(0, 4).toString('hex') === '504b0304' }],
  ['.xlsx', { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: bytes => bytes.subarray(0, 4).toString('hex') === '504b0304' }],
])
const assessmentImageTypes = new Map([
  ['.jpg', { mime: 'image/jpeg', magic: bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' }],
  ['.jpeg', { mime: 'image/jpeg', magic: bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff' }],
  ['.png', { mime: 'image/png', magic: bytes => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' }],
  ['.webp', { mime: 'image/webp', magic: bytes => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' }],
])
const parseStudentPhoto = value => {
  if (!value || typeof value !== 'object' || typeof value.data !== 'string' || typeof value.fileName !== 'string') return null
  const fileName = basename(value.fileName).slice(0, 120)
  const type = assessmentImageTypes.get(extname(fileName).toLowerCase())
  if (!type || !/^data:image\/(jpeg|png|webp);base64,/.test(value.data)) return null
  const data = Buffer.from(value.data.slice(value.data.indexOf(',') + 1), 'base64')
  if (!data.length || data.length > 2 * 1024 * 1024 || !type.magic(data)) return null
  return { contentType: type.mime, fileName, data }
}
const validGoogleFormsUrl = value => {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === 'forms.gle' || url.hostname === 'forms.google.com' || (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/')))
  } catch { return false }
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
const requestOriginAllowed = request => {
  const rawOrigin = request.headers.origin
  if (!rawOrigin || rawOrigin === 'null') return false
  let origin
  try { origin = new URL(rawOrigin).origin } catch { return false }
  if (configuredOrigins.has(origin)) return true
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim()
  const protocol = String(request.headers['x-forwarded-proto'] || (process.env.NODE_ENV === 'production' ? 'https' : 'http')).split(',')[0].trim().toLowerCase()
  if (!host || !['http', 'https'].includes(protocol)) return false
  return origin === `${protocol}://${host}`
}
const getSession = async request => {
  const token = cookieToken(request)
  if (!token || token.length > 200) return null
  return db.get(`SELECT u.id, u.school_id, u.email, u.full_name, u.role, s.name AS school_name, s.slug AS school_slug,
      s.primary_color AS school_primary_color, s.logo_content_type AS school_logo_content_type
    FROM sessions x JOIN users u ON x.user_id = u.id JOIN schools s ON s.id = u.school_id
    WHERE x.token_hash = ? AND x.expires_at > ? AND u.is_active = 1 AND u.deleted_at IS NULL AND s.is_active = 1 AND s.archived_at IS NULL
      AND (u.role <> 'estudiante' OR NOT EXISTS (SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id WHERE us.user_id = u.id AND us.relationship = 'estudiante' AND st.access_status = 'Suspendido'))`, hashToken(token), Date.now())
}
const sessionCookie = (token, maxAge) => `educa_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie}`
const safeUser = user => ({ id: user.id, email: user.email, name: user.full_name, role: user.role, school: { id: user.school_id, name: user.school_name, slug: user.school_slug, primaryColor: user.school_primary_color || '#6c70df', hasLogo: Boolean(user.school_logo_content_type) } })

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  const method = request.method || 'GET'
  if (url.pathname.startsWith('/api/') && stateChangingMethods.has(method) && !requestOriginAllowed(request)) return json(response, 403, { error: 'Origen de solicitud no autorizado.' })

  if (method === 'GET' && url.pathname === '/api/health') return json(response, 200, { status: 'ok' })
  if (method === 'GET' && url.pathname === '/api/auth/setup-status') {
    const count = Number((await db.get('SELECT COUNT(*) AS count FROM users')).count)
    return json(response, 200, { setupRequired: count === 0 })
  }
  const publicSchoolLogo = url.pathname.match(/^\/api\/schools\/([a-z0-9-]{1,48})\/logo$/i)
  if (method === 'GET' && publicSchoolLogo) {
    const logo = await db.get('SELECT logo_content_type AS "contentType", logo_data AS "fileData" FROM schools WHERE slug = ? AND logo_content_type IS NOT NULL', publicSchoolLogo[1].toLowerCase())
    if (!logo) return json(response, 404, { error: 'Logo institucional no encontrado.' })
    response.writeHead(200, { 'Content-Type': logo.contentType, 'Content-Length': String(logo.fileData.length), 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
    response.end(logo.fileData)
    return
  }
  if (method === 'GET' && url.pathname === '/api/schools') {
    const schools = await db.all('SELECT id, slug, name, contact_email AS "contactEmail", contact_phone AS "contactPhone", address, primary_color AS "primaryColor", logo_content_type AS "logoContentType" FROM schools WHERE is_active = 1 AND archived_at IS NULL ORDER BY name')
    for (const school of schools) school.hasLogo = Boolean(school.logoContentType), delete school.logoContentType
    return json(response, 200, { schools })
  }
  if (url.pathname === '/api/institutions' && method === 'GET') {
    const user = await getSession(request)
    if (!user || user.role !== 'admin' || user.email.toLowerCase() !== institutionManagerEmail) return json(response, 403, { error: 'No tienes permiso para administrar varias instituciones.' })
    const institutions = await db.all(`SELECT s.id, s.slug, s.name, s.contact_email AS "contactEmail", s.contact_phone AS "contactPhone", s.address,
      s.primary_color AS "primaryColor", CASE WHEN s.logo_content_type IS NULL THEN 0 ELSE 1 END AS "hasLogo",
      CASE WHEN s.archived_at IS NOT NULL THEN 'Archivada' WHEN s.is_active = 0 THEN 'Suspendida' ELSE 'Activa' END AS status,
      s.suspension_reason AS "suspensionReason", s.suspended_at AS "suspendedAt",
      (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'admin' AND u.is_active = 1 AND u.deleted_at IS NULL) AS "activeAdmins"
      FROM schools s ORDER BY s.name`)
    return json(response, 200, { institutions })
  }
  if (url.pathname === '/api/institutions' && method === 'POST') {
    const user = await getSession(request)
    if (!user || user.role !== 'admin' || user.email.toLowerCase() !== institutionManagerEmail) return json(response, 403, { error: 'No tienes permiso para crear instituciones.' })
    const body = await readLargeJsonBody(request, 2 * 1024 * 1024)
    const schoolName = String(body.schoolName || '').trim()
    const adminName = String(body.adminName || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const contactEmail = String(body.contactEmail || '').trim().toLowerCase()
    const contactPhone = String(body.contactPhone || '').trim()
    const address = String(body.address || '').trim()
    const primaryColor = String(body.primaryColor || '#6c70df').trim()
    if (schoolName.length < 2 || schoolName.length > 120 || adminName.length < 2 || adminName.length > 100) return json(response, 400, { error: 'Revisa el nombre de la institución y el administrador.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(response, 400, { error: 'Ingresa un correo válido para el administrador.' })
    if (password.length < 12 || password.length > 128) return json(response, 400, { error: 'La contraseña inicial debe tener entre 12 y 128 caracteres.' })
    if (contactEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 254)) return json(response, 400, { error: 'El correo de contacto no es válido.' })
    if (contactPhone.length > 30 || !/^[\d+() .-]*$/.test(contactPhone) || address.length > 240 || !/^#[0-9a-f]{6}$/i.test(primaryColor)) return json(response, 400, { error: 'Revisa el teléfono, la dirección y el color institucional.' })
    let logo = null
    if (body.logo) {
      const fileName = String(body.logo.fileName || '')
      const contentType = String(body.logo.contentType || '')
      const encoded = String(body.logo.fileBase64 || '')
      const allowed = new Map([['.png', ['image/png', bytes => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a']], ['.jpg', ['image/jpeg', bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff']], ['.jpeg', ['image/jpeg', bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff']], ['.webp', ['image/webp', bytes => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP']]])
      const extension = extname(fileName).toLowerCase(), spec = allowed.get(extension)
      if (!spec || contentType !== spec[0] || encoded.length > 1024 * 1024 * 1.38 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return json(response, 400, { error: 'El logo debe ser PNG, JPG o WEBP y pesar máximo 1 MB.' })
      const fileData = Buffer.from(encoded, 'base64')
      if (!fileData.length || fileData.length > 1024 * 1024 || !spec[1](fileData)) return json(response, 400, { error: 'El archivo del logo no es válido.' })
      logo = { fileName: basename(fileName).slice(0, 160), contentType, fileData }
    }
    const slug = slugify(schoolName) || 'colegio'
    if (await db.get('SELECT 1 FROM schools WHERE slug = ?', slug)) return json(response, 409, { error: 'Ya existe una institución con ese nombre o código.' })
    const schoolId = randomUUID(), userId = randomUUID(), passwordHash = await hashPassword(password)
    await db.transaction(async tx => {
      await tx.run('INSERT INTO schools (id, slug, name, contact_email, contact_phone, address, primary_color, logo_content_type, logo_file_name, logo_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', schoolId, slug, schoolName, contactEmail, contactPhone, address, primaryColor.toLowerCase(), logo?.contentType || null, logo?.fileName || null, logo?.fileData || null)
      await tx.run('INSERT INTO users (id, school_id, email, full_name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?) ', userId, schoolId, email, adminName, passwordHash, 'admin')
      await tx.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', schoolId, user.id, 'institution_created')
    })
    return json(response, 201, { created: true, institution: { id: schoolId, slug, name: schoolName, contactEmail, contactPhone, address, primaryColor: primaryColor.toLowerCase(), hasLogo: Boolean(logo) }, message: 'Institución y cuenta administradora creadas.' })
  }
  const institutionSettingsMatch = url.pathname.match(/^\/api\/institutions\/([0-9a-f-]{36})$/i)
  if (institutionSettingsMatch && method === 'PATCH') {
    const user = await getSession(request)
    if (!user || user.role !== 'admin' || user.email.toLowerCase() !== institutionManagerEmail) return json(response, 403, { error: 'No tienes permiso para editar instituciones.' })
    const school = await db.get('SELECT id, slug, logo_content_type AS "logoContentType" FROM schools WHERE id = ?', institutionSettingsMatch[1])
    if (!school) return json(response, 404, { error: 'No encontramos esa institución.' })
    const body = await readLargeJsonBody(request, 2 * 1024 * 1024)
    const name = String(body.name || '').trim(), contactEmail = String(body.contactEmail || '').trim().toLowerCase()
    const contactPhone = String(body.contactPhone || '').trim(), address = String(body.address || '').trim()
    const primaryColor = String(body.primaryColor || '').trim()
    if (name.length < 2 || name.length > 120 || (contactEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 254)) || contactPhone.length > 30 || !/^[\d+() .-]*$/.test(contactPhone) || address.length > 240 || !/^#[0-9a-f]{6}$/i.test(primaryColor)) return json(response, 400, { error: 'Revisa el nombre, correo, teléfono, dirección y color institucional.' })
    let logo = null
    if (body.logo) {
      const fileName = String(body.logo.fileName || ''), contentType = String(body.logo.contentType || ''), encoded = String(body.logo.fileBase64 || '')
      const allowed = new Map([['.png', ['image/png', bytes => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a']], ['.jpg', ['image/jpeg', bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff']], ['.jpeg', ['image/jpeg', bytes => bytes.subarray(0, 3).toString('hex') === 'ffd8ff']], ['.webp', ['image/webp', bytes => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP']]])
      const extension = extname(fileName).toLowerCase(), spec = allowed.get(extension)
      if (!spec || contentType !== spec[0] || encoded.length > 1024 * 1024 * 1.38 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return json(response, 400, { error: 'El logo debe ser PNG, JPG o WEBP y pesar máximo 1 MB.' })
      const fileData = Buffer.from(encoded, 'base64')
      if (!fileData.length || fileData.length > 1024 * 1024 || !spec[1](fileData)) return json(response, 400, { error: 'El archivo del logo no es válido.' })
      logo = { fileName: basename(fileName).slice(0, 160), contentType, fileData }
    }
    await db.transaction(async tx => {
      await tx.run('UPDATE schools SET name = ?, contact_email = ?, contact_phone = ?, address = ?, primary_color = ? WHERE id = ?', name, contactEmail, contactPhone, address, primaryColor.toLowerCase(), school.id)
      if (body.removeLogo === true) await tx.run('UPDATE schools SET logo_content_type = NULL, logo_file_name = NULL, logo_data = NULL WHERE id = ?', school.id)
      if (logo) await tx.run('UPDATE schools SET logo_content_type = ?, logo_file_name = ?, logo_data = ? WHERE id = ?', logo.contentType, logo.fileName, logo.fileData, school.id)
      await tx.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', school.id, user.id, 'institution_branding_updated')
    })
    return json(response, 200, { institution: { id: school.id, slug: school.slug, name, contactEmail, contactPhone, address, primaryColor: primaryColor.toLowerCase(), hasLogo: body.removeLogo === true ? Boolean(logo) : Boolean(logo || school.logoContentType) } })
  }
  const institutionLifecycleMatch = url.pathname.match(/^\/api\/institutions\/([0-9a-f-]{36})\/status$/i)
  if (institutionLifecycleMatch && method === 'PATCH') {
    const user = await getSession(request)
    if (!user || user.role !== 'admin' || user.email.toLowerCase() !== institutionManagerEmail) return json(response, 403, { error: 'No tienes permiso para cambiar el estado de las instituciones.' })
    const body = await readBody(request), institutionId = institutionLifecycleMatch[1]
    const institution = await db.get('SELECT id, is_active AS "isActive", archived_at AS "archivedAt" FROM schools WHERE id = ?', institutionId)
    if (!institution) return json(response, 404, { error: 'No encontramos esa institución.' })
    if (institution.id === user.school_id && body.action !== 'reactivate') return json(response, 400, { error: 'No puedes suspender ni archivar la institución de la sesión con la que administras la plataforma.' })
    const action = String(body.action || '')
    const reason = String(body.reason || '').trim()
    if (action === 'suspend') {
      if (reason.length < 5 || reason.length > 240) return json(response, 400, { error: 'Escribe un motivo de suspensión de 5 a 240 caracteres.' })
      await db.run('UPDATE schools SET is_active = 0, suspension_reason = ?, suspended_at = CURRENT_TIMESTAMP WHERE id = ?', reason, institutionId)
      await db.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE school_id = ?)', institutionId)
      await db.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', institutionId, user.id, 'institution_suspended')
      return json(response, 200, { updated: true, status: 'Suspendida', suspensionReason: reason })
    }
    if (action === 'reactivate') {
      if (institution.archivedAt) return json(response, 409, { error: 'Primero restaura la institución archivada.' })
      await db.run('UPDATE schools SET is_active = 1, suspension_reason = \'\', suspended_at = NULL WHERE id = ?', institutionId)
      await db.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', institutionId, user.id, 'institution_reactivated')
      return json(response, 200, { updated: true, status: 'Activa', suspensionReason: '' })
    }
    if (action === 'archive') {
      if (reason.length < 5 || reason.length > 240) return json(response, 400, { error: 'Escribe un motivo para archivar esta institución.' })
      await db.run('UPDATE schools SET is_active = 0, suspension_reason = ?, suspended_at = CURRENT_TIMESTAMP, archived_at = CURRENT_TIMESTAMP WHERE id = ?', reason, institutionId)
      await db.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE school_id = ?)', institutionId)
      await db.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', institutionId, user.id, 'institution_archived')
      return json(response, 200, { updated: true, status: 'Archivada', suspensionReason: reason })
    }
    if (action === 'restore') {
      await db.run('UPDATE schools SET archived_at = NULL, is_active = 1, suspension_reason = \'\', suspended_at = NULL WHERE id = ?', institutionId)
      await db.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', institutionId, user.id, 'institution_restored')
      return json(response, 200, { updated: true, status: 'Activa', suspensionReason: '' })
    }
    return json(response, 400, { error: 'Acción de institución no válida.' })
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
    const user = await db.get(`SELECT u.*, s.name AS school_name, s.slug AS school_slug,
      s.primary_color AS school_primary_color, s.logo_content_type AS school_logo_content_type FROM users u JOIN schools s ON s.id = u.school_id
      WHERE s.slug = ? AND u.email = ? AND u.is_active = 1 AND u.deleted_at IS NULL AND s.is_active = 1 AND s.archived_at IS NULL`, slug, email)
    const matched = await verifyPassword(String(body.password || ''), user?.password_hash || '00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')
    if (!user || !matched) {
      attempts.count += 1
      if (attempts.count >= 5) { attempts.count = 0; attempts.until = Date.now() + 5 * 60_000 }
      loginAttempts.set(address, attempts)
      return json(response, 401, { error: 'No pudimos validar esos datos. Revisa el colegio, el correo y la contraseña.' })
    }
    if (user.role === 'estudiante' && await db.get("SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id WHERE us.user_id = ? AND us.relationship = 'estudiante' AND st.access_status = 'Suspendido' LIMIT 1", user.id)) return json(response, 403, { error: 'El acceso a la cuenta del estudiante está temporalmente suspendido. Comunícate con la administración del colegio.' })
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
      const contentType = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' })[extname(filePath)] || 'application/octet-stream'
      response.writeHead(200, { 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' })
      response.end(content)
    } catch { json(response, 404, { error: 'Recurso no encontrado.' }) }
    return
  }
  const user = await getSession(request)
  if (!user) return json(response, 401, { error: 'Inicia sesión para continuar.' })

  if (url.pathname === '/api/profile' && method === 'GET') {
    const account = await db.get('SELECT full_name AS name, email, role, contact_phone AS phone, profile_photo_data AS photo FROM users WHERE id = ? AND school_id = ?', user.id, user.school_id)
    let hasPhoto = Boolean(account?.photo)
    if (user.role === 'estudiante') {
      const linked = await db.all(`SELECT st.photo_data AS photo FROM user_students us JOIN students st ON st.id = us.student_id
        WHERE us.user_id = ? AND st.school_id = ? AND us.relationship = 'estudiante' ORDER BY st.full_name LIMIT 2`, user.id, user.school_id)
      hasPhoto = linked.length === 1 && Boolean(linked[0].photo)
    }
    return json(response, 200, { profile: { name: account.name, email: account.email, role: account.role, phone: account.phone || '', hasPhoto } })
  }
  if (url.pathname === '/api/profile/photo' && method === 'GET') {
    let photo
    if (user.role === 'estudiante') {
      const linked = await db.all(`SELECT st.photo_data AS data, st.photo_content_type AS "contentType" FROM user_students us JOIN students st ON st.id = us.student_id
        WHERE us.user_id = ? AND st.school_id = ? AND us.relationship = 'estudiante' ORDER BY st.full_name LIMIT 2`, user.id, user.school_id)
      if (linked.length === 1) photo = linked[0]
    } else photo = await db.get('SELECT profile_photo_data AS data, profile_photo_content_type AS "contentType" FROM users WHERE id = ? AND school_id = ?', user.id, user.school_id)
    if (!photo?.data || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.contentType)) return json(response, 404, { error: 'No hay una foto de perfil configurada.' })
    response.writeHead(200, { 'Content-Type': photo.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
    return response.end(photo.data)
  }
  if (url.pathname === '/api/profile' && method === 'PATCH') {
    const body = await readLargeJsonBody(request, 3 * 1024 * 1024)
    const phone = String(body.phone || '').trim()
    const photo = body.photo ? parseStudentPhoto(body.photo) : null
    if (phone.length > 25 || phone && !/^[+\d\s().-]{5,25}$/.test(phone)) return json(response, 400, { error: 'Revisa el teléfono de contacto.' })
    if (body.photo && !photo) return json(response, 400, { error: 'La foto debe ser JPG, PNG o WEBP válida y no superar 2 MB.' })
    if (body.removePhoto !== true && !photo && !Object.hasOwn(body, 'phone')) return json(response, 400, { error: 'No hay cambios para guardar.' })
    if (user.role === 'estudiante' && (photo || body.removePhoto === true)) {
      const linked = await db.all(`SELECT st.id FROM user_students us JOIN students st ON st.id = us.student_id
        WHERE us.user_id = ? AND st.school_id = ? AND us.relationship = 'estudiante' ORDER BY st.full_name LIMIT 2`, user.id, user.school_id)
      if (linked.length !== 1) return json(response, 409, { error: 'La cuenta de estudiante no tiene un único registro vinculado. Contacta a secretaría.' })
      await db.run('UPDATE users SET contact_phone = ? WHERE id = ? AND school_id = ?', phone, user.id, user.school_id)
      if (photo) await db.run('UPDATE students SET photo_content_type = ?, photo_file_name = ?, photo_data = ? WHERE id = ? AND school_id = ?', photo.contentType, photo.fileName, photo.data, linked[0].id, user.school_id)
      else await db.run('UPDATE students SET photo_content_type = NULL, photo_file_name = NULL, photo_data = NULL WHERE id = ? AND school_id = ?', linked[0].id, user.school_id)
    } else {
      if (photo) await db.run('UPDATE users SET contact_phone = ?, profile_photo_content_type = ?, profile_photo_file_name = ?, profile_photo_data = ? WHERE id = ? AND school_id = ?', phone, photo.contentType, photo.fileName, photo.data, user.id, user.school_id)
      else if (body.removePhoto === true) await db.run('UPDATE users SET contact_phone = ?, profile_photo_content_type = NULL, profile_photo_file_name = NULL, profile_photo_data = NULL WHERE id = ? AND school_id = ?', phone, user.id, user.school_id)
      else await db.run('UPDATE users SET contact_phone = ? WHERE id = ? AND school_id = ?', phone, user.id, user.school_id)
    }
    await logAudit(user.school_id, user.id, 'profile_updated')
    const account = await db.get('SELECT full_name AS name, email, role, contact_phone AS phone FROM users WHERE id = ? AND school_id = ?', user.id, user.school_id)
    const currentPhoto = user.role === 'estudiante'
      ? await db.get(`SELECT st.photo_data AS photo FROM user_students us JOIN students st ON st.id = us.student_id WHERE us.user_id = ? AND st.school_id = ? AND us.relationship = 'estudiante' LIMIT 1`, user.id, user.school_id)
      : await db.get('SELECT profile_photo_data AS photo FROM users WHERE id = ? AND school_id = ?', user.id, user.school_id)
    return json(response, 200, { profile: { ...account, hasPhoto: Boolean(currentPhoto?.photo) } })
  }

  if (url.pathname === '/api/audit-log' && method === 'GET') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo el administrador puede consultar la bitácora.' })
    const action = String(url.searchParams.get('action') || '').trim().slice(0, 100).toLowerCase()
    const from = String(url.searchParams.get('from') || '')
    const to = String(url.searchParams.get('to') || '')
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
    const offset = Math.min(100_000, Math.max(0, Number(url.searchParams.get('offset')) || 0))
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json(response, 400, { error: 'El rango de fechas no es válido.' })
    const clauses = ['a.school_id = ?']
    const params = [user.school_id]
    if (action) { clauses.push('LOWER(a.action) LIKE ?'); params.push(`%${action}%`) }
    if (from) { clauses.push('a.created_at >= ?'); params.push(`${from} 00:00:00`) }
    if (to) {
      const exclusiveEnd = new Date(`${to}T00:00:00.000Z`)
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
      clauses.push('a.created_at < ?'); params.push(`${exclusiveEnd.toISOString().slice(0, 10)} 00:00:00`)
    }
    const where = clauses.join(' AND ')
    const total = Number((await db.get(`SELECT COUNT(*) AS count FROM audit_log a WHERE ${where}`, ...params)).count)
    const entries = await db.all(`SELECT a.id, a.action, a.created_at AS "createdAt", COALESCE(u.full_name, 'Cuenta eliminada') AS "actorName", u.email AS "actorEmail"
      FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id AND u.school_id = a.school_id
      WHERE ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`, ...params, limit, offset)
    return json(response, 200, { entries, total, limit, offset })
  }

  if (url.pathname === '/api/audit-log/export' && method === 'GET') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo el administrador puede exportar la bitácora.' })
    const action = String(url.searchParams.get('action') || '').trim().slice(0, 100).toLowerCase()
    const from = String(url.searchParams.get('from') || '')
    const to = String(url.searchParams.get('to') || '')
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json(response, 400, { error: 'El rango de fechas no es válido.' })
    const clauses = ['a.school_id = ?'], params = [user.school_id]
    if (action) { clauses.push('LOWER(a.action) LIKE ?'); params.push(`%${action}%`) }
    if (from) { clauses.push('a.created_at >= ?'); params.push(`${from} 00:00:00`) }
    if (to) { const end = new Date(`${to}T00:00:00.000Z`); end.setUTCDate(end.getUTCDate() + 1); clauses.push('a.created_at < ?'); params.push(`${end.toISOString().slice(0, 10)} 00:00:00`) }
    const rows = await db.all(`SELECT a.created_at AS "Fecha y hora", COALESCE(u.full_name, 'Cuenta eliminada') AS "Usuario", COALESCE(u.email, '') AS "Correo", a.action AS "Acción"
      FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id AND u.school_id = a.school_id WHERE ${clauses.join(' AND ')} ORDER BY a.created_at DESC, a.id DESC LIMIT 20000`, ...params)
    const csvCell = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"` }
    const csv = ['Fecha y hora,Usuario,Correo,Acción', ...rows.map(row => Object.values(row).map(csvCell).join(','))].join('\r\n')
    response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="educa-bitacora.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(`\uFEFF${csv}`)
    return
  }

  if (url.pathname === '/api/school/settings' && method === 'GET') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo el administrador puede configurar el colegio.' })
    const settings = await db.get(`SELECT name, contact_email AS "contactEmail", contact_phone AS "contactPhone", address,
      primary_color AS "primaryColor", logo_content_type AS "logoContentType" FROM schools WHERE id = ?`, user.school_id)
    return json(response, 200, { settings: { ...settings, hasLogo: Boolean(settings.logoContentType) } })
  }
  if (url.pathname === '/api/school/settings' && method === 'PATCH') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo el administrador puede configurar el colegio.' })
    const body = await readLargeJsonBody(request, 2 * 1024 * 1024)
    const name = String(body.name || '').trim()
    const contactEmail = String(body.contactEmail || '').trim().toLowerCase()
    const contactPhone = String(body.contactPhone || '').trim()
    const address = String(body.address || '').trim()
    const primaryColor = String(body.primaryColor || '').trim()
    if (name.length < 2 || name.length > 120 || (contactEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 254)) || contactPhone.length > 30 || !/^[\d+() .-]*$/.test(contactPhone) || address.length > 240 || !/^#[0-9a-f]{6}$/i.test(primaryColor)) return json(response, 400, { error: 'Revisa el nombre, correo, teléfono, dirección y color institucional.' })
    let logo = null
    if (body.logo) {
      const image = body.logo
      const fileName = basename(String(image.fileName || '').replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120)
      const base64 = String(image.fileBase64 || '')
      const fileData = Buffer.from(base64, 'base64')
      const imageType = assessmentImageTypes.get(extname(fileName).toLowerCase())
      if (!base64 || base64.length > 1_398_104 || fileData.length > 1024 * 1024 || fileData.toString('base64') !== base64 || !imageType || image.contentType !== imageType.mime || !imageType.magic(fileData)) return json(response, 415, { error: 'El logo debe ser JPG, PNG o WEBP y pesar máximo 1 MB.' })
      logo = { fileName, fileData, contentType: imageType.mime }
    }
    await db.transaction(async tx => {
      await tx.run('UPDATE schools SET name = ?, contact_email = ?, contact_phone = ?, address = ?, primary_color = ? WHERE id = ?', name, contactEmail, contactPhone, address, primaryColor.toLowerCase(), user.school_id)
      if (body.removeLogo === true) await tx.run('UPDATE schools SET logo_content_type = NULL, logo_file_name = NULL, logo_data = NULL WHERE id = ?', user.school_id)
      else if (logo) await tx.run('UPDATE schools SET logo_content_type = ?, logo_file_name = ?, logo_data = ? WHERE id = ?', logo.contentType, logo.fileName, logo.fileData, user.school_id)
      await tx.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', user.school_id, user.id, 'school_branding_updated')
    })
    return json(response, 200, { settings: { name, contactEmail, contactPhone, address, primaryColor: primaryColor.toLowerCase(), hasLogo: Boolean(logo) || (body.removeLogo !== true && Boolean(user.school_logo_content_type)) } })
  }
  if (url.pathname === '/api/school/logo' && method === 'GET') {
    const logo = await db.get('SELECT logo_content_type AS "contentType", logo_data AS "fileData" FROM schools WHERE id = ? AND logo_content_type IS NOT NULL', user.school_id)
    if (!logo) return json(response, 404, { error: 'El colegio no tiene un logo configurado.' })
    response.writeHead(200, { 'Content-Type': logo.contentType, 'Content-Length': String(logo.fileData.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox" })
    response.end(logo.fileData)
    return
  }

  if (method === 'POST' && url.pathname === '/api/auth/password') {
    const body = await readBody(request)
    const currentPassword = String(body.currentPassword || '')
    const newPassword = String(body.newPassword || '')
    if (newPassword.length < 12 || newPassword.length > 128) return json(response, 400, { error: 'La nueva contraseña debe tener entre 12 y 128 caracteres.' })
    const account = await db.get('SELECT password_hash AS "passwordHash" FROM users WHERE id = ? AND school_id = ? AND is_active = 1 AND deleted_at IS NULL', user.id, user.school_id)
    if (!account || !await verifyPassword(currentPassword, account.passwordHash)) return json(response, 400, { error: 'La contraseña actual no es correcta.' })
    if (await verifyPassword(newPassword, account.passwordHash)) return json(response, 400, { error: 'La nueva contraseña debe ser diferente a la actual.' })
    const token = cookieToken(request)
    const passwordHash = await hashPassword(newPassword)
    await db.transaction(async tx => {
      await tx.run('UPDATE users SET password_hash = ? WHERE id = ? AND school_id = ?', passwordHash, user.id, user.school_id)
      await tx.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', user.id, hashToken(token))
      await tx.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', user.school_id, user.id, 'password_changed')
    })
    return json(response, 200, { changed: true, message: 'Contraseña actualizada. Se cerraron las demás sesiones de tu cuenta.' })
  }

  if (url.pathname === '/api/dashboard' && method === 'GET') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo el administrador puede consultar este panel.' })
    const date = String(url.searchParams.get('date') || '')
    if (!validDate(date)) return json(response, 400, { error: 'La fecha del panel no es válida.' })
    const activeStudents = Number((await db.get("SELECT COUNT(*) AS count FROM students WHERE school_id = ? AND status = 'Activo'", user.school_id)).count)
    const courses = Number((await db.get('SELECT COUNT(*) AS count FROM courses WHERE school_id = ? AND is_active = 1', user.school_id)).count)
    const pendingEnrollments = Number((await db.get(`SELECT COUNT(*) AS count FROM enrollment_requests WHERE school_id = ?
      AND status IN ('Solicitada','En revisión','Pendiente documentos')`, user.school_id)).count)
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
    return json(response, 200, { date, activeStudents, courses, pendingEnrollments, attendance, weeklyAttendance })
  }

  if (url.pathname === '/api/notifications' && method === 'GET') {
    const rows = await db.all(`SELECT id, title, body, category, event_id AS "eventId", created_at AS "createdAt", read_at AS "readAt"
      FROM user_notifications WHERE school_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50`, user.school_id, user.id)
    return json(response, 200, { notifications: rows, unread: rows.filter(row => !row.readAt).length })
  }
  const notificationReadMatch = url.pathname.match(/^\/api\/notifications\/([0-9a-f-]{36})\/read$/i)
  if (notificationReadMatch && method === 'PATCH') {
    await db.run('UPDATE user_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ? AND user_id = ?', notificationReadMatch[1], user.school_id, user.id)
    return json(response, 200, { read: true })
  }
  if (url.pathname === '/api/notifications/read-all' && method === 'POST') {
    await db.run('UPDATE user_notifications SET read_at = CURRENT_TIMESTAMP WHERE school_id = ? AND user_id = ? AND read_at IS NULL', user.school_id, user.id)
    return json(response, 200, { read: true })
  }

  if (url.pathname === '/api/calendar/options' && method === 'GET') {
    if (['estudiante', 'acudiente'].includes(user.role)) return json(response, 200, { courses: [] })
    const courses = user.role === 'docente'
      ? await db.all(`SELECT c.id, c.name, c.grade, c.academic_year AS "academicYear" FROM courses c JOIN course_teachers ct ON ct.course_id = c.id WHERE c.school_id = ? AND c.is_active = 1 AND ct.user_id = ? GROUP BY c.id ORDER BY c.academic_year DESC, c.grade, c.name`, user.school_id, user.id)
      : await db.all('SELECT id, name, grade, academic_year AS "academicYear" FROM courses WHERE school_id = ? AND is_active = 1 ORDER BY academic_year DESC, grade, name', user.school_id)
    return json(response, 200, { courses })
  }
  if (url.pathname === '/api/activities' && method === 'GET') {
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes acceso a las actividades escolares.' })
    const family = ['estudiante', 'acudiente'].includes(user.role)
    let sql = `SELECT e.id, e.title, e.details, e.event_date AS "eventDate", e.start_time AS "startTime", e.end_time AS "endTime",
      e.course_id AS "courseId", c.name AS "courseName", c.grade, e.registration_capacity AS capacity,
      e.registration_deadline AS "registrationDeadline", e.registration_open AS "registrationOpen",
      (SELECT COUNT(*) FROM activity_registrations ar WHERE ar.event_id = e.id AND ar.school_id = e.school_id AND ar.status = 'Inscrito') AS "registrationCount"
      FROM school_events e LEFT JOIN courses c ON c.id = e.course_id WHERE e.school_id = ? AND e.event_type = 'Actividad'`
    const params = [user.school_id]
    if (family) {
      sql += ` AND (e.course_id IS NULL OR EXISTS (SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id
        WHERE us.user_id = ? AND st.school_id = e.school_id AND st.status = 'Activo' AND st.grade = c.grade AND (
          EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.course_id = c.id AND se.academic_year = c.academic_year AND se.status = 'Activa')
          OR NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa'))))`
      params.push(user.id)
    } else if (user.role === 'docente') {
      sql += ` AND (e.course_id IS NULL OR EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = e.course_id AND ct.user_id = ?))`
      params.push(user.id)
    }
    sql += ' ORDER BY e.event_date, e.start_time, e.title LIMIT 250'
    const events = await db.all(sql, ...params)
    const linked = family ? await db.all(`SELECT st.id, st.full_name AS name, st.grade FROM user_students us JOIN students st ON st.id = us.student_id
      WHERE us.user_id = ? AND st.school_id = ? AND st.status = 'Activo' ORDER BY st.full_name`, user.id, user.school_id) : []
    const activities = await Promise.all(events.map(async event => ({ ...event,
      registrationCount: Number(event.registrationCount), registrationOpen: Boolean(event.registrationOpen),
      registrations: family ? await db.all(`SELECT ar.student_id AS "studentId", ar.status FROM activity_registrations ar
        JOIN user_students us ON us.student_id = ar.student_id AND us.user_id = ? WHERE ar.event_id = ? AND ar.status = 'Inscrito'`, user.id, event.id) : undefined,
    })))
    return json(response, 200, { activities, students: family ? linked : undefined })
  }
  const activityRegistrationListMatch = url.pathname.match(/^\/api\/activities\/([0-9a-f-]{36})\/registrations$/i)
  if (activityRegistrationListMatch && method === 'GET') {
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar inscripciones.' })
    const event = await db.get('SELECT id, course_id AS "courseId" FROM school_events WHERE id = ? AND school_id = ? AND event_type = ?', activityRegistrationListMatch[1], user.school_id, 'Actividad')
    if (!event) return json(response, 404, { error: 'No encontramos esa actividad.' })
    if (user.role === 'docente' && (!event.courseId || !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', event.courseId, user.id))) return json(response, 403, { error: 'No tienes acceso a esta actividad.' })
    const registrations = await db.all(`SELECT ar.id, st.full_name AS "studentName", st.grade, ar.status, ar.created_at AS "createdAt"
      FROM activity_registrations ar JOIN students st ON st.id = ar.student_id WHERE ar.school_id = ? AND ar.event_id = ? ORDER BY ar.created_at DESC`, user.school_id, event.id)
    return json(response, 200, { registrations })
  }
  const activityRegisterMatch = url.pathname.match(/^\/api\/activities\/([0-9a-f-]{36})\/register$/i)
  if (activityRegisterMatch && method === 'POST') {
    if (!['estudiante', 'acudiente'].includes(user.role)) return json(response, 403, { error: 'Solo estudiantes y acudientes pueden inscribirse.' })
    const body = await readBody(request), studentId = String(body.studentId || '')
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Selecciona un estudiante vinculado a tu cuenta.' })
    const id = randomUUID(), eventId = activityRegisterMatch[1]
    try {
      await db.transaction(async tx => {
        const event = await tx.get(`SELECT id, course_id AS "courseId", event_date AS "eventDate", registration_capacity AS capacity, registration_deadline AS deadline, registration_open AS "registrationOpen"
          FROM school_events WHERE id = ? AND school_id = ? AND event_type = ?${databaseType === 'postgres' ? ' FOR UPDATE' : ''}`, eventId, user.school_id, 'Actividad')
        const today = new Date().toISOString().slice(0, 10)
        if (!event || !event.registrationOpen || event.eventDate < today || (event.deadline && event.deadline < today)) throw Object.assign(new Error('La inscripción está cerrada.'), { status: 400 })
        const student = await tx.get("SELECT id, grade FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", studentId, user.school_id)
        if (!student) throw Object.assign(new Error('El estudiante no está activo en este colegio.'), { status: 403 })
        if (event.courseId && !await tx.get(`SELECT 1 FROM courses c WHERE c.id = ? AND c.grade = ? AND c.school_id = ? AND (
          EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.course_id = c.id AND se.academic_year = c.academic_year AND se.status = 'Activa')
          OR NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.status = 'Activa'))`, event.courseId, student.grade, user.school_id, studentId, studentId)) throw Object.assign(new Error('Esta actividad no corresponde al curso del estudiante.'), { status: 403 })
        const existing = await tx.get('SELECT id, status FROM activity_registrations WHERE event_id = ? AND student_id = ?', eventId, studentId)
        if (existing?.status === 'Inscrito') throw Object.assign(new Error('El estudiante ya está inscrito.'), { status: 409 })
        const count = Number((await tx.get("SELECT COUNT(*) AS count FROM activity_registrations WHERE event_id = ? AND status = 'Inscrito'", eventId)).count)
        if (event.capacity && count >= Number(event.capacity)) throw Object.assign(new Error('La actividad ya no tiene cupos disponibles.'), { status: 409 })
        if (existing) await tx.run("UPDATE activity_registrations SET status = 'Inscrito', created_by = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?", user.id, existing.id)
        else await tx.run('INSERT INTO activity_registrations (id, school_id, event_id, student_id, created_by) VALUES (?, ?, ?, ?, ?)', id, user.school_id, eventId, studentId, user.id)
      })
    } catch (error) { if (error.status) return json(response, error.status, { error: error.message }); throw error }
    await logAudit(user.school_id, user.id, 'activity_student_registered')
    return json(response, 201, { registered: true })
  }
  const activityCancelMatch = url.pathname.match(/^\/api\/activities\/([0-9a-f-]{36})\/registrations\/([0-9a-f-]{36})$/i)
  if (activityCancelMatch && method === 'DELETE') {
    const [, eventId, studentId] = activityCancelMatch
    const staff = ['admin', 'rectoria', 'coordinacion', 'secretaria'].includes(user.role)
    if (!staff && (!['estudiante', 'acudiente'].includes(user.role) || !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId))) return json(response, 403, { error: 'No puedes cancelar esta inscripción.' })
    await db.run("UPDATE activity_registrations SET status = 'Cancelado' WHERE school_id = ? AND event_id = ? AND student_id = ? AND status = 'Inscrito'", user.school_id, eventId, studentId)
    await logAudit(user.school_id, user.id, 'activity_registration_cancelled')
    return json(response, 200, { cancelled: true })
  }
  if (url.pathname === '/api/calendar' && method === 'GET') {
    const from = String(url.searchParams.get('from') || '')
    const to = String(url.searchParams.get('to') || '')
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json(response, 400, { error: 'El rango de fechas no es válido.' })
    let sql = `SELECT e.id, e.title, e.details, e.event_date AS "eventDate", e.start_time AS "startTime", e.end_time AS "endTime",
      e.event_type AS "eventType", e.course_id AS "courseId", c.name AS "courseName", c.grade, c.academic_year AS "academicYear",
      creator.full_name AS "createdByName", e.created_by AS "createdBy"
      FROM school_events e LEFT JOIN courses c ON c.id = e.course_id JOIN users creator ON creator.id = e.created_by
      WHERE e.school_id = ?`
    const params = [user.school_id]
    if (from) { sql += ' AND e.event_date >= ?'; params.push(from) }
    if (to) { sql += ' AND e.event_date <= ?'; params.push(to) }
    if (user.role === 'docente') { sql += ` AND (e.course_id IS NULL OR EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = e.course_id AND ct.user_id = ?))`; params.push(user.id) }
    if (['estudiante', 'acudiente'].includes(user.role)) {
      sql += ` AND (e.course_id IS NULL OR EXISTS (SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id
        WHERE us.user_id = ? AND st.school_id = e.school_id AND st.status = 'Activo' AND (
          EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = e.school_id AND se.student_id = st.id AND se.course_id = e.course_id AND se.status = 'Activa')
          OR (st.grade = c.grade AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = e.school_id AND se.student_id = st.id AND se.status = 'Activa')))))`
      params.push(user.id)
    }
    sql += ' ORDER BY e.event_date, e.start_time, e.title LIMIT 500'
    return json(response, 200, { events: await db.all(sql, ...params) })
  }
  if (url.pathname === '/api/calendar' && method === 'POST') {
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear eventos.' })
    const body = await readBody(request)
    const title = String(body.title || '').trim()
    const details = String(body.details || '').trim()
    const eventDate = String(body.eventDate || '')
    const startTime = String(body.startTime || '')
    const endTime = String(body.endTime || '')
    const eventType = String(body.eventType || 'Evento')
    const courseId = String(body.courseId || '')
    const rawCapacity = body.registrationCapacity === '' || body.registrationCapacity == null ? null : Number(body.registrationCapacity)
    const registrationCapacity = eventType === 'Actividad' && Number.isInteger(rawCapacity) && rawCapacity > 0 && rawCapacity <= 10000 ? rawCapacity : null
    const registrationDeadline = body.registrationDeadline ? String(body.registrationDeadline) : null
    const registrationOpen = eventType === 'Actividad' && body.registrationOpen === true
    if (title.length < 2 || title.length > 120 || details.length > 1500 || !validDate(eventDate) || (startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) || (endTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)) || (startTime && endTime && endTime <= startTime) || !['Evento', 'Actividad', 'Reunión', 'Evaluación', 'Entrega', 'Festivo', 'Institucional'].includes(eventType) || (body.registrationCapacity != null && body.registrationCapacity !== '' && registrationCapacity == null) || (registrationDeadline && (!validDate(registrationDeadline) || registrationDeadline > eventDate)) || (registrationOpen && eventType !== 'Actividad')) return json(response, 400, { error: 'Revisa el título, fecha, horario, tipo, cupo y fecha límite.' })
    let course = null
    if (courseId) {
      course = await db.get('SELECT id, grade, academic_year AS "academicYear", name FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
      if (!course) return json(response, 404, { error: 'No encontramos el curso activo.' })
      if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', course.id, user.id)) return json(response, 403, { error: 'Ese curso no está asignado a tu cuenta.' })
    } else if (user.role === 'docente') return json(response, 403, { error: 'Los docentes deben asociar el evento a uno de sus cursos.' })
    const id = randomUUID()
    let recipients
    if (course) {
      const staff = await db.all('SELECT user_id AS id FROM course_teachers WHERE course_id = ?', course.id)
      const families = await db.all(`SELECT DISTINCT us.user_id AS id FROM user_students us JOIN students st ON st.id = us.student_id
        WHERE st.school_id = ? AND st.status = 'Activo' AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.course_id = ? AND se.academic_year = ? AND se.status = 'Activa')
        OR (st.grade = ? AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')))`, user.school_id, course.id, course.academicYear, course.grade)
      recipients = [...new Set([...staff, ...families].map(row => row.id).filter(id => id !== user.id))]
    } else {
      recipients = (await db.all('SELECT id FROM users WHERE school_id = ? AND is_active = 1 AND deleted_at IS NULL AND id <> ?', user.school_id, user.id)).map(row => row.id)
    }
    await db.transaction(async tx => {
      await tx.run('INSERT INTO school_events (id, school_id, course_id, title, details, event_date, start_time, end_time, event_type, registration_capacity, registration_deadline, registration_open, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, course?.id || null, title, details, eventDate, startTime, endTime, eventType, registrationCapacity, registrationDeadline, registrationOpen ? 1 : 0, user.id)
      for (const recipient of recipients) await tx.run('INSERT INTO user_notifications (id, school_id, user_id, event_id, title, body, category) VALUES (?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, recipient, id, `Nuevo evento: ${title}`, `${eventDate}${startTime ? ` · ${startTime}` : ''}${course ? ` · ${course.name}` : ''}`, 'calendar')
    })
    await logAudit(user.school_id, user.id, 'calendar_event_created')
    return json(response, 201, { event: { id, title, eventDate, courseId: course?.id || null }, notified: recipients.length })
  }
  const calendarDeleteMatch = url.pathname.match(/^\/api\/calendar\/([0-9a-f-]{36})$/i)
  if (calendarDeleteMatch && method === 'DELETE') {
    const event = await db.get('SELECT id, created_by AS "createdBy" FROM school_events WHERE id = ? AND school_id = ?', calendarDeleteMatch[1], user.school_id)
    if (!event) return json(response, 404, { error: 'No encontramos ese evento.' })
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria'].includes(user.role) && event.createdBy !== user.id) return json(response, 403, { error: 'Solo quien creó el evento o un administrador autorizado puede eliminarlo.' })
    await db.run('DELETE FROM school_events WHERE id = ? AND school_id = ?', event.id, user.school_id)
    await logAudit(user.school_id, user.id, 'calendar_event_deleted')
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/schedule/options' && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración puede configurar el horario.' })
    const assignments = await db.all(`SELECT c.id AS "courseId", c.name AS "courseName", c.grade, c.academic_year AS "academicYear",
      ct.user_id AS "teacherId", u.full_name AS "teacherName", ct.subject
      FROM courses c JOIN course_teachers ct ON ct.course_id = c.id JOIN users u ON u.id = ct.user_id
      WHERE c.school_id = ? AND c.is_active = 1 AND u.is_active = 1 AND u.deleted_at IS NULL ORDER BY c.grade, c.name, u.full_name, ct.subject`, user.school_id)
    return json(response, 200, { assignments })
  }
  if (url.pathname === '/api/schedule' && method === 'GET') {
    if (['docente'].includes(user.role)) {
      const rows = await db.all(`SELECT s.id, s.weekday, s.start_time AS "startTime", s.end_time AS "endTime", s.room, s.subject,
        c.id AS "courseId", c.name AS "courseName", c.grade, c.academic_year AS "academicYear", u.full_name AS "teacherName"
        FROM class_schedule_slots s JOIN courses c ON c.id = s.course_id JOIN users u ON u.id = s.teacher_id
        WHERE s.school_id = ? AND s.teacher_id = ? ORDER BY s.weekday, s.start_time`, user.school_id, user.id)
      return json(response, 200, { schedule: rows })
    }
    let sql = `SELECT s.id, s.weekday, s.start_time AS "startTime", s.end_time AS "endTime", s.room, s.subject,
      c.id AS "courseId", c.name AS "courseName", c.grade, c.academic_year AS "academicYear", u.full_name AS "teacherName"
      FROM class_schedule_slots s JOIN courses c ON c.id = s.course_id JOIN users u ON u.id = s.teacher_id WHERE s.school_id = ?`
    const params = [user.school_id]
    if (['estudiante', 'acudiente'].includes(user.role)) { sql += ' AND EXISTS (SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id WHERE us.user_id = ? AND st.school_id = s.school_id AND st.grade = c.grade AND st.status = \'Activo\')'; params.push(user.id) }
    sql += ' ORDER BY c.academic_year DESC, s.weekday, s.start_time, c.grade'
    return json(response, 200, { schedule: await db.all(sql, ...params) })
  }
  if (url.pathname === '/api/schedule' && method === 'POST') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración puede editar el horario.' })
    const body = await readBody(request)
    const courseId = String(body.courseId || ''), teacherId = String(body.teacherId || ''), subject = String(body.subject || '').trim()
    const weekday = Number(body.weekday), startTime = String(body.startTime || ''), endTime = String(body.endTime || ''), room = String(body.room || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(courseId) || !/^[0-9a-f-]{36}$/i.test(teacherId) || subject.length < 2 || subject.length > 80 || !Number.isInteger(weekday) || weekday < 1 || weekday > 5 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= startTime || room.length > 80) return json(response, 400, { error: 'Revisa curso, docente, día, horas y salón.' })
    const assignment = await db.get(`SELECT c.id FROM courses c JOIN course_teachers ct ON ct.course_id = c.id
      WHERE c.id = ? AND c.school_id = ? AND c.is_active = 1 AND ct.user_id = ? AND ct.subject = ?`, courseId, user.school_id, teacherId, subject)
    if (!assignment) return json(response, 400, { error: 'El docente debe tener asignada esa asignatura en el curso.' })
    const conflict = await db.get(`SELECT s.id FROM class_schedule_slots s WHERE s.school_id = ? AND s.weekday = ?
      AND s.start_time < ? AND s.end_time > ? AND (s.teacher_id = ? OR s.course_id = ?)`, user.school_id, weekday, endTime, startTime, teacherId, courseId)
    if (conflict) return json(response, 409, { error: 'El horario se cruza con otra clase del docente o del curso.' })
    const id = randomUUID()
    await db.run('INSERT INTO class_schedule_slots (id, school_id, course_id, teacher_id, subject, weekday, start_time, end_time, room, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, courseId, teacherId, subject, weekday, startTime, endTime, room, user.id)
    await logAudit(user.school_id, user.id, 'schedule_slot_created')
    return json(response, 201, { id })
  }
  const scheduleDeleteMatch = url.pathname.match(/^\/api\/schedule\/([0-9a-f-]{36})$/i)
  if (scheduleDeleteMatch && method === 'DELETE') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración puede editar el horario.' })
    await db.run('DELETE FROM class_schedule_slots WHERE id = ? AND school_id = ?', scheduleDeleteMatch[1], user.school_id)
    await logAudit(user.school_id, user.id, 'schedule_slot_deleted')
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/academic-periods' && method === 'GET') {
    return json(response, 200, { periods: await db.all('SELECT id, academic_year AS "academicYear", name, start_date AS "startDate", end_date AS "endDate", is_active AS "active" FROM academic_periods WHERE school_id = ? ORDER BY academic_year DESC, start_date', user.school_id) })
  }
  if (url.pathname === '/api/academic-periods' && method === 'POST') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden configurar periodos.' })
    const body = await readBody(request)
    const year = String(body.academicYear || ''), name = String(body.name || '').trim(), startDate = String(body.startDate || ''), endDate = String(body.endDate || '')
    if (!/^\d{4}-\d{4}$/.test(year) || name.length < 2 || name.length > 40 || !validDate(startDate) || !validDate(endDate) || endDate < startDate) return json(response, 400, { error: 'Revisa el año lectivo, nombre y fechas del periodo.' })
    const id = randomUUID()
    try { await db.run('INSERT INTO academic_periods (id, school_id, academic_year, name, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', id, user.school_id, year, name, startDate, endDate, user.id) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya existe ese periodo para el año lectivo.' }); throw error }
    await logAudit(user.school_id, user.id, 'academic_period_created')
    return json(response, 201, { id })
  }
  const periodMatch = url.pathname.match(/^\/api\/academic-periods\/([0-9a-f-]{36})$/i)
  if (periodMatch && method === 'DELETE') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden configurar periodos.' })
    await db.run('DELETE FROM academic_periods WHERE id = ? AND school_id = ?', periodMatch[1], user.school_id)
    await logAudit(user.school_id, user.id, 'academic_period_deleted')
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/attendance/justifications' && method === 'GET') {
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'orientacion', 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes acceso a justificaciones.' })
    let sql = `SELECT j.id, j.student_id AS "studentId", st.full_name AS "studentName", st.grade, j.attendance_date AS "attendanceDate",
      j.reason, j.status, j.reviewer_note AS "reviewerNote", j.support_file_name AS "supportFileName", j.created_at AS "createdAt", j.reviewed_at AS "reviewedAt"
      FROM attendance_justifications j JOIN students st ON st.id = j.student_id WHERE j.school_id = ?`
    const params = [user.school_id]
    if (['acudiente', 'estudiante'].includes(user.role)) { sql += ' AND EXISTS (SELECT 1 FROM user_students us WHERE us.user_id = ? AND us.student_id = st.id)'; params.push(user.id) }
    if (user.role === 'docente') { sql += ` AND EXISTS (SELECT 1 FROM course_teachers ct JOIN courses c ON c.id = ct.course_id WHERE ct.user_id = ? AND c.school_id = st.school_id AND c.grade = st.grade)`; params.push(user.id) }
    sql += ' ORDER BY j.attendance_date DESC, st.full_name LIMIT 500'
    return json(response, 200, { justifications: await db.all(sql, ...params) })
  }
  if (url.pathname === '/api/attendance/justifications' && method === 'POST') {
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'Solo estudiantes y acudientes pueden enviar justificaciones.' })
    const body = await readLargeJsonBody(request, 4 * 1024 * 1024), studentId = String(body.studentId || ''), date = String(body.date || ''), reason = String(body.reason || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || !validDate(date) || date > new Date().toISOString().slice(0, 10) || reason.length < 10 || reason.length > 1000) return json(response, 400, { error: 'Revisa estudiante, fecha y motivo (mínimo 10 caracteres).' })
    const linked = await db.get("SELECT st.id, st.full_name AS name FROM students st JOIN user_students us ON us.student_id = st.id WHERE st.id = ? AND st.school_id = ? AND st.status = 'Activo' AND us.user_id = ?", studentId, user.school_id, user.id)
    if (!linked) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    let supportFile = null
    if (body.supportFileBase64) {
      const fileName = basename(String(body.supportFileName || '')).slice(0, 160), type = workFileTypes.get(extname(fileName).toLowerCase())
      if (!type || !['.pdf', '.png', '.jpg', '.jpeg'].includes(extname(fileName).toLowerCase())) return json(response, 400, { error: 'El soporte debe ser PDF, PNG o JPG.' })
      const encoded = String(body.supportFileBase64)
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return json(response, 400, { error: 'El archivo adjunto no tiene un formato válido.' })
      const data = Buffer.from(encoded, 'base64')
      if (!data.length || data.length > 2 * 1024 * 1024 || !type.magic(data)) return json(response, 400, { error: 'El soporte supera 2 MB o su contenido no coincide con el formato declarado.' })
      supportFile = { fileName, mime: type.mime, data }
    }
    const id = randomUUID()
    try { await db.run(`INSERT INTO attendance_justifications (id, school_id, student_id, attendance_date, reason, created_by,
      support_file_name, support_content_type, support_file_size, support_file_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, user.school_id, studentId, date, reason, user.id, supportFile?.fileName || null, supportFile?.mime || null, supportFile?.data.length || 0, supportFile?.data || null) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya hay una justificación registrada para ese estudiante y fecha.' }); throw error }
    const reviewers = await db.all("SELECT id FROM users WHERE school_id = ? AND is_active = 1 AND deleted_at IS NULL AND role IN ('admin','rectoria','coordinacion','secretaria')", user.school_id)
    for (const reviewer of reviewers) await db.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category) VALUES (?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, reviewer.id, 'Nueva justificación de ausencia', `${linked.name} · ${date}`, 'attendance')
    await logAudit(user.school_id, user.id, 'attendance_justification_created')
    return json(response, 201, { id })
  }
  const justificationFileMatch = url.pathname.match(/^\/api\/attendance\/justifications\/([0-9a-f-]{36})\/file$/i)
  if (justificationFileMatch && method === 'GET') {
    const file = await db.get(`SELECT j.student_id AS "studentId", j.support_file_name AS "fileName", j.support_content_type AS "contentType",
      j.support_file_size AS "fileSize", j.support_file_data AS "fileData" FROM attendance_justifications j
      WHERE j.id = ? AND j.school_id = ? AND j.support_file_name IS NOT NULL`, justificationFileMatch[1], user.school_id)
    if (!file) return json(response, 404, { error: 'No encontramos el archivo de soporte.' })
    const staff = ['admin', 'rectoria', 'coordinacion', 'secretaria'].includes(user.role)
    const linked = ['acudiente', 'estudiante'].includes(user.role) && await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, file.studentId)
    if (!staff && !linked) return json(response, 403, { error: 'No tienes permiso para consultar este soporte.' })
    const safeName = encodeURIComponent(file.fileName).replaceAll("'", '%27')
    response.writeHead(200, { 'Content-Type': file.contentType, 'Content-Length': String(file.fileSize), 'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(file.fileData)
    return
  }
  const justificationMatch = url.pathname.match(/^\/api\/attendance\/justifications\/([0-9a-f-]{36})$/i)
  if (justificationMatch && method === 'PATCH') {
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo coordinación y administración pueden revisar justificaciones.' })
    const body = await readBody(request), status = String(body.status || ''), note = String(body.note || '').trim()
    if (!['Aprobada', 'Rechazada'].includes(status) || note.length > 500 || (status === 'Rechazada' && note.length < 3)) return json(response, 400, { error: 'Selecciona aprobación o rechazo; el rechazo requiere una nota de 3 a 500 caracteres.' })
    const item = await db.get('SELECT id, student_id AS "studentId", attendance_date AS date, created_by AS "createdBy" FROM attendance_justifications WHERE id = ? AND school_id = ?', justificationMatch[1], user.school_id)
    if (!item) return json(response, 404, { error: 'No encontramos esa justificación.' })
    await db.transaction(async tx => {
      await tx.run('UPDATE attendance_justifications SET status = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', status, note, user.id, item.id, user.school_id)
      if (status === 'Aprobada') await tx.run("UPDATE attendance_records SET status = 'Justificado', marked_by = ?, marked_at = CURRENT_TIMESTAMP WHERE school_id = ? AND student_id = ? AND attendance_date = ? AND status = 'Ausente'", user.id, user.school_id, item.studentId, item.date)
      await tx.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category) VALUES (?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, item.createdBy, `Justificación ${status.toLocaleLowerCase('es')}`, `${item.date}${note ? ` · ${note}` : ''}`, 'attendance')
    })
    await logAudit(user.school_id, user.id, 'attendance_justification_reviewed')
    return json(response, 200, { updated: true })
  }

  if (url.pathname === '/api/observations/options' && method === 'GET') {
    if (!['admin', 'rectoria', 'coordinacion', 'orientacion', 'docente'].includes(user.role)) return json(response, 403, { error: 'El observador contiene información restringida.' })
    const students = user.role === 'docente'
      ? await db.all(`SELECT DISTINCT st.id, st.full_name AS name, st.grade FROM students st JOIN courses c ON c.school_id = st.school_id AND c.grade = st.grade
          JOIN course_teachers ct ON ct.course_id = c.id WHERE st.school_id = ? AND st.status = 'Activo' AND ct.user_id = ? ORDER BY st.grade, st.full_name`, user.school_id, user.id)
      : await db.all("SELECT id, full_name AS name, grade FROM students WHERE school_id = ? AND status = 'Activo' ORDER BY grade, full_name", user.school_id)
    return json(response, 200, { students })
  }
  if (url.pathname === '/api/observations' && method === 'GET') {
    if (!['admin', 'rectoria', 'coordinacion', 'orientacion', 'docente'].includes(user.role)) return json(response, 403, { error: 'El observador contiene información restringida.' })
    let sql = `SELECT o.id, o.student_id AS "studentId", st.full_name AS "studentName", st.grade, o.category, o.severity, o.details,
      o.confidential, o.created_at AS "createdAt", creator.full_name AS "createdByName"
      FROM student_observations o JOIN students st ON st.id = o.student_id JOIN users creator ON creator.id = o.created_by WHERE o.school_id = ?`
    const params = [user.school_id]
    if (user.role === 'docente') { sql += ` AND o.confidential = 0 AND EXISTS (SELECT 1 FROM course_teachers ct JOIN courses c ON c.id = ct.course_id WHERE ct.user_id = ? AND c.school_id = st.school_id AND c.grade = st.grade)`; params.push(user.id) }
    sql += ' ORDER BY o.created_at DESC LIMIT 500'
    return json(response, 200, { observations: await db.all(sql, ...params) })
  }
  if (url.pathname === '/api/observations' && method === 'POST') {
    if (!['admin', 'rectoria', 'coordinacion', 'orientacion', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para registrar observaciones.' })
    const body = await readBody(request), studentId = String(body.studentId || ''), category = String(body.category || '').trim(), severity = String(body.severity || 'Seguimiento'), details = String(body.details || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || category.length < 2 || category.length > 60 || !['Positiva', 'Seguimiento', 'Prioritaria'].includes(severity) || details.length < 10 || details.length > 2000) return json(response, 400, { error: 'Revisa estudiante, categoría, prioridad y detalle (mínimo 10 caracteres).' })
    const student = await db.get("SELECT id, grade FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", studentId, user.school_id)
    if (!student) return json(response, 404, { error: 'No encontramos un estudiante activo de este colegio.' })
    if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers ct JOIN courses c ON c.id = ct.course_id WHERE ct.user_id = ? AND ct.subject IS NOT NULL AND c.school_id = ? AND c.grade = ?', user.id, user.school_id, student.grade)) return json(response, 403, { error: 'Solo puedes registrar observaciones para los grados que tienes asignados.' })
    const confidential = user.role === 'docente' ? 1 : body.confidential === false ? 0 : 1
    const id = randomUUID()
    await db.run('INSERT INTO student_observations (id, school_id, student_id, category, severity, details, confidential, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, studentId, category, severity, details, confidential, user.id)
    await logAudit(user.school_id, user.id, 'student_observation_created')
    return json(response, 201, { id })
  }
  const observationMatch = url.pathname.match(/^\/api\/observations\/([0-9a-f-]{36})$/i)
  if (observationMatch && method === 'DELETE') {
    if (!['admin', 'orientacion'].includes(user.role)) return json(response, 403, { error: 'Solo administración u orientación pueden eliminar observaciones.' })
    await db.run('DELETE FROM student_observations WHERE id = ? AND school_id = ?', observationMatch[1], user.school_id)
    await logAudit(user.school_id, user.id, 'student_observation_deleted')
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/admin/backup' && method === 'GET') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo el administrador puede descargar el respaldo del colegio.' })
    const [school, users, students, courses, assignments, enrollments, attendance, assessments, grades, requests, events, schedule, observations, periods, justifications, communications, activityRegistrations, certificates, audit] = await Promise.all([
      db.get('SELECT id, slug, name, contact_email AS "contactEmail", contact_phone AS "contactPhone", address, primary_color AS "primaryColor" FROM schools WHERE id = ?', user.school_id),
      db.all('SELECT id, email, full_name AS name, role, is_active AS active FROM users WHERE school_id = ? AND deleted_at IS NULL', user.school_id),
      db.all('SELECT id, full_name AS name, document, grade, guardian_name AS guardian, guardian_phone AS phone, status FROM students WHERE school_id = ?', user.school_id),
      db.all('SELECT id, name, grade, academic_year AS "academicYear", is_active AS active FROM courses WHERE school_id = ?', user.school_id),
      db.all('SELECT ct.course_id AS "courseId", ct.user_id AS "teacherId", ct.subject FROM course_teachers ct JOIN courses c ON c.id = ct.course_id WHERE c.school_id = ?', user.school_id),
      db.all('SELECT id, student_id AS "studentId", course_id AS "courseId", academic_year AS "academicYear", status, start_date AS "startDate", end_date AS "endDate" FROM student_enrollments WHERE school_id = ?', user.school_id),
      db.all('SELECT course_id AS "courseId", student_id AS "studentId", attendance_date AS date, status, marked_by AS "markedBy", marked_at AS "markedAt" FROM attendance_records WHERE school_id = ?', user.school_id),
      db.all('SELECT id, course_id AS "courseId", subject, period, title, due_at AS "dueAt", max_score AS "maxScore", delivery_mode AS "deliveryMode" FROM grade_assessments WHERE school_id = ?', user.school_id),
      db.all('SELECT sg.assessment_id AS "assessmentId", sg.student_id AS "studentId", sg.score, sg.comment FROM student_grades sg JOIN grade_assessments a ON a.id = sg.assessment_id WHERE a.school_id = ?', user.school_id),
      db.all('SELECT id, student_name AS "studentName", document, grade_requested AS "gradeRequested", academic_year AS "academicYear", status, pending_documents AS "pendingDocuments" FROM enrollment_requests WHERE school_id = ?', user.school_id),
      db.all('SELECT id, course_id AS "courseId", title, details, event_date AS "eventDate", start_time AS "startTime", end_time AS "endTime", event_type AS "eventType", registration_capacity AS capacity, registration_deadline AS "registrationDeadline", registration_open AS "registrationOpen" FROM school_events WHERE school_id = ?', user.school_id),
      db.all('SELECT id, course_id AS "courseId", teacher_id AS "teacherId", subject, weekday, start_time AS "startTime", end_time AS "endTime", room FROM class_schedule_slots WHERE school_id = ?', user.school_id),
      db.all('SELECT id, student_id AS "studentId", category, severity, details, confidential, created_at AS "createdAt" FROM student_observations WHERE school_id = ?', user.school_id),
      db.all('SELECT academic_year AS "academicYear", name, start_date AS "startDate", end_date AS "endDate", is_active AS active FROM academic_periods WHERE school_id = ?', user.school_id),
      db.all('SELECT id, student_id AS "studentId", attendance_date AS "attendanceDate", reason, status, reviewer_note AS "reviewerNote", support_file_name AS "supportFileName", created_at AS "createdAt" FROM attendance_justifications WHERE school_id = ?', user.school_id),
      db.all('SELECT id, course_id AS "courseId", audience, title, body, created_by AS "createdBy", created_at AS "createdAt" FROM communications WHERE school_id = ?', user.school_id),
      db.all('SELECT id, event_id AS "eventId", student_id AS "studentId", status, created_by AS "createdBy", created_at AS "createdAt" FROM activity_registrations WHERE school_id = ?', user.school_id),
      db.all('SELECT id, student_id AS "studentId", certificate_number AS "certificateNumber", certificate_type AS "certificateType", student_name AS "studentName", grade, academic_year AS "academicYear", issued_by AS "issuedBy", created_at AS "issuedAt" FROM school_certificates WHERE school_id = ?', user.school_id),
      db.all('SELECT actor_user_id AS "actorUserId", action, created_at AS "createdAt" FROM audit_log WHERE school_id = ? ORDER BY id', user.school_id),
    ])
    const date = new Date().toISOString()
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="educa-respaldo-${school.slug}-${date.slice(0, 10)}.json"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(JSON.stringify({ format: 'educa-school-backup-v1', generatedAt: date, school, users, students, courses, assignments, enrollments, attendance, assessments, grades, enrollmentRequests: requests, events, schedule, observations, periods, justifications, communications, activityRegistrations, certificates, audit }, null, 2))
    await logAudit(user.school_id, user.id, 'school_backup_downloaded')
    return
  }

  if (url.pathname === '/api/students/import' && method === 'POST') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden importar estudiantes.' })
    const body = await readBody(request), rows = body.records
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000) return json(response, 400, { error: 'El archivo debe contener entre 1 y 1.000 estudiantes.' })
    const clean = rows.map((row, index) => ({ rowNo: index + 2, name: String(row.name || '').trim(), document: String(row.document || '').trim(), grade: String(row.grade || '').trim(), guardian: String(row.guardian || '').trim(), phone: String(row.phone || '').trim(), status: row.status === 'Retirado' ? 'Retirado' : 'Activo' }))
    if (clean.some(row => row.name.length < 2 || row.name.length > 100 || !/^[\p{L}\p{N}.-]{3,30}$/u.test(row.document) || row.grade.length < 2 || row.grade.length > 40 || row.guardian.length > 100 || row.phone.length > 25) || new Set(clean.map(row => row.document)).size !== clean.length) return json(response, 400, { error: 'Hay filas inválidas o documentos repetidos. Columnas requeridas: name, document, grade, guardian, phone, status.' })
    const existing = await db.all(`SELECT document FROM students WHERE school_id = ? AND document IN (${clean.map(() => '?').join(',')})`, user.school_id, ...clean.map(row => row.document))
    if (existing.length) return json(response, 409, { error: `El documento ${existing[0].document} ya está registrado. No se importó ninguna fila.` })
    await db.transaction(async tx => {
      for (const row of clean) await tx.run('INSERT INTO students (id, school_id, full_name, document, grade, guardian_name, guardian_phone, status, card_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, row.name, row.document, row.grade, row.guardian, row.phone, row.status, randomUUID())
    })
    await logAudit(user.school_id, user.id, `students_imported:${clean.length}`)
    return json(response, 201, { imported: clean.length })
  }

if (url.pathname === '/api/communications/options' && method === 'GET') {
    const allowed = ['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'orientacion']
    if (!allowed.includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar destinatarios.' })
    const courses = user.role === 'docente'
      ? await db.all(`SELECT c.id, c.name, c.grade, c.academic_year AS "academicYear" FROM courses c
          JOIN course_teachers ct ON ct.course_id = c.id WHERE c.school_id = ? AND c.is_active = 1 AND ct.user_id = ?
          GROUP BY c.id ORDER BY c.academic_year DESC, c.grade, c.name`, user.school_id, user.id)
      : await db.all('SELECT id, name, grade, academic_year AS "academicYear" FROM courses WHERE school_id = ? AND is_active = 1 ORDER BY academic_year DESC, grade, name', user.school_id)
    return json(response, 200, { courses })
  }
  if (url.pathname === '/api/communications' && method === 'GET') {
    const allowed = ['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'orientacion', 'tesoreria', 'acudiente', 'estudiante']
    if (!allowed.includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar comunicaciones.' })
    const communications = await db.all(`SELECT c.id, c.audience, c.title, c.body, c.created_at AS "createdAt",
        c.created_by = ? AS "isAuthor", creator.full_name AS "authorName", co.name AS "courseName",
        (SELECT COUNT(*) FROM communication_recipients r WHERE r.communication_id = c.id) AS "recipientCount",
        (SELECT COUNT(*) FROM communication_recipients r WHERE r.communication_id = c.id AND r.read_at IS NOT NULL) AS "readCount",
        mine.read_at AS "readAt"
      FROM communications c JOIN users creator ON creator.id = c.created_by
      LEFT JOIN courses co ON co.id = c.course_id
      LEFT JOIN communication_recipients mine ON mine.communication_id = c.id AND mine.user_id = ?
      WHERE c.school_id = ? AND (c.created_by = ? OR mine.user_id IS NOT NULL)
      ORDER BY c.created_at DESC LIMIT 200`, user.id, user.id, user.school_id, user.id)
    return json(response, 200, { communications })
  }
  if (url.pathname === '/api/communications' && method === 'POST') {
    const broadRoles = ['admin', 'rectoria', 'coordinacion', 'secretaria', 'orientacion']
    const allowed = [...broadRoles, 'docente']
    if (!allowed.includes(user.role)) return json(response, 403, { error: 'No tienes permiso para enviar comunicaciones.' })
    const body = await readBody(request)
    const title = String(body.title || '').trim()
    const content = String(body.body || '').trim()
    const audience = String(body.audience || '')
    const courseId = String(body.courseId || '')
    if (title.length < 3 || title.length > 160 || content.length < 3 || content.length > 5000) return json(response, 400, { error: 'El asunto debe tener entre 3 y 160 caracteres y el mensaje entre 3 y 5000.' })
    if (!['school', 'course'].includes(audience) || (audience === 'school' && !broadRoles.includes(user.role)) || (audience === 'course' && !courseId)) return json(response, 400, { error: 'Selecciona un grupo válido para esta comunicación.' })
    let course = null
    if (audience === 'course') {
      course = await db.get('SELECT id, grade, name FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
      if (!course) return json(response, 404, { error: 'El curso seleccionado no está disponible.' })
      if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', course.id, user.id)) return json(response, 403, { error: 'Ese curso no está asignado a tu cuenta.' })
    }
    const recipients = audience === 'school'
      ? await db.all('SELECT id FROM users WHERE school_id = ? AND is_active = 1 AND deleted_at IS NULL', user.school_id)
      : await db.all(`SELECT DISTINCT u.id FROM users u
          LEFT JOIN user_students us ON us.user_id = u.id
          LEFT JOIN students s ON s.id = us.student_id AND s.school_id = ? AND s.status = 'Activo'
          LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.school_id = ? AND se.course_id = ? AND se.status = 'Activa'
          LEFT JOIN course_teachers ct ON ct.user_id = u.id AND ct.course_id = ?
          WHERE u.school_id = ? AND u.is_active = 1 AND u.deleted_at IS NULL
            AND ((s.id IS NOT NULL AND (s.grade = ? OR se.id IS NOT NULL)) OR ct.user_id IS NOT NULL)`,
          user.school_id, user.school_id, course.id, course.id, user.school_id, course.grade)
    const recipientUsers = recipients.filter(recipient => recipient.id !== user.id)
    if (!recipientUsers.length) return json(response, 409, { error: 'No hay otras cuentas activas asociadas a los destinatarios seleccionados.' })
    const id = randomUUID()
    await db.transaction(async tx => {
      await tx.run('INSERT INTO communications (id, school_id, course_id, audience, title, body, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', id, user.school_id, audience === 'course' ? course.id : null, audience, title, content, user.id)
      for (const recipient of recipientUsers) {
        await tx.run('INSERT INTO communication_recipients (communication_id, user_id) VALUES (?, ?)', id, recipient.id)
        await tx.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category) VALUES (?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, recipient.id, `Nuevo comunicado: ${title}`, content.slice(0, 220), 'communication')
      }
    })
    await logAudit(user.school_id, user.id, `communication_created:${audience}`)
    return json(response, 201, { created: true, id, recipientCount: recipientUsers.length })
  }
  const communicationReadMatch = url.pathname.match(/^\/api\/communications\/([0-9a-f-]{36})\/read$/i)
  if (communicationReadMatch && method === 'PATCH') {
    const result = await db.run('UPDATE communication_recipients SET read_at = CURRENT_TIMESTAMP WHERE communication_id = ? AND user_id = ? AND communication_id IN (SELECT id FROM communications WHERE school_id = ?)', communicationReadMatch[1], user.id, user.school_id)
    if (!result.rowCount && !result.changes) return json(response, 404, { error: 'No encontramos esta comunicación en tu bandeja.' })
    return json(response, 200, { read: true })
  }
  const communicationDeleteMatch = url.pathname.match(/^\/api\/communications\/([0-9a-f-]{36})$/i)
  if (communicationDeleteMatch && method === 'DELETE') {
    const communication = await db.get('SELECT id, created_by AS "createdBy" FROM communications WHERE id = ? AND school_id = ?', communicationDeleteMatch[1], user.school_id)
    if (!communication) return json(response, 404, { error: 'No encontramos esta comunicación en el colegio.' })
    if (user.role !== 'admin' && communication.createdBy !== user.id) return json(response, 403, { error: 'Solo el autor o un administrador pueden eliminar esta comunicación.' })
    await db.transaction(async tx => { await tx.run('DELETE FROM communications WHERE id = ? AND school_id = ?', communication.id, user.school_id) })
    await logAudit(user.school_id, user.id, `communication_deleted:${communication.id}`)
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/reports/options' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar estos filtros.' })
    const courses = user.role === 'docente'
      ? await db.all(`SELECT c.id, c.name, c.grade, c.academic_year AS "academicYear" FROM courses c
          JOIN course_teachers ct ON ct.course_id = c.id WHERE c.school_id = ? AND ct.user_id = ?
          GROUP BY c.id ORDER BY c.academic_year DESC, c.grade, c.name`, user.school_id, user.id)
      : await db.all('SELECT id, name, grade, academic_year AS "academicYear" FROM courses WHERE school_id = ? ORDER BY academic_year DESC, grade, name', user.school_id)
    return json(response, 200, { courses })
  }
  if (url.pathname === '/api/reports' && method === 'GET') {
    const type = String(url.searchParams.get('type') || '')
    const allowedRoles = {
      students: ['admin', 'secretaria', 'docente'],
      attendance: ['admin', 'secretaria', 'docente'],
      grades: ['admin', 'secretaria', 'docente'],
      enrollments: ['admin', 'secretaria'],
      guardians: ['admin', 'secretaria'],
    }
    if (!allowedRoles[type]) return json(response, 400, { error: 'Selecciona un tipo de reporte válido.' })
    if (!allowedRoles[type].includes(user.role)) return json(response, 403, { error: 'Tu rol no tiene acceso a este reporte.' })
    const from = String(url.searchParams.get('from') || '')
    const to = String(url.searchParams.get('to') || '')
    const courseId = String(url.searchParams.get('courseId') || '')
    const academicYear = String(url.searchParams.get('academicYear') || '')
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json(response, 400, { error: 'Revisa el rango de fechas.' })
    if (academicYear && !/^\d{4}-\d{4}$/.test(academicYear)) return json(response, 400, { error: 'El año lectivo no es válido.' })
    let selectedCourse = null
    if (courseId) {
      selectedCourse = await db.get('SELECT id, grade FROM courses WHERE id = ? AND school_id = ?', courseId, user.school_id)
      if (!selectedCourse) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
      if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', courseId, user.id)) return json(response, 403, { error: 'Ese curso no está asignado a tu cuenta.' })
    }
    const params = [user.school_id]
    let sql = ''
    if (type === 'guardians') {
      sql = `SELECT st.guardian_name AS "Acudiente", st.guardian_phone AS "Teléfono",
        st.full_name AS "Estudiante asociado", st.grade AS "Grado", st.status AS "Estado del estudiante"
        FROM students st WHERE st.school_id = ? AND trim(COALESCE(st.guardian_name, '')) <> ''`
      if (selectedCourse) {
        sql += ` AND EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id
          AND se.student_id = st.id AND se.course_id = ?)`
        params.push(selectedCourse.id)
      }
      if (academicYear) {
        sql += ` AND EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id
          AND se.student_id = st.id AND se.academic_year = ?)`
        params.push(academicYear)
      }
      sql += ' ORDER BY st.guardian_name, st.full_name LIMIT 5001'
    } else if (type === 'students') {
      sql = `SELECT st.full_name AS "Estudiante", st.grade AS "Grado", st.status AS "Estado"
        FROM students st WHERE st.school_id = ?`
      if (selectedCourse) { sql += ' AND (st.grade = ? OR EXISTS (SELECT 1 FROM student_enrollments se WHERE se.student_id = st.id AND se.course_id = ? AND se.status = \'Activa\'))'; params.push(selectedCourse.grade, selectedCourse.id) }
      if (academicYear) { sql += ` AND EXISTS (SELECT 1 FROM courses cy WHERE cy.school_id = st.school_id AND cy.grade = st.grade AND cy.academic_year = ?)`; params.push(academicYear) }
      if (user.role === 'docente') { sql += ` AND EXISTS (SELECT 1 FROM course_teachers ct JOIN courses cc ON cc.id = ct.course_id WHERE ct.user_id = ? AND cc.school_id = st.school_id AND cc.grade = st.grade)`; params.push(user.id) }
      sql += ' ORDER BY st.grade, st.full_name LIMIT 5001'
    } else if (type === 'attendance') {
      sql = `SELECT st.full_name AS "Estudiante", c.grade AS "Grado", c.name AS "Curso", c.academic_year AS "Año lectivo",
        ar.attendance_date AS "Fecha", ar.status AS "Asistencia", actor.full_name AS "Registró"
        FROM attendance_records ar JOIN students st ON st.id = ar.student_id JOIN courses c ON c.id = ar.course_id
        JOIN users actor ON actor.id = ar.marked_by WHERE ar.school_id = ? AND c.school_id = ?`
      params.push(user.school_id)
      if (from) { sql += ' AND ar.attendance_date >= ?'; params.push(from) }
      if (to) { sql += ' AND ar.attendance_date <= ?'; params.push(to) }
      if (selectedCourse) { sql += ' AND c.id = ?'; params.push(selectedCourse.id) }
      if (academicYear) { sql += ' AND c.academic_year = ?'; params.push(academicYear) }
      if (user.role === 'docente') { sql += ' AND EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = c.id AND ct.user_id = ?)'; params.push(user.id) }
      sql += ' ORDER BY ar.attendance_date DESC, c.grade, st.full_name LIMIT 5001'
    } else if (type === 'grades') {
      sql = `SELECT st.full_name AS "Estudiante", c.grade AS "Grado", c.name AS "Curso", c.academic_year AS "Año lectivo",
        a.subject AS "Asignatura", a.period AS "Periodo", a.title AS "Evaluación", sg.score AS "Nota", a.max_score AS "Nota máxima",
        sg.updated_at AS "Actualizada"
        FROM student_grades sg JOIN students st ON st.id = sg.student_id
        JOIN grade_assessments a ON a.id = sg.assessment_id JOIN courses c ON c.id = a.course_id
        WHERE a.school_id = ? AND c.school_id = ?`
      params.push(user.school_id)
      if (from) { sql += ' AND substr(sg.updated_at, 1, 10) >= ?'; params.push(from) }
      if (to) { sql += ' AND substr(sg.updated_at, 1, 10) <= ?'; params.push(to) }
      if (selectedCourse) { sql += ' AND c.id = ?'; params.push(selectedCourse.id) }
      if (academicYear) { sql += ' AND c.academic_year = ?'; params.push(academicYear) }
      if (user.role === 'docente') { sql += ' AND EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = c.id AND ct.subject = a.subject AND ct.user_id = ?)'; params.push(user.id) }
      sql += ' ORDER BY c.grade, a.subject, a.period, st.full_name LIMIT 5001'
    } else {
      sql = `SELECT st.full_name AS "Estudiante", st.document AS "Documento", se.academic_year AS "Año lectivo",
        c.grade AS "Grado", c.name AS "Curso", se.start_date AS "Inicio", se.end_date AS "Fin", se.status AS "Estado"
        FROM student_enrollments se JOIN students st ON st.id = se.student_id LEFT JOIN courses c ON c.id = se.course_id
        WHERE se.school_id = ? AND st.school_id = ?`
      params.push(user.school_id)
      if (from) { sql += ' AND se.start_date >= ?'; params.push(from) }
      if (to) { sql += ' AND se.start_date <= ?'; params.push(to) }
      if (selectedCourse) { sql += ' AND se.course_id = ?'; params.push(selectedCourse.id) }
      if (academicYear) { sql += ' AND se.academic_year = ?'; params.push(academicYear) }
      sql += ' ORDER BY se.academic_year DESC, c.grade, st.full_name LIMIT 5001'
    }
    const resultRows = await db.all(sql, ...params)
    return json(response, 200, { records: resultRows.slice(0, 5000), truncated: resultRows.length > 5000 })
  }

  if (url.pathname === '/api/users' && method === 'GET') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo un administrador puede consultar las cuentas del colegio.' })
    const users = await db.all(`SELECT id, email, full_name AS name, role, is_active AS active, created_at AS "createdAt"
      FROM users WHERE school_id = ? AND deleted_at IS NULL ORDER BY full_name`, user.school_id)
    const linked = await Promise.all(users.map(async account => ({ ...account, studentIds: (await db.all('SELECT student_id FROM user_students WHERE user_id = ?', account.id)).map(row => row.student_id) })))
    return json(response, 200, { users: linked })
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
  const userRecordMatch = url.pathname.match(/^\/api\/users\/([0-9a-f-]{36})$/i)
  if (userRecordMatch && method === 'PUT') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo un administrador puede editar cuentas.' })
    const targetId = userRecordMatch[1]
    const current = await db.get('SELECT id, role FROM users WHERE id = ? AND school_id = ? AND deleted_at IS NULL', targetId, user.school_id)
    if (!current) return json(response, 404, { error: 'No encontramos esa cuenta en este colegio.' })
    const body = await readBody(request)
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const role = String(body.role || '')
    const password = String(body.password || '')
    const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds.map(value => String(value)))] : []
    if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !accountRoles.has(role)) return json(response, 400, { error: 'Revisa el nombre, correo y rol de la cuenta.' })
    if (password && (password.length < 12 || password.length > 128)) return json(response, 400, { error: 'La nueva contraseña debe tener entre 12 y 128 caracteres.' })
    if (targetId === user.id && role !== current.role) return json(response, 400, { error: 'No puedes cambiar tu propio rol administrativo.' })
    if (role === 'acudiente' && studentIds.length === 0) return json(response, 400, { error: 'Asocia al menos un estudiante activo a la cuenta del acudiente.' })
    if (role === 'estudiante' && studentIds.length !== 1) return json(response, 400, { error: 'Asocia exactamente un estudiante activo a esta cuenta.' })
    if (!['acudiente', 'estudiante'].includes(role) && studentIds.length) return json(response, 400, { error: 'Este rol no puede asociarse directamente a estudiantes.' })
    for (const studentId of studentIds) if (!await db.get("SELECT id FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", studentId, user.school_id)) return json(response, 400, { error: 'Uno de los estudiantes seleccionados no está activo en este colegio.' })
    try {
      const passwordHash = password ? await hashPassword(password) : null
      await db.transaction(async tx => {
        await tx.run(`UPDATE users SET email = ?, full_name = ?, role = ?, password_hash = COALESCE(?, password_hash)
          WHERE id = ? AND school_id = ?`, email, name, role, passwordHash, targetId, user.school_id)
        await tx.run('DELETE FROM user_students WHERE user_id = ?', targetId)
        for (const studentId of studentIds) await tx.run('INSERT INTO user_students (user_id, student_id, relationship) VALUES (?, ?, ?)', targetId, studentId, role)
        if (role !== 'docente') await tx.run('DELETE FROM course_teachers WHERE user_id = ?', targetId)
      })
    } catch (error) {
      if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya existe una cuenta con ese correo en el colegio.' })
      throw error
    }
    if (password) await db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', targetId, hashToken(cookieToken(request)))
    await logAudit(user.school_id, user.id, 'user_updated')
    return json(response, 200, { id: targetId, email, name, role })
  }
  if (userRecordMatch && method === 'DELETE') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo un administrador puede eliminar cuentas.' })
    const targetId = userRecordMatch[1]
    if (targetId === user.id) return json(response, 400, { error: 'No puedes eliminar tu propia cuenta.' })
    const target = await db.get('SELECT id, role, is_active FROM users WHERE id = ? AND school_id = ? AND deleted_at IS NULL', targetId, user.school_id)
    if (!target) return json(response, 404, { error: 'No encontramos esa cuenta en este colegio.' })
    if (target.role === 'admin' && target.is_active && Number((await db.get("SELECT COUNT(*) AS count FROM users WHERE school_id = ? AND role = 'admin' AND is_active = 1 AND deleted_at IS NULL", user.school_id)).count) <= 1) return json(response, 409, { error: 'No se puede eliminar al último administrador activo del colegio.' })
    const replacementEmail = `deleted-${targetId}@invalid.local`
    await db.transaction(async tx => {
      await tx.run('UPDATE users SET email = ?, is_active = 0, deleted_at = ? WHERE id = ? AND school_id = ?', replacementEmail, new Date().toISOString(), targetId, user.school_id)
      await tx.run('DELETE FROM sessions WHERE user_id = ?', targetId)
      await tx.run('DELETE FROM user_students WHERE user_id = ?', targetId)
      await tx.run('DELETE FROM course_teachers WHERE user_id = ?', targetId)
    })
    await logAudit(user.school_id, user.id, 'user_deleted')
    return json(response, 200, { deleted: true })
  }
  const userStatusMatch = url.pathname.match(/^\/api\/users\/([0-9a-f-]{36})\/status$/i)
  if (userStatusMatch && method === 'PATCH') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo un administrador puede cambiar el estado de una cuenta.' })
    const targetId = userStatusMatch[1]
    if (targetId === user.id) return json(response, 400, { error: 'No puedes desactivar tu propia cuenta.' })
    const body = await readBody(request)
    if (typeof body.active !== 'boolean') return json(response, 400, { error: 'Indica el nuevo estado de la cuenta.' })
    const target = await db.get('SELECT role, is_active FROM users WHERE id = ? AND school_id = ? AND deleted_at IS NULL', targetId, user.school_id)
    if (!target) return json(response, 404, { error: 'No encontramos esa cuenta en tu colegio.' })
    if (!body.active && target.role === 'admin' && target.is_active && Number((await db.get("SELECT COUNT(*) AS count FROM users WHERE school_id = ? AND role = 'admin' AND is_active = 1 AND deleted_at IS NULL", user.school_id)).count) <= 1) return json(response, 409, { error: 'No se puede desactivar al último administrador activo del colegio.' })
    const result = await db.run('UPDATE users SET is_active = ? WHERE id = ? AND school_id = ? AND deleted_at IS NULL', body.active ? 1 : 0, targetId, user.school_id)
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
  if (url.pathname === '/api/portal/digital-card' && method === 'GET') {
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'El carné digital está disponible para cuentas de estudiante y acudiente.' })
    const students = await db.all(`SELECT st.id, st.card_code AS "cardCode", (st.photo_data IS NOT NULL) AS "hasPhoto", st.full_name AS "studentName", st.grade, st.status, us.relationship,
      s.name AS "schoolName", s.primary_color AS "primaryColor", s.logo_content_type AS "logoContentType",
      COALESCE(en.academic_year, '') AS "academicYear"
      FROM user_students us JOIN students st ON st.id = us.student_id JOIN schools s ON s.id = st.school_id
      LEFT JOIN student_enrollments en ON en.id = (SELECT e.id FROM student_enrollments e WHERE e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'Activa' ORDER BY e.start_date DESC LIMIT 1)
      WHERE us.user_id = ? AND st.school_id = ? ORDER BY st.full_name`, user.id, user.school_id)
    return json(response, 200, { cards: students.map(student => ({ ...student, hasLogo: Boolean(student.logoContentType) })) })
  }
  const cardPhotoMatch = url.pathname.match(/^\/api\/portal\/digital-card\/([0-9a-f-]{36})\/photo$/i)
  if (cardPhotoMatch && method === 'GET') {
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar esta foto.' })
    const photo = await db.get(`SELECT st.photo_data AS data, st.photo_content_type AS "contentType" FROM students st
      JOIN user_students us ON us.student_id = st.id WHERE st.id = ? AND st.school_id = ? AND us.user_id = ?`, cardPhotoMatch[1], user.school_id, user.id)
    if (!photo?.data || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.contentType)) return json(response, 404, { error: 'No hay una foto disponible.' })
    response.writeHead(200, { 'Content-Type': photo.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
    return response.end(photo.data)
  }
  const certificateRoles = ['admin', 'rectoria', 'coordinacion', 'secretaria']
  if (url.pathname === '/api/certificates/options' && method === 'GET') {
    if (![...certificateRoles, 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para emitir constancias.' })
    const students = ['acudiente', 'estudiante'].includes(user.role)
      ? await db.all("SELECT st.id, st.full_name AS name, st.grade, st.status FROM user_students us JOIN students st ON st.id = us.student_id WHERE us.user_id = ? AND st.school_id = ? AND st.status = 'Activo' ORDER BY st.full_name", user.id, user.school_id)
      : await db.all("SELECT id, full_name AS name, grade, status FROM students WHERE school_id = ? AND status = 'Activo' ORDER BY full_name LIMIT 2000", user.school_id)
    return json(response, 200, { students })
  }
  if (url.pathname === '/api/certificates' && method === 'GET') {
    if (![...certificateRoles, 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar constancias.' })
    const linkedOnly = ['acudiente', 'estudiante'].includes(user.role)
    const history = await db.all(`SELECT d.id, d.certificate_number AS "certificateNumber", d.certificate_type AS "certificateType",
      d.student_id AS "studentId", d.student_name AS "studentName", d.grade, d.academic_year AS "academicYear", d.created_at AS "issuedAt", s.name AS "schoolName",
      d.status, d.rector_name AS "rectorName", d.signed_at AS "signedAt", d.annul_note AS "annulNote"
      FROM school_certificates d JOIN schools s ON s.id = d.school_id WHERE d.school_id = ? ${linkedOnly ? "AND d.status = 'Emitida' AND EXISTS (SELECT 1 FROM user_students us WHERE us.user_id = ? AND us.student_id = d.student_id)" : ''}
      ORDER BY d.created_at DESC LIMIT 100`, ...(linkedOnly ? [user.school_id, user.id] : [user.school_id]))
    return json(response, 200, { certificates: history })
  }
  const certificateMatch = url.pathname.match(/^\/api\/certificates\/([0-9a-f-]{36})$/i)
  if (certificateMatch && method === 'GET') {
    if (![...certificateRoles, 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar constancias.' })
    const certificate = await db.get(`SELECT d.id, d.certificate_number AS "certificateNumber", d.certificate_type AS "certificateType",
      d.student_id AS "studentId", d.student_name AS "studentName", d.grade, d.academic_year AS "academicYear", d.created_at AS "issuedAt",
      d.rector_name AS "rectorName", d.signed_at AS "signedAt", d.status,
      s.name AS "schoolName", s.address, s.contact_email AS "contactEmail", s.contact_phone AS "contactPhone"
      FROM school_certificates d JOIN schools s ON s.id = d.school_id WHERE d.id = ? AND d.school_id = ? AND d.status = 'Emitida'`, certificateMatch[1], user.school_id)
    if (!certificate) return json(response, 404, { error: 'No encontramos esa constancia.' })
    if (['acudiente', 'estudiante'].includes(user.role) && !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, certificate.studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    return json(response, 200, { certificate })
  }
  if (url.pathname === '/api/certificates' && method === 'POST') {
    if (![...certificateRoles, 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para emitir constancias.' })
    const body = await readBody(request), studentId = String(body.studentId || ''), type = String(body.certificateType || ''), academicYearInput = String(body.academicYear || '').trim(), replacesId = String(body.replacesCertificateId || '')
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || !['Constancia de estudio', 'Constancia de matrícula'].includes(type) || academicYearInput && !/^\d{4}(?:-\d{4})?$/.test(academicYearInput) || replacesId && !/^[0-9a-f-]{36}$/i.test(replacesId)) return json(response, 400, { error: 'Revisa el estudiante, tipo de constancia y año lectivo.' })
    const student = await db.get("SELECT st.id, st.full_name AS name, st.grade, st.status, st.school_id AS schoolId FROM students st WHERE st.id = ? AND st.school_id = ? AND st.status = 'Activo'", studentId, user.school_id)
    if (!student) return json(response, 404, { error: 'No encontramos un estudiante activo en este colegio.' })
    if (['acudiente', 'estudiante'].includes(user.role) && !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    const enrollment = await db.get(`SELECT academic_year AS "academicYear" FROM student_enrollments WHERE school_id = ? AND student_id = ? AND status = 'Activa' ORDER BY start_date DESC LIMIT 1`, user.school_id, studentId)
    const academicYear = academicYearInput || enrollment?.academicYear || `${new Date().getFullYear()}`
    if (type === 'Constancia de matrícula' && !await db.get("SELECT id FROM student_enrollments WHERE school_id = ? AND student_id = ? AND academic_year = ? AND status = 'Activa'", user.school_id, studentId, academicYear)) return json(response, 409, { error: 'No hay una matrícula activa para ese año lectivo.' })
    if (replacesId) {
      const original = await db.get("SELECT id, student_id AS \"studentId\", status FROM school_certificates WHERE id = ? AND school_id = ?", replacesId, user.school_id)
      if (!original || original.status !== 'Emitida' || original.studentId !== studentId) return json(response, 409, { error: 'Solo puedes solicitar corrección de una constancia vigente de este estudiante.' })
    }
    const rectors = await db.all("SELECT id FROM users WHERE school_id = ? AND role = 'rectoria' AND is_active = 1 AND deleted_at IS NULL", user.school_id)
    if (!rectors.length) return json(response, 409, { error: 'El colegio debe tener una cuenta activa con rol de Rectoría para revisar solicitudes.' })
    const id = randomUUID()
    await db.run(`INSERT INTO school_certificate_requests (id, school_id, student_id, certificate_type, academic_year, requested_by, replaces_certificate_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, id, user.school_id, studentId, type, academicYear, user.id, replacesId || null)
    for (const rector of rectors) await db.run("INSERT INTO user_notifications (id, school_id, user_id, title, body, category) VALUES (?, ?, ?, ?, ?, ?)", randomUUID(), user.school_id, rector.id, 'Solicitud de constancia pendiente', `${student.name} · ${type}`, 'certificate')
    await logAudit(user.school_id, user.id, 'certificate_request_created')
    return json(response, 201, { request: { id, studentId, certificateType: type, academicYear, status: 'Pendiente' } })
  }
  if (url.pathname === '/api/certificate-requests' && method === 'GET') {
    if (![...certificateRoles, 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para ver solicitudes.' })
    const family = ['acudiente', 'estudiante'].includes(user.role)
    const requests = await db.all(`SELECT r.id, r.student_id AS "studentId", st.full_name AS "studentName", st.grade,
      r.certificate_type AS "certificateType", r.academic_year AS "academicYear", r.status, r.review_note AS "reviewNote",
      r.created_at AS "createdAt", u.full_name AS "requestedByName", r.requested_by AS "requestedBy",
      r.replaces_certificate_id AS "replacesCertificateId", c.certificate_number AS "replacesCertificateNumber"
      FROM school_certificate_requests r JOIN students st ON st.id = r.student_id JOIN users u ON u.id = r.requested_by
      LEFT JOIN school_certificates c ON c.id = r.replaces_certificate_id
      WHERE r.school_id = ? ${family ? 'AND r.requested_by = ?' : ''} ORDER BY r.created_at DESC LIMIT 200`, ...(family ? [user.school_id, user.id] : [user.school_id]))
    return json(response, 200, { requests })
  }
  const certRequestMatch = url.pathname.match(/^\/api\/certificate-requests\/([0-9a-f-]{36})$/i)
  if (certRequestMatch && method === 'PATCH') {
    const id = certRequestMatch[1], body = await readBody(request)
    const requestRow = await db.get('SELECT * FROM school_certificate_requests WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!requestRow) return json(response, 404, { error: 'No encontramos esa solicitud.' })
    if (body.status) {
      if (user.role !== 'rectoria') return json(response, 403, { error: 'Solo rectoría puede aprobar o rechazar solicitudes.' })
      const decision = String(body.status), note = String(body.note || '').trim()
      if (!['Aprobada', 'Rechazada'].includes(decision) || decision === 'Rechazada' && note.length < 3 || note.length > 500) return json(response, 400, { error: 'Indica si apruebas o rechazas y agrega un motivo al rechazar.' })
      let issuedCertificate = null
      try {
        await db.transaction(async tx => {
          const current = await tx.get(`SELECT * FROM school_certificate_requests WHERE id = ? AND school_id = ?${databaseType === 'postgres' ? ' FOR UPDATE' : ''}`, id, user.school_id)
          if (!current || current.status !== 'Pendiente') throw Object.assign(new Error('La solicitud ya fue revisada o cancelada.'), { status: 409 })
          let certificateId = null
          if (decision === 'Aprobada') {
            const student = await tx.get("SELECT id, full_name AS name, grade FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", current.student_id, user.school_id)
            if (!student) throw Object.assign(new Error('El estudiante ya no está activo; no se puede emitir el documento.'), { status: 409 })
            if (current.certificate_type === 'Constancia de matrícula' && !await tx.get("SELECT id FROM student_enrollments WHERE school_id = ? AND student_id = ? AND academic_year = ? AND status = 'Activa'", user.school_id, current.student_id, current.academic_year)) throw Object.assign(new Error('No hay matrícula activa para ese año lectivo.'), { status: 409 })
            const prior = current.replaces_certificate_id ? await tx.get("SELECT id FROM school_certificates WHERE id = ? AND school_id = ? AND status = 'Emitida'", current.replaces_certificate_id, user.school_id) : null
            if (current.replaces_certificate_id && !prior) throw Object.assign(new Error('La constancia que se quería corregir ya no está vigente.'), { status: 409 })
            const issuedAt = new Date().toISOString(), certificateNumber = `EDU-${issuedAt.slice(0, 4)}-${randomUUID().slice(0, 8).toUpperCase()}`
            certificateId = randomUUID()
            await tx.run(`INSERT INTO school_certificates (id, school_id, student_id, certificate_number, certificate_type, student_name, grade, academic_year, issued_by, status, rector_user_id, rector_name, signed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Emitida', ?, ?, ?)`, certificateId, user.school_id, current.student_id, certificateNumber, current.certificate_type, student.name, student.grade, current.academic_year, user.id, user.id, user.name, issuedAt)
            if (prior) await tx.run("UPDATE school_certificates SET status = 'Reemplazada', replaced_by_id = ? WHERE id = ? AND school_id = ?", certificateId, prior.id, user.school_id)
            issuedCertificate = { id: certificateId, certificateNumber }
          }
          await tx.run('UPDATE school_certificate_requests SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND school_id = ?', decision, note, user.id, new Date().toISOString(), id, user.school_id)
          const recipient = await tx.get('SELECT requested_by FROM school_certificate_requests WHERE id = ?', id)
          await tx.run("INSERT INTO user_notifications (id, school_id, user_id, title, body, category) VALUES (?, ?, ?, ?, ?, ?)", randomUUID(), user.school_id, recipient.requested_by, `Solicitud ${decision.toLocaleLowerCase('es')}`, note || 'La constancia fue aprobada y quedó disponible.', 'certificate')
        })
      } catch (error) { if (error.status) return json(response, error.status, { error: error.message }); throw error }
      await logAudit(user.school_id, user.id, `certificate_request_${decision === 'Aprobada' ? 'approved' : 'rejected'}`)
      return json(response, 200, { status: decision, certificateId: issuedCertificate?.id })
    }
    if (!['admin', 'rectoria'].includes(user.role) && requestRow.requested_by !== user.id) return json(response, 403, { error: 'Solo quien solicitó o rectoría puede editar una solicitud.' })
    if (requestRow.status !== 'Pendiente') return json(response, 409, { error: 'Solo se pueden editar solicitudes pendientes.' })
    const type = String(body.certificateType || requestRow.certificate_type), academicYear = String(body.academicYear || requestRow.academic_year)
    if (!['Constancia de estudio', 'Constancia de matrícula'].includes(type) || !/^\d{4}(?:-\d{4})?$/.test(academicYear)) return json(response, 400, { error: 'Revisa el tipo de constancia y año lectivo.' })
    await db.run('UPDATE school_certificate_requests SET certificate_type = ?, academic_year = ? WHERE id = ? AND school_id = ? AND status = ?', type, academicYear, id, user.school_id, 'Pendiente')
    await logAudit(user.school_id, user.id, 'certificate_request_updated')
    return json(response, 200, { id, status: 'Pendiente', certificateType: type, academicYear })
  }
  if (certRequestMatch && method === 'DELETE') {
    const row = await db.get('SELECT requested_by, status FROM school_certificate_requests WHERE id = ? AND school_id = ?', certRequestMatch[1], user.school_id)
    if (!row) return json(response, 404, { error: 'No encontramos esa solicitud.' })
    if (row.status !== 'Pendiente') return json(response, 409, { error: 'Solo se pueden cancelar solicitudes pendientes.' })
    if (!['admin', 'rectoria'].includes(user.role) && row.requested_by !== user.id) return json(response, 403, { error: 'Solo quien solicitó la constancia o rectoría puede cancelarla.' })
    await db.run("UPDATE school_certificate_requests SET status = 'Cancelada' WHERE id = ? AND school_id = ?", certRequestMatch[1], user.school_id)
    await logAudit(user.school_id, user.id, 'certificate_request_cancelled')
    return json(response, 200, { status: 'Cancelada' })
  }
  if (certificateMatch && method === 'DELETE') {
    if (!['admin', 'rectoria'].includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden anular constancias emitidas.' })
    const body = await readBody(request), reason = String(body.reason || '').trim()
    if (reason.length < 3 || reason.length > 500) return json(response, 400, { error: 'Indica el motivo de anulación.' })
    const result = await db.run("UPDATE school_certificates SET status = 'Anulada', annul_note = ?, annulled_by = ?, annulled_at = ? WHERE id = ? AND school_id = ? AND status = 'Emitida'", reason, user.id, new Date().toISOString(), certificateMatch[1], user.school_id)
    if (!result.changes && !result.rowCount) return json(response, 404, { error: 'No encontramos una constancia vigente para anular.' })
    await logAudit(user.school_id, user.id, 'school_certificate_annulled')
    return json(response, 200, { status: 'Anulada' })
  }
  if (url.pathname === '/api/teachers' && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar docentes.' })
    const teachers = await db.all("SELECT id, full_name AS name FROM users WHERE school_id = ? AND role = 'docente' AND is_active = 1 AND deleted_at IS NULL ORDER BY full_name", user.school_id)
    return json(response, 200, { teachers })
  }

  if (url.pathname === '/api/courses' && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar los cursos.' })
    const courses = await db.all(`SELECT c.id, c.name, c.grade, c.academic_year AS "academicYear", c.is_active AS "isActive",
      COUNT(DISTINCT ct.user_id) AS "teacherCount"
      FROM courses c LEFT JOIN course_teachers ct ON ct.course_id = c.id
      WHERE c.school_id = ? GROUP BY c.id ORDER BY c.academic_year DESC, c.grade`, user.school_id)
    const mapped = await Promise.all(courses.map(async course => ({ ...course, teacherCount: Number(course.teacherCount), teachers: await db.all(`SELECT u.id, u.full_name AS name, ct.subject
      FROM course_teachers ct JOIN users u ON u.id = ct.user_id WHERE ct.course_id = ? AND u.deleted_at IS NULL ORDER BY u.full_name, ct.subject`, course.id) })))
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
    catch (error) {
      if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) {
        const archived = await db.get('SELECT id FROM courses WHERE school_id = ? AND academic_year = ? AND grade = ? AND is_active = 0', user.school_id, academicYear, grade)
        if (archived) {
          await db.run('UPDATE courses SET name = ?, is_active = 1 WHERE id = ? AND school_id = ?', name, archived.id, user.school_id)
          await logAudit(user.school_id, user.id, 'course_reactivated')
          return json(response, 200, { course: { id: archived.id, name, grade, academicYear, isActive: 1 }, restored: true })
        }
        return json(response, 409, { error: 'Ya existe un curso para ese grado y año lectivo.' })
      }
      throw error
    }
    await logAudit(user.school_id, user.id, 'course_created')
    return json(response, 201, { course: { id, name, grade, academicYear, teachers: [] } })
  }
  const courseRecordMatch = url.pathname.match(/^\/api\/courses\/([0-9a-f-]{36})$/i)
  if (courseRecordMatch && method === 'PATCH') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para editar cursos.' })
    const id = courseRecordMatch[1]
    const current = await db.get('SELECT id, name, grade, academic_year AS "academicYear" FROM courses WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!current) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    const body = await readBody(request)
    const name = String(body.name || '').trim()
    const grade = String(body.grade || '').trim()
    const academicYear = String(body.academicYear || '').trim()
    if (name.length < 2 || name.length > 80 || grade.length < 2 || grade.length > 40 || !/^\d{4}-\d{4}$/.test(academicYear)) return json(response, 400, { error: 'Revisa el nombre, grado y año lectivo (AAAA-AAAA).' })
    if ((grade !== current.grade || academicYear !== current.academicYear) && (Number((await db.get('SELECT COUNT(*) AS count FROM attendance_records WHERE course_id = ?', id)).count) > 0 || Number((await db.get('SELECT COUNT(*) AS count FROM grade_assessments WHERE course_id = ?', id)).count) > 0)) return json(response, 409, { error: 'Este curso ya tiene asistencia o evaluaciones. Para conservar su historial, solo puedes cambiar el nombre; crea otro curso si cambia el grado o año.' })
    try { await db.run('UPDATE courses SET name = ?, grade = ?, academic_year = ? WHERE id = ? AND school_id = ?', name, grade, academicYear, id, user.school_id) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya existe otro curso para ese grado y año lectivo.' }); throw error }
    await logAudit(user.school_id, user.id, 'course_updated')
    return json(response, 200, { course: { ...current, name, grade, academicYear } })
  }
  if (courseRecordMatch && method === 'DELETE') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para dar de baja cursos.' })
    const result = await db.run('UPDATE courses SET is_active = 0 WHERE id = ? AND school_id = ? AND is_active = 1', courseRecordMatch[1], user.school_id)
    if ((result.rowCount ?? result.changes) === 0) return json(response, 404, { error: 'No encontramos un curso activo con ese identificador.' })
    await logAudit(user.school_id, user.id, 'course_archived')
    return json(response, 200, { archived: true })
  }
  const courseStatusMatch = url.pathname.match(/^\/api\/courses\/([0-9a-f-]{36})\/status$/i)
  if (courseStatusMatch && method === 'PATCH') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para cambiar el estado del curso.' })
    const body = await readBody(request)
    if (typeof body.active !== 'boolean') return json(response, 400, { error: 'Indica si el curso debe quedar activo.' })
    const result = await db.run('UPDATE courses SET is_active = ? WHERE id = ? AND school_id = ?', body.active ? 1 : 0, courseStatusMatch[1], user.school_id)
    if ((result.rowCount ?? result.changes) === 0) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    await logAudit(user.school_id, user.id, body.active ? 'course_reactivated' : 'course_archived')
    return json(response, 200, { id: courseStatusMatch[1], active: body.active })
  }
  const courseHistoryMatch = url.pathname.match(/^\/api\/courses\/([0-9a-f-]{36})\/history$/i)
  if (courseHistoryMatch && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden consultar el historial del curso.' })
    const course = await db.get('SELECT id, name, grade, academic_year AS "academicYear", is_active AS "isActive" FROM courses WHERE id = ? AND school_id = ?', courseHistoryMatch[1], user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    const kind = String(url.searchParams.get('kind') || '')
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50))
    const offset = Math.min(1_000_000, Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0))
    if (kind === 'attendance') {
      const total = Number((await db.get('SELECT COUNT(*) AS count FROM attendance_records WHERE school_id = ? AND course_id = ?', user.school_id, course.id)).count)
      const records = await db.all(`SELECT st.full_name AS "studentName", st.grade, ar.attendance_date AS "attendanceDate",
        ar.status, ar.marked_at AS "markedAt", marker.full_name AS "markedBy"
        FROM attendance_records ar JOIN students st ON st.id = ar.student_id JOIN users marker ON marker.id = ar.marked_by
        WHERE ar.school_id = ? AND ar.course_id = ?
        ORDER BY ar.attendance_date DESC, st.full_name LIMIT ? OFFSET ?`, user.school_id, course.id, limit, offset)
      return json(response, 200, { course, kind, records, total, limit, offset })
    }
    if (kind === 'grades') {
      const total = Number((await db.get(`SELECT COUNT(*) AS count FROM student_grades sg JOIN grade_assessments ga ON ga.id = sg.assessment_id
        WHERE ga.school_id = ? AND ga.course_id = ?`, user.school_id, course.id)).count)
      const records = await db.all(`SELECT st.full_name AS "studentName", st.grade, ga.title AS "assessmentTitle",
        ga.subject, ga.period, sg.score, ga.max_score AS "maxScore", sg.comment,
        sg.updated_at AS "updatedAt", editor.full_name AS "updatedBy"
        FROM student_grades sg JOIN grade_assessments ga ON ga.id = sg.assessment_id
        JOIN students st ON st.id = sg.student_id JOIN users editor ON editor.id = sg.updated_by
        WHERE ga.school_id = ? AND ga.course_id = ?
        ORDER BY sg.updated_at DESC, st.full_name LIMIT ? OFFSET ?`, user.school_id, course.id, limit, offset)
      return json(response, 200, { course, kind, records: records.map(record => ({ ...record, score: Number(record.score), maxScore: Number(record.maxScore) })), total, limit, offset })
    }
    return json(response, 400, { error: 'Selecciona un tipo de historial válido.' })
  }
  const courseTeacherMatch = url.pathname.match(/^\/api\/courses\/([0-9a-f-]{36})\/teachers$/i)
  if (courseTeacherMatch && method === 'POST') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para asignar docentes.' })
    const body = await readBody(request)
    const teacherId = String(body.teacherId || '')
    const subject = String(body.subject || '').trim()
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseTeacherMatch[1], user.school_id)
    const teacher = await db.get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'docente' AND is_active = 1", teacherId, user.school_id)
    if (!course || !teacher) return json(response, 404, { error: 'No encontramos el curso o el docente activo en este colegio.' })
    if (subject.length < 2 || subject.length > 80) return json(response, 400, { error: 'Escribe una asignatura válida.' })
    try { await db.run('INSERT INTO course_teachers (course_id, user_id, subject) VALUES (?, ?, ?)', course.id, teacher.id, subject) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ese docente ya tiene asignada esa asignatura en el curso.' }); throw error }
    await logAudit(user.school_id, user.id, 'teacher_assigned')
    return json(response, 201, { assigned: true })
  }
  if (courseTeacherMatch && method === 'PUT') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para editar asignaciones docentes.' })
    const body = await readBody(request)
    const originalTeacherId = String(body.originalTeacherId || '')
    const originalSubject = String(body.originalSubject || '').trim()
    const teacherId = String(body.teacherId || '')
    const subject = String(body.subject || '').trim()
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseTeacherMatch[1], user.school_id)
    const teacher = await db.get("SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'docente' AND is_active = 1 AND deleted_at IS NULL", teacherId, user.school_id)
    const assignment = await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ? AND subject = ?', courseTeacherMatch[1], originalTeacherId, originalSubject)
    if (!course || !teacher || !assignment) return json(response, 404, { error: 'No encontramos el curso, la asignación o el docente activo.' })
    if (subject.length < 2 || subject.length > 80) return json(response, 400, { error: 'Escribe una asignatura válida.' })
    try { await db.run('UPDATE course_teachers SET user_id = ?, subject = ? WHERE course_id = ? AND user_id = ? AND subject = ?', teacher.id, subject, course.id, originalTeacherId, originalSubject) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ese docente ya tiene asignada esa asignatura en el curso.' }); throw error }
    await logAudit(user.school_id, user.id, 'teacher_assignment_updated')
    return json(response, 200, { updated: true })
  }
  if (courseTeacherMatch && method === 'DELETE') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para quitar asignaciones docentes.' })
    const body = await readBody(request)
    const teacherId = String(body.teacherId || '')
    const subject = String(body.subject || '').trim()
    const result = await db.run(`DELETE FROM course_teachers WHERE course_id = ? AND user_id = ? AND subject = ?
      AND course_id IN (SELECT id FROM courses WHERE school_id = ?)`, courseTeacherMatch[1], teacherId, subject, user.school_id)
    if ((result.rowCount ?? result.changes) === 0) return json(response, 404, { error: 'No encontramos esa asignación en este colegio.' })
    await logAudit(user.school_id, user.id, 'teacher_assignment_deleted')
    return json(response, 200, { deleted: true })
  }
  if (url.pathname === '/api/teacher/courses' && method === 'GET') {
    if (user.role !== 'docente') return json(response, 403, { error: 'Este acceso es solo para docentes.' })
    const courses = await db.all(`SELECT c.id, c.name, c.grade, c.academic_year AS "academicYear", ct.subject,
      (SELECT COUNT(*) FROM students st WHERE st.school_id = c.school_id AND st.grade = c.grade AND st.status = 'Activo') AS "studentCount"
      FROM course_teachers ct JOIN courses c ON c.id = ct.course_id
      WHERE ct.user_id = ? AND c.school_id = ? AND c.is_active = 1 ORDER BY c.academic_year DESC, c.grade, ct.subject`, user.id, user.school_id)
    return json(response, 200, { courses: courses.map(course => ({ ...course, studentCount: Number(course.studentCount) })) })
  }
  const teacherRosterMatch = url.pathname.match(/^\/api\/teacher\/courses\/([0-9a-f-]{36})\/students$/i)
  if (teacherRosterMatch && method === 'GET') {
    if (user.role !== 'docente') return json(response, 403, { error: 'Este acceso es solo para docentes.' })
    const course = await db.get(`SELECT c.id, c.grade FROM course_teachers ct JOIN courses c ON c.id = ct.course_id
      WHERE c.id = ? AND ct.user_id = ? AND c.school_id = ? AND c.is_active = 1`, teacherRosterMatch[1], user.id, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso asignado a tu cuenta.' })
    const students = await db.all("SELECT id, full_name AS name, grade, status FROM students WHERE school_id = ? AND grade = ? AND status = 'Activo' ORDER BY full_name", user.school_id, course.grade)
    return json(response, 200, { students })
  }

  if (url.pathname === '/api/attendance' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar asistencia.' })
    const courseId = String(url.searchParams.get('courseId') || '')
    const attendanceDate = String(url.searchParams.get('date') || '')
    if (!validDate(attendanceDate)) return json(response, 400, { error: 'Selecciona una fecha válida.' })
    const course = await db.get('SELECT id, grade, name, academic_year AS "academicYear" FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
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
    if (records.some(record => !/^[0-9a-f-]{36}$/i.test(record.studentId) || (record.status && !allowedStatuses.has(record.status))) || new Set(records.map(record => record.studentId)).size !== records.length) return json(response, 400, { error: 'Revisa los estados de asistencia seleccionados; no se permiten estudiantes repetidos.' })
    const course = await db.get('SELECT id, grade FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', course.id, user.id)) return json(response, 403, { error: 'Ese curso no está asignado a tu cuenta.' })
    for (const record of records) {
      if (!await db.get("SELECT id FROM students WHERE id = ? AND school_id = ? AND grade = ? AND status = 'Activo'", record.studentId, user.school_id, course.grade)) return json(response, 400, { error: 'Uno de los estudiantes no pertenece a este grupo activo.' })
    }
    await db.transaction(async tx => {
      for (const record of records) {
        if (!record.status) {
          await tx.run('DELETE FROM attendance_records WHERE school_id = ? AND course_id = ? AND student_id = ? AND attendance_date = ?', user.school_id, course.id, record.studentId, attendanceDate)
          continue
        }
        await tx.run(`INSERT INTO attendance_records (id, school_id, course_id, student_id, attendance_date, status, marked_by, marked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(course_id, student_id, attendance_date) DO UPDATE SET
            status = excluded.status, marked_by = excluded.marked_by, marked_at = excluded.marked_at`,
          randomUUID(), user.school_id, course.id, record.studentId, attendanceDate, record.status, user.id, new Date().toISOString())
      }
    })
    await logAudit(user.school_id, user.id, 'attendance_saved')
    return json(response, 200, { saved: records.length })
  }

  if (url.pathname === '/api/grades/courses' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const assignments = await db.all(`SELECT c.id AS "courseId", c.name AS "courseName", c.grade,
      c.academic_year AS "academicYear", ct.subject, u.full_name AS "teacherName"
      FROM course_teachers ct JOIN courses c ON c.id = ct.course_id JOIN users u ON u.id = ct.user_id
      WHERE c.school_id = ? AND c.is_active = 1 AND (? <> 'docente' OR ct.user_id = ?)
      ORDER BY c.academic_year DESC, c.grade, ct.subject, u.full_name`, user.school_id, user.role, user.id)
    return json(response, 200, { assignments })
  }
  if (url.pathname === '/api/grades/assessments' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const courseId = String(url.searchParams.get('courseId') || '')
    const subject = String(url.searchParams.get('subject') || '')
    const period = String(url.searchParams.get('period') || '')
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
    if (!course || !subject || !period) return json(response, 400, { error: 'Selecciona curso, asignatura y periodo.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, course.id, subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa asignatura en el curso.' })
    const assessments = await db.all(`SELECT id, title, instructions, due_at AS "dueAt", delivery_mode AS "deliveryMode", is_published AS "isPublished", external_form_url AS "externalFormUrl", weight_percent AS "weightPercent", subject, period, max_score AS "maxScore", created_at AS "createdAt"
      FROM grade_assessments WHERE school_id = ? AND course_id = ? AND subject = ? AND period = ?
      ORDER BY created_at DESC`, user.school_id, course.id, subject, period)
    return json(response, 200, { assessments })
  }
  if (url.pathname === '/api/grades/assessments' && method === 'POST') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear evaluaciones.' })
    const body = await readLargeJsonBody(request, 30 * 1024 * 1024)
    const courseId = String(body.courseId || '')
    const subject = String(body.subject || '').trim()
    const period = String(body.period || '').trim()
    const title = String(body.title || '').trim()
    const instructions = String(body.instructions || '').trim()
    const dueAt = String(body.dueAt || '').trim()
    const deliveryMode = String(body.deliveryMode || 'file')
    const isPublished = body.isPublished === true ? 1 : 0
    const externalFormUrl = String(body.externalFormUrl || '').trim()
    const questions = Array.isArray(body.questions) ? body.questions : []
    const images = Array.isArray(body.images) ? body.images : []
    const weightPercent = Number(body.weightPercent ?? 100)
    const maxScore = Number(body.maxScore)
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, course.id, subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa asignatura en el curso.' })
    if (!['file', 'online'].includes(deliveryMode) || subject.length > 80 || period.length < 2 || period.length > 40 || title.length < 2 || title.length > 120 || instructions.length > 2000 || externalFormUrl.length > 1000 || (dueAt && !validDate(dueAt)) || !validGoogleFormsUrl(externalFormUrl) || !Number.isFinite(weightPercent) || weightPercent <= 0 || weightPercent > 100 || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 10000) return json(response, 400, { error: 'Revisa el periodo, el nombre, las instrucciones, el enlace de Google Forms, la fecha límite, la ponderación y el puntaje máximo.' })
    if (images.length > 5) return json(response, 400, { error: 'Puedes adjuntar hasta 5 imágenes por actividad.' })
    const imageRecords = []
    let imageTotalBytes = 0
    for (const image of images) {
      if (!image || typeof image !== 'object') return json(response, 400, { error: 'Una imagen adjunta no es válida.' })
      const base64 = String(image.fileBase64 || '')
      if (!base64 || base64.length > 5_592_408 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) return json(response, 400, { error: 'Una imagen está vacía o no tiene un formato válido.' })
      const fileData = Buffer.from(base64, 'base64')
      const fileName = basename(String(image.fileName || '').replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').replace(/[^\p{L}\p{N}._ ()-]/gu, '').slice(0, 140)
      const imageType = assessmentImageTypes.get(extname(fileName).toLowerCase())
      if (!fileData.length || fileData.length > 4 * 1024 * 1024 || fileData.toString('base64') !== base64 || !imageType || image.contentType !== imageType.mime || !imageType.magic(fileData)) return json(response, 415, { error: 'Usa imágenes JPG, PNG o WEBP de máximo 4 MB cada una.' })
      imageTotalBytes += fileData.length
      if (imageTotalBytes > 20 * 1024 * 1024) return json(response, 413, { error: 'Las imágenes adjuntas no pueden superar 20 MB en total.' })
      imageRecords.push({ id: randomUUID(), fileName, contentType: imageType.mime, fileSize: fileData.length, fileData })
    }
    if (deliveryMode === 'online' && (!questions.length || questions.length > 50 || questions.some(question => {
      if (!question || typeof question !== 'object') return true
      const prompt = String(question.prompt || '').trim()
      const options = Array.isArray(question.options) ? question.options.map(option => String(option).trim()) : []
      const points = Number(question.points)
      return prompt.length < 3 || prompt.length > 500 || options.length < 2 || options.length > 5 || options.some(option => option.length < 1 || option.length > 120) || !Number.isInteger(question.correctOption) || question.correctOption < 0 || question.correctOption >= options.length || !Number.isFinite(points) || points <= 0 || points > 1000
    }) || Math.abs(questions.reduce((total, question) => total + Number(question.points), 0) - maxScore) > 0.001)) return json(response, 400, { error: 'La evaluación en línea requiere 1 a 50 preguntas válidas; el puntaje máximo debe coincidir con la suma de sus preguntas.' })
    if (deliveryMode === 'file' && questions.length) return json(response, 400, { error: 'Los trabajos con archivo no deben incluir preguntas en línea.' })
    const id = randomUUID()
    await db.transaction(async tx => {
      await tx.run('INSERT INTO grade_assessments (id, school_id, course_id, subject, period, title, instructions, due_at, delivery_mode, is_published, external_form_url, weight_percent, max_score, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, course.id, subject, period, title, instructions, dueAt || null, deliveryMode, isPublished, externalFormUrl || null, weightPercent, maxScore, user.id)
      for (let index = 0; index < questions.length; index++) {
        const question = questions[index]
        await tx.run('INSERT INTO online_assessment_questions (id, assessment_id, question_no, prompt, options_json, correct_option, points) VALUES (?, ?, ?, ?, ?, ?, ?)', randomUUID(), id, index + 1, String(question.prompt).trim(), JSON.stringify(question.options.map(option => String(option).trim())), Number(question.correctOption), Number(question.points))
      }
      for (const image of imageRecords) await tx.run('INSERT INTO assessment_images (id, school_id, assessment_id, file_name, content_type, file_size, file_data, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', image.id, user.school_id, id, image.fileName, image.contentType, image.fileSize, image.fileData, user.id)
    })
    await logAudit(user.school_id, user.id, 'grade_assessment_created')
    return json(response, 201, { assessment: { id, courseId, subject, period, title, instructions, dueAt: dueAt || null, deliveryMode, isPublished: Boolean(isPublished), externalFormUrl: externalFormUrl || null, images: imageRecords.map(({ id, fileName, contentType }) => ({ id, fileName, contentType })), weightPercent, maxScore } })
  }
  const gradeAssessmentMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})$/i)
  if (gradeAssessmentMatch && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const assessment = await db.get(`SELECT a.id, a.course_id AS "courseId", c.name AS "courseName", c.grade,
      c.academic_year AS "academicYear", a.subject, a.period, a.title, a.instructions, a.due_at AS "dueAt", a.delivery_mode AS "deliveryMode", a.is_published AS "isPublished", a.external_form_url AS "externalFormUrl", a.weight_percent AS "weightPercent", a.max_score AS "maxScore"
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.school_id = ? AND c.school_id = ?`, gradeAssessmentMatch[1], user.school_id, user.school_id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa evaluación en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, assessment.courseId, assessment.subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa evaluación.' })
    assessment.images = await db.all('SELECT id, file_name AS "fileName", content_type AS "contentType", file_size AS "fileSize" FROM assessment_images WHERE assessment_id = ? ORDER BY created_at, id', assessment.id)
    const students = await db.all(`SELECT st.id, st.full_name AS name, st.grade, sg.score, sg.comment, sg.updated_at AS "updatedAt"
      FROM students st JOIN courses assessment_course ON assessment_course.id = ? AND assessment_course.school_id = st.school_id
      LEFT JOIN student_grades sg ON sg.student_id = st.id AND sg.assessment_id = ?
      WHERE st.school_id = ? AND st.status = 'Activo' AND (
        EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id
          AND se.course_id = assessment_course.id AND se.academic_year = assessment_course.academic_year AND se.status = 'Activa')
        OR (st.grade = assessment_course.grade AND NOT EXISTS (SELECT 1 FROM student_enrollments se
          WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa'))
      ) ORDER BY st.full_name`, assessment.courseId, assessment.id, user.school_id)
    return json(response, 200, { assessment: { ...assessment, maxScore: Number(assessment.maxScore), weightPercent: Number(assessment.weightPercent) }, students: students.map(student => ({ ...student, score: student.score === null ? null : Number(student.score) })) })
  }
  const gradeAssessmentDeleteMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})$/i)
  if (gradeAssessmentDeleteMatch && method === 'DELETE') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para eliminar evaluaciones.' })
    const assessment = await db.get('SELECT id, course_id AS "courseId", subject, title FROM grade_assessments WHERE id = ? AND school_id = ?', gradeAssessmentDeleteMatch[1], user.school_id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa evaluación en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ? AND (? <> 'docente' OR user_id = ?)`, assessment.courseId, assessment.subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esta evaluación.' })
    await db.transaction(async tx => { await tx.run('DELETE FROM grade_assessments WHERE id = ? AND school_id = ?', assessment.id, user.school_id) })
    await logAudit(user.school_id, user.id, `grade_assessment_deleted:${assessment.id}`)
    return json(response, 200, { deleted: true })
  }
  const assessmentPublicationMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})\/publication$/i)
  if (assessmentPublicationMatch && method === 'PATCH') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para publicar evaluaciones.' })
    const body = await readBody(request)
    if (typeof body.isPublished !== 'boolean') return json(response, 400, { error: 'Indica si deseas publicar o retirar esta evaluación.' })
    const assessment = await db.get('SELECT id, course_id AS "courseId", subject, delivery_mode AS "deliveryMode" FROM grade_assessments WHERE id = ? AND school_id = ?', assessmentPublicationMatch[1], user.school_id)
    if (!assessment || assessment.deliveryMode !== 'online') return json(response, 404, { error: 'No encontramos una evaluación en línea para publicar.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ? AND (? <> 'docente' OR user_id = ?)`, assessment.courseId, assessment.subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esta evaluación.' })
    if (!body.isPublished && Number((await db.get('SELECT COUNT(*) AS count FROM online_assessment_attempts WHERE assessment_id = ?', assessment.id)).count) > 0) return json(response, 409, { error: 'No se puede retirar una evaluación después de que un estudiante haya iniciado un intento.' })
    await db.run('UPDATE grade_assessments SET is_published = ? WHERE id = ? AND school_id = ?', body.isPublished ? 1 : 0, assessment.id, user.school_id)
    await logAudit(user.school_id, user.id, body.isPublished ? 'online_assessment_published' : 'online_assessment_unpublished')
    return json(response, 200, { isPublished: body.isPublished })
  }
  const gradeAssessmentWeightMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})\/weight$/i)
  if (gradeAssessmentWeightMatch && method === 'PATCH') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para cambiar ponderaciones.' })
    const body = await readBody(request)
    const weightPercent = Number(body.weightPercent)
    if (!Number.isFinite(weightPercent) || weightPercent <= 0 || weightPercent > 100) return json(response, 400, { error: 'La ponderación debe estar entre 0,01 y 100 %.' })
    const assessment = await db.get('SELECT course_id AS "courseId", subject FROM grade_assessments WHERE id = ? AND school_id = ?', gradeAssessmentWeightMatch[1], user.school_id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa evaluación en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, assessment.courseId, assessment.subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa evaluación.' })
    await db.run('UPDATE grade_assessments SET weight_percent = ? WHERE id = ? AND school_id = ?', weightPercent, gradeAssessmentWeightMatch[1], user.school_id)
    await logAudit(user.school_id, user.id, 'grade_assessment_weight_updated')
    return json(response, 200, { weightPercent })
  }
  if (url.pathname === '/api/grades/rule' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar reglas académicas.' })
    const courseId = String(url.searchParams.get('courseId') || '')
    const subject = String(url.searchParams.get('subject') || '').trim()
    const period = String(url.searchParams.get('period') || '').trim()
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ?', courseId, user.school_id)
    if (!course || !subject || !period) return json(response, 400, { error: 'Selecciona curso, asignatura y periodo.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, course.id, subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa asignatura en el curso.' })
    const rule = await db.get(`SELECT scale_min AS "scaleMin", scale_max AS "scaleMax", passing_score AS "passingScore",
      updated_at AS "updatedAt" FROM academic_grade_rules WHERE school_id = ? AND course_id = ? AND subject = ? AND period = ?`, user.school_id, course.id, subject, period)
    return json(response, 200, { rule: rule ? { ...rule, scaleMin: Number(rule.scaleMin), scaleMax: Number(rule.scaleMax), passingScore: Number(rule.passingScore) } : null })
  }
  if (url.pathname === '/api/grades/rule' && method === 'PUT') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para configurar reglas académicas.' })
    const body = await readBody(request)
    const courseId = String(body.courseId || '')
    const subject = String(body.subject || '').trim()
    const period = String(body.period || '').trim()
    const scaleMin = Number(body.scaleMin)
    const scaleMax = Number(body.scaleMax)
    const passingScore = Number(body.passingScore)
    if (!courseId || subject.length < 2 || subject.length > 80 || period.length < 2 || period.length > 40 || !Number.isFinite(scaleMin) || !Number.isFinite(scaleMax) || !Number.isFinite(passingScore) || scaleMin < 0 || scaleMax > 100 || scaleMax <= scaleMin || passingScore < scaleMin || passingScore > scaleMax) return json(response, 400, { error: 'Revisa la escala. La nota aprobatoria debe quedar dentro del rango mínimo y máximo.' })
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ?', courseId, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, course.id, subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa asignatura en el curso.' })
    const id = randomUUID()
    await db.run(`INSERT INTO academic_grade_rules (id, school_id, course_id, subject, period, scale_min, scale_max, passing_score, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(course_id, subject, period) DO UPDATE SET scale_min = excluded.scale_min, scale_max = excluded.scale_max,
        passing_score = excluded.passing_score, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      id, user.school_id, course.id, subject, period, scaleMin, scaleMax, passingScore, user.id, new Date().toISOString())
    await logAudit(user.school_id, user.id, 'academic_grade_rule_saved')
    return json(response, 200, { rule: { scaleMin, scaleMax, passingScore } })
  }
  const gradeScoresMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})\/scores$/i)
  if (gradeScoresMatch && method === 'POST') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para registrar calificaciones.' })
    const body = await readBody(request)
    if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 500) return json(response, 400, { error: 'Selecciona al menos una calificación para guardar.' })
    const assessment = await db.get(`SELECT a.id, a.course_id AS "courseId", a.subject, a.max_score AS "maxScore", c.grade, c.academic_year AS "academicYear"
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.school_id = ? AND c.school_id = ? AND c.is_active = 1`, gradeScoresMatch[1], user.school_id, user.school_id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa evaluación en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, assessment.courseId, assessment.subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa evaluación.' })
    const maxScore = Number(assessment.maxScore)
    const records = body.records.map(record => ({ studentId: String(record.studentId || ''), score: record.score, comment: String(record.comment || '').trim() }))
    if (records.some(record => !/^[0-9a-f-]{36}$/i.test(record.studentId) || typeof record.score !== 'number' || !Number.isFinite(record.score) || record.score < 0 || record.score > maxScore || record.comment.length > 500) || new Set(records.map(record => record.studentId)).size !== records.length) return json(response, 400, { error: `Revisa las notas: deben estar entre 0 y ${maxScore}, sin estudiantes repetidos.` })
    for (const record of records) if (!await db.get(`SELECT st.id FROM students st WHERE st.id = ? AND st.school_id = ? AND st.status = 'Activo'
      AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id
        AND se.course_id = ? AND se.academic_year = ? AND se.status = 'Activa')
        OR (st.grade = ? AND NOT EXISTS (SELECT 1 FROM student_enrollments se
          WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')))`,
      record.studentId, user.school_id, assessment.courseId, assessment.academicYear, assessment.grade)) return json(response, 400, { error: 'Uno de los estudiantes no pertenece a este curso activo.' })
    await db.transaction(async tx => {
      for (const record of records) await tx.run(`INSERT INTO student_grades (assessment_id, student_id, score, comment, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(assessment_id, student_id) DO UPDATE SET score = excluded.score, comment = excluded.comment, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        assessment.id, record.studentId, record.score, record.comment, user.id, new Date().toISOString())
    })
    await logAudit(user.school_id, user.id, 'grade_records_saved')
    return json(response, 200, { saved: records.length })
  }

  if (url.pathname === '/api/grades/report-card/options' && method === 'GET') {
    const permitted = ['admin', 'secretaria', 'docente', 'acudiente', 'estudiante']
    if (!permitted.includes(user.role)) return json(response, 403, { error: 'Tu rol no tiene acceso a boletines.' })
    let students
    if (['acudiente', 'estudiante'].includes(user.role)) {
      students = await db.all(`SELECT st.id, st.full_name AS name, st.grade FROM user_students us
        JOIN students st ON st.id = us.student_id WHERE us.user_id = ? AND st.school_id = ? ORDER BY st.full_name`, user.id, user.school_id)
    } else if (user.role === 'docente') {
      students = await db.all(`SELECT DISTINCT st.id, st.full_name AS name, st.grade FROM students st
        JOIN courses c ON c.school_id = st.school_id AND c.grade = st.grade
        JOIN course_teachers ct ON ct.course_id = c.id AND ct.user_id = ?
        WHERE st.school_id = ? ORDER BY st.grade, st.full_name`, user.id, user.school_id)
    } else {
      students = await db.all('SELECT id, full_name AS name, grade FROM students WHERE school_id = ? ORDER BY grade, full_name', user.school_id)
    }
    const portalRole = ['acudiente', 'estudiante'].includes(user.role)
    const publications = await db.all(`SELECT academic_year AS "academicYear", period, is_published AS "isPublished",
        published_at AS "publishedAt" FROM grade_period_publications WHERE school_id = ? ${portalRole ? 'AND is_published = 1' : ''}
        ORDER BY academic_year DESC, period`, user.school_id)
    let years
    if (user.role === 'docente') years = await db.all(`SELECT DISTINCT c.academic_year AS year FROM courses c JOIN course_teachers ct ON ct.course_id = c.id WHERE c.school_id = ? AND ct.user_id = ? ORDER BY c.academic_year DESC`, user.school_id, user.id)
    else if (portalRole) years = [...new Set(publications.map(publication => publication.academicYear))].map(year => ({ year }))
    else years = await db.all('SELECT DISTINCT academic_year AS year FROM courses WHERE school_id = ? ORDER BY academic_year DESC', user.school_id)
    return json(response, 200, { students, years: years.map(item => item.year), periods: ['Periodo 1', 'Periodo 2', 'Periodo 3', 'Periodo 4'], publications: publications.map(item => ({ ...item, isPublished: Boolean(item.isPublished) })) })
  }
  if (url.pathname === '/api/grades/publications' && method === 'PUT') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden publicar boletines.' })
    const body = await readBody(request)
    const academicYear = String(body.academicYear || '')
    const period = String(body.period || '')
    if (!/^\d{4}-\d{4}$/.test(academicYear) || !/^Periodo [1-4]$/.test(period) || typeof body.published !== 'boolean') return json(response, 400, { error: 'Selecciona año lectivo, periodo y estado de publicación válidos.' })
    if (body.published) {
      const grades = Number((await db.get(`SELECT COUNT(*) AS count FROM student_grades sg
        JOIN grade_assessments a ON a.id = sg.assessment_id JOIN courses c ON c.id = a.course_id
        WHERE a.school_id = ? AND c.school_id = ? AND c.academic_year = ? AND a.period = ?`, user.school_id, user.school_id, academicYear, period)).count)
      if (!grades) return json(response, 409, { error: 'No hay notas registradas para publicar en este año y periodo.' })
    }
    const publishedAt = body.published ? new Date().toISOString() : null
    const publicationId = randomUUID()
    await db.run(`INSERT INTO grade_period_publications (id, school_id, academic_year, period, is_published, published_by, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(school_id, academic_year, period) DO UPDATE SET is_published = excluded.is_published,
        published_by = excluded.published_by, published_at = excluded.published_at`,
      publicationId, user.school_id, academicYear, period, body.published ? 1 : 0, user.id, publishedAt)
    await logAudit(user.school_id, user.id, body.published ? 'grade_period_published' : 'grade_period_unpublished')
    return json(response, 200, { academicYear, period, isPublished: body.published, publishedAt })
  }
  if (url.pathname === '/api/grades/report-card' && method === 'GET') {
    if (!['admin', 'secretaria', 'docente', 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'Tu rol no tiene acceso a boletines.' })
    const studentId = String(url.searchParams.get('studentId') || '')
    const academicYear = String(url.searchParams.get('academicYear') || '')
    const period = String(url.searchParams.get('period') || '')
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || !/^\d{4}-\d{4}$/.test(academicYear) || !/^Periodo [1-4]$/.test(period)) return json(response, 400, { error: 'Selecciona estudiante, año lectivo y periodo válidos.' })
    const student = await db.get('SELECT id, full_name AS name, grade, status FROM students WHERE id = ? AND school_id = ?', studentId, user.school_id)
    if (!student) return json(response, 404, { error: 'No encontramos al estudiante en este colegio.' })
    if (['acudiente', 'estudiante'].includes(user.role) && !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, student.id)) return json(response, 403, { error: 'Solo puedes consultar los boletines de estudiantes vinculados a tu cuenta.' })
    const publication = await db.get('SELECT is_published AS "isPublished" FROM grade_period_publications WHERE school_id = ? AND academic_year = ? AND period = ?', user.school_id, academicYear, period)
    if (['acudiente', 'estudiante'].includes(user.role) && !publication?.isPublished) return json(response, 403, { error: 'Este boletín todavía no ha sido publicado por el colegio.' })
    if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers ct JOIN courses c ON c.id = ct.course_id WHERE ct.user_id = ? AND c.school_id = ? AND c.grade = ? AND c.academic_year = ?', user.id, user.school_id, student.grade, academicYear)) return json(response, 403, { error: 'No tienes una asignatura asignada a ese estudiante para el año lectivo seleccionado.' })
    const marks = await db.all(`SELECT a.subject, a.title, a.max_score AS "maxScore", a.period, a.instructions,
        a.due_at AS "dueAt", a.weight_percent AS "weightPercent", rule.scale_min AS "scaleMin",
        rule.scale_max AS "scaleMax", rule.passing_score AS "passingScore", sg.score, sg.comment, sg.updated_at AS "updatedAt",
        (SELECT u.full_name FROM course_teachers ct JOIN users u ON u.id = ct.user_id
          WHERE ct.course_id = c.id AND ct.subject = a.subject ORDER BY u.full_name LIMIT 1) AS "teacherName"
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      LEFT JOIN academic_grade_rules rule ON rule.school_id = a.school_id AND rule.course_id = c.id AND rule.subject = a.subject AND rule.period = a.period
      LEFT JOIN student_grades sg ON sg.assessment_id = a.id AND sg.student_id = ?
      WHERE a.school_id = ? AND c.school_id = ? AND c.grade = ? AND c.academic_year = ? AND a.period = ?
        AND (? <> 'docente' OR EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = c.id AND ct.subject = a.subject AND ct.user_id = ?))
      ORDER BY a.subject, a.created_at, a.title`, student.id, user.school_id, user.school_id, student.grade, academicYear, period, user.role, user.id)
    const bySubject = new Map()
    for (const mark of marks) {
      const score = mark.score === null ? null : Number(mark.score)
      const maxScore = Number(mark.maxScore)
      if (!bySubject.has(mark.subject)) bySubject.set(mark.subject, { subject: mark.subject, teacherName: mark.teacherName || '', assessments: [], scoreWeights: [], scaleMin: mark.scaleMin === null ? null : Number(mark.scaleMin), scaleMax: mark.scaleMax === null ? null : Number(mark.scaleMax), passingScore: mark.passingScore === null ? null : Number(mark.passingScore) })
      const summary = bySubject.get(mark.subject)
      const weightPercent = Number(mark.weightPercent) || 100
      summary.assessments.push({ title: mark.title, score, maxScore, weightPercent, comment: mark.comment || '', updatedAt: mark.updatedAt, instructions: mark.instructions || '', dueAt: mark.dueAt })
      if (score !== null && maxScore > 0) summary.scoreWeights.push({ percent: score / maxScore * 100, weight: weightPercent })
    }
    const subjects = [...bySubject.values()].map(summary => {
      const totalWeight = summary.scoreWeights.reduce((sum, item) => sum + item.weight, 0)
      const averagePercent = totalWeight ? Math.round(summary.scoreWeights.reduce((sum, item) => sum + item.percent * item.weight, 0) / totalWeight * 100) / 100 : null
      const institutionalScore = averagePercent === null || summary.scaleMin === null || summary.scaleMax === null ? null
        : Math.round((summary.scaleMin + averagePercent / 100 * (summary.scaleMax - summary.scaleMin)) * 100) / 100
      return {
        subject: summary.subject,
        teacherName: summary.teacherName,
        averagePercent,
        scaleMin: summary.scaleMin,
        scaleMax: summary.scaleMax,
        passingScore: summary.passingScore,
        institutionalScore,
        result: institutionalScore === null || summary.passingScore === null ? null : institutionalScore >= summary.passingScore ? 'Aprobado' : 'En seguimiento',
        gradedCount: summary.scoreWeights.length,
        assessmentCount: summary.assessments.length,
        assessments: summary.assessments,
      }
    })
    await logAudit(user.school_id, user.id, 'report_card_viewed')
    return json(response, 200, { student, academicYear, period, subjects, isPublished: Boolean(publication?.isPublished), generatedAt: new Date().toISOString() })
  }
  if (url.pathname === '/api/portal/assignments' && method === 'GET') {
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'Este acceso es solo para estudiantes y acudientes.' })
    const studentId = String(url.searchParams.get('studentId') || '')
    const student = await db.get('SELECT id, grade FROM students WHERE id = ? AND school_id = ?', studentId, user.school_id)
    if (!student || !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    const assignments = await db.all(`SELECT a.id, a.title, a.instructions, a.due_at AS "dueAt", a.subject, a.period,
        a.delivery_mode AS "deliveryMode", a.is_published AS "isPublished", a.external_form_url AS "externalFormUrl",
        a.max_score AS "maxScore", c.name AS "courseName", c.academic_year AS "academicYear",
        sg.score, sg.comment, latest.id AS "submissionId", latest.original_file_name AS "fileName",
        latest.uploaded_at AS "uploadedAt", latest.submission_no AS "submissionNo",
        online_attempt.id AS "onlineAttemptId", online_attempt.submitted_at AS "onlineSubmittedAt"
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      LEFT JOIN student_grades sg ON sg.assessment_id = a.id AND sg.student_id = ?
      LEFT JOIN work_submissions latest ON latest.id = (SELECT ws.id FROM work_submissions ws
        WHERE ws.assessment_id = a.id AND ws.student_id = ? ORDER BY ws.submission_no DESC LIMIT 1)
      LEFT JOIN online_assessment_attempts online_attempt ON online_attempt.assessment_id = a.id AND online_attempt.student_id = ?
      WHERE a.school_id = ? AND c.school_id = ? AND c.grade = ? AND c.is_active = 1
        AND (a.delivery_mode <> 'online' OR a.is_published = 1)
        AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ?
          AND se.course_id = c.id AND se.academic_year = c.academic_year AND se.status = 'Activa')
          OR (NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.status = 'Activa')
            AND c.academic_year = (SELECT MAX(current_course.academic_year) FROM courses current_course
              WHERE current_course.school_id = c.school_id AND current_course.grade = c.grade AND current_course.is_active = 1)))
      ORDER BY a.due_at, a.subject, a.title`, student.id, student.id, student.id, user.school_id, user.school_id, student.grade, student.id, student.id)
    const imageGroups = new Map()
    if (assignments.length) {
      const placeholders = assignments.map(() => '?').join(', ')
      const images = await db.all(`SELECT id, assessment_id AS "assessmentId", file_name AS "fileName", content_type AS "contentType" FROM assessment_images WHERE school_id = ? AND assessment_id IN (${placeholders}) ORDER BY created_at, id`, user.school_id, ...assignments.map(item => item.id))
      for (const image of images) imageGroups.set(image.assessmentId, [...(imageGroups.get(image.assessmentId) || []), { id: image.id, fileName: image.fileName, contentType: image.contentType }])
    }
    return json(response, 200, { assignments: assignments.map(item => ({ ...item, images: imageGroups.get(item.id) || [], isPublished: Boolean(item.isPublished), onlineStatus: item.onlineSubmittedAt ? 'submitted' : item.onlineAttemptId ? 'started' : null, score: item.score === null ? null : Number(item.score), maxScore: Number(item.maxScore) })) })
  }
  const assessmentImageMatch = url.pathname.match(/^\/api\/assessment-images\/([0-9a-f-]{36})$/i)
  if (assessmentImageMatch && method === 'GET') {
    const image = await db.get(`SELECT image.id, image.file_name AS "fileName", image.content_type AS "contentType", image.file_size AS "fileSize", image.file_data AS "fileData",
        a.id AS "assessmentId", a.course_id AS "courseId", a.subject, a.is_published AS "isPublished", c.grade, c.academic_year AS "academicYear", c.is_active AS "courseActive"
      FROM assessment_images image JOIN grade_assessments a ON a.id = image.assessment_id JOIN courses c ON c.id = a.course_id
      WHERE image.id = ? AND image.school_id = ? AND a.school_id = ? AND c.school_id = ?`, assessmentImageMatch[1], user.school_id, user.school_id, user.school_id)
    if (!image) return json(response, 404, { error: 'No encontramos esta imagen.' })
    const staff = ['admin', 'secretaria'].includes(user.role)
    const teacher = user.role === 'docente' && await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ? AND user_id = ?', image.courseId, image.subject, user.id)
    const linked = ['acudiente', 'estudiante'].includes(user.role) && await db.get(`SELECT 1 FROM students st WHERE st.school_id = ? AND st.status = 'Activo'
      AND st.id IN (SELECT student_id FROM user_students WHERE user_id = ?)
      AND ((EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id
        AND se.course_id = ? AND se.academic_year = ? AND se.status = 'Activa'))
        OR (st.grade = ? AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')
          AND ? = (SELECT MAX(current_course.academic_year) FROM courses current_course WHERE current_course.school_id = st.school_id AND current_course.grade = st.grade AND current_course.is_active = 1)))`, user.school_id, user.id, image.courseId, image.academicYear, image.grade, image.academicYear)
    if (!staff && !teacher && !(linked && image.isPublished && image.courseActive)) return json(response, 403, { error: 'No tienes permiso para ver esta imagen.' })
    const safeName = encodeURIComponent(image.fileName).replaceAll("'", '%27')
    response.writeHead(200, { 'Content-Type': image.contentType, 'Content-Length': String(image.fileSize), 'Content-Disposition': `inline; filename*=UTF-8''${safeName}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox" })
    response.end(image.fileData)
    return
  }
  const onlineAssessmentAction = url.pathname.match(/^\/api\/portal\/online-assessments\/([0-9a-f-]{36})\/(start|draft|submit)$/i)
  if (onlineAssessmentAction && ((onlineAssessmentAction[2] === 'draft' && method === 'PATCH') || (onlineAssessmentAction[2] !== 'draft' && method === 'POST'))) {
    if (user.role !== 'estudiante') return json(response, 403, { error: 'Solo la cuenta del estudiante puede realizar una evaluación en línea.' })
    const body = await readBody(request)
    const studentId = String(body.studentId || '')
    const student = await db.get("SELECT id, grade FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", studentId, user.school_id)
    if (!student || !await db.get("SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ? AND relationship = 'estudiante'", user.id, studentId)) return json(response, 403, { error: 'La evaluación solo está disponible para el estudiante vinculado a esta cuenta.' })
    const assessment = await db.get(`SELECT a.id, a.course_id AS "courseId", a.subject, a.title, a.due_at AS "dueAt", a.max_score AS "maxScore", c.grade
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.school_id = ? AND c.school_id = ? AND c.is_active = 1 AND a.delivery_mode = 'online' AND a.is_published = 1
        AND ((EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ?
          AND se.course_id = c.id AND se.academic_year = c.academic_year AND se.status = 'Activa'))
          OR (NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.status = 'Activa')
            AND c.grade = ? AND c.academic_year = (SELECT MAX(current_course.academic_year) FROM courses current_course
              WHERE current_course.school_id = c.school_id AND current_course.grade = c.grade AND current_course.is_active = 1)))`, onlineAssessmentAction[1], user.school_id, user.school_id, student.id, student.id, student.grade)
    if (!assessment) return json(response, 404, { error: 'No encontramos una evaluación publicada para el curso de este estudiante.' })
    const questions = await db.all('SELECT id, question_no AS "questionNo", prompt, options_json AS "optionsJson", correct_option AS "correctOption", points FROM online_assessment_questions WHERE assessment_id = ? ORDER BY question_no', assessment.id)
    if (!questions.length) return json(response, 409, { error: 'La evaluación todavía no tiene preguntas disponibles.' })
    let attempt = await db.get('SELECT id, submitted_at AS "submittedAt", score, answers_json AS "answersJson" FROM online_assessment_attempts WHERE assessment_id = ? AND student_id = ?', assessment.id, student.id)
    if (onlineAssessmentAction[2] === 'start') {
      if (!attempt) {
        const attemptId = randomUUID()
        try {
          await db.run('INSERT INTO online_assessment_attempts (id, school_id, assessment_id, student_id) VALUES (?, ?, ?, ?)', attemptId, user.school_id, assessment.id, student.id)
          attempt = { id: attemptId, submittedAt: null, score: null }
          await logAudit(user.school_id, user.id, 'online_assessment_started')
        } catch (error) {
          if (!String(error.code).startsWith('23') && !String(error.message).includes('UNIQUE')) throw error
          attempt = await db.get('SELECT id, submitted_at AS "submittedAt", score, answers_json AS "answersJson" FROM online_assessment_attempts WHERE assessment_id = ? AND student_id = ?', assessment.id, student.id)
        }
      }
      if (attempt.submittedAt) return json(response, 200, { status: 'submitted', score: Number(attempt.score), maxScore: Number(assessment.maxScore) })
      return json(response, 200, { status: 'started', attemptId: attempt.id, title: assessment.title, subject: assessment.subject,
        answers: JSON.parse(attempt.answersJson || '{}'),
        maxScore: Number(assessment.maxScore), questions: questions.map(question => ({ id: question.id, questionNo: question.questionNo,
          prompt: question.prompt, options: JSON.parse(question.optionsJson), points: Number(question.points) })) })
    }
    if (onlineAssessmentAction[2] === 'draft') {
      const answers = body.answers
      const questionById = new Map(questions.map(question => [question.id, question]))
      if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).some(id => {
        const question = questionById.get(id)
        const options = question && JSON.parse(question.optionsJson)
        return !question || !Number.isInteger(answers[id]) || answers[id] < 0 || answers[id] >= options.length
      })) return json(response, 400, { error: 'Una o más respuestas no son válidas.' })
      const attempt = await db.get('SELECT id, submitted_at AS "submittedAt" FROM online_assessment_attempts WHERE assessment_id = ? AND student_id = ?', assessment.id, student.id)
      if (!attempt || attempt.submittedAt) return json(response, 409, { error: 'No hay un intento abierto para guardar respuestas.' })
      await db.run('UPDATE online_assessment_attempts SET answers_json = ? WHERE id = ? AND submitted_at IS NULL', JSON.stringify(answers), attempt.id)
      return json(response, 200, { saved: true })
    }
    if (!attempt || attempt.submittedAt) return json(response, 409, { error: 'Esta evaluación no tiene un intento pendiente de envío.' })
    const answers = body.answers
    if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length !== questions.length || questions.some(question => {
      const selected = answers[question.id]
      const options = JSON.parse(question.optionsJson)
      return !Number.isInteger(selected) || selected < 0 || selected >= options.length
    })) return json(response, 400, { error: 'Responde todas las preguntas antes de enviar.' })
    let score = 0
    for (const question of questions) if (answers[question.id] === Number(question.correctOption)) score += Number(question.points)
    score = Number(score.toFixed(2))
    const submittedAt = new Date().toISOString()
    await db.transaction(async tx => {
      const updated = await tx.run('UPDATE online_assessment_attempts SET answers_json = ?, score = ?, submitted_at = ? WHERE id = ? AND submitted_at IS NULL', JSON.stringify(answers), score, submittedAt, attempt.id)
      if (!(updated.changes ?? updated.rowCount)) throw Object.assign(new Error('El intento ya fue enviado desde otra sesión.'), { status: 409 })
      await tx.run(`INSERT INTO student_grades (assessment_id, student_id, score, comment, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(assessment_id, student_id) DO UPDATE SET score = excluded.score,
        comment = excluded.comment, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        assessment.id, student.id, score, 'Evaluación en línea completada', user.id, submittedAt)
    })
    await logAudit(user.school_id, user.id, 'online_assessment_submitted')
    return json(response, 200, { status: 'submitted', score, maxScore: Number(assessment.maxScore) })
  }
  const studentSubmissionMatch = url.pathname.match(/^\/api\/portal\/assignments\/([0-9a-f-]{36})\/submissions$/i)
  if (studentSubmissionMatch && method === 'POST') {
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'Solo estudiantes y acudientes vinculados pueden entregar trabajos.' })
    const body = await readLargeJsonBody(request)
    const studentId = String(body.studentId || '')
    const student = await db.get('SELECT id, grade FROM students WHERE id = ? AND school_id = ?', studentId, user.school_id)
    if (!student || !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    const assessment = await db.get(`SELECT a.id, c.grade FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.school_id = ? AND c.school_id = ? AND c.grade = ? AND c.is_active = 1
        AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ?
          AND se.course_id = c.id AND se.academic_year = c.academic_year AND se.status = 'Activa')
          OR (NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.status = 'Activa')
            AND c.academic_year = (SELECT MAX(current_course.academic_year) FROM courses current_course
              WHERE current_course.school_id = c.school_id AND current_course.grade = c.grade AND current_course.is_active = 1)))`, studentSubmissionMatch[1], user.school_id, user.school_id, student.grade, student.id, student.id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa tarea activa para el grado de este estudiante.' })
    const base64 = String(body.fileBase64 || '')
    if (!base64 || base64.length > 11_184_812 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) return json(response, 400, { error: 'El archivo está vacío o no es válido.' })
    const fileData = Buffer.from(base64, 'base64')
    if (!fileData.length || fileData.length > 8 * 1024 * 1024 || fileData.toString('base64') !== base64) return json(response, 413, { error: 'El trabajo debe ocupar máximo 8 MB.' })
    const originalFileName = basename(String(body.fileName || '').replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').replace(/[^\p{L}\p{N}._ ()-]/gu, '').slice(0, 140)
    const extension = extname(originalFileName).toLowerCase()
    const fileType = workFileTypes.get(extension)
    if (!fileType || body.contentType !== fileType.mime || !fileType.magic(fileData)) return json(response, 415, { error: 'Formato no permitido o el contenido no coincide. Usa PDF, JPG, PNG, DOCX o XLSX.' })
    const attempt = Number((await db.get('SELECT COALESCE(MAX(submission_no), 0) AS last FROM work_submissions WHERE assessment_id = ? AND student_id = ?', assessment.id, student.id)).last) + 1
    if (attempt > 10) return json(response, 409, { error: 'Se alcanzó el máximo de 10 entregas para esta tarea. Contacta al docente.' })
    const submissionId = randomUUID()
    try {
      await db.run(`INSERT INTO work_submissions (id, school_id, assessment_id, student_id, uploaded_by, submission_no,
        original_file_name, content_type, file_size, file_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        submissionId, user.school_id, assessment.id, student.id, user.id, attempt, originalFileName, fileType.mime, fileData.length, fileData)
    } catch (error) {
      if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'La entrega cambió al mismo tiempo. Actualiza la página e inténtalo de nuevo.' })
      throw error
    }
    await logAudit(user.school_id, user.id, 'work_submitted')
    return json(response, 201, { submissionId, submissionNo: attempt, uploadedAt: new Date().toISOString() })
  }
  const assessmentSubmissionsMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})\/submissions$/i)
  if (assessmentSubmissionsMatch && method === 'GET') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar entregas.' })
    const assessment = await db.get(`SELECT a.id, a.course_id AS "courseId", a.subject, c.grade FROM grade_assessments a
      JOIN courses c ON c.id = a.course_id WHERE a.id = ? AND a.school_id = ? AND c.school_id = ?`, assessmentSubmissionsMatch[1], user.school_id, user.school_id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa evaluación en este colegio.' })
    if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ? AND user_id = ?', assessment.courseId, assessment.subject, user.id)) return json(response, 403, { error: 'No tienes asignada esa evaluación.' })
    const submissions = await db.all(`SELECT st.id AS "studentId", st.full_name AS "studentName", st.grade,
        latest.id AS "submissionId", latest.original_file_name AS "fileName", latest.uploaded_at AS "uploadedAt",
        latest.submission_no AS "submissionNo", online_attempt.submitted_at AS "onlineSubmittedAt",
        online_attempt.score AS "onlineScore",
        sg.score AS "score",
        (SELECT COUNT(*) FROM work_submissions ws WHERE ws.assessment_id = ? AND ws.student_id = st.id) AS attempts
      FROM students st JOIN courses assessment_course ON assessment_course.id = ? AND assessment_course.school_id = st.school_id
      LEFT JOIN work_submissions latest ON latest.id = (SELECT ws.id FROM work_submissions ws
        WHERE ws.assessment_id = ? AND ws.student_id = st.id ORDER BY ws.submission_no DESC LIMIT 1)
      LEFT JOIN online_assessment_attempts online_attempt ON online_attempt.assessment_id = ? AND online_attempt.student_id = st.id
      LEFT JOIN student_grades sg ON sg.assessment_id = ? AND sg.student_id = st.id
      WHERE st.school_id = ? AND st.status = 'Activo' AND (
        EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id
          AND se.course_id = assessment_course.id AND se.academic_year = assessment_course.academic_year AND se.status = 'Activa')
        OR (st.grade = assessment_course.grade AND NOT EXISTS (SELECT 1 FROM student_enrollments se
          WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa'))
      ) ORDER BY st.full_name`, assessment.id, assessment.courseId, assessment.id, assessment.id, assessment.id, user.school_id)
    return json(response, 200, { submissions: submissions.map(row => ({ ...row, attempts: Number(row.attempts), onlineScore: row.onlineScore === null ? null : Number(row.onlineScore), score: row.score === null ? null : Number(row.score) })) })
  }
  const submissionFileMatch = url.pathname.match(/^\/api\/grades\/submissions\/([0-9a-f-]{36})\/file$/i)
  if (submissionFileMatch && method === 'GET') {
    const submission = await db.get(`SELECT ws.id, ws.student_id AS "studentId", ws.original_file_name AS "fileName",
        ws.content_type AS "contentType", ws.file_size AS "fileSize", ws.file_data AS "fileData",
        a.course_id AS "courseId", a.subject FROM work_submissions ws JOIN grade_assessments a ON a.id = ws.assessment_id
      WHERE ws.id = ? AND ws.school_id = ? AND a.school_id = ?`, submissionFileMatch[1], user.school_id, user.school_id)
    if (!submission) return json(response, 404, { error: 'No encontramos ese archivo.' })
    const staff = ['admin', 'secretaria'].includes(user.role)
    const teacher = user.role === 'docente' && await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ? AND user_id = ?', submission.courseId, submission.subject, user.id)
    const linked = ['acudiente', 'estudiante'].includes(user.role) && await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, submission.studentId)
    if (!staff && !teacher && !linked) return json(response, 403, { error: 'No tienes permiso para descargar este trabajo.' })
    const safeName = encodeURIComponent(submission.fileName).replaceAll("'", '%27')
    response.writeHead(200, { 'Content-Type': submission.contentType, 'Content-Length': String(submission.fileSize), 'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
    response.end(submission.fileData)
    return
  }
  const submissionDeleteMatch = url.pathname.match(/^\/api\/grades\/submissions\/([0-9a-f-]{36})$/i)
  if (submissionDeleteMatch && method === 'DELETE') {
    if (!['admin', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para eliminar entregas.' })
    const submission = await db.get(`SELECT ws.id, ws.student_id AS "studentId", ws.assessment_id AS "assessmentId", a.course_id AS "courseId", a.subject, ws.original_file_name AS "fileName"
      FROM work_submissions ws JOIN grade_assessments a ON a.id = ws.assessment_id
      WHERE ws.id = ? AND ws.school_id = ? AND a.school_id = ?`, submissionDeleteMatch[1], user.school_id, user.school_id)
    if (!submission) return json(response, 404, { error: 'No encontramos esta entrega en el colegio.' })
    const teacher = user.role === 'docente' && await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ? AND user_id = ?', submission.courseId, submission.subject, user.id)
    if (!['admin', 'secretaria'].includes(user.role) && !teacher) return json(response, 403, { error: 'No tienes asignada la evaluación de esta entrega.' })
    await db.run('DELETE FROM work_submissions WHERE assessment_id = ? AND student_id = ? AND school_id = ?', submission.assessmentId, submission.studentId, user.school_id)
    await logAudit(user.school_id, user.id, 'work_submission_deleted')
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/enrollments' && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden consultar matrículas.' })
    const search = `%${String(url.searchParams.get('search') || '').slice(0, 100)}%`
    const status = String(url.searchParams.get('status') || 'Todos')
    const requests = await db.all(`SELECT id, student_id AS "studentId", student_name AS "studentName", document,
      grade_requested AS "gradeRequested", academic_year AS "academicYear", guardian_name AS "guardianName",
      guardian_phone AS "guardianPhone", pending_documents AS "pendingDocuments", notes, status,
      created_at AS "createdAt", updated_at AS "updatedAt"
      FROM enrollment_requests WHERE school_id = ? AND (? = 'Todos' OR status = ?)
      AND (student_name LIKE ? OR document LIKE ? OR grade_requested LIKE ?) ORDER BY created_at DESC LIMIT 500`,
      user.school_id, status, status, search, search, search)
    return json(response, 200, { requests })
  }
  if (url.pathname === '/api/enrollments' && method === 'POST') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear solicitudes de matrícula.' })
    const body = await readBody(request)
    const studentName = String(body.studentName || '').trim()
    const document = String(body.document || '').trim()
    const gradeRequested = String(body.gradeRequested || '').trim()
    const academicYear = String(body.academicYear || '').trim()
    const guardianName = String(body.guardianName || '').trim()
    const guardianPhone = String(body.guardianPhone || '').trim()
    const pendingDocuments = (Array.isArray(body.pendingDocuments) ? body.pendingDocuments : String(body.pendingDocuments || '').split(','))
      .map(item => String(item).trim()).filter(Boolean).slice(0, 20).join('\n')
    const notes = String(body.notes || '').trim()
    if (studentName.length < 2 || studentName.length > 100 || !/^[\p{L}\p{N}.-]{3,30}$/u.test(document) || gradeRequested.length < 2 || gradeRequested.length > 40 || !/^\d{4}-\d{4}$/.test(academicYear) || guardianName.length < 2 || guardianName.length > 100 || guardianPhone.length > 25 || pendingDocuments.length > 1000 || notes.length > 1000) return json(response, 400, { error: 'Revisa los datos del estudiante, acudiente, grado y año lectivo.' })
    const duplicate = await db.get(`SELECT id FROM enrollment_requests WHERE school_id = ? AND document = ? AND academic_year = ?
      AND status IN ('Solicitada','En revisión','Pendiente documentos','Aprobada')`, user.school_id, document, academicYear)
    if (duplicate) return json(response, 409, { error: 'Ya existe una solicitud en curso para ese documento y año lectivo.' })
    const id = randomUUID()
    await db.run(`INSERT INTO enrollment_requests (id, school_id, student_name, document, grade_requested, academic_year,
      guardian_name, guardian_phone, pending_documents, notes, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Solicitada', ?, ?)`, id, user.school_id, studentName, document, gradeRequested, academicYear, guardianName, guardianPhone, pendingDocuments, notes, user.id, user.id)
    await logAudit(user.school_id, user.id, 'enrollment_request_created')
    return json(response, 201, { id, status: 'Solicitada' })
  }
  const enrollmentRequestMatch = url.pathname.match(/^\/api\/enrollments\/([0-9a-f-]{36})$/i)
  if (enrollmentRequestMatch && method === 'PATCH') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para procesar matrículas.' })
    const id = enrollmentRequestMatch[1]
    const requestRecord = await db.get(`SELECT * FROM enrollment_requests WHERE id = ? AND school_id = ?`, id, user.school_id)
    if (!requestRecord) return json(response, 404, { error: 'No encontramos esa solicitud en este colegio.' })
    const body = await readBody(request)
    const statuses = new Set(['Solicitada', 'En revisión', 'Pendiente documentos', 'Aprobada', 'Rechazada'])
    const status = String(body.status || '')
    const pendingDocuments = (Array.isArray(body.pendingDocuments) ? body.pendingDocuments : String(body.pendingDocuments || '').split(','))
      .map(item => String(item).trim()).filter(Boolean).slice(0, 20).join('\n')
    const notes = String(body.notes || '').trim()
    if (!statuses.has(status) || pendingDocuments.length > 1000 || notes.length > 1000) return json(response, 400, { error: 'Revisa el estado, los documentos pendientes y la observación.' })
    if (requestRecord.status === 'Aprobada' && status !== 'Aprobada') return json(response, 409, { error: 'Una matrícula aprobada no se revierte desde la solicitud; registra un retiro o traslado para conservar el historial.' })
    if (status !== 'Aprobada') {
      await db.run(`UPDATE enrollment_requests SET status = ?, pending_documents = ?, notes = ?, updated_by = ?, updated_at = ?
        WHERE id = ? AND school_id = ?`, status, pendingDocuments, notes, user.id, new Date().toISOString(), id, user.school_id)
      await logAudit(user.school_id, user.id, 'enrollment_request_updated')
      return json(response, 200, { id, status })
    }
    const course = await db.get(`SELECT id FROM courses WHERE school_id = ? AND grade = ? AND academic_year = ? AND is_active = 1`, user.school_id, requestRecord.grade_requested, requestRecord.academic_year)
    if (!course) return json(response, 409, { error: 'Crea primero el curso activo del grado y año solicitados para poder aprobar la matrícula.' })
    let student = await db.get('SELECT id FROM students WHERE school_id = ? AND document = ?', user.school_id, requestRecord.document)
    const studentId = student?.id || randomUUID()
    if (await db.get("SELECT id FROM student_enrollments WHERE school_id = ? AND student_id = ? AND academic_year = ? AND status = 'Activa'", user.school_id, studentId, requestRecord.academic_year)) return json(response, 409, { error: 'El estudiante ya tiene una matrícula activa para ese año lectivo.' })
    const enrollmentId = randomUUID()
    const today = new Date().toISOString().slice(0, 10)
    await db.transaction(async tx => {
      if (student) await tx.run(`UPDATE students SET full_name = ?, grade = ?, guardian_name = ?, guardian_phone = ?, status = 'Activo'
        WHERE id = ? AND school_id = ?`, requestRecord.student_name, requestRecord.grade_requested, requestRecord.guardian_name, requestRecord.guardian_phone, studentId, user.school_id)
      else await tx.run(`INSERT INTO students (id, school_id, full_name, document, grade, guardian_name, guardian_phone, status, card_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo', ?)`, studentId, user.school_id, requestRecord.student_name, requestRecord.document, requestRecord.grade_requested, requestRecord.guardian_name, requestRecord.guardian_phone, randomUUID())
      await tx.run(`INSERT INTO student_enrollments (id, school_id, student_id, course_id, academic_year, status, start_date, notes, created_by)
        VALUES (?, ?, ?, ?, ?, 'Activa', ?, ?, ?)`, enrollmentId, user.school_id, studentId, course.id, requestRecord.academic_year, today, notes, user.id)
      await tx.run(`UPDATE enrollment_requests SET student_id = ?, status = 'Aprobada', pending_documents = ?, notes = ?, updated_by = ?, updated_at = ?
        WHERE id = ? AND school_id = ?`, studentId, pendingDocuments, notes, user.id, new Date().toISOString(), id, user.school_id)
    })
    await logAudit(user.school_id, user.id, 'enrollment_approved')
    return json(response, 200, { id, studentId, enrollmentId, status: 'Aprobada' })
  }
  if (url.pathname === '/api/enrollments/history' && method === 'GET') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden consultar historial de matrículas.' })
    const records = await db.all(`SELECT se.id, se.student_id AS "studentId", st.full_name AS "studentName", st.document,
      st.grade, se.course_id AS "courseId", c.name AS "courseName", se.academic_year AS "academicYear",
      se.status, se.start_date AS "startDate", se.end_date AS "endDate", se.notes
      FROM student_enrollments se JOIN students st ON st.id = se.student_id
      LEFT JOIN courses c ON c.id = se.course_id
      WHERE se.school_id = ? ORDER BY se.academic_year DESC, st.full_name, se.start_date DESC LIMIT 1000`, user.school_id)
    return json(response, 200, { records })
  }
  const enrollmentTransferMatch = url.pathname.match(/^\/api\/enrollments\/history\/([0-9a-f-]{36})\/transfer$/i)
  if (enrollmentTransferMatch && method === 'POST') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden trasladar estudiantes.' })
    const body = await readBody(request)
    const destinationCourseId = String(body.courseId || '')
    const effectiveDate = String(body.effectiveDate || '')
    const notes = String(body.notes || '').trim()
    if (!validDate(effectiveDate) || notes.length > 1000) return json(response, 400, { error: 'Indica una fecha válida y una observación de máximo 1000 caracteres.' })
    const current = await db.get(`SELECT id, student_id AS "studentId", course_id AS "courseId", academic_year AS "academicYear"
      FROM student_enrollments WHERE id = ? AND school_id = ? AND status = 'Activa'`, enrollmentTransferMatch[1], user.school_id)
    if (!current) return json(response, 404, { error: 'No encontramos una matrícula activa para trasladar.' })
    const destination = await db.get(`SELECT id, grade, academic_year AS "academicYear" FROM courses
      WHERE id = ? AND school_id = ? AND is_active = 1`, destinationCourseId, user.school_id)
    if (!destination || destination.academicYear !== current.academicYear) return json(response, 400, { error: 'El curso destino debe estar activo y pertenecer al mismo año lectivo.' })
    if (destination.id === current.courseId) return json(response, 400, { error: 'Selecciona un curso distinto al actual.' })
    const newEnrollmentId = randomUUID()
    await db.transaction(async tx => {
      await tx.run(`UPDATE student_enrollments SET status = 'Trasladada', end_date = ?, notes = ? WHERE id = ? AND school_id = ?`, effectiveDate, notes, current.id, user.school_id)
      await tx.run(`INSERT INTO student_enrollments (id, school_id, student_id, course_id, academic_year, status, start_date, notes, created_by)
        VALUES (?, ?, ?, ?, ?, 'Activa', ?, ?, ?)`, newEnrollmentId, user.school_id, current.studentId, destination.id, current.academicYear, effectiveDate, notes, user.id)
      await tx.run('UPDATE students SET grade = ? WHERE id = ? AND school_id = ?', destination.grade, current.studentId, user.school_id)
    })
    await logAudit(user.school_id, user.id, 'student_transferred')
    return json(response, 200, { enrollmentId: newEnrollmentId, transferred: true })
  }

  if (url.pathname === '/api/students' && method === 'GET') {
    if (!['admin', 'secretaria', 'rectoria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar estudiantes.' })
    const search = `%${String(url.searchParams.get('search') || '').slice(0, 100)}%`
    const status = url.searchParams.get('status') || 'Todos'
    if (user.role === 'docente') {
      const students = await db.all(`SELECT st.id, st.full_name AS name, st.grade, st.status, st.created_at AS "createdAt"
        FROM students st
        WHERE st.school_id = ? AND st.status = 'Activo'
          AND (st.full_name LIKE ? OR st.grade LIKE ?)
          AND EXISTS (SELECT 1 FROM course_teachers ct JOIN courses c ON c.id = ct.course_id
            WHERE ct.user_id = ? AND c.school_id = st.school_id AND c.grade = st.grade AND c.is_active = 1)
        ORDER BY st.full_name LIMIT 500`, user.school_id, search, search, user.id)
      return json(response, 200, { students, scope: 'cursos_asignados' })
    }
    const students = await db.all(`SELECT id, (photo_data IS NOT NULL) AS "hasPhoto", full_name AS name, document, grade, guardian_name AS guardian, guardian_phone AS phone, status, access_status AS "accessStatus", access_suspension_reason AS "accessSuspensionReason", created_at AS "createdAt"
      FROM students WHERE school_id = ? AND (full_name LIKE ? OR document LIKE ? OR grade LIKE ? OR guardian_name LIKE ?)
      AND (? = 'Todos' OR status = ?) ORDER BY created_at DESC LIMIT 500`, user.school_id, search, search, search, search, status, status)
    return json(response, 200, { students })
  }
  if (url.pathname === '/api/students' && method === 'POST') {
    if (user.role !== 'admin' && user.role !== 'secretaria') return json(response, 403, { error: 'No tienes permiso para crear estudiantes.' })
    const body = await readLargeJsonBody(request, 3 * 1024 * 1024)
    const name = String(body.name || '').trim()
    const documentNumber = String(body.document || '').trim()
    const grade = String(body.grade || '').trim()
    const guardian = String(body.guardian || '').trim()
    const phone = String(body.phone || '').trim()
    const status = body.status === 'Retirado' ? 'Retirado' : 'Activo'
    if (name.length < 2 || name.length > 100 || !/^[\p{L}\p{N}.-]{3,30}$/u.test(documentNumber) || grade.length < 2 || grade.length > 40 || guardian.length < 2 || guardian.length > 100 || phone.length > 25) return json(response, 400, { error: 'Revisa los campos obligatorios del estudiante.' })
    const id = randomUUID(), cardCode = randomUUID()
    const photo = parseStudentPhoto(body.photo)
    if (body.photo && !photo) return json(response, 400, { error: 'La foto debe ser JPG, PNG o WEBP válida y no superar 2 MB.' })
    try {
      await db.run('INSERT INTO students (id, school_id, full_name, document, grade, guardian_name, guardian_phone, status, card_code, photo_content_type, photo_file_name, photo_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, name, documentNumber, grade, guardian, phone, status, cardCode, photo?.contentType || null, photo?.fileName || null, photo?.data || null)
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ese documento ya está registrado en este colegio.' })
      throw error
    }
    await logAudit(user.school_id, user.id, 'student_created')
    return json(response, 201, { student: await db.get('SELECT id, (photo_data IS NOT NULL) AS "hasPhoto", full_name AS name, document, grade, guardian_name AS guardian, guardian_phone AS phone, status, created_at AS "createdAt" FROM students WHERE id = ?', id) })
  }
    const studentMatch = url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})$/i)
  if (studentMatch && method === 'PATCH') {
    if (!['admin', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para modificar estudiantes.' })
    const id = studentMatch[1]
    const existing = await db.get('SELECT id, card_code AS "cardCode" FROM students WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!existing) return json(response, 404, { error: 'No encontramos ese estudiante en este colegio.' })
    const body = await readLargeJsonBody(request, 3 * 1024 * 1024)
    const name = String(body.name || '').trim()
    const documentNumber = String(body.document || '').trim()
    const grade = String(body.grade || '').trim()
    const guardian = String(body.guardian || '').trim()
    const phone = String(body.phone || '').trim()
    const status = String(body.status || '')
    if (name.length < 2 || name.length > 100 || !/^[\p{L}\p{N}.-]{3,30}$/u.test(documentNumber) || grade.length < 2 || grade.length > 40 || guardian.length < 2 || guardian.length > 100 || phone.length > 25 || !['Activo', 'Retirado'].includes(status)) return json(response, 400, { error: 'Revisa los campos obligatorios del estudiante.' })
    const photo = body.photo ? parseStudentPhoto(body.photo) : null
    if (body.photo && !photo) return json(response, 400, { error: 'La foto debe ser JPG, PNG o WEBP válida y no superar 2 MB.' })
    try {
      if (photo) await db.run('UPDATE students SET full_name = ?, document = ?, grade = ?, guardian_name = ?, guardian_phone = ?, status = ?, photo_content_type = ?, photo_file_name = ?, photo_data = ? WHERE id = ? AND school_id = ?', name, documentNumber, grade, guardian, phone, status, photo.contentType, photo.fileName, photo.data, id, user.school_id)
      else if (body.removePhoto === true) await db.run('UPDATE students SET full_name = ?, document = ?, grade = ?, guardian_name = ?, guardian_phone = ?, status = ?, photo_content_type = NULL, photo_file_name = NULL, photo_data = NULL WHERE id = ? AND school_id = ?', name, documentNumber, grade, guardian, phone, status, id, user.school_id)
      else await db.run('UPDATE students SET full_name = ?, document = ?, grade = ?, guardian_name = ?, guardian_phone = ?, status = ? WHERE id = ? AND school_id = ?', name, documentNumber, grade, guardian, phone, status, id, user.school_id)
    }
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
  const studentAccessMatch = url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})\/access$/i)
  if (studentAccessMatch && method === 'PATCH') {
    if (!['admin', 'rectoria'].includes(user.role)) return json(response, 403, { error: 'Solo rectoría o administración pueden suspender el acceso de un estudiante.' })
    const id = studentAccessMatch[1]
    const body = await readBody(request)
    const accessStatus = String(body.accessStatus || '')
    const reason = String(body.reason || '').trim()
    const academicYear = String(body.academicYear || '')
    const student = await db.get('SELECT id, access_status AS "accessStatus" FROM students WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!student) return json(response, 404, { error: 'No encontramos ese estudiante en este colegio.' })
    if (!['Activo', 'Suspendido'].includes(accessStatus)) return json(response, 400, { error: 'Estado de acceso no válido.' })
    if (accessStatus === 'Suspendido' && (reason.length < 5 || reason.length > 240)) return json(response, 400, { error: 'Escribe un motivo de suspensión de 5 a 240 caracteres.' })
    if (accessStatus === 'Suspendido' && (!/^\d{4}-\d{4}$/.test(academicYear) || Number(academicYear.slice(5)) !== Number(academicYear.slice(0, 4)) + 1)) return json(response, 400, { error: 'Selecciona un año lectivo válido para registrar el motivo.' })
    await db.run('UPDATE students SET access_status = ?, access_suspension_reason = ?, access_suspended_at = ?, access_suspended_by = ? WHERE id = ? AND school_id = ?', accessStatus, accessStatus === 'Suspendido' ? reason : '', accessStatus === 'Suspendido' ? new Date().toISOString() : null, accessStatus === 'Suspendido' ? user.id : null, id, user.school_id)
    if (accessStatus === 'Suspendido') await db.run("DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM user_students WHERE student_id = ? AND relationship = 'estudiante')", id)
    await logAudit(user.school_id, user.id, accessStatus === 'Suspendido' ? 'student_access_suspended' : 'student_access_reactivated')
    return json(response, 200, { updated: true, accessStatus, reason: accessStatus === 'Suspendido' ? reason : '' })
  }
  if (url.pathname === '/api/student-payments' && method === 'GET') {
    if (!['admin', 'rectoria', 'tesoreria'].includes(user.role)) return json(response, 403, { error: 'Los pagos solo están disponibles para administración, rectoría y tesorería.' })
    const academicYear = String(url.searchParams.get('academicYear') || '').slice(0, 9)
    const payments = await db.all(`SELECT p.id, p.student_id AS "studentId", st.full_name AS "studentName", st.document, st.grade,
      p.academic_year AS "academicYear", p.fee_type AS "feeType", p.billing_period AS "billingPeriod", p.amount, p.due_date AS "dueDate",
      p.status, p.paid_at AS "paidAt", p.payment_reference AS "paymentReference", p.notes, p.created_at AS "createdAt"
      FROM student_payment_records p JOIN students st ON st.id = p.student_id
      WHERE p.school_id = ? AND (? = '' OR p.academic_year = ?) ORDER BY CASE p.status WHEN 'Pendiente' THEN 0 ELSE 1 END, p.due_date, st.full_name`, user.school_id, academicYear, academicYear)
    const students = await db.all(`SELECT st.id, st.full_name AS name, st.document, st.grade, st.status,
      st.access_status AS "accessStatus", st.access_suspension_reason AS "accessSuspensionReason",
      COALESCE(SUM(CASE WHEN p.status = 'Pendiente' THEN p.amount ELSE 0 END), 0) AS "pendingBalance",
      COALESCE(SUM(CASE WHEN p.status = 'Pendiente' THEN 1 ELSE 0 END), 0) AS "pendingItems"
      FROM students st LEFT JOIN student_payment_records p ON p.student_id = st.id AND p.school_id = st.school_id AND (? = '' OR p.academic_year = ?)
      WHERE st.school_id = ? AND st.status = 'Activo' GROUP BY st.id, st.full_name, st.document, st.grade, st.status, st.access_status, st.access_suspension_reason ORDER BY st.full_name`, academicYear, academicYear, user.school_id)
    return json(response, 200, { payments, students })
  }
  if (url.pathname === '/api/student-payments' && method === 'POST') {
    if (!['admin', 'rectoria', 'tesoreria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para registrar pagos.' })
    const body = await readBody(request)
    const studentId = String(body.studentId || '')
    const academicYear = String(body.academicYear || '')
    const feeType = String(body.feeType || '')
    const billingPeriod = String(body.billingPeriod || '').trim()
    const amount = Number(body.amount)
    const dueDate = String(body.dueDate || '')
    const status = String(body.status || 'Pendiente')
    const paidAt = String(body.paidAt || '')
    const paymentReference = String(body.paymentReference || '').trim()
    const notes = String(body.notes || '').trim()
    const student = await db.get("SELECT id FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", studentId, user.school_id)
    if (!student) return json(response, 404, { error: 'Selecciona un estudiante activo de este colegio.' })
    if (!/^\d{4}-\d{4}$/.test(academicYear) || Number(academicYear.slice(5)) !== Number(academicYear.slice(0, 4)) + 1) return json(response, 400, { error: 'El año lectivo debe tener formato 2026-2027.' })
    if (!['Matrícula', 'Pensión'].includes(feeType) || (feeType === 'Pensión' && !/^\d{4}-\d{2}$/.test(billingPeriod)) || (feeType === 'Matrícula' && billingPeriod !== '')) return json(response, 400, { error: 'Revisa el concepto y el periodo del cobro.' })
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000 || !validDate(dueDate) || !['Pendiente', 'Pagado', 'Exonerado'].includes(status) || (paidAt && !validDate(paidAt)) || paymentReference.length > 120 || notes.length > 500) return json(response, 400, { error: 'Revisa el valor, las fechas, estado y referencia del pago.' })
    const existing = await db.get('SELECT id FROM student_payment_records WHERE student_id = ? AND academic_year = ? AND fee_type = ? AND billing_period = ?', studentId, academicYear, feeType, billingPeriod)
    if (existing) return json(response, 409, { error: 'Ya existe un cobro de ese concepto y periodo para el estudiante. Edita el registro existente.' })
    const id = randomUUID()
    await db.run(`INSERT INTO student_payment_records (id, school_id, student_id, academic_year, fee_type, billing_period, amount, due_date, status, paid_at, payment_reference, notes, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, user.school_id, studentId, academicYear, feeType, billingPeriod, amount, dueDate, status, status === 'Pagado' ? (paidAt || new Date().toISOString().slice(0, 10)) : null, paymentReference, notes, user.id, user.id)
    await logAudit(user.school_id, user.id, 'student_payment_created')
    return json(response, 201, { created: true, id })
  }
  const studentPaymentMatch = url.pathname.match(/^\/api\/student-payments\/([0-9a-f-]{36})$/i)
  if (studentPaymentMatch && method === 'PATCH') {
    if (!['admin', 'rectoria', 'tesoreria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para editar pagos.' })
    const id = studentPaymentMatch[1]
    const existing = await db.get('SELECT id FROM student_payment_records WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!existing) return json(response, 404, { error: 'No encontramos ese registro de pago.' })
    const body = await readBody(request)
    const status = String(body.status || ''), paidAt = String(body.paidAt || ''), reference = String(body.paymentReference || '').trim(), notes = String(body.notes || '').trim()
    if (!['Pendiente', 'Pagado', 'Exonerado'].includes(status) || (paidAt && !validDate(paidAt)) || reference.length > 120 || notes.length > 500) return json(response, 400, { error: 'Revisa el estado, fecha, referencia y observación.' })
    await db.run('UPDATE student_payment_records SET status = ?, paid_at = ?, payment_reference = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', status, status === 'Pagado' ? (paidAt || new Date().toISOString().slice(0, 10)) : null, reference, notes, user.id, id, user.school_id)
    await logAudit(user.school_id, user.id, 'student_payment_updated')
    return json(response, 200, { updated: true })
  }
  if (url.pathname.startsWith('/api/')) return json(response, 404, { error: 'Ruta no encontrada.' })
  return json(response, 404, { error: 'Recurso no encontrado.' })
}

const server = createServer((request, response) => {
  route(request, response).catch(error => {
    const failedPath = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname
    console.error('API request error:', request.method, failedPath, error.message)
    if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : 'Error interno del servidor.' })
    else response.destroy()
  })
})

await migrate()
server.listen(port, '0.0.0.0', () => console.log(`Educa API (${databaseType}) disponible en puerto ${port}`))
