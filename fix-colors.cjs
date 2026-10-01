const fs = require('fs');
const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  { regex: /bg-\[\#0e1626\]\/90/g, replace: 'bg-white/90 dark:bg-[#0e1626]/90' },
  { regex: /bg-\[\#0e1626\]\/95/g, replace: 'bg-white/95 dark:bg-[#0e1626]/95' },
  { regex: /hover:bg-\[\#141f36\]/g, replace: 'hover:bg-slate-100 dark:hover:bg-[#141f36]' },
  { regex: /bg-\[\#0f172a\]\/80/g, replace: 'bg-white/80 dark:bg-[#0f172a]/80' },
  { regex: /text-cyan-300/g, replace: 'text-cyan-600 dark:text-cyan-300' },
  { regex: /hover:text-cyan-200/g, replace: 'hover:text-cyan-700 dark:hover:text-cyan-200' },
  { regex: /text-amber-300/g, replace: 'text-amber-600 dark:text-amber-300' },
  { regex: /text-amber-400/g, replace: 'text-amber-600 dark:text-amber-400' },
  { regex: /text-emerald-400/g, replace: 'text-emerald-600 dark:text-emerald-400' },
  { regex: /text-emerald-300/g, replace: 'text-emerald-600 dark:text-emerald-300' },
  { regex: /text-rose-400/g, replace: 'text-rose-600 dark:text-rose-400' },
  { regex: /bg-amber-500\/10/g, replace: 'bg-amber-500/20 dark:bg-amber-500/10' },
  { regex: /bg-emerald-500\/10/g, replace: 'bg-emerald-500/20 dark:bg-emerald-500/10' },
  { regex: /bg-rose-500\/10/g, replace: 'bg-rose-500/20 dark:bg-rose-500/10' },
  { regex: /bg-cyan-500\/10/g, replace: 'bg-cyan-500/20 dark:bg-cyan-500/10' },
  { regex: /border-slate-700\/80/g, replace: 'border-slate-300/80 dark:border-slate-700/80' },
  { regex: /bg-slate-900\/50/g, replace: 'bg-white/50 dark:bg-slate-900/50' }
];

for (const {regex, replace} of replacements) {
    content = content.replace(regex, replace);
}

// Ensure the border replacement doesn't cause `border-slate-300/80 dark:border-slate-300/80 dark:border-slate-700/80` if ran multiple times
content = content.replace(/dark:border-slate-300\/80 dark:border-slate-700\/80/g, 'dark:border-slate-700/80');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed colors successfully');
