const fs = require('fs');
const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  { regex: /text-amber-200/g, replace: 'text-amber-700 dark:text-amber-200' },
  { regex: /text-amber-50(?!0)/g, replace: 'text-amber-900 dark:text-amber-50' },
  { regex: /text-cyan-200/g, replace: 'text-cyan-700 dark:text-cyan-200' },
  { regex: /text-emerald-200/g, replace: 'text-emerald-700 dark:text-emerald-200' },
  { regex: /text-rose-200/g, replace: 'text-rose-700 dark:text-rose-200' },
  { regex: /text-slate-50(?!0)/g, replace: 'text-slate-800 dark:text-slate-50' }
];

for (const {regex, replace} of replacements) {
    content = content.replace(regex, replace);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed more colors successfully');
