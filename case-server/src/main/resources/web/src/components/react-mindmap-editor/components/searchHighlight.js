const svgNamespace = 'http://www.w3.org/2000/svg'

export const splitMatches = (value, keyword) => {
  const text = String(value || '')
  const needle = String(keyword || '').trim()
  if (!needle) return [{ text, matched: false }]
  const lower = text.toLowerCase()
  const search = needle.toLowerCase()
  const parts = []
  let start = 0
  let match = lower.indexOf(search, start)
  while (match !== -1) {
    if (match > start) parts.push({ text: text.slice(start, match), matched: false })
    parts.push({ text: text.slice(match, match + needle.length), matched: true })
    start = match + needle.length
    match = lower.indexOf(search, start)
  }
  if (start < text.length) parts.push({ text: text.slice(start), matched: false })
  return parts
}

export const highlightNodeText = (node, keyword) => {
  const renderer = node.getRenderer && node.getRenderer('TextRenderer')
  const shape = renderer && renderer.getRenderShape()
  const group = shape && shape.node
  if (!group) return () => {}
  const restored = []
  Array.from(group.querySelectorAll('text')).forEach(element => {
    if (element.childElementCount) return
    const original = element.textContent
    const segments = splitMatches(original, keyword)
    if (!segments.some(segment => segment.matched)) return
    while (element.firstChild) element.removeChild(element.firstChild)
    segments.forEach(segment => {
      if (!segment.matched) {
        element.appendChild(document.createTextNode(segment.text))
        return
      }
      const mark = document.createElementNS(svgNamespace, 'tspan')
      mark.setAttribute('class', 'yuntu-search-match')
      mark.textContent = segment.text
      element.appendChild(mark)
    })
    restored.push({ element, original })
  })
  return () => restored.forEach(({ element, original }) => {
    if (element.textContent === original) element.textContent = original
  })
}
