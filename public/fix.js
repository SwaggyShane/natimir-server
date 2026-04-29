const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Update structure of hbtns inside hire-row
const regex = /<div class="hbtns">\s*<div style="display:flex;align-items:center;margin-bottom:4px">\s*<input type="number"\s+id="([^"]+)" min="0" value="0"\s+style="text-align:right;flex:1"\s+placeholder="Qty">\s*<button class="btn" style="font-size:10px;padding:3px 6px;margin-left:4px" onclick="setMaxValue\('([^']+)',\s*'([^']+)'\)">Max<\/button>\s*<\/div>\s*<div style="display:flex;gap:4px;justify-content:flex-end">\s*<button class="btn btn-gold" style="font-size:10px;padding:3px 8px" onclick="hire\('([^']+)'\)">Hire<\/button>\s*<button class="btn btn-red" style="font-size:10px;padding:3px 8px" onclick="fire\('([^']+)'\)">Fire<\/button>\s*<\/div>\s*<\/div>/g;

html = html.replace(regex, (match, inputId, maxId, maxType, hireId, fireId) => {
  return `<div class="hbtns" style="display:flex;align-items:center;gap:4px;justify-content:flex-end">
            <input type="number" id="${inputId}" min="0" value="0" style="text-align:right;width:60px" placeholder="Qty">
            <button class="btn" style="font-size:10px;padding:3px 6px" onclick="setMaxValue('${maxId}', '${maxType}')">Max</button>
            <button class="btn btn-gold" style="font-size:10px;padding:3px 8px" onclick="hire('${hireId}')">Hire</button>
            <button class="btn btn-red" style="font-size:10px;padding:3px 8px" onclick="fire('${fireId}')">Fire</button>
          </div>`;
});

// Fix hire-row CSS
html = html.replace('.hire-row { display: grid; grid-template-columns: 1fr 60px 70px 140px; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--border); align-items: center; }',
  '.hire-row { display: grid; grid-template-columns: 1fr 60px 70px auto; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--border); align-items: center; justify-items: end; }');

html = html.replace('.hire-row .hname { font-size:13px; color:var(--text); font-weight:600; }',
  '.hire-row .hname { font-size:13px; color:var(--text); font-weight:600; justify-self: start; }\n          .hire-row .hdesc { justify-self: start; }\n          .hire-row > div:first-child { width: 100%; }');

html = html.replace('.hire-row { grid-template-columns: 1fr 1fr; gap: 12px; }',
  '.hire-row { grid-template-columns: 1fr 1fr; gap: 12px; justify-items: stretch; }\n    .hire-row > div:nth-child(2) { text-align: left; } \n    .hire-row > div:nth-child(3) { text-align: right; }');

html = html.replace('.hire-row .hbtns { justify-content: flex-end; }',
  '.hire-row .hbtns { justify-content: flex-end; grid-column: 1 / -1; width: 100%; }');

fs.writeFileSync('public/index.html', html, 'utf8');
