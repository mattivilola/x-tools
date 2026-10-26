# Followers Hero

**Your people. Your moment.**

A Chromium extension for turning community avatars into celebration posters, with a local editor and an explicitly supervised website collector. No backend service is required.

**Made by [Matti Vilola](https://github.com/mattivilola) with {love}.**

**Sponsored and distributed by [ILO Applications SL](https://iloapps.com).**

[All X Tools](../README.md) · [MIT License](../LICENSE) · [Shared X policy](../docs/x-platform-policy.md) · [Privacy](./PRIVACY.md)

![Followers Hero retro X and FH icon](./assets/icon-128.png)

## Important access restriction

X’s [Terms](https://x.com/en/tos) restrict scraping without written permission. Its [Automation rules](https://help.x.com/en/rules-and-policies/x-automation) prohibit non-API website scripting and warn of account suspension. Continuous supervision, a visible overlay, slower scrolling and user responsibility do **not** make website collection permitted.

**Use website collection only with X’s express written authorization covering your use.** The checkbox is your attestation, not verification or a permission grant. If you do not have authorization, use the offline demo, your own photos or appropriately licensed data. Do not use a different scraper to work around this restriction. No ban-prevention or compliance guarantee is offered.

The operator is responsible for checking authorization, continuously monitoring the running collector and stopping on any warning, challenge or restriction. Matti Vilola and ILO Applications SL do not certify a particular use as authorized by X.

## Features

- A full-tab editor with live poster preview.
- Spotlight, Classic wall and Celebration compositions.
- Four palettes, three avatar shapes, square/portrait/landscape canvases.
- Custom headline and caption; `{count}` inserts the number of people in the image.
- PNG/JPEG exports with a 1,080 or 2,160 pixel short edge and no watermark.
- Local photo import, JSON import/export and an offline illustrated demo.
- Optional supervised collection of up to 2,000 unique records from rendered follower cards.
- A large on-page monitor with progress, current activity and Start / Resume, Pause and Stop.
- Automatic pause when the collection tab becomes hidden or loses focus, the route changes, progress stalls or a session reaches 20 minutes.
- Saved partial progress; initials when an avatar is unavailable.

## Install

This is an unpacked Manifest V3 extension, not an extension-store listing.

1. Read this README, the [privacy notice](./PRIVACY.md) and the [shared policy](../docs/x-platform-policy.md).
2. Clone or download [X Tools](https://github.com/mattivilola/x-tools).
3. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
4. Enable **Developer mode**, select **Load unpacked**, and choose this `followers-hero-image` folder containing `manifest.json`.
5. Open **Followers Hero** from the extensions menu. It opens the local editor in a tab.

No compilation or npm install is required to use the extension. Reload it from the extensions page after editing its source.

The retro X / FH icon appears in the browser's extensions list and toolbar, as well as the editor header and tab. If you installed an earlier unpacked version, use its **Reload** button in `chrome://extensions` or `edge://extensions` to refresh the icon. Pin Followers Hero from the browser's extensions menu if you want it always visible in the toolbar. [Artwork and generation prompt](./assets/README.md).

## Offline poster workflow

Choose **Try illustrated demo**, **Import photos**, or **Import JSON**. Import photos you own or have permission to reproduce. Choose a layout, palette, avatar shape and canvas format, edit the message, wait for the preview, then save PNG or JPEG. Export JSON to keep a reusable collection and its settings.

Photo import accepts up to 500 PNG/JPEG/WebP files, each under 20 MB. Images are resized locally to 96 pixels per avatar and stripped of source-file metadata by re-encoding. A normalized collection is limited to 5 MB. Imported JSON can contain up to 4,000 input records; at most 2,000 unique valid handles are retained. Files over 6 MB are rejected.

## Supervised website collection: required operator process

1. Obtain and check X’s written authorization for this collection and the intended storage, image processing and exports. Being signed in or owning the account is not a substitute.
2. Sign into X in the same browser. Expand **Supervised website collection** in the editor.
3. Enter the target username and collection limit. Read the restriction and confirm that you have written authorization and will monitor continuously.
4. Choose **Open supervised collection**. The browser asks for optional access to `x.com` and `pbs.twimg.com`. Declining leaves offline editing available.
5. The extension opens the target’s followers page and displays a large **Followers Hero · stay and monitor** overlay. Collection is initially waiting; opening the page alone does not start it.
6. Keep that page visible and focused. Click **Start / Resume** in the overlay to begin. Watch the saved/target count and activity message continuously. The collector reads visible follower cards, deduplicates them, waits three seconds, and scrolls once. This interval is a pacing choice, not a policy exemption or anti-detection technique.
7. Click **Pause** at any time to stop scanning and scrolling while keeping partial progress. Click **Start / Resume** when ready to supervise again. Switching tabs or windows also pauses and requires an explicit resume; focus checks cannot prove human attention.
8. Click **Stop** to end the current session and keep the collected data. Stop immediately on any X warning, rate restriction, sign-in issue, challenge or unexpected result. Do not bypass it or repeatedly retry. The tool does not solve challenges, rotate identities or retry around restrictions.
9. When the target is reached, collection stops. A stall, route change or 20-minute limit pauses it. A requested count is not proof that the complete follower list is available. Do not label observed order as a verified follow chronology.
10. Return to the editor to make the image. Switching there pauses a running collection. Check image rights and the scope of X’s authorization before downloading or publishing a poster or JSON.
11. Export if you need a copy, then use **Clear local data** when finished. Clearing requires confirmation and collection must be paused or stopped. Exported files remain in your download folder and must be managed separately.

The editor also has Pause and Stop controls. Reopening a paused session from the editor requires a fresh written-authorization confirmation and opens a new collection tab; it resumes from saved records with deduplication. Browser restarts and tab reloads never silently restart scanning. The selector depends on X’s UI and may stop working when X changes it.

## JSON format

Import an array of records or an object with a `followers` array:

```json
{
  "followers": [
    { "username": "example", "name": "Example person", "avatar": "" }
  ]
}
```

Only `username` is required. Embedded raster `data:image/png`, `image/jpeg` or `image/webp` base64 images are accepted, with a 128,000-character limit per image. Other usernames are validated and deduplicated. HTTPS avatar URLs are restricted to the exact `pbs.twimg.com/profile_images/` host/path. Remote URLs imported through JSON are **not fetched**; remote photos are loaded only for the written-authorized collection source. No scraping instruction or account authorization is inferred from an imported file.

An X account archive is not promised to contain follower photos or to match this import format. Downloading your archive does not automatically grant redistribution rights to other people’s images.

## Permissions and privacy

Required: `storage` for local records/settings and `scripting` for injecting the supervised monitor only after an authorized collection request. X and image-host access are **optional** and requested only when website collection is explicitly opened. There is no `cookies`, `debugger`, `webRequest`, `activeTab` or broad `tabs` permission.

The collector reads rendered cards. It does not extract credentials, session cookies or tokens, intercept requests, call private APIs, post, follow, like or message. The signed-in X page itself uses your normal session. Avatar fetches from the editor omit credentials. There is no backend, analytics, remote code, automatic update checker or remote font.

See [PRIVACY.md](./PRIVACY.md) for storage, deletion, network requests and contact information. Optional browser host grants can be revoked from your browser’s extension settings.

## Development and validation

Node.js 22 or newer, no runtime npm dependencies:

```sh
npm test
npm run check
```

From the repo root, `npm run package` creates a ZIP under `dist/`. It contains runtime files, the privacy notice and the license, with no follower data.

The optional `scripts/browser-smoke.cjs` integration runner uses Playwright and a compatible installed Chromium browser. Set `PLAYWRIGHT_MODULE` to your installed Playwright module if it is outside normal Node resolution, and `BROWSER_EXECUTABLE` to your selected test-browser executable, then run `node scripts/browser-smoke.cjs` from the root. It uses an isolated temporary profile and local page fixtures. Never use a personal profile or run automated tests against a real account. On macOS, use an execution context that permits native browser startup.

The fixture runner pregrants the two optional origins in a temporary copy of the extension and simulates a window blur because headless Chromium emulates focus. Production permission denial and actual OS focus behavior still need manual verification; the automated checks do not establish those outcomes.

Manual verification should cover offline imports, both image formats, JSON round trips, optional-permission denial, the overlay’s start/pause/stop behavior, loss-of-focus pausing, and partial-data recovery. A fixture pass does not establish live X compatibility or policy permission.

## Separate future API tool

The official-API version is planned separately as **`api-followers-hero-image`**. It is not implemented or enabled here. See the [API exploration plan](../docs/api-followers-hero-image-plan.md). API access alone does not resolve poster/export rights, privacy or retention obligations.

## Inspiration and license

Inspired by [XAvatarWall](https://github.com/qiujiu-dev/XAvatarWall), with independently written code and demo illustrations. No upstream source or assets are redistributed. [Assessment](../docs/xavatarwall-assessment.md).

[MIT](../LICENSE) · Copyright 2026 Matti Vilola. Sponsored and distributed by ILO Applications SL. The MIT license covers this source, not follower photos, X content or trademarks.
