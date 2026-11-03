# Followers Manager privacy

Version 0.4.0 · 2026-11-03

Follower/following snapshots, profile observations, keep-list entries, and the latest session state/outcomes are saved in `chrome.storage.local` on this device. This is browser extension storage, not an encrypted vault. There is no developer backend, analytics, cloud sync, remote font or remote image loading.

Demo/import analysis does not require X access. A live session requests optional `https://x.com/*` permission after your per-session authorization and monitoring attestations. The `scripting` permission injects the monitor/runner only into the dedicated tab created for the session. The `storage` permission saves local history and session state. No other site is granted access.

Live scans read rendered user cards, including observed bio availability, verified badges, and follower/following relationship indicators. Profile inspection reads the visible bio and public post timestamps. Cleanup clicks selected Following buttons and their matching confirmation dialogs; follow-back sessions click selected Follow buttons and check the resulting Following state. The per-session focus toggle defaults on; explicitly turning it off permits background continuation. These actions use your existing X browser session; the extension does not extract cookies, passwords or authorization tokens, intercept requests, or call private APIs. X receives the normal page requests and actions. Supervision and local processing do not make website automation permitted by X.

JSON/CSV exports go to your browser's download location and may contain personal account information. Backups include snapshots and keep lists; the latest session state/log stays separately in local extension storage and is replaced on the next session. Do not commit personal exports or share them accidentally. Backup restores merge with existing history. Imported archive wrappers are parsed, not run.

Use Clear local history to remove local history/keep entries and session state after stopping live work. This asks for confirmation, does not modify X, and cannot delete exported files. Uninstalling the extension normally removes its local extension storage. Clear browser data and device backups according to your own retention needs. Only collect/store data you are authorized to use.

Running scan observations are buffered locally between approximately five-second durable checkpoints, with immediate checkpoints on Pause, Stop and completion. An abrupt shutdown may lose the buffered observations; no data is sent to a server. First-five batches use the same reviewed local records and permissions as full selections.

Completion stores results locally, activates or reopens the extension dashboard and closes only its owned processing tab when its URL still matches. Session state includes the originating dashboard tab ID, completion time and whether a scan was saved; no new permissions or external destinations are added.
