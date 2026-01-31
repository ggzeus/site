const fs = require('fs');

const scriptPath = 'script.js';
let content = fs.readFileSync(scriptPath, 'utf8');

// 1. Update switchApiItemLang
const targetSwitch = `function switchApiItemLang(id, lang, method, path, bodyStr, paramsStr) {
    // Reconstruct EP object from attributes (simplified)
    // Actually better to regenerate using global data? No, hard to index.
    // Let's passed encoded strings or just look up if possible.
    // Simplifying: The snippet generation logic needs the EP data. 
    // We will store the EP data index in the element to lookup globally? No, apiDocsData is global.
    const [catIdx, epIdx] = id.split('-').map(Number);
    const ep = apiDocsData[catIdx].endpoints[epIdx];
    
    const snippet = getApiSnippet(lang, ep);
    document.getElementById(\`code-\${id}\`).innerText = snippet;
    
    // Update active tab
    document.querySelectorAll(\`.lang-btn-\${id}\`).forEach(btn => btn.classList.remove('active'));
    document.getElementById(\`btn-\${id}-\${lang}\`).classList.add('active');
}`;

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

if (content.includes(targetSwitch)) {
    content = content.replace(targetSwitch, replaceSwitch);
    console.log('Successfully updated switchApiItemLang');
} else {
    // Try to find normalized (remove CR)
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const normalizedTarget = targetSwitch.replace(/\r\n/g, '\n');
    if (normalizedContent.includes(normalizedTarget)) {
        content = normalizedContent.replace(normalizedTarget, replaceSwitch);
        console.log('Successfully updated switchApiItemLang (normalized)');
    } else {
        console.error('Failed to find switchApiItemLang. Dumping substring for debug:');
        const idx = content.indexOf('function switchApiItemLang');
        if (idx !== -1) {
            console.log(content.substring(idx, idx + 200));
        } else {
            console.log('Function not found at all.');
        }
    }
}

// 2. Update renderDevDocs
// Targetting the inner HTML structure for code blocks
// The "default" snippet section.
/*
                                    <div style="position:relative; background:#0d0d0d; border-radius:6px; border:1px solid #333;">
                                         <button onclick="navigator.clipboard.writeText(document.getElementById('code-${id}').innerText).then(()=>alert('Copiado!'))" 
                                                 style="position:absolute; top:10px; right:10px; background:transparent; border:none; color:#aaa; cursor:pointer;">
                                            <i class="fa-regular fa-copy"></i>
                                         </button>
                                         <pre id="code-${id}" style="padding:15px; font-family:'JetBrains Mono', monospace; font-size:0.85rem; color:#dcdcdc; overflow-x:auto; margin:0; line-height:1.5;">${defaultSnippet}</pre>
                                    </div>
*/

// I will just replace the renderDevDocs function entirely if I can match it, otherwise I'll use regex to update the pre tag.
// Regex approach is safer for the renderDevDocs part since the function is huge.
// Targeting the <pre> tag.

const preRegex = /<pre id="code-\${id}" style="[^"]+">\${defaultSnippet}<\/pre>/;
// Construct the new pre tag
const newPre = `<pre style="margin:0; padding:15px; border-radius:6px; overflow:auto;"><code id="code-\${id}" class="language-javascript" style="font-family:'JetBrains Mono', monospace; font-size:0.85rem;">\${defaultSnippet}</code></pre>`;

// The file uses template literals, so ${id} is literal in the file content strings.
// Using string replace on the partial content.

const targetPreLine = `<pre id="code-\${id}" style="padding:15px; font-family:'JetBrains Mono', monospace; font-size:0.85rem; color:#dcdcdc; overflow-x:auto; margin:0; line-height:1.5;">\${defaultSnippet}</pre>`;

// Also the button above it uses .innerText, change to .textContent
const targetBtnLine = `onclick="navigator.clipboard.writeText(document.getElementById('code-\${id}').innerText).then(()=>alert('Copiado!'))"`;
const newBtnLine = `onclick="navigator.clipboard.writeText(document.getElementById('code-\${id}').textContent).then(()=>alert('Copiado!'))"`;


if (content.includes(targetPreLine)) {
    content = content.replace(targetPreLine, newPre);
    console.log('Successfully updated renderDevDocs (pre tag)');
} else {
    console.error('Failed to find pre tag target');
}

if (content.includes(targetBtnLine)) {
    content = content.replace(targetBtnLine, newBtnLine);
    console.log('Successfully updated renderDevDocs (copy button)');
} else {
    console.error('Failed to find copy button target');
}


fs.writeFileSync(scriptPath, content, 'utf8');
