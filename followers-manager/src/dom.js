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
  function listRoot() {
    return document.querySelector('[data-testid="primaryColumn"]') || document;
  }
  function excludedFromList(node) {
    return !!node.closest('aside, [data-testid="sidebarColumn"], #followers-manager-monitor');
  }
  function listCells() {
    return [...listRoot().querySelectorAll('[data-testid="UserCell"]')].filter((cell) => !excludedFromList(cell));
  }
  function pageScroller() {
    return document.scrollingElement || document.documentElement;
  }
  function listScroller(cards = listCells()) {
    const page = pageScroller(), lastCard = cards[cards.length - 1];
    for (let node = lastCard?.parentElement; node && node !== page; node = node.parentElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if (['auto', 'scroll', 'overlay'].includes(overflowY) && node.scrollHeight > node.clientHeight) return node;
    }
    return page;
  }
  function visible(node) {
    if (!node?.getClientRects().length) return false;
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  }
  function listLoading() {
    const root = listRoot();
    const selectors = '[role="progressbar"], [aria-busy="true"], [data-testid*="spinner" i], [data-testid*="loading" i], [aria-label*="loading" i]';
    const rootMatch = root.matches?.(selectors) ? [root] : [];
    return [...rootMatch, ...root.querySelectorAll(selectors)].some((node) => !excludedFromList(node) && visible(node));
  }
  function listState() {
    const scroller = listScroller(), page = pageScroller();
    const isPage = scroller === page;
    const scrollTop = Number(scroller?.scrollTop) || 0;
    const scrollHeight = Number(scroller?.scrollHeight) || 0;
    const viewportHeight = isPage ? (Number(window.innerHeight) || Number(scroller?.clientHeight) || 0) : (Number(scroller?.clientHeight) || 0);
    return { scrollTop, scrollHeight, viewportHeight, atBottom: scrollTop + viewportHeight >= scrollHeight - 1, loading: listLoading() };
  }
  function scrollList(pixels = 640) {
    const distance = Number.isFinite(Number(pixels)) ? Number(pixels) : 640;
    if (distance > 0) {
      const scroller = listScroller();
      scroller.scrollTop = (Number(scroller.scrollTop) || 0) + distance;
    }
    return listState();
  }
  function bioOf(cell, username) {
    const explicit = cell.querySelector('[data-testid="UserDescription"], [data-testid="UserCellDescription"], [data-testid="UserBio"]');
    if (explicit) return { bio: explicit.textContent.trim().slice(0, 1000), bioObserved: true };
    const identityLinks = [...cell.querySelectorAll('a[href]')].filter((a) => pathHandle(a.href) === username);
    const candidates = [...cell.querySelectorAll('[dir="auto"]')].filter((node) => {
      const value = node.textContent.trim();
      if (!value || value.toLowerCase() === `@${username}` || /^(Follow|Following|Follow back|Follows you|Requested)$/i.test(value)) return false;
      if (/^Click to (?:un)?follow\b/i.test(value) || node.closest('[role="tooltip"], [data-testid*="tooltip" i]')) return false;
      if (node.closest('[data-testid="User-Name"], [data-testid="userFollowIndicator"]')) return false;
      const control = node.closest('button, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"]');
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
  globalThis.FollowersManagerDOM = Object.freeze({ pathHandle, usernameOf, bioOf, verifiedOf, followsYou, recordOf, listCells, listState, scrollList });
})();
