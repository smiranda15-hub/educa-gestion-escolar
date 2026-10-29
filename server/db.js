import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

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

export async function migrate() {
  const textTimestampDefault = usePostgres ? '(CURRENT_TIMESTAMP::text)' : 'CURRENT_TIMESTAMP'
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
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id),
      full_name TEXT NOT NULL,
      document TEXT NOT NULL,
      grade TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('Activo','Retirado')),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault},
      UNIQUE (school_id, document)
    );
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
      student_id TEXT REFERENCES students(id),
      student_name TEXT NOT NULL,
      document TEXT NOT NULL,
      grade_requested TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT NOT NULL DEFAULT '',
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
      is_published INTEGER NOT NULL DEFAULT 1,
      external_form_url TEXT,
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
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ${textTimestampDefault}
    );
    CREATE INDEX IF NOT EXISTS school_events_school_date_idx ON school_events(school_id, event_date);
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
  } else {
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
    const courseColumns = await db.all('PRAGMA table_info(courses)')
    if (!courseColumns.some(column => column.name === 'is_active')) await db.exec('ALTER TABLE courses ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
    const assessmentColumns = await db.all('PRAGMA table_info(grade_assessments)')
    if (!assessmentColumns.some(column => column.name === 'instructions')) await db.exec("ALTER TABLE grade_assessments ADD COLUMN instructions TEXT NOT NULL DEFAULT ''")
    if (!assessmentColumns.some(column => column.name === 'due_at')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN due_at TEXT')
    if (!assessmentColumns.some(column => column.name === 'weight_percent')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN weight_percent REAL NOT NULL DEFAULT 100')
    if (!assessmentColumns.some(column => column.name === 'delivery_mode')) await db.exec("ALTER TABLE grade_assessments ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'file'")
    if (!assessmentColumns.some(column => column.name === 'is_published')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1')
    if (!assessmentColumns.some(column => column.name === 'external_form_url')) await db.exec('ALTER TABLE grade_assessments ADD COLUMN external_form_url TEXT')
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
}

export async function logAudit(schoolId, actorUserId, action) {
  await db.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', schoolId, actorUserId || null, action)
}

export const databaseType = usePostgres ? 'postgres' : 'sqlite'
