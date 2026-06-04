import type { Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

const SETTINGS_KEY = 'photoshow:settings';

function isValidSettings(value: unknown): value is Settings {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		(v.transition === 'fade' ||
			v.transition === 'kenburns' ||
			v.transition === 'slide' ||
			v.transition === 'zoom') &&
		(v.order === 'alphabetical' || v.order === 'reverse' || v.order === 'random') &&
		typeof v.displayDuration === 'number' &&
		typeof v.transitionDuration === 'number' &&
		typeof v.blurBackground === 'boolean' &&
		typeof v.watchFolderForNewPhotos === 'boolean' &&
		typeof v.crawlSubfolders === 'boolean'
	);
}

export function loadSettings(): Settings {
	if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return { ...DEFAULT_SETTINGS };
		const parsed = JSON.parse(raw) as unknown;
		if (!isValidSettings(parsed)) return { ...DEFAULT_SETTINGS };
		return parsed;
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export function saveSettings(settings: Settings): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// Ignore storage errors.
	}
}
