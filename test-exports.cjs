const esbuild = require('esbuild');
const res = esbuild.transformSync(require('fs').readFileSync('client/src/pages/dashboard.tsx', 'utf8'), { loader: 'tsx' });
console.log("Transformed successfully, length: " + res.code.length);
