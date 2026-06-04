<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>PhotoShow</title>
	<meta name="theme-color" content="#0f172a" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icon-192x192.png" />
</svelte:head>

{@render children()}
