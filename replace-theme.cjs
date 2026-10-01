const fs = require('fs');

const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  { regex: /\bbg-\[\#070b14\]/g, replace: 'bg-slate-50 dark:bg-[#070b14]' },
  { regex: /\bbg-slate-950(\/[0-9]+)?/g, replace: (m, alpha) => `bg-white${alpha||''} dark:${m}` },
  { regex: /\bbg-slate-900(\/[0-9]+)?/g, replace: (m, alpha) => `bg-white${alpha||''} dark:${m}` },
  { regex: /\bbg-slate-800(\/[0-9]+)?/g, replace: (m, alpha) => `bg-slate-100${alpha||''} dark:${m}` },
  { regex: /\bbg-slate-700(\/[0-9]+)?/g, replace: (m, alpha) => `bg-slate-200${alpha||''} dark:${m}` },
  { regex: /\btext-slate-100\b/g, replace: 'text-slate-900 dark:text-slate-100' },
  { regex: /\btext-slate-200\b/g, replace: 'text-slate-800 dark:text-slate-200' },
  { regex: /\btext-slate-300\b/g, replace: 'text-slate-700 dark:text-slate-300' },
  { regex: /\btext-slate-400\b/g, replace: 'text-slate-600 dark:text-slate-400' },
  { regex: /\btext-white\b/g, replace: 'text-slate-900 dark:text-white' },
  { regex: /\bborder-slate-800(\/[0-9]+)?/g, replace: (m, alpha) => `border-slate-200${alpha||''} dark:${m}` },
  { regex: /\bborder-slate-700(\/[0-9]+)?/g, replace: (m, alpha) => `border-slate-300${alpha||''} dark:${m}` },
  { regex: /\bborder-slate-600(\/[0-9]+)?/g, replace: (m, alpha) => `border-slate-400${alpha||''} dark:${m}` },
];

let newContent = content;
for (const { regex, replace } of replacements) {
  newContent = newContent.replace(regex, replace);
}

// Ensure html gets dark class by default if not there
if (newContent !== content) {
  fs.writeFileSync(file, newContent, 'utf8');
  console.log('Replaced classes successfully.');
} else {
  console.log('No changes made.');
}
