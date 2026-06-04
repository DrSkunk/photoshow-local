<script lang="ts">
	import { onMount } from 'svelte';
	import SetupScreen from '$lib/SetupScreen.svelte';
	import SlideshowScreen from '$lib/SlideshowScreen.svelte';
	import type { ImageEntry, Settings } from '$lib/types';
	import { DEFAULT_SETTINGS } from '$lib/types';
	import { loadSettings, saveSettings } from '$lib/settingsMemory';
	import { appLog } from '$lib/logger';

	let phase: 'setup' | 'slideshow' = $state('setup');
	let images: ImageEntry[] = $state([]);
	let settings: Settings = $state({ ...DEFAULT_SETTINGS });
	let folderHandle: FileSystemDirectoryHandle | null = $state(null);

	onMount(() => {
		settings = loadSettings();
	});

	$effect(() => {
		saveSettings(settings);
	});

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

	function handleSettingsChange(nextSettings: Settings) {
		settings = nextSettings;
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
	<SetupScreen {settings} onstart={handleStart} onsettingschange={handleSettingsChange} />
{:else}
	<SlideshowScreen
		{images}
		{settings}
		{folderHandle}
		onexit={handleExit}
		onsettingschange={handleSettingsChange}
	/>
{/if}
