# X access and usage decisions

Reviewed: **2026-10-26**. Applies to every tool in X Tools. Recheck the linked official sources before changing access, collection, storage or export behavior. This records engineering decisions and known limits; it is not a certification that every use is permitted.

## Source findings

| Official source | Finding relevant to this repository |
| --- | --- |
| [X Terms of Service](https://x.com/en/tos), including the regional terms linked on that page | Restricts access methods and scraping without express written permission; also addresses facilitating violations. Account ownership and public visibility do not establish permission to scrape or reuse content. |
| [Automation rules](https://help.x.com/en/rules-and-policies/x-automation), marked updated April 2026 | Explicitly prohibits non-API website scripting and warns of permanent account suspension. User responsibility is stated; supervision is not presented as an exception. |
| [Developer Agreement](https://docs.x.com/developer-terms/agreement), marked updated April 27, 2026 | Official API use is subject to a separate agreement and applicable access/subscription conditions. |
| [Developer Policy](https://docs.x.com/developer-terms/policy) | Requires attention to privacy, content display, redistribution, protected/deleted content and service identity. Access to data is not unrestricted permission to redistribute it. |
| [Follows API](https://docs.x.com/x-api/users/follows/introduction) | Documents `GET /2/users/:id/followers`; access requires the relevant developer setup and credentials. This establishes an API route, not approval of our whole product or exports. |
| [Download your X archive](https://help.x.com/en/managing-your-account/how-to-download-your-x-archive) | Describes an official user-driven data-download route. We do not assume it includes reusable follower photos or grants publication rights. |

## Repository decisions

1. **Default to offline use.** Demo, local-photo import and JSON editing must work without X site permission, credentials or a live X account. JSON import must not silently start remote avatar downloads.
2. **Operator responsibility is not X permission.** Following the owner's explicit decision on 2026-10-26, Followers Hero requires a per-session acknowledgement of X's restrictions, account risk, personal responsibility and continuous supervision, plus optional site grants. It does not require or record a potentially false claim that written authorization exists. This changes the earlier Followers Hero project gate; it does not change X's rules. Do not market this mode as compliant, authorized by X, or protected from enforcement. Other tools retain their own documented gates.
3. **Continuous supervision is required in addition to permission.** The operator must watch the large on-page progress/activity overlay and be able to pause or stop immediately. Initial page load waits for an explicit Start. Focus or visibility loss, route changes, stalls, reloads and browser restarts must not silently restart scanning. These controls reduce unattended operation; they do not make otherwise prohibited automation acceptable or prove human presence.
4. **No circumvention.** Stop on warnings, restrictions or challenges. Do not add private-API replay, token/cookie extraction, network interception, CAPTCHA solving, stealth fingerprints, identity/proxy rotation or retry logic intended to get around X controls. A three-second scroll interval is not an anti-ban promise or policy exception.
5. **Separate automated fixtures from owner-supervised live checks.** Regression suites use isolated profiles and controlled fixtures. A separately requested live check requires the account owner's explicit instruction and acknowledgement of the policy/account risk, stays bounded to the agreed sample, and must stop on warnings, challenges or restrictions. Do not store personal test records or screenshots in Git. The owner's decision is not evidence of permission from X, and no live check establishes ongoing account safety.
6. **Protect data and rights.** Keep records local by default, request narrow permissions, provide export/deletion controls and publish a privacy notice. Do not include personal exports or photos in Git. Written permission for collection must also be assessed for storage, image transformation, downloads and publication. Photo owners' rights and applicable privacy requirements remain separate.
7. **No automatic account actions.** The initial collector does not post, follow, like, message or modify profiles. Adding any action requires a new policy/use-case review and explicit user-facing consent for that action.
8. **Keep the future API product separate.** Explore `api-followers-hero-image` independently. Verify current API access, pricing, auth, rate limits, allowed purpose, display/export rights, retention and deletion before implementation or live requests. Do not use the website collector as its fallback.
9. **State limitations accurately.** No guarantee of permission, policy compliance or protection from account enforcement. A code license does not license X content. Keep regional terms and any specific written agreement in scope; do not infer an exception from jurisdiction or from a generic disclaimer.

## Release review

### Followers Manager supervised action review (2026-10-26)

The separate `followers-manager` extension implements the owner's requested fixed-selection unfollow workflow through rendered X controls. It requires a per-session attestation of express written X authorization covering collection/actions and data use, optional X site permission, explicit action consent and continuous monitoring. It is not offered as an exception to the published automation restrictions. The large on-page monitor shows the target, countdown, progress and outcomes, with Pause/Stop and focus-loss pausing. No unattended reciprocal-unfollow daemon, private endpoint replay, session-token extraction or evasion is used. Fixture tests use synthetic pages and an isolated browser; no live account actions are part of release verification. The proposed `api-followers-management` edition is independent and needs its own access, cost and permitted-use-case review.

For any new or changed X integration, record the source-review date, access method, required authorization, scopes, stored fields, network destinations, rights to exported output and verification evidence. Source changes must enforce the documented decisions. Revisit this document when official terms change or a particular agreement is obtained; do not silently generalize one operator's permission to everyone.
