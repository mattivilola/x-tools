# API Followers Management

**Proposed separate tool. No runnable implementation, credentials or live API requests.**

Explore an official-X-API edition of follower history and following management. Keep it independent of the [Followers Manager browser extension](../followers-manager/README.md); do not mix website scripting into this tool or fall back to it when API access fails.

**Made by [Matti Vilola](https://github.com/mattivilola) with {love}.**

**Sponsored and distributed by [ILO Applications SL](https://iloapps.com).**

## Questions to settle before implementation

1. Does the intended developer account/app have access to follower/following lists, user metrics and inbound follow/unfollow events?
2. What scopes, supported OAuth flow, limits and cost apply at the intended scale? Can qualifying owner-read pricing apply, or is this a distributed app?
3. Does X permit the exact user-triggered or automatic unfollow workflow? The existence of [an unfollow endpoint](https://docs.x.com/x-api/users/unfollow-user) does not answer that question. [Current behavior guidance](https://help.x.com/en/rules-and-policies/x-rules-and-best-practices) restricts automated unfollowing.
4. What retention, deletion, export/display and protected-account requirements apply under the developer terms and any particular agreement?
5. Can an event stream reduce full-snapshot polling cost, and how will delivery gaps, duplicate events and reconciliation work?

## Potential shape

Local history/dashboard with a provider adapter, stable account IDs, bounded snapshots, read-only authorization first, and optional individually consented actions only where permitted. Always-on monitoring would need a documented persistent receiver or companion. No API keys, tokens or client secrets belong in Git or logs.

API access does not automatically resolve automation restrictions. The feasibility review should produce a clear supported-use-case decision and current cost estimate before making a product promise. See the [dated source research](../followers-manager/research.md) and [shared policy](../docs/x-platform-policy.md).

[MIT License](../LICENSE) · Independent of X and not endorsed by it.
