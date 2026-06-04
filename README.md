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

## Tauri CI/CD

A GitHub Actions workflow is included at `.github/workflows/tauri-ci-cd.yml` to build standalone Tauri bundles for:

- Windows
- macOS

The workflow runs on pull requests and pushes to `main`, and it also publishes bundled binaries as GitHub Release assets when a tag matching `v*` is pushed.

## Running the unsigned macOS app

The macOS artifacts produced by CI are unsigned and not notarized. That means Gatekeeper may block the app with a message such as "PhotoShow.app is damaged" or warn that Apple cannot verify it.

To run it anyway:

1. Download the release DMG and drag `PhotoShow.app` into `/Applications`.
2. Open Terminal and remove the quarantine attribute:

```sh
xattr -dr com.apple.quarantine /Applications/PhotoShow.app
```

3. Launch the app from `/Applications`.

If macOS still blocks it, use Finder once:

1. In Finder, open `/Applications`.
2. Control-click `PhotoShow.app` and choose `Open`.
3. Confirm the dialog.

This bypass is per build. Each newly downloaded unsigned release may need the same steps.
