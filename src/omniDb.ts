import { openDB } from 'idb';

const OMNICLIP_DB_NAME = 'database';
const OMNICLIP_DB_VERSION = 3;
const OMNICLIP_STORE_NAME = 'files';

export type OmniClipStoredFile = {
  hash: string;
  file: File;
  kind: 'video';
  frames?: number;
};

const getOmniDb = () =>
  openDB(OMNICLIP_DB_NAME, OMNICLIP_DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(OMNICLIP_STORE_NAME)) {
        const objectStore = database.createObjectStore(OMNICLIP_STORE_NAME, { keyPath: 'hash' });
        objectStore.createIndex('file', 'file', { unique: true });
      }
    },
  });

export const putOmniVideoFile = async (hash: string, file: File) => {
  const database = await getOmniDb();
  await database.put(OMNICLIP_STORE_NAME, {
    hash,
    file,
    kind: 'video',
  } satisfies OmniClipStoredFile);
};

export const getOmniVideoFile = async (hash: string) => {
  const database = await getOmniDb();
  const record = await database.get(OMNICLIP_STORE_NAME, hash);
  return (record as OmniClipStoredFile | undefined)?.file;
};

export const deleteOmniVideoFile = async (hash: string) => {
  const database = await getOmniDb();
  await database.delete(OMNICLIP_STORE_NAME, hash);
};
