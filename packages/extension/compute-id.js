const crypto = require('crypto');
const path = require('path');

const extensionPath = path.resolve(__dirname, 'dist');
// Chrome uses UTF-16LE for paths on Windows
const buffer = Buffer.from(extensionPath, 'utf16le');
const hash = crypto.createHash('sha256').update(buffer).digest('hex');
const first32 = hash.substring(0, 32);

// Map hex '0'-'9' to 'a'-'j' and 'a'-'f' to 'k'-'p'
const extensionId = first32.split('').map(c => {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) { // 0-9
    return String.fromCharCode(code + 49); // a-j
  } else { // a-f
    return String.fromCharCode(code + 10); // k-p
  }
}).join('');

console.log(`Computed Extension ID for path ${extensionPath}: ${extensionId}`);
