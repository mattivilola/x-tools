import { dimensions } from './core.js';

const palettes = {
  lavender: { bg: '#d8d0ed', ink: '#352b53', accent: '#736197', tile: '#e9e3f5' },
  ocean: { bg: '#c8e8eb', ink: '#16494d', accent: '#4b8587', tile: '#e1f2f1' },
  paper: { bg: '#faf7ed', ink: '#3f493c', accent: '#7b8c67', tile: '#e8ecdf' },
  midnight: { bg: '#253849', ink: '#edf4f6', accent: '#a9c6cf', tile: '#3c5364' },
};
function hash(value) { return [...value].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7); }
function rounded(ctx, x, y, width, height, radius) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
}
function portrait(ctx, person, x, y, size, image, shape, demo) {
  ctx.save();
  rounded(ctx, x, y, size, size, shape === 'circle' ? size / 2 : shape === 'rounded' ? size * .2 : 0);
  ctx.clip();
  const seed = hash(person.username);
  ctx.fillStyle = `hsl(${seed % 360} 35% 79%)`; ctx.fillRect(x, y, size, size);
  if (image) {
    const edge = Math.min(image.width, image.height);
    ctx.drawImage(image, (image.width - edge) / 2, (image.height - edge) / 2, edge, edge, x, y, size, size);
  } else if (demo) {
    ctx.fillStyle = `hsl(${(seed + 130) % 360} 30% 37%)`;
    ctx.beginPath(); ctx.ellipse(x + size / 2, y + size, size * .4, size * .35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ['#e5ad87', '#b97d5d', '#744d3b', '#f2c8a7'][seed % 4];
    ctx.beginPath(); ctx.ellipse(x + size / 2, y + size * .43, size * .23, size * .28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ['#453b3a', '#79553c', '#d8b472'][seed % 3];
    ctx.beginPath(); ctx.ellipse(x + size * .5, y + size * .23, size * .25, size * .13, -.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b3334';
    for (const offset of [.42, .58]) { ctx.beginPath(); ctx.arc(x + size * offset, y + size * .45, size * .018, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#6b443d'; ctx.lineWidth = size * .018; ctx.beginPath(); ctx.arc(x + size * .5, y + size * .54, size * .06, 0, Math.PI); ctx.stroke();
  } else {
    ctx.fillStyle = '#34443e'; ctx.font = `600 ${size * .36}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(person.name.slice(0, 1).toUpperCase(), x + size / 2, y + size * .64);
  }
  ctx.restore();
}
function text(ctx, value, x, y, width, fontSize, maxLines, color, weight = 500) {
  ctx.font = `${weight} ${fontSize}px "Avenir Next", "Segoe UI", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = 'left';
  // Character wrapping also bounds long strings without spaces and non-Latin text.
  const lines = []; let line = '';
  for (const char of value) {
    if (char === '\n' || ctx.measureText(line + char).width > width) { lines.push(line); line = char === '\n' ? '' : char; } else line += char;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, i) => {
    if (i === maxLines - 1 && lines.length > maxLines) {
      while (item && ctx.measureText(item + '…').width > width) item = item.slice(0, -1);
      item += '…';
    }
    ctx.fillText(item.trim(), x, y + i * fontSize * 1.15);
  });
}
export function renderPoster(canvas, people, config, images = new Map(), demo = false) {
  const [w, h] = dimensions(config);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const p = palettes[config.theme];
  const unit = Math.min(w, h), margin = unit * .065;
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
  const title = config.title.replaceAll('{count}', people.length.toLocaleString('en-US'));
  const list = config.order === 'reverse' ? [...people].reverse() : people;
  let gridTop;
  if (config.layout === 'spotlight') {
    text(ctx, title, margin, h * .12, w - margin * 2, unit * .065, 2, p.ink, 600);
    text(ctx, `${people.length.toLocaleString('en-US')}`, margin, h * .37, w * .6, unit * .16, 1, p.ink, 600);
    text(ctx, demo ? 'imaginary people, real possibilities' : 'people in this picture', margin, h * .415, w - margin * 2, unit * .023, 1, p.ink);
    gridTop = h * .47;
  } else if (config.layout === 'banner') {
    text(ctx, people.length.toLocaleString('en-US'), margin, h * .23, w - margin * 2, unit * .2, 1, p.accent, 700);
    text(ctx, title, margin, h * .32, w - margin * 2, unit * .045, 2, p.ink, 600);
    gridTop = h * .42;
  } else {
    text(ctx, title, margin, h * .12, w - margin * 2, unit * .06, 2, p.ink, 600);
    gridTop = h * .26;
  }
  const boxW = w - margin * 2, boxH = h * .84 - gridTop;
  if (!list.length) {
    text(ctx, 'Your community goes here.', margin, gridTop + boxH / 2, boxW, unit * .035, 2, p.ink);
  } else {
    let best = { size: 0, cols: 1, rows: list.length };
    const gap = unit * (list.length > 500 ? .0025 : .006);
    for (let cols = 1; cols <= list.length; cols++) {
      const rows = Math.ceil(list.length / cols);
      const size = Math.min((boxW - (cols - 1) * gap) / cols, (boxH - (rows - 1) * gap) / rows);
      if (size > best.size) best = { size, cols, rows };
    }
    const { size, cols, rows } = best;
    const startY = gridTop + (boxH - (rows * (size + gap) - gap)) / 2;
    list.forEach((person, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const inRow = Math.min(cols, list.length - row * cols);
      const startX = margin + (boxW - (inRow * (size + gap) - gap)) / 2;
      portrait(ctx, person, startX + col * (size + gap), startY + row * (size + gap), size, images.get(person.avatar), config.shape, demo);
    });
  }
  text(ctx, config.caption, margin, h * .9, w - margin * 2, unit * .023, 2, p.ink);
  const handle = config.username.replace(/^@/, '');
  text(ctx, demo ? 'Followers Hero / Demo community' : handle ? `@${handle} / ${people.length.toLocaleString('en-US')} people celebrated` : 'Made with Followers Hero', margin, h * .965, w - margin * 2, unit * .017, 1, p.ink);
}
