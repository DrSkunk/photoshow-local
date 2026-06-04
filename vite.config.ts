import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: 'auto',
			workbox: {
				navigateFallback: '/',
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,avif,json}']
			},
			manifest: {
				name: 'PhotoShow',
				short_name: 'PhotoShow',
				description: 'A local-folder photo slideshow web app',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				theme_color: '#0f172a',
				background_color: '#0f172a',
				icons: [
					{
						src: '/icon.svg',
						sizes: '512x512',
						type: 'image/svg+xml',
						purpose: 'any'
					},
					{
						src: '/icon-maskable.svg',
						sizes: '512x512',
						type: 'image/svg+xml',
						purpose: 'maskable'
					}
				]
			}
		})
	]
});
