import { currentZone } from './domain/dates'
import { applyAction, initialState } from './domain/pomodoro'
import type { Action, AppState, Mutation } from './domain/pomodoro'

const databaseName = 'pomodoro-web'
const table = 'app'
const key = 'state'
let connection: Promise<IDBDatabase> | undefined

function openDatabase() {
  if (connection) return connection
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(table)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        connection = undefined
      }
      resolve(database)
    }
  }).catch((error) => {
    connection = undefined
    throw error
  })
  return connection
}

export async function readState(): Promise<AppState> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(table).objectStore(table).get(key)
    request.onsuccess = () => resolve(request.result ?? initialState())
    request.onerror = () => reject(request.error)
  })
}

export async function saveAction(action: Action): Promise<Mutation & { changed: boolean }> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    // Read and commit in the same transaction so open tabs share one active timer
    // and a completed session can only issue one capsule.
    const transaction = database.transaction(table, 'readwrite')
    const store = transaction.objectStore(table)
    const request = store.get(key)
    let result: Mutation & { changed: boolean }
    let failure: unknown

    request.onsuccess = () => {
      try {
        const previous: AppState = request.result ?? initialState()
        const mutation = applyAction(previous, action, {
          now: Date.now(),
          zone: currentZone(),
          foreground: document.visibilityState === 'visible',
        })
        const changed = mutation.state !== previous
        result = {
          ...mutation,
          changed,
          state: changed ? { ...mutation.state, revision: previous.revision + 1 } : previous,
        }
        if (changed) store.put(result.state, key)
      } catch (error) {
        failure = error
        transaction.abort()
      }
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onabort = () => reject(failure ?? transaction.error)
  })
}
