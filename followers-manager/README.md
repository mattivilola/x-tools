# Followers Manager

**Understand your audience. Keep a following list you actually want.**

A local-first Chromium extension for follower history, relationship changes and **reviewed follow-back and unfollow sessions**. Version: **v0.6.0**.

**Made by [Matti Vilola](https://github.com/mattivilola) with ❤️, sponsored and distributed by [ILO Applications SL](https://iloapps.com).**

[All X Tools](../README.md) · [Privacy](./PRIVACY.md) · [Source checks](./research.md) · [Implementation and limits](./implementation-plan.md) · [Shared X access policy](../docs/x-platform-policy.md)

## What it does

- Saves dated follower/following snapshots locally and plots measured follower counts across 30 days, 90 days or all history.
- Compares complete snapshots to show lost relationships and finds accounts you follow that do not follow back. A missing account does not establish that someone intentionally unfollowed you.
- Reviews following accounts with explainable evidence: observed relationship loss, no recent public posts in an inspected timeline sample, or a missing bio. These are review suggestions, not confirmed bot classifications.
- Protects your keep list and excludes protected/private accounts from action selection. Stable IDs protect renamed accounts when the source supplies them.
- Reads followers/following pages and inspects selected public profiles in a dedicated X tab, using the rendered page and your existing signed-in session.
- Runs a fixed, reviewed selection through a **large live overlay** that shows the current handle, reasons, countdown, processed/total progress and confirmed or uncertain results.
- Provides **Pause, Resume and Stop**, a per-session **Pause if losing focus** toggle (on by default), and a focused on-page Begin before a session starts.
- Imports JSON and supported extracted X archive files; exports a backup and a spreadsheet-safe review CSV. Synthetic demo mode makes no X requests.

No backend, API key, OAuth connection, cloud analytics, cookie extraction or undocumented API access is used. The future API edition is a separate proposed tool: [API Followers Management](../api-followers-management/README.md).

## Platform authorization and responsibility

[X's automation rules](https://help.x.com/en/rules-and-policies/x-automation) prohibit website scripting, and its [account behavior guidance](https://help.x.com/en/rules-and-policies/x-rules-and-best-practices) says automated unfollowing is not allowed. **A large overlay, user supervision and accepting responsibility do not create an exception or prevent restrictions or suspension.**

Under this repository's access policy, live website operation is for operators with X's express written authorization covering the intended collection/actions and data use. Each live session requires that attestation, explicit monitoring/responsibility consent and an optional X site-permission grant. The extension records the attestation; it cannot verify the agreement. Do not tick it unless it is true. Offline demo/import analysis remains available without a site grant.

**The user is responsible for the session and its account actions and must monitor progress.** The software cannot prove a person is present. Focus pausing is enabled by default. Explicitly turning it off permits work to continue when the monitor is hidden; use Pause before stepping away and Stop when finished. The toggle does not make otherwise restricted automation permitted.

## Install

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**, choose **Load unpacked**, and select this `followers-manager` folder containing `manifest.json`.
3. Click the Followers Manager extension action to open the dashboard.
4. Try **Explore the demo** first. It uses synthetic accounts and disables live account actions.

No installation command, build step or runtime dependency is required. After changing source, reload the extension and reopen its dashboard.

The installed extension and toolbar use the retro pixel-art **X / FM** icon (FM means follower management), with bundled 16, 32, 48 and 128 pixel PNGs. The dashboard tab uses it as its favicon. Reload the unpacked extension after updating to see the new icon. Original artwork and its generation prompt are in [assets](./assets/README.md).

## Establish your history

1. Leave demo mode and enter the exact handle of your signed-in X account.
2. Choose **Scan followers**. Read the notice, attest to the required authorization, accept continuous supervision, and grant X site access if you intend to proceed.
3. In the new X tab, check the account and overlay, then choose **Begin reading**. Keep this tab visible and focused while the scan scrolls, or explicitly turn off **Pause if losing focus** in the start dialog to permit background continuation. Start and Resume always require a focused monitor.
4. A scan pauses for review when no new accounts arrive, a time bound is reached, or capacity is reached. The monitor stays open. Choose **Resume** to continue reading, or **Auto Retry (3 attempts)** for a loading stall. When you decide to end the scan, choose **Finish scan and review results**; only then does the processing tab close and **Save the observation** open on the dashboard. If you paused or stopped early, return manually and choose **Save scan**. Enter an exact total from X if known. Leave coverage unchecked unless you independently verified the full list. No more loaded cards does not establish completeness.
5. Repeat for **Scan following**. Opposite-direction browser observations within 30 minutes can be paired. They become complete only when you explicitly verified both lists; concurrent relationship changes can still make the combined observation inconsistent.
6. Repeat later to see count progress and compare relationships. In the saved-snapshots section, **Confirm full coverage** is available for paired partial data after you independently verify both lists.

A first snapshot establishes a baseline; it cannot reveal earlier unfollowers. Partial data cannot establish missing followers from absence. Fresh relationship badges observed directly in following cards can support nonfollower suggestions; missing or stale relationship evidence remains unknown. Handle-only comparisons are approximate because handles can change. Mixed ID/handle formats are conservatively excluded from comparisons.

Counts shown on the chart are reported or explicitly confirmed totals, not partial collection lengths. Missing days are not invented measurements. The net change uses the displayed observation endpoints, not an exact 30/90-day claim when measurements are missing. Current storage bounds are 100 snapshots and 10,000 members per direction; export backups regularly. Browser storage quota can be reached sooner with rich records.

## Follow-back and unfollow shortcuts

The **Account actions** panel prepares these fixed selections, then opens the review/consent dialog:

- **Follow back all verified followers:** observed followers with a real verified-badge observation; already-followed accounts are excluded. The badge and current button are checked again before following.
- **Follow back all followers:** observed followers you are not already following. A current Following button causes a skip.
- **Unfollow non-followers:** accounts in your following list with fresh explicit non-reciprocity evidence, or absence from a comparable complete follower list. Unknown membership from partial data is excluded. A current Follows you indicator causes a skip.
- **Unfollow except verified & my followers:** only observed nonfollowers with fresh explicit unverified evidence (at most seven days old). Keeps verified accounts, known followers, private/kept accounts and unknown/stale verification. Refresh your scans if no eligible records are available. Before the unfollow and again before confirmation, a current verified badge or Follows you indicator causes a skip.
- **Unfollow all following:** the eligible accounts in your observed following list, including mutuals. Keep-list and known private-account protections still apply.

“All” refers to the saved observed records, not a guarantee that every account on X has been discovered. Legacy scans have unknown verification and relationship fields; rescan before using badge-based shortcuts. Confirmed and positively observed relationship states are applied to new selections immediately, including after Stop or a first-five batch. The dialog shows the selection count and first 500 targets; **Export selection CSV** contains the full fixed selection. No action starts until consent and the focused monitor's **Begin**. A follow succeeds only when X renders the matching Following button. Unknown results pause instead of retrying.

### Relationship status across batches

Each confirmed follow/unfollow is saved immediately by the extension service worker, even if the dashboard is closed or the session is stopped partway through. A rendered Already following / Already not following state is also saved. Unknown, missing and uncertain outcomes never become relationship facts. Future selections use this current local status; original saved snapshots and chart measurements are preserved. Newer explicit scan evidence overrides older local action observations. The latest existing session log is reconciled on dashboard startup and before replacement, so available pre-update results are retained. Older overwritten logs cannot be reconstructed. Backups include current relationship status; restores merge by identity and observation time.

Target lookup checks the current rendered cards plus one scroll/look-ahead. A missing target is skipped as **Not found in this list window; relationship unknown**. It is not marked as having unfollowed you. This favors bounded processing over a full search and can skip accounts outside that window.

Visible restriction/limit alerts, toasts or dialogs and supported challenge elements pause the process; they are never bypassed or retried automatically. Stop on any notice the detector does not recognize.

### Scan stalls and loading retries

Both followers and following scans count forward scroll movement as progress, even when all currently mounted cards have already been read. They scroll the nearest list container, including nested scrolling panels, and preserve records when X virtualizes older cards out of the DOM. List collection excludes sidebar suggestions; fallback bio reading excludes follow/unfollow tooltips.

Repeated checks without new accounts or forward movement pause for **operator review**, never automatic completion. The monitor shows current list scroll position, whether more loaded scroll space remains, loading indicators and retry budget. No end-of-list guarantee is inferred from these signals. **Resume** makes another reading pass. **Auto Retry (3 attempts)** is an explicit opt-in for loading stalls: at most three additional waits of 2, 4 and 8 seconds followed by reading/scrolling attempts, with normal idle checks between attempts. Pause/Stop/focus pausing cancels retries; warnings, restrictions, challenges, route/account changes and reloads still pause. It never clicks X retry buttons or bypasses access controls. Capacity review cannot retry beyond the 10,000-record bound.

Use **Finish scan and review results** only when you want to stop collecting and save the observation, whether partial or independently checked as complete. It does not mark full coverage automatically. Existing saved partial scans remain preserved; scans finished by older versions need a fresh scan to collect missing pages.

### Returning after completion

Scans explicitly finished by you, completed follow-back/unfollow batches and final profile inspections return to the existing dashboard (or open one if it was closed). Only the session-owned processing tab is closed, and only if it still has the expected URL. Results are stored before closing. A scan opens **Save the observation**, with complete-coverage confirmation unchecked; saving remains your decision. Once saved, this prompt stays closed on reload. Follow/unfollow outcomes are already saved in session history, which opens on return. Paused, stopped or uncertain sessions stay available for review and do not automatically close. If return fails, the completed monitor offers **Return to dashboard** for an explicit retry.

### First 5 test batch and duration

In the review dialog, choose **First 5 — test batch (real actions)** under **Batch size** to run only the first five eligible accounts in the preview (or fewer if fewer qualify). This applies to follow-back and unfollow selections. These are real actions, not a simulation. The CSV export matches the chosen batch. The session completes after processing those targets, including skips; it does not refill skipped slots or continue into the full selection. A new session requires a new review and Begin.

The review and live monitor show countdown time: five actual actions have 15–45 seconds of countdown, with an expected mean of 30 seconds. Finding rows, confirming results, pauses and background browser throttling add time. Each actual action draws a fresh uniform integer delay from 3–9 seconds (mean six). This is an operator pacing choice, not an X rate limit or a safety/permission guarantee. Already-followed/unfollowed and other skipped targets do not wait for a countdown.

### Performance and saved progress

Scans send only new or changed rendered records. Durable checkpoints are saved about every five seconds while running, and immediately on Pause, Stop, completion or an error pause. The monitor shows live counts; the dashboard can lag until the next checkpoint. An abrupt browser or extension shutdown can lose observations since the last checkpoint (normally up to five seconds while the runner is active; suspension can extend that interval). Restart never resumes silently.

The following table renders **50 accounts per page**. Search/filter changes return to page one. **Select visible** selects eligible accounts on the current page; selections on other pages remain selected until cleared. Selection changes reuse rows. Session history appends new outcomes rather than rebuilding prior entries. Manual selections execute in saved list order to reduce repeated scrolling, and the runner caches an index of currently rendered cards, invalidating it when the page changes. Identity, live badge/relationship and confirmation checks still run before actions.

### Pause if losing focus

This toggle appears in every start dialog, including both scans. It resets to **on** for each new session. On: losing tab/window focus or visibility pauses and requires Resume. Off: scans, inspections and selected follow/unfollow execution may continue when hidden. Account/route, keep-list, overlay-presence, restriction and Stop checks still apply. Browser suspension/throttling can delay or interrupt background work; this is not a scheduling service. Keep monitoring progress and remain responsible for the session.

## The supervised unfollow process

1. Review **Lost followers**, **Not following back**, **Potentially inactive**, or **Sparse profiles**. Inspect each suggestion; not following back or posting rarely does not make someone a bot or an unwanted follow.
2. Add people you want to retain to **Keep**. Select the exact accounts you want to unfollow. There is no unattended “unfollow whoever leaves” background rule: new detections need a new reviewed session.
3. Choose **Review supervised unfollow**. Read the fixed account list, acknowledge your required authorization, and accept responsibility and continuous monitoring. Up to 10,000 observed accounts can be selected per session (the import/scan bound); this is **not** a safe daily allowance. Large sessions can take a long time and may be restricted by X.
4. Choose **Open live monitor**. In the dedicated X following tab, check the signed-in account and choose **Begin supervised unfollow**. Opening the tab alone does not start actions.
5. **Watch the large overlay continuously.** It shows who is being processed at that moment, why they were selected, a 3–9 second countdown before each actual action, progress, and recent outcomes. The extension locates the matching rendered row, checks the account/ID where available, clicks its Following button, and confirms only a dialog naming that handle.
6. Use **Pause** to interrupt the countdown or stop before the next click. Resume is available only in the visible, focused overlay. With **Pause if losing focus** on, changing tabs/windows or hiding the page pauses progress. With it off, the session may continue in a background tab; browsers can throttle its timing. Changed account/route, removed overlay and reloads still pause regardless of this setting.
7. Use **Stop** to end the session. Closing the monitor stops it; closing its tab stops it too. **An action already submitted to X may still complete.** Neither Pause nor Stop can retract an already sent request, and an unfollow has no guaranteed undo.
8. Review the result log. A success requires a rendered Follow button for the same account. A missing row, changed markup or ambiguous result is **uncertain**, pauses the run and is not retried automatically. Check the account manually before deciding what to do next.

The runner rechecks the keep list before each destructive click. It stops or pauses on unsupported pages, detectable restrictions/challenges, account mismatches and missing/changed confirmations. It does not evade rate limits, solve challenges, randomize behavior to disguise automation, or promise compatibility with every locale/UI variant. An in-progress submitted result can be recorded after Stop without restarting the session. There is no automatic restart after a browser restart.

## Profile evidence and potential bots

Select accounts and choose **Inspect selected profiles** for a read-only supervised session. The extension visits their public profile pages and samples rendered posts, excluding visible social-context/pinned/reposted items. Each new profile waits for **Begin reading** in the monitor; page navigation never silently resumes work. It records the newest timestamp in that sample, the observation date and available bio. It does not inspect private posts, DMs, likes or browsing activity.

A fresh sample whose newest observed public post is at least 90 days old can trigger an inactivity suggestion. That is not proof of inactivity: the timeline may be incomplete, a person may only read X, and profiles may remain useful. Unknown, protected and stale evidence is not treated as inactivity. A confirmed empty bio is a weak review signal. A failed read or an old empty field is shown as **Bio not collected** rather than evidence of a sparse profile. New scans read the bio from supported rendered list-card layouts, including bios with profile mentions; existing history is preserved. Rescan or inspect profiles to enrich old unknown fields. This version does not claim reliable bot detection or automatically unfollow based on a heuristic.

Profile observations are applied while the dashboard is open; the latest inspection results remain in the session log. If the dashboard was closed, it reopens on final completion to apply that evidence; reopen it manually if an inspection was stopped early. Automatic real-time relationship event tracking is outside this browser edition.

## Import and export

In **Import / export**, choose the account, archive direction and actual observation/export date. For an archive, select only the extracted follower/following data files, not the entire ZIP containing unrelated private information. Supported wrappers are `window.YTD.follower.part0 = [...]` and `window.YTD.following.part0 = [...]`; inputs are parsed as JSON, never executed. Lists from the same export date and source can be paired but remain partial until independently verified. Other schemas/multipart archives need conversion or further support.

A full normalized JSON snapshot can provide both directions:

```json
{
  "account": "yourhandle",
  "observedAt": "2026-10-26T10:00:00.000Z",
  "source": "my-verified-export",
  "coverage": "complete",
  "followerCount": 1,
  "followingCount": 1,
  "followers": [{ "id": "1234567890123456789", "username": "example" }],
  "following": [{ "id": "1234567890123456789", "username": "example" }]
}
```

Use `complete` only for independently verified full lists. IDs are strings to preserve precision. Official archives may contain only IDs and `/i/user/ID` links; those records support ID-based comparisons but cannot be selected for browser unfollow until a verified handle is available. Never guess a handle from an ID.

Single imports/restores are limited to 8 MB. Backups include snapshots and keep decisions, merge on restore, and do not contain authorization credentials. CSV contains review evidence. The latest session outcome log is separate from the history backup; copy/export any outcomes you need before starting another session. Clearing local history asks for confirmation and does not change X or remove previously exported files.

## Development and verification

Use Node.js 22 or newer:

```sh
npm --prefix followers-manager test
npm --prefix followers-manager run check
npm --prefix followers-manager run package
```

Packaging produces `dist/followers-manager-0.6.0.zip`. The optional fixture-only browser suite is `node followers-manager/scripts/browser-smoke.cjs`; provide `PLAYWRIGHT_MODULE` and a compatible installed `BROWSER_EXECUTABLE` if needed. Run its `--preflight` first. On macOS, browser launches require the approved execution context described in the repository/user instructions.

Fixtures simulate rendered X pages and a granted site permission in an isolated temporary extension. They do not establish live X compatibility, real provider acceptance, or permission to automate. Do not test against a live account without the required X authorization and account owner's instruction.

[MIT License](../LICENSE) · Independent of X and not endorsed by it.
