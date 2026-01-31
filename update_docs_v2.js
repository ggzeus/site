const fs = require('fs');

const scriptPath = 'script.js';
let content = fs.readFileSync(scriptPath, 'utf8');

const replaceSwitch = `function switchApiItemLang(id, lang, method, path, bodyStr, paramsStr) {
    const [catIdx, epIdx] = id.split('-').map(Number);
    const ep = apiDocsData[catIdx].endpoints[epIdx];
    
    const snippet = getApiSnippet(lang, ep);
    const codeEl = document.getElementById(\`code-\${id}\`);
    
    // Update text and class
    codeEl.textContent = snippet;
    const prismLang = lang === 'csharp' ? 'csharp' : (lang === 'cpp' ? 'cpp' : (lang === 'python' ? 'python' : 'javascript'));
    codeEl.className = \`language-\${prismLang}\`; 
    
    Prism.highlightElement(codeEl);
    
    // Update active tab
    document.querySelectorAll(\`.lang-btn-\${id}\`).forEach(btn => btn.classList.remove('active'));
    document.getElementById(\`btn-\${id}-\${lang}\`).classList.add('active');
}`;

// Pattern: Match function signature until "function renderDevDocs" starts.
// Note: We need to be careful. The previous function ends with }.
// The replacement above ends with }.
// The file has:
// function switchApiItemLang(...) { ... }
// 
// function renderDevDocs(...)

const regex = /function switchApiItemLang\([\s\S]*?function renderDevDocs/;

if (regex.test(content)) {
    // We want to keep "function renderDevDocs" at the end of the match.
    // So we replace the match with replacement + "\n\nfunction renderDevDocs"
    content = content.replace(regex, replaceSwitch + "\n\nfunction renderDevDocs");
    console.log('Successfully updated switchApiItemLang via Regex');
    fs.writeFileSync(scriptPath, content, 'utf8');
} else {
    console.error('Regex failed to match switchApiItemLang block');
}
