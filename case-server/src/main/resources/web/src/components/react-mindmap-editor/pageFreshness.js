export function bundlePathFromHtml(html) {
  const match = String(html || '').match(/<script\b[^>]*\bsrc=["']([^"']*\/umi\.[^"']+\.js)["']/i)
  return match ? match[1] : null
}

export function isConfirmedDataStale(appliedBase, serverBase) {
  return Number.isFinite(Number(appliedBase)) && Number.isFinite(Number(serverBase)) &&
    appliedBase !== undefined && appliedBase !== null && Number(serverBase) > Number(appliedBase)
}
