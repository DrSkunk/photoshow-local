export type Transition = 'fade' | 'kenburns' | 'slide' | 'zoom';
export type Order = 'alphabetical' | 'reverse' | 'random';

export interface Settings {
	transition: Transition;
	order: Order;
	displayDuration: number; // seconds
	transitionDuration: number; // seconds
	blurBackground: boolean;
	watchFolderForNewPhotos: boolean;
	crawlSubfolders: boolean;
}

export interface ImageEntry {
	name: string;
	url: string;
}

export const DEFAULT_SETTINGS: Settings = {
	transition: 'kenburns',
	order: 'alphabetical',
	displayDuration: 6,
	transitionDuration: 1.5,
	blurBackground: true,
	watchFolderForNewPhotos: false,
	crawlSubfolders: false
};
