# Research and corrections

Checked 2026-10-26. Vendor claims below were checked against published pages, not by installing extensions or connecting an X account. Availability, pricing, and platform rules can change.

## Checking the supplied comments

| Comment | Finding |
| --- | --- |
| Unfollr is free, local, and needs no OAuth | Its [own site](https://www.unfollr.com/) advertises those properties and snapshot comparison. However, its current installation CTA offers beta access by email. This does not verify public install availability, code privacy, or live reliability. |
| UnfollowMonkey is free below about 2,000 followers, monthly, with DMs | Its [plan page](https://unfollow-monkey.com/en) currently confirms accounts **under 2,000**, monthly checks, and a requirement to follow @unfollowmonkey. Its [terms](https://unfollow-monkey.com/en/terms) describe OAuth login. Faster checks are paid. |
| A free mass-unfollow extension exists | The [Chrome Web Store listing](https://chromewebstore.google.com/detail/x-twitter-mass-unfollow-t/igpjmagghnibmjkkdcgpjgpkfkpiglnl) for extension `igpjmagghnibmjkkdcgpjgpkfkpiglnl` currently calls itself “Bulk Following Cleaner” and advertises free browser-session execution, filters, preview, and pacing. Those are publisher claims, not proof of account safety or compliance. |
| Download two archives and compare followers | Feasible: [X says archives include followers and following](https://help.x.com/en/managing-your-account/how-to-download-your-x-archive). An archive can take days to prepare. Compare export observation dates, not file import dates; do not promise real-time detection or an invariant filename/schema before inspecting fixtures. |
| A few hundred follows/unfollows per day is a safe free-account limit | Unsupported as written. [X publishes a technical follow limit](https://help.x.com/en/rules-and-policies/x-limits), not a universal daily unfollow allowance. Technical limits and permission to automate are separate. |
| Browser session tools are generally safer than OAuth/API tools | Unsupported. Session-based tools can act as you, and [X prohibits website scripting](https://help.x.com/en/rules-and-policies/x-automation). OAuth supports explicit permissions and revocation; implementation and scopes still matter. Local storage alone does not prove safety. |
| A missing follower means that person chose to unfollow | Not necessarily. Account unavailability and incomplete data also affect observations. Changes require a baseline and comparable coverage; exact intent or event time cannot be inferred from two snapshots. |

Do not use third-party blog lists or console scripts as evidence that a workflow is permitted. The supplied xactions.app reference was not evaluated as an implementation dependency.

## Official API feasibility

[Follows documentation](https://docs.x.com/x-api/users/follows/introduction) lists these endpoints:

- `GET /2/users/:id/followers`
- `GET /2/users/:id/following`
- `DELETE /2/users/:source_user_id/following/:target_user_id`

The [unfollow reference](https://docs.x.com/x-api/users/unfollow-user) documents user authorization. An endpoint's existence does not authorize unattended or bulk use. Verify exact scopes, app access, redirect support, pagination, and endpoint-specific limits during connected-mode implementation.

The [X Activity API](https://docs.x.com/x-api/activity/introduction) documents follow/unfollow events and direction filtering, delivered through a stream or webhook. This is worth investigating for connected monitoring. Do not assume entitlement, replay completeness, or continuous browser delivery; prove coverage for the signed-in account, handle gaps, and reconcile with snapshots.

## Cost matters

[Published API pricing](https://docs.x.com/x-api/getting-started/pricing) currently lists relationship reads at $0.010 per resource, or $0.001 for qualifying reads by the developer-app owner. Thus 1,000 followers plus 1,000 following imply roughly $20 or $2 per full read respectively, before enrichment and other charges. Daily scans multiply that expense. These are planning estimates; confirm billing in the Developer Console. Do not assume a shared distributed app qualifies for owner pricing.

Prefer count updates and selected enrichment over frequent full-list polling. Show an estimate before a paid sync, enforce a user budget, and stop on exhausted credits. Free local software does not imply free connected data.

## Product conclusion

The implemented browser edition uses explicit per-session selections and a continuously monitored on-page unfollow runner, restricted by the repository's written-authorization policy. It has no unattended reciprocal-unfollow daemon. Its overlay and consent do not resolve X's restrictions. Explore API reads and permitted actions separately in [api-followers-management](../api-followers-management/README.md); neither pacing nor API access alone resolves the policy question.
