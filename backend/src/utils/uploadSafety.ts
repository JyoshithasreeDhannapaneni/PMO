import path from 'path';

// Files the browser would execute when opened from /uploads on the app's own origin —
// a script there can read the login token from localStorage. Rejected at upload time.
const ACTIVE_CONTENT_EXTENSIONS = new Set([
  '.html', '.htm', '.xhtml', '.xht', '.shtml', '.svg', '.svgz', '.xml', '.xsl', '.xslt', '.xsd',
  '.rdf', '.rss', '.atom', '.wsdl', '.mml', '.xul', '.js', '.mjs',
]);

// Allowlist for serving: only these render inline from /uploads; every other file is sent
// as a sandboxed download. Covers types the denylist above misses (mime maps many more
// extensions to script-capable XML/HTML document types).
const SAFE_INLINE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.txt', '.csv',
]);

function extensionOf(fileName: string): string {
  // Trailing dots/spaces are stripped by Windows and ignored by some servers.
  return path.extname(fileName.trim().replace(/\.+$/, '')).toLowerCase();
}

export function isActiveContentFile(fileName: string): boolean {
  return ACTIVE_CONTENT_EXTENSIONS.has(extensionOf(fileName));
}

export function isSafeInlineFile(fileName: string): boolean {
  return SAFE_INLINE_EXTENSIONS.has(extensionOf(fileName));
}
