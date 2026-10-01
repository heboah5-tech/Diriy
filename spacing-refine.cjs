const fs = require('fs');
const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  // Increase gap between columns from 3.5 to 6
  { regex: /gap-3\.5/g, replace: 'gap-6' },
  
  // Increase outer padding on the dashboard content wrapper
  { regex: /p-4 pt-2\.5/g, replace: 'p-6 pt-4' },
  
  // Better rounded corners on inner cards
  { regex: /rounded-2xl/g, replace: 'rounded-xl' },
  { regex: /rounded-3xl/g, replace: 'rounded-2xl' },
  
  // Make list items slightly more spacious
  { regex: /p-3/g, replace: 'p-4' },
  
  // Ensure background is solid neutral
  { regex: /bg-\[\#0A0A0A\]/g, replace: 'bg-slate-950' },
  
  // Update border styling inside table rows or items
  { regex: /divide-slate-800\/50/g, replace: 'divide-slate-200/50 dark:divide-slate-800/50' }
];

for (const {regex, replace} of replacements) {
    content = content.replace(regex, replace);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Refined spacing successfully');
