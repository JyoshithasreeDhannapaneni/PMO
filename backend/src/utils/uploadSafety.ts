import path from 'path';

// Files the browser would execute when opened from /uploads on the app's own origin —
// a script there can read the login token from localStorage.
const ACTIVE_CONTENT_EXTENSIONS = new Set(['.html', '.htm', '.xhtml', '.shtml', '.svg', '.svgz', '.xml', '.xsl', '.js', '.mjs']);

export function isActiveContentFile(fileName: string): boolean {
  return ACTIVE_CONTENT_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}
