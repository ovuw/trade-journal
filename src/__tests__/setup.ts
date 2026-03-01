// Vitest global setup — runs before each test file.
// Node.js 25+ exposes a built-in `localStorage` global that is read-only
// without the --localstorage-file CLI flag. Override it with an in-memory
// implementation so db.ts tests can call setItem/removeItem normally.

const store: Record<string, string> = {}

const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) },
  get length() { return Object.keys(store).length },
  key: (i: number) => Object.keys(store)[i] ?? null,
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})
