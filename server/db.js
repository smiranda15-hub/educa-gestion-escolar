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
  `)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 1)
  await db.run('INSERT INTO schema_migrations(version) VALUES (?) ON CONFLICT(version) DO NOTHING', 2)
}

export async function logAudit(schoolId, actorUserId, action) {
  await db.run('INSERT INTO audit_log (school_id, actor_user_id, action) VALUES (?, ?, ?)', schoolId, actorUserId || null, action)
}

export const databaseType = usePostgres ? 'postgres' : 'sqlite'
