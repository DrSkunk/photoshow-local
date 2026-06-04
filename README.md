# PhotoShow

A local-folder photo slideshow webapp built with SvelteKit + Tailwind CSS.

Uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) to read images directly from a local folder — works whether the app is running locally or hosted remotely (Chrome/Edge required).

## Features

- **Choose any local folder** — no upload, no server-side storage
- **Transitions:** Ken Burns, Fade, Slide, Zoom
- **Order:** Alphabetical, Reverse, Random
- **Blurred background** — fills letterbox bars with a blurred version of the current image
- **Fullscreen** mode (button or `F` key)
- **Live settings panel** — change options without stopping the slideshow
- **Keyboard shortcuts:** `←` / `→` navigate, `Space` pause, `F` fullscreen, `Esc` exit
- **Installable PWA** with offline support for app shell/assets after first load

## Developing

```sh
npm install
npm run dev
```

## Building

```sh
npm run build
npm run preview
```

> Deploying requires an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment. For static hosting use `@sveltejs/adapter-static`.
