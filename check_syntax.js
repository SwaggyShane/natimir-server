const fs = require('fs');
const { parse } = require('node-html-parser');
const acorn = require('acorn');

const html = fs.readFileSync('/public/index.html', 'utf8');
const root = parse(html);
const scripts = root.querySelectorAll('script');

scripts.forEach((script, i) => {
    const code = script.text;
    if (!code.trim()) return;
    try {
        acorn.parse(code, { ecmaVersion: 2020, sourceType: 'script' });
        console.log(`Script ${i} is valid.`);
    } catch (err) {
        console.error(`Script ${i} (line ${script.range[0]}) is invalid: ${err.message}`);
        // Log a bit of the code around error
        const pos = err.pos;
        console.error(code.slice(Math.max(0, pos-50), pos+50));
    }
});
