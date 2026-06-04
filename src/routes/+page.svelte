<script lang="ts">
	import SetupScreen from '$lib/SetupScreen.svelte';
	import SlideshowScreen from '$lib/SlideshowScreen.svelte';
	import type { ImageEntry, Settings } from '$lib/types';
	import { DEFAULT_SETTINGS } from '$lib/types';

	let phase: 'setup' | 'slideshow' = $state('setup');
	let images: ImageEntry[] = $state([]);
	let settings: Settings = $state({ ...DEFAULT_SETTINGS });
	let folderHandle: FileSystemDirectoryHandle | null = $state(null);

	function handleStart(imgs: ImageEntry[], s: Settings, handle: FileSystemDirectoryHandle | null) {
		images = imgs;
		settings = s;
		folderHandle = handle;
		phase = 'slideshow';
	}

	function handleExit() {
		phase = 'setup';
	}
</script>

<svelte:head>
	<title>PhotoShow</title>
</svelte:head>

{#if phase === 'setup'}
	<SetupScreen {settings} onstart={handleStart} />
{:else}
	<SlideshowScreen {images} {settings} {folderHandle} onexit={handleExit} />
{/if}
