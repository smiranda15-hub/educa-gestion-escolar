import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const usePostgres = Boolean(process.env.DATABASE_URL)
let pool
let sqlite

if (usePostgres) {
  const { Pool } = await import('pg')
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }, max: Number(process.env.PG_POOL_MAX || 5), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
} else {
  const dbPath = resolve(process.env.EDUCA_DB_PATH || './data/educa.sqlite')
  mkdirSync(dirname(dbPath), { recursive: true })
  sqlite = new DatabaseSync(dbPath)
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
}

function prepare(sql) {
  return usePostgres ? sql.replace(/\?/g, () => `$${++prepare.index}`) : sql
}
prepare.index = 0
function queryText(sql) {
  prepare.index = 0
  return prepare(sql)
}

export const db = {
  async exec(sql) {
    if (usePostgres) await pool.query(sql)
    else sqlite.exec(sql)
  },
  async get(sql, ...params) {
    if (usePostgres) return (await pool.query(queryText(sql), params)).rows[0]
    return sqlite.prepare(sql).get(...params)
  },
  async all(sql, ...params) {
    if (usePostgres) return (await pool.query(queryText(sql), params)).rows
    return sqlite.prepare(sql).all(...params)
  },
  async run(sql, ...params) {
    if (usePostgres) return pool.query(queryText(sql), params)
    return sqlite.prepare(sql).run(...params)
  },
  async transaction(callback) {
    if (!usePostgres) {
      sqlite.exec('BEGIN IMMEDIATE')
      try { const result = await callback(this); sqlite.exec('COMMIT'); return result }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
    const client = await pool.connect()
    const tx = {
      get: async (sql, ...params) => { prepare.index = 0; return (await client.query(prepare(sql), params)).rows[0] },
      all: async (sql, ...params) => { prepare.index = 0; return (await client.query(prepare(sql), params)).rows },
      run: async (sql, ...params) => {
        prepare.index = 0
        return client.query(prepare(sql), params)
      },
    }
    try { await client.query('BEGIN'); const result = await callback(tx); await client.query('COMMIT'); return result }
    catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  },
  async close() { if (pool) await pool.end(); if (sqlite) sqlite.close() },
}

export async function nextDocumentNumber(tx, schoolId, documentType, academicYear) {
  const year = String(academicYear || '').replace(/[^0-9-]/g, '').slice(0, 12) || String(new Date().getFullYear())
  const row = await tx.get(`INSERT INTO document_control_counters (school_id, document_type, academic_year, last_number)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(school_id, document_type, academic_year)
    DO UPDATE SET last_number = document_control_counters.last_number + 1
    RETURNING last_number`, schoolId, documentType, year)
  return `EDU-${documentType}-${year}-${String(row.last_number).padStart(5, '0')}`
}

export async function registerControlledDocument(tx, document) {
  await tx.run(`INSERT INTO document_control_registry
    (id, school_id, document_type, document_number, reference_id, student_id, student_name, academic_year, period, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(school_id, document_type, reference_id) DO NOTHING`,
  randomUUID(), document.schoolId, document.documentType, document.documentNumber, document.referenceId || null,
  document.studentId || null, document.studentName || '', document.academicYear, document.period || '',
  document.status || 'Emitido', document.createdBy || null, document.createdAt || new Date().toISOString())
}

export async function migrate() {
  const textTimestampDefault = usePostgres ? '(CURRENT_TIMESTAMP::text)' : 'CURRENT_TIMESTAMP'
  const blobType = usePostgres ? 'BYTEA' : 'BLOB'
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact_email TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      primary_color TEXT NOT NULL DEFAULT '#6c70df',
      logo_content_type TEXT,
      logo_file_name TEXT,
      logo_data ${usePostgres ? 'BYTEA' : 'BLOB'},
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      contact_phone TEXT NOT NULL DEFAULT '',
      profile_photo_content_type TEXT,
      profile_photo_file_name TEXT,
      profile_photo_data ${usePostgres ? 'BYTEA' : 'BLOB'},
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, email)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS audit_log (
      id ${usePostgres ? 'BIGSERIAL' : 'INTEGER'} PRIMARY KEY ${usePostgres ? '' : 'AUTOINCREMENT'},
      school_id TEXT NOT NULL REFERENCES schools(id),
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE TABLE IF NOT EXISTS legal_acceptances (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_key TEXT NOT NULL,
      document_version TEXT NOT NULL,
      accepted_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, user_id, document_key, document_version)
    );
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      full_name TEXT NOT NULL,
      document TEXT NOT NULL,
      document_type TEXT NOT NULL DEFAULT '',
      document_issued_place TEXT NOT NULL DEFAULT '',
      sex TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('Activo','Retirado')),
      card_code TEXT,
      photo_content_type TEXT,
      photo_file_name TEXT,
      photo_data ${usePostgres ? 'BYTEA' : 'BLOB'},
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, document)
    );
    CREATE TABLE IF NOT EXISTS student_payment_records (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      academic_year TEXT NOT NULL,
      fee_type TEXT NOT NULL CHECK (fee_type IN ('Matrícula','Pensión')),
      billing_period TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL CHECK (amount >= 0),
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','Pagado','Exonerado')),
      paid_at TEXT,
      payment_reference TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (student_id, academic_year, fee_type, billing_period)
    );
    CREATE INDEX IF NOT EXISTS student_payment_records_scope_idx ON student_payment_records(school_id, student_id, academic_year, status);
    CREATE TABLE IF NOT EXISTS user_students (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL CHECK (relationship IN ('acudiente','estudiante')),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      PRIMARY KEY (user_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS user_students_student_idx ON user_students(student_id);
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      name TEXT NOT NULL,
      grade TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, academic_year, grade)
    );
    CREATE TABLE IF NOT EXISTS enrollment_requests (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      document_number TEXT NOT NULL DEFAULT '',
      student_id TEXT REFERENCES students(id),
      student_name TEXT NOT NULL,
      document TEXT NOT NULL,
      grade_requested TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL DEFAULT '',
      guardian_email TEXT NOT NULL DEFAULT '',
      pending_documents TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('Solicitada','En revisión','Pendiente documentos','Aprobada','Rechazada')),
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS enrollment_requests_school_status_idx ON enrollment_requests(school_id, status, created_at);
    CREATE INDEX IF NOT EXISTS enrollment_requests_document_idx ON enrollment_requests(school_id, document, academic_year);
    CREATE TABLE IF NOT EXISTS student_enrollments (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      document_number TEXT NOT NULL DEFAULT '',
      course_id TEXT REFERENCES courses(id),
      academic_year TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Activa','Trasladada','Retirada')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS student_enrollments_student_year_idx ON student_enrollments(school_id, student_id, academic_year, status);
    CREATE TABLE IF NOT EXISTS course_teachers (
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      PRIMARY KEY (course_id, user_id, subject)
    );
    CREATE INDEX IF NOT EXISTS course_teachers_user_idx ON course_teachers(user_id);
    CREATE TABLE IF NOT EXISTS institutional_staff (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      national_id TEXT NOT NULL DEFAULT '',
      position_key TEXT NOT NULL,
      position_title TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      signature_content_type TEXT,
      signature_file_name TEXT,
      signature_data ${blobType},
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, national_id)
    );
    CREATE INDEX IF NOT EXISTS institutional_staff_school_idx ON institutional_staff(school_id, is_active, position_key);
    CREATE TABLE IF NOT EXISTS institutional_staff_courses (
      staff_id TEXT NOT NULL REFERENCES institutional_staff(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      PRIMARY KEY (staff_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS course_group_directors (
      course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      staff_id TEXT NOT NULL REFERENCES institutional_staff(id),
      assigned_by TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE TABLE IF NOT EXISTS document_signature_rules (
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      primary_position TEXT NOT NULL,
      secondary_position TEXT NOT NULL DEFAULT '',
      primary_staff_id TEXT REFERENCES institutional_staff(id) ON DELETE SET NULL,
      secondary_staff_id TEXT REFERENCES institutional_staff(id) ON DELETE SET NULL,
      updated_by TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      PRIMARY KEY (school_id, document_type)
    );
    CREATE TABLE IF NOT EXISTS staff_certifications (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      staff_id TEXT NOT NULL REFERENCES institutional_staff(id) ON DELETE RESTRICT,
      document_number TEXT NOT NULL,
      certificate_type TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      issuer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      issuer_name TEXT NOT NULL,
      issuer_title TEXT NOT NULL,
      signature_snapshot TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Emitida',
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, document_number)
    );
    CREATE INDEX IF NOT EXISTS staff_certifications_scope_idx ON staff_certifications(school_id, created_at);
    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Presente','Ausente','Tarde','Justificado')),
      marked_by TEXT NOT NULL REFERENCES users(id),
      marked_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (course_id, student_id, attendance_date)
    );
    CREATE INDEX IF NOT EXISTS attendance_school_date_idx ON attendance_records(school_id, attendance_date);
    CREATE TABLE IF NOT EXISTS grade_assessments (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      subject TEXT NOT NULL,
      period TEXT NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      due_at TEXT,
      delivery_mode TEXT NOT NULL DEFAULT 'file' CHECK (delivery_mode IN ('file','online')),
      activity_type TEXT NOT NULL DEFAULT 'assignment',
      integrity_monitoring INTEGER NOT NULL DEFAULT 0,
      is_published INTEGER NOT NULL DEFAULT 1,
      external_form_url TEXT,
      video_url TEXT,
      time_limit_minutes INTEGER,
      grading_mode TEXT NOT NULL DEFAULT 'auto',
      weight_percent REAL NOT NULL DEFAULT 100 CHECK (weight_percent > 0 AND weight_percent <= 100),
      max_score REAL NOT NULL CHECK (max_score > 0),
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS grade_assessments_scope_idx ON grade_assessments(school_id, course_id, period);
    CREATE TABLE IF NOT EXISTS student_grades (
      assessment_id TEXT NOT NULL REFERENCES grade_assessments(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id),
      score REAL NOT NULL CHECK (score >= 0),
      comment TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      PRIMARY KEY (assessment_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS student_grades_student_idx ON student_grades(student_id);
    CREATE TABLE IF NOT EXISTS academic_grade_rules (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      subject TEXT NOT NULL,
      period TEXT NOT NULL,
      scale_min REAL NOT NULL,
      scale_max REAL NOT NULL,
      passing_score REAL NOT NULL,
      updated_by TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      CHECK (scale_max > scale_min),
      CHECK (passing_score >= scale_min AND passing_score <= scale_max),
      UNIQUE (course_id, subject, period)
    );
    CREATE INDEX IF NOT EXISTS academic_grade_rules_school_idx ON academic_grade_rules(school_id, course_id, period);
    CREATE TABLE IF NOT EXISTS grade_period_publications (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      academic_year TEXT NOT NULL,
      period TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      published_by TEXT NOT NULL REFERENCES users(id),
      published_at TEXT,
      UNIQUE (school_id, academic_year, period)
    );
    CREATE INDEX IF NOT EXISTS grade_period_publications_scope_idx ON grade_period_publications(school_id, academic_year, is_published);
    CREATE TABLE IF NOT EXISTS report_card_verifications (
      token TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      academic_year TEXT NOT NULL,
      period TEXT NOT NULL,
      document_number TEXT NOT NULL DEFAULT '',
      signature_snapshot TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (student_id, academic_year, period)
    );
    CREATE INDEX IF NOT EXISTS report_card_verifications_scope_idx ON report_card_verifications(school_id, academic_year, period);
    CREATE TABLE IF NOT EXISTS document_control_counters (
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (school_id, document_type, academic_year)
    );
    CREATE TABLE IF NOT EXISTS document_control_registry (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      document_number TEXT NOT NULL,
      reference_id TEXT,
      student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
      student_name TEXT NOT NULL DEFAULT '',
      academic_year TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Emitido',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, document_type, academic_year, document_number),
      UNIQUE (school_id, document_type, reference_id)
    );
    CREATE INDEX IF NOT EXISTS document_control_registry_scope_idx ON document_control_registry(school_id, document_type, academic_year, created_at);
    CREATE TABLE IF NOT EXISTS work_submissions (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      assessment_id TEXT NOT NULL REFERENCES grade_assessments(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id),
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      submission_no INTEGER NOT NULL CHECK (submission_no > 0),
      original_file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      file_size INTEGER NOT NULL CHECK (file_size > 0),
      file_data ${usePostgres ? 'BYTEA' : 'BLOB'} NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (assessment_id, student_id, submission_no)
    );
    CREATE INDEX IF NOT EXISTS work_submissions_assessment_student_idx ON work_submissions(assessment_id, student_id, submission_no);
    CREATE TABLE IF NOT EXISTS assessment_images (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      assessment_id TEXT NOT NULL REFERENCES grade_assessments(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
      file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 4194304),
      file_data ${usePostgres ? 'BYTEA' : 'BLOB'} NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS assessment_images_assessment_idx ON assessment_images(school_id, assessment_id);
    CREATE TABLE IF NOT EXISTS online_assessment_questions (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES grade_assessments(id) ON DELETE CASCADE,
      question_no INTEGER NOT NULL CHECK (question_no > 0),
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_option INTEGER NOT NULL CHECK (correct_option >= 0),
      points REAL NOT NULL CHECK (points > 0),
      UNIQUE (assessment_id, question_no)
    );
    CREATE INDEX IF NOT EXISTS online_assessment_questions_order_idx ON online_assessment_questions(assessment_id, question_no);
    CREATE TABLE IF NOT EXISTS online_assessment_attempts (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      assessment_id TEXT NOT NULL REFERENCES grade_assessments(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id),
      started_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      submitted_at TEXT,
      answers_json TEXT NOT NULL DEFAULT '{}',
      score REAL,
      UNIQUE (assessment_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS online_assessment_attempts_school_idx ON online_assessment_attempts(school_id, assessment_id, student_id);
    CREATE TABLE IF NOT EXISTS online_assessment_events (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      assessment_id TEXT NOT NULL REFERENCES grade_assessments(id) ON DELETE CASCADE,
      attempt_id TEXT NOT NULL REFERENCES online_assessment_attempts(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('tab_hidden','window_blur','fullscreen_exit','page_exit')),
      occurred_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS online_assessment_events_scope_idx ON online_assessment_events(school_id, assessment_id, student_id, occurred_at);
    CREATE TABLE IF NOT EXISTS communications (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      course_id TEXT REFERENCES courses(id),
      audience TEXT NOT NULL CHECK (audience IN ('school','course')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS communications_school_created_idx ON communications(school_id, created_at);
    CREATE TABLE IF NOT EXISTS institutional_content (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS institutional_content_school_idx ON institutional_content(school_id, is_published, category, updated_at);
    CREATE TABLE IF NOT EXISTS school_public_sites (
      school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
      content_json TEXT NOT NULL DEFAULT '{}',
      updated_by TEXT REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE TABLE IF NOT EXISTS school_site_photos (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      alt_text TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      photo_data ${blobType} NOT NULL,
      is_hero INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS school_site_photos_order_idx ON school_site_photos(school_id, sort_order, created_at);
    CREATE TABLE IF NOT EXISTS school_site_events (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS school_site_events_public_idx ON school_site_events(school_id, is_published, event_date);
    CREATE TABLE IF NOT EXISTS communication_recipients (
      communication_id TEXT NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT,
      PRIMARY KEY (communication_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS communication_recipients_user_idx ON communication_recipients(user_id, read_at);
    CREATE TABLE IF NOT EXISTS school_events (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL DEFAULT 'Evento',
      registration_capacity INTEGER,
      registration_deadline TEXT,
      registration_open INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS school_events_school_date_idx ON school_events(school_id, event_date);
    CREATE TABLE IF NOT EXISTS event_attendance_records (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL REFERENCES school_events(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL CHECK (record_type IN ('Ingreso','Salida','PAE')),
      recorded_by TEXT NOT NULL REFERENCES users(id),
      recorded_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (event_id, student_id, record_type)
    );
    CREATE INDEX IF NOT EXISTS event_attendance_scope_idx ON event_attendance_records(school_id, event_id, record_type, recorded_at);
    CREATE TABLE IF NOT EXISTS activity_registrations (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL REFERENCES school_events(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'Inscrito' CHECK (status IN ('Inscrito','Cancelado')),
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (event_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS activity_registrations_event_idx ON activity_registrations(school_id, event_id, status);
    CREATE TABLE IF NOT EXISTS school_surveys (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL,
      closes_at TEXT,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS school_surveys_scope_idx ON school_surveys(school_id, is_published, created_at);
    CREATE TABLE IF NOT EXISTS survey_votes (
      survey_id TEXT NOT NULL REFERENCES school_surveys(id) ON DELETE CASCADE,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      option_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      PRIMARY KEY (survey_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS survey_votes_school_idx ON survey_votes(school_id, survey_id);
    CREATE TABLE IF NOT EXISTS school_certificates (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrollment_id TEXT REFERENCES student_enrollments(id) ON DELETE SET NULL,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      grade_snapshot TEXT NOT NULL DEFAULT '',
      course_name_snapshot TEXT NOT NULL DEFAULT '',
      academic_status_snapshot TEXT NOT NULL DEFAULT '',
      document_number TEXT NOT NULL DEFAULT '',
      certificate_number TEXT NOT NULL UNIQUE,
      verification_code TEXT UNIQUE,
      signature_snapshot TEXT NOT NULL DEFAULT '[]',
      certificate_type TEXT NOT NULL,
      student_name TEXT NOT NULL,
      student_document_type TEXT NOT NULL DEFAULT '',
      student_document_number TEXT NOT NULL DEFAULT '',
      student_document_issued_place TEXT NOT NULL DEFAULT '',
      requester_name TEXT NOT NULL DEFAULT '',
      requester_role TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      issued_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'Emitida',
      rector_user_id TEXT REFERENCES users(id),
      rector_name TEXT NOT NULL DEFAULT '',
      signed_at TEXT,
      replaced_by_id TEXT REFERENCES school_certificates(id) ON DELETE SET NULL,
      annul_note TEXT NOT NULL DEFAULT '',
      annulled_by TEXT REFERENCES users(id),
      annulled_at TEXT,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS school_certificates_student_idx ON school_certificates(school_id, student_id, created_at);
    CREATE TABLE IF NOT EXISTS school_certificate_requests (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrollment_id TEXT REFERENCES student_enrollments(id) ON DELETE SET NULL,
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      grade_snapshot TEXT NOT NULL DEFAULT '',
      course_name_snapshot TEXT NOT NULL DEFAULT '',
      academic_status_snapshot TEXT NOT NULL DEFAULT '',
      certificate_type TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      requested_by TEXT NOT NULL REFERENCES users(id),
      requester_role TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pendiente',
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TEXT,
      replaces_certificate_id TEXT REFERENCES school_certificates(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS certificate_requests_school_idx ON school_certificate_requests(school_id, status, created_at);
    CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id TEXT REFERENCES school_events(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS user_notifications_unread_idx ON user_notifications(school_id, user_id, read_at, created_at);
    CREATE TABLE IF NOT EXISTS device_push_tokens (
      token TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL DEFAULT 'android',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      updated_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx ON device_push_tokens(school_id, user_id, is_active);
    CREATE TABLE IF NOT EXISTS attendance_justifications (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id),
      attendance_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','Aprobada','Rechazada')),
      reviewer_note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      reviewed_by TEXT REFERENCES users(id),
      support_file_name TEXT,
      support_content_type TEXT,
      support_file_size INTEGER NOT NULL DEFAULT 0,
      support_file_data ${usePostgres ? 'BYTEA' : 'BLOB'},
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      reviewed_at TEXT,
      UNIQUE (school_id, student_id, attendance_date)
    );
    CREATE INDEX IF NOT EXISTS attendance_justifications_school_date_idx ON attendance_justifications(school_id, attendance_date, status);
    CREATE TABLE IF NOT EXISTS class_schedule_slots (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id),
      teacher_id TEXT NOT NULL REFERENCES users(id),
      subject TEXT NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS class_schedule_school_day_idx ON class_schedule_slots(school_id, weekday, start_time);
    CREATE TABLE IF NOT EXISTS student_observations (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id),
      category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'Seguimiento' CHECK (severity IN ('Positiva','Seguimiento','Prioritaria')),
      details TEXT NOT NULL,
      confidential INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS student_observations_student_idx ON student_observations(school_id, student_id, created_at);
    CREATE TABLE IF NOT EXISTS academic_periods (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_year TEXT NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, academic_year, name)
    );
    CREATE INDEX IF NOT EXISTS academic_periods_school_year_idx ON academic_periods(school_id, academic_year, is_active);
  `)
  if (usePostgres) {
    for (const [column, definition] of [['is_active', 'INTEGER NOT NULL DEFAULT 1'], ['suspension_reason', "TEXT NOT NULL DEFAULT ''"], ['suspended_at', 'TEXT'], ['archived_at', 'TEXT']]) {
      if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schools' AND column_name = ?", column)) await db.exec(`ALTER TABLE schools ADD COLUMN ${column} ${definition}`)
    }
    for (const [column, definition] of [['access_status', "TEXT NOT NULL DEFAULT 'Activo'"], ['access_suspension_reason', "TEXT NOT NULL DEFAULT ''"], ['access_suspended_at', 'TEXT'], ['access_suspended_by', 'TEXT']]) {
      if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'students' AND column_name = ?", column)) await db.exec(`ALTER TABLE students ADD COLUMN ${column} ${definition}`)
    }
    for (const [column, definition] of [['card_code', 'TEXT'], ['photo_content_type', 'TEXT'], ['photo_file_name', 'TEXT'], ['photo_data', 'BYTEA']]) {
      if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'students' AND column_name = ?", column)) await db.exec(`ALTER TABLE students ADD COLUMN ${column} ${definition}`)
    }
    for (const [column, definition] of [['document_type', "TEXT NOT NULL DEFAULT ''"], ['document_issued_place', "TEXT NOT NULL DEFAULT ''"], ['sex', "TEXT NOT NULL DEFAULT ''"], ['date_of_birth', "TEXT NOT NULL DEFAULT ''"]]) {
      if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'students' AND column_name = ?", column)) await db.exec(`ALTER TABLE students ADD COLUMN ${column} ${definition}`)
    }
    for (const [column, definition] of [['verification_code', 'TEXT'], ['signature_snapshot', "TEXT NOT NULL DEFAULT '[]'"], ['status', "TEXT NOT NULL DEFAULT 'Emitida'"], ['rector_user_id', 'TEXT REFERENCES users(id)'], ['rector_name', "TEXT NOT NULL DEFAULT ''"], ['signed_at', 'TEXT'], ['replaced_by_id', 'TEXT REFERENCES school_certificates(id) ON DELETE SET NULL'], ['annul_note', "TEXT NOT NULL DEFAULT ''"], ['annulled_by', 'TEXT REFERENCES users(id)'], ['annulled_at', 'TEXT']]) {
      if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_certificates' AND column_name = ?", column)) await db.exec(`ALTER TABLE school_certificates ADD COLUMN ${column} ${definition}`)
    }
    for (const [column, definition] of [['student_document_type', "TEXT NOT NULL DEFAULT ''"], ['student_document_number', "TEXT NOT NULL DEFAULT ''"], ['student_document_issued_place', "TEXT NOT NULL DEFAULT ''"], ['requester_name', "TEXT NOT NULL DEFAULT ''"], ['requester_role', "TEXT NOT NULL DEFAULT ''"]]) {
      if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_certificates' AND column_name = ?", column)) await db.exec(`ALTER TABLE school_certificates ADD COLUMN ${column} ${definition}`)
    }
    for (const [table, columns] of [['school_certificates', [['enrollment_id', 'TEXT REFERENCES student_enrollments(id) ON DELETE SET NULL'], ['course_id', 'TEXT REFERENCES courses(id) ON DELETE SET NULL'], ['grade_snapshot', "TEXT NOT NULL DEFAULT ''"], ['course_name_snapshot', "TEXT NOT NULL DEFAULT ''"], ['academic_status_snapshot', "TEXT NOT NULL DEFAULT ''"]]], ['school_certificate_requests', [['enrollment_id', 'TEXT REFERENCES student_enrollments(id) ON DELETE SET NULL'], ['course_id', 'TEXT REFERENCES courses(id) ON DELETE SET NULL'], ['grade_snapshot', "TEXT NOT NULL DEFAULT ''"], ['course_name_snapshot', "TEXT NOT NULL DEFAULT ''"], ['academic_status_snapshot', "TEXT NOT NULL DEFAULT ''"]]]]) {
      for (const [column, definition] of columns) if (!await db.get('SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?', table, column)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_certificate_requests' AND column_name = 'requester_role'")) await db.exec("ALTER TABLE school_certificate_requests ADD COLUMN requester_role TEXT NOT NULL DEFAULT ''")
    for (const [column, definition] of [['contact_phone', "TEXT NOT NULL DEFAULT ''"], ['profile_photo_content_type', 'TEXT'], ['profile_photo_file_name', 'TEXT'], ['profile_photo_data', 'BYTEA']]) {
      if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = ?", column)) await db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`)
    }
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_events' AND column_name = 'registration_capacity'")) await db.exec('ALTER TABLE school_events ADD COLUMN registration_capacity INTEGER')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_events' AND column_name = 'registration_deadline'")) await db.exec('ALTER TABLE school_events ADD COLUMN registration_deadline TEXT')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'school_events' AND column_name = 'registration_open'")) await db.exec('ALTER TABLE school_events ADD COLUMN registration_open INTEGER NOT NULL DEFAULT 0')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schools' AND column_name = 'contact_email'")) await db.exec("ALTER TABLE schools ADD COLUMN contact_email TEXT NOT NULL DEFAULT ''")
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schools' AND column_name = 'contact_phone'")) await db.exec("ALTER TABLE schools ADD COLUMN contact_phone TEXT NOT NULL DEFAULT ''")
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schools' AND column_name = 'address'")) await db.exec("ALTER TABLE schools ADD COLUMN address TEXT NOT NULL DEFAULT ''")
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schools' AND column_name = 'primary_color'")) await db.exec("ALTER TABLE schools ADD COLUMN primary_color TEXT NOT NULL DEFAULT '#6c70df'")
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schools' AND column_name = 'logo_content_type'")) await db.exec('ALTER TABLE schools ADD COLUMN logo_content_type TEXT')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schools' AND column_name = 'logo_file_name'")) await db.exec('ALTER TABLE schools ADD COLUMN logo_file_name TEXT')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'schools' AND column_name = 'logo_data'")) await db.exec('ALTER TABLE schools ADD COLUMN logo_data BYTEA')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'deleted_at'")) await db.exec('ALTER TABLE users ADD COLUMN deleted_at TEXT')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'courses' AND column_name = 'is_active'")) await db.exec('ALTER TABLE courses ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'instructions'")) await db.exec("ALTER TABLE grade_assessments ADD COLUMN instructions TEXT NOT NULL DEFAULT ''")
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'due_at'")) await db.exec('ALTER TABLE grade_assessments ADD COLUMN due_at TEXT')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'weight_percent'")) await db.exec('ALTER TABLE grade_assessments ADD COLUMN weight_percent REAL NOT NULL DEFAULT 100')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'delivery_mode'")) await db.exec("ALTER TABLE grade_assessments ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'file'")
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'is_published'")) await db.exec('ALTER TABLE grade_assessments ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'external_form_url'")) await db.exec('ALTER TABLE grade_assessments ADD COLUMN external_form_url TEXT')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'video_url'")) await db.exec('ALTER TABLE grade_assessments ADD COLUMN video_url TEXT')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'time_limit_minutes'")) await db.exec('ALTER TABLE grade_assessments ADD COLUMN time_limit_minutes INTEGER')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'grading_mode'")) await db.exec("ALTER TABLE grade_assessments ADD COLUMN grading_mode TEXT NOT NULL DEFAULT 'auto'")
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'activity_type'")) await db.exec("ALTER TABLE grade_assessments ADD COLUMN activity_type TEXT NOT NULL DEFAULT 'assignment'")
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'grade_assessments' AND column_name = 'integrity_monitoring'")) await db.exec('ALTER TABLE grade_assessments ADD COLUMN integrity_monitoring INTEGER NOT NULL DEFAULT 0')
  } else {
    const schoolLifecycleColumns = await db.all('PRAGMA table_info(schools)')
    for (const [column, definition] of [['is_active', 'INTEGER NOT NULL DEFAULT 1'], ['suspension_reason', "TEXT NOT NULL DEFAULT ''"], ['suspended_at', 'TEXT'], ['archived_at', 'TEXT']]) {
      if (!schoolLifecycleColumns.some(item => item.name === column)) await db.exec(`ALTER TABLE schools ADD COLUMN ${column} ${definition}`)
    }
    const studentAccessColumns = await db.all('PRAGMA table_info(students)')
    for (const [column, definition] of [['access_status', "TEXT NOT NULL DEFAULT 'Activo'"], ['access_suspension_reason', "TEXT NOT NULL DEFAULT ''"], ['access_suspended_at', 'TEXT'], ['access_suspended_by', 'TEXT']]) {
      if (!studentAccessColumns.some(item => item.name === column)) await db.exec(`ALTER TABLE students ADD COLUMN ${column} ${definition}`)
    }
    const studentColumns = await db.all('PRAGMA table_info(students)')
    for (const [column, definition] of [['card_code', 'TEXT'], ['photo_content_type', 'TEXT'], ['photo_file_name', 'TEXT'], ['photo_data', 'BLOB'], ['document_type', "TEXT NOT NULL DEFAULT ''"], ['document_issued_place', "TEXT NOT NULL DEFAULT ''"], ['sex', "TEXT NOT NULL DEFAULT ''"], ['date_of_birth', "TEXT NOT NULL DEFAULT ''"]]) {
      if (!studentColumns.some(item => item.name === column)) await db.exec(`ALTER TABLE students ADD COLUMN ${column} ${definition}`)
    }
    const certificateColumns = await db.all('PRAGMA table_info(school_certificates)')
    for (const [column, definition] of [['verification_code', 'TEXT'], ['signature_snapshot', "TEXT NOT NULL DEFAULT '[]'"], ['status', "TEXT NOT NULL DEFAULT 'Emitida'"], ['rector_user_id', 'TEXT REFERENCES users(id)'], ['rector_name', "TEXT NOT NULL DEFAULT ''"], ['signed_at', 'TEXT'], ['replaced_by_id', 'TEXT REFERENCES school_certificates(id)'], ['annul_note', "TEXT NOT NULL DEFAULT ''"], ['annulled_by', 'TEXT REFERENCES users(id)'], ['annulled_at', 'TEXT']]) {
      if (!certificateColumns.some(item => item.name === column)) await db.exec(`ALTER TABLE school_certificates ADD COLUMN ${column} ${definition}`)
    }
    for (const [column, definition] of [['student_document_type', "TEXT NOT NULL DEFAULT ''"], ['student_document_number', "TEXT NOT NULL DEFAULT ''"], ['student_document_issued_place', "TEXT NOT NULL DEFAULT ''"], ['requester_name', "TEXT NOT NULL DEFAULT ''"], ['requester_role', "TEXT NOT NULL DEFAULT ''"]]) {
      if (!certificateColumns.some(item => item.name === column)) await db.exec(`ALTER TABLE school_certificates ADD COLUMN ${column} ${definition}`)
    }
    for (const [table, columns] of [['school_certificates', [['enrollment_id', 'TEXT REFERENCES student_enrollments(id) ON DELETE SET NULL'], ['course_id', 'TEXT REFERENCES courses(id) ON DELETE SET NULL'], ['grade_snapshot', "TEXT NOT NULL DEFAULT ''"], ['course_name_snapshot', "TEXT NOT NULL DEFAULT ''"], ['academic_status_snapshot', "TEXT NOT NULL DEFAULT ''"]]], ['school_certificate_requests', [['enrollment_id', 'TEXT REFERENCES student_enrollments(id) ON DELETE SET NULL'], ['course_id', 'TEXT REFERENCES courses(id) ON DELETE SET NULL'], ['grade_snapshot', "TEXT NOT NULL DEFAULT ''"], ['course_name_snapshot', "TEXT NOT NULL DEFAULT ''"], ['academic_status_snapshot', "TEXT NOT NULL DEFAULT ''"]]]]) {
      const existing = table === 'school_certificates' ? certificateColumns : await db.all('PRAGMA table_info(school_certificate_requests)')
      for (const [column, definition] of columns) if (!existing.some(item => item.name === column)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    const certificateRequestColumns = await db.all('PRAGMA table_info(school_certificate_requests)')
    if (!certificateRequestColumns.some(item => item.name === 'requester_role')) await db.exec("ALTER TABLE school_certificate_requests ADD COLUMN requester_role TEXT NOT NULL DEFAULT ''")
    const eventColumns = await db.all('PRAGMA table_info(school_events)')
    if (!eventColumns.some(column => column.name === 'registration_capacity')) await db.exec('ALTER TABLE school_events ADD COLUMN registration_capacity INTEGER')
    if (!eventColumns.some(column => column.name === 'registration_deadline')) await db.exec('ALTER TABLE school_events ADD COLUMN registration_deadline TEXT')
    if (!eventColumns.some(column => column.name === 'registration_open')) await db.exec('ALTER TABLE school_events ADD COLUMN registration_open INTEGER NOT NULL DEFAULT 0')
    const schoolColumns = await db.all('PRAGMA table_info(schools)')
    if (!schoolColumns.some(column => column.name === 'contact_email')) await db.exec("ALTER TABLE schools ADD COLUMN contact_email TEXT NOT NULL DEFAULT ''")
    if (!schoolColumns.some(column => column.name === 'contact_phone')) await db.exec("ALTER TABLE schools ADD COLUMN contact_phone TEXT NOT NULL DEFAULT ''")
    if (!schoolColumns.some(column => column.name === 'address')) await db.exec("ALTER TABLE schools ADD COLUMN address TEXT NOT NULL DEFAULT ''")
    if (!schoolColumns.some(column => column.name === 'primary_color')) await db.exec("ALTER TABLE schools ADD COLUMN primary_color TEXT NOT NULL DEFAULT '#6c70df'")
    if (!schoolColumns.some(column => column.name === 'logo_content_type')) await db.exec('ALTER TABLE schools ADD COLUMN logo_content_type TEXT')
    if (!schoolColumns.some(column => column.name === 'logo_file_name')) await db.exec('ALTER TABLE schools ADD COLUMN logo_file_name TEXT')
    if (!schoolColumns.some(column => column.name === 'logo_data')) await db.exec('ALTER TABLE schools ADD COLUMN logo_data BLOB')
    const userColumns = await db.all('PRAGMA table_info(users)')
    if (!userColumns.some(column => column.name === 'deleted_at')) await db.exec('ALTER TABLE users ADD COLUMN deleted_at TEXT')
    for (const [column, definition] of [['contact_phone', "TEXT NOT NULL DEFAULT ''"], ['profile_photo_content_type', 'TEXT'], ['profile_photo_file_name', 'TEXT'], ['profile_photo_data', 'BLOB']]) {
      if (!userColumns.some(item => item.name === column)) await db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`)
    }
    const courseColumns = await db.all('PRAGMA table_info(courses)')
    if (!courseColumns.some(column => column.name === 'is_active')) await db.exec('ALTER TABLE courses ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
    const assessmentColumns = await db.all('PRAGMA table_info(grade_assessments)')
    if (!assessmentColumns.some(column => column.name === 'instructions')) await db.exec("ALTER TABLE grade_assessments ADD COLUMN instructions TEXT NOT NULL DEFAULT ''")
    if (!assessmentColumns.some(column => column.name === 'due_at')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN due_at TEXT')
    if (!assessmentColumns.some(column => column.name === 'weight_percent')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN weight_percent REAL NOT NULL DEFAULT 100')
    if (!assessmentColumns.some(column => column.name === 'delivery_mode')) await db.exec("ALTER TABLE grade_assessments ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'file'")
    if (!assessmentColumns.some(column => column.name === 'is_published')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1')
    if (!assessmentColumns.some(column => column.name === 'external_form_url')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN external_form_url TEXT')
    if (!assessmentColumns.some(column => column.name === 'video_url')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN video_url TEXT')
    if (!assessmentColumns.some(column => column.name === 'time_limit_minutes')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN time_limit_minutes INTEGER')
    if (!assessmentColumns.some(column => column.name === 'grading_mode')) await db.exec("ALTER TABLE grade_assessments ADD COLUMN grading_mode TEXT NOT NULL DEFAULT 'auto'")
    if (!assessmentColumns.some(column => column.name === 'activity_type')) await db.exec("ALTER TABLE grade_assessments ADD COLUMN activity_type TEXT NOT NULL DEFAULT 'assignment'")
    if (!assessmentColumns.some(column => column.name === 'integrity_monitoring')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN integrity_monitoring INTEGER NOT NULL DEFAULT 0')
  }
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS students_card_code_idx ON students(card_code)')
  if (!await db.get("SELECT version FROM schema_migrations WHERE version = ?", 21)) {
    if (usePostgres) {
      if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'report_card_verifications' AND column_name = 'signature_snapshot'")) await db.exec("ALTER TABLE report_card_verifications ADD COLUMN signature_snapshot TEXT NOT NULL DEFAULT '[]'")
    } else {
      const reportVerificationColumns = await db.all('PRAGMA table_info(report_card_verifications)')
      if (!reportVerificationColumns.some(item => item.name === 'signature_snapshot')) await db.exec("ALTER TABLE report_card_verifications ADD COLUMN signature_snapshot TEXT NOT NULL DEFAULT '[]'")
    }
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 21)
  }
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 22)) {
    const additions = [
      ['school_certificates', 'document_number', "TEXT NOT NULL DEFAULT ''"],
      ['report_card_verifications', 'document_number', "TEXT NOT NULL DEFAULT ''"],
      ['enrollment_requests', 'document_number', "TEXT NOT NULL DEFAULT ''"],
      ['student_enrollments', 'document_number', "TEXT NOT NULL DEFAULT ''"],
    ]
    for (const [table, column, definition] of additions) {
      const exists = usePostgres
        ? await db.get('SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?', table, column)
        : (await db.all(`PRAGMA table_info(${table})`)).some(item => item.name === column)
      if (!exists) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    const oldCertificates = await db.all("SELECT id, school_id AS \"schoolId\", student_id AS \"studentId\", student_name AS \"studentName\", academic_year AS \"academicYear\", issued_by AS \"createdBy\", status, created_at AS \"createdAt\" FROM school_certificates WHERE document_number = '' ORDER BY created_at, id")
    for (const item of oldCertificates) await db.transaction(async tx => {
      const documentNumber = await nextDocumentNumber(tx, item.schoolId, 'CERT', item.academicYear)
      await tx.run('UPDATE school_certificates SET document_number = ? WHERE id = ? AND document_number = \'\'', documentNumber, item.id)
      await registerControlledDocument(tx, { schoolId: item.schoolId, documentType: 'CERT', documentNumber, referenceId: item.id, studentId: item.studentId, studentName: item.studentName, academicYear: item.academicYear, status: item.status, createdBy: item.createdBy, createdAt: item.createdAt })
    })
    const oldReports = await db.all("SELECT r.token, r.school_id AS \"schoolId\", r.student_id AS \"studentId\", s.full_name AS \"studentName\", r.academic_year AS \"academicYear\", r.period, r.created_at AS \"createdAt\", CASE WHEN COALESCE(p.is_published, 0) = 1 THEN 'Publicado' ELSE 'Vista previa' END AS status FROM report_card_verifications r JOIN students s ON s.id = r.student_id LEFT JOIN grade_period_publications p ON p.school_id = r.school_id AND p.academic_year = r.academic_year AND p.period = r.period WHERE r.document_number = '' ORDER BY r.created_at, r.token")
    for (const item of oldReports) await db.transaction(async tx => {
      const documentNumber = await nextDocumentNumber(tx, item.schoolId, 'BOL', item.academicYear)
      await tx.run('UPDATE report_card_verifications SET document_number = ? WHERE token = ? AND document_number = \'\'', documentNumber, item.token)
      await registerControlledDocument(tx, { schoolId: item.schoolId, documentType: 'BOL', documentNumber, referenceId: item.token, studentId: item.studentId, studentName: item.studentName, academicYear: item.academicYear, period: item.period, status: item.status, createdAt: item.createdAt })
    })
    const oldEnrollments = await db.all("SELECT se.id, se.school_id AS \"schoolId\", se.student_id AS \"studentId\", st.full_name AS \"studentName\", se.academic_year AS \"academicYear\", se.status, se.created_by AS \"createdBy\", se.created_at AS \"createdAt\" FROM student_enrollments se JOIN students st ON st.id = se.student_id WHERE se.document_number = '' ORDER BY se.created_at, se.id")
    for (const item of oldEnrollments) await db.transaction(async tx => {
      const documentNumber = await nextDocumentNumber(tx, item.schoolId, 'MAT', item.academicYear)
      await tx.run('UPDATE student_enrollments SET document_number = ? WHERE id = ? AND document_number = \'\'', documentNumber, item.id)
      await registerControlledDocument(tx, { schoolId: item.schoolId, documentType: 'MAT', documentNumber, referenceId: item.id, studentId: item.studentId, studentName: item.studentName, academicYear: item.academicYear, status: item.status, createdBy: item.createdBy, createdAt: item.createdAt })
    })
    const oldRequests = await db.all("SELECT id, school_id AS \"schoolId\", student_id AS \"studentId\", student_name AS \"studentName\", academic_year AS \"academicYear\", status, created_by AS \"createdBy\", created_at AS \"createdAt\" FROM enrollment_requests WHERE document_number = '' ORDER BY created_at, id")
    for (const item of oldRequests) await db.transaction(async tx => {
      const documentNumber = await nextDocumentNumber(tx, item.schoolId, 'SOLMAT', item.academicYear)
      await tx.run('UPDATE enrollment_requests SET document_number = ? WHERE id = ? AND document_number = \'\'', documentNumber, item.id)
      await registerControlledDocument(tx, { schoolId: item.schoolId, documentType: 'SOLMAT', documentNumber, referenceId: item.id, studentId: item.studentId, studentName: item.studentName, academicYear: item.academicYear, status: item.status, createdBy: item.createdBy, createdAt: item.createdAt })
    })
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 22)
  }
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 23)) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_requests (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        email TEXT NOT NULL,
        full_name_snapshot TEXT NOT NULL DEFAULT '',
        role_snapshot TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','Aprobada','Rechazada','Completada')),
        reset_token_hash TEXT,
        token_expires_at TEXT,
        requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        review_note TEXT NOT NULL DEFAULT '',
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS password_reset_requests_inbox_idx ON password_reset_requests(school_id, status, requested_at);
      CREATE INDEX IF NOT EXISTS password_reset_requests_user_idx ON password_reset_requests(school_id, user_id, status);
    `)
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 23)
  }
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 24)) {
    const exists = usePostgres
      ? await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'enrollment_requests' AND column_name = 'guardian_email'")
      : (await db.all('PRAGMA table_info(enrollment_requests)')).some(item => item.name === 'guardian_email')
    if (!exists) await db.exec("ALTER TABLE enrollment_requests ADD COLUMN guardian_email TEXT NOT NULL DEFAULT ''")
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 24)
  }
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 25)) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
      );
      CREATE INDEX IF NOT EXISTS direct_messages_thread_idx ON direct_messages(school_id, thread_id, created_at);
      CREATE INDEX IF NOT EXISTS direct_messages_inbox_idx ON direct_messages(school_id, recipient_id, read_at, created_at);
      CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages(school_id, sender_id, created_at);
    `)
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 25)
  }
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 26)) {
    // La migración 26 ya no crea almacenamiento para sincronizar Google Forms.
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 26)
  }
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 27)) {
    const notificationColumns = usePostgres
      ? await db.all("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'user_notifications'")
      : await db.all('PRAGMA table_info(user_notifications)')
    const names = new Set(notificationColumns.map(column => column.name))
    if (!names.has('target_module')) await db.exec('ALTER TABLE user_notifications ADD COLUMN target_module TEXT')
    if (!names.has('target_id')) await db.exec('ALTER TABLE user_notifications ADD COLUMN target_id TEXT')
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 27)
  }
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 28)) {
    const submissionColumns = usePostgres
      ? await db.all("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'work_submissions'")
      : await db.all('PRAGMA table_info(work_submissions)')
    const names = new Set(submissionColumns.map(column => column.name))
    if (!names.has('idempotency_key')) await db.exec('ALTER TABLE work_submissions ADD COLUMN idempotency_key TEXT')
    await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS work_submissions_idempotency_idx ON work_submissions(school_id, idempotency_key) WHERE idempotency_key IS NOT NULL")
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 28)
  }
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 29)) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS student_promotion_results (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year TEXT NOT NULL,
        current_grade TEXT NOT NULL,
        result_status TEXT NOT NULL CHECK (result_status IN ('Promovido', 'Reprobado', 'Pendiente', 'Trasladado', 'Desertor')),
        new_grade TEXT NOT NULL DEFAULT '',
        source_reference TEXT NOT NULL DEFAULT 'Informe final de matrículas SIMAT',
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
        UNIQUE (school_id, student_id, academic_year)
      );
      CREATE INDEX IF NOT EXISTS student_promotion_results_history_idx
        ON student_promotion_results(school_id, student_id, academic_year DESC);
    `)
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 29)
  }
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 1)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 2)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 3)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 4)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 5)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 6)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 7)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 8)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 9)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 10)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 11)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 12)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 13)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 14)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 15)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 16)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 17)
  if (!await db.get('SELECT version FROM schema_migrations WHERE version = ?', 18)) {
    const missingCodes = await db.all('SELECT id FROM students WHERE card_code IS NULL OR card_code = \'\'')
    for (const student of missingCodes) await db.run('UPDATE students SET card_code = ? WHERE id = ?', randomUUID(), student.id)
    await db.run("UPDATE school_certificates SET status = 'Anulada', annul_note = 'Documento anterior al proceso de aprobación rectoral' WHERE rector_name = '' AND status = 'Emitida'")
    await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 18)
  }
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 19)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 20)
  const unverifiedCertificates = await db.all("SELECT id FROM school_certificates WHERE verification_code IS NULL OR verification_code = ''")
  for (const certificate of unverifiedCertificates) await db.run('UPDATE school_certificates SET verification_code = ? WHERE id = ?', randomUUID(), certificate.id)
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS school_certificates_verification_code_idx ON school_certificates(verification_code)')
}

export async function logAudit(schoolId, actorUserId, action) {
  await db.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', schoolId, actorUserId || null, action)
}

export const databaseType = usePostgres ? 'postgres' : 'sqlite'
