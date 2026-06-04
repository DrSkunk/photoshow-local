import { appLog } from './logger';
const DB_NAME = 'photoshow';
const STORE = 'handles';
const KEY = 'lastFolder';

function openDB(): Promise<IDBDatabase> {
	appLog.debug('Opening IndexedDB database', { database: DB_NAME, store: STORE });
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			appLog.info('IndexedDB upgrade needed; creating store', { store: STORE });
			req.result.createObjectStore(STORE);
		};
		req.onsuccess = () => {
			appLog.debug('IndexedDB opened successfully');
			resolve(req.result);
		};
		req.onerror = () => {
			appLog.error('Failed to open IndexedDB', { error: req.error?.message ?? req.error });
			reject(req.error);
		};
	});
}

export async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
	appLog.info('Persisting folder handle', { folderName: handle.name });
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(handle, KEY);
		tx.oncomplete = () => {
			appLog.info('Folder handle saved successfully');
			resolve();
		};
		tx.onerror = () => {
			appLog.error('Failed to save folder handle', { error: tx.error?.message ?? tx.error });
			reject(tx.error);
		};
	});
}

export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
	appLog.debug('Loading persisted folder handle');
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(KEY);
		req.onsuccess = () => {
			const handle = (req.result as FileSystemDirectoryHandle) ?? null;
			appLog.info('Loaded persisted folder handle', { found: !!handle, folderName: handle?.name });
			resolve(handle);
		};
		req.onerror = () => {
			appLog.error('Failed to load folder handle', { error: req.error?.message ?? req.error });
			reject(req.error);
		};
	});
}
