// ============================================================================
// Resolve a public-folder asset path to an absolute URL that respects the
// configured Vite base path. On Cloudflare Pages at aftertale.gg the base is
// `/`, so this is mostly a passthrough — kept for resilience if we ever
// rehome to a subpath again.
//
// Usage:
//   const src = assetUrl('npcs/magni.png')  ->  '/npcs/magni.png'
//
// Accepts paths with or without a leading slash so existing strings like
// '/npcs/magni-bronzebeard.png' continue to work.
// ============================================================================

export function assetUrl(path: string): string {
  if (!path) return path;
  // Anything that's already absolute (http(s):, data:, blob:) passes through.
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const base = import.meta.env.BASE_URL || '/';
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${cleaned}`;
}
