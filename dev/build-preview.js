// Builds dev/preview.html: Index.html + the real Code.gs running against a fake sheet (dev/mock.js).
// Usage: node dev/build-preview.js   then open dev/preview.html in a browser.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Index.html'), 'utf8');
const code = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock.js'), 'utf8');
const inject = `<script>window.__CODE_GS = ${JSON.stringify(code)};</script>\n<script>${mock}</script>\n`;
// Code.gs adds this meta tag in the real app (doGet); add it here too so phones lay the page out the same way.
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n';
fs.writeFileSync(path.join(__dirname, 'preview.html'), html.replace('<head>\n', '<head>\n' + viewport).replace('<script>\nlet state', inject + '<script>\nlet state'));
console.log('wrote dev/preview.html');
