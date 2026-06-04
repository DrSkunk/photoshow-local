<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { ImageEntry, Settings, Transition, Order } from './types';
	import { saveHandle, loadHandle } from './folderMemory';
	import { appLog } from './logger';

	let {
		settings,
		onstart,
		onsettingschange
	}: {
		settings: Settings;
		onstart: (
			images: ImageEntry[],
			settings: Settings,
			folderHandle: FileSystemDirectoryHandle | null
		) => void;
		onsettingschange: (settings: Settings) => void;
	} = $props();

	let transition: Transition = $state(untrack(() => settings.transition));
	let order: Order = $state(untrack(() => settings.order));
	let displayDuration: number = $state(untrack(() => settings.displayDuration));
	let transitionDuration: number = $state(untrack(() => settings.transitionDuration));
	let blurBackground: boolean = $state(untrack(() => settings.blurBackground));
	let watchFolderForNewPhotos: boolean = $state(untrack(() => settings.watchFolderForNewPhotos));
	let crawlSubfolders: boolean = $state(untrack(() => settings.crawlSubfolders));
	let error: string = $state('');
	let loading: boolean = $state(false);
	let savedHandle: FileSystemDirectoryHandle | null = $state(null);
	let folderInput: HTMLInputElement | null = $state(null);
	let supportsDirectoryPicker: boolean = $state(false);

	const IMAGE_TYPES = [
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/avif',
		'image/bmp'
	];

	type DirectoryHandleWithPermissionRequest = FileSystemDirectoryHandle & {
		requestPermission: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
	};

	function supportsRequestPermission(
		handle: FileSystemDirectoryHandle
	): handle is DirectoryHandleWithPermissionRequest {
		return 'requestPermission' in handle;
	}

	onMount(async () => {
		supportsDirectoryPicker = 'showDirectoryPicker' in window;
		appLog.info('Setup screen mounted', { supportsDirectoryPicker });
		if (!supportsDirectoryPicker) watchFolderForNewPhotos = false;
		try {
			savedHandle = await loadHandle();
			appLog.info('Setup loaded saved handle', {
				hasSavedHandle: !!savedHandle,
				folderName: savedHandle?.name ?? null
			});
		} catch {
			appLog.warn('Setup could not load saved folder handle');
			// IndexedDB unavailable; ignore
		}
	});

	$effect(() => {
		appLog.info('Setup settings updated', {
			transition,
			order,
			displayDuration,
			transitionDuration,
			blurBackground,
			watchFolderForNewPhotos,
			crawlSubfolders
		});
		onsettingschange({
			transition,
			order,
			displayDuration,
			transitionDuration,
			blurBackground,
			watchFolderForNewPhotos,
			crawlSubfolders
		});
	});

	async function collectDirectoryImages(
		dirHandle: FileSystemDirectoryHandle,
		includeSubfolders: boolean,
		parentPath = ''
	): Promise<ImageEntry[]> {
		appLog.debug('Scanning directory for images', {
			directoryName: dirHandle.name,
			parentPath,
			includeSubfolders
		});
		const entries: ImageEntry[] = [];
		for await (const [name, handle] of dirHandle.entries()) {
			const relativeName = parentPath ? `${parentPath}/${name}` : name;
			appLog.trace('Inspecting directory entry', {
				name,
				relativeName,
				kind: handle.kind
			});
			if (handle.kind === 'file') {
				const file = await handle.getFile();
				if (IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(name)) {
					appLog.debug('Adding image file from directory scan', {
						relativeName,
						fileType: file.type || 'unknown'
					});
					entries.push({ name: relativeName, url: URL.createObjectURL(file) });
				}
			} else if (includeSubfolders) {
				appLog.trace('Descending into subfolder', { relativeName });
				entries.push(...(await collectDirectoryImages(handle, includeSubfolders, relativeName)));
			}
		}
		appLog.info('Directory scan complete', {
			directoryName: dirHandle.name,
			parentPath,
			imagesFound: entries.length
		});
		return entries;
	}

	async function loadFromHandle(dirHandle: FileSystemDirectoryHandle) {
		appLog.info('Loading slideshow from folder handle', {
			folderName: dirHandle.name,
			order,
			crawlSubfolders
		});
		loading = true;
		error = '';
		const entries = await collectDirectoryImages(dirHandle, crawlSubfolders);
		loading = false;
		if (entries.length === 0) {
			appLog.warn('No images found in selected folder', { folderName: dirHandle.name });
			error = 'No images found in that folder.';
			return;
		}
		const sorted = sortImages(entries, order);
		appLog.info('Starting slideshow from folder handle', {
			folderName: dirHandle.name,
			totalImages: sorted.length,
			transition,
			displayDuration,
			transitionDuration,
			blurBackground,
			watchFolderForNewPhotos,
			crawlSubfolders
		});
		onstart(
			sorted,
			{
				transition,
				order,
				displayDuration,
				transitionDuration,
				blurBackground,
				watchFolderForNewPhotos,
				crawlSubfolders
			},
			dirHandle
		);
	}

	async function reopenFolder() {
		if (!savedHandle) return;
		appLog.info('Attempting to reopen saved folder', { folderName: savedHandle.name });
		try {
			if (supportsRequestPermission(savedHandle)) {
				const permission = await savedHandle.requestPermission({ mode: 'read' });
				appLog.info('Permission request result for saved folder', {
					folderName: savedHandle.name,
					permission
				});
				if (permission !== 'granted') {
					error = 'Permission denied for saved folder.';
					return;
				}
			}
			await loadFromHandle(savedHandle);
		} catch (e: unknown) {
			const err = e as { message?: string };
			appLog.error('Failed to reopen saved folder', {
				folderName: savedHandle.name,
				error: err?.message ?? err
			});
			error = err?.message ?? 'Failed to reopen folder.';
		}
	}

	async function onFolderFilesSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement | null;
		const files = input?.files;
		if (!files || files.length === 0) return;
		appLog.info('Folder selected via file input', {
			fileCount: files.length,
			crawlSubfolders
		});

		loading = true;
		error = '';
		try {
			const entries: ImageEntry[] = [];
			for (const file of Array.from(files)) {
				const relativePath = file.webkitRelativePath || file.name;
				const pathParts = relativePath.split('/').filter(Boolean);
				const isNestedFile = pathParts.length > 2;
				if (!crawlSubfolders && isNestedFile) continue;
				const filename = file.name;
				const entryName = crawlSubfolders
					? pathParts.length > 1
						? pathParts.slice(1).join('/')
						: filename
					: filename;
				if (IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(filename)) {
					appLog.trace('Adding image from file input', {
						filename,
						entryName,
						fileType: file.type || 'unknown'
					});
					entries.push({ name: entryName, url: URL.createObjectURL(file) });
				}
			}

			if (entries.length === 0) {
				appLog.warn('No images found from file input selection');
				error = 'No images found in that folder.';
				return;
			}

			const sorted = sortImages(entries, order);
			appLog.info('Starting slideshow from file input selection', {
				totalImages: sorted.length,
				transition,
				order,
				displayDuration,
				transitionDuration,
				blurBackground,
				watchFolderForNewPhotos,
				crawlSubfolders
			});
			onstart(
				sorted,
				{
					transition,
					order,
					displayDuration,
					transitionDuration,
					blurBackground,
					watchFolderForNewPhotos,
					crawlSubfolders
				},
				null
			);
		} finally {
			loading = false;
			appLog.debug('Folder file input handling complete', { loading });
		}
	}

	async function pickFolder() {
		appLog.info('Pick folder requested', { supportsDirectoryPicker });
		error = '';
		if (!('showDirectoryPicker' in window)) {
			appLog.warn('Directory picker unsupported; using file input fallback');
			folderInput?.click();
			return;
		}
		try {
			const dirHandle = await (
				window as { showDirectoryPicker: (opts: object) => Promise<FileSystemDirectoryHandle> }
			).showDirectoryPicker({ mode: 'read' });
			appLog.info('Directory picker returned handle', { folderName: dirHandle.name });
			await saveHandle(dirHandle).catch((err: unknown) => {
				appLog.warn('Failed to persist selected folder handle', { err });
			});
			savedHandle = dirHandle;
			await loadFromHandle(dirHandle);
		} catch (e: unknown) {
			loading = false;
			const err = e as { name?: string; message?: string };
			if (err?.name !== 'AbortError') {
				appLog.error('Directory picker failed', { error: err?.message ?? err });
				error = err?.message ?? 'Failed to open folder.';
			} else {
				appLog.debug('Directory picker aborted by user');
			}
		}
	}

	function sortImages(imgs: ImageEntry[], ord: Order): ImageEntry[] {
		appLog.debug('Sorting images', { imageCount: imgs.length, order: ord });
		const copy = [...imgs];
		if (ord === 'alphabetical') copy.sort((a, b) => a.name.localeCompare(b.name));
		else if (ord === 'reverse') copy.sort((a, b) => b.name.localeCompare(a.name));
		else {
			for (let i = copy.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[copy[i], copy[j]] = [copy[j], copy[i]];
			}
		}
		appLog.info('Image sorting complete', {
			order: ord,
			firstImage: copy[0]?.name ?? null,
			lastImage: copy[copy.length - 1]?.name ?? null
		});
		return copy;
	}

	const transitions: { value: Transition; label: string }[] = [
		{ value: 'kenburns', label: 'Ken Burns' },
		{ value: 'fade', label: 'Fade' },
		{ value: 'slide', label: 'Slide' },
		{ value: 'zoom', label: 'Zoom' }
	];

	const orders: { value: Order; label: string }[] = [
		{ value: 'alphabetical', label: 'Alphabetical' },
		{ value: 'random', label: 'Random' },
		{ value: 'reverse', label: 'Reverse' }
	];
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-neutral-950 p-6 text-white">
	<div class="w-full max-w-md space-y-10">
		<!-- Header -->
		<div class="space-y-1 text-center">
			<h1 class="text-4xl font-light tracking-widest text-white/90">PHOTOSHOW</h1>
			<p class="text-sm text-white/40">Local folder slideshow</p>
		</div>

		<!-- Folder picker -->
		<div class="flex flex-col items-center gap-3">
			<input
				bind:this={folderInput}
				type="file"
				accept="image/*"
				multiple
				webkitdirectory
				class="hidden"
				onchange={onFolderFilesSelected}
			/>

			<!-- Reopen last folder -->
			{#if savedHandle}
				<button
					onclick={reopenFolder}
					disabled={loading}
					class="flex w-full items-center gap-3 rounded-xl border border-white/25 bg-white/10 px-6 py-4 text-base font-medium transition-all hover:border-white/40 hover:bg-white/15 active:scale-[0.98] disabled:opacity-40"
				>
					<svg
						class="h-5 w-5 shrink-0 text-white/60"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
						/>
					</svg>
					<span class="truncate text-left">
						<span class="block text-xs text-white/40">Last folder</span>
						<span class="block">{savedHandle.name}</span>
					</span>
				</button>
			{/if}

			<!-- Pick new folder -->
			<button
				onclick={pickFolder}
				disabled={loading}
				class="flex items-center gap-3 rounded-xl border border-white/15 bg-white/8 px-8 py-4 text-base font-medium transition-all hover:border-white/30 hover:bg-white/12 active:scale-[0.98] disabled:opacity-40
					{savedHandle ? 'self-start text-sm text-white/60' : ''}"
			>
				{#if loading}
					<svg class="h-5 w-5 animate-spin text-white/60" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
						></path>
					</svg>
					<span>Loading images…</span>
				{:else}
					<svg
						class="h-5 w-5 text-white/60"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.75 9.75h16.5M3.75 9.75A2.25 2.25 0 0 1 6 7.5h3l1.5-2.25h6L18 7.5h.25a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25H5.75A2.25 2.25 0 0 1 3.5 18.75v-9Z"
						/>
					</svg>
					<span>{savedHandle ? 'Choose different folder' : 'Choose Folder'}</span>
				{/if}
			</button>

			{#if error}
				<p class="text-sm text-red-400">{error}</p>
			{/if}
		</div>

		<!-- Options -->
		<div class="space-y-6 rounded-2xl border border-white/8 bg-white/4 p-6">
			<!-- Transition -->
			<div class="space-y-2">
				<span class="text-xs font-medium tracking-widest text-white/40 uppercase">Transition</span>
				<div class="flex gap-2">
					{#each transitions as t (t.value)}
						<button
							onclick={() => (transition = t.value)}
							class="flex-1 rounded-lg py-2 text-sm transition-all
								{transition === t.value
								? 'bg-white font-medium text-neutral-900'
								: 'border border-white/12 text-white/50 hover:border-white/25 hover:text-white/80'}"
						>
							{t.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Order -->
			<div class="space-y-2">
				<span class="text-xs font-medium tracking-widest text-white/40 uppercase">Order</span>
				<div class="flex gap-2">
					{#each orders as o (o.value)}
						<button
							onclick={() => (order = o.value)}
							class="flex-1 rounded-lg py-2 text-sm transition-all
								{order === o.value
								? 'bg-white font-medium text-neutral-900'
								: 'border border-white/12 text-white/50 hover:border-white/25 hover:text-white/80'}"
						>
							{o.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Display duration -->
			<div class="space-y-2">
				<div class="flex justify-between">
					<span class="text-xs font-medium tracking-widest text-white/40 uppercase"
						>Slide duration</span
					>
					<span class="text-xs text-white/50">{displayDuration}s</span>
				</div>
				<input
					type="range"
					min="3"
					max="30"
					step="1"
					bind:value={displayDuration}
					class="slider w-full"
				/>
			</div>

			<!-- Transition duration -->
			<div class="space-y-2">
				<div class="flex justify-between">
					<span class="text-xs font-medium tracking-widest text-white/40 uppercase"
						>Transition speed</span
					>
					<span class="text-xs text-white/50">{transitionDuration}s</span>
				</div>
				<input
					type="range"
					min="0.3"
					max="3"
					step="0.1"
					bind:value={transitionDuration}
					class="slider w-full"
				/>
			</div>

			<!-- Blur background -->
			<div class="flex items-center justify-between">
				<span class="text-xs font-medium tracking-widest text-white/40 uppercase"
					>Blur background</span
				>
				<button
					aria-label="Toggle blur background"
					onclick={() => (blurBackground = !blurBackground)}
					class="relative h-6 w-11 rounded-full transition-colors {blurBackground
						? 'bg-white'
						: 'bg-white/20'}"
					role="switch"
					aria-checked={blurBackground}
				>
					<span
						class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-neutral-950 shadow transition-transform {blurBackground
							? 'translate-x-5'
							: 'translate-x-0'}"
					></span>
				</button>
			</div>

			<!-- Watch folder -->
			<div class="flex items-center justify-between">
				<div class="space-y-1">
					<span class="text-xs font-medium tracking-widest text-white/40 uppercase"
						>Watch folder for new photos</span
					>
					{#if !supportsDirectoryPicker}
						<p class="text-[11px] text-white/35">
							Requires selecting a folder via the folder picker.
						</p>
					{/if}
				</div>
				<button
					aria-label="Toggle watch folder for new photos"
					onclick={() => (watchFolderForNewPhotos = !watchFolderForNewPhotos)}
					disabled={!supportsDirectoryPicker}
					class="relative h-6 w-11 rounded-full transition-colors {watchFolderForNewPhotos
						? 'bg-white'
						: 'bg-white/20'} disabled:cursor-not-allowed disabled:opacity-40"
					role="switch"
					aria-checked={watchFolderForNewPhotos}
				>
					<span
						class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-neutral-950 shadow transition-transform {watchFolderForNewPhotos
							? 'translate-x-5'
							: 'translate-x-0'}"
					></span>
				</button>
			</div>

			<!-- Crawl subfolders -->
			<div class="flex items-center justify-between">
				<div class="space-y-1">
					<span class="text-xs font-medium tracking-widest text-white/40 uppercase"
						>Crawl subfolders</span
					>
					<p class="text-[11px] text-white/35">Include images from nested folders.</p>
				</div>
				<button
					aria-label="Toggle crawl subfolders"
					onclick={() => (crawlSubfolders = !crawlSubfolders)}
					class="relative h-6 w-11 rounded-full transition-colors {crawlSubfolders
						? 'bg-white'
						: 'bg-white/20'}"
					role="switch"
					aria-checked={crawlSubfolders}
				>
					<span
						class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-neutral-950 shadow transition-transform {crawlSubfolders
							? 'translate-x-5'
							: 'translate-x-0'}"
					></span>
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.slider {
		-webkit-appearance: none;
		appearance: none;
		height: 2px;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
		outline: none;
	}
	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		cursor: pointer;
	}
	.slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		cursor: pointer;
		border: none;
	}
</style>
