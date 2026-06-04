<script lang="ts">
	import SetupScreen from '$lib/SetupScreen.svelte';
	import SlideshowScreen from '$lib/SlideshowScreen.svelte';
	import type { ImageEntry, Settings } from '$lib/types';
	import { DEFAULT_SETTINGS } from '$lib/types';
	import { appLog } from '$lib/logger';

	let phase: 'setup' | 'slideshow' = $state('setup');
	let images: ImageEntry[] = $state([]);
	let settings: Settings = $state({ ...DEFAULT_SETTINGS });
	let folderHandle: FileSystemDirectoryHandle | null = $state(null);

	function handleStart(imgs: ImageEntry[], s: Settings, handle: FileSystemDirectoryHandle | null) {
		appLog.info('Starting slideshow phase', {
			imageCount: imgs.length,
			settings: s,
			folderName: handle?.name ?? null
		});
		images = imgs;
		settings = s;
		folderHandle = handle;
		phase = 'slideshow';
	}

	function handleExit() {
		appLog.info('Returning to setup phase');
		phase = 'setup';
	}

	$effect(() => {
		appLog.debug('Root phase changed', { phase, imageCount: images.length });
	});
</script>

<svelte:head>
	<title>PhotoShow</title>
</svelte:head>

{#if phase === 'setup'}
	<SetupScreen {settings} onstart={handleStart} />
{:else}
	<SlideshowScreen {images} {settings} {folderHandle} onexit={handleExit} />
{/if}
