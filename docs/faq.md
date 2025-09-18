# FAQ

**Can we host multiple doc sites?**
Yes. You can duplicate this Honkit setup into additional directories (for example `docs-dev/`) and point different subdomains at each build output.

**Do we need an external service?**
No. The static site lives entirely in this repo. Build it, serve it from Nginx or any static file server on this machine, and Cloudflare will front it once DNS is in place.

**How often should we rebuild?**
Any time Markdown changes land. Consider wiring the build step into CI so merges to `main` trigger `npm run docs:build` and publish the `_book/` directory automatically.

**Can we password-protect sections?**
Honkit generates static HTML. Use your web server (e.g., Nginx basic auth or Cloudflare Access) if you need gated content.
