/** Public file-play route isolates files before native storage or shelf services start. */
export const fileMode =
  typeof location !== 'undefined' && /^\/file\/?$/.test(location.pathname) ? 'file' : 'native';
