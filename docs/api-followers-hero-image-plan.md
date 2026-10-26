# API Followers Hero Image: exploration plan

Planned tool name and future folder: **`api-followers-hero-image`**. This is a separate future tool, not implemented functionality or an enabled fallback in Followers Hero.

X documents a [followers lookup endpoint](https://docs.x.com/x-api/users/follows/introduction). That makes an official integration worth exploring, but does not establish that a given account has access or that avatar collages and exported datasets are permitted.

Before implementation:

- Verify the exact developer account/app access, current endpoint availability, auth method, scopes, billing and a user-approved spend limit.
- Review the [Developer Agreement](https://docs.x.com/developer-terms/agreement) and [Developer Policy](https://docs.x.com/developer-terms/policy) for the intended follower/avatar use and exported posters. Resolve display, image transformation, redistribution, privacy and retention requirements; seek clarification from X where needed.
- Design authorized credential handling without embedding secrets in a public extension or repository. Do not reuse a website session, intercept tokens or ask users to paste session cookies.
- Use published endpoints only, respect rate limits and stop on authorization failures. Never fall back to website scraping.
- Plan minimal local storage, clear privacy disclosures, revocation, deletion and updates when source content changes. Assess whether permanent downloaded collages can satisfy those obligations.
- Implement with mocked responses first. Perform any live verification only after access, purpose, credentials and cost are resolved.

This plan authorizes no developer signup, terms acceptance, credential creation, payment or live API request. See [shared repository decisions](./x-platform-policy.md).
