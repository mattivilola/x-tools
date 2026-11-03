# Implementation status and limits

Updated 2026-11-03. The earlier brainstorm is now implemented as the **Followers Manager browser extension**, version 0.2.0. An API edition is a separate proposed tool, [api-followers-management](../api-followers-management/README.md).

## Implemented modules

- `src/core.js`: bounded snapshot/import validation, string IDs, safe archive JSON extraction, conservative comparisons, review reasons, keep-list behavior, CSV export and synthetic demo records.
- `src/app.js`, `app.html`, `style.css`: local dashboard, dated count chart, import/backup restore, review filters/selection, coverage confirmation, keep list and per-session authorization/responsibility flow.
- `src/session.js`: fixed bounded selections, actor/path validation, authorization and consent preconditions.
- `src/background.js`: a serialized session controller, dedicated tab ownership, optional-permission check, progress persistence, focus/tab-close handling and no automatic destructive restart.
- `src/runner.js`: visible shadow-DOM monitor; collection; sampled public-profile inspection; supervised, paced, selected unfollowing through rendered buttons and matching dialogs.

Local storage uses `chrome.storage.local`, with `fmData` for history/keep list and `fmSession` for the latest operation. There is no backend or API provider. Application pages disallow network connections in CSP. Only an explicit live session requests optional X permission. X's normal page traffic remains X's responsibility; extension data stays local unless the operator exports it.

## Session contract

The dashboard freezes up to 10,000 observed selected accounts. Start requires written-authorization attestation, responsibility/monitoring consent, and site permission. The X overlay initially waits for Begin. The runner verifies the signed-in account from X's profile navigation, the exact route, the session focus setting, current queue index and latest keep decisions.

Before an unfollow, it finds the exact user card, displays an eight-second countdown, rechecks the identity and dialog target, and only then confirms. A same-account rendered Follow button is evidence of success. A disappeared card or timed-out response is uncertain, halts further work and is not blindly retried. Already submitted outcomes may be reconciled after Stop without continuing the selection.

Focus loss pauses by default. The explicit per-session toggle can permit background continuation; hidden/removed overlay, page/account change and detected restrictions still pause where detectable. Start and Resume always require a focused monitor. Pause and Stop cannot undo a request that has already been submitted. A browser restart or cleanup-page reload cannot silently continue destructive work. The controls cannot prove human presence or grant an exception to X's rules.

## Data integrity

Comparisons require the same account and complete coverage with compatible identity formats. Stable IDs prevent handle renames from looking like losses; handle-only comparisons are labeled approximate. Partial scans never establish missing members. Reported/confirmed totals remain distinct from observed list sizes. Opposite-direction browser scans can be paired within 30 minutes; concurrent changes may still make them inconsistent. Imports sharing an export date/source can be paired, with manual coverage confirmation.

Archive records without handles are retained for ID comparison but cannot drive browser actions. Unknown activity stays unknown. Inspection provides a bounded public timeline sample, not an authoritative last-activity timestamp or bot verdict. Private accounts are excluded from action selection by default.

## Validation

Meaningful Node tests cover parsing, identity/coverage handling, inactivity freshness, keep protections, formula-safe CSV, selection bounds and authorization/route preconditions. The browser fixture suite covers the real extension dashboard/controller/runner in an isolated profile, synthetic X pages and a simulated granted site permission. It exercises explicit Begin, countdown/Pause, focus loss, confirmed actions and Stop.

Run the commands in [README.md](./README.md). Fixture evidence is not live provider validation. Any live verification needs the account owner's instruction and appropriate X authorization; no real account is required for development checks.

Verified on 2026-10-26: 19 Followers Manager Node tests, root checks and both extension packages passed. An isolated Edge fixture run verified the dashboard/mobile view, consent/Begin gates, Pause, focus-loss pausing, confirmed result, Stop, mismatched-dialog refusal, partial scan saving and persistence. No real X account actions were performed.

## Remaining limitations / later improvements

- DOM test IDs and English restriction/confirmation presentation may change; unsupported pages pause instead of trying alternative click strategies.
- Browser scans cannot independently prove full-list coverage. Snapshot timestamps describe observations, not an atomic provider transaction or exact unfollow event time.
- No always-on detection, notification service, DMs, block/mute actions or unattended reciprocal-unfollow daemon. Follow-backs operate only on a reviewed, fixed selection.
- No calibrated bot classifier, reliable social-graph manipulation detector or guarantee that a timeline sample includes the latest post.
- Storage is bounded, can hit browser quota, and requires regular exports. Only the latest session state/log is retained separately from history backups.
- More archive schemas/multipart imports and finer direction-specific snapshot provenance can be added as fixtures become available.
- API entitlement, OAuth, API pricing and permitted action use cases are research for the separate API tool; the website runner is not its fallback.

## Version 0.2 changes

Rendered-card readers now support bio layouts without UserDescription and keep unknown legacy bios distinct from confirmed empty bios. New observed verification/relationship metadata supports four action queues with complete-coverage/freshness rules. Follow-back execution verifies the current row/badge/button and rendered result. The focus toggle defaults on but permits background continuation when explicitly disabled. Existing history and keep lists are preserved. See README for the exact workflows.

Verified on 2026-11-03: 24 Followers Manager Node tests, root checks and both package builds passed. The integrated isolated Edge fixture suite passed realistic bio/mention parsing, verified/reciprocity metadata, both unfollow shortcut selections, background scan completion with focus pausing disabled, verified-only follow-back, all-follower follow-back with already-followed skips, Pause/Stop, mismatched confirmation refusal and persistence. Session handoff now disables new action starts until the previous job finishes or is stopped, and prevents duplicate Start submissions. No live X follow/unfollow actions were used for these checks.
