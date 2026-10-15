# Local crawler comparison

Initial probes on 2026-10-15 used the VPS's public egress and the existing linked Epic profile. No hosted crawler, model, paid proxy, or extraction API was used. `observations.json` records the observed results; this is a small diagnostic sample, not a reliability benchmark.

Scrapling 0.4.15 HTTP returned a profile shell in 0.78 seconds. Scrapling browser/stealth and Crawl4AI 0.9.5 also returned HTTP 200 but no playlist rows: rendered pages displayed a Network Error. The existing Puppeteer-extra path returned stats in 6.93 seconds. We repeated Scrapling with the deployed Chromium 146 and without its default Google referrer; it still returned no stats. Chromium 155 was used for the first browser probes.

Follow-up isolation: updated Puppeteer 25.14.0 with the deployed Chromium 146 returned seven ranked playlists; repeated probes of the newly installed Chromium 155 returned error pages with both old and updated bot dependencies. One earlier Chromium 155 probe succeeded, so this is intermittent and must not be described as a universal incompatibility. The VPS rollout preserves the already deployed Chromium 146 image.

Decision: retain local Puppeteer-extra for now. Do not deploy a crawler replacement based on an HTTP success code. The bot's parser, queue, and cache are separate from retrieval, so future local engines can be evaluated without rewriting Discord commands. Current-page data is not present in the initial HTTP HTML, so an HTTP-only replacement has not passed the data requirement.

## Reproduce

```sh
docker build -f benchmark/Dockerfile -t rl-crawler-benchmark:local .
mkdir -p benchmark/results
docker run --rm --memory=900m --shm-size=256m \
  -v "$PWD/benchmark:/work:ro" -v "$PWD/benchmark/results:/results" \
  rl-crawler-benchmark:local compare.py scrapling-http
```

Repeat with `http`, `scrapling-browser`, `scrapling-stealth`, or `crawl4ai`. Use `--url` for another public profile. Requests have a 75-second process deadline. Run probes sequentially. To compare with the deployed browser revision, pass `--build-arg BASE_IMAGE=rl-tracker-bot` when building; the Dockerfile preserves an already installed Chromium.

Check `playlist_rows`, error content, identity, and numeric values. `max_rss_mib` is Python's peak RSS only, not the full container's memory footprint; do not use it to compare overall browser costs. Raw result pages go into ignored `benchmark/results/`. Tests use a stripped public rank table captured from the successful local path.

Further evaluation needs repeated successful extractions across platforms, ranked/unranked accounts, missing profiles, special characters, and season history. The candidate defaults did not pass the first known-profile check, so expanding those failed configurations to a larger crawl would not establish correctness.
