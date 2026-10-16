export function buildSaveContent(minder, source) {
  return JSON.stringify({ ...minder.exportJson(), right: (source && source.right) || 1 });
}
