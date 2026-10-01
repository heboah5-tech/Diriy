const fs = require('fs');

const file = 'client/src/pages/dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add import if missing
if (!content.includes('SkyLogo')) {
    content = content.replace(
        /import\s*\{\s*Sparkles\s*\}\s*from\s*["']lucide-react["'];/,
        `import { Sparkles } from "lucide-react";\nimport { SkyLogo } from "@/components/SkyLogo";`
    );
    // If Sparkles is imported in a block with others, let's just insert at the top
    if (!content.includes('import { SkyLogo }')) {
         content = `import { SkyLogo } from "@/components/SkyLogo";\n` + content;
    }
}

// Replace the img tag
content = content.replace(
    /<img src="\/SKY-removebg-preview\.png" alt="Logo" className="w-full h-full object-contain p-1" \/>/,
    `<SkyLogo className="w-full h-full object-contain p-0.5 text-slate-900 dark:text-white" />`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed dashboard logo');
