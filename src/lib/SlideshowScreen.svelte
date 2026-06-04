<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import type { ImageEntry, Settings, Transition, Order } from './types';
	import { appLog } from './logger';

	let {
		images,
		settings: initialSettings,
		folderHandle,
		onexit
	}: {
		images: ImageEntry[];
		settings: Settings;
		folderHandle: FileSystemDirectoryHandle | null;
		onexit: () => void;
	} = $props();

	// ── Mutable settings (changed live from in-slideshow panel) ─────────────────
	let transition: Transition = $state(untrack(() => initialSettings.transition));
	let order: Order = $state(untrack(() => initialSettings.order));
	let displayDuration: number = $state(untrack(() => initialSettings.displayDuration));
	let transitionDuration: number = $state(untrack(() => initialSettings.transitionDuration));
	let blurBackground: boolean = $state(untrack(() => initialSettings.blurBackground));
	let watchFolderForNewPhotos: boolean = $state(
		untrack(() => initialSettings.watchFolderForNewPhotos)
	);
	let crawlSubfolders: boolean = $state(untrack(() => initialSettings.crawlSubfolders));

	// ── Layer state ─────────────────────────────────────────────────────────────
	let layerA: HTMLDivElement | null = $state(null);
	let layerB: HTMLDivElement | null = $state(null);
	let imgA: HTMLImageElement | null = $state(null);
	let imgB: HTMLImageElement | null = $state(null);
	let blurA: HTMLImageElement | null = $state(null);
	let blurB: HTMLImageElement | null = $state(null);

	let currentIndex = $state(0);
	let paused = $state(false);
	let showControls = $state(true);
	let showSettings = $state(false);
	let isFullscreen = $state(false);
	let activeLayer: 'A' | 'B' = 'A';

	let controlsTimer: ReturnType<typeof setTimeout> | null = null;
	let slideTimer: ReturnType<typeof setTimeout> | null = null;
	let watchTimer: ReturnType<typeof setTimeout> | null = null;
	let transitionInProgress = false;
	const watchedImageUrls = new Set<string>();

	const IMAGE_TYPES = [
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/avif',
		'image/bmp'
	];
	const WATCH_INTERVAL_MS = 10000;

	function isImageName(name: string) {
		return /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(name);
	}

	function mergeImagesWithCurrentRotation(newEntries: ImageEntry[]) {
		if (newEntries.length === 0) return;
		appLog.info('Merging newly discovered images into slideshow', {
			newImageCount: newEntries.length,
			order,
			currentImageCount: images.length
		});
		const currentImage = images[currentIndex];
		if (order === 'alphabetical') {
			images = [...images, ...newEntries].sort((a, b) => a.name.localeCompare(b.name));
		} else if (order === 'reverse') {
			images = [...images, ...newEntries].sort((a, b) => b.name.localeCompare(a.name));
		} else {
			const merged = [...images];
			for (const entry of newEntries) {
				const insertAt = Math.floor(Math.random() * (merged.length + 1));
				merged.splice(insertAt, 0, entry);
			}
			images = merged;
		}
		if (!currentImage) return;
		const nextCurrentIndex = images.indexOf(currentImage);
		if (nextCurrentIndex >= 0) currentIndex = nextCurrentIndex;
		appLog.info('Merge complete', {
			totalImageCount: images.length,
			currentIndex,
			currentImageName: images[currentIndex]?.name ?? null
		});
	}

	async function scanForNewImages() {
		if (!watchFolderForNewPhotos || !folderHandle) return;
		appLog.debug('Scanning watched folder for new images', {
			currentImageCount: images.length,
			crawlSubfolders,
			folderName: folderHandle.name
		});
		const knownNames = new Set(images.map((img) => img.name));
		const pendingNames = new Set<string>();
		async function collectNewEntries(
			dirHandle: FileSystemDirectoryHandle,
			includeSubfolders: boolean,
			parentPath = ''
		): Promise<ImageEntry[]> {
			const newEntries: ImageEntry[] = [];
			for await (const [name, handle] of dirHandle.entries()) {
				const relativeName = parentPath ? `${parentPath}/${name}` : name;
				if (handle.kind === 'file') {
					if (knownNames.has(relativeName) || pendingNames.has(relativeName) || !isImageName(name))
						continue;
					const file = await handle.getFile();
					if (IMAGE_TYPES.includes(file.type) || !file.type) {
						const url = URL.createObjectURL(file);
						appLog.info('Detected new watched image', {
							relativeName,
							fileType: file.type || 'unknown'
						});
						watchedImageUrls.add(url);
						pendingNames.add(relativeName);
						newEntries.push({ name: relativeName, url });
					}
				} else if (includeSubfolders) {
					newEntries.push(...(await collectNewEntries(handle, includeSubfolders, relativeName)));
				}
			}
			return newEntries;
		}
		try {
			const newEntries = await collectNewEntries(folderHandle, crawlSubfolders);
			mergeImagesWithCurrentRotation(newEntries);
			appLog.debug('Watched folder scan complete', { newImageCount: newEntries.length });
		} catch {
			appLog.warn('Watched folder scan failed; continuing slideshow');
			// Folder access may fail due to revoked permissions; keep slideshow running.
		}
	}

	function scheduleFolderWatch(
		shouldWatch: boolean = watchFolderForNewPhotos,
		handle: FileSystemDirectoryHandle | null = folderHandle
	) {
		if (watchTimer) clearTimeout(watchTimer);
		appLog.debug('Scheduling folder watch', { shouldWatch, hasHandle: !!handle, intervalMs: WATCH_INTERVAL_MS });
		if (!shouldWatch || !handle) return;
		watchTimer = setTimeout(async () => {
			appLog.trace('Folder watch timer tick');
			await scanForNewImages();
			scheduleFolderWatch(shouldWatch, handle);
		}, WATCH_INTERVAL_MS);
	}

	// ── Ken Burns ───────────────────────────────────────────────────────────────
	function randomBetween(a: number, b: number) {
		return a + Math.random() * (b - a);
	}

	function applyKenBurns(el: HTMLImageElement, durationMs: number) {
		appLog.trace('Applying Ken Burns effect', { durationMs });
		el.getAnimations().forEach((a) => a.cancel());
		const s1 = randomBetween(1.05, 1.18);
		const s2 = randomBetween(1.05, 1.18);
		const tx1 = randomBetween(-5, 5);
		const ty1 = randomBetween(-5, 5);
		const tx2 = randomBetween(-5, 5);
		const ty2 = randomBetween(-5, 5);
		el.animate(
			[
				{ transform: `scale(${s1}) translate(${tx1}%, ${ty1}%)` },
				{ transform: `scale(${s2}) translate(${tx2}%, ${ty2}%)` }
			],
			{ duration: durationMs, easing: 'ease-in-out', fill: 'forwards' }
		);
	}

	// ── Transition ───────────────────────────────────────────────────────────────
	async function transitionTo(nextIndex: number) {
		if (transitionInProgress) return;
		transitionInProgress = true;
		appLog.info('Starting slide transition', {
			fromIndex: currentIndex,
			toIndex: nextIndex,
			transition,
			transitionDuration
		});

		const ms = transitionDuration * 1000;
		const isA = activeLayer === 'A';
		const outLayer = isA ? layerA : layerB;
		const inLayer = isA ? layerB : layerA;
		const inImg = isA ? imgB : imgA;
		const inBlur = isA ? blurB : blurA;

		if (!outLayer || !inLayer || !inImg) {
			appLog.warn('Transition aborted due to missing layer references');
			transitionInProgress = false;
			return;
		}

		const url = images[nextIndex].url;

		// Preload image
		await new Promise<void>((res) => {
			inImg.onload = () => res();
			inImg.onerror = () => res();
			inImg.src = url;
			if (inBlur) inBlur.src = url;
			if (inImg.complete) res();
		});

		// Reset incoming layer
		inLayer.style.transform = '';
		inLayer.style.opacity = '0';
		inLayer.style.zIndex = '2';
		outLayer.style.zIndex = '1';

		// Cancel stale animations
		inLayer.getAnimations().forEach((a) => a.cancel());

		// Ken Burns on incoming image
		if (transition === 'kenburns') {
			applyKenBurns(inImg, (displayDuration + transitionDuration) * 1000);
		} else {
			inImg.getAnimations().forEach((a) => a.cancel());
			inImg.style.transform = '';
		}

		const ease = 'ease-in-out';

		if (transition === 'slide') {
			outLayer.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], {
				duration: ms,
				easing: ease,
				fill: 'forwards'
			});
			inLayer.style.transform = 'translateX(100%)';
			inLayer.style.opacity = '1';
			inLayer.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], {
				duration: ms,
				easing: ease,
				fill: 'forwards'
			});
		} else if (transition === 'zoom') {
			outLayer.animate(
				[
					{ opacity: '1', transform: 'scale(1)' },
					{ opacity: '0', transform: 'scale(1.15)' }
				],
				{ duration: ms, easing: ease, fill: 'forwards' }
			);
			inLayer.style.transform = 'scale(0.8)';
			inLayer.animate(
				[
					{ opacity: '0', transform: 'scale(0.8)' },
					{ opacity: '1', transform: 'scale(1)' }
				],
				{ duration: ms, easing: ease, fill: 'forwards' }
			);
		} else {
			outLayer.animate([{ opacity: '1' }, { opacity: '0' }], {
				duration: ms,
				easing: ease,
				fill: 'forwards'
			});
			inLayer.animate([{ opacity: '0' }, { opacity: '1' }], {
				duration: ms,
				easing: ease,
				fill: 'forwards'
			});
		}

		await new Promise((r) => setTimeout(r, ms));

		// Settle
		outLayer.style.opacity = '0';
		outLayer.style.transform = '';
		outLayer.getAnimations().forEach((a) => a.cancel());
		inLayer.style.opacity = '1';
		inLayer.style.transform = '';

		currentIndex = nextIndex;
		activeLayer = isA ? 'B' : 'A';
		transitionInProgress = false;
		appLog.info('Slide transition complete', {
			currentIndex,
			activeLayer,
			currentImageName: images[currentIndex]?.name ?? null
		});
	}

	// ── Scheduling ───────────────────────────────────────────────────────────────
	function scheduleNext() {
		if (slideTimer) clearTimeout(slideTimer);
		appLog.debug('Scheduling next slide', {
			currentIndex,
			displayDuration,
			paused
		});
		slideTimer = setTimeout(async () => {
			if (!paused) {
				await transitionTo((currentIndex + 1) % images.length);
				scheduleNext();
			}
		}, displayDuration * 1000);
	}

	function prev() {
		appLog.info('Manual previous slide requested', { currentIndex });
		if (slideTimer) clearTimeout(slideTimer);
		transitionTo((currentIndex - 1 + images.length) % images.length).then(scheduleNext);
	}

	function next() {
		appLog.info('Manual next slide requested', { currentIndex });
		if (slideTimer) clearTimeout(slideTimer);
		transitionTo((currentIndex + 1) % images.length).then(scheduleNext);
	}

	function togglePause() {
		paused = !paused;
		appLog.info('Pause state toggled', { paused, currentIndex });
		if (!paused) scheduleNext();
		else if (slideTimer) clearTimeout(slideTimer);
	}

	// ── Fullscreen ───────────────────────────────────────────────────────────────
	function toggleFullscreen() {
		appLog.info('Fullscreen toggle requested', { currentlyFullscreen: !!document.fullscreenElement });
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	}

	function onFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
		appLog.info('Fullscreen state changed', { isFullscreen });
	}

	// ── Controls hide ─────────────────────────────────────────────────────────────
	function resetControlsTimer() {
		showControls = true;
		if (controlsTimer) clearTimeout(controlsTimer);
		appLog.trace('Resetting controls visibility timer', { showSettings });
		controlsTimer = setTimeout(() => {
			if (!showSettings) showControls = false;
			appLog.trace('Controls auto-hide timer fired', { showControls });
		}, 3000);
	}

	function handleKey(e: KeyboardEvent) {
		appLog.debug('Keyboard input received', { key: e.key });
		if (e.key === 'ArrowLeft') prev();
		else if (e.key === 'ArrowRight') next();
		else if (e.key === ' ') {
			e.preventDefault();
			togglePause();
		} else if (e.key === 'Escape') {
			if (showSettings) showSettings = false;
			else onexit();
		} else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
		resetControlsTimer();
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────────
	onMount(() => {
		appLog.info('Slideshow mounted', {
			imageCount: images.length,
			initialTransition: transition,
			initialOrder: order,
			displayDuration,
			transitionDuration,
			blurBackground,
			watchFolderForNewPhotos,
			crawlSubfolders,
			folderName: folderHandle?.name ?? null
		});
		if (imgA && images.length > 0) {
			const url = images[0].url;
			imgA.src = url;
			if (blurA) blurA.src = url;
			if (layerA) {
				layerA.style.opacity = '1';
				layerA.style.zIndex = '2';
			}
			if (layerB) layerB.style.opacity = '0';
			if (transition === 'kenburns') {
				const run = () => {
					if (imgA) applyKenBurns(imgA, (displayDuration + transitionDuration) * 1000);
				};
				if (imgA.complete) run();
				else imgA.onload = run;
			}
		}
		scheduleNext();
		scheduleFolderWatch(watchFolderForNewPhotos, folderHandle);
		resetControlsTimer();
		document.addEventListener('fullscreenchange', onFullscreenChange);
	});

	onDestroy(() => {
		appLog.info('Slideshow destroyed; clearing timers and object URLs', {
			watchedUrlCount: watchedImageUrls.size
		});
		if (slideTimer) clearTimeout(slideTimer);
		if (controlsTimer) clearTimeout(controlsTimer);
		if (watchTimer) clearTimeout(watchTimer);
		for (const url of watchedImageUrls) {
			URL.revokeObjectURL(url);
		}
		watchedImageUrls.clear();
		document.removeEventListener('fullscreenchange', onFullscreenChange);
		if (document.fullscreenElement) document.exitFullscreen();
	});

	$effect(() => {
		appLog.debug('Folder watch effect triggered', {
			watchFolderForNewPhotos,
			hasFolderHandle: !!folderHandle
		});
		scheduleFolderWatch(watchFolderForNewPhotos, folderHandle);
	});

	$effect(() => {
		appLog.info('Slideshow settings updated', {
			transition,
			order,
			displayDuration,
			transitionDuration,
			blurBackground,
			watchFolderForNewPhotos,
			crawlSubfolders
		});
	});

	const transitionOptions: { value: Transition; label: string }[] = [
		{ value: 'kenburns', label: 'Ken Burns' },
		{ value: 'fade', label: 'Fade' },
		{ value: 'slide', label: 'Slide' },
		{ value: 'zoom', label: 'Zoom' }
	];

	const orderOptions: { value: Order; label: string }[] = [
		{ value: 'alphabetical', label: 'A–Z' },
		{ value: 'random', label: 'Random' },
		{ value: 'reverse', label: 'Z–A' }
	];
</script>

<svelte:window onkeydown={handleKey} />

<div class="fixed inset-0 bg-black" role="application" onmousemove={resetControlsTimer}>
	<!-- Layer A -->
	<div bind:this={layerA} class="layer">
		{#if blurBackground}
			<img bind:this={blurA} class="blur-bg" alt="" aria-hidden="true" />
		{/if}
		<img bind:this={imgA} class="slide-img" alt="" />
	</div>

	<!-- Layer B -->
	<div bind:this={layerB} class="layer" style="opacity:0">
		{#if blurBackground}
			<img bind:this={blurB} class="blur-bg" alt="" aria-hidden="true" />
		{/if}
		<img bind:this={imgB} class="slide-img" alt="" />
	</div>

	<!-- Controls overlay -->
	<div
		class="absolute inset-0 z-10 flex flex-col transition-opacity duration-500"
		style="opacity: {showControls ? 1 : 0}; pointer-events: {showControls ? 'auto' : 'none'}"
	>
		<!-- Top bar -->
		<div
			class="flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-5 py-4"
		>
			<span class="max-w-xs truncate text-sm font-light text-white/70"
				>{images[currentIndex]?.name ?? ''}</span
			>
			<div class="flex items-center gap-2">
				<span class="text-xs text-white/40">{currentIndex + 1} / {images.length}</span>

				<!-- Settings -->
				<button
					onclick={() => {
						showSettings = !showSettings;
						resetControlsTimer();
					}}
					class="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white {showSettings
						? 'bg-white/15 text-white'
						: ''}"
					title="Settings"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
						/>
					</svg>
				</button>

				<!-- Fullscreen -->
				<button
					onclick={toggleFullscreen}
					class="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white"
					title="Fullscreen (F)"
				>
					{#if isFullscreen}
						<svg
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
							/>
						</svg>
					{:else}
						<svg
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
							/>
						</svg>
					{/if}
				</button>

				<!-- Exit -->
				<button
					onclick={onexit}
					class="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white"
					title="Exit (Esc)"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<div class="flex-1"></div>

		<!-- Bottom controls -->
		<div
			class="flex items-center justify-center gap-6 bg-gradient-to-t from-black/70 to-transparent px-6 py-6"
		>
			<button
				onclick={prev}
				class="rounded-full p-3 text-white/70 transition-all hover:bg-white/10 hover:text-white"
				title="Previous (←)"
			>
				<svg
					class="h-6 w-6"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
				</svg>
			</button>
			<button
				onclick={togglePause}
				class="rounded-full border border-white/20 p-4 text-white transition-all hover:bg-white/10"
				title="Play/Pause (Space)"
			>
				{#if paused}
					<svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"
						><path d="M8 5v14l11-7z" /></svg
					>
				{:else}
					<svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"
						><path d="M6 19h4V5H6zm8-14v14h4V5z" /></svg
					>
				{/if}
			</button>
			<button
				onclick={next}
				class="rounded-full p-3 text-white/70 transition-all hover:bg-white/10 hover:text-white"
				title="Next (→)"
			>
				<svg
					class="h-6 w-6"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Settings panel -->
	{#if showSettings}
		<!-- Backdrop -->
		<button
			class="absolute inset-0 z-20"
			aria-label="Close settings"
			onclick={() => (showSettings = false)}
		></button>

		<!-- Panel -->
		<div
			class="absolute top-0 right-0 bottom-0 z-30 w-72 overflow-y-auto bg-black/90 p-6 shadow-2xl backdrop-blur-md"
		>
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-sm font-semibold tracking-widest text-white/60 uppercase">Settings</h2>
				<button
					aria-label="Close settings"
					onclick={() => (showSettings = false)}
					class="text-white/40 hover:text-white"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="space-y-6">
				<!-- Transition -->
				<div class="space-y-2">
					<span class="text-xs font-medium tracking-widest text-white/40 uppercase">Transition</span
					>
					<div class="grid grid-cols-2 gap-2">
						{#each transitionOptions as t (t.value)}
							<button
								onclick={() => (transition = t.value)}
								class="rounded-lg py-2 text-sm transition-all
									{transition === t.value
									? 'bg-white font-medium text-neutral-900'
									: 'border border-white/12 text-white/50 hover:border-white/30 hover:text-white/80'}"
								>{t.label}</button
							>
						{/each}
					</div>
				</div>

				<!-- Order -->
				<div class="space-y-2">
					<span class="text-xs font-medium tracking-widest text-white/40 uppercase">Order</span>
					<div class="flex gap-2">
						{#each orderOptions as o (o.value)}
							<button
								onclick={() => (order = o.value)}
								class="flex-1 rounded-lg py-2 text-sm transition-all
									{order === o.value
									? 'bg-white font-medium text-neutral-900'
									: 'border border-white/12 text-white/50 hover:border-white/30 hover:text-white/80'}"
								>{o.label}</button
							>
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
							class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-neutral-900 shadow transition-transform {blurBackground
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
						{#if !folderHandle}
							<p class="text-[11px] text-white/35">Unavailable for fallback file selection.</p>
						{/if}
					</div>
					<button
						aria-label="Toggle watch folder for new photos"
						onclick={() => (watchFolderForNewPhotos = !watchFolderForNewPhotos)}
						disabled={!folderHandle}
						class="relative h-6 w-11 rounded-full transition-colors {watchFolderForNewPhotos
							? 'bg-white'
							: 'bg-white/20'} disabled:cursor-not-allowed disabled:opacity-40"
						role="switch"
						aria-checked={watchFolderForNewPhotos}
					>
						<span
							class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-neutral-900 shadow transition-transform {watchFolderForNewPhotos
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
						{#if !folderHandle}
							<p class="text-[11px] text-white/35">Unavailable for fallback file selection.</p>
						{/if}
					</div>
					<button
						aria-label="Toggle crawl subfolders"
						onclick={() => (crawlSubfolders = !crawlSubfolders)}
						disabled={!folderHandle}
						class="relative h-6 w-11 rounded-full transition-colors {crawlSubfolders
							? 'bg-white'
							: 'bg-white/20'} disabled:cursor-not-allowed disabled:opacity-40"
						role="switch"
						aria-checked={crawlSubfolders}
					>
						<span
							class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-neutral-900 shadow transition-transform {crawlSubfolders
								? 'translate-x-5'
								: 'translate-x-0'}"
						></span>
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.layer {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	.blur-bg {
		position: absolute;
		inset: -30px;
		width: calc(100% + 60px);
		height: calc(100% + 60px);
		object-fit: cover;
		filter: blur(25px) brightness(0.5);
		transform-origin: center center;
	}
	.slide-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		transform-origin: center center;
	}
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
