// Rendered-page readers. No requests, token access or page-side evaluation.
(() => {
  if (globalThis.FollowersManagerDOM) return;
  const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'compose', 'i']);
  function pathHandle(href) {
    try { const url = new URL(href, 'https://x.com'); const match = url.origin === 'https://x.com' && url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i); return match && !reserved.has(match[1].toLowerCase()) ? match[1].toLowerCase() : ''; } catch { return ''; }
  }
  function usernameOf(cell) {
    // The first profile link identifies the row; bio mentions can link to other handles.
    return [...cell.querySelectorAll('a[href]')].map((a) => pathHandle(a.href)).find(Boolean) || '';
  }
  function bioOf(cell, username) {
    const explicit = cell.querySelector('[data-testid="UserDescription"], [data-testid="UserCellDescription"], [data-testid="UserBio"]');
    if (explicit) return { bio: explicit.textContent.trim().slice(0, 1000), bioObserved: true };
    const identityLinks = [...cell.querySelectorAll('a[href]')].filter((a) => pathHandle(a.href) === username);
    const candidates = [...cell.querySelectorAll('[dir="auto"]')].filter((node) => {
      const value = node.textContent.trim();
      if (!value || value.toLowerCase() === `@${username}` || /^(Follow|Following|Follow back|Follows you|Requested)$/i.test(value)) return false;
      if (node.closest('[data-testid="User-Name"], [data-testid="userFollowIndicator"]')) return false;
      const control = node.closest('button, [role="button"]');
      if (control && control !== cell) return false;
      if (identityLinks.some((a) => a.contains(node) || node.contains(a))) return false;
      return true;
    });
    const bio = candidates.filter((node) => !candidates.some((other) => other !== node && other.contains(node)))
      .map((node) => node.textContent.trim()).sort((a, b) => b.length - a.length)[0];
    return { bio: bio?.slice(0, 1000) || '', bioObserved: bio !== undefined };
  }
  function verifiedOf(cell) {
    const username = usernameOf(cell);
    const links = [...cell.querySelectorAll('a[href]')].filter((a) => pathHandle(a.href) === username);
    return links.some((a) => a.querySelector('svg[aria-label="Verified account"], svg[data-testid="icon-verified"]'));
  }
  function followsYou(cell) { return !!cell.querySelector('[data-testid="userFollowIndicator"]'); }
  function recordOf(cell, direction = 'following') {
    const username = usernameOf(cell); if (!username) return null;
    const button = cell.querySelector('[data-testid$="-unfollow"], [data-testid$="-follow"]');
    const id = button?.getAttribute('data-testid')?.match(/^(\d+)-(?:un)?follow$/)?.[1] || null;
    const name = [...cell.querySelectorAll('a[href]')].find((a) => pathHandle(a.href) === username && a.textContent.trim() && !a.textContent.trim().startsWith('@'))?.textContent.trim() || username;
    return { id, username, name: name.slice(0, 100), ...bioOf(cell, username), observedAt: new Date().toISOString(), lastPostAt: null,
      protected: !!cell.querySelector('[data-testid="icon-lock"], svg[aria-label="Protected account"]'), verified: verifiedOf(cell),
      followsYou: direction === 'followers' ? true : button ? followsYou(cell) : null,
      isFollowing: button ? button.getAttribute('data-testid').endsWith('-unfollow') : null };
  }
  globalThis.FollowersManagerDOM = Object.freeze({ pathHandle, usernameOf, bioOf, verifiedOf, followsYou, recordOf });
})();
