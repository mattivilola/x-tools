import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/dom.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName = 'div', attributes = {}, textContent = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes).map(([key, value]) => [key.toLowerCase(), String(value)]));
    this.textContent = textContent;
    this.parentElement = null;
    this.children = [];
    this.style = { display: 'block', visibility: 'visible', opacity: '1', overflowY: 'visible' };
    this.layoutVisible = true;
    this.clientHeight = 0;
    this._scrollHeight = 0;
    this._scrollTop = 0;
    this.rect = { width: 120, height: 24 };
  }
  get id() { return this.getAttribute('id') || ''; }
  get href() { return this.getAttribute('href') || ''; }
  get scrollHeight() { return this._scrollHeight; }
  set scrollHeight(value) { this._scrollHeight = Number(value) || 0; }
  get scrollTop() { return this._scrollTop; }
  set scrollTop(value) { this._scrollTop = Math.max(0, Math.min(Number(value) || 0, Math.max(0, this.scrollHeight - this.clientHeight))); }
  getAttribute(name) { return this.attributes.get(String(name).toLowerCase()) ?? null; }
  append(...nodes) {
    for (const node of nodes) { node.parentElement = this; this.children.push(node); }
    return this;
  }
  matches(selector) {
    return String(selector).split(',').some((part) => this.matchesOne(part.trim()));
  }
  matchesOne(selector) {
    if (!selector) return false;
    const id = selector.match(/#([\w-]+)/);
    if (id && this.id !== id[1]) return false;
    const tag = selector.match(/^[a-z][\w-]*/i);
    if (tag && this.tagName !== tag[0].toUpperCase()) return false;
    const attrPattern = /\[([^\]=\s]+)(?:([*^$]?=)"([^"]*)"(?:\s+(i))?)?\]/gi;
    let match;
    while ((match = attrPattern.exec(selector))) {
      const [, name, operator, expected, insensitive] = match;
      let actual = this.getAttribute(name);
      if (actual === null) return false;
      if (!operator) continue;
      if (insensitive) actual = actual.toLowerCase();
      const wanted = insensitive ? expected.toLowerCase() : expected;
      if (operator === '=' && actual !== wanted) return false;
      if (operator === '*=' && !actual.includes(wanted)) return false;
      if (operator === '^=' && !actual.startsWith(wanted)) return false;
      if (operator === '$=' && !actual.endsWith(wanted)) return false;
    }
    return true;
  }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  contains(node) {
    for (let current = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  getClientRects() { return this.layoutVisible ? [this.rect] : []; }
  getBoundingClientRect() { return this.rect; }
}

class FakeDocument extends FakeElement {
  constructor() {
    super('#document');
    this.documentElement = new FakeElement('html');
    this.body = new FakeElement('body');
    this.append(this.documentElement);
    this.documentElement.append(this.body);
    this.scrollingElement = this.documentElement;
  }
}

function loadDom(document) {
  const context = {
    document,
    URL,
    window: { innerHeight: 800 },
    getComputedStyle: (node) => node.style,
  };
  context.globalThis = context;
  runInNewContext(source, context);
  return context.FollowersManagerDOM;
}

function userCell(username) {
  const cell = new FakeElement('div', { 'data-testid': 'UserCell' });
  const link = new FakeElement('a', { href: `/${username}` }, username);
  cell.append(link);
  return cell;
}

test('listCells prefers primaryColumn and excludes sidebars and the tool overlay', () => {
  const document = new FakeDocument();
  const primary = new FakeElement('main', { 'data-testid': 'primaryColumn' });
  const primaryCell = userCell('mainuser');
  primary.append(primaryCell);
  const elsewhere = userCell('elsewhere');
  const aside = new FakeElement('aside').append(userCell('asideuser'));
  const sidebar = new FakeElement('div', { 'data-testid': 'sidebarColumn' }).append(userCell('sidebaruser'));
  const overlay = new FakeElement('div', { id: 'followers-manager-monitor' }).append(userCell('overlayuser'));
  primary.append(aside, sidebar, overlay);
  document.body.append(primary, elsewhere);
  const dom = loadDom(document);
  assert.equal(Array.from(dom.listCells(), (cell) => dom.usernameOf(cell)).join(','), 'mainuser');
});

test('listCells works without primaryColumn and listState scrolls the nearest list container', () => {
  const document = new FakeDocument();
  document.scrollingElement.scrollHeight = 4000;
  document.scrollingElement.clientHeight = 800;
  const panel = new FakeElement('div');
  panel.style.overflowY = 'auto'; panel.scrollHeight = 1800; panel.clientHeight = 500; panel.scrollTop = 300;
  const cell = userCell('visibleuser');
  panel.append(cell);
  const aside = new FakeElement('aside').append(userCell('asideexcluded'));
  const sidebar = new FakeElement('div', { 'data-testid': 'sidebarColumn' }).append(userCell('sidebarexcluded'));
  const overlay = new FakeElement('div', { id: 'followers-manager-monitor' }).append(userCell('overlayexcluded'));
  document.body.append(panel, aside, sidebar, overlay);
  const dom = loadDom(document);
  assert.equal(Array.from(dom.listCells(), (item) => dom.usernameOf(item)).join(','), 'visibleuser');
  const before = dom.listState();
  assert.equal(before.scrollTop, 300);
  assert.equal(before.scrollHeight, 1800);
  assert.equal(before.viewportHeight, 500);
  assert.equal(before.atBottom, false);
  assert.equal(before.loading, false);
  assert.equal(dom.scrollList(640).scrollTop, 940);
  assert.equal(dom.scrollList(640).atBottom, true);
});

test('listState reports only visible list loading signals', () => {
  const document = new FakeDocument();
  const primary = new FakeElement('main', { 'data-testid': 'primaryColumn' });
  const spinner = new FakeElement('div', { role: 'progressbar' });
  const hiddenLoader = new FakeElement('div', { 'data-testid': 'loading-more' }); hiddenLoader.layoutVisible = false;
  primary.append(userCell('listed'), spinner, hiddenLoader);
  const overlay = new FakeElement('div', { id: 'followers-manager-monitor' }).append(new FakeElement('div', { 'data-testid': 'spinner' }));
  document.body.append(primary, overlay);
  const dom = loadDom(document);
  assert.equal(dom.listState().loading, true);
  spinner.layoutVisible = false;
  assert.equal(dom.listState().loading, false);
});

test('bio fallback ignores tooltip and relationship-control labels while retaining bio mentions', () => {
  const document = new FakeDocument();
  const dom = loadDom(document);
  const cell = userCell('alice'); cell.attributes.set('role', 'button');
  const validBio = new FakeElement('div', { dir: 'auto' }, 'Designer in Helsinki; follow @beta for updates');
  const tooltip = new FakeElement('div', { role: 'tooltip' }).append(new FakeElement('span', { dir: 'auto' }, 'Click to Unfollow @alice'));
  const standaloneLabel = new FakeElement('span', { dir: 'auto' }, 'Click to Follow @alice');
  const button = new FakeElement('button').append(new FakeElement('span', { dir: 'auto' }, 'Follow back'));
  cell.append(validBio, tooltip, standaloneLabel, button);
  const bio = dom.bioOf(cell, 'alice');
  assert.equal(bio.bio, 'Designer in Helsinki; follow @beta for updates');
  assert.equal(bio.bioObserved, true);
});
