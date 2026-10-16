const comparisonColors = {
  added: '#ddfade',
  deleted: '#ffe7e7',
  changed: '#d6f0ff',
};

export function projectComparison(content, filter) {
  if (!content || !content.root || filter === 'all' || !comparisonColors[filter]) {
    return { content, count: 0 };
  }
  const selectedColor = comparisonColors[filter];
  const projected = new Map();
  const pending = [{ node: content.root, visited: false }];
  let count = 0;

  while (pending.length) {
    const frame = pending.pop();
    const { node } = frame;
    if (!frame.visited) {
      pending.push({ node, visited: true });
      const children = node.children || [];
      for (let index = children.length - 1; index >= 0; index--) {
        pending.push({ node: children[index], visited: false });
      }
      continue;
    }
    const matches = node.data && node.data.background === selectedColor;
    if (matches) count++;
    const children = (node.children || []).map(child => projected.get(child)).filter(Boolean);
    if (matches || children.length || node === content.root) {
      projected.set(node, { ...node, children });
    }
  }

  return { content: { ...content, root: projected.get(content.root) }, count };
}
