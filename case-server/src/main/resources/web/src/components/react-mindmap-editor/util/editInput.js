export const getEditInputBox = (selectedNode, offsetTop) => {
  const textBox = selectedNode.getRenderBox('TextRenderer') || selectedNode.getRenderBox();
  return {
    left: textBox.x,
    top: textBox.y + offsetTop,
    width: textBox.width,
    height: textBox.height,
  };
};

export const getScreenEditMetrics = (shape, offsetParent, fontSize) => {
  const rect = shape.getBoundingClientRect();
  const parentRect = offsetParent.getBoundingClientRect();
  const svgBox = shape.getBBox();
  const scale = svgBox.width > 0 ? rect.width / svgBox.width :
    (svgBox.height > 0 ? rect.height / svgBox.height : 1);
  return {
    left: rect.left - parentRect.left + (offsetParent.scrollLeft || 0),
    top: rect.top - parentRect.top + (offsetParent.scrollTop || 0),
    width: rect.width,
    height: rect.height,
    fontSize: Number((fontSize * scale).toFixed(3)),
  };
};

export default function editInput(selectedNode, inputNode, positionOnly) {
  const $previewer = inputNode;
  const $container = document.getElementsByClassName('kityminder-core-container');
  const renderer = selectedNode.getRenderer && selectedNode.getRenderer('TextRenderer');
  const renderShape = renderer && renderer.getRenderShape();
  const shape = renderShape && renderShape.node;
  const parent = inputNode.offsetParent || inputNode.parentElement;
  const fontSize = parseFloat(selectedNode.getData('font-size') || selectedNode.getStyle('font-size'));
  const box = shape && parent && shape.getBBox && Number.isFinite(fontSize) ?
    getScreenEditMetrics(shape, parent, fontSize) :
    getEditInputBox(selectedNode, $container[0].offsetTop);

  if (positionOnly === undefined) {
    $previewer.style.left = Math.round(box.left) + 'px';
    $previewer.style.top = Math.round(box.top) + 'px';
    $previewer.style.width = Math.max(1, Math.ceil(box.width)) + 'px';
    $previewer.style.height = Math.max(1, Math.ceil(box.height)) + 'px';
    const textarea = $previewer.querySelector('textarea');
    if (textarea && box.fontSize) {
      const lineCount = Math.max(1, textarea.value.split('\n').length);
      textarea.style.fontSize = `${box.fontSize}px`;
      textarea.style.lineHeight = `${box.height / lineCount}px`;
    }
  } else {
    return { x: box.left + box.width / 2, y: box.top };
  }
}
