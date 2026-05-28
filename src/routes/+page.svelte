<script lang="ts">
	import SetupScreen from '$lib/SetupScreen.svelte';
	import SlideshowScreen from '$lib/SlideshowScreen.svelte';
	import type { ImageEntry, Settings } from '$lib/types';
	import { DEFAULT_SETTINGS } from '$lib/types';

	let phase: 'setup' | 'slideshow' = $state('setup');
	let images: ImageEntry[] = $state([]);
	let settings: Settings = $state({ ...DEFAULT_SETTINGS });

	function handleStart(imgs: ImageEntry[], s: Settings) {
		images = imgs;
		settings = s;
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
	<SlideshowScreen {images} {settings} onexit={handleExit} />
{/if}
