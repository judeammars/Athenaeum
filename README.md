# Athenaeum

A quiet, folder-inspired creative archive for a writing and illustration circle.

## Run locally

Open `index.html` in a browser, or serve this folder with any static file server.

## Prototype features

- Responsive folder-inspired archive layout.
- Sample volumes containing multiple works and contributor credits.
- Filters for writing, illustration, and mixed media.
- Search by volume, contributor, or work title.
- Volume detail view with selectable individual works.
- Add-volume form with multiple works, cover upload, and optional artwork images.
- Preview submissions persist in the current browser using `localStorage`.

## Shared uploads are not connected yet

The current upload flow is a local preview. It stores data in the browser that submitted it, so it does not sync between members or devices. Before opening the archive to the circle, connect a shared backend (recommended: Supabase) for member authentication, database records, and image storage, then replace local preview persistence with authenticated uploads.

Never put backend service-role keys or other secrets in browser code.
