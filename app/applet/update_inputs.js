const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');
c = c.replace(/<input([^>]+?)type=["']number["']([^>]*?)>/gi, (m, g1, g2) => {
  let inner = g1 + g2;
  inner = inner.replace(/placeholder=["'][^"']*["']/i, '');
  // add placeholder
  if (!inner.includes('placeholder=')) {
    inner += ' placeholder="Qty"';
  }
  return '<input type="number"' + inner + '>';
});
fs.writeFileSync('public/index.html', c);
console.log('Inputs updated');
