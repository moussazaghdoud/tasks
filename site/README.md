# ihence.app

The public site: one page (`index.html`, English and French) and its assets.

Published by Cloudflare Pages from the `main` branch:

- Build command: `cp public/privacy.html site/privacy.html && cp public/support.html site/support.html`
- Output directory: `site`

The privacy and support pages are copied from `public/` at build time, so
there is one copy of each to keep up to date.
