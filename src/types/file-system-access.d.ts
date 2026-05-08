// Minimal DOM type augmentations for the File System Access API used in `src/utils/fileStorage.ts`.
// Keeps `tsc --noEmit` happy without requiring additional DOM lib packages.

interface Window {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
}

interface FileSystemFileHandle {
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

