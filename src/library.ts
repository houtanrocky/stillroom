import type { RunData } from './App'

let connection: Promise<IDBDatabase> | undefined

function database() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('stillroom-library', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('attempts', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return connection
}

export async function saveAttempt(attempt: RunData) {
  const db = await database()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('attempts', 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
    tx.objectStore('attempts').put(attempt)
  })
}

export async function listAttempts(): Promise<RunData[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db.transaction('attempts').objectStore('attempts').getAll()
    request.onsuccess = () => resolve((request.result as RunData[]).sort((a, b) => b.updated - a.updated))
    request.onerror = () => reject(request.error)
  })
}
