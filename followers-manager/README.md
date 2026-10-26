# Followers Manager

**Understand your audience. Keep a following list you actually want.**

A local-first Chromium extension for follower history, relationship changes and **continuously supervised unfollow sessions**. Initial implementation: **v0.1.0**.

**Made by [Matti Vilola](https://github.com/mattivilola) with {love}.**

**Sponsored and distributed by [ILO Applications SL](https://iloapps.com).**

[All X Tools](../README.md) · [Privacy](./PRIVACY.md) · [Source checks](./research.md) · [Implementation and limits](./implementation-plan.md) · [Shared X access policy](../docs/x-platform-policy.md)

## What it does

- Saves dated follower/following snapshots locally and plots measured follower counts across 30 days, 90 days or all history.
- Compares complete snapshots to show lost relationships and finds accounts you follow that do not follow back. A missing account does not establish that someone intentionally unfollowed you.
- Reviews following accounts with explainable evidence: observed relationship loss, no recent public posts in an inspected timeline sample, or a missing bio. These are review suggestions, not confirmed bot classifications.
- Protects your keep list and excludes protected/private accounts from action selection. Stable IDs protect renamed accounts when the source supplies them.
- Reads followers/following pages and inspects selected public profiles in a dedicated X tab, using the rendered page and your existing signed-in session.
- Runs a fixed, reviewed selection through a **large live overlay** that shows the current handle, reasons, countdown, processed/total progress and confirmed or uncertain results.
- Provides **Pause, Resume and Stop**, automatically pauses when the tab/window loses focus, and requires a visible on-page Begin before a session starts.
- Imports JSON and supported extracted X archive files; exports a backup and a spreadsheet-safe review CSV. Synthetic demo mode makes no X requests.

No backend, API key, OAuth connection, cloud analytics, cookie extraction or undocumented API access is used. The future API edition is a separate proposed tool: [API Followers Management](../api-followers-management/README.md).

## Platform authorization and responsibility

[X's automation rules](https://help.x.com/en/rules-and-policies/x-automation) prohibit website scripting, and its [account behavior guidance](https://help.x.com/en/rules-and-policies/x-rules-and-best-practices) says automated unfollowing is not allowed. **A large overlay, user supervision and accepting responsibility do not create an exception or prevent restrictions or suspension.**

Under this repository's access policy, live website operation is for operators with X's express written authorization covering the intended collection/actions and data use. Each live session requires that attestation, explicit monitoring/responsibility consent and an optional X site-permission grant. The extension records the attestation; it cannot verify the agreement. Do not tick it unless it is true. Offline demo/import analysis remains available without a site grant.

**The user is responsible for the account actions and must monitor continuously for the entire session.** The software cannot prove a person is present. Never leave an active session unattended. Pause before stepping away; Stop when finished.

## Install

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**, choose **Load unpacked**, and select this `followers-manager` folder containing `manifest.json`.
3. Click the Followers Manager extension action to open the dashboard.
4. Try **Explore the demo** first. It uses synthetic accounts and disables live account actions.

No installation command, build step or runtime dependency is required. After changing source, reload the extension and reopen its dashboard.

## Establish your history

1. Leave demo mode and enter the exact handle of your signed-in X account.
2. Choose **Scan followers**. Read the notice, attest to the required authorization, accept continuous supervision, and grant X site access if you intend to proceed.
3. In the new X tab, check the account and overlay, then choose **Begin reading**. Keep this tab visible and focused while the scan scrolls through rendered user cards.
4. After collection stops, return to the dashboard and choose **Save scan**. Enter an exact total from X if known. Leave coverage unchecked unless you independently verified the full list. No more loaded cards does not establish completeness.
5. Repeat for **Scan following**. Opposite-direction browser observations within 30 minutes can be paired. They become complete only when you explicitly verified both lists; concurrent relationship changes can still make the combined observation inconsistent.
6. Repeat later to see count progress and compare relationships. In the saved-snapshots section, **Confirm full coverage** is available for paired partial data after you independently verify both lists.

A first snapshot establishes a baseline; it cannot reveal earlier unfollowers. Partial data can support a review selection but cannot establish missing followers or non-reciprocity. Handle-only comparisons are approximate because handles can change. Mixed ID/handle formats are conservatively excluded from comparisons.

Counts shown on the chart are reported or explicitly confirmed totals, not partial collection lengths. Missing days are not invented measurements. The net change uses the displayed observation endpoints, not an exact 30/90-day claim when measurements are missing. Current storage bounds are 100 snapshots and 10,000 members per direction; export backups regularly. Browser storage quota can be reached sooner with rich records.

## The supervised unfollow process

1. Review **Lost followers**, **Not following back**, **Potentially inactive**, or **Sparse profiles**. Inspect each suggestion; not following back or posting rarely does not make someone a bot or an unwanted follow.
2. Add people you want to retain to **Keep**. Select the exact accounts you want to unfollow. There is no unattended “unfollow whoever leaves” background rule: new detections need a new reviewed session.
3. Choose **Review supervised unfollow**. Read the fixed account list, acknowledge your required authorization, and accept responsibility and continuous monitoring. Up to 30 accounts can be selected per session; this is a product bound, **not** a safe daily allowance.
4. Choose **Open live monitor**. In the dedicated X following tab, check the signed-in account and choose **Begin supervised unfollow**. Opening the tab alone does not start actions.
5. **Watch the large overlay continuously.** It shows who is being processed at that moment, why they were selected, an eight-second countdown before the action, progress, and recent outcomes. The extension locates the matching rendered row, checks the account/ID where available, clicks its Following button, and confirms only a dialog naming that handle.
6. Use **Pause** to interrupt the countdown or stop before the next click. Resume is available only in the visible, focused overlay. Changing tabs, switching windows, hiding the page, changing the account/route, removing the overlay or reloading the cleanup page stops further progress until you explicitly resume or start over.
7. Use **Stop** to end the session. Closing the monitor stops it; closing its tab stops it too. **An action already submitted to X may still complete.** Neither Pause nor Stop can retract an already sent request, and an unfollow has no guaranteed undo.
8. Review the result log. A success requires a rendered Follow button for the same account. A missing row, changed markup or ambiguous result is **uncertain**, pauses the run and is not retried automatically. Check the account manually before deciding what to do next.

The runner rechecks the keep list before each destructive click. It stops or pauses on unsupported pages, detectable restrictions/challenges, account mismatches and missing/changed confirmations. It does not evade rate limits, solve challenges, randomize behavior to disguise automation, or promise compatibility with every locale/UI variant. An in-progress submitted result can be recorded after Stop without restarting the session. There is no automatic restart after a browser restart.

## Profile evidence and potential bots

Select accounts and choose **Inspect selected profiles** for a read-only supervised session. The extension visits their public profile pages and samples rendered posts, excluding visible social-context/pinned/reposted items. Each new profile waits for **Begin reading** in the monitor; page navigation never silently resumes work. It records the newest timestamp in that sample, the observation date and available bio. It does not inspect private posts, DMs, likes or browsing activity.

A fresh sample whose newest observed public post is at least 90 days old can trigger an inactivity suggestion. That is not proof of inactivity: the timeline may be incomplete, a person may only read X, and profiles may remain useful. Unknown, protected and stale evidence is not treated as inactivity. A missing bio is a weak review signal. This version does not claim reliable bot detection or automatically unfollow based on a heuristic.

Profile observations are applied while the dashboard is open; the latest inspection results remain in the session log. If the dashboard was closed, reopen it before another session to retain that evidence. Automatic real-time relationship event tracking is outside this browser edition.

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

Packaging produces `dist/followers-manager-0.1.0.zip`. The optional fixture-only browser suite is `node followers-manager/scripts/browser-smoke.cjs`; provide `PLAYWRIGHT_MODULE` and a compatible installed `BROWSER_EXECUTABLE` if needed. Run its `--preflight` first. On macOS, browser launches require the approved execution context described in the repository/user instructions.

Fixtures simulate rendered X pages and a granted site permission in an isolated temporary extension. They do not establish live X compatibility, real provider acceptance, or permission to automate. Do not test against a live account without the required X authorization and account owner's instruction.

[MIT License](../LICENSE) · Independent of X and not endorsed by it.
