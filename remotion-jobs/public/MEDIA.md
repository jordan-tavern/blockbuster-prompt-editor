# Sample media (not in git)

Video and audio binaries under `public/` are **gitignored** to keep the repository small. For local dev:

1. Copy `remotion-jobs/public/` media from a full checkout of this product (or from the original `remotion-jobs` tree), **or**
2. Replace scene paths in `src/data/scenes.ts` (and related) to point at your own assets.

At minimum, Rivet timelines expect b-roll and VO files referenced in `src/data/` — match filenames under `public/broll/`, `public/candidate/`, `public/cspan/`, and `public/audio/` if you copy assets piecemeal.
