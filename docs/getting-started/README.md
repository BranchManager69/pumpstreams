# Getting Started

1. Clone this repository onto the target machine (this server already has it under `/home/branchmanager/websites/pumpstreams`).
2. Make sure Node.js 20+ and npm are available; the Codex environment ships with Node 20 by default.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Install dashboard dependencies if you plan to rebuild that project while you are here:

   ```bash
   cd dashboard
   npm install
   cd ..
   ```

5. Preview the docs locally:

   ```bash
   npm run docs:serve
   ```

   The preview listens on port `3052` by default so it will not collide with the production services running on `3050`.

6. Publish the static site:

   ```bash
   npm run docs:deploy
   ```

   This builds the book and rsyncs the output into `/var/www/docs.dexter.cash/`, which is what Nginx serves for `https://docs.dexter.cash`.
