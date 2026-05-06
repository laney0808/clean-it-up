// Handles file persistence across sessions.
// Option A: File System Access API (Chrome/Edge) - stores handle, no file copy
// Option B: OPFS (Safari fallback) - copies file into browser storage

const isFileSystemAccessSupported = () =>
  'showOpenFilePicker' in window

// ─── Option A: File System Access API ───────────────────────────────────────

export async function pickAndStoreFileHandle(): Promise<{
  handle: FileSystemFileHandle
  file: File
}> {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'Video', accept: { 'video/*': [] } }],
    multiple: false,
  })
  const file = await handle.getFile()
  return { handle, file }
}

export async function resolveFileHandle(
  handle: FileSystemFileHandle
): Promise<File | null> {
  try {
    const permission = await handle.requestPermission({ mode: 'read' })
    if (permission !== 'granted') return null
    return await handle.getFile()
  } catch {
    return null
  }
}

// ─── Option B: OPFS fallback ─────────────────────────────────────────────────

export async function storeFileInOPFS(file: File, key: string): Promise<string> {
  const root = await navigator.storage.getDirectory()
  const fileHandle = await root.getFileHandle(key, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(file)
  await writable.close()
  return key
}

export async function resolveOPFSFile(key: string): Promise<File | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const fileHandle = await root.getFileHandle(key)
    return await fileHandle.getFile()
  } catch {
    return null
  }
}

export async function deleteOPFSFile(key: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(key)
  } catch {}
}

// ─── Unified API ─────────────────────────────────────────────────────────────

export type StoredFileRef =
  | { method: 'handle'; handle: FileSystemFileHandle }
  | { method: 'opfs'; key: string }
  | { method: 'arraybuffer' } // legacy fallback for existing data

export async function pickAndStoreFile(videoId: string): Promise<{
  ref: StoredFileRef
  file: File
}> {
  if (isFileSystemAccessSupported()) {
    const { handle, file } = await pickAndStoreFileHandle()
    return { ref: { method: 'handle', handle }, file }
  } else {
    // Safari: show file picker via input, then copy to OPFS
    const file = await pickFileFallback()
    const key = `video_${videoId}`
    await storeFileInOPFS(file, key)
    return { ref: { method: 'opfs', key }, file }
  }
}

export async function resolveStoredFile(
  ref: StoredFileRef,
  legacyData?: ArrayBuffer,
  legacyType?: string,
  legacyName?: string
): Promise<File | null> {
  if (ref.method === 'handle') {
    return resolveFileHandle(ref.handle)
  }
  if (ref.method === 'opfs') {
    return resolveOPFSFile(ref.key)
  }
  if (ref.method === 'arraybuffer' && legacyData) {
    // migrate existing ArrayBuffer data
    return new File([legacyData], legacyName ?? 'video', { type: legacyType })
  }
  return null
}

// ─── Internal: fallback file picker for Safari ───────────────────────────────

function pickFileFallback(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) resolve(file)
      else reject(new Error('No file selected'))
    }
    input.click()
  })
}