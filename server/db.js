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
  `)
  if (usePostgres) {
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'deleted_at'")) await db.exec('ALTER TABLE users ADD COLUMN deleted_at TEXT')
    if (!await db.get("SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'courses' AND column_name = 'is_active'")) await db.exec('ALTER TABLE courses ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
  } else {
    const userColumns = await db.all('PRAGMA table_info(users)')
    if (!userColumns.some(column => column.name === 'deleted_at')) await db.exec('ALTER TABLE users ADD COLUMN deleted_at TEXT')
    const courseColumns = await db.all('PRAGMA table_info(courses)')
    if (!courseColumns.some(column => column.name === 'is_active')) await db.exec('ALTER TABLE courses ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
  }
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 1)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 2)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 3)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 4)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 5)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 6)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 7)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 8)
}

export async function logAudit(schoolId, actorUserId, action) {
  await db.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', schoolId, actorUserId || null, action)
}

export const databaseType = usePostgres ? 'postgres' : 'sqlite'
