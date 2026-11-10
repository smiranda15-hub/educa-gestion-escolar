const DB_NAME = 'educa-offline-submissions-v1'
const STORE = 'queue'
const KEY_STORE = 'crypto'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento local seguro.'))
  })
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Falló el almacenamiento local.'))
  })
}

async function deviceKey(db) {
  let key = await requestResult(db.transaction(KEY_STORE).objectStore(KEY_STORE).get('device-key'))
  if (!key) {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await requestResult(db.transaction(KEY_STORE, 'readwrite').objectStore(KEY_STORE).put(key, 'device-key'))
  }
  return key
}

export async function queueOfflineSubmission(submission) {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) throw new Error('Este navegador no dispone de almacenamiento local cifrado.')
  const db = await openDb()
  try {
    const key = await deviceKey(db)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plain = new TextEncoder().encode(JSON.stringify(submission))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
    const item = { id: submission.idempotencyKey, iv: iv.buffer, ciphertext: encrypted, queuedAt: new Date().toISOString() }
    await requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).put(item))
    return item.id
  } finally { db.close() }
}

export async function getOfflineSubmissions() {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) return []
  const db = await openDb()
  try {
    const [key, items] = await Promise.all([
      requestResult(db.transaction(KEY_STORE).objectStore(KEY_STORE).get('device-key')),
      requestResult(db.transaction(STORE).objectStore(STORE).getAll())
    ])
    if (!key) return []
    return await Promise.all(items.map(async item => {
      const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(item.iv) }, key, new Uint8Array(item.ciphertext))
      return { ...JSON.parse(new TextDecoder().decode(clear)), queuedAt: item.queuedAt }
    }))
  } finally { db.close() }
}

export async function deleteOfflineSubmission(id) {
  const db = await openDb()
  try { await requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)) }
  finally { db.close() }
}
