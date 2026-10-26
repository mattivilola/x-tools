# Followers Hero privacy notice

Version 0.1.0 · 2026-10-26

Created by Matti Vilola. Sponsored and distributed by ILO Applications SL.

## What is processed

Offline mode processes the photos or JSON you select and your poster settings on your device. Imported photos are resized and re-encoded locally. Original files are not changed. Local photo filenames may become display names in the saved collection.

If you explicitly enable supervised website collection, it reads visible follower handles, display names and avatar URLs from the selected X followers page. Collection requires your attestation of written authorization from X, optional site permissions, and a separate on-page Start action. Its saved state includes the target account, requested count, collection ID, tab ID, status, timestamp and your authorization attestation.

## Storage and transmission

Records, embedded imported photos, settings and progress are saved in the extension's local browser storage. They are not stored in browser sync storage or uploaded to an application server. The source code has no analytics or telemetry.

Offline demo/import modes do not contact X. Explicit website collection opens X in your current signed-in browser, where X processes normal website requests under its own policies. For that collection source, the editor can download avatars directly from `pbs.twimg.com`, omitting credentials and referrer information. Downloaded avatars are held in editor memory. The tool does not extract session cookies, passwords or tokens.

Choosing to open the GitHub or company links is normal external navigation and is subject to those sites' policies.

## Your controls and responsibility

Collection waits for Start. You can pause or stop and must monitor continuously. Moving focus away pauses scanning. Restrict collection to what X has authorized and do not bypass access controls.

Use **Clear local data** after stopping/pausing collection to remove records and settings from this browser. Closing editor tabs releases their in-memory avatars. You can uninstall the extension and revoke optional site permissions through browser settings. PNG/JPEG/JSON exports are independent downloaded files; clearing extension storage does not remove those files or copies you have shared. Do not upload personal collections to public GitHub issues.

Only use and publish images/data you are entitled to process. The tool does not verify each imported person's consent or the scope of an operator's written agreement. A software license is not permission to reuse people's images.

## Contact

For product/privacy questions, contact ILO Applications SL through [iloapps.com](https://iloapps.com). Code issues can be reported at [mattivilola/x-tools](https://github.com/mattivilola/x-tools/issues); omit personal photos, private follower lists and credentials from public reports.
