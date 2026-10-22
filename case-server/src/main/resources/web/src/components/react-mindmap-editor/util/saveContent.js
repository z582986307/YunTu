export function buildSaveContent(minder, source, rawServerContent, hasLocalEdits = true) {
  const exported = minder.exportJson();
  if (!hasLocalEdits && rawServerContent &&
      Number(exported.base) === Number(rawServerContent.base)) {
    return rawServerContent.serialized || JSON.stringify(rawServerContent);
  }
  return JSON.stringify({ ...exported, right: (source && source.right) || 1 });
}

export function shouldRecoverCachedContent(server, cached) {
  return Boolean(cached && cached.root && Number(cached.base) > Number(server.base));
}
