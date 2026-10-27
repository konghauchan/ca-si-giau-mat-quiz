# Collect all 377 artist catalogs

The dedicated `catalog/complete-377` branch runs the public MusicBrainz metadata collector on standard GitHub-hosted Ubuntu runners. It resumes the compressed, checksum-verified seed collected locally and stores atomic progress snapshots under `catalog-result/` on that same branch.

Collection runs in four sequential segments of up to four hours, with a shared request-start delay of two seconds and at most two pending requests. A completed artist requires every recording browse page to be scanned. Eligible songs require a linked MusicBrainz Song Work, explicit English lyrics, and the requested artist's actual recording credit. Completion means all 377 roster entries were scanned; it does not assert that the upstream database contains every song ever released.

Only the GitHub job token is provided to the supervisor. It is stripped from the MusicBrainz child process. No Turso credentials, audio, video, lyrics, or user data are committed. Result-only commits do not start another workflow. The final verification job fails unless all 377 artists are complete.

The database import remains separate: download the verified `songs.json.gz`, decompress it, and use the existing `scripts/import-song-library.mjs --append` command with locally configured Turso credentials. Existing work IDs remain intact. A local import watcher can publish completed cohorts while collection continues remotely; it resumes after the local machine wakes.

Public checkpoints are available at:

- `catalog-result/report.json`: completed artist count, work count, hashes, last update.
- `catalog-result/songs.json.gz`: songs from fully scanned artists only.
- `catalog-result/checkpoint.json.gz`: resumable page offsets and per-artist reports.
- `catalog-result/identities.json.gz`: verified MusicBrainz artist identities.

The workflow writes to this dedicated branch and does not merge it or change production deployment settings.
