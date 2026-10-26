# XAvatarWall assessment

Reviewed on 2026-10-26 at upstream commit [`7730b50064f1491e6ac1dd7af73532c06ae6e7fd`](https://github.com/qiujiu-dev/XAvatarWall/tree/7730b50064f1491e6ac1dd7af73532c06ae6e7fd).

## What it does

[XAvatarWall](https://github.com/qiujiu-dev/XAvatarWall) is a follower-avatar collector and collage generator. Its repository contains several implementations: root-level browser-extension files, `XAvatarWall/`, `XAW2.5/`, an Android project, and older Python/userscript utilities.

The `XAW2.5` extension declares Manifest V3 and version 2.5. Its README describes collection through a signed-in X browser, automatic scrolling, deduplication, resumable progress, IndexedDB image caching, poster customization and JPEG export. Its manifest also injects a network hook in the page's main JavaScript world and permits GitHub domains for an update check. These are source observations, not evidence that the upstream extension was tested live.

## Reuse decision

No license file was present in the inspected tree and GitHub's repository metadata returned `license: null`. Followers Hero therefore starts with independently written source and independently drawn demo illustrations. No upstream code, icons, screenshots or other assets are distributed in X Tools. The upstream idea is credited in both READMEs. Recheck upstream licensing before considering any future code reuse.

## Followers Hero's initial direction

- A full-tab editor with a live, high-resolution preview and deliberate English-language UI.
- Offline photo/JSON editing plus a supervised rendered-card collector, restricted to operators with X's written authorization. No network hooks, token extraction or internal API calls.
- Scope collection messages to the selected tab, expected account route and collection ID.
- Save progress locally, pause on stalls, and describe partial lists accurately.
- Offer three compositions, four palettes, multiple aspect ratios, PNG/JPEG and portable JSON.
- Keep collection order distinct from follow chronology; the source page cannot establish a follow date.
- Include an offline illustrated demo and local-data controls.
- Require a visible on-page progress/activity overlay with explicit Start, Pause and Stop, and pause on lost visibility or focus. Monitoring does not override X's restrictions; see the [shared policy](./x-platform-policy.md).
- Avoid a build toolchain, backend, account system, telemetry and remote update checks in the first version.

## Limitations to validate

The collector depends on X's rendered `UserCell` cards and profile links. X can change its UI, restrict lists or present different account experiments. Controlled fixtures validate extraction and extension messaging, but only a separate signed-in check can demonstrate compatibility with a particular live account. The initial scope is Chrome/Edge desktop, not Android or an extension-store release.
