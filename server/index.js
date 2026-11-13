import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomBytes, randomUUID, randomInt, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { basename, extname, resolve, sep } from 'node:path'
import { db, logAudit, migrate, databaseType, nextDocumentNumber, registerControlledDocument } from './db.js'

const scrypt = promisify(scryptCallback)
const port = Number(process.env.PORT || process.env.API_PORT || 3001)
const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : ''
const sessionTtl = 8 * 60 * 60 * 1000
const institutionManagerEmail = 'smiranda15@uan.edu.co'
const loginAttempts = new Map()
const passwordResetRequestAttempts = new Map()
const passwordResetVerifyAttempts = new Map()
const passwordResetReviewRoles = new Set(['admin', 'rectoria', 'coordinacion', 'secretaria'])
const accountRoles = new Set(['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'orientacion', 'tesoreria', 'acudiente', 'estudiante'])
const institutionalManagerRoles = ['admin', 'rectoria']
const signerPositions = new Set(['rector', 'academic_coordinator', 'coexistence_coordinator', 'teacher', 'group_director', 'academic_secretary', 'administrative', 'other'])
const documentSignatureTypes = new Set(['report_card', 'study_certificate', 'academic_certificate', 'academic_report', 'other'])
const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const configuredOrigins = new Set((process.env.EDUCA_ALLOWED_ORIGINS || '').split(',').map(value => {
  try { return new URL(value.trim()).origin } catch { return '' }
}).filter(Boolean))
const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...headers })
  response.end(JSON.stringify(body))
}
const academicYearStart = value => {
  const match = String(value || '').trim().match(/^(\d{4})(?:-(\d{4}))?$/)
  if (!match) return ''
  if (match[2] && Number(match[2]) !== Number(match[1]) + 1) return ''
  return match[1]
}
const schoolGradeRank = value => {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es')
  const first = normalized.match(/^(\d{1,2}|[\p{L}]+)/u)?.[1] || ''
  const numeric = Number(first)
  if (/^\d+$/.test(first) && numeric >= 1 && numeric <= 11) return numeric
  return ({ prejardin: -2, jardin: -1, transicion: 0, primero: 1, segundo: 2, tercero: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10, undecimo: 11, once: 11 })[first] ?? null
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
const parseInstitutionalSignature = value => {
  if (!value || typeof value !== 'object' || typeof value.data !== 'string') return null
  const fileName = basename(String(value.fileName || 'firma.png')).slice(0, 120)
  if (extname(fileName).toLowerCase() !== '.png' || !/^data:image\/png;base64,/.test(value.data)) return null
  const data = Buffer.from(value.data.slice(value.data.indexOf(',') + 1), 'base64')
  if (data.length < 16 || data.length > 512 * 1024 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null
  return { fileName, contentType: 'image/png', data }
}
const defaultSignatureRules = {
  report_card: ['group_director', 'rector'], study_certificate: ['rector', 'academic_secretary'],
  academic_certificate: ['rector', 'academic_coordinator'], academic_report: ['group_director', 'academic_coordinator'], other: ['other', '']
}
const directMessageStaffRoles = new Set(['admin', 'rectoria', 'coordinacion', 'secretaria', 'orientacion', 'tesoreria', 'docente'])
const directMessageOfficeRoles = new Set(['admin', 'rectoria', 'coordinacion', 'secretaria', 'orientacion', 'tesoreria'])
async function canDirectMessage(sender, recipient) {
  if (!sender || !recipient || sender.school_id !== recipient.school_id || sender.id === recipient.id) return false
  const senderRole = sender.role
  const recipientRole = recipient.role
  const familyRoles = ['estudiante', 'acudiente']
  if (![...directMessageStaffRoles, ...familyRoles].includes(senderRole) || ![...directMessageStaffRoles, ...familyRoles].includes(recipientRole)) return false
  if (['admin', 'rectoria', 'coordinacion', 'secretaria', 'orientacion', 'tesoreria'].includes(senderRole)) return true
  if (directMessageOfficeRoles.has(recipientRole)) return true
  if (senderRole === 'docente' && ['estudiante', 'acudiente'].includes(recipientRole)) {
    return Boolean(await db.get(`SELECT 1 FROM user_students us
      JOIN students st ON st.id = us.student_id AND st.school_id = ? AND st.status = 'Activo'
      JOIN courses c ON c.school_id = st.school_id AND c.grade = st.grade AND c.is_active = 1
      JOIN course_teachers ct ON ct.course_id = c.id AND ct.user_id = ?
      WHERE us.user_id = ? AND us.relationship = ? LIMIT 1`, sender.school_id, sender.id, recipient.id, recipientRole === 'estudiante' ? 'estudiante' : 'acudiente'))
  }
  if (['estudiante', 'acudiente'].includes(senderRole) && recipientRole === 'docente') {
    return Boolean(await db.get(`SELECT 1 FROM user_students us
      JOIN students st ON st.id = us.student_id AND st.school_id = ? AND st.status = 'Activo'
      JOIN courses c ON c.school_id = st.school_id AND c.grade = st.grade AND c.is_active = 1
      JOIN course_teachers ct ON ct.course_id = c.id AND ct.user_id = ?
      WHERE us.user_id = ? AND us.relationship = ? LIMIT 1`, sender.school_id, recipient.id, sender.id, senderRole))
  }
  return directMessageStaffRoles.has(senderRole) && directMessageStaffRoles.has(recipientRole)
}
let pushMessagingPromise
let emailTransportPromise
const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM) || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
function getEmailTransport() {
  const host = String(process.env.SMTP_HOST || '').trim()
  const user = String(process.env.SMTP_USER || '').trim()
  const pass = process.env.SMTP_PASS || ''
  const port = Number(process.env.SMTP_PORT || 587)
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) return null
  if (!emailTransportPromise) emailTransportPromise = import('nodemailer').then(({ default: nodemailer }) => nodemailer.createTransport({
    host, port, secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  }))
  return emailTransportPromise
}
const escapeEmailHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
async function sendEmail({ to, bcc, subject, text, institutionName = '' }) {
  const recipients = [...new Set([...(Array.isArray(to) ? to : [to]), ...(Array.isArray(bcc) ? bcc : [bcc])].filter(Boolean).map(value => String(value).trim()).filter(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) ]
  if (!recipients.length) return { sent: 0, configured: isEmailConfigured() }
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim()
  const resendFrom = String(process.env.RESEND_FROM || '').trim()
  if (resendApiKey && resendFrom) {
    let sent = 0
    try {
      for (let offset = 0; offset < recipients.length; offset += 40) {
        const batch = recipients.slice(offset, offset + 40)
        const payload = {
          from: institutionSender(resendFrom, institutionName),
          to: [batch[0]],
          ...(batch.length > 1 ? { bcc: batch.slice(1) } : {}),
          subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 180),
          text: String(text).slice(0, 6000),
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#18324a"><div style="padding:20px 24px;background:#173653;color:#fff;font-weight:700;font-size:20px">EDUCA · Gestión escolar</div><div style="padding:24px;line-height:1.6">${escapeEmailHtml(text).split('\n').map(line => `<p>${line || '&nbsp;'}</p>`).join('')}</div><div style="padding:16px 24px;border-top:1px solid #e4eaf0;color:#607386;font-size:12px">Este correo es una notificación automática de EDUCA. No respondas con contraseñas ni información financiera.</div></div>`,
        }
        if (process.env.SMTP_REPLY_TO) payload.reply_to = String(process.env.SMTP_REPLY_TO).trim()
        const result = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        })
        if (!result.ok) {
          console.error('EDUCA email delivery failed:', `resend_http_${result.status}`)
          return { sent, configured: true, failed: true }
        }
        sent += batch.length
      }
      return { sent, configured: true }
    } catch (error) {
      console.error('EDUCA email delivery failed:', error.name === 'TimeoutError' ? 'resend_timeout' : 'resend_delivery_error')
      return { sent, configured: true, failed: true }
    }
  }
  let transport
  try { transport = await getEmailTransport() } catch (error) {
    console.error('EDUCA email transport initialization failed:', error.code || 'configuration_error')
    return { sent: 0, configured: true, failed: true }
  }
  if (!transport) return { sent: 0, configured: false }
  const from = institutionSender(String(process.env.SMTP_FROM || process.env.SMTP_USER).trim(), institutionName)
  const replyTo = String(process.env.SMTP_REPLY_TO || '').trim()
  let sent = 0
  try {
    for (let offset = 0; offset < recipients.length; offset += 40) {
      const batch = recipients.slice(offset, offset + 40)
      await transport.sendMail({
        from, to: from, bcc: batch, ...(replyTo ? { replyTo } : {}),
        subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 180), text: String(text).slice(0, 6000),
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#18324a"><div style="padding:20px 24px;background:#173653;color:#fff;font-weight:700;font-size:20px">EDUCA · Gestión escolar</div><div style="padding:24px;line-height:1.6">${escapeEmailHtml(text).split('\n').map(line => `<p>${line || '&nbsp;'}</p>`).join('')}</div><div style="padding:16px 24px;border-top:1px solid #e4eaf0;color:#607386;font-size:12px">Este correo es una notificación automática de EDUCA. No respondas con contraseñas ni información financiera.</div></div>`,
      })
      sent += batch.length
    }
    return { sent, configured: true }
  } catch (error) {
    console.error('EDUCA email delivery failed:', error.code || (error.name === 'TimeoutError' ? 'smtp_timeout' : 'delivery_error'))
    return { sent, configured: true, failed: true }
  }
}
function institutionSender(configuredFrom, institutionName) {
  const name = String(institutionName || '').replace(/[\r\n<>\"]+/g, ' ').trim().slice(0, 100)
  if (!name) return configuredFrom
  const address = configuredFrom.match(/<([^<>]+)>/)?.[1] || configuredFrom
  const displayName = `${name} · EDUCA`.replaceAll('"', '')
  return `"${displayName}" <${address}>`
}
async function sendInstitutionEmail(schoolId, { to, bcc, subject, text }) {
  const school = await db.get('SELECT name FROM schools WHERE id = ?', schoolId)
  const institutionName = String(school?.name || 'Institución educativa').trim()
  return sendEmail({
    to, bcc, institutionName,
    subject: `[${institutionName}] ${subject}`,
    text: `Institución emisora: ${institutionName}\nPlataforma: EDUCA\n\n${text}`,
  })
}
async function sendEmailToUsers(schoolId, recipientIds, subject, text) {
  const ids = [...new Set((recipientIds || []).filter(Boolean))]
  if (!ids.length) return { sent: 0, configured: isEmailConfigured() }
  const recipients = []
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500)
    recipients.push(...await db.all(`SELECT email FROM users WHERE school_id = ? AND is_active = 1 AND deleted_at IS NULL AND id IN (${batch.map(() => '?').join(',')})`, schoolId, ...batch))
  }
  return sendInstitutionEmail(schoolId, { bcc: recipients.map(item => item.email), subject, text })
}
function normalizeColombianMobile(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (/^3\d{9}$/.test(digits)) return `+57${digits}`
  if (/^573\d{9}$/.test(digits)) return `+${digits}`
  return null
}
function maskPhone(value) {
  const phone = normalizeColombianMobile(value)
  return phone ? `+57 ••• ••• ${phone.slice(-4)}` : ''
}
async function sendSms(phone, content) {
  const apiKey = String(process.env.INALAMBRIA_API_KEY || '').trim()
  const destination = normalizeColombianMobile(phone)
  if (!apiKey || !destination) return { sent: false, configured: Boolean(apiKey), reason: !apiKey ? 'not_configured' : 'invalid_phone' }
  try {
    const response = await fetch('https://api.inalambria.express/v1/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: [destination], content, async: true }),
      signal: AbortSignal.timeout(15_000),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.ok === false) {
      console.error('EDUCA SMS delivery failed:', `inalambria_http_${response.status}`)
      return { sent: false, configured: true, reason: 'provider_error' }
    }
    return { sent: true, configured: true, consumptionId: String(result.consumptionId || result.jobId || '').slice(0, 120) }
  } catch (error) {
    console.error('EDUCA SMS delivery failed:', error.name === 'TimeoutError' ? 'inalambria_timeout' : 'inalambria_delivery_error')
    return { sent: false, configured: true, reason: 'delivery_error' }
  }
}
async function getPushMessaging() {
  const encodedCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!encodedCredentials) return null
  if (!pushMessagingPromise) pushMessagingPromise = (async () => {
    const credentials = JSON.parse(encodedCredentials)
    if (!credentials.project_id || !credentials.client_email || !credentials.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene una cuenta de servicio válida.')
    const { getApps, initializeApp, cert } = await import('firebase-admin/app')
    const { getMessaging } = await import('firebase-admin/messaging')
    const app = getApps().find(item => item.name === 'educa-push') || initializeApp({ credential: cert(credentials), projectId: credentials.project_id }, 'educa-push')
    return getMessaging(app)
  })()
  return pushMessagingPromise
}
function notificationTargetModule(category) {
  return ({ password_reset: 'Solicitudes de contraseña', attendance: 'Justificaciones', calendar: 'Calendario', communication: 'Comunicaciones', message: 'Mensajería', certificate: 'Certificados y constancias', report_card: 'Boletines' })[category] || 'Notificaciones'
}
async function sendPushNotifications(schoolId, recipientIds, title, body, category = 'general', eventId = '', targetId = eventId) {
  const uniqueRecipients = [...new Set(recipientIds.filter(Boolean))]
  if (!uniqueRecipients.length || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return { sent: 0, registered: 0, configured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) }
  try {
    const messaging = await getPushMessaging()
    const tokens = await db.all(`SELECT d.token FROM device_push_tokens d JOIN users u ON u.id = d.user_id AND u.school_id = d.school_id
      WHERE d.school_id = ? AND d.is_active = 1 AND u.is_active = 1 AND u.deleted_at IS NULL AND d.user_id IN (${uniqueRecipients.map(() => '?').join(',')})`, schoolId, ...uniqueRecipients)
    let sent = 0
    for (let offset = 0; offset < tokens.length; offset += 500) {
      const batch = tokens.slice(offset, offset + 500)
      const result = await messaging.sendEachForMulticast({
        tokens: batch.map(item => item.token),
        notification: { title: String(title).slice(0, 120), body: String(body).slice(0, 240) },
        data: { category: String(category), eventId: String(eventId || ''), targetModule: notificationTargetModule(category), targetId: String(targetId || ''), destination: notificationTargetModule(category) },
        android: { priority: 'high', notification: { channelId: 'educa_notifications', sound: 'default' } },
      })
      sent += result.successCount
      const invalidTokens = result.responses.flatMap((entry, index) => entry.success ? [] : ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(entry.error?.code) ? [batch[index].token] : [])
      if (invalidTokens.length) await db.run(`UPDATE device_push_tokens SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE token IN (${invalidTokens.map(() => '?').join(',')})`, ...invalidTokens)
    }
    return { sent, registered: tokens.length, configured: true }
  } catch (error) {
    console.error('EDUCA push notification delivery failed:', error.code || 'delivery_error')
    return { sent: 0, registered: 0, configured: true, failed: true }
  }
}
async function resolveDocumentSigners(schoolId, documentType, courseId = null) {
  const defaults = defaultSignatureRules[documentType] || defaultSignatureRules.other
  const rule = await db.get('SELECT primary_position AS "primaryPosition", secondary_position AS "secondaryPosition", primary_staff_id AS "primaryStaffId", secondary_staff_id AS "secondaryStaffId" FROM document_signature_rules WHERE school_id = ? AND document_type = ?', schoolId, documentType)
  const selections = rule || { primaryPosition: defaults[0], secondaryPosition: defaults[1], primaryStaffId: null, secondaryStaffId: null }
  const resolveOne = async (positionKey, staffId) => {
    if (!positionKey) return null
    let staff = staffId ? await db.get('SELECT id, full_name AS "fullName", position_title AS "positionTitle", signature_data AS "signatureData" FROM institutional_staff WHERE id = ? AND school_id = ? AND is_active = 1', staffId, schoolId) : null
    if (!staff && positionKey === 'group_director' && courseId) staff = await db.get(`SELECT st.id, st.full_name AS "fullName", st.position_title AS "positionTitle", st.signature_data AS "signatureData"
      FROM course_group_directors d JOIN institutional_staff st ON st.id = d.staff_id WHERE d.course_id = ? AND d.school_id = ? AND st.is_active = 1`, courseId, schoolId)
    if (!staff) staff = await db.get('SELECT id, full_name AS "fullName", position_title AS "positionTitle", signature_data AS "signatureData" FROM institutional_staff WHERE school_id = ? AND position_key = ? AND is_active = 1 ORDER BY created_at, full_name LIMIT 1', schoolId, positionKey)
    if (!staff) return null
    return { id: staff.id, fullName: staff.fullName, positionTitle: staff.positionTitle, signature: staff.signatureData ? `data:image/png;base64,${Buffer.from(staff.signatureData).toString('base64')}` : null }
  }
  const signatures = []
  const primary = await resolveOne(selections.primaryPosition, selections.primaryStaffId)
  const secondary = await resolveOne(selections.secondaryPosition, selections.secondaryStaffId)
  if (primary) signatures.push(primary)
  if (secondary && secondary.id !== primary?.id) signatures.push(secondary)
  return signatures
}
const validYouTubeUrl = value => {
  if (!value) return true
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) return false
    const id = url.hostname === 'youtu.be' ? url.pathname.split('/').filter(Boolean)[0] : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1]
    return /^[\w-]{11}$/.test(id || '')
  } catch { return false }
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
      s.primary_color AS school_primary_color, s.logo_content_type AS school_logo_content_type,
      s.contact_email AS school_contact_email, s.contact_phone AS school_contact_phone, s.address AS school_address
    FROM sessions x JOIN users u ON x.user_id = u.id JOIN schools s ON s.id = u.school_id
    WHERE x.token_hash = ? AND x.expires_at > ? AND u.is_active = 1 AND u.deleted_at IS NULL AND s.is_active = 1 AND s.archived_at IS NULL
      AND (u.role <> 'estudiante' OR (
        EXISTS (SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id
          JOIN student_enrollments se ON se.student_id = st.id AND se.school_id = st.school_id AND se.status = 'Activa'
          WHERE us.user_id = u.id AND us.relationship = 'estudiante' AND st.status = 'Activo')
        AND NOT EXISTS (SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id
          WHERE us.user_id = u.id AND us.relationship = 'estudiante' AND st.access_status = 'Suspendido')
      ))`, hashToken(token), Date.now())
}
const sessionCookie = (token, maxAge) => `educa_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookie}`
const safeUser = user => ({ id: user.id, email: user.email, name: user.full_name, role: user.role, school: { id: user.school_id, name: user.school_name, slug: user.school_slug, primaryColor: user.school_primary_color || '#6c70df', hasLogo: Boolean(user.school_logo_content_type), contactEmail: user.school_contact_email || '', contactPhone: user.school_contact_phone || '', address: user.school_address || '' } })
const legalTermsVersion = '2026-11-03-v1'

function parseOnlineQuestionConfig(question) {
  let saved
  try { saved = JSON.parse(question.optionsJson || '[]') } catch { saved = [] }
  // Las preguntas antiguas guardaban únicamente el arreglo de opciones.
  if (Array.isArray(saved)) return { type: 'single', options: saved, correctOptions: [Number(question.correctOption)] }
  const type = ['single', 'multiple', 'short', 'paragraph'].includes(saved?.type) ? saved.type : 'single'
  return { type, options: Array.isArray(saved?.options) ? saved.options : [],
    correctOptions: Array.isArray(saved?.correctOptions) ? saved.correctOptions : [Number(question.correctOption)],
    expectedAnswer: typeof saved?.expectedAnswer === 'string' ? saved.expectedAnswer : '' }
}

function isValidOnlineAnswer(question, answer) {
  const config = parseOnlineQuestionConfig(question)
  if (config.type === 'single') return Number.isInteger(answer) && answer >= 0 && answer < config.options.length
  if (config.type === 'multiple') return Array.isArray(answer) && answer.length > 0 && answer.length <= config.options.length &&
    answer.every(value => Number.isInteger(value) && value >= 0 && value < config.options.length) && new Set(answer).size === answer.length
  return typeof answer === 'string' && answer.trim().length > 0 && answer.length <= 5000
}

function normalizedShortAnswer(value) { return String(value || '').trim().toLocaleLowerCase('es') }

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  const method = request.method || 'GET'
  if (url.pathname.startsWith('/api/') && stateChangingMethods.has(method) && !requestOriginAllowed(request)) return json(response, 403, { error: 'Origen de solicitud no autorizado.' })

  if (method === 'GET' && url.pathname === '/api/health') return json(response, 200, { status: 'ok' })
  if (method === 'GET' && url.pathname === '/api/downloads/windows') {
    const configuredUrl = String(process.env.EDUCA_WINDOWS_INSTALLER_URL || '').trim()
    let installerUrl
    try { installerUrl = new URL(configuredUrl) } catch {}
    if (installerUrl?.protocol === 'https:') {
      response.writeHead(302, { Location: installerUrl.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      return response.end()
    }
    response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return response.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descarga de EDUCA para Windows</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f3f7fa;color:#18354b;margin:0;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;margin:24px;padding:32px;background:white;border:1px solid #d9e5ed;border-radius:20px;box-shadow:0 16px 48px #18354b12}h1{font-size:1.6rem;margin-top:0}a{color:#23648a}</style><main class="card"><h1>Descarga para Windows</h1><p>El instalador de EDUCA todavía no está publicado para descarga. Vuelve a intentarlo más tarde o solicita el enlace al administrador.</p><p><a href="/">Volver a EDUCA</a></p></main></html>`)
  }
  const staffCardVerificationMatch = url.pathname.match(/^\/api\/public\/staff-card\/([0-9a-f-]{36})$/i)
  if (method === 'GET' && staffCardVerificationMatch) {
    const record = await db.get(`SELECT p.id, p.full_name AS "staffName", p.position_title AS "positionTitle", p.is_active AS "isActive",
      s.name AS "schoolName", s.slug AS "schoolSlug", (s.logo_content_type IS NOT NULL) AS "hasLogo"
      FROM institutional_staff p JOIN schools s ON s.id = p.school_id WHERE p.id = ?`, staffCardVerificationMatch[1])
    if (!record) return json(response, 404, { valid: false, status: 'Carné no encontrado.' })
    const valid = Boolean(record.isActive)
    return json(response, 200, { valid, status: valid ? 'Carné institucional vigente' : 'Carné institucional inactivo', documentKind: 'Carné de personal', staffName: record.staffName, positionTitle: record.positionTitle, hasLogo: Boolean(record.hasLogo), schoolName: record.schoolName, schoolSlug: record.schoolSlug })
  }
  const studentCardVerificationMatch = url.pathname.match(/^\/api\/public\/student-card\/([0-9a-f-]{36})$/i)
  if (method === 'GET' && studentCardVerificationMatch) {
    const record = await db.get(`SELECT st.full_name AS "studentName", st.grade, st.status, s.name AS "schoolName", s.slug AS "schoolSlug", (s.logo_content_type IS NOT NULL) AS "hasLogo"
      FROM students st JOIN schools s ON s.id = st.school_id WHERE st.card_code = ?`, studentCardVerificationMatch[1])
    if (!record) return json(response, 404, { valid: false, status: 'Carné no encontrado.' })
    const valid = record.status === 'Activo'
    return json(response, 200, { valid, status: valid ? 'Carné estudiantil vigente' : 'Carné estudiantil inactivo', documentKind: 'Carné estudiantil', studentName: record.studentName, grade: record.grade, hasLogo: Boolean(record.hasLogo), schoolName: record.schoolName, schoolSlug: record.schoolSlug })
  }
  const publicVerificationMatch = url.pathname.match(/^\/api\/public\/verification\/(constancia|boletin)\/([0-9a-f-]{36})$/i)
  if (method === 'GET' && publicVerificationMatch) {
    const [, kind, token] = publicVerificationMatch
    if (kind.toLowerCase() === 'constancia') {
      const record = await db.get(`SELECT d.status, d.certificate_number AS "certificateNumber", d.document_number AS "documentNumber", d.certificate_type AS "certificateType",
        d.student_name AS "studentName", d.grade, d.course_name_snapshot AS "courseName", d.academic_status_snapshot AS "academicStatusSnapshot", d.academic_year AS "academicYear", d.rector_name AS "rectorName", d.signed_at AS "signedAt",
        s.name AS "schoolName", s.slug AS "schoolSlug", s.primary_color AS "primaryColor", (s.logo_content_type IS NOT NULL) AS "hasLogo"
        FROM school_certificates d JOIN schools s ON s.id = d.school_id WHERE d.verification_code = ?`, token)
      if (!record) return json(response, 404, { valid: false, status: 'Código no encontrado.' })
      const valid = record.status === 'Emitida' && Boolean(record.signedAt && record.rectorName)
      return json(response, 200, { valid, status: valid ? 'Documento vigente y firmado' : record.status === 'Anulada' ? 'Documento anulado' : record.status === 'Reemplazada' ? 'Documento reemplazado' : 'Documento no vigente', documentKind: 'Constancia', ...record, hasLogo: Boolean(record.hasLogo) })
    }
    const record = await db.get(`SELECT rv.document_number AS "documentNumber", rv.academic_year AS "academicYear", rv.period, p.is_published AS "isPublished",
        p.published_at AS "publishedAt", st.full_name AS "studentName", st.grade,
        s.name AS "schoolName", s.slug AS "schoolSlug", s.primary_color AS "primaryColor", (s.logo_content_type IS NOT NULL) AS "hasLogo"
        FROM report_card_verifications rv JOIN schools s ON s.id = rv.school_id
        JOIN students st ON st.id = rv.student_id
        LEFT JOIN grade_period_publications p ON p.school_id = rv.school_id AND p.academic_year = rv.academic_year AND p.period = rv.period
        WHERE rv.token = ?`, token)
    if (!record) return json(response, 404, { valid: false, status: 'Código no encontrado.' })
    const valid = Boolean(record.isPublished)
    return json(response, 200, { valid, status: valid ? 'Boletín publicado y vigente' : 'Boletín retirado o no publicado', documentKind: 'Boletín académico', ...record, hasLogo: Boolean(record.hasLogo) })
  }
  if (method === 'GET' && url.pathname === '/api/auth/setup-status') {
    const count = Number((await db.get('SELECT COUNT(*) AS count FROM users')).count)
    return json(response, 200, { setupRequired: count === 0 })
  }
  if (method === 'POST' && url.pathname === '/api/auth/password-reset-requests') {
    const address = request.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const attempt = passwordResetRequestAttempts.get(address)
    if (attempt && attempt.expiresAt > now && attempt.count >= 5) return json(response, 200, { message: 'Si los datos corresponden a una cuenta activa, la solicitud quedó registrada para revisión.' })
    if (!attempt || attempt.expiresAt <= now) passwordResetRequestAttempts.set(address, { count: 1, expiresAt: now + 15 * 60_000 })
    else attempt.count += 1
    if (passwordResetRequestAttempts.size > 10_000) for (const [key, value] of passwordResetRequestAttempts) if (value.expiresAt <= now) passwordResetRequestAttempts.delete(key)
    const body = await readBody(request)
    const slug = slugify(String(body.school || '').trim())
    const email = String(body.email || '').trim().toLowerCase()
    const genericMessage = 'Si los datos corresponden a una cuenta activa, la solicitud quedó registrada para revisión.'
    if (!slug || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(response, 200, { message: genericMessage })
    const account = await db.get(`SELECT u.id, u.school_id AS "schoolId", u.full_name AS "fullName", u.role
      FROM users u JOIN schools s ON s.id = u.school_id
      WHERE LOWER(s.slug) = ? AND s.is_active = 1 AND s.archived_at IS NULL AND u.email = ? AND u.is_active = 1 AND u.deleted_at IS NULL`, slug, email)
    if (!account || !accountRoles.has(account.role)) return json(response, 200, { message: genericMessage })
    const recent = await db.get(`SELECT id FROM password_reset_requests WHERE school_id = ? AND user_id = ?
      AND status IN ('Pendiente','Aprobada') ORDER BY requested_at DESC LIMIT 1`, account.schoolId, account.id)
    if (!recent) {
      const id = randomUUID()
      let reviewerIds = []
      await db.transaction(async tx => {
        await tx.run(`INSERT INTO password_reset_requests (id, school_id, user_id, email, full_name_snapshot, role_snapshot)
          VALUES (?, ?, ?, ?, ?, ?)`, id, account.schoolId, account.id, email, account.fullName, account.role)
        const reviewers = await tx.all(`SELECT id, email FROM users WHERE school_id = ? AND role IN ('admin','rectoria','coordinacion','secretaria')
          AND is_active = 1 AND deleted_at IS NULL`, account.schoolId)
        reviewerIds = reviewers.map(reviewer => reviewer.id)
        for (const reviewer of reviewers) await tx.run(`INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module, target_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, randomUUID(), account.schoolId, reviewer.id, 'Solicitud de recuperación de contraseña', `${account.fullName} · Revisa la solicitud en Solicitudes de contraseña.`, 'password_reset', 'Solicitudes de contraseña', id)
        await tx.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, NULL, ?)', account.schoolId, 'password_reset_requested')
      })
      await sendPushNotifications(account.schoolId, reviewerIds, 'Solicitud de recuperación de contraseña', 'Hay una solicitud pendiente en el panel de soporte.', 'password_reset', id)
      const reviewerEmails = await db.all(`SELECT email FROM users WHERE school_id = ? AND role IN ('admin','rectoria','coordinacion','secretaria') AND is_active = 1 AND deleted_at IS NULL`, account.schoolId)
      await sendInstitutionEmail(account.schoolId, { bcc: reviewerEmails.map(item => item.email), subject: 'Solicitud de recuperación de contraseña', text: `Hay una solicitud de recuperación pendiente para ${account.fullName} (${account.role}).\nIngresa a EDUCA y revisa el módulo Solicitudes de contraseña. No compartas códigos por otros canales.` })
      await sendInstitutionEmail(account.schoolId, { to: email, subject: 'Recibimos tu solicitud de recuperación', text: `Hola ${account.fullName},\nRecibimos tu solicitud para recuperar el acceso a EDUCA. Rectoría o administración debe revisarla. Si la aprueba, recibirás en este correo un enlace seguro para crear una nueva contraseña.\n\nEl enlace vence en 30 minutos y solo se puede usar una vez. Si no solicitaste este cambio, contacta a tu institución. No compartas enlaces ni códigos.` })
    }
    return json(response, 200, { message: genericMessage })
  }
  if (method === 'POST' && url.pathname === '/api/auth/password-reset') {
    const body = await readBody(request)
    const slug = slugify(String(body.school || '').trim())
    const email = String(body.email || '').trim().toLowerCase()
    const code = String(body.code || '').trim()
    const newPassword = String(body.newPassword || '')
    if (newPassword.length < 12 || newPassword.length > 128) return json(response, 400, { error: 'La nueva contraseña debe tener entre 12 y 128 caracteres.' })
    const verifyKey = `${request.socket.remoteAddress || 'unknown'}:${slug}:${email}`
    const verifyAttempt = passwordResetVerifyAttempts.get(verifyKey)
    if (verifyAttempt && verifyAttempt.expiresAt > Date.now() && verifyAttempt.count >= 5) return json(response, 429, { error: 'Se alcanzó el límite de intentos. Espera 15 minutos o solicita una nueva aprobación.' })
    const school = slug ? await db.get('SELECT id FROM schools WHERE slug = ? AND is_active = 1 AND archived_at IS NULL', slug) : null
    const requestRecord = school && email && code ? await db.get(`SELECT r.id, r.user_id AS "userId", r.reset_token_hash AS "resetTokenHash", u.id AS "activeUserId", u.email, u.full_name AS "fullName"
      FROM password_reset_requests r JOIN users u ON u.id = r.user_id
      WHERE r.school_id = ? AND r.email = ? AND r.status = 'Aprobada' AND r.token_expires_at > ?
      AND u.is_active = 1 AND u.deleted_at IS NULL ORDER BY r.reviewed_at DESC LIMIT 1`, school.id, email, new Date().toISOString()) : null
    const actualHash = Buffer.from(hashToken(code), 'hex')
    const expectedHash = Buffer.from(requestRecord?.resetTokenHash || '', 'hex')
    const validCode = expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash)
    if (!requestRecord || !validCode) {
      if (!verifyAttempt || verifyAttempt.expiresAt <= Date.now()) passwordResetVerifyAttempts.set(verifyKey, { count: 1, expiresAt: Date.now() + 15 * 60_000 })
      else verifyAttempt.count += 1
      if (passwordResetVerifyAttempts.size > 10_000) for (const [key, value] of passwordResetVerifyAttempts) if (value.expiresAt <= Date.now()) passwordResetVerifyAttempts.delete(key)
      return json(response, 400, { error: 'No se pudo validar la solicitud. Revisa institución, correo y código o solicita una nueva revisión.' })
    }
    passwordResetVerifyAttempts.delete(verifyKey)
    const passwordHash = await hashPassword(newPassword)
    await db.transaction(async tx => {
      await tx.run('UPDATE users SET password_hash = ? WHERE id = ? AND school_id = ?', passwordHash, requestRecord.userId, school.id)
      await tx.run('DELETE FROM sessions WHERE user_id = ?', requestRecord.userId)
      await tx.run(`UPDATE password_reset_requests SET status = 'Completada', reset_token_hash = NULL, token_expires_at = NULL,
        completed_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ? AND status = 'Aprobada'`, requestRecord.id, school.id)
      await tx.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', school.id, requestRecord.userId, 'password_reset_completed')
    })
    await sendInstitutionEmail(school.id, { to: requestRecord.email, subject: 'Contraseña actualizada', text: `Hola ${requestRecord.fullName},\nLa contraseña de tu cuenta de EDUCA fue actualizada correctamente.\n\nSi no realizaste este cambio, contacta de inmediato a rectoría o administración de tu colegio.` })
    return json(response, 200, { message: 'La contraseña se actualizó. Ya puedes iniciar sesión.' })
  }
  const publicSchoolLogo = url.pathname.match(/^\/api\/schools\/([a-z0-9-]{1,48})\/logo$/i)
  if (method === 'GET' && publicSchoolLogo) {
    const logo = await db.get('SELECT logo_content_type AS "contentType", logo_data AS "fileData" FROM schools WHERE LOWER(slug) = ? AND logo_content_type IS NOT NULL', publicSchoolLogo[1].toLowerCase())
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
  const publicSchoolSiteMatch = url.pathname.match(/^\/api\/public\/schools\/([a-z0-9-]{1,48})\/site$/i)
  if (method === 'GET' && publicSchoolSiteMatch) {
    const school = await db.get(`SELECT id, name, slug, contact_email AS "contactEmail", contact_phone AS "contactPhone", address, primary_color AS "primaryColor", logo_content_type AS "logoContentType"
      FROM schools WHERE LOWER(slug) = ? AND is_active = 1 AND archived_at IS NULL`, publicSchoolSiteMatch[1].toLowerCase())
    if (!school) return json(response, 404, { error: 'No encontramos el sitio de esta institución.' })
    const saved = await db.get('SELECT content_json AS content FROM school_public_sites WHERE school_id = ?', school.id)
    let content = {}
    try { content = JSON.parse(saved?.content || '{}') } catch { content = {} }
    const photos = await db.all(`SELECT id, title, alt_text AS "altText", content_type AS "contentType", photo_data AS "photoData", is_hero AS "isHero", sort_order AS "sortOrder"
      FROM school_site_photos WHERE school_id = ? ORDER BY is_hero DESC, sort_order, created_at LIMIT 20`, school.id)
    const events = await db.all(`SELECT id, title, details, event_date AS "eventDate", location FROM school_site_events
      WHERE school_id = ? AND is_published = 1 AND event_date >= ? ORDER BY event_date LIMIT 8`, school.id, new Date().toISOString().slice(0, 10))
    const publicPhotos = photos.map(photo => ({ id: photo.id, title: photo.title, altText: photo.altText, isHero: Boolean(photo.isHero), sortOrder: photo.sortOrder, url: `data:${photo.contentType};base64,${Buffer.from(photo.photoData).toString('base64')}` }))
    return json(response, 200, { school: { ...school, hasLogo: Boolean(school.logoContentType) }, content, photos: publicPhotos, events })
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
      s.primary_color AS school_primary_color, s.logo_content_type AS school_logo_content_type,
      s.contact_email AS school_contact_email, s.contact_phone AS school_contact_phone, s.address AS school_address FROM users u JOIN schools s ON s.id = u.school_id
      WHERE LOWER(s.slug) = ? AND u.email = ? AND u.is_active = 1 AND u.deleted_at IS NULL AND s.is_active = 1 AND s.archived_at IS NULL`, slug, email)
    const matched = await verifyPassword(String(body.password || ''), user?.password_hash || '00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')
    if (!user || !matched) {
      attempts.count += 1
      if (attempts.count >= 5) { attempts.count = 0; attempts.until = Date.now() + 5 * 60_000 }
      loginAttempts.set(address, attempts)
      return json(response, 401, { error: 'No pudimos validar esos datos. Revisa el colegio, el correo y la contraseña.' })
    }
    if (user.role === 'estudiante' && !await db.get(`SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id
      JOIN student_enrollments se ON se.student_id = st.id AND se.school_id = st.school_id AND se.status = 'Activa'
      WHERE us.user_id = ? AND us.relationship = 'estudiante' AND st.school_id = ? AND st.status = 'Activo' LIMIT 1`, user.id, user.school_id)) {
      return json(response, 403, { error: 'El acceso de estudiante se habilita cuando Rectoría o Secretaría aprueba una matrícula activa.' })
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
    return user ? json(response, 200, { user: safeUser(user) }) : json(response, 200, { user: null }, { 'Set-Cookie': sessionCookie('', 0) })
  }
  if (method === 'GET' && url.pathname === '/api/legal/provider') {
    return json(response, 200, { provider: {
      name: process.env.EDUCA_PROVIDER_NAME?.trim() || '',
      nit: process.env.EDUCA_PROVIDER_NIT?.trim() || '',
      address: process.env.EDUCA_PROVIDER_ADDRESS?.trim() || '',
      email: process.env.EDUCA_PRIVACY_EMAIL?.trim() || '',
      phone: process.env.EDUCA_PRIVACY_PHONE?.trim() || '',
    } })
  }
  if (method === 'GET' && url.pathname === '/api/legal/terms-status') {
    const user = await getSession(request)
    if (!user) return json(response, 401, { error: 'Inicia sesión para continuar.' })
    const accepted = await db.get('SELECT 1 FROM legal_acceptances WHERE school_id = ? AND user_id = ? AND document_key = ? AND document_version = ?', user.school_id, user.id, 'terms', legalTermsVersion)
    return json(response, 200, { accepted: Boolean(accepted), version: legalTermsVersion })
  }
  if (method === 'POST' && url.pathname === '/api/legal/terms-acceptance') {
    const user = await getSession(request)
    if (!user) return json(response, 401, { error: 'Inicia sesión para continuar.' })
    const body = await readBody(request)
    if (body.version !== legalTermsVersion) return json(response, 409, { error: 'Los términos cambiaron. Recarga la página y vuelve a revisarlos.' })
    const acceptanceId = randomUUID()
    await db.transaction(async tx => {
      await tx.run('INSERT INTO legal_acceptances (id, school_id, user_id, document_key, document_version) VALUES (?, ?, ?, ?, ?) ON CONFLICT (school_id, user_id, document_key, document_version) DO NOTHING', acceptanceId, user.school_id, user.id, 'terms', legalTermsVersion)
      await tx.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', user.school_id, user.id, `terms_accepted:${legalTermsVersion}`)
    })
    return json(response, 200, { accepted: true, version: legalTermsVersion })
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
  const siteManagers = ['admin', 'rectoria']
  if (url.pathname === '/api/school-site' && method === 'GET') {
    if (!siteManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración y rectoría pueden editar el sitio institucional.' })
    const saved = await db.get('SELECT content_json AS content FROM school_public_sites WHERE school_id = ?', user.school_id)
    let content = {}
    try { content = JSON.parse(saved?.content || '{}') } catch { content = {} }
    const photos = await db.all(`SELECT id, title, alt_text AS "altText", content_type AS "contentType", photo_data AS "photoData", is_hero AS "isHero", sort_order AS "sortOrder"
      FROM school_site_photos WHERE school_id = ? ORDER BY is_hero DESC, sort_order, created_at LIMIT 20`, user.school_id)
    const events = await db.all(`SELECT id, title, details, event_date AS "eventDate", location, is_published AS "isPublished"
      FROM school_site_events WHERE school_id = ? ORDER BY event_date DESC LIMIT 100`, user.school_id)
    return json(response, 200, { content, photos: photos.map(photo => ({ id: photo.id, title: photo.title, altText: photo.altText, isHero: Boolean(photo.isHero), sortOrder: photo.sortOrder, url: `data:${photo.contentType};base64,${Buffer.from(photo.photoData).toString('base64')}` })), events: events.map(event => ({ ...event, isPublished: Boolean(event.isPublished) })) })
  }
  if (url.pathname === '/api/school-site' && method === 'PUT') {
    if (!siteManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración y rectoría pueden editar el sitio institucional.' })
    const body = await readBody(request), content = body.content || {}
    const allowedFonts = ['Inter', 'Manrope', 'Arial', 'Georgia', 'Trebuchet MS']
    const title = String(content.title || '').trim(), eyebrow = String(content.eyebrow || '').trim(), subtitle = String(content.subtitle || '').trim(), aboutTitle = String(content.aboutTitle || '').trim(), aboutText = String(content.aboutText || '').trim()
    const primaryColor = String(content.primaryColor || '').trim(), accentColor = String(content.accentColor || '').trim(), fontFamily = String(content.fontFamily || 'Manrope').trim()
    const validColor = value => /^#[0-9a-f]{6}$/i.test(value)
    if (title.length > 120 || eyebrow.length > 80 || subtitle.length > 300 || aboutTitle.length > 120 || aboutText.length > 2500 || !validColor(primaryColor) || !validColor(accentColor) || !allowedFonts.includes(fontFamily)) return json(response, 400, { error: 'Revisa los textos, colores y tipografía antes de guardar.' })
    const normalized = { title, eyebrow, subtitle, aboutTitle, aboutText, primaryColor, accentColor, fontFamily }
    await db.run(`INSERT INTO school_public_sites (school_id, content_json, updated_by) VALUES (?, ?, ?)
      ON CONFLICT(school_id) DO UPDATE SET content_json = excluded.content_json, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`, user.school_id, JSON.stringify(normalized), user.id)
    await logAudit(user.school_id, user.id, 'school_public_site_updated')
    return json(response, 200, { content: normalized })
  }
  if (url.pathname === '/api/school-site/photos' && method === 'POST') {
    if (!siteManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración y rectoría pueden gestionar fotos institucionales.' })
    const body = await readLargeJsonBody(request, 6 * 1024 * 1024)
    const mime = String(body.contentType || ''), encoded = String(body.data || '').replace(/^data:[^;]+;base64,/, ''), title = String(body.title || '').trim().slice(0, 100), altText = String(body.altText || title).trim().slice(0, 200)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !encoded || encoded.length > 5_600_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return json(response, 400, { error: 'Sube una foto JPG, PNG o WebP de máximo 4 MB.' })
    const data = Buffer.from(encoded, 'base64')
    if (!data.length || data.length > 4 * 1024 * 1024) return json(response, 413, { error: 'Cada foto puede pesar hasta 4 MB.' })
    const id = randomUUID(), isHero = body.isHero === true
    await db.transaction(async tx => {
      if (isHero) await tx.run('UPDATE school_site_photos SET is_hero = 0 WHERE school_id = ?', user.school_id)
      await tx.run(`INSERT INTO school_site_photos (id, school_id, title, alt_text, content_type, file_name, photo_data, is_hero, sort_order, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM school_site_photos WHERE school_id = ?), 0), ?)`, id, user.school_id, title, altText, mime, String(body.fileName || 'foto').slice(0, 160), data, isHero ? 1 : 0, user.school_id, user.id)
    })
    await logAudit(user.school_id, user.id, `school_site_photo_added:${id}`)
    return json(response, 201, { photo: { id, title, altText, isHero, url: `data:${mime};base64,${data.toString('base64')}` } })
  }
  const sitePhotoMatch = url.pathname.match(/^\/api\/school-site\/photos\/([0-9a-f-]{36})$/i)
  if (sitePhotoMatch && method === 'DELETE') {
    if (!siteManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración y rectoría pueden gestionar fotos institucionales.' })
    const deleted = await db.run('DELETE FROM school_site_photos WHERE id = ? AND school_id = ?', sitePhotoMatch[1], user.school_id)
    if (!(deleted.rowCount ?? deleted.changes ?? 0)) return json(response, 404, { error: 'No encontramos esa foto en este colegio.' })
    await logAudit(user.school_id, user.id, `school_site_photo_deleted:${sitePhotoMatch[1]}`)
    return json(response, 200, { deleted: true })
  }
  if (url.pathname === '/api/school-site/events' && method === 'POST') {
    if (!siteManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración y rectoría pueden gestionar eventos públicos.' })
    const body = await readBody(request), title = String(body.title || '').trim(), details = String(body.details || '').trim(), date = String(body.eventDate || ''), location = String(body.location || '').trim()
    if (title.length < 3 || title.length > 140 || details.length > 1800 || !validDate(date) || location.length > 160) return json(response, 400, { error: 'Completa el título y una fecha válida. La descripción admite hasta 1.800 caracteres.' })
    const id = randomUUID()
    await db.run('INSERT INTO school_site_events (id, school_id, title, details, event_date, location, is_published, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, title, details, date, location, body.isPublished === false ? 0 : 1, user.id)
    await logAudit(user.school_id, user.id, `school_site_event_created:${id}`)
    return json(response, 201, { event: { id, title, details, eventDate: date, location, isPublished: body.isPublished !== false } })
  }
  const siteEventMatch = url.pathname.match(/^\/api\/school-site\/events\/([0-9a-f-]{36})$/i)
  if (siteEventMatch && method === 'PUT') {
    if (!siteManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración y rectoría pueden gestionar eventos públicos.' })
    const body = await readBody(request), title = String(body.title || '').trim(), details = String(body.details || '').trim(), date = String(body.eventDate || ''), location = String(body.location || '').trim()
    if (title.length < 3 || title.length > 140 || details.length > 1800 || !validDate(date) || location.length > 160) return json(response, 400, { error: 'Completa el título y una fecha válida. La descripción admite hasta 1.800 caracteres.' })
    const updated = await db.run('UPDATE school_site_events SET title = ?, details = ?, event_date = ?, location = ?, is_published = ? WHERE id = ? AND school_id = ?', title, details, date, location, body.isPublished === false ? 0 : 1, siteEventMatch[1], user.school_id)
    if (!(updated.rowCount ?? updated.changes ?? 0)) return json(response, 404, { error: 'No encontramos ese evento en este colegio.' })
    await logAudit(user.school_id, user.id, `school_site_event_updated:${siteEventMatch[1]}`)
    return json(response, 200, { event: { id: siteEventMatch[1], title, details, eventDate: date, location, isPublished: body.isPublished !== false } })
  }
  if (siteEventMatch && method === 'DELETE') {
    if (!siteManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración y rectoría pueden gestionar eventos públicos.' })
    const deleted = await db.run('DELETE FROM school_site_events WHERE id = ? AND school_id = ?', siteEventMatch[1], user.school_id)
    if (!(deleted.rowCount ?? deleted.changes ?? 0)) return json(response, 404, { error: 'No encontramos ese evento en este colegio.' })
    await logAudit(user.school_id, user.id, `school_site_event_deleted:${siteEventMatch[1]}`)
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/password-reset-requests' && method === 'GET') {
    if (!passwordResetReviewRoles.has(user.role)) return json(response, 403, { error: 'Solo rectoría y administración pueden revisar estas solicitudes.' })
    const requests = await db.all(`SELECT r.id, r.email, r.full_name_snapshot AS "fullName", r.role_snapshot AS role, u.contact_phone AS phone,
      r.status, r.requested_at AS "requestedAt", r.reviewed_at AS "reviewedAt", r.review_note AS "reviewNote",
      r.token_expires_at AS "tokenExpiresAt", reviewer.full_name AS "reviewerName"
      FROM password_reset_requests r JOIN users u ON u.id = r.user_id LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE r.school_id = ? ORDER BY CASE r.status WHEN 'Pendiente' THEN 0 WHEN 'Aprobada' THEN 1 ELSE 2 END, r.requested_at DESC LIMIT 100`, user.school_id)
    for (const item of requests) item.phone = maskPhone(item.phone)
    return json(response, 200, { requests })
  }
  const passwordResetRequestMatch = url.pathname.match(/^\/api\/password-reset-requests\/([0-9a-f-]{36})$/i)
  if (passwordResetRequestMatch && method === 'PATCH') {
    if (!passwordResetReviewRoles.has(user.role)) return json(response, 403, { error: 'Solo rectoría y administración pueden aprobar solicitudes.' })
    const body = await readBody(request)
    const action = String(body.action || '')
    const note = String(body.note || '').trim().slice(0, 500)
    const requestRecord = await db.get('SELECT id, user_id AS "userId", email, full_name_snapshot AS "fullName", status FROM password_reset_requests WHERE id = ? AND school_id = ?', passwordResetRequestMatch[1], user.school_id)
    if (!requestRecord) return json(response, 404, { error: 'No encontramos la solicitud.' })
    if (action === 'reject') {
      if (requestRecord.status !== 'Pendiente') return json(response, 409, { error: 'Solo se pueden rechazar solicitudes pendientes.' })
      await db.run(`UPDATE password_reset_requests SET status = 'Rechazada', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ? AND school_id = ?`, user.id, note, requestRecord.id, user.school_id)
      await logAudit(user.school_id, user.id, 'password_reset_request_rejected')
      await sendInstitutionEmail(user.school_id, { to: requestRecord.email, subject: 'Actualización de tu solicitud de acceso', text: `Hola ${requestRecord.fullName},\nLa solicitud para restablecer tu contraseña no fue aprobada. Contacta a rectoría o administración de tu institución para confirmar tu identidad y recibir ayuda.` })
      return json(response, 200, { updated: true, status: 'Rechazada' })
    }
    if (action !== 'approve' && action !== 'renew') return json(response, 400, { error: 'Acción de solicitud no válida.' })
    if (action === 'approve' && requestRecord.status !== 'Pendiente' || action === 'renew' && requestRecord.status !== 'Aprobada') return json(response, 409, { error: 'El estado de la solicitud ya cambió.' })
    const target = await db.get(`SELECT u.id, u.email, u.full_name AS "fullName", u.contact_phone AS phone, s.slug AS "schoolSlug", s.name AS "schoolName"
      FROM users u JOIN schools s ON s.id = u.school_id
      WHERE u.id = ? AND u.school_id = ? AND u.is_active = 1 AND u.deleted_at IS NULL`, requestRecord.userId, user.school_id)
    if (!target) return json(response, 409, { error: 'La cuenta asociada ya no está activa. Rechaza esta solicitud.' })
    const resetCode = String(randomInt(10_000_000, 100_000_000))
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString()
    await db.run(`UPDATE password_reset_requests SET status = 'Aprobada', reset_token_hash = ?, token_expires_at = ?,
      reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ? AND school_id = ?`, hashToken(resetCode), expiresAt, user.id, note, requestRecord.id, user.school_id)
    await logAudit(user.school_id, user.id, action === 'renew' ? 'password_reset_link_renewed' : 'password_reset_request_approved')
    const resetPage = String(process.env.EDUCA_PUBLIC_URL || '').trim().replace(/\/+$/, '')
    const resetParams = new URLSearchParams({ school: target.schoolSlug, email: target.email, token: resetCode })
    const resetLink = resetPage ? `${resetPage}/#restablecer?${resetParams.toString()}` : ''
    await sendInstitutionEmail(user.school_id, { to: target.email, subject: 'Enlace para restablecer tu contraseña', text: `Hola ${target.fullName},\nRectoría o administración aprobó tu solicitud. Usa este enlace seguro para crear una nueva contraseña:\n${resetLink || 'Abre la opción Olvidé mi contraseña en EDUCA e ingresa el código recibido por SMS.'}\n\nEl código vence en 30 minutos y solo puede usarse una vez. Si no solicitaste este cambio, contacta al colegio. No compartas el enlace ni el código.` })
    const smsResult = await sendSms(target.phone, `${target.schoolName}: tu código EDUCA para restablecer la contraseña es ${resetCode}. Vence en 30 minutos y es de un solo uso. No lo compartas.`)
    if (!smsResult.sent) await logAudit(user.school_id, user.id, `password_reset_sms_not_sent:${smsResult.reason || 'unknown'}`)
    return json(response, 200, { updated: true, status: 'Aprobada', expiresAt, smsSent: smsResult.sent, smsConfigured: smsResult.configured, phoneHint: maskPhone(target.phone) })
  }

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
    const currentAccount = await db.get('SELECT email, password_hash AS "passwordHash" FROM users WHERE id = ? AND school_id = ? AND is_active = 1 AND deleted_at IS NULL', user.id, user.school_id)
    if (!currentAccount) return json(response, 404, { error: 'No encontramos tu cuenta activa.' })
    const email = String(body.email ?? currentAccount.email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(response, 400, { error: 'Escribe un correo electrónico válido.' })
    const emailChanged = email !== currentAccount.email.toLowerCase()
    if (emailChanged) {
      const currentPassword = String(body.currentPassword || '')
      if (!currentPassword || currentPassword.length > 128 || !await verifyPassword(currentPassword, currentAccount.passwordHash)) return json(response, 400, { error: 'Confirma el cambio con tu contraseña actual.' })
      const duplicate = await db.get('SELECT id FROM users WHERE school_id = ? AND email = ? AND id <> ?', user.school_id, email, user.id)
      if (duplicate) return json(response, 409, { error: 'Ese correo ya está asociado a otra cuenta de esta institución.' })
    }
    const phone = String(body.phone || '').trim()
    const photo = body.photo ? parseStudentPhoto(body.photo) : null
    if (phone.length > 25 || phone && !/^[+\d\s().-]{5,25}$/.test(phone)) return json(response, 400, { error: 'Revisa el teléfono de contacto.' })
    if (body.photo && !photo) return json(response, 400, { error: 'La foto debe ser JPG, PNG o WEBP válida y no superar 2 MB.' })
    if (body.removePhoto !== true && !photo && !Object.hasOwn(body, 'phone') && !emailChanged) return json(response, 400, { error: 'No hay cambios para guardar.' })
    try {
      if (user.role === 'estudiante' && (photo || body.removePhoto === true)) {
        const linked = await db.all(`SELECT st.id FROM user_students us JOIN students st ON st.id = us.student_id
          WHERE us.user_id = ? AND st.school_id = ? AND us.relationship = 'estudiante' ORDER BY st.full_name LIMIT 2`, user.id, user.school_id)
        if (linked.length !== 1) return json(response, 409, { error: 'La cuenta de estudiante no tiene un único registro vinculado. Contacta a secretaría.' })
        await db.run('UPDATE users SET email = ?, contact_phone = ? WHERE id = ? AND school_id = ?', email, phone, user.id, user.school_id)
        if (photo) await db.run('UPDATE students SET photo_content_type = ?, photo_file_name = ?, photo_data = ? WHERE id = ? AND school_id = ?', photo.contentType, photo.fileName, photo.data, linked[0].id, user.school_id)
        else await db.run('UPDATE students SET photo_content_type = NULL, photo_file_name = NULL, photo_data = NULL WHERE id = ? AND school_id = ?', linked[0].id, user.school_id)
      } else {
        if (photo) await db.run('UPDATE users SET email = ?, contact_phone = ?, profile_photo_content_type = ?, profile_photo_file_name = ?, profile_photo_data = ? WHERE id = ? AND school_id = ?', email, phone, photo.contentType, photo.fileName, photo.data, user.id, user.school_id)
        else if (body.removePhoto === true) await db.run('UPDATE users SET email = ?, contact_phone = ?, profile_photo_content_type = NULL, profile_photo_file_name = NULL, profile_photo_data = NULL WHERE id = ? AND school_id = ?', email, phone, user.id, user.school_id)
        else await db.run('UPDATE users SET email = ?, contact_phone = ? WHERE id = ? AND school_id = ?', email, phone, user.id, user.school_id)
      }
    } catch (error) {
      if (/unique|duplicate/i.test(String(error.message))) return json(response, 409, { error: 'Ese correo ya está asociado a otra cuenta de esta institución.' })
      throw error
    }
    await logAudit(user.school_id, user.id, 'profile_updated')
    if (emailChanged) await logAudit(user.school_id, user.id, 'email_changed')
    const account = await db.get('SELECT full_name AS name, email, role, contact_phone AS phone FROM users WHERE id = ? AND school_id = ?', user.id, user.school_id)
    const currentPhoto = user.role === 'estudiante'
      ? await db.get(`SELECT st.photo_data AS photo FROM user_students us JOIN students st ON st.id = us.student_id WHERE us.user_id = ? AND st.school_id = ? AND us.relationship = 'estudiante' LIMIT 1`, user.id, user.school_id)
      : await db.get('SELECT profile_photo_data AS photo FROM users WHERE id = ? AND school_id = ?', user.id, user.school_id)
    return json(response, 200, { profile: { ...account, hasPhoto: Boolean(currentPhoto?.photo) } })
  }

  if (url.pathname === '/api/audit-log' && method === 'GET') {
    if (!['admin', 'rectoria'].includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden consultar la bitácora del colegio.' })
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

  if (url.pathname === '/api/document-control' && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría y secretaría pueden consultar el control documental.' })
    const type = String(url.searchParams.get('type') || '').trim().toUpperCase()
    const year = String(url.searchParams.get('year') || '').trim()
    if (year && !academicYearStart(year)) return json(response, 400, { error: 'Escribe el año lectivo con cuatro dígitos, por ejemplo 2026.' })
    const search = `%${String(url.searchParams.get('search') || '').trim().slice(0, 100)}%`
    const clauses = ['d.school_id = ?'], params = [user.school_id]
    if (['CERT', 'BOL', 'MAT', 'SOLMAT', 'PERS'].includes(type)) { clauses.push('d.document_type = ?'); params.push(type) }
    clauses.push(`(d.document_type <> 'BOL' OR EXISTS (
      SELECT 1 FROM grade_period_publications pub
      WHERE pub.school_id = d.school_id AND pub.academic_year = d.academic_year
        AND pub.period = d.period AND pub.is_published = 1
    ) OR (d.status = 'Retirado' AND EXISTS (
      SELECT 1 FROM grade_period_publications pub
      WHERE pub.school_id = d.school_id AND pub.academic_year = d.academic_year
        AND pub.period = d.period AND pub.is_published = 0
    )))`)
    if (year && academicYearStart(year)) { clauses.push("LEFT(d.academic_year, 4) = ?"); params.push(academicYearStart(year)) }
    if (search !== '%%') { clauses.push('(d.document_number LIKE ? OR d.student_name LIKE ? OR d.status LIKE ?)'); params.push(search, search, search) }
    const where = clauses.join(' AND ')
    const total = Number((await db.get(`SELECT COUNT(*) AS count FROM document_control_registry d WHERE ${where}`, ...params)).count)
    const limit = Math.min(250, Math.max(1, Number(url.searchParams.get('limit')) || 100))
    const offset = Math.min(100_000, Math.max(0, Number(url.searchParams.get('offset')) || 0))
    const selectRecords = `SELECT d.id, d.reference_id AS "referenceId", d.student_id AS "studentId", d.document_type AS "documentType", d.document_number AS "documentNumber", d.student_name AS "studentName",
      d.academic_year AS "academicYear", d.period, d.status, d.created_at AS "createdAt", COALESCE(u.full_name, 'Cuenta eliminada') AS "createdByName"
      FROM document_control_registry d LEFT JOIN users u ON u.id = d.created_by AND u.school_id = d.school_id
      WHERE ${where} ORDER BY d.created_at DESC, d.document_number DESC`
    if (url.searchParams.get('export') === 'csv') {
      const records = await db.all(`${selectRecords} LIMIT 20000`, ...params)
      const cell = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"` }
      const headers = ['Número de control', 'Tipo', 'Estudiante', 'Año lectivo', 'Periodo', 'Estado', 'Fecha y hora', 'Registrado por']
      const csv = [headers.map(cell).join(','), ...records.map(record => [record.documentNumber, record.documentType, record.studentName, academicYearStart(record.academicYear), record.period, record.status, record.createdAt, record.createdByName].map(cell).join(','))].join('\r\n')
      response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="educa-control-documental.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
      response.end(`\uFEFF${csv}`)
      return
    }
    const records = await db.all(`${selectRecords} LIMIT ? OFFSET ?`, ...params, limit, offset)
    return json(response, 200, { records, total, limit, offset })
  }
  const documentSourceMatch = url.pathname.match(/^\/api\/document-control\/([0-9a-f-]{36})\/source$/i)
  if (documentSourceMatch && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría y secretaría pueden consultar el archivo documental.' })
    const record = await db.get(`SELECT d.id, d.school_id AS "schoolId", d.document_type AS "documentType", d.document_number AS "documentNumber", d.reference_id AS "referenceId", d.student_id AS "studentId", d.student_name AS "studentName", d.academic_year AS "academicYear", d.period, d.status, d.created_at AS "createdAt", COALESCE(u.full_name, 'Cuenta eliminada') AS "createdByName", s.name AS "schoolName"
      FROM document_control_registry d JOIN schools s ON s.id = d.school_id LEFT JOIN users u ON u.id = d.created_by AND u.school_id = d.school_id WHERE d.id = ? AND d.school_id = ?`, documentSourceMatch[1], user.school_id)
    if (!record) return json(response, 404, { error: 'No encontramos ese folio en el archivo de esta institución.' })
    const sourceId = record.referenceId
    let source = null
    if (sourceId && record.documentType === 'SOLMAT') source = await db.get(`SELECT e.id, e.document_number AS "requestNumber", e.student_name AS "studentName", e.document, e.grade_requested AS grade, e.academic_year AS "academicYear", e.guardian_name AS "guardianName", e.guardian_phone AS "guardianPhone", e.guardian_email AS "guardianEmail", e.pending_documents AS "pendingDocuments", e.notes, e.status, e.created_at AS "createdAt", e.updated_at AS "updatedAt", COALESCE(u.full_name, 'Cuenta eliminada') AS "createdByName"
      FROM enrollment_requests e LEFT JOIN users u ON u.id = e.created_by AND u.school_id = e.school_id WHERE e.id = ? AND e.school_id = ?`, sourceId, user.school_id)
    if (sourceId && record.documentType === 'MAT') source = await db.get(`SELECT e.id, e.document_number AS "enrollmentNumber", st.full_name AS "studentName", st.document_type AS "studentDocumentType", st.document AS "studentDocument", st.document_issued_place AS "documentIssuedPlace", c.grade, c.name AS "courseName", e.academic_year AS "academicYear", e.status, e.start_date AS "startDate", e.end_date AS "endDate", e.notes, e.created_at AS "createdAt", COALESCE(u.full_name, 'Cuenta eliminada') AS "createdByName"
      FROM student_enrollments e JOIN students st ON st.id = e.student_id AND st.school_id = e.school_id LEFT JOIN courses c ON c.id = e.course_id AND c.school_id = e.school_id LEFT JOIN users u ON u.id = e.created_by AND u.school_id = e.school_id WHERE e.id = ? AND e.school_id = ?`, sourceId, user.school_id)
    if (sourceId && record.documentType === 'PERS') source = await db.get(`SELECT c.id, c.document_number AS "documentNumber", c.certificate_type AS "certificateType", c.academic_year AS "academicYear", c.status, c.issuer_name AS "issuerName", c.issuer_title AS "issuerTitle", c.created_at AS "createdAt", p.full_name AS "staffName", p.national_id AS "staffDocument", p.position_title AS "positionTitle", p.department, p.email, p.phone
      FROM staff_certifications c JOIN institutional_staff p ON p.id = c.staff_id AND p.school_id = c.school_id WHERE c.id = ? AND c.school_id = ?`, sourceId, user.school_id)
    if (sourceId && record.documentType === 'CERT') source = await db.get(`SELECT c.id, c.certificate_number AS "certificateNumber", c.certificate_type AS "certificateType", c.document_number AS "documentNumber", c.student_name AS "studentName", c.student_document_type AS "studentDocumentType", c.student_document_number AS "studentDocumentNumber", c.student_document_issued_place AS "documentIssuedPlace", c.grade_snapshot AS grade, c.course_name_snapshot AS "courseName", c.academic_year AS "academicYear", c.academic_status_snapshot AS "academicStatus", c.requester_name AS "requesterName", c.requester_role AS "requesterRole", c.rector_name AS "rectorName", c.signed_at AS "signedAt", c.status, c.created_at AS "createdAt", c.annul_note AS "annulNote"
      FROM school_certificates c WHERE c.id = ? AND c.school_id = ?`, sourceId, user.school_id)
    if (sourceId && record.documentType === 'BOL') source = await db.get(`SELECT r.token, r.student_id AS "studentId", st.full_name AS "studentName", st.document_type AS "studentDocumentType", st.document AS "studentDocument", st.document_issued_place AS "documentIssuedPlace", r.academic_year AS "academicYear", r.period, r.document_number AS "documentNumber", r.signature_snapshot AS "signatureSnapshot", r.created_at AS "createdAt", COALESCE(p.is_published, 0) AS "isPublished", c.grade, c.name AS "courseName"
      FROM report_card_verifications r JOIN students st ON st.id = r.student_id AND st.school_id = r.school_id LEFT JOIN student_enrollments se ON se.school_id = r.school_id AND se.student_id = r.student_id AND se.academic_year = r.academic_year AND se.status = 'Activa' LEFT JOIN courses c ON c.id = se.course_id AND c.school_id = r.school_id LEFT JOIN grade_period_publications p ON p.school_id = r.school_id AND p.academic_year = r.academic_year AND p.period = r.period WHERE r.token = ? AND r.school_id = ?`, sourceId, user.school_id)
    if (record.documentType === 'BOL' && !source?.isPublished) return json(response, 404, { error: 'El boletín todavía no ha sido publicado y no forma parte del archivo documental.' })
    if (sourceId && record.documentType === 'CERT' && !source) source = await db.get(`SELECT id, student_name AS "studentName", certificate_type AS "certificateType", grade_snapshot AS grade, course_name_snapshot AS "courseName", academic_year AS "academicYear", status, created_at AS "createdAt" FROM school_certificate_requests WHERE id = ? AND school_id = ?`, sourceId, user.school_id)
    if (!source) return json(response, 404, { error: 'El registro fuente de este folio ya no está disponible. El número de control se conserva para trazabilidad.' })
    let reportSignatures = []
    if (record.documentType === 'BOL') {
      try { reportSignatures = JSON.parse(source.signatureSnapshot || '[]') } catch { reportSignatures = [] }
      if (!Array.isArray(reportSignatures)) reportSignatures = []
    }
    const fieldsByType = {
      SOLMAT: [['Estudiante', source.studentName], ['Documento de identidad', source.document], ['Grado solicitado', source.grade], ['Año lectivo', source.academicYear], ['Acudiente', source.guardianName], ['Teléfono del acudiente', source.guardianPhone], ['Correo del acudiente', source.guardianEmail], ['Documentos pendientes', source.pendingDocuments], ['Observaciones', source.notes], ['Estado de solicitud', source.status], ['Registrado por', source.createdByName], ['Fecha de registro', source.createdAt], ['Última actualización', source.updatedAt]],
      MAT: [['Estudiante', source.studentName], ['Identificación', [source.studentDocumentType, source.studentDocument, source.documentIssuedPlace].filter(Boolean).join(' · ')], ['Grado', source.grade], ['Curso', source.courseName], ['Año lectivo', source.academicYear], ['Estado de matrícula', source.status], ['Fecha efectiva', source.startDate], ['Fecha de retiro/traslado', source.endDate], ['Observaciones', source.notes], ['Registrado por', source.createdByName], ['Fecha de registro', source.createdAt]],
      PERS: [['Funcionario', source.staffName], ['Identificación', source.staffDocument], ['Cargo', source.positionTitle], ['Dependencia', source.department], ['Correo institucional', source.email], ['Teléfono', source.phone], ['Tipo de constancia', source.certificateType], ['Año lectivo', source.academicYear], ['Expedida por', `${source.issuerName || ''}${source.issuerTitle ? ` · ${source.issuerTitle}` : ''}`], ['Estado', source.status], ['Fecha de expedición', source.createdAt]],
      CERT: [['Estudiante', source.studentName], ['Tipo de documento', source.certificateType], ['Identificación', [source.studentDocumentType, source.studentDocumentNumber, source.documentIssuedPlace].filter(Boolean).join(' · ')], ['Grado', source.grade], ['Curso', source.courseName], ['Año lectivo', source.academicYear], ['Estado académico', source.academicStatus], ['Solicitó', `${source.requesterName || ''}${source.requesterRole ? ` · ${source.requesterRole}` : ''}`], ['Rectoría / firmante', source.rectorName], ['Fecha de firma', source.signedAt], ['Estado del documento', source.status], ['Nota de anulación', source.annulNote], ['Fecha de emisión/registro', source.createdAt]],
      BOL: [['Estudiante', source.studentName], ['Identificación', [source.studentDocumentType, source.studentDocument, source.documentIssuedPlace].filter(Boolean).join(' · ')], ['Grado', source.grade], ['Curso', source.courseName], ['Año lectivo', source.academicYear], ['Periodo', source.period], ['Estado de publicación', Number(source.isPublished) ? 'Publicado' : 'Vista previa'], ['Firmas guardadas', reportSignatures.map(item => [item.name, item.title].filter(Boolean).join(' · ')).join('; ')], ['Fecha de generación', source.createdAt]],
    }
    const fields = (fieldsByType[record.documentType] || []).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '').map(([label, value]) => ({ label, value: String(value) }))
    const title = ({ SOLMAT: 'Solicitud de matrícula', MAT: 'Registro de matrícula', CERT: 'Certificado o constancia', BOL: 'Boletín académico', PERS: 'Constancia de personal' })[record.documentType] || 'Documento institucional'
    const sourceDocument = { ...record, fields, title }
    if (url.searchParams.get('download') === 'html') {
      const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
      const filename = `EDUCA-${record.documentType}-${record.documentNumber || 'documento'}.html`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      const rows = fields.map(field => `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(field.value)}</td></tr>`).join('')
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · ${escapeHtml(record.documentNumber)}</title><style>body{font:15px/1.55 Arial,sans-serif;color:#19364d;margin:40px auto;max-width:900px;padding:0 28px}header{border-bottom:3px solid #286b83;padding-bottom:18px;margin-bottom:24px}header small{letter-spacing:.12em;color:#397f83;font-weight:bold}h1{font-size:25px;margin:8px 0}p{color:#526b7e}.folio{font-weight:bold;color:#1c567a}table{width:100%;border-collapse:collapse;margin:26px 0}th,td{text-align:left;vertical-align:top;padding:11px 12px;border:1px solid #d6e1e8}th{width:30%;background:#f1f6f8}footer{border-top:1px solid #d6e1e8;padding-top:16px;font-size:12px;color:#526b7e}@media print{body{margin:15mm auto;padding:0}button{display:none}}</style></head><body><header><small>ARCHIVO DOCUMENTAL · ${escapeHtml(record.schoolName)}</small><h1>${escapeHtml(title)}</h1><p class="folio">Número de control: ${escapeHtml(record.documentNumber)}</p></header><p>Estado: <strong>${escapeHtml(record.status)}</strong> · Año lectivo: <strong>${escapeHtml(record.academicYear)}</strong>${record.period ? ` · Periodo: <strong>${escapeHtml(record.period)}</strong>` : ''}</p><table><tbody>${rows}</tbody></table><footer>Copia de archivo generada desde EDUCA el ${escapeHtml(new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }))}. Folio institucional: ${escapeHtml(record.documentNumber)}.</footer></body></html>`
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" })
      response.end(html)
      return
    }
    return json(response, 200, { sourceDocument })
  }
  const documentControlMatch = url.pathname.match(/^\/api\/document-control\/([0-9a-f-]{36})$/i)
  if (documentControlMatch && method === 'DELETE') {
    if (!['admin', 'rectoria'].includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden borrar registros anulados del control documental.' })
    const record = await db.get('SELECT document_number AS "documentNumber", document_type AS "documentType", status, reference_id AS "referenceId", academic_year AS "academicYear", period FROM document_control_registry WHERE id = ? AND school_id = ?', documentControlMatch[1], user.school_id)
    if (!record) return json(response, 404, { error: 'No encontramos ese registro documental en este colegio.' })
    if (record.documentType === 'PERS') return json(response, 403, { error: 'Las constancias de personal solo se eliminan definitivamente desde Personal institucional, firmas y constancias, con una cuenta de administrador.' })
    if (record.documentType === 'BOL') {
      if (record.status !== 'Retirado') return json(response, 409, { error: 'Primero retira del portal los boletines del periodo. Solo se puede eliminar un boletín retirado.' })
      const deleted = await db.transaction(async tx => {
        const publication = await tx.get('SELECT is_published AS "isPublished" FROM grade_period_publications WHERE school_id = ? AND academic_year = ? AND period = ?', user.school_id, record.academicYear, record.period)
        if (publication?.isPublished) return false
        const result = await tx.run("DELETE FROM document_control_registry WHERE id = ? AND school_id = ? AND document_type = 'BOL' AND status = 'Retirado'", documentControlMatch[1], user.school_id)
        if (!result.changes && !result.rowCount) return false
        await tx.run('DELETE FROM report_card_verifications WHERE token = ? AND school_id = ?', record.referenceId, user.school_id)
        return true
      })
      if (!deleted) return json(response, 409, { error: 'El periodo volvió a publicarse o el boletín cambió. Actualiza el listado e inténtalo de nuevo.' })
      try { await logAudit(user.school_id, user.id, `report_card_deleted:${record.documentNumber}`) }
      catch (error) { console.error('EDUCA report-card deletion audit failed:', error.code || error.message || 'audit_error') }
      return json(response, 200, { deleted: true, documentNumber: record.documentNumber, academicYear: record.academicYear, period: record.period })
    }
    if (record.status !== 'Anulada') return json(response, 409, { error: 'Solo se pueden borrar registros cuyo documento ya esté anulado.' })
    const deleted = await db.run("DELETE FROM document_control_registry WHERE id = ? AND school_id = ? AND status = 'Anulada'", documentControlMatch[1], user.school_id)
    if (!deleted.changes && !deleted.rowCount) return json(response, 409, { error: 'El registro cambió de estado y no se pudo borrar.' })
    await logAudit(user.school_id, user.id, `document_control_deleted:${record.documentNumber}`)
    return json(response, 200, { deleted: true, documentNumber: record.documentNumber })
  }

  if (url.pathname === '/api/audit-log/export' && method === 'GET') {
    if (!['admin', 'rectoria'].includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden exportar la bitácora del colegio.' })
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
    if (!['admin', 'rectoria'].includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden consultar este panel.' })
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
    const rows = await db.all(`SELECT id, title, body, category, event_id AS "eventId", target_module AS "targetModule", target_id AS "targetId", created_at AS "createdAt", read_at AS "readAt"
      FROM user_notifications WHERE school_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50`, user.school_id, user.id)
    return json(response, 200, { notifications: rows, unread: rows.filter(row => !row.readAt).length })
  }
  if (url.pathname === '/api/push/register' && method === 'POST') {
    const body = await readBody(request), token = String(body.token || '').trim(), platform = String(body.platform || 'android')
    if (token.length < 100 || token.length > 4096 || !['android', 'ios'].includes(platform)) return json(response, 400, { error: 'El token o la plataforma del dispositivo no son válidos.' })
    await db.run(`INSERT INTO device_push_tokens (token, school_id, user_id, platform) VALUES (?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET school_id = excluded.school_id, user_id = excluded.user_id, platform = excluded.platform, is_active = 1, updated_at = CURRENT_TIMESTAMP`, token, user.school_id, user.id, platform)
    return json(response, 200, { registered: true })
  }
  if (url.pathname === '/api/push/unregister' && method === 'POST') {
    const body = await readBody(request), token = String(body.token || '').trim()
    if (token.length < 100 || token.length > 4096) return json(response, 400, { error: 'El token del dispositivo no es válido.' })
    await db.run('UPDATE device_push_tokens SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE token = ? AND school_id = ? AND user_id = ?', token, user.school_id, user.id)
    return json(response, 200, { unregistered: true })
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

  if (url.pathname === '/api/surveys' && method === 'GET') {
    const canManage = ['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'].includes(user.role)
    let sql = `SELECT s.id, s.title, s.description, s.options_json AS "optionsJson", s.closes_at AS "closesAt",
      s.course_id AS "courseId", c.name AS "courseName", c.grade, s.created_by AS "createdBy", s.created_at AS "createdAt",
      creator.full_name AS "creatorName", s.is_published AS "isPublished"
      FROM school_surveys s LEFT JOIN courses c ON c.id = s.course_id JOIN users creator ON creator.id = s.created_by
      WHERE s.school_id = ? AND (s.is_published = 1 OR s.created_by = ?)`
    const params = [user.school_id, user.id]
    if (user.role === 'docente') { sql += ` AND (s.course_id IS NULL OR EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = s.course_id AND ct.user_id = ?))`; params.push(user.id) }
    if (['estudiante', 'acudiente'].includes(user.role)) {
      sql += ` AND (s.course_id IS NULL OR EXISTS (SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id
        WHERE us.user_id = ? AND st.school_id = s.school_id AND st.status = 'Activo' AND (
          EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.course_id = s.course_id AND se.status = 'Activa')
          OR (st.grade = c.grade AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')))))`
      params.push(user.id)
    }
    sql += ' ORDER BY s.created_at DESC LIMIT 200'
    const rows = await db.all(sql, ...params)
    const surveys = await Promise.all(rows.map(async row => {
      let options = []
      try { options = JSON.parse(row.optionsJson) } catch {}
      const vote = await db.get('SELECT option_index AS "optionIndex" FROM survey_votes WHERE survey_id = ? AND user_id = ?', row.id, user.id)
      const isAuthor = row.createdBy === user.id
      const showResults = Boolean(vote || isAuthor || ['admin', 'rectoria', 'coordinacion', 'secretaria'].includes(user.role))
      const counts = showResults ? await db.all('SELECT option_index AS "optionIndex", COUNT(*) AS count FROM survey_votes WHERE school_id = ? AND survey_id = ? GROUP BY option_index', user.school_id, row.id) : []
      const closeTime = row.closesAt ? new Date(row.closesAt).getTime() : null
      return { ...row, options: Array.isArray(options) ? options : [], myVote: vote?.optionIndex ?? null, totalVotes: showResults ? counts.reduce((sum, item) => sum + Number(item.count), 0) : null, results: showResults ? counts : null, isAuthor, isPublished: Boolean(row.isPublished), isClosed: Boolean(closeTime && closeTime <= Date.now()) }
    }))
    return json(response, 200, { surveys })
  }
  if (url.pathname === '/api/surveys' && method === 'POST') {
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear encuestas.' })
    const body = await readBody(request)
    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim()
    const courseId = String(body.courseId || '').trim()
    const options = Array.isArray(body.options) ? body.options.map(item => String(item || '').trim()).filter(Boolean) : []
    const closesAtInput = body.closesAt ? String(body.closesAt) : ''
    const closesAtDate = closesAtInput ? new Date(closesAtInput) : null
    const closesAt = closesAtDate && Number.isFinite(closesAtDate.getTime()) ? closesAtDate.toISOString() : null
    if (title.length < 3 || title.length > 160 || description.length > 2000 || options.length < 2 || options.length > 10 || options.some(option => option.length > 120) || new Set(options.map(option => option.toLocaleLowerCase())).size !== options.length || (closesAtInput && !closesAt)) return json(response, 400, { error: 'Revisa el título, opciones (2 a 10), descripción y fecha de cierre.' })
    let course = null
    if (courseId) {
      course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
      if (!course) return json(response, 404, { error: 'Selecciona un curso activo de esta institución.' })
      if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', course.id, user.id)) return json(response, 403, { error: 'Ese curso no está asignado a tu cuenta.' })
    } else if (user.role === 'docente') return json(response, 403, { error: 'El docente debe asociar la encuesta a uno de sus cursos.' })
    const id = randomUUID()
    let recipients = []
    if (course) {
      const rows = await db.all(`SELECT DISTINCT recipient_id AS id FROM (
        SELECT ct.user_id AS recipient_id FROM course_teachers ct WHERE ct.course_id = ?
        UNION SELECT us.user_id FROM user_students us JOIN students st ON st.id = us.student_id
          WHERE us.relationship IN ('acudiente','estudiante') AND st.school_id = ? AND st.status = 'Activo'
          AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.course_id = ? AND se.academic_year = (SELECT academic_year FROM courses WHERE id = ?) AND se.status = 'Activa')
            OR (st.grade = (SELECT grade FROM courses WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')))
      ) audience`, course.id, user.school_id, course.id, course.id, course.id)
      recipients = rows.map(row => row.id).filter(id => id !== user.id)
    } else recipients = (await db.all('SELECT id FROM users WHERE school_id = ? AND is_active = 1 AND deleted_at IS NULL AND id <> ?', user.school_id, user.id)).map(row => row.id)
    await db.transaction(async tx => {
      await tx.run('INSERT INTO school_surveys (id, school_id, course_id, title, description, options_json, closes_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, course?.id || null, title, description, JSON.stringify(options), closesAt, user.id)
      for (const recipient of recipients) await tx.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module, target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, recipient, `Nueva encuesta: ${title}`, course ? `Encuesta para ${course.grade} · ${course.name}` : 'Encuesta para toda la institución', 'survey', 'Encuestas y votaciones', id)
    })
    await sendPushNotifications(user.school_id, recipients, `Nueva encuesta: ${title}`, course ? `Encuesta para ${course.grade} · ${course.name}` : 'Encuesta para toda la institución', 'survey', id, id)
    await sendEmailToUsers(user.school_id, recipients, `EDUCA: nueva encuesta · ${title}`, `Se publicó una encuesta en EDUCA.\n\n${title}\n${course ? `Curso: ${course.grade} · ${course.name}` : 'Destinatarios: toda la institución'}\n\nIngresa a EDUCA para participar.`)
    await logAudit(user.school_id, user.id, 'survey_created')
    return json(response, 201, { id, notified: recipients.length })
  }
  const surveyVoteMatch = url.pathname.match(/^\/api\/surveys\/([0-9a-f-]{36})\/vote$/i)
  if (surveyVoteMatch && method === 'POST') {
    const body = await readBody(request)
    if (body.optionIndex === undefined || body.optionIndex === null || String(body.optionIndex).trim() === '') return json(response, 400, { error: 'Selecciona una opción válida.' })
    const optionIndex = Number(body.optionIndex)
    if (!Number.isInteger(optionIndex) || optionIndex < 0) return json(response, 400, { error: 'Selecciona una opción válida.' })
    const survey = await db.get('SELECT id, course_id AS "courseId", options_json AS "optionsJson", closes_at AS "closesAt", is_published AS "isPublished" FROM school_surveys WHERE id = ? AND school_id = ?', surveyVoteMatch[1], user.school_id)
    if (!survey || !survey.isPublished) return json(response, 404, { error: 'La encuesta no está disponible.' })
    let options = []
    try { options = JSON.parse(survey.optionsJson) } catch {}
    if (optionIndex >= options.length) return json(response, 400, { error: 'La opción seleccionada no es válida.' })
    if (survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now()) return json(response, 409, { error: 'El plazo para responder esta encuesta terminó.' })
    if (survey.courseId) {
      let hasAccess = false
      if (user.role === 'docente') hasAccess = Boolean(await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', survey.courseId, user.id))
      else if (['estudiante', 'acudiente'].includes(user.role)) hasAccess = Boolean(await db.get(`SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id JOIN courses c ON c.id = ? AND c.school_id = st.school_id
        WHERE us.user_id = ? AND st.school_id = ? AND st.status = 'Activo' AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.course_id = c.id AND se.status = 'Activa') OR (st.grade = c.grade AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')))`, survey.courseId, user.id, user.school_id))
      else hasAccess = Boolean(await db.get('SELECT 1 FROM courses WHERE id = ? AND school_id = ?', survey.courseId, user.school_id))
      if (!hasAccess) return json(response, 403, { error: 'Esta encuesta no corresponde a tus cursos asignados.' })
    }
    try { await db.run('INSERT INTO survey_votes (survey_id, school_id, user_id, option_index) VALUES (?, ?, ?, ?)', survey.id, user.school_id, user.id, optionIndex) }
    catch (error) {
      const existingVote = await db.get('SELECT 1 FROM survey_votes WHERE survey_id = ? AND user_id = ?', survey.id, user.id)
      if (existingVote) return json(response, 409, { error: 'Ya enviaste tu respuesta. Cada cuenta puede responder una sola vez.' })
      throw error
    }
    await logAudit(user.school_id, user.id, 'survey_vote_submitted')
    return json(response, 201, { submitted: true })
  }
  const surveyDeleteMatch = url.pathname.match(/^\/api\/surveys\/([0-9a-f-]{36})$/i)
  if (surveyDeleteMatch && method === 'DELETE') {
    const survey = await db.get('SELECT id, created_by AS "createdBy" FROM school_surveys WHERE id = ? AND school_id = ?', surveyDeleteMatch[1], user.school_id)
    if (!survey) return json(response, 404, { error: 'No encontramos la encuesta.' })
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria'].includes(user.role) && survey.createdBy !== user.id) return json(response, 403, { error: 'Solo quien creó la encuesta o rectoría puede eliminarla.' })
    await db.run('DELETE FROM school_surveys WHERE id = ? AND school_id = ?', survey.id, user.school_id)
    await logAudit(user.school_id, user.id, 'survey_deleted')
    return json(response, 200, { deleted: true })
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
  const eventAttendanceMatch = url.pathname.match(/^\/api\/calendar\/([0-9a-f-]{36})\/attendance$/i)
  if (eventAttendanceMatch && ['GET', 'POST'].includes(method)) {
    const allowed = ['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'].includes(user.role)
    if (!allowed) return json(response, 403, { error: 'No tienes permiso para registrar asistencia a eventos.' })
    const event = await db.get('SELECT id, event_type AS "eventType", course_id AS "courseId", title FROM school_events WHERE id = ? AND school_id = ?', eventAttendanceMatch[1], user.school_id)
    if (!event) return json(response, 404, { error: 'No encontramos ese evento.' })
    if (user.role === 'docente' && (!event.courseId || !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', event.courseId, user.id))) return json(response, 403, { error: 'Solo puedes controlar eventos de tus cursos asignados.' })
    if (method === 'GET') {
      const records = await db.all(`SELECT r.id, r.record_type AS "recordType", r.recorded_at AS "recordedAt", st.id AS "studentId", st.full_name AS "studentName", st.grade, st.document, recorder.full_name AS "recordedBy"
        FROM event_attendance_records r JOIN students st ON st.id = r.student_id JOIN users recorder ON recorder.id = r.recorded_by
        WHERE r.school_id = ? AND r.event_id = ? ORDER BY r.recorded_at DESC LIMIT 1000`, user.school_id, event.id)
      return json(response, 200, { records, counts: { ingress: records.filter(item => item.recordType === 'Ingreso').length, exit: records.filter(item => item.recordType === 'Salida').length, pae: records.filter(item => item.recordType === 'PAE').length } })
    }
    const body = await readBody(request)
    const rawCardCode = String(body.cardCode || '').trim()
    const cardCode = rawCardCode.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0] || rawCardCode
    const recordType = String(body.recordType || '')
    const validType = ['Ingreso', 'Salida', 'PAE'].includes(recordType) && (event.eventType === 'PAE' ? recordType === 'PAE' : recordType !== 'PAE')
    if (!cardCode || cardCode.length > 200 || !validType) return json(response, 400, { error: event.eventType === 'PAE' ? 'Para este evento PAE debes registrar el consumo.' : 'Ingresa el código del carné y selecciona ingreso o salida.' })
    const student = await db.get("SELECT id, full_name AS \"fullName\", grade FROM students WHERE school_id = ? AND card_code = ? AND status = 'Activo'", user.school_id, cardCode)
    if (!student) return json(response, 404, { error: 'El código no corresponde a un estudiante activo de esta institución.' })
    if (event.courseId && !await db.get(`SELECT 1 FROM courses c WHERE c.id = ? AND c.school_id = ? AND c.grade = ? AND (
      EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.course_id = c.id AND se.academic_year = c.academic_year AND se.status = 'Activa')
      OR NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.status = 'Activa'))`, event.courseId, user.school_id, student.grade, student.id, student.id)) return json(response, 400, { error: 'El estudiante no pertenece al curso asociado al evento.' })
    const id = randomUUID()
    try {
      await db.run('INSERT INTO event_attendance_records (id, school_id, event_id, student_id, record_type, recorded_by) VALUES (?, ?, ?, ?, ?, ?)', id, user.school_id, event.id, student.id, recordType, user.id)
    } catch (error) {
      if (String(error.code || '').startsWith('23') || /unique|duplicate/i.test(String(error.message || ''))) return json(response, 409, { error: `Ya existe un registro de ${recordType.toLocaleLowerCase('es')} para este estudiante en el evento.` })
      throw error
    }
    await logAudit(user.school_id, user.id, `event_attendance_${recordType.toLowerCase()}`)
    return json(response, 201, { record: { id, studentName: student.fullName, grade: student.grade, recordType }, message: `${recordType} registrado para ${student.fullName}.` })
  }

  if (url.pathname === '/api/calendar' && method === 'GET') {
    const from = String(url.searchParams.get('from') || '')
    const to = String(url.searchParams.get('to') || '')
    const eventId = String(url.searchParams.get('eventId') || '').trim()
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json(response, 400, { error: 'El rango de fechas no es válido.' })
    let sql = `SELECT e.id, e.title, e.details, e.event_date AS "eventDate", e.start_time AS "startTime", e.end_time AS "endTime",
      e.event_type AS "eventType", e.course_id AS "courseId", c.name AS "courseName", c.grade, c.academic_year AS "academicYear",
      creator.full_name AS "createdByName", e.created_by AS "createdBy"
      FROM school_events e LEFT JOIN courses c ON c.id = e.course_id JOIN users creator ON creator.id = e.created_by
      WHERE e.school_id = ?`
    const params = [user.school_id]
    if (eventId) { sql += ' AND e.id = ?'; params.push(eventId) }
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
    if (title.length < 2 || title.length > 120 || details.length > 1500 || !validDate(eventDate) || (startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) || (endTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)) || (startTime && endTime && endTime <= startTime) || !['Evento', 'Actividad', 'Reunión', 'Evaluación', 'Entrega', 'Festivo', 'Institucional', 'PAE', 'Control de acceso'].includes(eventType) || (body.registrationCapacity != null && body.registrationCapacity !== '' && registrationCapacity == null) || (registrationDeadline && (!validDate(registrationDeadline) || registrationDeadline > eventDate)) || (registrationOpen && eventType !== 'Actividad')) return json(response, 400, { error: 'Revisa el título, fecha, horario, tipo, cupo y fecha límite.' })
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
        WHERE us.relationship = 'acudiente' AND st.school_id = ? AND st.status = 'Activo' AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.course_id = ? AND se.academic_year = ? AND se.status = 'Activa')
        OR (st.grade = ? AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')))`, user.school_id, course.id, course.academicYear, course.grade)
      const students = await db.all(`SELECT DISTINCT us.user_id AS id FROM user_students us JOIN students st ON st.id = us.student_id
        WHERE us.relationship = 'estudiante' AND st.school_id = ? AND st.status = 'Activo' AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.course_id = ? AND se.academic_year = ? AND se.status = 'Activa')
        OR (st.grade = ? AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')))`, user.school_id, course.id, course.academicYear, course.grade)
      recipients = [...new Set([...staff, ...families, ...students].map(row => row.id).filter(id => id !== user.id))]
    } else {
      recipients = (await db.all('SELECT id FROM users WHERE school_id = ? AND is_active = 1 AND deleted_at IS NULL AND id <> ?', user.school_id, user.id)).map(row => row.id)
    }
    await db.transaction(async tx => {
      await tx.run('INSERT INTO school_events (id, school_id, course_id, title, details, event_date, start_time, end_time, event_type, registration_capacity, registration_deadline, registration_open, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, course?.id || null, title, details, eventDate, startTime, endTime, eventType, registrationCapacity, registrationDeadline, registrationOpen ? 1 : 0, user.id)
      for (const recipient of recipients) await tx.run('INSERT INTO user_notifications (id, school_id, user_id, event_id, title, body, category, target_module, target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, recipient, id, `Nuevo evento: ${title}`, `${eventDate}${startTime ? ` · ${startTime}` : ''}${course ? ` · ${course.name}` : ''}`, 'calendar', 'Calendario', id)
    })
    const eventNoticeBody = `${eventDate}${startTime ? ` · ${startTime}` : ''}${course ? ` · ${course.name}` : ' · Todo el colegio'}`
    const pushResult = await sendPushNotifications(user.school_id, recipients, `Nuevo evento: ${title}`, eventNoticeBody, 'calendar', id, id)
    const emailResult = await sendEmailToUsers(user.school_id, recipients, `EDUCA: nuevo evento · ${title}`, `Se publicó un evento escolar.\n\n${title}\nFecha: ${eventNoticeBody}\n\nIngresa a EDUCA para consultar los detalles y cualquier actualización.`)
    await logAudit(user.school_id, user.id, 'calendar_event_created')
    return json(response, 201, { event: { id, title, eventDate, courseId: course?.id || null }, notified: recipients.length, pushNotified: pushResult.sent, pushRegistered: pushResult.registered, pushConfigured: pushResult.configured, pushFailed: Boolean(pushResult.failed), emailNotified: emailResult.sent, emailConfigured: emailResult.configured, emailFailed: Boolean(emailResult.failed) })
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
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración puede configurar el horario.' })
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
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración puede editar el horario.' })
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
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración puede editar el horario.' })
    await db.run('DELETE FROM class_schedule_slots WHERE id = ? AND school_id = ?', scheduleDeleteMatch[1], user.school_id)
    await logAudit(user.school_id, user.id, 'schedule_slot_deleted')
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/academic-periods' && method === 'GET') {
    return json(response, 200, { periods: await db.all('SELECT id, academic_year AS "academicYear", name, start_date AS "startDate", end_date AS "endDate", is_active AS "active" FROM academic_periods WHERE school_id = ? ORDER BY academic_year DESC, start_date', user.school_id) })
  }
  if (url.pathname === '/api/academic-periods' && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden configurar periodos.' })
    const body = await readBody(request)
    const year = academicYearStart(body.academicYear), name = String(body.name || '').trim(), startDate = String(body.startDate || ''), endDate = String(body.endDate || '')
    if (!year || name.length < 2 || name.length > 40 || !validDate(startDate) || !validDate(endDate) || endDate < startDate) return json(response, 400, { error: 'Revisa el año lectivo, nombre y fechas del periodo.' })
    if (await db.get('SELECT id FROM academic_periods WHERE school_id = ? AND LEFT(academic_year, 4) = ? AND name = ?', user.school_id, year, name)) return json(response, 409, { error: 'Ya existe ese periodo para el año lectivo.' })
    const id = randomUUID()
    try { await db.run('INSERT INTO academic_periods (id, school_id, academic_year, name, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', id, user.school_id, year, name, startDate, endDate, user.id) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya existe ese periodo para el año lectivo.' }); throw error }
    await logAudit(user.school_id, user.id, 'academic_period_created')
    return json(response, 201, { id })
  }
  const periodMatch = url.pathname.match(/^\/api\/academic-periods\/([0-9a-f-]{36})$/i)
  if (periodMatch && method === 'DELETE') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden configurar periodos.' })
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
    if (user.role !== 'acudiente') return json(response, 403, { error: 'Solo el acudiente o padre autorizado puede enviar justificaciones.' })
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
    for (const reviewer of reviewers) await db.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module, target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, reviewer.id, 'Nueva justificación de ausencia', `${linked.name} · ${date}`, 'attendance', 'Justificaciones', id)
    await sendPushNotifications(user.school_id, reviewers.map(item => item.id), 'Nueva justificación de ausencia', 'Hay una solicitud pendiente para revisar en EDUCA.', 'attendance', '', id)
    await sendEmailToUsers(user.school_id, reviewers.map(item => item.id), 'Nueva justificación pendiente', `El acudiente ${user.full_name} envió una justificación para ${linked.name}.\nFecha de ausencia: ${date}.\nIngresa a EDUCA para revisar el motivo y el soporte adjunto.`)
    await sendEmailToUsers(user.school_id, [user.id], 'Recibimos tu justificación', `La justificación para ${linked.name} del ${date} quedó registrada y pendiente de revisión.\nTe enviaremos otro correo cuando rectoría o administración actualice su estado.`)
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
    const item = await db.get(`SELECT j.id, j.student_id AS "studentId", st.full_name AS "studentName", j.attendance_date AS date,
      j.created_by AS "createdBy" FROM attendance_justifications j JOIN students st ON st.id = j.student_id
      WHERE j.id = ? AND j.school_id = ?`, justificationMatch[1], user.school_id)
    if (!item) return json(response, 404, { error: 'No encontramos esa justificación.' })
    await db.transaction(async tx => {
      await tx.run('UPDATE attendance_justifications SET status = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', status, note, user.id, item.id, user.school_id)
      if (status === 'Aprobada') await tx.run("UPDATE attendance_records SET status = 'Justificado', marked_by = ?, marked_at = CURRENT_TIMESTAMP WHERE school_id = ? AND student_id = ? AND attendance_date = ? AND status = 'Ausente'", user.id, user.school_id, item.studentId, item.date)
      await tx.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module, target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, item.createdBy, `Justificación ${status.toLocaleLowerCase('es')}`, `${item.date}${note ? ` · ${note}` : ''}`, 'attendance', 'Justificaciones', item.id)
    })
    await sendPushNotifications(user.school_id, [item.createdBy], `Justificación ${status.toLocaleLowerCase('es')}`, 'Ingresa a EDUCA para consultar la respuesta.', 'attendance', '', item.id)
    await sendEmailToUsers(user.school_id, [item.createdBy], `Justificación ${status.toLocaleLowerCase('es')}`, `La justificación de ${item.studentName} para el ${item.date} fue ${status.toLocaleLowerCase('es')}.${note ? `\nObservación: ${note}` : ''}\nIngresa a EDUCA para consultar el registro completo.`)
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
    const [school, users, students, courses, assignments, enrollments, attendance, assessments, grades, requests, events, schedule, observations, periods, justifications, communications, activityRegistrations, surveys, surveyVotes, certificates, promotionResults, audit] = await Promise.all([
      db.get('SELECT id, slug, name, contact_email AS "contactEmail", contact_phone AS "contactPhone", address, primary_color AS "primaryColor" FROM schools WHERE id = ?', user.school_id),
      db.all('SELECT id, email, full_name AS name, role, is_active AS active FROM users WHERE school_id = ? AND deleted_at IS NULL', user.school_id),
      db.all('SELECT id, full_name AS name, document, document_type AS "documentType", document_issued_place AS "documentIssuedPlace", grade, guardian_name AS guardian, guardian_phone AS phone, status FROM students WHERE school_id = ?', user.school_id),
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
      db.all('SELECT id, course_id AS "courseId", title, description, options_json AS options, closes_at AS "closesAt", is_published AS published, created_by AS "createdBy", created_at AS "createdAt" FROM school_surveys WHERE school_id = ?', user.school_id),
      db.all('SELECT survey_id AS "surveyId", user_id AS "userId", option_index AS "optionIndex", created_at AS "createdAt" FROM survey_votes WHERE school_id = ?', user.school_id),
      db.all('SELECT id, student_id AS "studentId", certificate_number AS "certificateNumber", certificate_type AS "certificateType", student_name AS "studentName", grade, academic_year AS "academicYear", issued_by AS "issuedBy", created_at AS "issuedAt" FROM school_certificates WHERE school_id = ?', user.school_id),
      db.all('SELECT student_id AS "studentId", academic_year AS "academicYear", current_grade AS "currentGrade", result_status AS "resultStatus", new_grade AS "newGrade", source_reference AS "sourceReference", created_by AS "createdBy", created_at AS "createdAt" FROM student_promotion_results WHERE school_id = ?', user.school_id),
      db.all('SELECT actor_user_id AS "actorUserId", action, created_at AS "createdAt" FROM audit_log WHERE school_id = ? ORDER BY id', user.school_id),
    ])
    const date = new Date().toISOString()
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="educa-respaldo-${school.slug}-${date.slice(0, 10)}.json"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(JSON.stringify({ format: 'educa-school-backup-v1', generatedAt: date, school, users, students, courses, assignments, enrollments, attendance, assessments, grades, enrollmentRequests: requests, events, schedule, observations, periods, justifications, communications, activityRegistrations, surveys, surveyVotes, certificates, promotionResults, audit }, null, 2))
    await logAudit(user.school_id, user.id, 'school_backup_downloaded')
    return
  }

  if (url.pathname === '/api/students/promotion-results/import' && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría y secretaría pueden cargar resultados de promoción.' })
    const body = await readBody(request)
    const academicYear = String(body.academicYear || '').trim()
    const rows = body.records
    const allowedStatuses = new Set(['Promovido', 'Reprobado', 'Pendiente', 'Trasladado', 'Desertor'])
    if (!/^\d{4}$/.test(academicYear) || Number(academicYear) < 2000 || Number(academicYear) > 2100) return json(response, 400, { error: 'Selecciona un año lectivo de cuatro dígitos.' })
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000) return json(response, 400, { error: 'El informe debe contener entre 1 y 1.000 estudiantes.' })
    const clean = rows.map((row, index) => ({ rowNo: index + 2, document: String(row.document || '').trim(), currentGrade: String(row.currentGrade || '').trim().slice(0, 40), resultStatus: String(row.resultStatus || '').trim(), newGrade: String(row.newGrade || '').trim().slice(0, 40) }))
    const normalizeDocument = value => String(value || '').normalize('NFKC').toLocaleUpperCase('es').replace(/[^\p{L}\p{N}]/gu, '')
    const normalizedDocuments = clean.map(row => normalizeDocument(row.document))
    if (clean.some(row => !row.document || normalizeDocument(row.document).length < 3 || row.currentGrade.length < 1 || !allowedStatuses.has(row.resultStatus) || row.newGrade.length > 40 || (row.resultStatus === 'Promovido' && !row.newGrade)) || new Set(normalizedDocuments).size !== normalizedDocuments.length) {
      return json(response, 400, { error: 'Hay filas inválidas o documentos repetidos. Cada fila requiere documento, grado actual y un único estado; los promovidos también requieren nuevo grado.' })
    }
    const schoolStudents = await db.all('SELECT id, document FROM students WHERE school_id = ?', user.school_id)
    const byDocument = new Map(schoolStudents.map(student => [normalizeDocument(student.document), student]))
    const missing = clean.filter(row => !byDocument.has(normalizeDocument(row.document)))
    if (missing.length) return json(response, 422, { error: `No se encontraron estudiantes ya registrados para las filas ${missing.slice(0, 10).map(row => row.rowNo).join(', ')}${missing.length > 10 ? '…' : ''}. Verifica sus documentos; no se guardó ninguna fila.` })
    let inserted = 0, updated = 0
    await db.transaction(async tx => {
      for (const row of clean) {
        const student = byDocument.get(normalizeDocument(row.document))
        const existing = await tx.get('SELECT id FROM student_promotion_results WHERE school_id = ? AND student_id = ? AND academic_year = ?', user.school_id, student.id, academicYear)
        const id = existing?.id || randomUUID()
        if (existing) {
          await tx.run('UPDATE student_promotion_results SET current_grade = ?, result_status = ?, new_grade = ?, source_reference = ?, created_by = ?, created_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', row.currentGrade, row.resultStatus, row.newGrade, 'Informe final de matrículas SIMAT', user.id, id, user.school_id)
          updated++
        } else {
          await tx.run('INSERT INTO student_promotion_results (id, school_id, student_id, academic_year, current_grade, result_status, new_grade, source_reference, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, student.id, academicYear, row.currentGrade, row.resultStatus, row.newGrade, 'Informe final de matrículas SIMAT', user.id)
          inserted++
        }
      }
    })
    await logAudit(user.school_id, user.id, `student_promotion_results_imported:${academicYear}:${inserted}:${updated}`)
    return json(response, 200, { imported: inserted, updated, total: clean.length })
  }

  if (url.pathname === '/api/students/import' && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden importar estudiantes.' })
    return json(response, 409, { error: 'La importación directa está deshabilitada para evitar estudiantes sin matrícula. Registra la solicitud en Matrículas y apruébala para crear el registro del estudiante.' })
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
        await tx.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module, target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, recipient.id, `Nuevo comunicado: ${title}`, content.slice(0, 220), 'communication', 'Comunicaciones', id)
      }
    })
    await sendPushNotifications(user.school_id, recipientUsers.map(item => item.id), `Nuevo comunicado: ${title}`, 'Abre EDUCA para leer el mensaje.', 'communication', id)
    const emailResult = await sendEmailToUsers(user.school_id, recipientUsers.map(item => item.id), `EDUCA: nuevo comunicado · ${title}`, `Tienes un nuevo comunicado de tu institución: ${title}.\n\nIngresa a EDUCA para leer el contenido completo y consultar las novedades.`)
    await logAudit(user.school_id, user.id, `communication_created:${audience}`)
    return json(response, 201, { created: true, id, recipientCount: recipientUsers.length, emailNotified: emailResult.sent, emailConfigured: emailResult.configured, emailFailed: Boolean(emailResult.failed) })
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

  if (url.pathname === '/api/messages/recipients' && method === 'GET') {
    const officeRoles = "'admin','rectoria','coordinacion','secretaria','orientacion','tesoreria'"
    const assignedToTeacher = `EXISTS (SELECT 1 FROM user_students us JOIN students st ON st.id = us.student_id
      JOIN courses c ON c.school_id = st.school_id AND c.grade = st.grade AND c.is_active = 1
      JOIN course_teachers ct ON ct.course_id = c.id AND ct.user_id = ?
      WHERE us.user_id = u.id AND st.school_id = u.school_id AND st.status = 'Activo')`
    let recipientRule = '1 = 0'
    const recipientParams = []
    if (directMessageOfficeRoles.has(user.role)) recipientRule = '1 = 1'
    else if (user.role === 'docente') {
      recipientRule = `u.role IN (${officeRoles}) OR u.role = 'docente' OR (u.role IN ('estudiante','acudiente') AND ${assignedToTeacher})`
      recipientParams.push(user.id)
    } else if (['estudiante', 'acudiente'].includes(user.role)) {
      recipientRule = `u.role IN (${officeRoles}) OR (u.role = 'docente' AND ${assignedToTeacher.replace('us.user_id = u.id', 'us.user_id = ?').replace('ct.user_id = ?', 'ct.user_id = u.id')})`
      recipientParams.push(user.id)
    }
    const accounts = await db.all(`SELECT DISTINCT u.id, u.full_name AS name, u.email, u.role FROM users u
      WHERE u.school_id = ? AND u.is_active = 1 AND u.deleted_at IS NULL AND u.id <> ? AND (${recipientRule})
      ORDER BY u.full_name LIMIT 2000`, user.school_id, user.id, ...recipientParams)
    return json(response, 200, { recipients: accounts })
  }
  if (url.pathname === '/api/messages' && method === 'GET') {
    const folder = String(url.searchParams.get('folder') || 'inbox')
    if (!['inbox', 'sent'].includes(folder)) return json(response, 400, { error: 'Selecciona una bandeja válida.' })
    const rows = await db.all(`SELECT m.id, m.thread_id AS "threadId", m.sender_id AS "senderId", m.recipient_id AS "recipientId",
        m.subject, m.body, m.read_at AS "readAt", m.created_at AS "createdAt",
        sender.full_name AS "senderName", recipient.full_name AS "recipientName"
      FROM direct_messages m
      JOIN users sender ON sender.id = m.sender_id AND sender.school_id = m.school_id
      JOIN users recipient ON recipient.id = m.recipient_id AND recipient.school_id = m.school_id
      WHERE m.school_id = ? AND (m.sender_id = ? OR m.recipient_id = ?)
      ORDER BY m.created_at DESC LIMIT 2000`, user.school_id, user.id, user.id)
    const threads = new Map()
    for (const row of rows) {
      let thread = threads.get(row.threadId)
      if (!thread) {
        thread = { id: row.threadId, subject: row.subject, latestMessage: row.body.slice(0, 220), latestAt: row.createdAt, counterpartId: row.senderId === user.id ? row.recipientId : row.senderId, counterpartName: row.senderId === user.id ? row.recipientName : row.senderName, hasIncoming: false, hasOutgoing: false, unreadCount: 0 }
        threads.set(row.threadId, thread)
      }
      if (row.recipientId === user.id) {
        thread.hasIncoming = true
        if (!row.readAt) thread.unreadCount += 1
      }
      if (row.senderId === user.id) thread.hasOutgoing = true
    }
    const result = [...threads.values()].filter(thread => folder === 'inbox' ? thread.hasIncoming : thread.hasOutgoing)
    return json(response, 200, { threads: result })
  }
  const directThreadMatch = url.pathname.match(/^\/api\/messages\/([0-9a-f-]{36})$/i)
  if (directThreadMatch && method === 'GET') {
    const threadId = directThreadMatch[1]
    const exists = await db.get('SELECT id FROM direct_messages WHERE school_id = ? AND thread_id = ? AND (sender_id = ? OR recipient_id = ?) LIMIT 1', user.school_id, threadId, user.id, user.id)
    if (!exists) return json(response, 404, { error: 'No encontramos esa conversación en tu bandeja.' })
    await db.run('UPDATE direct_messages SET read_at = CURRENT_TIMESTAMP WHERE school_id = ? AND thread_id = ? AND recipient_id = ? AND read_at IS NULL', user.school_id, threadId, user.id)
    const messages = await db.all(`SELECT m.id, m.thread_id AS "threadId", m.sender_id AS "senderId", m.recipient_id AS "recipientId",
        m.subject, m.body, m.read_at AS "readAt", m.created_at AS "createdAt", sender.full_name AS "senderName"
      FROM direct_messages m JOIN users sender ON sender.id = m.sender_id AND sender.school_id = m.school_id
      WHERE m.school_id = ? AND m.thread_id = ? AND (m.sender_id = ? OR m.recipient_id = ?) ORDER BY m.created_at, m.id`, user.school_id, threadId, user.id, user.id)
    return json(response, 200, { messages })
  }
  if (url.pathname === '/api/messages' && method === 'POST') {
    const body = await readBody(request)
    const requestedRecipientId = String(body.recipientId || '').trim()
    const threadId = String(body.threadId || '').trim()
    const content = String(body.body || '').trim()
    if (content.length < 1 || content.length > 10000) return json(response, 400, { error: 'El mensaje debe tener entre 1 y 10.000 caracteres.' })
    if (threadId && !/^[0-9a-f-]{36}$/i.test(threadId)) return json(response, 400, { error: 'La conversación no es válida.' })
    let recipientId = requestedRecipientId
    let subject = String(body.subject || '').trim()
    if (threadId) {
      const prior = await db.get(`SELECT id, subject, sender_id AS "senderId", recipient_id AS "recipientId"
        FROM direct_messages WHERE school_id = ? AND thread_id = ? AND (sender_id = ? OR recipient_id = ?)
        ORDER BY created_at LIMIT 1`, user.school_id, threadId, user.id, user.id)
      if (!prior) return json(response, 404, { error: 'No encontramos esa conversación.' })
      const otherId = prior.senderId === user.id ? prior.recipientId : prior.senderId
      if (requestedRecipientId && requestedRecipientId !== otherId) return json(response, 403, { error: 'No puedes cambiar el destinatario de esta conversación.' })
      recipientId = otherId
      subject = prior.subject
    }
    if (subject.length < 3 || subject.length > 160) return json(response, 400, { error: 'El asunto debe tener entre 3 y 160 caracteres.' })
    const recipient = await db.get(`SELECT id, school_id, full_name AS name, role FROM users
      WHERE id = ? AND school_id = ? AND is_active = 1 AND deleted_at IS NULL`, recipientId, user.school_id)
    if (!recipient) return json(response, 404, { error: 'La cuenta destinataria no está disponible en este colegio.' })
    if (!await canDirectMessage(user, recipient)) return json(response, 403, { error: 'No tienes autorización para iniciar o responder a esta conversación.' })
    const senderName = String(user.full_name || user.name || 'Un usuario')
    const conversationId = threadId || randomUUID()
    await db.transaction(async tx => {
      await tx.run('INSERT INTO direct_messages (id, thread_id, school_id, sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?, ?, ?, ?)', randomUUID(), conversationId, user.school_id, user.id, recipientId, subject, content)
      await tx.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module, target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, recipientId, `Nuevo mensaje de ${senderName}`, 'Abre Mensajería en EDUCA para leerlo.', 'message', 'Mensajería', conversationId)
    })
    await sendPushNotifications(user.school_id, [recipientId], `Nuevo mensaje de ${senderName}`, 'Abre EDUCA para leer tu mensaje privado.', 'message', conversationId)
    await logAudit(user.school_id, user.id, `direct_message_sent:${conversationId}`)
    return json(response, 201, { sent: true, threadId: conversationId })
  }

  const contentRoles = ['admin', 'rectoria', 'secretaria', 'docente', 'coordinacion', 'orientacion', 'acudiente', 'estudiante']
  const contentManagers = ['admin', 'rectoria']
  const contentCategories = ['articulo', 'aviso', 'guia', 'video', 'documento', 'egresados', 'oportunidades']
  if (url.pathname === '/api/institutional-content' && method === 'GET') {
    if (!contentRoles.includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar el contenido institucional.' })
    const canManage = contentManagers.includes(user.role)
    const items = await db.all(`SELECT id, category, title, body, media_url AS "mediaUrl", is_published AS "isPublished", show_in_help AS "showInHelp", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM institutional_content WHERE school_id = ? AND (? = 1 OR is_published = 1) ORDER BY updated_at DESC LIMIT 200`, user.school_id, canManage ? 1 : 0)
    return json(response, 200, { items: items.map(item => ({ ...item, isPublished: Boolean(item.isPublished), showInHelp: Boolean(item.showInHelp) })) })
  }
  if (url.pathname === '/api/institutional-content' && method === 'POST') {
    if (!contentManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden gestionar el contenido institucional.' })
    const body = await readBody(request)
    const category = String(body.category || '')
    const title = String(body.title || '').trim()
    const content = String(body.body || '').trim()
    const mediaUrl = String(body.mediaUrl || '').trim()
    const isPublished = body.isPublished === true
    const showInHelp = body.showInHelp === true
    if (!contentCategories.includes(category) || title.length < 3 || title.length > 160 || content.length > 12000 || mediaUrl.length > 1500) return json(response, 400, { error: 'Revisa la categoría, el título, el contenido y el enlace.' })
    if (mediaUrl) { try { const parsed = new URL(mediaUrl); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error() } catch { return json(response, 400, { error: 'El enlace multimedia debe ser una URL web válida.' }) } }
    const id = randomUUID()
    await db.run('INSERT INTO institutional_content (id, school_id, category, title, body, media_url, is_published, show_in_help, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, category, title, content, mediaUrl, isPublished ? 1 : 0, showInHelp ? 1 : 0, user.id)
    await logAudit(user.school_id, user.id, `institutional_content_created:${category}:${isPublished ? 'published' : 'draft'}`)
    return json(response, 201, { item: await db.get('SELECT id, category, title, body, media_url AS "mediaUrl", is_published AS "isPublished", show_in_help AS "showInHelp", created_at AS "createdAt", updated_at AS "updatedAt" FROM institutional_content WHERE id = ? AND school_id = ?', id, user.school_id) })
  }
  const contentMatch = url.pathname.match(/^\/api\/institutional-content\/([0-9a-f-]{36})$/i)
  if (contentMatch && method === 'PUT') {
    if (!contentManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden gestionar el contenido institucional.' })
    const id = contentMatch[1], body = await readBody(request)
    const category = String(body.category || ''), title = String(body.title || '').trim(), content = String(body.body || '').trim(), mediaUrl = String(body.mediaUrl || '').trim(), isPublished = body.isPublished === true, showInHelp = body.showInHelp === true
    if (!contentCategories.includes(category) || title.length < 3 || title.length > 160 || content.length > 12000 || mediaUrl.length > 1500) return json(response, 400, { error: 'Revisa la categoría, el título, el contenido y el enlace.' })
    if (mediaUrl) { try { const parsed = new URL(mediaUrl); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error() } catch { return json(response, 400, { error: 'El enlace multimedia debe ser una URL web válida.' }) } }
    const updated = await db.run('UPDATE institutional_content SET category = ?, title = ?, body = ?, media_url = ?, is_published = ?, show_in_help = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', category, title, content, mediaUrl, isPublished ? 1 : 0, showInHelp ? 1 : 0, id, user.school_id)
    if (!(updated.rowCount ?? updated.changes ?? 0)) return json(response, 404, { error: 'No encontramos este contenido en la institución.' })
    await logAudit(user.school_id, user.id, `institutional_content_updated:${id}:${isPublished ? 'published' : 'draft'}`)
    return json(response, 200, { item: await db.get('SELECT id, category, title, body, media_url AS "mediaUrl", is_published AS "isPublished", show_in_help AS "showInHelp", created_at AS "createdAt", updated_at AS "updatedAt" FROM institutional_content WHERE id = ? AND school_id = ?', id, user.school_id) })
  }
  if (contentMatch && method === 'DELETE') {
    if (!contentManagers.includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden gestionar el contenido institucional.' })
    const deleted = await db.run('DELETE FROM institutional_content WHERE id = ? AND school_id = ?', contentMatch[1], user.school_id)
    if (!(deleted.rowCount ?? deleted.changes ?? 0)) return json(response, 404, { error: 'No encontramos este contenido en la institución.' })
    await logAudit(user.school_id, user.id, `institutional_content_deleted:${contentMatch[1]}`)
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/reports/options' && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar estos filtros.' })
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
      students: ['admin', 'rectoria', 'secretaria', 'docente'],
      attendance: ['admin', 'rectoria', 'secretaria', 'docente'],
      late_arrivals: ['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'],
      grades: ['admin', 'rectoria', 'secretaria', 'docente'],
      rankings: ['admin', 'rectoria', 'secretaria', 'docente'],
      honor_roll: ['admin', 'rectoria', 'secretaria', 'docente'],
      pass_fail: ['admin', 'rectoria', 'secretaria', 'docente'],
      demographics: ['admin', 'rectoria', 'secretaria'],
      enrollments: ['admin', 'secretaria'],
      guardians: ['admin', 'secretaria'],
      event_attendance: ['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente'],
      pae: ['admin', 'rectoria', 'coordinacion', 'secretaria'],
    }
    if (!allowedRoles[type]) return json(response, 400, { error: 'Selecciona un tipo de reporte válido.' })
    if (!allowedRoles[type].includes(user.role)) return json(response, 403, { error: 'Tu rol no tiene acceso a este reporte.' })
    const from = String(url.searchParams.get('from') || '')
    const to = String(url.searchParams.get('to') || '')
    const courseId = String(url.searchParams.get('courseId') || '')
    const academicYear = String(url.searchParams.get('academicYear') || '')
    const academicYearFilter = academicYearStart(academicYear)
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return json(response, 400, { error: 'Revisa el rango de fechas.' })
    if (academicYear && !academicYearStart(academicYear)) return json(response, 400, { error: 'El año lectivo no es válido.' })
    let selectedCourse = null
    if (courseId) {
      selectedCourse = await db.get('SELECT id, grade FROM courses WHERE id = ? AND school_id = ?', courseId, user.school_id)
      if (!selectedCourse) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
      if (user.role === 'docente' && !await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND user_id = ?', courseId, user.id)) return json(response, 403, { error: 'Ese curso no está asignado a tu cuenta.' })
    }
    if (type === 'demographics') {
      let sql = 'SELECT st.sex, st.date_of_birth AS "dateOfBirth", st.grade FROM students st WHERE st.school_id = ? AND st.status = \'Activo\''
      const values = [user.school_id]
      if (selectedCourse) { sql += ' AND (st.grade = ? OR EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.course_id = ? AND se.status = \'Activa\'))'; values.push(selectedCourse.grade, selectedCourse.id) }
      if (academicYear) { sql += ' AND EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND LEFT(se.academic_year, 4) = ?)'; values.push(academicYearFilter) }
      const rows = await db.all(sql, ...values)
      const ageBand = value => { if (!value) return 'Sin fecha de nacimiento'; const dob = new Date(`${value}T00:00:00Z`); if (Number.isNaN(dob.getTime())) return 'Sin fecha de nacimiento'; let age = new Date().getUTCFullYear() - dob.getUTCFullYear(); const month = new Date().getUTCMonth() - dob.getUTCMonth(); if (month < 0 || (month === 0 && new Date().getUTCDate() < dob.getUTCDate())) age--; return age < 6 ? 'Menos de 6' : age <= 8 ? '6–8' : age <= 11 ? '9–11' : age <= 14 ? '12–14' : age <= 17 ? '15–17' : '18 o más' }
      const counts = new Map()
      for (const row of rows) for (const [dimension, value] of [['Sexo registrado', row.sex || 'Sin registrar'], ['Rango de edad', ageBand(row.dateOfBirth)]]) { const key = `${dimension}|${value}`; counts.set(key, (counts.get(key) || 0) + 1) }
      return json(response, 200, { records: [...counts].map(([key, count]) => { const [dimension, value] = key.split('|'); return { Indicador: dimension, Categoría: value, Estudiantes: count } }), total: rows.length })
    }
    if (['rankings', 'honor_roll', 'pass_fail'].includes(type)) {
      const gradeParams = [user.school_id, user.school_id]
      let gradeSql = `SELECT st.id AS student_id, st.full_name AS student_name, c.id AS course_id, c.name AS course_name,
        c.grade, c.academic_year, a.subject, a.period, a.max_score, a.weight_percent, sg.score,
        gr.scale_min, gr.scale_max, gr.passing_score
        FROM student_grades sg JOIN students st ON st.id = sg.student_id AND st.school_id = ?
        JOIN grade_assessments a ON a.id = sg.assessment_id AND a.school_id = st.school_id
        JOIN courses c ON c.id = a.course_id AND c.school_id = st.school_id
        LEFT JOIN academic_grade_rules gr ON gr.school_id = c.school_id AND gr.course_id = c.id AND gr.subject = a.subject AND gr.period = a.period
        WHERE st.school_id = ? AND a.is_published = 1`
      if (selectedCourse) { gradeSql += ' AND c.id = ?'; gradeParams.push(selectedCourse.id) }
      if (academicYear) { gradeSql += ' AND SUBSTR(c.academic_year, 1, 4) = ?'; gradeParams.push(academicYearFilter) }
      if (from) { gradeSql += ' AND substr(sg.updated_at, 1, 10) >= ?'; gradeParams.push(from) }
      if (to) { gradeSql += ' AND substr(sg.updated_at, 1, 10) <= ?'; gradeParams.push(to) }
      if (user.role === 'docente') { gradeSql += ' AND EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = c.id AND ct.subject = a.subject AND ct.user_id = ?)'; gradeParams.push(user.id) }
      gradeSql += ' ORDER BY c.academic_year DESC, c.grade, c.name, a.subject, st.full_name'
      const gradeRows = await db.all(gradeSql, ...gradeParams)
      const assignmentRows = await db.all(`SELECT ct.course_id, ct.subject, u.full_name AS teacher_name FROM course_teachers ct
        JOIN courses c ON c.id = ct.course_id JOIN users u ON u.id = ct.user_id
        WHERE c.school_id = ? AND u.is_active = 1`, user.school_id)
      const teacherFor = (course, subject) => assignmentRows.filter(row => row.course_id === course && row.subject === subject).map(row => row.teacher_name).join(', ') || 'Sin asignar'
      const courseStudent = new Map(), subjectStudent = new Map()
      for (const row of gradeRows) {
        const weight = Number(row.weight_percent) || 100
        const normalized = Number(row.score) / Number(row.max_score) * 100
        const courseKey = `${row.course_id}|${row.student_id}`
        const courseRecord = courseStudent.get(courseKey) || { student: row.student_name, course: row.course_name, grade: row.grade, year: academicYearStart(row.academic_year), total: 0, weight: 0 }
        courseRecord.total += normalized * weight; courseRecord.weight += weight; courseStudent.set(courseKey, courseRecord)
        const subjectKey = `${row.course_id}|${row.subject}|${row.period}|${row.student_id}`
        const subjectRecord = subjectStudent.get(subjectKey) || { student: row.student_name, course: row.course_name, courseId: row.course_id, grade: row.grade, year: academicYearStart(row.academic_year), subject: row.subject, period: row.period, total: 0, weight: 0, minimum: Number(row.scale_min), maximum: Number(row.scale_max), passing: Number(row.passing_score) }
        subjectRecord.total += normalized * weight; subjectRecord.weight += weight
        if (Number.isFinite(Number(row.passing_score))) subjectRecord.passing = Number(row.passing_score)
        subjectStudent.set(subjectKey, subjectRecord)
      }
      const courseAverages = [...courseStudent.values()].map(record => ({ ...record, average: record.weight ? record.total / record.weight : 0 }))
      const byCourse = new Map()
      for (const record of courseAverages) { const key = `${record.course}|${record.year}`; if (!byCourse.has(key)) byCourse.set(key, []); byCourse.get(key).push(record) }
      for (const records of byCourse.values()) { records.sort((a, b) => b.average - a.average || a.student.localeCompare(b.student, 'es')); records.forEach((record, index) => { record.rank = index + 1 }) }
      let records
      if (type === 'rankings' || type === 'honor_roll') {
        records = courseAverages.sort((a, b) => a.course.localeCompare(b.course, 'es') || a.rank - b.rank).map(record => ({
          Estudiante: record.student, Grado: record.grade, Curso: record.course, 'Año lectivo': record.year, Puesto: record.rank,
          'Promedio porcentual': `${record.average.toFixed(1)}%`, ...(type === 'honor_roll' ? { 'Cuadro de honor': record.rank <= 3 ? `Puesto ${record.rank}` : 'No aplica' } : {})
        }))
      } else {
        records = [...subjectStudent.values()].map(record => {
          const average = record.weight ? record.total / record.weight : 0
          const min = Number.isFinite(record.minimum) ? record.minimum : 0
          const max = Number.isFinite(record.maximum) && record.maximum > min ? record.maximum : 100
          const passing = Number.isFinite(record.passing) ? record.passing : 60
          const gradeValue = min + (average / 100) * (max - min)
          return { Estudiante: record.student, Grado: record.grade, Curso: record.course, 'Año lectivo': record.year, Asignatura: record.subject, Periodo: record.period, Docente: teacherFor(record.courseId, record.subject), Promedio: gradeValue.toFixed(2), Aprobación: gradeValue >= passing ? 'Aprobado' : 'Reprobado', 'Nota mínima': passing }
        })
      }
      return json(response, 200, { records: records.slice(0, 5000), truncated: records.length > 5000 })
    }
    const params = [user.school_id]
    let sql = ''
    if (type === 'event_attendance' || type === 'pae') {
      sql = `SELECT st.full_name AS "Estudiante", st.grade AS "Grado", COALESCE(c.name, 'Todo el colegio') AS "Curso",
        e.title AS "Evento", e.event_type AS "Tipo de evento", r.record_type AS "Registro",
        e.event_date AS "Fecha", r.recorded_at AS "Hora de registro", actor.full_name AS "Responsable"
        FROM event_attendance_records r JOIN students st ON st.id = r.student_id
        JOIN school_events e ON e.id = r.event_id JOIN users actor ON actor.id = r.recorded_by
        LEFT JOIN courses c ON c.id = e.course_id WHERE r.school_id = ? AND e.school_id = ?`
      params.push(user.school_id)
      if (type === 'pae') { sql += " AND r.record_type = 'PAE'" }
      else { sql += " AND r.record_type IN ('Ingreso','Salida')" }
      if (from) { sql += ' AND e.event_date >= ?'; params.push(from) }
      if (to) { sql += ' AND e.event_date <= ?'; params.push(to) }
      if (selectedCourse) { sql += ' AND c.id = ?'; params.push(selectedCourse.id) }
      if (academicYear) { sql += ' AND LEFT(COALESCE(c.academic_year, e.event_date), 4) = ?'; params.push(academicYearFilter) }
      if (user.role === 'docente') { sql += ' AND e.course_id IS NOT NULL AND EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = e.course_id AND ct.user_id = ?)'; params.push(user.id) }
      sql += ' ORDER BY e.event_date DESC, r.recorded_at DESC LIMIT 5001'
    } else if (type === 'guardians') {
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
          AND se.student_id = st.id AND LEFT(se.academic_year, 4) = ?)`
        params.push(academicYearFilter)
      }
      sql += ' ORDER BY st.guardian_name, st.full_name LIMIT 5001'
    } else if (type === 'students') {
      sql = `SELECT st.full_name AS "Estudiante", st.grade AS "Grado", st.status AS "Estado"
        FROM students st WHERE st.school_id = ?`
      if (selectedCourse) { sql += ' AND (st.grade = ? OR EXISTS (SELECT 1 FROM student_enrollments se WHERE se.student_id = st.id AND se.course_id = ? AND se.status = \'Activa\'))'; params.push(selectedCourse.grade, selectedCourse.id) }
      if (academicYear) { sql += ` AND EXISTS (SELECT 1 FROM courses cy WHERE cy.school_id = st.school_id AND cy.grade = st.grade AND LEFT(cy.academic_year, 4) = ?)`; params.push(academicYearFilter) }
      if (user.role === 'docente') { sql += ` AND EXISTS (SELECT 1 FROM course_teachers ct JOIN courses cc ON cc.id = ct.course_id WHERE ct.user_id = ? AND cc.school_id = st.school_id AND cc.grade = st.grade)`; params.push(user.id) }
      sql += ' ORDER BY st.grade, st.full_name LIMIT 5001'
    } else if (type === 'attendance' || type === 'late_arrivals') {
      sql = `SELECT st.full_name AS "Estudiante", c.grade AS "Grado", c.name AS "Curso", c.academic_year AS "Año lectivo",
        ar.attendance_date AS "Fecha", ar.status AS "Asistencia", actor.full_name AS "Registró"
        FROM attendance_records ar JOIN students st ON st.id = ar.student_id JOIN courses c ON c.id = ar.course_id
        JOIN users actor ON actor.id = ar.marked_by WHERE ar.school_id = ? AND c.school_id = ?`
      params.push(user.school_id)
      if (type === 'late_arrivals') { sql += " AND ar.status = 'Tarde'" }
      if (from) { sql += ' AND ar.attendance_date >= ?'; params.push(from) }
      if (to) { sql += ' AND ar.attendance_date <= ?'; params.push(to) }
      if (selectedCourse) { sql += ' AND c.id = ?'; params.push(selectedCourse.id) }
      if (academicYear) { sql += ' AND SUBSTR(c.academic_year, 1, 4) = ?'; params.push(academicYearFilter) }
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
      if (academicYear) { sql += ' AND SUBSTR(c.academic_year, 1, 4) = ?'; params.push(academicYearFilter) }
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
      if (academicYear) { sql += ' AND LEFT(se.academic_year, 4) = ?'; params.push(academicYearFilter) }
      sql += ' ORDER BY se.academic_year DESC, c.grade, st.full_name LIMIT 5001'
    }
    const resultRows = await db.all(sql, ...params)
    return json(response, 200, { records: resultRows.slice(0, 5000).map(record => Object.hasOwn(record, 'Año lectivo') ? { ...record, 'Año lectivo': academicYearStart(record['Año lectivo']) } : record), truncated: resultRows.length > 5000 })
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
      if (!await db.get(`SELECT st.id FROM students st WHERE st.id = ? AND st.school_id = ? AND st.status = 'Activo'
        AND EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')`, studentId, user.school_id)) return json(response, 400, { error: 'La cuenta solo se puede vincular a un estudiante con matrícula activa aprobada.' })
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
    for (const studentId of studentIds) if (!await db.get(`SELECT st.id FROM students st WHERE st.id = ? AND st.school_id = ? AND st.status = 'Activo'
      AND EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa')`, studentId, user.school_id)) return json(response, 400, { error: 'La cuenta solo se puede vincular a un estudiante con matrícula activa aprobada.' })
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
    if (['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'orientacion', 'tesoreria'].includes(user.role)) {
      const staff = await db.all(`SELECT p.id, p.full_name AS "fullName", p.national_id AS "nationalId", p.position_title AS "positionTitle", p.department, p.email, p.phone, p.is_active AS "isActive", (u.profile_photo_data IS NOT NULL) AS "hasPhoto", s.name AS "schoolName", s.slug AS "schoolSlug", s.address AS "schoolAddress", s.contact_email AS "schoolEmail", s.contact_phone AS "schoolPhone", s.primary_color AS "primaryColor", (s.logo_content_type IS NOT NULL) AS "hasLogo"
        FROM institutional_staff p JOIN schools s ON s.id = p.school_id LEFT JOIN users u ON u.id = p.user_id AND u.school_id = p.school_id WHERE p.user_id = ? AND p.school_id = ? AND p.is_active = 1`, user.id, user.school_id)
      const issuer = await db.get(`SELECT p.id, p.full_name AS "fullName", p.position_title AS "positionTitle", p.signature_data AS "signatureData", p.signature_content_type AS "signatureContentType"
        FROM institutional_staff p LEFT JOIN users u ON u.id = p.user_id AND u.school_id = p.school_id
        WHERE p.school_id = ? AND p.is_active = 1 AND p.position_key IN ('rector','academic_secretary','administrative','academic_coordinator','coexistence_coordinator','other') AND p.signature_data IS NOT NULL AND p.signature_content_type = 'image/png'
          AND (u.profile_photo_data IS NULL OR p.signature_data <> u.profile_photo_data)
        ORDER BY CASE p.position_key WHEN 'rector' THEN 0 WHEN 'academic_secretary' THEN 1 WHEN 'administrative' THEN 2 WHEN 'academic_coordinator' THEN 3 WHEN 'coexistence_coordinator' THEN 4 WHEN 'other' THEN 5 ELSE 6 END, p.created_at LIMIT 1`, user.school_id)
      const issuerSignature = issuer?.signatureData && issuer.signatureContentType === 'image/png' ? `data:image/png;base64,${Buffer.from(issuer.signatureData).toString('base64')}` : ''
      return json(response, 200, { cards: [], staffCards: staff.map(person => ({ ...person, isActive: Boolean(person.isActive), cardCode: `EDU-P-${person.id.replaceAll('-', '').slice(0, 12).toUpperCase()}`, issuerName: issuer?.fullName || '', issuerTitle: issuer?.positionTitle || '', issuerSignature })) })
    }
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No hay un carné digital disponible para esta cuenta.' })
    const students = await db.all(`SELECT st.id, st.card_code AS "cardCode", (st.photo_data IS NOT NULL) AS "hasPhoto", st.full_name AS "studentName", st.grade, st.status, us.relationship,
      s.name AS "schoolName", s.primary_color AS "primaryColor", s.logo_content_type AS "logoContentType",
      COALESCE(en.academic_year, '') AS "academicYear"
      FROM user_students us JOIN students st ON st.id = us.student_id JOIN schools s ON s.id = st.school_id
      LEFT JOIN student_enrollments en ON en.id = (SELECT e.id FROM student_enrollments e WHERE e.student_id = st.id AND e.school_id = st.school_id AND e.status = 'Activa' ORDER BY e.start_date DESC LIMIT 1)
      WHERE us.user_id = ? AND st.school_id = ? ORDER BY st.full_name`, user.id, user.school_id)
    return json(response, 200, { cards: students.map(student => ({ ...student, hasLogo: Boolean(student.logoContentType) })), staffCards: [] })
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
  const portalStaffPhotoMatch = url.pathname.match(/^\/api\/portal\/digital-card\/staff\/([0-9a-f-]{36})\/photo$/i)
  if (portalStaffPhotoMatch && method === 'GET') {
    const staff = await db.get(`SELECT p.user_id AS "userId", u.profile_photo_data AS data, u.profile_photo_content_type AS "contentType"
      FROM institutional_staff p LEFT JOIN users u ON u.id = p.user_id AND u.school_id = p.school_id
      WHERE p.id = ? AND p.school_id = ? AND p.is_active = 1`, portalStaffPhotoMatch[1], user.school_id)
    if (!staff || (staff.userId !== user.id && !institutionalManagerRoles.includes(user.role))) return json(response, 403, { error: 'No tienes permiso para consultar esta foto.' })
    if (!staff.data || !['image/jpeg', 'image/png', 'image/webp'].includes(staff.contentType)) return json(response, 404, { error: 'No hay una foto de perfil disponible.' })
    response.writeHead(200, { 'Content-Type': staff.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
    return response.end(staff.data)
  }
  const certificateRoles = ['admin', 'rectoria', 'coordinacion', 'secretaria']
  const studentHistoryMatch = url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})\/academic-history$/i)
  if (studentHistoryMatch && method === 'GET') {
    if (!['admin', 'rectoria', 'coordinacion', 'secretaria', 'docente', 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar la trayectoria académica.' })
    const studentId = studentHistoryMatch[1]
    const student = await db.get('SELECT id, full_name AS name, grade, status FROM students WHERE id = ? AND school_id = ?', studentId, user.school_id)
    if (!student) return json(response, 404, { error: 'No encontramos al estudiante en este colegio.' })
    if (['acudiente', 'estudiante'].includes(user.role) && !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    const records = await db.all(`SELECT se.id AS "enrollmentId", se.course_id AS "courseId", se.academic_year AS "academicYear",
        COALESCE(c.grade, ?) AS grade, COALESCE(c.name, '') AS "courseName", se.status,
        se.start_date AS "startDate", se.end_date AS "endDate", 'Matrícula' AS source
      FROM student_enrollments se LEFT JOIN courses c ON c.id = se.course_id AND c.school_id = se.school_id
      WHERE se.school_id = ? AND se.student_id = ?
      UNION ALL
      SELECT NULL AS "enrollmentId", c.id AS "courseId", c.academic_year AS "academicYear", c.grade,
        c.name AS "courseName", 'Registro académico' AS status, '' AS "startDate", '' AS "endDate", 'Registro académico' AS source
      FROM courses c WHERE c.school_id = ? AND (
        EXISTS (SELECT 1 FROM grade_assessments a JOIN student_grades sg ON sg.assessment_id = a.id WHERE a.course_id = c.id AND sg.student_id = ?)
        OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.course_id = c.id AND ar.student_id = ?)
      ) AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.course_id = c.id AND se.academic_year = c.academic_year)
      ORDER BY "academicYear" DESC, grade, "courseName"`, student.grade, user.school_id, studentId, user.school_id, studentId, studentId, studentId)
    const promotionResults = await db.all(`SELECT id AS "enrollmentId", NULL AS "courseId", academic_year AS "academicYear",
        current_grade AS grade, '' AS "courseName", result_status AS status, '' AS "startDate", '' AS "endDate",
        'Informe final de matrículas' AS source, new_grade AS "newGrade", source_reference AS "sourceReference"
      FROM student_promotion_results WHERE school_id = ? AND student_id = ?`, user.school_id, studentId)
    const publications = await db.all(`SELECT academic_year AS "academicYear", period FROM grade_period_publications
      WHERE school_id = ? AND is_published = 1 ORDER BY academic_year DESC, period`, user.school_id)
    const history = [...records, ...promotionResults].sort((a, b) => String(b.academicYear).localeCompare(String(a.academicYear)) || String(a.grade).localeCompare(String(b.grade), 'es', { numeric: true }))
    return json(response, 200, { student, records: history.map(record => ({ ...record, reportPeriods: publications.filter(item => item.academicYear === record.academicYear) })) })
  }
  if (url.pathname === '/api/certificates/options' && method === 'GET') {
    if (![...certificateRoles, 'acudiente'].includes(user.role)) return json(response, 403, { error: 'Las cuentas de estudiante no pueden solicitar certificados ni constancias.' })
    const students = user.role === 'acudiente'
      ? await db.all("SELECT st.id, st.full_name AS name, st.grade, st.status, st.document, st.document_type AS \"documentType\", st.document_issued_place AS \"documentIssuedPlace\" FROM user_students us JOIN students st ON st.id = us.student_id WHERE us.user_id = ? AND st.school_id = ? AND st.status = 'Activo' AND EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa') ORDER BY st.full_name", user.id, user.school_id)
      : await db.all("SELECT st.id, st.full_name AS name, st.grade, st.status, st.document, st.document_type AS \"documentType\", st.document_issued_place AS \"documentIssuedPlace\" FROM students st WHERE st.school_id = ? AND st.status = 'Activo' AND EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = st.school_id AND se.student_id = st.id AND se.status = 'Activa') ORDER BY st.full_name LIMIT 2000", user.school_id)
    return json(response, 200, { students })
  }
  const certificateHistoryMatch = url.pathname.match(/^\/api\/certificates\/students\/([0-9a-f-]{36})\/history$/i)
  if (certificateHistoryMatch && method === 'GET') {
    if (![...certificateRoles, 'acudiente'].includes(user.role)) return json(response, 403, { error: 'Las cuentas de estudiante no pueden consultar certificados ni constancias.' })
    const studentId = certificateHistoryMatch[1]
    if (user.role === 'acudiente' && !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    const student = await db.get("SELECT id, grade FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", studentId, user.school_id)
    if (!student) return json(response, 404, { error: 'No encontramos al estudiante activo en este colegio.' })
    const records = await db.all(`SELECT se.id AS "enrollmentId", se.course_id AS "courseId", se.academic_year AS "academicYear",
        COALESCE(c.grade, ?) AS grade, COALESCE(c.name, '') AS "courseName", se.status,
        se.start_date AS "startDate", se.end_date AS "endDate"
      FROM student_enrollments se LEFT JOIN courses c ON c.id = se.course_id AND c.school_id = se.school_id
      WHERE se.school_id = ? AND se.student_id = ?
      UNION ALL
      SELECT NULL AS "enrollmentId", c.id AS "courseId", c.academic_year AS "academicYear", c.grade, c.name AS "courseName",
        'Registro académico' AS status, '' AS "startDate", '' AS "endDate"
      FROM courses c WHERE c.school_id = ? AND (EXISTS (SELECT 1 FROM grade_assessments a JOIN student_grades sg ON sg.assessment_id = a.id WHERE a.course_id = c.id AND sg.student_id = ?)
        OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.course_id = c.id AND ar.student_id = ?))
        AND NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.course_id = c.id AND se.academic_year = c.academic_year)
      ORDER BY "academicYear" DESC, grade, "courseName"`, student.grade, user.school_id, studentId, user.school_id, studentId, studentId, studentId)
    return json(response, 200, { records })
  }
  if (url.pathname === '/api/certificates' && method === 'GET') {
    if (![...certificateRoles, 'acudiente'].includes(user.role)) return json(response, 403, { error: 'Las cuentas de estudiante no pueden consultar certificados ni constancias.' })
    const linkedOnly = user.role === 'acudiente'
    const history = await db.all(`SELECT d.id, d.certificate_number AS "certificateNumber", d.certificate_type AS "certificateType",
      d.student_id AS "studentId", d.student_name AS "studentName", d.student_document_type AS "studentDocumentType", d.student_document_number AS "studentDocumentNumber", d.student_document_issued_place AS "studentDocumentIssuedPlace", d.requester_name AS "requesterName", d.requester_role AS "requesterRole", d.grade, d.course_name_snapshot AS "courseNameSnapshot", d.academic_status_snapshot AS "academicStatusSnapshot", d.document_number AS "documentNumber", d.academic_year AS "academicYear", d.created_at AS "issuedAt", s.name AS "schoolName",
      d.status, d.rector_name AS "rectorName", d.signed_at AS "signedAt", d.annul_note AS "annulNote"
      FROM school_certificates d JOIN schools s ON s.id = d.school_id WHERE d.school_id = ? ${linkedOnly ? "AND d.status = 'Emitida' AND EXISTS (SELECT 1 FROM user_students us WHERE us.user_id = ? AND us.student_id = d.student_id)" : "AND d.status <> 'Anulada'"}
      ORDER BY d.created_at DESC LIMIT 100`, ...(linkedOnly ? [user.school_id, user.id] : [user.school_id]))
    return json(response, 200, { certificates: history })
  }
  const certificateMatch = url.pathname.match(/^\/api\/certificates\/([0-9a-f-]{36})$/i)
  if (certificateMatch && method === 'GET') {
    if (![...certificateRoles, 'acudiente'].includes(user.role)) return json(response, 403, { error: 'Las cuentas de estudiante no pueden consultar certificados ni constancias.' })
    const certificate = await db.get(`SELECT d.id, d.certificate_number AS "certificateNumber", d.certificate_type AS "certificateType",
      d.student_id AS "studentId", d.student_name AS "studentName", d.student_document_type AS "studentDocumentType", d.student_document_number AS "studentDocumentNumber", d.student_document_issued_place AS "studentDocumentIssuedPlace", d.requester_name AS "requesterName", d.requester_role AS "requesterRole", d.grade, d.course_name_snapshot AS "courseNameSnapshot", d.academic_status_snapshot AS "academicStatusSnapshot", d.document_number AS "documentNumber", d.academic_year AS "academicYear", d.created_at AS "issuedAt",
      d.rector_name AS "rectorName", d.signed_at AS "signedAt", d.status, d.verification_code AS "verificationCode", d.signature_snapshot AS "signatureSnapshot",
      s.name AS "schoolName", s.slug AS "schoolSlug", s.primary_color AS "primaryColor", (s.logo_content_type IS NOT NULL) AS "hasLogo", s.address, s.contact_email AS "contactEmail", s.contact_phone AS "contactPhone"
      FROM school_certificates d JOIN schools s ON s.id = d.school_id WHERE d.id = ? AND d.school_id = ? AND d.status = 'Emitida'`, certificateMatch[1], user.school_id)
    if (!certificate) return json(response, 404, { error: 'No encontramos esa constancia.' })
    if (user.role === 'acudiente' && !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, certificate.studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    let signatures = []
    try { signatures = JSON.parse(certificate.signatureSnapshot || '[]') } catch {}
    return json(response, 200, { certificate: { ...certificate, signatures } })
  }
  if (url.pathname === '/api/certificates' && method === 'POST') {
    if (user.role !== 'acudiente') return json(response, 403, { error: 'Solo el acudiente o padre autorizado puede solicitar certificados o constancias.' })
    const body = await readBody(request), studentId = String(body.studentId || ''), type = String(body.certificateType || ''), academicYearInput = String(body.academicYear || '').trim(), replacesId = String(body.replacesCertificateId || ''), enrollmentIdInput = String(body.enrollmentId || ''), courseIdInput = String(body.courseId || '')
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || !['Constancia de estudio', 'Constancia de matrícula', 'Certificado académico'].includes(type) || academicYearInput && !academicYearStart(academicYearInput) || replacesId && !/^[0-9a-f-]{36}$/i.test(replacesId) || enrollmentIdInput && !/^[0-9a-f-]{36}$/i.test(enrollmentIdInput) || courseIdInput && !/^[0-9a-f-]{36}$/i.test(courseIdInput)) return json(response, 400, { error: 'Revisa estudiante, curso, grado y año lectivo.' })
    const student = await db.get("SELECT st.id, st.full_name AS name, st.grade, st.status, st.document, st.document_type AS \"documentType\", st.document_issued_place AS \"documentIssuedPlace\", st.school_id AS schoolId FROM students st WHERE st.id = ? AND st.school_id = ? AND st.status = 'Activo'", studentId, user.school_id)
    if (!student) return json(response, 404, { error: 'No encontramos un estudiante activo en este colegio.' })
    const activeEnrollment = await db.get("SELECT id FROM student_enrollments WHERE school_id = ? AND student_id = ? AND status = 'Activa' LIMIT 1", user.school_id, studentId)
    if (!activeEnrollment) return json(response, 409, { error: 'Este registro no tiene una matrícula aprobada activa. La institución debe completar o corregir el proceso en Matrículas antes de emitir documentos.' })
    if (user.role === 'acudiente' && !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    if (!student.documentType || !student.documentIssuedPlace) return json(response, 409, { error: 'Completa en Estudiantes el tipo de documento y el municipio/departamento donde fue expedido antes de solicitar la constancia.' })
    let academicRecord = null
    if (enrollmentIdInput) academicRecord = await db.get(`SELECT se.id AS "enrollmentId", se.course_id AS "courseId", se.academic_year AS "academicYear", COALESCE(c.grade, ?) AS grade, COALESCE(c.name, '') AS "courseName", se.status
      FROM student_enrollments se LEFT JOIN courses c ON c.id = se.course_id AND c.school_id = se.school_id WHERE se.id = ? AND se.school_id = ? AND se.student_id = ?`, student.grade, enrollmentIdInput, user.school_id, studentId)
    else if (courseIdInput) academicRecord = await db.get(`SELECT se.id AS "enrollmentId", c.id AS "courseId", c.academic_year AS "academicYear", c.grade, c.name AS "courseName", COALESCE(se.status, 'Registro académico') AS status
      FROM courses c LEFT JOIN student_enrollments se ON se.school_id = c.school_id AND se.student_id = ? AND se.course_id = c.id AND se.academic_year = c.academic_year
      WHERE c.id = ? AND c.school_id = ? AND (se.id IS NOT NULL OR EXISTS (SELECT 1 FROM grade_assessments a JOIN student_grades sg ON sg.assessment_id = a.id WHERE a.course_id = c.id AND sg.student_id = ?)
        OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.course_id = c.id AND ar.student_id = ?))`, studentId, courseIdInput, user.school_id, studentId, studentId)
    else academicRecord = await db.get(`SELECT se.id AS "enrollmentId", se.course_id AS "courseId", se.academic_year AS "academicYear", COALESCE(c.grade, ?) AS grade, COALESCE(c.name, '') AS "courseName", se.status
      FROM student_enrollments se LEFT JOIN courses c ON c.id = se.course_id AND c.school_id = se.school_id WHERE se.school_id = ? AND se.student_id = ? AND se.status = 'Activa' ORDER BY se.start_date DESC LIMIT 1`, student.grade, user.school_id, studentId)
    if ((enrollmentIdInput || courseIdInput) && !academicRecord) return json(response, 400, { error: 'El grado seleccionado no tiene una matrícula o registro académico válido para este estudiante.' })
    if (academicYearInput && academicRecord?.academicYear && academicYearStart(academicYearInput) !== academicYearStart(academicRecord.academicYear)) return json(response, 400, { error: 'El año lectivo debe corresponder al grado seleccionado.' })
    const academicYear = academicRecord?.academicYear || academicYearInput || `${new Date().getFullYear()}`
    const gradeSnapshot = academicRecord?.grade || student.grade
    const courseNameSnapshot = academicRecord?.courseName || ''
    if (replacesId) {
      const original = await db.get("SELECT id, student_id AS \"studentId\", status FROM school_certificates WHERE id = ? AND school_id = ?", replacesId, user.school_id)
      if (!original || original.status !== 'Emitida' || original.studentId !== studentId) return json(response, 409, { error: 'Solo puedes solicitar corrección de una constancia vigente de este estudiante.' })
    }
    const rectors = await db.all("SELECT id FROM users WHERE school_id = ? AND role = 'rectoria' AND is_active = 1 AND deleted_at IS NULL", user.school_id)
    if (!rectors.length) return json(response, 409, { error: 'El colegio debe tener una cuenta activa con rol de Rectoría para revisar solicitudes.' })
    const id = randomUUID()
    await db.run(`INSERT INTO school_certificate_requests (id, school_id, student_id, enrollment_id, course_id, grade_snapshot, course_name_snapshot, academic_status_snapshot, certificate_type, academic_year, requested_by, requester_role, replaces_certificate_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, user.school_id, studentId, academicRecord?.enrollmentId || null, academicRecord?.courseId || null, gradeSnapshot, courseNameSnapshot, academicRecord?.status || 'Registro actual', type, academicYear, user.id, user.role, replacesId || null)
    for (const rector of rectors) await db.run("INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module, target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", randomUUID(), user.school_id, rector.id, 'Solicitud de constancia pendiente', `${student.name} · ${type}`, 'certificate', 'Certificados y constancias', id)
    await sendPushNotifications(user.school_id, rectors.map(item => item.id), 'Solicitud de constancia pendiente', 'Hay un documento escolar pendiente para revisión en EDUCA.', 'certificate', id, id)
    await sendEmailToUsers(user.school_id, rectors.map(item => item.id), 'Solicitud de documento escolar pendiente', `Hay una solicitud de ${type} para ${student.name}.\nGrado: ${gradeSnapshot}${courseNameSnapshot ? ` · ${courseNameSnapshot}` : ''}. Año lectivo: ${academicYear}.\nIngresa a EDUCA para revisar y aprobar o rechazar la solicitud.`)
    await sendEmailToUsers(user.school_id, [user.id], 'Recibimos tu solicitud de documento', `Tu solicitud de ${type} para ${student.name} quedó registrada y pendiente de revisión por rectoría.\nGrado: ${gradeSnapshot}${courseNameSnapshot ? ` · ${courseNameSnapshot}` : ''} · Año lectivo: ${academicYear}.`)
    await logAudit(user.school_id, user.id, 'certificate_request_created')
    return json(response, 201, { request: { id, studentId, certificateType: type, academicYear, grade: gradeSnapshot, courseName: courseNameSnapshot, status: 'Pendiente' } })
  }
  if (url.pathname === '/api/certificate-requests' && method === 'GET') {
    if (![...certificateRoles, 'acudiente'].includes(user.role)) return json(response, 403, { error: 'Las cuentas de estudiante no pueden consultar solicitudes de certificados o constancias.' })
    const family = user.role === 'acudiente'
    const requests = await db.all(`SELECT r.id, r.student_id AS "studentId", st.full_name AS "studentName", COALESCE(NULLIF(r.grade_snapshot, ''), st.grade) AS grade,
      r.grade_snapshot AS "gradeSnapshot", r.course_id AS "courseId", r.course_name_snapshot AS "courseNameSnapshot", r.academic_status_snapshot AS "academicStatusSnapshot", r.enrollment_id AS "enrollmentId",
      r.certificate_type AS "certificateType", r.academic_year AS "academicYear", r.status, r.review_note AS "reviewNote",
      r.created_at AS "createdAt", u.full_name AS "requestedByName", CASE WHEN r.requester_role <> '' THEN r.requester_role ELSE u.role END AS "requestedByRole", r.requested_by AS "requestedBy",
      st.document, st.document_type AS "documentType", st.document_issued_place AS "documentIssuedPlace",
      r.replaces_certificate_id AS "replacesCertificateId", c.certificate_number AS "replacesCertificateNumber"
      FROM school_certificate_requests r JOIN students st ON st.id = r.student_id JOIN users u ON u.id = r.requested_by
      LEFT JOIN school_certificates c ON c.id = r.replaces_certificate_id
      WHERE r.school_id = ? AND r.status <> 'Eliminada' ${family ? 'AND r.requested_by = ?' : ''} ORDER BY r.created_at DESC LIMIT 200`, ...(family ? [user.school_id, user.id] : [user.school_id]))
    return json(response, 200, { requests })
  }
  const certRequestMatch = url.pathname.match(/^\/api\/certificate-requests\/([0-9a-f-]{36})$/i)
  if (certRequestMatch && method === 'PATCH') {
    const id = certRequestMatch[1], body = await readBody(request)
    const requestRow = await db.get('SELECT * FROM school_certificate_requests WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!requestRow) return json(response, 404, { error: 'No encontramos esa solicitud.' })
    if (user.role === 'estudiante') return json(response, 403, { error: 'Solo el acudiente que hizo la solicitud o rectoría pueden modificarla.' })
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
            const student = await tx.get("SELECT id, full_name AS name, grade, document, document_type AS \"documentType\", document_issued_place AS \"documentIssuedPlace\" FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", current.student_id, user.school_id)
            if (!student) throw Object.assign(new Error('El estudiante ya no está activo; no se puede emitir el documento.'), { status: 409 })
            if (!student.documentType || !student.documentIssuedPlace) throw Object.assign(new Error('Completa el tipo y lugar de expedición del documento de identidad del estudiante antes de aprobar.'), { status: 409 })
            // An active student is considered enrolled by the institution even
            // when no separate student_enrollments row exists for that year.
            const prior = current.replaces_certificate_id ? await tx.get("SELECT id FROM school_certificates WHERE id = ? AND school_id = ? AND status = 'Emitida'", current.replaces_certificate_id, user.school_id) : null
            if (current.replaces_certificate_id && !prior) throw Object.assign(new Error('La constancia que se quería corregir ya no está vigente.'), { status: 409 })
            const issuedAt = new Date().toISOString(), certificateNumber = await nextDocumentNumber(tx, user.school_id, 'CERT', current.academic_year), verificationCode = randomUUID()
            const signatureSnapshot = await resolveDocumentSigners(user.school_id, current.certificate_type === 'Certificado académico' ? 'academic_certificate' : 'study_certificate')
            if (!signatureSnapshot.length) signatureSnapshot.push({ fullName: user.full_name, positionTitle: 'Rector(a)', signature: null })
            const rectorName = signatureSnapshot[0]?.fullName || user.full_name
            const requester = await tx.get('SELECT full_name AS "requesterName" FROM users WHERE id = ? AND school_id = ?', current.requested_by, user.school_id)
            certificateId = randomUUID()
            await tx.run(`INSERT INTO school_certificates (id, school_id, student_id, enrollment_id, course_id, grade_snapshot, course_name_snapshot, academic_status_snapshot, document_number, certificate_number, verification_code, signature_snapshot, certificate_type, student_name, student_document_type, student_document_number, student_document_issued_place, requester_name, requester_role, grade, academic_year, issued_by, status, rector_user_id, rector_name, signed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Emitida', ?, ?, ?)`, certificateId, user.school_id, current.student_id, current.enrollment_id || null, current.course_id || null, current.grade_snapshot || student.grade, current.course_name_snapshot || '', current.academic_status_snapshot || '', certificateNumber, certificateNumber, verificationCode, JSON.stringify(signatureSnapshot), current.certificate_type, student.name, student.documentType, student.document, student.documentIssuedPlace, requester?.requesterName || '', current.requester_role || '', current.grade_snapshot || student.grade, current.academic_year, user.id, user.id, rectorName, issuedAt)
            if (prior) {
              await tx.run("UPDATE school_certificates SET status = 'Reemplazada', replaced_by_id = ? WHERE id = ? AND school_id = ?", certificateId, prior.id, user.school_id)
              await tx.run("UPDATE document_control_registry SET status = 'Reemplazada' WHERE school_id = ? AND document_type = 'CERT' AND reference_id = ?", user.school_id, prior.id)
            }
            await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'CERT', documentNumber: certificateNumber, referenceId: certificateId, studentId: current.student_id, studentName: student.name, academicYear: current.academic_year, status: 'Emitida', createdBy: user.id, createdAt: issuedAt })
            issuedCertificate = { id: certificateId, certificateNumber }
          }
          await tx.run('UPDATE school_certificate_requests SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND school_id = ?', decision, note, user.id, new Date().toISOString(), id, user.school_id)
          const recipient = await tx.get('SELECT requested_by FROM school_certificate_requests WHERE id = ?', id)
          await tx.run("INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module, target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", randomUUID(), user.school_id, recipient.requested_by, `Solicitud ${decision.toLocaleLowerCase('es')}`, note || 'La constancia fue aprobada y quedó disponible.', 'certificate', 'Certificados y constancias', certificateId || id)
        })
      } catch (error) { if (error.status) return json(response, error.status, { error: error.message }); throw error }
      await sendPushNotifications(user.school_id, [requestRow.requested_by], `Solicitud ${decision.toLocaleLowerCase('es')}`, 'Ingresa a EDUCA para consultar el resultado.', 'certificate', issuedCertificate?.id || id)
      const reviewedStudent = await db.get('SELECT full_name AS name FROM students WHERE id = ? AND school_id = ?', requestRow.student_id, user.school_id)
      await sendEmailToUsers(user.school_id, [requestRow.requested_by], `${requestRow.certificate_type}: solicitud ${decision.toLocaleLowerCase('es')}`, `La solicitud para ${reviewedStudent?.name || 'el estudiante'} fue ${decision.toLocaleLowerCase('es')} por rectoría.\nGrado: ${requestRow.grade_snapshot || 'No especificado'} · Año lectivo: ${requestRow.academic_year}.${issuedCertificate?.certificateNumber ? `\nFolio del documento: ${issuedCertificate.certificateNumber}.` : ''}${note ? `\nObservación: ${note}` : ''}\nIngresa a EDUCA para consultar el estado y el documento.`)
      await logAudit(user.school_id, user.id, `certificate_request_${decision === 'Aprobada' ? 'approved' : 'rejected'}`)
      return json(response, 200, { status: decision, certificateId: issuedCertificate?.id })
    }
    if (!['admin', 'rectoria'].includes(user.role) && requestRow.requested_by !== user.id) return json(response, 403, { error: 'Solo quien solicitó o rectoría puede editar una solicitud.' })
    if (requestRow.status !== 'Pendiente') return json(response, 409, { error: 'Solo se pueden editar solicitudes pendientes.' })
    const type = String(body.certificateType || requestRow.certificate_type), enrollmentId = String(body.enrollmentId || ''), courseId = String(body.courseId || '')
    if (!['Constancia de estudio', 'Constancia de matrícula', 'Certificado académico'].includes(type) || enrollmentId && !/^[0-9a-f-]{36}$/i.test(enrollmentId) || courseId && !/^[0-9a-f-]{36}$/i.test(courseId)) return json(response, 400, { error: 'Revisa tipo de documento y grado seleccionado.' })
    let academicRecord = null
    if (enrollmentId) academicRecord = await db.get(`SELECT se.id AS "enrollmentId", se.course_id AS "courseId", se.academic_year AS "academicYear", COALESCE(c.grade, st.grade) AS grade, COALESCE(c.name, '') AS "courseName"
      FROM student_enrollments se JOIN students st ON st.id = se.student_id LEFT JOIN courses c ON c.id = se.course_id WHERE se.id = ? AND se.school_id = ? AND se.student_id = ?`, enrollmentId, user.school_id, requestRow.student_id)
    else if (courseId) academicRecord = await db.get(`SELECT se.id AS "enrollmentId", c.id AS "courseId", c.academic_year AS "academicYear", c.grade, c.name AS "courseName"
      FROM courses c LEFT JOIN student_enrollments se ON se.school_id = c.school_id AND se.student_id = ? AND se.course_id = c.id AND se.academic_year = c.academic_year
      WHERE c.id = ? AND c.school_id = ? AND (se.id IS NOT NULL OR EXISTS (SELECT 1 FROM grade_assessments a JOIN student_grades sg ON sg.assessment_id = a.id WHERE a.course_id = c.id AND sg.student_id = ?)
        OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.course_id = c.id AND ar.student_id = ?))`, requestRow.student_id, courseId, user.school_id, requestRow.student_id, requestRow.student_id)
    if ((enrollmentId || courseId) && !academicRecord) return json(response, 400, { error: 'El grado seleccionado no tiene una matrícula o registro académico válido.' })
    const academicYear = academicRecord?.academicYear || String(body.academicYear || requestRow.academic_year)
    if (!academicYearStart(academicYear) || body.academicYear && academicYearStart(body.academicYear) !== academicYearStart(academicYear)) return json(response, 400, { error: 'El año lectivo debe corresponder al grado seleccionado.' })
    const gradeSnapshot = academicRecord?.grade || requestRow.grade_snapshot || (await db.get('SELECT grade FROM students WHERE id = ?', requestRow.student_id))?.grade || ''
    await db.run(`UPDATE school_certificate_requests SET certificate_type = ?, academic_year = ?, enrollment_id = ?, course_id = ?, grade_snapshot = ?, course_name_snapshot = ?, academic_status_snapshot = ? WHERE id = ? AND school_id = ? AND status = ?`, type, academicYear, academicRecord?.enrollmentId || null, academicRecord?.courseId || null, gradeSnapshot, academicRecord?.courseName || '', academicRecord?.status || 'Registro académico', id, user.school_id, 'Pendiente')
    await logAudit(user.school_id, user.id, 'certificate_request_updated')
    const studentName = (await db.get('SELECT full_name AS name FROM students WHERE id = ? AND school_id = ?', requestRow.student_id, user.school_id))?.name || 'el estudiante'
    const notificationRecipients = user.id === requestRow.requested_by
      ? (await db.all("SELECT id FROM users WHERE school_id = ? AND role = 'rectoria' AND is_active = 1 AND deleted_at IS NULL", user.school_id)).map(item => item.id)
      : [requestRow.requested_by]
    await sendEmailToUsers(user.school_id, notificationRecipients, 'Solicitud de documento actualizada', `La solicitud de ${type} para ${studentName} fue modificada.\nGrado: ${gradeSnapshot}${academicRecord?.courseName ? ` · ${academicRecord.courseName}` : ''} · Año lectivo: ${academicYear}.\nIngresa a EDUCA para revisar los datos actualizados.`)
    return json(response, 200, { id, status: 'Pendiente', certificateType: type, academicYear })
  }
  if (certRequestMatch && method === 'DELETE') {
    const row = await db.get('SELECT requested_by, status FROM school_certificate_requests WHERE id = ? AND school_id = ?', certRequestMatch[1], user.school_id)
    if (!row) return json(response, 404, { error: 'No encontramos esa solicitud.' })
    if (user.role === 'estudiante') return json(response, 403, { error: 'Solo el acudiente que hizo la solicitud o rectoría pueden cancelarla.' })
    if (['admin', 'rectoria'].includes(user.role)) {
      await db.run("UPDATE school_certificate_requests SET status = 'Eliminada', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND school_id = ?", `Eliminada por ${user.full_name}`, user.id, new Date().toISOString(), certRequestMatch[1], user.school_id)
      await logAudit(user.school_id, user.id, 'certificate_request_deleted')
      await sendEmailToUsers(user.school_id, [row.requested_by], 'Solicitud de documento eliminada', 'Rectoría o administración eliminó una solicitud de constancia o certificado. Ingresa a EDUCA o contacta a la institución si necesitas más información.')
      return json(response, 200, { status: 'Eliminada' })
    }
    if (row.requested_by !== user.id) return json(response, 403, { error: 'Solo quien solicitó o rectoría puede cancelar esta solicitud.' })
    if (row.status !== 'Pendiente') return json(response, 409, { error: 'Solo se pueden cancelar solicitudes pendientes.' })
    await db.run("UPDATE school_certificate_requests SET status = 'Cancelada' WHERE id = ? AND school_id = ?", certRequestMatch[1], user.school_id)
    await logAudit(user.school_id, user.id, 'certificate_request_cancelled')
    const reviewers = await db.all("SELECT id FROM users WHERE school_id = ? AND role = 'rectoria' AND is_active = 1 AND deleted_at IS NULL", user.school_id)
    await sendEmailToUsers(user.school_id, reviewers.map(item => item.id), 'Solicitud de documento cancelada', 'El acudiente canceló una solicitud pendiente de constancia o certificado. Ingresa a EDUCA para consultar el registro.')
    return json(response, 200, { status: 'Cancelada' })
  }
  if (certificateMatch && method === 'DELETE') {
    if (!['admin', 'rectoria'].includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden anular constancias emitidas.' })
    const body = await readBody(request), reason = String(body.reason || '').trim()
    if (reason.length < 3 || reason.length > 500) return json(response, 400, { error: 'Indica el motivo de anulación.' })
    const certificate = await db.get(`SELECT student_id AS "studentId", student_name AS "studentName", certificate_type AS "certificateType",
      document_number AS "documentNumber", academic_year AS "academicYear", issued_by AS "issuedBy"
      FROM school_certificates WHERE id = ? AND school_id = ? AND status = 'Emitida'`, certificateMatch[1], user.school_id)
    if (!certificate) return json(response, 404, { error: 'No encontramos una constancia vigente para anular.' })
    const result = await db.run("UPDATE school_certificates SET status = 'Anulada', annul_note = ?, annulled_by = ?, annulled_at = ? WHERE id = ? AND school_id = ? AND status = 'Emitida'", reason, user.id, new Date().toISOString(), certificateMatch[1], user.school_id)
    if (!result.changes && !result.rowCount) return json(response, 404, { error: 'No encontramos una constancia vigente para anular.' })
    await db.run("UPDATE document_control_registry SET status = 'Anulada' WHERE school_id = ? AND document_type = 'CERT' AND reference_id = ?", user.school_id, certificateMatch[1])
    await logAudit(user.school_id, user.id, 'school_certificate_annulled')
    const linkedAccounts = await db.all('SELECT user_id AS id FROM user_students WHERE student_id = ?', certificate.studentId)
    await sendEmailToUsers(user.school_id, [...linkedAccounts.map(item => item.id), certificate.issuedBy].filter(id => id && id !== user.id), 'Documento escolar anulado', `El documento ${certificate.documentNumber} (${certificate.certificateType}) de ${certificate.studentName}, año lectivo ${certificate.academicYear}, fue anulado por rectoría o administración.\nMotivo: ${reason}\nEl documento ya no está vigente. Si necesitas información, contacta a la institución.`)
    return json(response, 200, { status: 'Anulada' })
  }
  if (url.pathname.startsWith('/api/institutional-staff') && !institutionalManagerRoles.includes(user.role)) return json(response, 403, { error: 'Solo administración o rectoría pueden gestionar personal y firmas institucionales.' })
  if (url.pathname === '/api/institutional-staff' && method === 'GET') {
    const staff = await db.all(`SELECT p.id, p.user_id AS "userId", p.full_name AS "fullName", p.national_id AS "nationalId", p.position_key AS "positionKey", p.position_title AS "positionTitle", p.email, p.phone, p.department, p.signature_file_name AS "signatureFileName", (p.signature_data IS NOT NULL AND p.signature_content_type = 'image/png' AND (u.profile_photo_data IS NULL OR p.signature_data <> u.profile_photo_data)) AS "hasSignature", (u.profile_photo_data IS NOT NULL) AS "hasPhoto", p.is_active AS "isActive"
      FROM institutional_staff p LEFT JOIN users u ON u.id = p.user_id AND u.school_id = p.school_id WHERE p.school_id = ? ORDER BY p.is_active DESC, p.position_title, p.full_name`, user.school_id)
    for (const item of staff) item.courses = (await db.all('SELECT course_id AS "courseId" FROM institutional_staff_courses WHERE staff_id = ?', item.id)).map(row => row.courseId)
    const courses = await db.all('SELECT id, name, grade, academic_year AS "academicYear", is_active AS "isActive" FROM courses WHERE school_id = ? ORDER BY academic_year DESC, grade, name', user.school_id)
    const directors = await db.all('SELECT course_id AS "courseId", staff_id AS "staffId" FROM course_group_directors WHERE school_id = ?', user.school_id)
    const rules = await db.all(`SELECT document_type AS "documentType", primary_position AS "primaryPosition", secondary_position AS "secondaryPosition", primary_staff_id AS "primaryStaffId", secondary_staff_id AS "secondaryStaffId"
      FROM document_signature_rules WHERE school_id = ? ORDER BY document_type`, user.school_id)
    const accounts = await db.all(`SELECT id, full_name AS "fullName", email, role, contact_phone AS phone FROM users
      WHERE school_id = ? AND role IN ('admin','rectoria','coordinacion','secretaria','docente','orientacion','tesoreria')
        AND is_active = 1 AND deleted_at IS NULL ORDER BY full_name`, user.school_id)
    const school = await db.get('SELECT name, slug, address, contact_email AS "contactEmail", contact_phone AS "contactPhone", primary_color AS "primaryColor", (logo_content_type IS NOT NULL) AS "hasLogo" FROM schools WHERE id = ?', user.school_id)
    return json(response, 200, { staff: staff.map(item => ({ ...item, isActive: Boolean(item.isActive), hasSignature: Boolean(item.hasSignature) })), courses: courses.map(item => ({ ...item, isActive: Boolean(item.isActive) })), directors, rules, accounts, school, issuerUserId: user.id, issuerName: user.full_name, issuerRole: user.role })
  }
  if (url.pathname === '/api/institutional-staff/certifications' && method === 'GET') {
    const records = await db.all(`SELECT c.id, c.document_number AS "documentNumber", c.certificate_type AS "certificateType", c.academic_year AS "academicYear", c.issuer_name AS "issuerName", c.issuer_title AS "issuerTitle", c.signature_snapshot AS "signatureSnapshot", c.status, c.created_at AS "createdAt", p.id AS "staffId", p.full_name AS "staffName", p.national_id AS "nationalId", p.position_title AS "positionTitle", p.department
      FROM staff_certifications c JOIN institutional_staff p ON p.id = c.staff_id WHERE c.school_id = ? ORDER BY c.created_at DESC LIMIT 200`, user.school_id)
    return json(response, 200, { records: records.map(record => { let signature = null; try { signature = record.signatureSnapshot ? JSON.parse(record.signatureSnapshot) : null } catch {} return { ...record, issuerSignature: signature?.dataUrl || '' } }) })
  }
  const staffCertificationMatch = url.pathname.match(/^\/api\/institutional-staff\/certifications\/([0-9a-f-]{36})$/i)
  if (staffCertificationMatch && method === 'DELETE') {
    if (user.role !== 'admin') return json(response, 403, { error: 'Solo el administrador puede eliminar definitivamente constancias de personal.' })
    const certification = await db.get('SELECT id FROM staff_certifications WHERE id = ? AND school_id = ?', staffCertificationMatch[1], user.school_id)
    if (!certification) return json(response, 404, { error: 'No encontramos esa constancia de personal.' })
    await db.transaction(async tx => {
      await tx.run("DELETE FROM document_control_registry WHERE school_id = ? AND document_type = 'PERS' AND reference_id = ?", user.school_id, certification.id)
      await tx.run('DELETE FROM staff_certifications WHERE id = ? AND school_id = ?', certification.id, user.school_id)
    })
    await logAudit(user.school_id, user.id, 'staff_certification_deleted')
    return json(response, 200, { deleted: true })
  }
  if (url.pathname === '/api/institutional-staff/certifications' && method === 'POST') {
    const body = await readBody(request), staffId = String(body.staffId || ''), certificateType = String(body.certificateType || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(staffId) || !['Constancia laboral', 'Certificación de cargo'].includes(certificateType)) return json(response, 400, { error: 'Selecciona un funcionario y un tipo de constancia válido.' })
    const person = await db.get(`SELECT id, full_name AS "fullName", position_title AS "positionTitle", national_id AS "nationalId", department FROM institutional_staff WHERE id = ? AND school_id = ? AND is_active = 1`, staffId, user.school_id)
    if (!person) return json(response, 404, { error: 'El funcionario seleccionado no está activo en esta institución.' })
    const issuer = await db.get(`SELECT id, full_name AS "fullName", position_title AS "positionTitle", signature_data AS "signatureData", signature_content_type AS "signatureContentType"
      FROM institutional_staff WHERE user_id = ? AND school_id = ? AND is_active = 1`, user.id, user.school_id)
    if (!issuer?.signatureData || issuer.signatureContentType !== 'image/png') return json(response, 409, { error: 'Para emitir una constancia, vincula tu cuenta en Personal Institucional y Firmas y carga tu firma PNG.' })
    const schoolYear = String(new Date().getFullYear()), id = randomUUID(), documentNumber = await nextDocumentNumber(db, user.school_id, 'PERS', schoolYear)
    const issuerName = issuer.fullName, issuerTitle = issuer.positionTitle, signatureBuffer = Buffer.from(issuer.signatureData)
    const signatureSnapshot = JSON.stringify({ dataUrl: `data:image/png;base64,${signatureBuffer.toString('base64')}`, signerId: issuer.id, signerName: issuerName, signerTitle: issuerTitle, signedAt: new Date().toISOString() })
    await db.transaction(async tx => {
      await tx.run(`INSERT INTO staff_certifications (id, school_id, staff_id, document_number, certificate_type, academic_year, issuer_user_id, issuer_name, issuer_title, signature_snapshot, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Emitida')`, id, user.school_id, person.id, documentNumber, certificateType, schoolYear, user.id, issuerName, issuerTitle, signatureSnapshot)
      await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'PERS', documentNumber, referenceId: id, studentName: person.fullName, academicYear: schoolYear, status: 'Emitida', createdBy: user.id })
    })
    await logAudit(user.school_id, user.id, 'staff_certification_issued')
    return json(response, 201, { id, documentNumber, certificateType, academicYear: schoolYear, createdAt: new Date().toISOString(), staffId: person.id, staffName: person.fullName, nationalId: person.nationalId, positionTitle: person.positionTitle, department: person.department, issuerName, issuerTitle, issuerSignature: `data:image/png;base64,${signatureBuffer.toString('base64')}`, status: 'Emitida' })
  }
  const institutionalStaffMatch = url.pathname.match(/^\/api\/institutional-staff\/([0-9a-f-]{36})$/i)
  if ((url.pathname === '/api/institutional-staff' && method === 'POST') || (institutionalStaffMatch && method === 'PUT')) {
    const body = await readLargeJsonBody(request, 900 * 1024)
    const fullName = String(body.fullName || '').trim(), nationalId = String(body.nationalId || '').trim().slice(0, 40), positionKey = String(body.positionKey || ''), positionTitle = String(body.positionTitle || '').trim().slice(0, 80)
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254), phone = String(body.phone || '').trim().slice(0, 40), department = String(body.department || '').trim().slice(0, 100)
    const courseIds = Array.isArray(body.courseIds) ? [...new Set(body.courseIds.map(String))].slice(0, 100) : []
    const userId = body.userId ? String(body.userId) : null
    const signature = body.removeSignature ? null : parseInstitutionalSignature(body.signature)
    if (fullName.length < 3 || fullName.length > 120 || nationalId.length < 4 || !signerPositions.has(positionKey) || positionTitle.length < 2 || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: 'Revisa nombre, identificación, cargo y correo del funcionario.' })
    if (body.signature && !body.removeSignature && !signature) return json(response, 400, { error: 'La firma debe ser un archivo PNG válido de hasta 512 KB.' })
    const current = method === 'PUT' ? await db.get('SELECT id FROM institutional_staff WHERE id = ? AND school_id = ?', institutionalStaffMatch[1], user.school_id) : null
    if (method === 'PUT' && !current) return json(response, 404, { error: 'No encontramos ese funcionario en esta institución.' })
    if (userId) {
      const linkedAccount = await db.get("SELECT id FROM users WHERE id = ? AND school_id = ? AND is_active = 1 AND deleted_at IS NULL AND role IN ('admin','rectoria','coordinacion','secretaria','docente','orientacion','tesoreria')", userId, user.school_id)
      if (!linkedAccount) return json(response, 400, { error: 'Selecciona una cuenta activa del personal de esta institución.' })
      const duplicateLink = await db.get('SELECT id FROM institutional_staff WHERE school_id = ? AND user_id = ? AND id <> ?', user.school_id, userId, current?.id || '')
      if (duplicateLink) return json(response, 409, { error: 'Esa cuenta ya está vinculada a otro perfil institucional.' })
    }
    if (courseIds.length && Number((await db.get(`SELECT COUNT(*) AS count FROM courses WHERE school_id = ? AND id IN (${courseIds.map(() => '?').join(',')})`, user.school_id, ...courseIds)).count) !== courseIds.length) return json(response, 400, { error: 'Uno o más cursos no pertenecen a esta institución.' })
    const id = current?.id || randomUUID()
    const signatureFields = signature ? [signature.contentType, signature.fileName, signature.data] : null
    try {
      await db.transaction(async tx => {
        if (current) {
          const clearSignature = body.removeSignature ? ', signature_content_type = NULL, signature_file_name = NULL, signature_data = NULL' : ''
          const setSignature = signature ? ', signature_content_type = ?, signature_file_name = ?, signature_data = ?' : ''
          await tx.run(`UPDATE institutional_staff SET user_id = ?, full_name = ?, national_id = ?, position_key = ?, position_title = ?, email = ?, phone = ?, department = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP${clearSignature}${setSignature} WHERE id = ? AND school_id = ?`, userId, fullName, nationalId, positionKey, positionTitle, email, phone, department, user.id, ...(signatureFields || []), id, user.school_id)
          await tx.run('DELETE FROM institutional_staff_courses WHERE staff_id = ?', id)
        } else {
          await tx.run('INSERT INTO institutional_staff (id, school_id, user_id, full_name, national_id, position_key, position_title, email, phone, department, signature_content_type, signature_file_name, signature_data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, userId, fullName, nationalId, positionKey, positionTitle, email, phone, department, signatureFields?.[0] || null, signatureFields?.[1] || null, signatureFields?.[2] || null, user.id, user.id)
        }
        for (const courseId of courseIds) await tx.run('INSERT INTO institutional_staff_courses (staff_id, course_id) VALUES (?, ?)', id, courseId)
      })
    } catch (error) {
      if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya existe un funcionario con esa identificación en esta institución.' })
      throw error
    }
    await logAudit(user.school_id, user.id, current ? 'institutional_staff_updated' : 'institutional_staff_created')
    return json(response, current ? 200 : 201, { id })
  }
  const groupDirectorMatch = url.pathname.match(/^\/api\/institutional-staff\/courses\/([0-9a-f-]{36})\/director$/i)
  if (groupDirectorMatch && method === 'PUT') {
    const body = await readBody(request), staffId = String(body.staffId || '')
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ?', groupDirectorMatch[1], user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos el curso en esta institución.' })
    if (!staffId) {
      await db.run('DELETE FROM course_group_directors WHERE course_id = ? AND school_id = ?', course.id, user.school_id)
      await logAudit(user.school_id, user.id, 'course_group_director_removed')
      return json(response, 200, { saved: true, staffId: null })
    }
    if (!await db.get('SELECT id FROM institutional_staff WHERE id = ? AND school_id = ? AND is_active = 1', staffId, user.school_id)) return json(response, 400, { error: 'Selecciona un funcionario activo del colegio.' })
    await db.run(`INSERT INTO course_group_directors (course_id, school_id, staff_id, assigned_by, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(course_id) DO UPDATE SET staff_id = excluded.staff_id, assigned_by = excluded.assigned_by, updated_at = CURRENT_TIMESTAMP`, course.id, user.school_id, staffId, user.id)
    await logAudit(user.school_id, user.id, 'course_group_director_assigned')
    return json(response, 200, { saved: true, staffId })
  }
  if (institutionalStaffMatch && method === 'PATCH') {
    const body = await readBody(request)
    if (typeof body.active !== 'boolean') return json(response, 400, { error: 'Indica si el funcionario debe quedar activo.' })
    const result = await db.run('UPDATE institutional_staff SET is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', body.active ? 1 : 0, user.id, institutionalStaffMatch[1], user.school_id)
    if ((result.rowCount ?? result.changes) === 0) return json(response, 404, { error: 'No encontramos ese funcionario en esta institución.' })
    await logAudit(user.school_id, user.id, body.active ? 'institutional_staff_activated' : 'institutional_staff_deactivated')
    return json(response, 200, { active: body.active })
  }
  if (institutionalStaffMatch && method === 'DELETE') {
    const staffId = institutionalStaffMatch[1]
    const staff = await db.get('SELECT id, full_name AS "fullName" FROM institutional_staff WHERE id = ? AND school_id = ?', staffId, user.school_id)
    if (!staff) return json(response, 404, { error: 'No encontramos ese perfil en esta institución.' })
    const issued = Number((await db.get('SELECT COUNT(*) AS count FROM staff_certifications WHERE staff_id = ? AND school_id = ?', staffId, user.school_id)).count)
    if (issued) return json(response, 409, { error: 'Este perfil tiene constancias oficiales emitidas. Desactívalo para conservar su historial documental.' })
    await db.transaction(async tx => {
      await tx.run('DELETE FROM course_group_directors WHERE staff_id = ? AND school_id = ?', staffId, user.school_id)
      await tx.run('DELETE FROM institutional_staff WHERE id = ? AND school_id = ?', staffId, user.school_id)
    })
    await logAudit(user.school_id, user.id, 'institutional_staff_deleted')
    return json(response, 200, { deleted: true, linkedAccountRetained: true })
  }
  const staffPhotoMatch = url.pathname.match(/^\/api\/institutional-staff\/([0-9a-f-]{36})\/photo$/i)
  if (staffPhotoMatch && method === 'GET') {
    const staff = await db.get(`SELECT p.user_id AS "userId", u.profile_photo_data AS data, u.profile_photo_content_type AS "contentType"
      FROM institutional_staff p LEFT JOIN users u ON u.id = p.user_id AND u.school_id = p.school_id
      WHERE p.id = ? AND p.school_id = ? AND p.is_active = 1`, staffPhotoMatch[1], user.school_id)
    if (!staff || (staff.userId !== user.id && !institutionalManagerRoles.includes(user.role))) return json(response, 403, { error: 'No tienes permiso para consultar esta foto.' })
    if (!staff.data || !['image/jpeg', 'image/png', 'image/webp'].includes(staff.contentType)) return json(response, 404, { error: 'No hay una foto de perfil disponible.' })
    response.writeHead(200, { 'Content-Type': staff.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
    return response.end(staff.data)
  }
  const staffSignatureMatch = url.pathname.match(/^\/api\/institutional-staff\/([0-9a-f-]{36})\/signature$/i)
  if (staffSignatureMatch && method === 'GET') {
    const staff = await db.get('SELECT signature_data AS data, signature_content_type AS "contentType" FROM institutional_staff WHERE id = ? AND school_id = ? AND is_active = 1', staffSignatureMatch[1], user.school_id)
    if (!staff?.data || staff.contentType !== 'image/png') return json(response, 404, { error: 'No hay firma activa disponible.' })
    response.writeHead(200, { 'Content-Type': staff.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    return response.end(staff.data)
  }
  if (url.pathname === '/api/institutional-staff/signature-rules' && method === 'PUT') {
    const body = await readBody(request), documentType = String(body.documentType || ''), primaryPosition = String(body.primaryPosition || ''), secondaryPosition = String(body.secondaryPosition || '')
    const primaryStaffId = body.primaryStaffId || null, secondaryStaffId = body.secondaryStaffId || null
    if (!documentSignatureTypes.has(documentType) || !signerPositions.has(primaryPosition) || secondaryPosition && !signerPositions.has(secondaryPosition)) return json(response, 400, { error: 'Revisa el tipo de documento y sus firmantes.' })
    for (const staffId of [primaryStaffId, secondaryStaffId].filter(Boolean)) if (!await db.get('SELECT id FROM institutional_staff WHERE id = ? AND school_id = ? AND is_active = 1', staffId, user.school_id)) return json(response, 400, { error: 'El firmante debe ser personal activo de esta institución.' })
    await db.run(`INSERT INTO document_signature_rules (school_id, document_type, primary_position, secondary_position, primary_staff_id, secondary_staff_id, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(school_id, document_type) DO UPDATE SET primary_position = excluded.primary_position, secondary_position = excluded.secondary_position, primary_staff_id = excluded.primary_staff_id, secondary_staff_id = excluded.secondary_staff_id, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`, user.school_id, documentType, primaryPosition, secondaryPosition, primaryStaffId, secondaryStaffId, user.id)
    await logAudit(user.school_id, user.id, 'document_signature_rule_updated')
    return json(response, 200, { saved: true })
  }
  if (url.pathname === '/api/teachers' && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar docentes.' })
    const teachers = await db.all("SELECT id, full_name AS name FROM users WHERE school_id = ? AND role = 'docente' AND is_active = 1 AND deleted_at IS NULL ORDER BY full_name", user.school_id)
    return json(response, 200, { teachers })
  }

  if (url.pathname === '/api/courses' && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar los cursos.' })
    const courses = await db.all(`SELECT c.id, c.name, c.grade, c.academic_year AS "academicYear", c.is_active AS "isActive",
      COUNT(DISTINCT ct.user_id) AS "teacherCount"
      FROM courses c LEFT JOIN course_teachers ct ON ct.course_id = c.id
      WHERE c.school_id = ? GROUP BY c.id ORDER BY c.academic_year DESC, c.grade`, user.school_id)
    const mapped = await Promise.all(courses.map(async course => ({ ...course, teacherCount: Number(course.teacherCount), teachers: await db.all(`SELECT u.id, u.full_name AS name, ct.subject
      FROM course_teachers ct JOIN users u ON u.id = ct.user_id WHERE ct.course_id = ? AND u.deleted_at IS NULL ORDER BY u.full_name, ct.subject`, course.id) })))
    return json(response, 200, { courses: mapped })
  }
  if (url.pathname === '/api/courses' && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear cursos.' })
    const body = await readBody(request)
    const name = String(body.name || '').trim()
    const grade = String(body.grade || '').trim()
    const academicYear = academicYearStart(body.academicYear)
    if (name.length < 2 || name.length > 80 || grade.length < 2 || grade.length > 40 || !academicYear) return json(response, 400, { error: 'Revisa el curso, el grado y el año lectivo (AAAA).' })
    const sameYearCourse = await db.get('SELECT id, name, is_active AS "isActive" FROM courses WHERE school_id = ? AND LEFT(academic_year, 4) = ? AND grade = ?', user.school_id, academicYear, grade)
    if (sameYearCourse?.isActive) return json(response, 409, { error: 'Ya existe un curso para ese grado y año lectivo.' })
    if (sameYearCourse) {
      await db.run('UPDATE courses SET name = ?, is_active = 1 WHERE id = ? AND school_id = ?', name, sameYearCourse.id, user.school_id)
      await logAudit(user.school_id, user.id, 'course_reactivated')
      return json(response, 200, { course: { id: sameYearCourse.id, name, grade, academicYear, isActive: 1 }, restored: true })
    }
    const id = randomUUID()
    try { await db.run('INSERT INTO courses (id, school_id, name, grade, academic_year) VALUES (?, ?, ?, ?, ?)', id, user.school_id, name, grade, academicYear) }
    catch (error) {
      if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) {
        const archived = await db.get('SELECT id FROM courses WHERE school_id = ? AND LEFT(academic_year, 4) = ? AND grade = ? AND is_active = 0', user.school_id, academicYear, grade)
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
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para editar cursos.' })
    const id = courseRecordMatch[1]
    const current = await db.get('SELECT id, name, grade, academic_year AS "academicYear" FROM courses WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!current) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    const body = await readBody(request)
    const name = String(body.name || '').trim()
    const grade = String(body.grade || '').trim()
    const academicYear = academicYearStart(body.academicYear)
    if (name.length < 2 || name.length > 80 || grade.length < 2 || grade.length > 40 || !academicYear) return json(response, 400, { error: 'Revisa el nombre, grado y año lectivo (AAAA).' })
    const storedYear = academicYear === academicYearStart(current.academicYear) ? current.academicYear : academicYear
    if ((grade !== current.grade || academicYear !== academicYearStart(current.academicYear)) && (Number((await db.get('SELECT COUNT(*) AS count FROM attendance_records WHERE course_id = ?', id)).count) > 0 || Number((await db.get('SELECT COUNT(*) AS count FROM grade_assessments WHERE course_id = ?', id)).count) > 0)) return json(response, 409, { error: 'Este curso ya tiene asistencia o evaluaciones. Para conservar su historial, solo puedes cambiar el nombre; crea otro curso si cambia el grado o año.' })
    try { await db.run('UPDATE courses SET name = ?, grade = ?, academic_year = ? WHERE id = ? AND school_id = ?', name, grade, storedYear, id, user.school_id) }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ya existe otro curso para ese grado y año lectivo.' }); throw error }
    await logAudit(user.school_id, user.id, 'course_updated')
    return json(response, 200, { course: { ...current, name, grade, academicYear: storedYear } })
  }
  if (courseRecordMatch && method === 'DELETE') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para dar de baja cursos.' })
    const result = await db.run('UPDATE courses SET is_active = 0 WHERE id = ? AND school_id = ? AND is_active = 1', courseRecordMatch[1], user.school_id)
    if ((result.rowCount ?? result.changes) === 0) return json(response, 404, { error: 'No encontramos un curso activo con ese identificador.' })
    await logAudit(user.school_id, user.id, 'course_archived')
    return json(response, 200, { archived: true })
  }
  const courseStatusMatch = url.pathname.match(/^\/api\/courses\/([0-9a-f-]{36})\/status$/i)
  if (courseStatusMatch && method === 'PATCH') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para cambiar el estado del curso.' })
    const body = await readBody(request)
    if (typeof body.active !== 'boolean') return json(response, 400, { error: 'Indica si el curso debe quedar activo.' })
    const result = await db.run('UPDATE courses SET is_active = ? WHERE id = ? AND school_id = ?', body.active ? 1 : 0, courseStatusMatch[1], user.school_id)
    if ((result.rowCount ?? result.changes) === 0) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    await logAudit(user.school_id, user.id, body.active ? 'course_reactivated' : 'course_archived')
    return json(response, 200, { id: courseStatusMatch[1], active: body.active })
  }
  const courseHistoryMatch = url.pathname.match(/^\/api\/courses\/([0-9a-f-]{36})\/history$/i)
  if (courseHistoryMatch && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría y secretaría pueden consultar el historial del curso.' })
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
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para asignar docentes.' })
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
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para editar asignaciones docentes.' })
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
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para quitar asignaciones docentes.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar asistencia.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para registrar asistencia.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const assignments = await db.all(`SELECT c.id AS "courseId", c.name AS "courseName", c.grade,
      c.academic_year AS "academicYear", ct.subject, u.full_name AS "teacherName"
      FROM course_teachers ct JOIN courses c ON c.id = ct.course_id JOIN users u ON u.id = ct.user_id
      WHERE c.school_id = ? AND c.is_active = 1 AND (? <> 'docente' OR ct.user_id = ?)
      ORDER BY c.academic_year DESC, c.grade, ct.subject, u.full_name`, user.school_id, user.role, user.id)
    return json(response, 200, { assignments })
  }
  if (url.pathname === '/api/grades/assessments' && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const courseId = String(url.searchParams.get('courseId') || '')
    const subject = String(url.searchParams.get('subject') || '')
    const period = String(url.searchParams.get('period') || '')
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
    if (!course || !subject || !period) return json(response, 400, { error: 'Selecciona curso, asignatura y periodo.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, course.id, subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa asignatura en el curso.' })
    const assessments = await db.all(`SELECT id, title, instructions, due_at AS "dueAt", delivery_mode AS "deliveryMode", activity_type AS "activityType", integrity_monitoring AS "integrityMonitoring", is_published AS "isPublished", external_form_url AS "externalFormUrl", video_url AS "videoUrl", time_limit_minutes AS "timeLimitMinutes", grading_mode AS "gradingMode", weight_percent AS "weightPercent", subject, period, max_score AS "maxScore", created_at AS "createdAt"
      FROM grade_assessments WHERE school_id = ? AND course_id = ? AND subject = ? AND period = ?
      ORDER BY created_at DESC`, user.school_id, course.id, subject, period)
    return json(response, 200, { assessments })
  }
  if (url.pathname === '/api/grades/assessments' && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear evaluaciones.' })
    const body = await readLargeJsonBody(request, 30 * 1024 * 1024)
    const courseId = String(body.courseId || '')
    const subject = String(body.subject || '').trim()
    const period = String(body.period || '').trim()
    const title = String(body.title || '').trim()
    const instructions = String(body.instructions || '').trim()
    const dueAt = String(body.dueAt || '').trim()
    const deliveryMode = String(body.deliveryMode || 'file')
    const activityType = String(body.activityType || 'assignment')
    const integrityMonitoring = body.integrityMonitoring === true && deliveryMode === 'online' ? 1 : 0
    const isPublished = body.isPublished === true ? 1 : 0
    const externalFormUrl = String(body.externalFormUrl || '').trim()
    const videoUrl = String(body.videoUrl || '').trim()
    const timeLimitMinutes = body.timeLimitMinutes === '' || body.timeLimitMinutes == null ? null : Number(body.timeLimitMinutes)
    const gradingMode = body.gradingMode === 'manual' ? 'manual' : 'auto'
    const questions = Array.isArray(body.questions) ? body.questions : []
    const images = Array.isArray(body.images) ? body.images : []
    const weightPercent = Number(body.weightPercent ?? 100)
    const maxScore = Number(body.maxScore)
    const course = await db.get('SELECT id FROM courses WHERE id = ? AND school_id = ? AND is_active = 1', courseId, user.school_id)
    if (!course) return json(response, 404, { error: 'No encontramos ese curso en este colegio.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ?
      AND (? <> 'docente' OR user_id = ?)`, course.id, subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esa asignatura en el curso.' })
    if (!['file', 'online'].includes(deliveryMode) || !['assignment', 'class_activity'].includes(activityType) || (activityType === 'class_activity' && (deliveryMode !== 'file' || externalFormUrl || questions.length || images.length)) || subject.length > 80 || period.length < 2 || period.length > 40 || title.length < 2 || title.length > 120 || instructions.length > 2000 || externalFormUrl.length > 1000 || videoUrl.length > 1000 || (dueAt && !validDate(dueAt)) || !validGoogleFormsUrl(externalFormUrl) || !validYouTubeUrl(videoUrl) || (timeLimitMinutes !== null && (!Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 1 || timeLimitMinutes > 300)) || !['auto', 'manual'].includes(gradingMode) || !Number.isFinite(weightPercent) || weightPercent <= 0 || weightPercent > 100 || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 10000) return json(response, 400, { error: 'Revisa el tipo de registro, periodo, nombre, instrucciones, enlace, fecha, ponderación, tiempo y puntaje máximo.' })
    const effectiveTimeLimit = deliveryMode === 'online' ? timeLimitMinutes : null
    const requiresManualQuestion = questions.some(question => question?.type === 'paragraph' || (question?.type === 'short' && !String(question?.expectedAnswer || '').trim()))
    const effectiveGradingMode = deliveryMode === 'online' ? (requiresManualQuestion ? 'manual' : gradingMode) : 'auto'
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
      const type = ['single', 'multiple', 'short', 'paragraph'].includes(question.type) ? question.type : 'single'
      const options = Array.isArray(question.options) ? question.options.map(option => String(option).trim()) : []
      const correctOptions = type === 'multiple' ? (Array.isArray(question.correctOptions) ? question.correctOptions : []) : [Number(question.correctOption)]
      const points = Number(question.points)
      const optionsInvalid = ['single', 'multiple'].includes(type) && (options.length < 2 || options.length > 10 || options.some(option => option.length < 1 || option.length > 120))
      const correctInvalid = effectiveGradingMode === 'auto' && (type === 'single' && (!Number.isInteger(question.correctOption) || question.correctOption < 0 || question.correctOption >= options.length) || type === 'multiple' && (!correctOptions.length || correctOptions.some(value => !Number.isInteger(value) || value < 0 || value >= options.length) || new Set(correctOptions).size !== correctOptions.length) || type === 'short' && !String(question.expectedAnswer || '').trim() || type === 'paragraph')
      return prompt.length < 3 || prompt.length > 500 || optionsInvalid || (['short', 'paragraph'].includes(type) && String(question.expectedAnswer || '').length > 300) || correctInvalid || !Number.isFinite(points) || points <= 0 || points > 1000
    }) || Math.abs(questions.reduce((total, question) => total + Number(question.points), 0) - maxScore) > 0.001)) return json(response, 400, { error: 'La evaluación en línea requiere 1 a 50 preguntas válidas; el puntaje máximo debe coincidir con la suma de sus preguntas.' })
    if (deliveryMode === 'file' && questions.length) return json(response, 400, { error: 'Los trabajos con archivo no deben incluir preguntas en línea.' })
    const id = randomUUID()
    await db.transaction(async tx => {
      await tx.run('INSERT INTO grade_assessments (id, school_id, course_id, subject, period, title, instructions, due_at, delivery_mode, activity_type, integrity_monitoring, is_published, external_form_url, video_url, time_limit_minutes, grading_mode, weight_percent, max_score, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, user.school_id, course.id, subject, period, title, instructions, dueAt || null, deliveryMode, activityType, integrityMonitoring, isPublished, externalFormUrl || null, videoUrl || null, effectiveTimeLimit, effectiveGradingMode, weightPercent, maxScore, user.id)
      for (let index = 0; index < questions.length; index++) {
        const question = questions[index]
        const type = ['single', 'multiple', 'short', 'paragraph'].includes(question.type) ? question.type : 'single'
        const options = Array.isArray(question.options) ? question.options.map(option => String(option).trim()) : []
        const correctOptions = type === 'multiple' ? (Array.isArray(question.correctOptions) ? question.correctOptions : []) : [Number(question.correctOption || 0)]
        const questionConfig = { type, options, correctOptions, expectedAnswer: String(question.expectedAnswer || '').trim() }
        await tx.run('INSERT INTO online_assessment_questions (id, assessment_id, question_no, prompt, options_json, correct_option, points) VALUES (?, ?, ?, ?, ?, ?, ?)', randomUUID(), id, index + 1, String(question.prompt).trim(), JSON.stringify(questionConfig), Number(correctOptions[0] || 0), Number(question.points))
      }
      for (const image of imageRecords) await tx.run('INSERT INTO assessment_images (id, school_id, assessment_id, file_name, content_type, file_size, file_data, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', image.id, user.school_id, id, image.fileName, image.contentType, image.fileSize, image.fileData, user.id)
    })
    await logAudit(user.school_id, user.id, 'grade_assessment_created')
    return json(response, 201, { assessment: { id, courseId, subject, period, title, instructions, dueAt: dueAt || null, deliveryMode, activityType, integrityMonitoring: Boolean(integrityMonitoring), isPublished: Boolean(isPublished), externalFormUrl: externalFormUrl || null, videoUrl: videoUrl || null, timeLimitMinutes: effectiveTimeLimit, gradingMode: effectiveGradingMode, images: imageRecords.map(({ id, fileName, contentType }) => ({ id, fileName, contentType })), weightPercent, maxScore } })
  }
  const gradeAssessmentMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})$/i)
  if (gradeAssessmentMatch && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar calificaciones.' })
    const assessment = await db.get(`SELECT a.id, a.course_id AS "courseId", c.name AS "courseName", c.grade,
      c.academic_year AS "academicYear", a.subject, a.period, a.title, a.instructions, a.due_at AS "dueAt", a.delivery_mode AS "deliveryMode", a.activity_type AS "activityType", a.integrity_monitoring AS "integrityMonitoring", a.is_published AS "isPublished", a.external_form_url AS "externalFormUrl", a.video_url AS "videoUrl", a.time_limit_minutes AS "timeLimitMinutes", a.grading_mode AS "gradingMode", a.weight_percent AS "weightPercent", a.max_score AS "maxScore"
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
    let attemptsByStudent = new Map()
    let questions = []
    if (assessment.deliveryMode === 'online') {
      const attempts = await db.all(`SELECT student_id AS "studentId", submitted_at AS "submittedAt", answers_json AS "answersJson"
        FROM online_assessment_attempts WHERE school_id = ? AND assessment_id = ? AND submitted_at IS NOT NULL`, user.school_id, assessment.id)
      attemptsByStudent = new Map(attempts.map(attempt => [attempt.studentId, attempt]))
      questions = await db.all(`SELECT id, question_no AS "questionNo", prompt, options_json AS "optionsJson", points
        FROM online_assessment_questions WHERE assessment_id = ? ORDER BY question_no`, assessment.id)
    }
    return json(response, 200, { assessment: { ...assessment, maxScore: Number(assessment.maxScore), weightPercent: Number(assessment.weightPercent) }, students: students.map(student => {
      const attempt = attemptsByStudent.get(student.id)
      let answers = {}
      try { answers = JSON.parse(attempt?.answersJson || '{}') } catch {}
      return { ...student, score: student.score === null ? null : Number(student.score), onlineSubmittedAt: attempt?.submittedAt || null,
        onlineAnswers: attempt ? questions.map(question => {
          const config = parseOnlineQuestionConfig(question)
          const selected = answers[question.id]
          const selectedAnswer = config.type === 'multiple' && Array.isArray(selected) ? selected.map(index => config.options[index]).filter(Boolean).join(', ')
            : config.type === 'single' && Number.isInteger(selected) ? config.options[selected] ?? null
              : typeof selected === 'string' ? selected : null
          return { questionNo: Number(question.questionNo), prompt: question.prompt, points: Number(question.points), selectedAnswer }
        }) : [] }
    }) })
  }
  const gradeAssessmentDeleteMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})$/i)
  if (gradeAssessmentDeleteMatch && method === 'DELETE') {
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para eliminar evaluaciones.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para publicar evaluaciones.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para cambiar ponderaciones.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar reglas académicas.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para configurar reglas académicas.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para registrar calificaciones.' })
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
    const permitted = ['admin', 'rectoria', 'secretaria', 'docente', 'acudiente', 'estudiante']
    if (!permitted.includes(user.role)) return json(response, 403, { error: 'Tu rol no tiene acceso a boletines.' })
    let students
    let studentCourses = []
    const portalRole = ['acudiente', 'estudiante'].includes(user.role)
    if (['acudiente', 'estudiante'].includes(user.role)) {
      students = await db.all(`SELECT st.id, st.full_name AS name, st.grade FROM user_students us
        JOIN students st ON st.id = us.student_id WHERE us.user_id = ? AND st.school_id = ? ORDER BY st.full_name`, user.id, user.school_id)
      studentCourses = await db.all(`SELECT DISTINCT se.student_id AS "studentId", c.id AS "courseId", c.grade, c.name AS "courseName", c.academic_year AS "academicYear"
        FROM user_students us JOIN students st ON st.id = us.student_id AND st.school_id = ?
        JOIN student_enrollments se ON se.student_id = us.student_id AND se.school_id = ?
        JOIN courses c ON c.id = se.course_id AND c.school_id = se.school_id AND c.academic_year = se.academic_year WHERE us.user_id = ? AND us.school_id = ?
        UNION
        SELECT DISTINCT us.student_id AS "studentId", c.id AS "courseId", c.grade, c.name AS "courseName", c.academic_year AS "academicYear"
        FROM user_students us JOIN students st ON st.id = us.student_id AND st.school_id = ? JOIN courses c ON c.school_id = ? WHERE us.user_id = ? AND us.school_id = ? AND (
          EXISTS (SELECT 1 FROM grade_assessments a JOIN student_grades sg ON sg.assessment_id = a.id WHERE a.course_id = c.id AND sg.student_id = us.student_id)
          OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.course_id = c.id AND ar.student_id = us.student_id))`, user.school_id, user.school_id, user.id, user.school_id, user.school_id, user.school_id, user.id, user.school_id)
    } else if (user.role === 'docente') {
      // El docente solo ve estudiantes de sus cursos y el boletín recibe el
      // curso exacto. Sin este vínculo el endpoint podía elegir otro paralelo
      // del mismo grado y devolver un boletín vacío.
      studentCourses = await db.all(`SELECT DISTINCT st.id AS "studentId", c.id AS "courseId", c.grade,
          c.name AS "courseName", c.academic_year AS "academicYear"
        FROM course_teachers ct
        JOIN courses c ON c.id = ct.course_id AND c.school_id = ?
        JOIN students st ON st.school_id = c.school_id AND st.grade = c.grade
        WHERE ct.user_id = ? AND (
          EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = st.id AND se.course_id = c.id AND se.academic_year = c.academic_year)
          OR EXISTS (SELECT 1 FROM grade_assessments a JOIN student_grades sg ON sg.assessment_id = a.id WHERE a.school_id = c.school_id AND a.course_id = c.id AND sg.student_id = st.id)
          OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.school_id = c.school_id AND ar.course_id = c.id AND ar.student_id = st.id))
        ORDER BY c.academic_year DESC, c.grade, st.full_name`, user.school_id, user.id)
      const studentIds = [...new Set(studentCourses.map(item => item.studentId))]
      students = studentIds.length
        ? await db.all(`SELECT id, full_name AS name, grade FROM students WHERE school_id = ? AND id IN (${studentIds.map(() => '?').join(',')}) ORDER BY grade, full_name`, user.school_id, ...studentIds)
        : []
    } else {
      students = await db.all('SELECT id, full_name AS name, grade FROM students WHERE school_id = ? ORDER BY grade, full_name', user.school_id)
    }
    const publications = await db.all(`SELECT academic_year AS "academicYear", period, is_published AS "isPublished",
        published_at AS "publishedAt" FROM grade_period_publications WHERE school_id = ? ${portalRole ? 'AND is_published = 1' : ''}
        ORDER BY academic_year DESC, period`, user.school_id)
    let years
    if (user.role === 'docente') years = await db.all(`SELECT DISTINCT c.academic_year AS year FROM courses c JOIN course_teachers ct ON ct.course_id = c.id WHERE c.school_id = ? AND ct.user_id = ? ORDER BY c.academic_year DESC`, user.school_id, user.id)
    else if (portalRole) years = [...new Set(publications.map(publication => publication.academicYear))].map(year => ({ year }))
    else years = await db.all('SELECT DISTINCT academic_year AS year FROM courses WHERE school_id = ? ORDER BY academic_year DESC', user.school_id)
    return json(response, 200, { students, courses: studentCourses, years: years.map(item => item.year), periods: ['Periodo 1', 'Periodo 2', 'Periodo 3', 'Periodo 4'], publications: publications.map(item => ({ ...item, isPublished: Boolean(item.isPublished) })) })
  }
  if (url.pathname === '/api/grades/publications' && method === 'PUT') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración y secretaría pueden publicar boletines.' })
    const body = await readBody(request)
    const academicYear = String(body.academicYear || '')
    const period = String(body.period || '')
    if (!academicYearStart(academicYear) || !/^Periodo [1-4]$/.test(period) || typeof body.published !== 'boolean') return json(response, 400, { error: 'Selecciona año lectivo, periodo y estado de publicación válidos.' })
    if (body.published) {
      const grades = Number((await db.get(`SELECT COUNT(*) AS count FROM student_grades sg
        JOIN grade_assessments a ON a.id = sg.assessment_id JOIN courses c ON c.id = a.course_id
        WHERE a.school_id = ? AND c.school_id = ? AND c.academic_year = ? AND a.period = ?`, user.school_id, user.school_id, academicYear, period)).count)
      if (!grades) return json(response, 409, { error: 'No hay notas registradas para publicar en este año y periodo.' })
    }
    const publishedAt = body.published ? new Date().toISOString() : null
    const publicationId = randomUUID()
    // La publicación y el registro documental se guardan juntos: así no queda
    // un boletín a medio publicar si falla una operación de base de datos.
    const previousPublication = await db.transaction(async tx => {
      const previous = await tx.get('SELECT is_published AS "isPublished" FROM grade_period_publications WHERE school_id = ? AND academic_year = ? AND period = ?', user.school_id, academicYear, period)
      await tx.run(`INSERT INTO grade_period_publications (id, school_id, academic_year, period, is_published, published_by, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(school_id, academic_year, period) DO UPDATE SET is_published = excluded.is_published,
          published_by = excluded.published_by, published_at = excluded.published_at`,
        publicationId, user.school_id, academicYear, period, body.published ? 1 : 0, user.id, publishedAt)
      await tx.run("UPDATE document_control_registry SET status = ? WHERE school_id = ? AND document_type = 'BOL' AND academic_year = ? AND period = ?",
        body.published ? 'Publicado' : 'Retirado', user.school_id, academicYear, period)
      if (body.published) {
        const students = await tx.all(`SELECT DISTINCT st.id AS "studentId", st.full_name AS "studentName"
          FROM student_grades sg
          JOIN students st ON st.id = sg.student_id AND st.school_id = ?
          JOIN grade_assessments a ON a.id = sg.assessment_id AND a.school_id = st.school_id AND a.period = ?
          JOIN courses c ON c.id = a.course_id AND c.school_id = st.school_id AND c.academic_year = ?
          ORDER BY st.full_name`, user.school_id, period, academicYear)
        for (const student of students) {
          let record = await tx.get('SELECT token, document_number AS "documentNumber" FROM report_card_verifications WHERE student_id = ? AND academic_year = ? AND period = ?', student.studentId, academicYear, period)
          if (!record) {
            const token = randomUUID()
            const documentNumber = await nextDocumentNumber(tx, user.school_id, 'BOL', academicYear)
            await tx.run(`INSERT INTO report_card_verifications (token, school_id, student_id, academic_year, period, document_number)
              VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(student_id, academic_year, period) DO NOTHING`, token, user.school_id, student.studentId, academicYear, period, documentNumber)
            record = await tx.get('SELECT token, document_number AS "documentNumber" FROM report_card_verifications WHERE student_id = ? AND academic_year = ? AND period = ?', student.studentId, academicYear, period)
          }
          if (!record.documentNumber) {
            record.documentNumber = await nextDocumentNumber(tx, user.school_id, 'BOL', academicYear)
            await tx.run('UPDATE report_card_verifications SET document_number = ? WHERE token = ?', record.documentNumber, record.token)
          }
          await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'BOL', documentNumber: record.documentNumber, referenceId: record.token, studentId: student.studentId, studentName: student.studentName, academicYear, period, status: 'Publicado', createdBy: user.id })
          await tx.run("UPDATE document_control_registry SET status = 'Publicado' WHERE school_id = ? AND document_type = 'BOL' AND reference_id = ?", user.school_id, record.token)
        }
      }
      return previous
    })
    let notified = 0, emailNotified = 0, emailConfigured = isEmailConfigured()
    if (body.published && !previousPublication?.isPublished) {
      // Un fallo en avisos/correo no debe reportar como fallida una publicación
      // que ya quedó guardada correctamente.
      try {
        const recipients = await db.all(`SELECT DISTINCT us.user_id AS id FROM user_students us
          JOIN students st ON st.id = us.student_id AND st.school_id = ? AND st.status = 'Activo'
          JOIN student_grades sg ON sg.student_id = st.id
          JOIN grade_assessments a ON a.id = sg.assessment_id AND a.school_id = st.school_id AND a.period = ?
          JOIN courses c ON c.id = a.course_id AND c.school_id = st.school_id AND c.academic_year = ?
          JOIN users u ON u.id = us.user_id AND u.school_id = st.school_id AND u.is_active = 1 AND u.deleted_at IS NULL
          WHERE us.school_id = ?`, user.school_id, period, academicYear, user.school_id)
        const notificationTitle = 'Boletines disponibles'
        const notificationBody = `${period} · Año lectivo ${academicYearStart(academicYear)}. Ya puedes consultar el boletín en EDUCA.`
        await db.transaction(async tx => {
          for (const recipient of recipients) await tx.run('INSERT INTO user_notifications (id, school_id, user_id, title, body, category, target_module) VALUES (?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, recipient.id, notificationTitle, notificationBody, 'report_card', 'Boletines')
        })
        const pushResult = await sendPushNotifications(user.school_id, recipients.map(item => item.id), notificationTitle, notificationBody, 'report_card')
        const emailResult = await sendEmailToUsers(user.school_id, recipients.map(item => item.id), 'EDUCA: boletines disponibles', `${notificationTitle}\n\n${notificationBody}\n\nIngresa a EDUCA para consultar el documento oficial.`)
        notified = recipients.length
        emailNotified = emailResult.sent; emailConfigured = emailResult.configured
        await logAudit(user.school_id, user.id, `grade_period_families_notified:${pushResult.sent}`)
      } catch (error) {
        console.error('EDUCA report-card notification failed:', error.code || error.message || 'notification_error')
      }
    }
    // La publicación ya quedó confirmada en la base de datos. Un fallo aislado
    // de auditoría no debe hacer que la interfaz informe que publicar falló.
    try {
      await logAudit(user.school_id, user.id, body.published ? 'grade_period_published' : 'grade_period_unpublished')
    } catch (error) {
      console.error('EDUCA report-card publication audit failed:', error.code || error.message || 'audit_error')
    }
    return json(response, 200, { academicYear, period, isPublished: body.published, publishedAt, notified, emailNotified, emailConfigured })
  }
  if (url.pathname === '/api/grades/report-card' && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria', 'docente', 'acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'Tu rol no tiene acceso a boletines.' })
    const studentId = String(url.searchParams.get('studentId') || '')
    const academicYear = String(url.searchParams.get('academicYear') || '')
    const period = String(url.searchParams.get('period') || '')
    const requestedCourseId = String(url.searchParams.get('courseId') || '')
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || !academicYearStart(academicYear) || !/^Periodo [1-4]$/.test(period)) return json(response, 400, { error: 'Selecciona estudiante, año lectivo y periodo válidos.' })
    const student = await db.get('SELECT id, full_name AS name, grade, status FROM students WHERE id = ? AND school_id = ?', studentId, user.school_id)
    if (!student) return json(response, 404, { error: 'No encontramos al estudiante en este colegio.' })
    if (['acudiente', 'estudiante'].includes(user.role) && !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, student.id)) return json(response, 403, { error: 'Solo puedes consultar los boletines de estudiantes vinculados a tu cuenta.' })
    const publication = await db.get('SELECT is_published AS "isPublished" FROM grade_period_publications WHERE school_id = ? AND academic_year = ? AND period = ?', user.school_id, academicYear, period)
    if (['acudiente', 'estudiante'].includes(user.role) && !publication?.isPublished) return json(response, 403, { error: 'Este boletín todavía no ha sido publicado por el colegio.' })
    let reportCourse = requestedCourseId ? await db.get(`SELECT c.id, c.grade, c.name AS "courseName" FROM courses c WHERE c.id = ? AND c.school_id = ? AND c.academic_year = ? AND (
      EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.course_id = c.id AND se.academic_year = c.academic_year)
      OR EXISTS (SELECT 1 FROM grade_assessments a JOIN student_grades sg ON sg.assessment_id = a.id WHERE a.course_id = c.id AND sg.student_id = ?)
      OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.course_id = c.id AND ar.student_id = ?))`, requestedCourseId, user.school_id, academicYear, student.id, student.id, student.id)
      : await db.get(`SELECT c.id, c.grade, c.name AS "courseName" FROM courses c WHERE c.school_id = ? AND c.grade = ? AND c.academic_year = ?
        AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.course_id = c.id AND se.academic_year = c.academic_year)
          OR NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.academic_year = ?))
        ORDER BY c.is_active DESC, c.created_at DESC LIMIT 1`, user.school_id, student.grade, academicYear, student.id, student.id, academicYear)
    if (requestedCourseId && !reportCourse) return json(response, 403, { error: 'Ese curso no corresponde al historial académico del estudiante.' })
    const reportGrade = reportCourse?.grade || student.grade
    if (user.role === 'docente' && (!reportCourse || !await db.get('SELECT 1 FROM course_teachers ct WHERE ct.user_id = ? AND ct.course_id = ?', user.id, reportCourse.id))) return json(response, 403, { error: 'No tienes una asignatura asignada a ese estudiante para el año lectivo seleccionado.' })
    const reportPeriods = ['Periodo 1', 'Periodo 2', 'Periodo 3', 'Periodo 4']
    const visiblePeriods = ['acudiente', 'estudiante'].includes(user.role)
      ? (await db.all('SELECT period FROM grade_period_publications WHERE school_id = ? AND academic_year = ? AND is_published = 1', user.school_id, academicYear)).map(item => item.period)
      : reportPeriods
    let marks = await db.all(`SELECT a.subject, a.title, a.max_score AS "maxScore", a.period, a.instructions,
        a.due_at AS "dueAt", a.weight_percent AS "weightPercent", a.created_by AS "createdBy", rule.scale_min AS "scaleMin",
        rule.scale_max AS "scaleMax", rule.passing_score AS "passingScore", sg.score, sg.comment, sg.updated_at AS "updatedAt",
        (SELECT u.full_name FROM course_teachers ct JOIN users u ON u.id = ct.user_id
          WHERE ct.course_id = c.id AND LOWER(TRIM(ct.subject)) = LOWER(TRIM(a.subject)) ORDER BY u.full_name LIMIT 1) AS "teacherName"
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      LEFT JOIN academic_grade_rules rule ON rule.school_id = a.school_id AND rule.course_id = c.id AND LOWER(TRIM(rule.subject)) = LOWER(TRIM(a.subject)) AND rule.period = a.period
      LEFT JOIN student_grades sg ON sg.assessment_id = a.id AND sg.student_id = ?
      WHERE a.school_id = ? AND c.school_id = ? AND c.grade = ? AND c.academic_year = ? AND (? = '' OR c.id = ?) AND a.period IN (${visiblePeriods.map(() => '?').join(',') || "'__none__'"})
        AND (? <> 'docente' OR EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = c.id AND ct.user_id = ?))
      ORDER BY a.subject, a.period, a.created_at, a.title`, student.id, user.school_id, user.school_id, reportGrade, academicYear, requestedCourseId, requestedCourseId, ...visiblePeriods, user.role, user.id)
    if (user.role === 'docente') {
      const assignedSubjects = await db.all('SELECT subject FROM course_teachers WHERE user_id = ? AND course_id = ?', user.id, reportCourse.id)
      const normalizeSubject = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim()
      const allowedSubjects = new Set(assignedSubjects.map(item => normalizeSubject(item.subject)).filter(Boolean))
      marks = marks.filter(mark => mark.createdBy === user.id || allowedSubjects.has(normalizeSubject(mark.subject)))
    }
    const bySubject = new Map()
    for (const mark of marks) {
      const score = mark.score === null ? null : Number(mark.score)
      const maxScore = Number(mark.maxScore)
      if (!bySubject.has(mark.subject)) bySubject.set(mark.subject, { subject: mark.subject, teacherName: mark.teacherName || '', byPeriod: new Map() })
      const subject = bySubject.get(mark.subject)
      if (!subject.byPeriod.has(mark.period)) subject.byPeriod.set(mark.period, { assessments: [], scoreWeights: [], scaleMin: mark.scaleMin === null ? null : Number(mark.scaleMin), scaleMax: mark.scaleMax === null ? null : Number(mark.scaleMax), passingScore: mark.passingScore === null ? null : Number(mark.passingScore) })
      const summary = subject.byPeriod.get(mark.period)
      const weightPercent = Number(mark.weightPercent) || 100
      summary.assessments.push({ title: mark.title, score, maxScore, weightPercent, comment: mark.comment || '', updatedAt: mark.updatedAt, instructions: mark.instructions || '', dueAt: mark.dueAt })
      if (score !== null && maxScore > 0) summary.scoreWeights.push({ percent: score / maxScore * 100, weight: weightPercent })
    }
    const periodGrades = summary => {
      if (!summary) return { averagePercent: null, institutionalScore: null, result: null, gradedCount: 0, assessmentCount: 0 }
      const totalWeight = summary.scoreWeights.reduce((sum, item) => sum + item.weight, 0)
      const averagePercent = totalWeight ? Math.round(summary.scoreWeights.reduce((sum, item) => sum + item.percent * item.weight, 0) / totalWeight * 100) / 100 : null
      const institutionalScore = averagePercent === null || summary.scaleMin === null || summary.scaleMax === null ? null
        : Math.round((summary.scaleMin + averagePercent / 100 * (summary.scaleMax - summary.scaleMin)) * 100) / 100
      return { averagePercent, institutionalScore, result: institutionalScore === null || summary.passingScore === null ? null : institutionalScore >= summary.passingScore ? 'Aprobado' : 'En seguimiento', gradedCount: summary.scoreWeights.length, assessmentCount: summary.assessments.length }
    }
    const subjects = [...bySubject.values()].map(subject => {
      const periods = Object.fromEntries(reportPeriods.map(item => [item, periodGrades(subject.byPeriod.get(item))]))
      const selectedSummary = subject.byPeriod.get(period)
      const selected = periods[period]
      const observedScores = reportPeriods.map(item => periods[item].institutionalScore).filter(value => value !== null)
      const cumulativeScore = observedScores.length ? Math.round(observedScores.reduce((sum, value) => sum + value, 0) / observedScores.length * 100) / 100 : null
      return {
        subject: subject.subject,
        teacherName: subject.teacherName,
        averagePercent: selected.averagePercent,
        scaleMin: selectedSummary?.scaleMin ?? null,
        scaleMax: selectedSummary?.scaleMax ?? null,
        passingScore: selectedSummary?.passingScore ?? null,
        institutionalScore: selected.institutionalScore,
        cumulativeScore,
        result: selected.result,
        gradedCount: selected.gradedCount,
        assessmentCount: selected.assessmentCount,
        assessments: selectedSummary?.assessments || [],
        periods,
      }
    })
    const groupDirector = reportCourse ? await db.get(`SELECT st.full_name AS "fullName", st.position_title AS "positionTitle"
      FROM course_group_directors d JOIN institutional_staff st ON st.id = d.staff_id
      WHERE d.course_id = ? AND d.school_id = ? AND st.is_active = 1`, reportCourse.id, user.school_id) : null
    let classStanding = null
    if (reportCourse) {
      const classGradeRows = await db.all(`SELECT sg.student_id AS "studentId", a.subject,
          SUM((sg.score / a.max_score * 100) * CASE WHEN a.weight_percent > 0 THEN a.weight_percent ELSE 100 END)
            / SUM(CASE WHEN a.weight_percent > 0 THEN a.weight_percent ELSE 100 END) AS "subjectPercent"
        FROM grade_assessments a
        JOIN courses c ON c.id = a.course_id AND c.school_id = a.school_id
        JOIN student_grades sg ON sg.assessment_id = a.id
        JOIN students st ON st.id = sg.student_id AND st.school_id = a.school_id
        WHERE a.school_id = ? AND c.id = ? AND c.academic_year = ? AND a.period = ?
          AND a.max_score > 0 AND sg.score IS NOT NULL
          AND (st.id = ? OR EXISTS (
            SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id
              AND se.student_id = st.id AND se.course_id = c.id
              AND se.academic_year = c.academic_year AND se.status = 'Activa'
          ))
        GROUP BY sg.student_id, a.subject`, user.school_id, reportCourse.id, academicYear, period, student.id)
      const subjectTotals = new Map()
      for (const row of classGradeRows) {
        if (!subjectTotals.has(row.studentId)) subjectTotals.set(row.studentId, [])
        subjectTotals.get(row.studentId).push(Number(row.subjectPercent))
      }
      const standings = [...subjectTotals.entries()].map(([studentId, percentages]) => ({
        studentId,
        averagePercent: Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length * 100) / 100,
      })).sort((a, b) => b.averagePercent - a.averagePercent)
      const studentStanding = standings.find(item => item.studentId === student.id)
      if (studentStanding) {
        classStanding = {
          position: standings.filter(item => item.averagePercent > studentStanding.averagePercent).length + 1,
          totalStudents: standings.length,
          averagePercent: studentStanding.averagePercent,
        }
      }
    }
    const currentSignatures = await resolveDocumentSigners(user.school_id, 'report_card', reportCourse?.id || null)
    const verification = await db.transaction(async tx => {
      let record = await tx.get('SELECT token, document_number AS "documentNumber", signature_snapshot AS "signatureSnapshot" FROM report_card_verifications WHERE student_id = ? AND academic_year = ? AND period = ?', student.id, academicYear, period)
      if (!record) {
        const token = randomUUID()
        const documentNumber = await nextDocumentNumber(tx, user.school_id, 'BOL', academicYear)
        await tx.get(`INSERT INTO report_card_verifications (token, school_id, student_id, academic_year, period, document_number)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(student_id, academic_year, period) DO NOTHING RETURNING token`, token, user.school_id, student.id, academicYear, period, documentNumber)
        record = await tx.get('SELECT token, document_number AS "documentNumber", signature_snapshot AS "signatureSnapshot" FROM report_card_verifications WHERE student_id = ? AND academic_year = ? AND period = ?', student.id, academicYear, period)
      }
      if (!record.documentNumber) {
        record.documentNumber = await nextDocumentNumber(tx, user.school_id, 'BOL', academicYear)
        await tx.run('UPDATE report_card_verifications SET document_number = ? WHERE token = ?', record.documentNumber, record.token)
      }
      if (publication?.isPublished) {
        await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'BOL', documentNumber: record.documentNumber, referenceId: record.token, studentId: student.id, studentName: student.name, academicYear, period, status: 'Publicado', createdBy: user.id })
        await tx.run("UPDATE document_control_registry SET status = 'Publicado' WHERE school_id = ? AND document_type = 'BOL' AND reference_id = ?", user.school_id, record.token)
      }
      return record
    })
    if ((!verification.signatureSnapshot || verification.signatureSnapshot === '[]') && currentSignatures.length) {
      await db.run('UPDATE report_card_verifications SET signature_snapshot = ? WHERE token = ? AND (signature_snapshot IS NULL OR signature_snapshot = \'[]\')', JSON.stringify(currentSignatures), verification.token)
      verification.signatureSnapshot = JSON.stringify(currentSignatures)
    }
    let reportSignatures = []
    try { reportSignatures = JSON.parse(verification.signatureSnapshot || '[]') } catch { reportSignatures = currentSignatures }
    const reportSchool = await db.get('SELECT name, slug, address, contact_email AS "contactEmail", contact_phone AS "contactPhone", primary_color AS "primaryColor", logo_content_type AS "hasLogo" FROM schools WHERE id = ?', user.school_id)
    await logAudit(user.school_id, user.id, 'report_card_viewed')
    return json(response, 200, { student: { ...student, grade: reportGrade, courseName: reportCourse?.courseName || '' }, academicYear, period, periods: reportPeriods, subjects, groupDirector, classStanding, signatures: reportSignatures, school: { ...reportSchool, hasLogo: Boolean(reportSchool.hasLogo) }, documentNumber: verification.documentNumber, verificationCode: verification.token, isPublished: Boolean(publication?.isPublished), generatedAt: new Date().toISOString() })
  }
  if (url.pathname === '/api/portal/assignments' && method === 'GET') {
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'Este acceso es solo para estudiantes y acudientes.' })
    const studentId = String(url.searchParams.get('studentId') || '')
    const student = await db.get('SELECT id, grade FROM students WHERE id = ? AND school_id = ?', studentId, user.school_id)
    if (!student || !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    const assignments = await db.all(`SELECT a.id, a.title, a.instructions, a.due_at AS "dueAt", a.subject, a.period,
        a.delivery_mode AS "deliveryMode", a.integrity_monitoring AS "integrityMonitoring", a.is_published AS "isPublished", a.external_form_url AS "externalFormUrl", a.video_url AS "videoUrl",
        a.time_limit_minutes AS "timeLimitMinutes", a.grading_mode AS "gradingMode",
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
        AND a.activity_type <> 'class_activity' AND (a.delivery_mode <> 'online' OR a.is_published = 1)
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
  const integrityEventsMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})\/integrity-events$/i)
  if (integrityEventsMatch && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar estas incidencias.' })
    const assessment = await db.get('SELECT id, course_id AS "courseId", subject, integrity_monitoring AS "integrityMonitoring" FROM grade_assessments WHERE id = ? AND school_id = ?', integrityEventsMatch[1], user.school_id)
    if (!assessment) return json(response, 404, { error: 'No encontramos la evaluación.' })
    const assignment = await db.get(`SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ? AND (? <> 'docente' OR user_id = ?)`, assessment.courseId, assessment.subject, user.role, user.id)
    if (!assignment) return json(response, 403, { error: 'No tienes asignada esta evaluación.' })
    const events = await db.all(`SELECT e.student_id AS "studentId", st.full_name AS "studentName", e.event_type AS "eventType", COUNT(*) AS count, MIN(e.occurred_at) AS "firstAt", MAX(e.occurred_at) AS "lastAt"
      FROM online_assessment_events e JOIN students st ON st.id = e.student_id
      WHERE e.school_id = ? AND e.assessment_id = ? GROUP BY e.student_id, st.full_name, e.event_type ORDER BY st.full_name, e.event_type`, user.school_id, assessment.id)
    return json(response, 200, { monitoringEnabled: Boolean(assessment.integrityMonitoring), events })
  }
  const onlineAssessmentAction = url.pathname.match(/^\/api\/portal\/online-assessments\/([0-9a-f-]{36})\/(start|draft|submit|events)$/i)
  if (onlineAssessmentAction && ((onlineAssessmentAction[2] === 'draft' && method === 'PATCH') || (onlineAssessmentAction[2] !== 'draft' && method === 'POST'))) {
    if (user.role !== 'estudiante') return json(response, 403, { error: 'Solo la cuenta del estudiante puede realizar una evaluación en línea.' })
    const body = await readBody(request)
    const studentId = String(body.studentId || '')
    const student = await db.get("SELECT id, grade FROM students WHERE id = ? AND school_id = ? AND status = 'Activo'", studentId, user.school_id)
    if (!student || !await db.get("SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ? AND relationship = 'estudiante'", user.id, studentId)) return json(response, 403, { error: 'La evaluación solo está disponible para el estudiante vinculado a esta cuenta.' })
    const assessment = await db.get(`SELECT a.id, a.course_id AS "courseId", a.subject, a.title, a.due_at AS "dueAt", a.max_score AS "maxScore", a.integrity_monitoring AS "integrityMonitoring", a.time_limit_minutes AS "timeLimitMinutes", a.grading_mode AS "gradingMode", c.grade
      FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.school_id = ? AND c.school_id = ? AND c.is_active = 1 AND a.delivery_mode = 'online' AND a.is_published = 1
        AND ((EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ?
          AND se.course_id = c.id AND se.academic_year = c.academic_year AND se.status = 'Activa'))
          OR (NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.status = 'Activa')
            AND c.grade = ? AND c.academic_year = (SELECT MAX(current_course.academic_year) FROM courses current_course
              WHERE current_course.school_id = c.school_id AND current_course.grade = c.grade AND current_course.is_active = 1)))`, onlineAssessmentAction[1], user.school_id, user.school_id, student.id, student.id, student.grade)
    if (!assessment) return json(response, 404, { error: 'No encontramos una evaluación publicada para el curso de este estudiante.' })
    if (onlineAssessmentAction[2] === 'events') {
      const eventType = String(body.eventType || '')
      const attemptId = String(body.attemptId || '')
      if (!assessment.integrityMonitoring) return json(response, 409, { error: 'El registro de incidencias no está habilitado para esta evaluación.' })
      if (!['tab_hidden', 'window_blur', 'fullscreen_exit', 'page_exit'].includes(eventType)) return json(response, 400, { error: 'El tipo de incidencia no es válido.' })
      const attempt = await db.get('SELECT id FROM online_assessment_attempts WHERE id = ? AND assessment_id = ? AND student_id = ? AND submitted_at IS NULL', attemptId, assessment.id, student.id)
      if (!attempt) return json(response, 409, { error: 'No hay un intento abierto para registrar la incidencia.' })
      const recent = await db.get(`SELECT id FROM online_assessment_events WHERE attempt_id = ? AND event_type = ? AND occurred_at >= ?`, attempt.id, eventType, new Date(Date.now() - 1500).toISOString())
      if (!recent) await db.run('INSERT INTO online_assessment_events (id, school_id, assessment_id, attempt_id, student_id, event_type, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)', randomUUID(), user.school_id, assessment.id, attempt.id, student.id, eventType, new Date().toISOString())
      return json(response, 200, { recorded: true })
    }
    const questions = await db.all('SELECT id, question_no AS "questionNo", prompt, options_json AS "optionsJson", correct_option AS "correctOption", points FROM online_assessment_questions WHERE assessment_id = ? ORDER BY question_no', assessment.id)
    if (!questions.length) return json(response, 409, { error: 'La evaluación todavía no tiene preguntas disponibles.' })
    let attempt = await db.get('SELECT id, started_at AS "startedAt", submitted_at AS "submittedAt", score, answers_json AS "answersJson" FROM online_assessment_attempts WHERE assessment_id = ? AND student_id = ?', assessment.id, student.id)
    const timeLimitMinutes = Number(assessment.timeLimitMinutes) || 0
    const remainingSeconds = target => timeLimitMinutes ? Math.max(0, Math.ceil((Date.parse(target.startedAt) + timeLimitMinutes * 60_000 - Date.now()) / 1000)) : null
    const gradeAnswers = answers => {
      let result = 0
      for (const question of questions) {
        const config = parseOnlineQuestionConfig(question)
        const answer = answers?.[question.id]
        const correct = (config.type === 'single' && answer === Number(config.correctOptions[0])) ||
          (config.type === 'multiple' && Array.isArray(answer) && answer.length === config.correctOptions.length &&
            [...answer].sort((a, b) => a - b).every((value, index) => value === [...config.correctOptions].sort((a, b) => a - b)[index])) ||
          (config.type === 'short' && Boolean(config.expectedAnswer.trim()) && normalizedShortAnswer(answer) === normalizedShortAnswer(config.expectedAnswer))
        if (correct) result += Number(question.points)
      }
      return Number(result.toFixed(2))
    }
    const finalizeExpiredAttempt = async (target, latestAnswers = null) => {
      if (!timeLimitMinutes || !target || target.submittedAt || remainingSeconds(target) > 0) return null
      const savedAnswers = latestAnswers && typeof latestAnswers === 'object' && !Array.isArray(latestAnswers) ? latestAnswers : JSON.parse(target.answersJson || '{}')
      const autoScore = assessment.gradingMode === 'manual' ? null : gradeAnswers(savedAnswers)
      const submittedAt = new Date().toISOString()
      await db.transaction(async tx => {
        const updated = await tx.run('UPDATE online_assessment_attempts SET answers_json = ?, score = ?, submitted_at = ? WHERE id = ? AND submitted_at IS NULL', JSON.stringify(savedAnswers), autoScore, submittedAt, target.id)
        if (!(updated.changes ?? updated.rowCount)) return
        if (autoScore !== null) await tx.run(`INSERT INTO student_grades (assessment_id, student_id, score, comment, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(assessment_id, student_id) DO UPDATE SET score = excluded.score,
          comment = excluded.comment, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          assessment.id, student.id, autoScore, 'Evaluación en línea completada al vencer el tiempo', user.id, submittedAt)
      })
      return { status: 'submitted', score: autoScore, maxScore: Number(assessment.maxScore), gradingMode: assessment.gradingMode, timedOut: true }
    }
    if (onlineAssessmentAction[2] === 'start') {
      if (!attempt) {
        const attemptId = randomUUID()
        try {
          await db.run('INSERT INTO online_assessment_attempts (id, school_id, assessment_id, student_id) VALUES (?, ?, ?, ?)', attemptId, user.school_id, assessment.id, student.id)
          attempt = await db.get('SELECT id, started_at AS "startedAt", submitted_at AS "submittedAt", score, answers_json AS "answersJson" FROM online_assessment_attempts WHERE id = ?', attemptId)
          await logAudit(user.school_id, user.id, 'online_assessment_started')
        } catch (error) {
          if (!String(error.code).startsWith('23') && !String(error.message).includes('UNIQUE')) throw error
          attempt = await db.get('SELECT id, started_at AS "startedAt", submitted_at AS "submittedAt", score, answers_json AS "answersJson" FROM online_assessment_attempts WHERE assessment_id = ? AND student_id = ?', assessment.id, student.id)
        }
      }
      if (attempt.submittedAt) return json(response, 200, { status: 'submitted', score: attempt.score === null ? null : Number(attempt.score), maxScore: Number(assessment.maxScore), gradingMode: assessment.gradingMode })
      const expired = await finalizeExpiredAttempt(attempt)
      if (expired) return json(response, 200, expired)
      return json(response, 200, { status: 'started', attemptId: attempt.id, title: assessment.title, subject: assessment.subject, monitoringEnabled: Boolean(assessment.integrityMonitoring),
        timeLimitMinutes: timeLimitMinutes || null, timeRemainingSeconds: remainingSeconds(attempt), gradingMode: assessment.gradingMode,
        answers: JSON.parse(attempt.answersJson || '{}'),
        maxScore: Number(assessment.maxScore), questions: questions.map(question => {
          const config = parseOnlineQuestionConfig(question)
          return { id: question.id, questionNo: question.questionNo, prompt: question.prompt, type: config.type,
            options: config.options, points: Number(question.points) }
        }) })
    }
    if (onlineAssessmentAction[2] === 'draft') {
      const answers = body.answers
      const questionById = new Map(questions.map(question => [question.id, question]))
      if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).some(id => {
        const question = questionById.get(id)
        return !question || !isValidOnlineAnswer(question, answers[id])
      })) return json(response, 400, { error: 'Una o más respuestas no son válidas.' })
      const attempt = await db.get('SELECT id, started_at AS "startedAt", submitted_at AS "submittedAt", score, answers_json AS "answersJson" FROM online_assessment_attempts WHERE assessment_id = ? AND student_id = ?', assessment.id, student.id)
      if (!attempt || attempt.submittedAt) return json(response, 409, { error: 'No hay un intento abierto para guardar respuestas.' })
      const expired = await finalizeExpiredAttempt(attempt, answers)
      if (expired) return json(response, 200, expired)
      await db.run('UPDATE online_assessment_attempts SET answers_json = ? WHERE id = ? AND submitted_at IS NULL', JSON.stringify(answers), attempt.id)
      return json(response, 200, { saved: true })
    }
    if (!attempt || attempt.submittedAt) return json(response, 409, { error: 'Esta evaluación no tiene un intento pendiente de envío.' })
    const expired = await finalizeExpiredAttempt(attempt)
    if (expired) return json(response, 200, expired)
    const answers = body.answers
    if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length !== questions.length || questions.some(question => !isValidOnlineAnswer(question, answers[question.id]))) return json(response, 400, { error: 'Responde todas las preguntas antes de enviar.' })
    const score = assessment.gradingMode === 'manual' ? null : gradeAnswers(answers)
    const submittedAt = new Date().toISOString()
    await db.transaction(async tx => {
      const updated = await tx.run('UPDATE online_assessment_attempts SET answers_json = ?, score = ?, submitted_at = ? WHERE id = ? AND submitted_at IS NULL', JSON.stringify(answers), score, submittedAt, attempt.id)
      if (!(updated.changes ?? updated.rowCount)) throw Object.assign(new Error('El intento ya fue enviado desde otra sesión.'), { status: 409 })
      if (score !== null) await tx.run(`INSERT INTO student_grades (assessment_id, student_id, score, comment, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(assessment_id, student_id) DO UPDATE SET score = excluded.score,
        comment = excluded.comment, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        assessment.id, student.id, score, 'Evaluación en línea completada', user.id, submittedAt)
    })
    await logAudit(user.school_id, user.id, 'online_assessment_submitted')
    return json(response, 200, { status: 'submitted', score, maxScore: Number(assessment.maxScore), gradingMode: assessment.gradingMode })
  }
  const studentSubmissionMatch = url.pathname.match(/^\/api\/portal\/assignments\/([0-9a-f-]{36})\/submissions$/i)
  if (studentSubmissionMatch && method === 'POST') {
    if (!['acudiente', 'estudiante'].includes(user.role)) return json(response, 403, { error: 'Solo estudiantes y acudientes vinculados pueden entregar trabajos.' })
    const body = await readLargeJsonBody(request)
    const studentId = String(body.studentId || '')
    const student = await db.get('SELECT id, grade FROM students WHERE id = ? AND school_id = ?', studentId, user.school_id)
    if (!student || !await db.get('SELECT 1 FROM user_students WHERE user_id = ? AND student_id = ?', user.id, studentId)) return json(response, 403, { error: 'Ese estudiante no está vinculado a tu cuenta.' })
    const assessment = await db.get(`SELECT a.id, c.grade FROM grade_assessments a JOIN courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.school_id = ? AND c.school_id = ? AND c.grade = ? AND c.is_active = 1 AND a.activity_type <> 'class_activity'
        AND (EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ?
          AND se.course_id = c.id AND se.academic_year = c.academic_year AND se.status = 'Activa')
          OR (NOT EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = c.school_id AND se.student_id = ? AND se.status = 'Activa')
            AND c.academic_year = (SELECT MAX(current_course.academic_year) FROM courses current_course
              WHERE current_course.school_id = c.school_id AND current_course.grade = c.grade AND current_course.is_active = 1)))`, studentSubmissionMatch[1], user.school_id, user.school_id, student.grade, student.id, student.id)
    if (!assessment) return json(response, 404, { error: 'No encontramos esa tarea activa para el grado de este estudiante.' })
    const idempotencyKey = String(body.idempotencyKey || '')
    if (idempotencyKey && !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return json(response, 400, { error: 'La clave de entrega no es válida.' })
    if (idempotencyKey) {
      const prior = await db.get('SELECT id, submission_no AS "submissionNo", uploaded_at AS "uploadedAt" FROM work_submissions WHERE school_id = ? AND student_id = ? AND idempotency_key = ?', user.school_id, student.id, idempotencyKey)
      if (prior) return json(response, 200, { submissionId: prior.id, submissionNo: Number(prior.submissionNo), uploadedAt: prior.uploadedAt, alreadyReceived: true })
    }
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
        original_file_name, content_type, file_size, file_data, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        submissionId, user.school_id, assessment.id, student.id, user.id, attempt, originalFileName, fileType.mime, fileData.length, fileData, idempotencyKey || null)
    } catch (error) {
      if (idempotencyKey && (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE'))) {
        const prior = await db.get('SELECT id, submission_no AS "submissionNo", uploaded_at AS "uploadedAt" FROM work_submissions WHERE school_id = ? AND student_id = ? AND idempotency_key = ?', user.school_id, student.id, idempotencyKey)
        if (prior) return json(response, 200, { submissionId: prior.id, submissionNo: Number(prior.submissionNo), uploadedAt: prior.uploadedAt, alreadyReceived: true })
      }
      if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'La entrega cambió al mismo tiempo. Actualiza la página e inténtalo de nuevo.' })
      throw error
    }
    await logAudit(user.school_id, user.id, 'work_submitted')
    return json(response, 201, { submissionId, submissionNo: attempt, uploadedAt: new Date().toISOString() })
  }
  const assessmentSubmissionsMatch = url.pathname.match(/^\/api\/grades\/assessments\/([0-9a-f-]{36})\/submissions$/i)
  if (assessmentSubmissionsMatch && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para consultar entregas.' })
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
    if (!['admin', 'rectoria', 'secretaria', 'docente'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para eliminar entregas.' })
    const submission = await db.get(`SELECT ws.id, ws.student_id AS "studentId", ws.assessment_id AS "assessmentId", a.course_id AS "courseId", a.subject, ws.original_file_name AS "fileName"
      FROM work_submissions ws JOIN grade_assessments a ON a.id = ws.assessment_id
      WHERE ws.id = ? AND ws.school_id = ? AND a.school_id = ?`, submissionDeleteMatch[1], user.school_id, user.school_id)
    if (!submission) return json(response, 404, { error: 'No encontramos esta entrega en el colegio.' })
    const teacher = user.role === 'docente' && await db.get('SELECT 1 FROM course_teachers WHERE course_id = ? AND subject = ? AND user_id = ?', submission.courseId, submission.subject, user.id)
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role) && !teacher) return json(response, 403, { error: 'No tienes asignada la evaluación de esta entrega.' })
    await db.run('DELETE FROM work_submissions WHERE assessment_id = ? AND student_id = ? AND school_id = ?', submission.assessmentId, submission.studentId, user.school_id)
    await logAudit(user.school_id, user.id, 'work_submission_deleted')
    return json(response, 200, { deleted: true })
  }

  if (url.pathname === '/api/enrollments' && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría y secretaría pueden consultar matrículas.' })
    const search = `%${String(url.searchParams.get('search') || '').slice(0, 100)}%`
    const status = String(url.searchParams.get('status') || 'Todos')
    const requests = await db.all(`SELECT id, student_id AS "studentId", student_name AS "studentName", document, document_number AS "documentNumber",
      grade_requested AS "gradeRequested", academic_year AS "academicYear", guardian_name AS "guardianName",
      guardian_phone AS "guardianPhone", guardian_email AS "guardianEmail", pending_documents AS "pendingDocuments", notes, status,
      created_at AS "createdAt", updated_at AS "updatedAt"
      FROM enrollment_requests WHERE school_id = ? AND (? = 'Todos' OR status = ?)
      AND (student_name LIKE ? OR document LIKE ? OR grade_requested LIKE ?) ORDER BY created_at DESC LIMIT 500`,
      user.school_id, status, status, search, search, search)
    return json(response, 200, { requests })
  }
  if (url.pathname === '/api/enrollments' && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear solicitudes de matrícula.' })
    const body = await readBody(request)
    const studentName = String(body.studentName || '').trim()
    const document = String(body.document || '').trim()
    const gradeRequested = String(body.gradeRequested || '').trim()
    const academicYear = academicYearStart(body.academicYear)
    const guardianName = String(body.guardianName || '').trim()
    const guardianPhone = String(body.guardianPhone || '').trim()
    const guardianEmail = String(body.guardianEmail || '').trim().toLowerCase()
    const pendingDocuments = (Array.isArray(body.pendingDocuments) ? body.pendingDocuments : String(body.pendingDocuments || '').split(','))
      .map(item => String(item).trim()).filter(Boolean).slice(0, 20).join('\n')
    const notes = String(body.notes || '').trim()
    if (studentName.length < 2 || studentName.length > 100 || !/^[\p{L}\p{N}.-]{3,30}$/u.test(document) || gradeRequested.length < 2 || gradeRequested.length > 40 || !academicYear || guardianName.length < 2 || guardianName.length > 100 || guardianPhone.length > 25 || guardianEmail.length > 254 || guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail) || pendingDocuments.length > 1000 || notes.length > 1000) return json(response, 400, { error: 'Revisa el estudiante, acudiente, correo, grado y año lectivo (AAAA).' })
    const duplicate = await db.get(`SELECT id FROM enrollment_requests WHERE school_id = ? AND document = ? AND LEFT(academic_year, 4) = ?
      AND status IN ('Solicitada','En revisión','Pendiente documentos','Aprobada')`, user.school_id, document, academicYear)
    if (duplicate) return json(response, 409, { error: 'Ya existe una solicitud en curso para ese documento y año lectivo.' })
    const id = randomUUID()
    const documentNumber = await db.transaction(async tx => {
      const controlledNumber = await nextDocumentNumber(tx, user.school_id, 'SOLMAT', academicYear)
      await tx.run(`INSERT INTO enrollment_requests (id, school_id, student_name, document, document_number, grade_requested, academic_year,
        guardian_name, guardian_phone, guardian_email, pending_documents, notes, status, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Solicitada', ?, ?)`, id, user.school_id, studentName, document, controlledNumber, gradeRequested, academicYear, guardianName, guardianPhone, guardianEmail, pendingDocuments, notes, user.id, user.id)
      await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'SOLMAT', documentNumber: controlledNumber, referenceId: id, studentName, academicYear, status: 'Solicitada', createdBy: user.id })
      return controlledNumber
    })
    await logAudit(user.school_id, user.id, 'enrollment_request_created')
    const enrollmentReviewers = await db.all("SELECT id FROM users WHERE school_id = ? AND is_active = 1 AND deleted_at IS NULL AND role IN ('admin','rectoria','secretaria')", user.school_id)
    await sendEmailToUsers(user.school_id, enrollmentReviewers.map(item => item.id), 'Nueva solicitud de matrícula', `Se registró la solicitud ${documentNumber} para ${studentName}.\nGrado solicitado: ${gradeRequested} · Año lectivo: ${academicYear}.\nAcudiente: ${guardianName}${guardianPhone ? ` · ${guardianPhone}` : ''}.\nIngresa a EDUCA para revisar documentos y actualizar el estado.`)
    if (guardianEmail) await sendInstitutionEmail(user.school_id, { to: guardianEmail, subject: 'Solicitud de matrícula recibida', text: `Hola ${guardianName},\nRecibimos la solicitud de matrícula de ${studentName} para el grado ${gradeRequested}, año lectivo ${academicYear}.\nNúmero de radicado: ${documentNumber}. La institución te notificará cuando cambie el estado.` })
    return json(response, 201, { id, documentNumber, status: 'Solicitada' })
  }
  const enrollmentRequestMatch = url.pathname.match(/^\/api\/enrollments\/([0-9a-f-]{36})$/i)
  if (enrollmentRequestMatch && method === 'DELETE') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para eliminar solicitudes de matrícula.' })
    const id = enrollmentRequestMatch[1]
    const requestRecord = await db.get('SELECT id, status FROM enrollment_requests WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!requestRecord) return json(response, 404, { error: 'No encontramos esa solicitud en este colegio.' })
    if (requestRecord.status === 'Aprobada') return json(response, 409, { error: 'Una matrícula aprobada no se puede eliminar. Registra un retiro o traslado para conservar la trayectoria académica.' })
    await db.transaction(async tx => {
      await tx.run("UPDATE document_control_registry SET status = 'Eliminada' WHERE school_id = ? AND document_type = 'SOLMAT' AND reference_id = ?", user.school_id, id)
      await tx.run('DELETE FROM enrollment_requests WHERE id = ? AND school_id = ? AND status <> ?', id, user.school_id, 'Aprobada')
    })
    await logAudit(user.school_id, user.id, 'enrollment_request_deleted')
    return json(response, 200, { id, deleted: true })
  }
  if (enrollmentRequestMatch && method === 'PATCH') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para procesar matrículas.' })
    const id = enrollmentRequestMatch[1]
    const requestRecord = await db.get(`SELECT * FROM enrollment_requests WHERE id = ? AND school_id = ?`, id, user.school_id)
    if (!requestRecord) return json(response, 404, { error: 'No encontramos esa solicitud en este colegio.' })
    if (requestRecord.status === 'Aprobada') {
      // Recupera aprobaciones anteriores que quedaron sin student_id enlazado.
      const linkedStudent = requestRecord.student_id
        ? { id: requestRecord.student_id }
        : await db.get('SELECT id FROM students WHERE school_id = ? AND document = ?', user.school_id, requestRecord.document)
      const studentId = linkedStudent?.id || null
      const existingEnrollment = studentId ? await db.get(`SELECT id, document_number AS "documentNumber" FROM student_enrollments WHERE school_id = ? AND student_id = ? AND LEFT(academic_year, 4) = ? AND status = 'Activa' ORDER BY start_date DESC LIMIT 1`, user.school_id, studentId, academicYearStart(requestRecord.academic_year)) : null
      const existingCertificate = existingEnrollment ? await db.get(`SELECT certificate_number AS "certificateNumber" FROM school_certificates WHERE school_id = ? AND enrollment_id = ? AND certificate_type = 'Constancia de matrícula' AND status = 'Emitida' ORDER BY created_at DESC LIMIT 1`, user.school_id, existingEnrollment.id) : null
      if (studentId && !requestRecord.student_id) await db.run('UPDATE enrollment_requests SET student_id = ? WHERE id = ? AND school_id = ? AND student_id IS NULL', studentId, id, user.school_id)
      return json(response, 200, { id, studentId, enrollmentId: existingEnrollment?.id || null, documentNumber: existingEnrollment?.documentNumber || null, certificateNumber: existingCertificate?.certificateNumber || null, certificateGenerated: Boolean(existingCertificate), status: 'Aprobada', alreadyApproved: true })
    }
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
      await db.run('UPDATE document_control_registry SET status = ? WHERE school_id = ? AND document_type = \'SOLMAT\' AND reference_id = ?', status, user.school_id, id)
      await logAudit(user.school_id, user.id, 'enrollment_request_updated')
      await sendEmailToUsers(user.school_id, [requestRecord.created_by], `Solicitud de matrícula ${status.toLocaleLowerCase('es')}`, `La solicitud ${requestRecord.document_number} de ${requestRecord.student_name} fue actualizada a: ${status}.\nGrado solicitado: ${requestRecord.grade_requested} · Año lectivo: ${requestRecord.academic_year}.${pendingDocuments ? `\nDocumentos pendientes: ${pendingDocuments.replaceAll('\n', ', ')}.` : ''}${notes ? `\nObservación: ${notes}` : ''}\nIngresa a EDUCA para consultar el registro.`)
      if (requestRecord.guardian_email) await sendInstitutionEmail(user.school_id, { to: requestRecord.guardian_email, subject: `Actualización de matrícula: ${status}`, text: `Hola ${requestRecord.guardian_name},\nLa solicitud ${requestRecord.document_number} de ${requestRecord.student_name} cambió a estado: ${status}.\nGrado: ${requestRecord.grade_requested} · Año lectivo: ${requestRecord.academic_year}.${pendingDocuments ? `\nDocumentos pendientes: ${pendingDocuments.replaceAll('\n', ', ')}.` : ''}${notes ? `\nObservación: ${notes}` : ''}\nContacta a la institución si tienes preguntas.` })
      return json(response, 200, { id, status })
    }
    const course = await db.get(`SELECT id, academic_year AS "academicYear" FROM courses WHERE school_id = ? AND grade = ? AND LEFT(academic_year, 4) = ? AND is_active = 1`, user.school_id, requestRecord.grade_requested, academicYearStart(requestRecord.academic_year))
    if (!course) return json(response, 409, { error: 'Crea primero el curso activo del grado y año solicitados para poder aprobar la matrícula.' })
    let student = await db.get('SELECT id FROM students WHERE school_id = ? AND document = ?', user.school_id, requestRecord.document)
    const studentId = student?.id || randomUUID()
    if (await db.get("SELECT id FROM student_enrollments WHERE school_id = ? AND student_id = ? AND LEFT(academic_year, 4) = ? AND status = 'Activa'", user.school_id, studentId, academicYearStart(course.academicYear))) return json(response, 409, { error: 'El estudiante ya tiene una matrícula activa para ese año lectivo.' })
    const enrollmentId = randomUUID()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
    const issuedAt = new Date().toISOString()
    const enrollmentDocumentNumber = await db.transaction(async tx => {
      if (student) await tx.run(`UPDATE students SET full_name = ?, grade = ?, guardian_name = ?, guardian_phone = ?, status = 'Activo'
        WHERE id = ? AND school_id = ?`, requestRecord.student_name, requestRecord.grade_requested, requestRecord.guardian_name, requestRecord.guardian_phone, studentId, user.school_id)
      else await tx.run(`INSERT INTO students (id, school_id, full_name, document, grade, guardian_name, guardian_phone, status, card_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo', ?)`, studentId, user.school_id, requestRecord.student_name, requestRecord.document, requestRecord.grade_requested, requestRecord.guardian_name, requestRecord.guardian_phone, randomUUID())
      const controlledNumber = await nextDocumentNumber(tx, user.school_id, 'MAT', course.academicYear)
      await tx.run(`INSERT INTO student_enrollments (id, school_id, student_id, course_id, academic_year, document_number, status, start_date, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'Activa', ?, ?, ?)`, enrollmentId, user.school_id, studentId, course.id, course.academicYear, controlledNumber, today, notes, user.id)
      await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'MAT', documentNumber: controlledNumber, referenceId: enrollmentId, studentId, studentName: requestRecord.student_name, academicYear: course.academicYear, status: 'Activa', createdBy: user.id })
      const certificateId = randomUUID()
      const certificateNumber = await nextDocumentNumber(tx, user.school_id, 'CERT', course.academicYear)
      const verificationCode = randomUUID()
      const signatureSnapshot = await resolveDocumentSigners(user.school_id, 'study_certificate', course.id)
      if (!signatureSnapshot.length) signatureSnapshot.push({ fullName: user.full_name, positionTitle: user.role === 'rectoria' ? 'Rector(a)' : 'Funcionario autorizado', signature: null })
      const issuer = signatureSnapshot[0]
      const studentDocument = await tx.get('SELECT document_type AS "documentType", document, document_issued_place AS "issuedPlace" FROM students WHERE id = ? AND school_id = ?', studentId, user.school_id)
      await tx.run(`INSERT INTO school_certificates (id, school_id, student_id, enrollment_id, course_id, grade_snapshot, course_name_snapshot, academic_status_snapshot, document_number, certificate_number, verification_code, signature_snapshot, certificate_type, student_name, student_document_type, student_document_number, student_document_issued_place, requester_name, requester_role, grade, academic_year, issued_by, status, rector_user_id, rector_name, signed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Constancia de matrícula', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Emitida', ?, ?, ?)`, certificateId, user.school_id, studentId, enrollmentId, course.id, requestRecord.grade_requested, course.name, `Matrícula activa desde ${today}`, controlledNumber, certificateNumber, verificationCode, JSON.stringify(signatureSnapshot), requestRecord.student_name, studentDocument?.documentType || '', studentDocument?.document || requestRecord.document, studentDocument?.issuedPlace || '', requestRecord.guardian_name || user.full_name, requestRecord.guardian_name ? 'Acudiente' : user.role, requestRecord.grade_requested, course.academicYear, user.id, issuer.id === user.id ? user.id : null, issuer.fullName || user.full_name, issuedAt)
      await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'CERT', documentNumber: certificateNumber, referenceId: certificateId, studentId, studentName: requestRecord.student_name, academicYear: course.academicYear, status: 'Emitida', createdBy: user.id, createdAt: issuedAt })
      await tx.run(`UPDATE enrollment_requests SET student_id = ?, status = 'Aprobada', pending_documents = ?, notes = ?, updated_by = ?, updated_at = ?
        WHERE id = ? AND school_id = ?`, studentId, pendingDocuments, notes, user.id, new Date().toISOString(), id, user.school_id)
      await tx.run("UPDATE document_control_registry SET student_id = ?, status = 'Aprobada' WHERE school_id = ? AND document_type = 'SOLMAT' AND reference_id = ?", studentId, user.school_id, id)
      return controlledNumber
    })
    await logAudit(user.school_id, user.id, 'enrollment_approved')
    const linkedAccounts = await db.all('SELECT user_id AS id FROM user_students WHERE student_id = ? AND user_id <> ?', studentId, requestRecord.created_by)
    await sendEmailToUsers(user.school_id, [requestRecord.created_by, ...linkedAccounts.map(item => item.id)], 'Matrícula aprobada', `La matrícula de ${requestRecord.student_name} fue aprobada.\nCurso asignado: ${requestRecord.grade_requested} · Año lectivo: ${course.academicYear}.\nNúmero de control: ${enrollmentDocumentNumber}.\nIngresa a EDUCA para consultar el historial y los documentos.`)
    if (requestRecord.guardian_email) await sendInstitutionEmail(user.school_id, { to: requestRecord.guardian_email, subject: 'Matrícula aprobada', text: `Hola ${requestRecord.guardian_name},\nLa matrícula de ${requestRecord.student_name} fue aprobada.\nGrado: ${requestRecord.grade_requested} · Año lectivo: ${course.academicYear}.\nNúmero de control: ${enrollmentDocumentNumber}.` })
    const certificate = await db.get("SELECT certificate_number AS \"certificateNumber\" FROM school_certificates WHERE enrollment_id = ? AND certificate_type = 'Constancia de matrícula' AND status = 'Emitida' ORDER BY created_at DESC LIMIT 1", enrollmentId)
    return json(response, 200, { id, studentId, enrollmentId, documentNumber: enrollmentDocumentNumber, certificateNumber: certificate?.certificateNumber || null, certificateGenerated: Boolean(certificate), effectiveDate: today, status: 'Aprobada' })
  }
  if (url.pathname === '/api/enrollments/history' && method === 'GET') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría y secretaría pueden consultar historial de matrículas.' })
    const records = await db.all(`SELECT se.id, se.student_id AS "studentId", st.full_name AS "studentName", st.document, se.document_number AS "documentNumber",
      COALESCE(c.grade, st.grade) AS grade, se.course_id AS "courseId", c.name AS "courseName", se.academic_year AS "academicYear",
      se.status, se.start_date AS "startDate", se.end_date AS "endDate", se.notes
      FROM student_enrollments se JOIN students st ON st.id = se.student_id
      LEFT JOIN courses c ON c.id = se.course_id AND c.school_id = se.school_id
      WHERE se.school_id = ? ORDER BY se.academic_year DESC, st.full_name, se.start_date DESC LIMIT 1000`, user.school_id)
    return json(response, 200, { records })
  }
  const enrollmentTransferMatch = url.pathname.match(/^\/api\/enrollments\/history\/([0-9a-f-]{36})\/transfer$/i)
  if (enrollmentTransferMatch && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría y secretaría pueden trasladar estudiantes.' })
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
    if (!destination || academicYearStart(destination.academicYear) !== academicYearStart(current.academicYear)) return json(response, 400, { error: 'El curso destino debe estar activo y pertenecer al mismo año lectivo.' })
    if (destination.id === current.courseId) return json(response, 400, { error: 'Selecciona un curso distinto al actual.' })
    const newEnrollmentId = randomUUID()
    const documentNumber = await db.transaction(async tx => {
      await tx.run(`UPDATE student_enrollments SET status = 'Trasladada', end_date = ?, notes = ? WHERE id = ? AND school_id = ?`, effectiveDate, notes, current.id, user.school_id)
      await tx.run("UPDATE document_control_registry SET status = 'Trasladada' WHERE school_id = ? AND document_type = 'MAT' AND reference_id = ?", user.school_id, current.id)
      const controlledNumber = await nextDocumentNumber(tx, user.school_id, 'MAT', current.academicYear)
      const studentName = (await tx.get('SELECT full_name AS "fullName" FROM students WHERE id = ? AND school_id = ?', current.studentId, user.school_id))?.fullName || ''
      await tx.run(`INSERT INTO student_enrollments (id, school_id, student_id, course_id, academic_year, document_number, status, start_date, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'Activa', ?, ?, ?)`, newEnrollmentId, user.school_id, current.studentId, destination.id, current.academicYear, controlledNumber, effectiveDate, notes, user.id)
      await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'MAT', documentNumber: controlledNumber, referenceId: newEnrollmentId, studentId: current.studentId, studentName, academicYear: current.academicYear, status: 'Activa', createdBy: user.id })
      await tx.run('UPDATE students SET grade = ? WHERE id = ? AND school_id = ?', destination.grade, current.studentId, user.school_id)
      return controlledNumber
    })
    await logAudit(user.school_id, user.id, 'student_transferred')
    const studentName = (await db.get('SELECT full_name AS name FROM students WHERE id = ? AND school_id = ?', current.studentId, user.school_id))?.name || 'El estudiante'
    const linkedAccounts = await db.all('SELECT user_id AS id FROM user_students WHERE student_id = ?', current.studentId)
    await sendEmailToUsers(user.school_id, linkedAccounts.map(item => item.id), 'Cambio de curso o sede', `${studentName} fue trasladado a otro curso dentro del año lectivo ${current.academicYear}.\nNuevo grado: ${destination.grade}.\nIngresa a EDUCA para consultar la trayectoria académica actualizada.`)
    return json(response, 200, { enrollmentId: newEnrollmentId, documentNumber, transferred: true })
  }
  const enrollmentPromotionMatch = url.pathname.match(/^\/api\/enrollments\/history\/([0-9a-f-]{36})\/promote$/i)
  if (enrollmentPromotionMatch && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría y secretaría pueden promover estudiantes.' })
    const body = await readBody(request)
    const destinationCourseId = String(body.courseId || '')
    const effectiveDate = String(body.effectiveDate || '')
    const notes = String(body.notes || '').trim()
    if (!validDate(effectiveDate) || notes.length > 1000) return json(response, 400, { error: 'Indica una fecha válida y una observación de máximo 1000 caracteres.' })
    const current = await db.get(`SELECT se.id, se.student_id AS "studentId", se.course_id AS "courseId", se.academic_year AS "academicYear",
        st.grade AS "studentGrade", st.full_name AS "studentName", COALESCE(c.grade, st.grade) AS "currentGrade"
      FROM student_enrollments se JOIN students st ON st.id = se.student_id LEFT JOIN courses c ON c.id = se.course_id AND c.school_id = se.school_id
      WHERE se.id = ? AND se.school_id = ? AND se.status = 'Activa'`, enrollmentPromotionMatch[1], user.school_id)
    if (!current) return json(response, 404, { error: 'No encontramos una matrícula activa para promover.' })
    const destination = await db.get(`SELECT id, grade, academic_year AS "academicYear" FROM courses
      WHERE id = ? AND school_id = ? AND is_active = 1`, destinationCourseId, user.school_id)
    const currentYear = Number(academicYearStart(current.academicYear))
    const nextYear = String(currentYear + 1)
    if (!destination || academicYearStart(destination.academicYear) !== nextYear) return json(response, 400, { error: 'El curso destino debe estar activo y pertenecer al año lectivo siguiente.' })
    const currentGradeRank = schoolGradeRank(current.currentGrade)
    const destinationGradeRank = schoolGradeRank(destination.grade)
    if (String(destination.grade || '').trim().toLocaleLowerCase('es') === String(current.currentGrade || '').trim().toLocaleLowerCase('es') || (currentGradeRank !== null && destinationGradeRank !== null && destinationGradeRank !== currentGradeRank + 1)) return json(response, 400, { error: 'Selecciona el grado inmediatamente siguiente al grado actual.' })
    const existingNextEnrollment = await db.get(`SELECT id FROM student_enrollments WHERE school_id = ? AND student_id = ? AND academic_year = ? AND status = 'Activa'`, user.school_id, current.studentId, destination.academicYear)
    if (existingNextEnrollment) return json(response, 409, { error: 'El estudiante ya tiene una matrícula activa para ese año lectivo.' })
    const newEnrollmentId = randomUUID()
    const documentNumber = await db.transaction(async tx => {
      const stillActive = await tx.get("SELECT id FROM student_enrollments WHERE id = ? AND school_id = ? AND status = 'Activa'", current.id, user.school_id)
      if (!stillActive) throw Object.assign(new Error('La matrícula ya no está activa. Actualiza la página e inténtalo de nuevo.'), { status: 409 })
      const duplicateNextEnrollment = await tx.get("SELECT id FROM student_enrollments WHERE school_id = ? AND student_id = ? AND academic_year = ? AND status = 'Activa'", user.school_id, current.studentId, destination.academicYear)
      if (duplicateNextEnrollment) throw Object.assign(new Error('El estudiante ya tiene una matrícula activa para ese año lectivo.'), { status: 409 })
      const existingResult = await tx.get('SELECT id FROM student_promotion_results WHERE school_id = ? AND student_id = ? AND academic_year = ?', user.school_id, current.studentId, String(currentYear))
      const resultId = existingResult?.id || randomUUID()
      const promotionNote = [`Promovido a ${destination.grade}.`, notes].filter(Boolean).join(' ')
      await tx.run(`UPDATE student_enrollments SET status = 'Retirada', end_date = ?, notes = CASE WHEN notes = '' THEN ? ELSE notes || char(10) || ? END WHERE id = ? AND school_id = ?`, effectiveDate, promotionNote, promotionNote, current.id, user.school_id)
      await tx.run("UPDATE document_control_registry SET status = 'Promovido' WHERE school_id = ? AND document_type = 'MAT' AND reference_id = ?", user.school_id, current.id)
      const controlledNumber = await nextDocumentNumber(tx, user.school_id, 'MAT', destination.academicYear)
      await tx.run(`INSERT INTO student_enrollments (id, school_id, student_id, course_id, academic_year, document_number, status, start_date, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'Activa', ?, ?, ?)`, newEnrollmentId, user.school_id, current.studentId, destination.id, destination.academicYear, controlledNumber, effectiveDate, notes, user.id)
      await registerControlledDocument(tx, { schoolId: user.school_id, documentType: 'MAT', documentNumber: controlledNumber, referenceId: newEnrollmentId, studentId: current.studentId, studentName: current.studentName, academicYear: destination.academicYear, status: 'Activa', createdBy: user.id })
      await tx.run('UPDATE students SET grade = ? WHERE id = ? AND school_id = ?', destination.grade, current.studentId, user.school_id)
      if (existingResult) {
        await tx.run("UPDATE student_promotion_results SET current_grade = ?, result_status = 'Promovido', new_grade = ?, source_reference = ?, created_by = ?, created_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?", current.currentGrade, destination.grade, 'Promoción registrada en EDUCA', user.id, resultId, user.school_id)
      } else {
        await tx.run("INSERT INTO student_promotion_results (id, school_id, student_id, academic_year, current_grade, result_status, new_grade, source_reference, created_by) VALUES (?, ?, ?, ?, ?, 'Promovido', ?, ?, ?)", resultId, user.school_id, current.studentId, String(currentYear), current.currentGrade, destination.grade, 'Promoción registrada en EDUCA', user.id)
      }
      return controlledNumber
    })
    await logAudit(user.school_id, user.id, 'student_promoted')
    const linkedAccounts = await db.all('SELECT user_id AS id FROM user_students WHERE student_id = ?', current.studentId)
    await sendEmailToUsers(user.school_id, linkedAccounts.map(item => item.id), 'Promoción de grado', `${current.studentName} fue promovido de ${current.currentGrade} a ${destination.grade} para el año lectivo ${destination.academicYear}.\nNúmero de control: ${documentNumber}.\nIngresa a EDUCA para consultar la trayectoria académica actualizada.`)
    return json(response, 200, { enrollmentId: newEnrollmentId, studentId: current.studentId, documentNumber, promoted: true, newGrade: destination.grade, academicYear: destination.academicYear })
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
            JOIN student_enrollments se ON se.course_id = c.id AND se.school_id = c.school_id AND se.student_id = st.id AND se.status = 'Activa'
            WHERE ct.user_id = ? AND c.school_id = st.school_id AND c.is_active = 1)
        ORDER BY st.full_name LIMIT 500`, user.school_id, search, search, user.id)
      return json(response, 200, { students, scope: 'cursos_asignados' })
    }
    const students = await db.all(`SELECT id, (photo_data IS NOT NULL) AS "hasPhoto", full_name AS name, document, document_type AS "documentType", document_issued_place AS "documentIssuedPlace", sex, date_of_birth AS "dateOfBirth", grade, guardian_name AS guardian, guardian_phone AS phone, status, access_status AS "accessStatus", access_suspension_reason AS "accessSuspensionReason", created_at AS "createdAt"
      FROM students WHERE school_id = ? AND (full_name LIKE ? OR document LIKE ? OR grade LIKE ? OR guardian_name LIKE ?)
      AND (? = 'Todos' OR status = ?)
      AND (status <> 'Activo' OR EXISTS (SELECT 1 FROM student_enrollments se WHERE se.school_id = students.school_id AND se.student_id = students.id AND se.status = 'Activa'))
      ORDER BY created_at DESC LIMIT 500`, user.school_id, search, search, search, search, status, status)
    return json(response, 200, { students })
  }
  if (url.pathname === '/api/students' && method === 'POST') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para crear estudiantes.' })
    return json(response, 409, { error: 'Para registrar un estudiante, crea una solicitud en Matrículas. El registro y el acceso se habilitan al aprobarla.' })
  }
    const studentMatch = url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})$/i)
  if (studentMatch && method === 'PATCH') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para modificar estudiantes.' })
    const id = studentMatch[1]
    const existing = await db.get('SELECT id, card_code AS "cardCode", grade, status FROM students WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!existing) return json(response, 404, { error: 'No encontramos ese estudiante en este colegio.' })
    const body = await readLargeJsonBody(request, 3 * 1024 * 1024)
    const name = String(body.name || '').trim()
    const documentNumber = String(body.document || '').trim()
    const documentType = String(body.documentType || '').trim().slice(0, 40)
    const documentIssuedPlace = String(body.documentIssuedPlace || '').trim().slice(0, 120)
    const sex = String(body.sex || '').trim().slice(0, 30)
    const dateOfBirth = String(body.dateOfBirth || '').trim()
    const guardian = String(body.guardian || '').trim()
    const phone = String(body.phone || '').trim()
    if ((body.grade != null && String(body.grade) !== existing.grade) || (body.status != null && String(body.status) !== existing.status)) return json(response, 409, { error: 'El grado y el estado se determinan por la matrícula aprobada. Usa Matrículas para registrar un traslado o retiro.' })
    if (name.length < 2 || name.length > 100 || !/^[\p{L}\p{N}.-]{3,30}$/u.test(documentNumber) || !['Registro civil', 'Tarjeta de identidad', 'Cédula de ciudadanía', 'Cédula de extranjería', 'Pasaporte', 'Permiso por protección temporal', 'Otro'].includes(documentType) || documentIssuedPlace.length < 3 || !['', 'Femenino', 'Masculino', 'Otro', 'Prefiere no decir'].includes(sex) || (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00Z`)) || dateOfBirth > new Date().toISOString().slice(0, 10))) || guardian.length < 2 || guardian.length > 100 || phone.length > 25) return json(response, 400, { error: 'Revisa el nombre, tipo y número de documento, lugar de expedición y datos básicos del estudiante.' })
    const photoProvided = body.photo && !(typeof body.photo === 'object' && Object.keys(body.photo).length === 0)
    const photo = photoProvided ? parseStudentPhoto(body.photo) : null
    if (photoProvided && !photo) return json(response, 400, { error: 'La foto debe ser JPG, PNG o WEBP válida y no superar 2 MB.' })
    try {
      if (photo) await db.run('UPDATE students SET full_name = ?, document = ?, document_type = ?, document_issued_place = ?, sex = ?, date_of_birth = ?, guardian_name = ?, guardian_phone = ?, photo_content_type = ?, photo_file_name = ?, photo_data = ? WHERE id = ? AND school_id = ?', name, documentNumber, documentType, documentIssuedPlace, sex, dateOfBirth, guardian, phone, photo.contentType, photo.fileName, photo.data, id, user.school_id)
      else if (body.removePhoto === true) await db.run('UPDATE students SET full_name = ?, document = ?, document_type = ?, document_issued_place = ?, sex = ?, date_of_birth = ?, guardian_name = ?, guardian_phone = ?, photo_content_type = NULL, photo_file_name = NULL, photo_data = NULL WHERE id = ? AND school_id = ?', name, documentNumber, documentType, documentIssuedPlace, sex, dateOfBirth, guardian, phone, id, user.school_id)
      else await db.run('UPDATE students SET full_name = ?, document = ?, document_type = ?, document_issued_place = ?, sex = ?, date_of_birth = ?, guardian_name = ?, guardian_phone = ? WHERE id = ? AND school_id = ?', name, documentNumber, documentType, documentIssuedPlace, sex, dateOfBirth, guardian, phone, id, user.school_id)
    }
    catch (error) { if (String(error.code).startsWith('23') || String(error.message).includes('UNIQUE')) return json(response, 409, { error: 'Ese documento ya está registrado en este colegio.' }); throw error }
    await logAudit(user.school_id, user.id, 'student_updated')
    return json(response, 200, { student: await db.get('SELECT id, (photo_data IS NOT NULL) AS "hasPhoto", full_name AS name, document, document_type AS "documentType", document_issued_place AS "documentIssuedPlace", sex, date_of_birth AS "dateOfBirth", grade, guardian_name AS guardian, guardian_phone AS phone, status, created_at AS "createdAt" FROM students WHERE id = ? AND school_id = ?', id, user.school_id) })
  }
  if (studentMatch && method === 'DELETE') {
    if (!['admin', 'rectoria', 'secretaria'].includes(user.role)) return json(response, 403, { error: 'Solo administración, rectoría o secretaría autorizada pueden eliminar estudiantes.' })
    const id = studentMatch[1]
    const existing = await db.get('SELECT id, status FROM students WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!existing) return json(response, 404, { error: 'No encontramos ese estudiante en este colegio.' })
    if (existing.status === 'Retirado') return json(response, 200, { retired: true, alreadyRetired: true })
    await db.transaction(async tx => {
      // Conserva matrículas, pagos, notas, asistencias y documentos vinculados al estudiante.
      await tx.run("UPDATE students SET status = 'Retirado', access_status = 'Suspendido', access_suspension_reason = ?, access_suspended_at = ?, access_suspended_by = ? WHERE id = ? AND school_id = ?", 'Registro retirado por la institución.', new Date().toISOString(), user.id, id, user.school_id)
      await tx.run("UPDATE student_enrollments SET status = 'Retirada', end_date = COALESCE(end_date, ?) WHERE student_id = ? AND school_id = ? AND status = 'Activa'", new Date().toISOString().slice(0, 10), id, user.school_id)
      await tx.run("DELETE FROM sessions WHERE user_id IN (SELECT us.user_id FROM user_students us WHERE us.student_id = ? AND us.relationship = 'estudiante')", id)
    })
    await logAudit(user.school_id, user.id, 'student_retired')
    return json(response, 200, { retired: true })
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
    if (accessStatus === 'Suspendido' && !academicYearStart(academicYear)) return json(response, 400, { error: 'Selecciona un año lectivo válido para registrar el motivo.' })
    await db.run('UPDATE students SET access_status = ?, access_suspension_reason = ?, access_suspended_at = ?, access_suspended_by = ? WHERE id = ? AND school_id = ?', accessStatus, accessStatus === 'Suspendido' ? reason : '', accessStatus === 'Suspendido' ? new Date().toISOString() : null, accessStatus === 'Suspendido' ? user.id : null, id, user.school_id)
    if (accessStatus === 'Suspendido') await db.run("DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM user_students WHERE student_id = ? AND relationship = 'estudiante')", id)
    await logAudit(user.school_id, user.id, accessStatus === 'Suspendido' ? 'student_access_suspended' : 'student_access_reactivated')
    return json(response, 200, { updated: true, accessStatus, reason: accessStatus === 'Suspendido' ? reason : '' })
  }
  if (url.pathname === '/api/student-payments' && method === 'GET') {
    if (!['admin', 'rectoria', 'tesoreria'].includes(user.role)) return json(response, 403, { error: 'Los pagos solo están disponibles para administración, rectoría y tesorería.' })
    const requestedAcademicYear = String(url.searchParams.get('academicYear') || '')
    const academicYear = academicYearStart(requestedAcademicYear)
    if (requestedAcademicYear && !academicYear) return json(response, 400, { error: 'El año lectivo no es válido.' })
    const payments = await db.all(`SELECT p.id, p.student_id AS "studentId", st.full_name AS "studentName", st.document, st.grade,
      p.academic_year AS "academicYear", p.fee_type AS "feeType", p.billing_period AS "billingPeriod", p.amount, p.due_date AS "dueDate",
      p.status, p.paid_at AS "paidAt", p.payment_reference AS "paymentReference", p.notes, p.created_at AS "createdAt"
      FROM student_payment_records p JOIN students st ON st.id = p.student_id
      WHERE p.school_id = ? AND (? = '' OR LEFT(p.academic_year, 4) = ?) ORDER BY CASE p.status WHEN 'Pendiente' THEN 0 ELSE 1 END, p.due_date, st.full_name`, user.school_id, academicYear, academicYear)
    const students = await db.all(`SELECT st.id, st.full_name AS name, st.document, st.grade, st.status,
      st.access_status AS "accessStatus", st.access_suspension_reason AS "accessSuspensionReason",
      COALESCE(SUM(CASE WHEN p.status = 'Pendiente' THEN p.amount ELSE 0 END), 0) AS "pendingBalance",
      COALESCE(SUM(CASE WHEN p.status = 'Pendiente' THEN 1 ELSE 0 END), 0) AS "pendingItems"
      FROM students st LEFT JOIN student_payment_records p ON p.student_id = st.id AND p.school_id = st.school_id AND (? = '' OR LEFT(p.academic_year, 4) = ?)
      WHERE st.school_id = ? AND st.status = 'Activo' GROUP BY st.id, st.full_name, st.document, st.grade, st.status, st.access_status, st.access_suspension_reason ORDER BY st.full_name`, academicYear, academicYear, user.school_id)
    return json(response, 200, { payments, students })
  }
  if (url.pathname === '/api/student-payments' && method === 'POST') {
    if (!['admin', 'rectoria', 'tesoreria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para registrar pagos.' })
    const body = await readBody(request)
    const studentId = String(body.studentId || '')
    const academicYear = academicYearStart(body.academicYear)
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
    if (!academicYear) return json(response, 400, { error: 'El año lectivo debe tener formato AAAA, por ejemplo 2026.' })
    if (!['Matrícula', 'Pensión'].includes(feeType) || (feeType === 'Pensión' && !/^\d{4}-\d{2}$/.test(billingPeriod)) || (feeType === 'Matrícula' && billingPeriod !== '')) return json(response, 400, { error: 'Revisa el concepto y el periodo del cobro.' })
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000 || !validDate(dueDate) || !['Pendiente', 'Pagado', 'Exonerado'].includes(status) || (paidAt && !validDate(paidAt)) || paymentReference.length > 120 || notes.length > 500) return json(response, 400, { error: 'Revisa el valor, las fechas, estado y referencia del pago.' })
    const existing = await db.get('SELECT id FROM student_payment_records WHERE student_id = ? AND LEFT(academic_year, 4) = ? AND fee_type = ? AND billing_period = ?', studentId, academicYear, feeType, billingPeriod)
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
    const existing = await db.get('SELECT id, fee_type AS "feeType" FROM student_payment_records WHERE id = ? AND school_id = ?', id, user.school_id)
    if (!existing) return json(response, 404, { error: 'No encontramos ese registro de pago.' })
    const body = await readBody(request)
    const status = String(body.status || ''), paidAt = String(body.paidAt || ''), reference = String(body.paymentReference || '').trim(), notes = String(body.notes || '').trim()
    if (body.amount !== undefined) {
      const amount = Number(body.amount)
      if (existing.feeType !== 'Pensión') return json(response, 400, { error: 'Solo se puede editar el valor de un cobro de pensión desde aquí.' })
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) return json(response, 400, { error: 'El valor de la pensión debe ser mayor que cero y no superar $1.000.000.000.' })
      if (status && (!['Pendiente', 'Pagado', 'Exonerado'].includes(status) || (paidAt && !validDate(paidAt)) || reference.length > 120 || notes.length > 500)) return json(response, 400, { error: 'Revisa el estado, fecha, referencia y observación.' })
      if (!status) {
        await db.run('UPDATE student_payment_records SET amount = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', amount, user.id, id, user.school_id)
        await logAudit(user.school_id, user.id, 'student_pension_amount_updated')
        return json(response, 200, { updated: true, amount })
      }
      await db.run('UPDATE student_payment_records SET amount = ?, status = ?, paid_at = ?, payment_reference = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', amount, status, status === 'Pagado' ? (paidAt || new Date().toISOString().slice(0, 10)) : null, reference, notes, user.id, id, user.school_id)
      await logAudit(user.school_id, user.id, 'student_pension_amount_updated')
      return json(response, 200, { updated: true, amount })
    }
    if (!['Pendiente', 'Pagado', 'Exonerado'].includes(status) || (paidAt && !validDate(paidAt)) || reference.length > 120 || notes.length > 500) return json(response, 400, { error: 'Revisa el estado, fecha, referencia y observación.' })
    await db.run('UPDATE student_payment_records SET status = ?, paid_at = ?, payment_reference = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?', status, status === 'Pagado' ? (paidAt || new Date().toISOString().slice(0, 10)) : null, reference, notes, user.id, id, user.school_id)
    await logAudit(user.school_id, user.id, 'student_payment_updated')
    return json(response, 200, { updated: true })
  }
  if (studentPaymentMatch && method === 'DELETE') {
    if (!['admin', 'rectoria', 'tesoreria'].includes(user.role)) return json(response, 403, { error: 'No tienes permiso para eliminar cobros.' })
    const payment = await db.get('SELECT id, fee_type AS "feeType", amount FROM student_payment_records WHERE id = ? AND school_id = ?', studentPaymentMatch[1], user.school_id)
    if (!payment) return json(response, 404, { error: 'No encontramos ese cobro.' })
    if (payment.feeType !== 'Pensión') return json(response, 400, { error: 'Desde esta opción solo se pueden eliminar cobros de pensión.' })
    await db.run('DELETE FROM student_payment_records WHERE id = ? AND school_id = ? AND fee_type = ?', studentPaymentMatch[1], user.school_id, 'Pensión')
    await logAudit(user.school_id, user.id, `student_pension_charge_deleted:${payment.id}`)
    return json(response, 200, { deleted: true })
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
