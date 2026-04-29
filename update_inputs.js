const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

c = c.replace(/<input([^>]+?)type=["']number["']([^>]*?)>/gi, (m, g1, g2) => {
  let inner = g1 + g2;
  // Remove existing placeholder
  inner = inner.replace(/placeholder=["'][^"']*["']/i, '');
  
  // Right justify text
  if (inner.includes('text-align:center') || inner.includes('text-align: center') || inner.includes('text-align:left') || inner.includes('text-align: left') || inner.includes('text-align:right') || inner.includes('text-align: right')) {
    inner = inner.replace(/text-align:\s*(left|center|right)/gi, 'text-align:right');
  } else if (inner.includes('style="')) {
    inner = inner.replace(/style="/i, 'style="text-align:right;');
  } else if (inner.includes("style='")) {
    inner = inner.replace(/style='/i, "style='text-align:right;");
  } else {
    inner += ' style="text-align:right;"';
  }
  
  return '<input type="number"' + inner + ' placeholder="Qty">';
});

fs.writeFileSync('public/index.html', c);
