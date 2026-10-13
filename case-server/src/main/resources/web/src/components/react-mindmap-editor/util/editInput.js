export const getEditInputBox = (selectedNode, offsetTop) => {
  const textBox = selectedNode.getRenderBox('TextRenderer') || selectedNode.getRenderBox();
  return {
    left: textBox.x,
    top: textBox.y + offsetTop,
    width: textBox.width,
    height: textBox.height,
  };
};

export default function editInput(selectedNode, inputNode, positionOnly) {
  const $previewer = inputNode;
  const $container = document.getElementsByClassName('kityminder-core-container');
  const box = getEditInputBox(selectedNode, $container[0].offsetTop);

  if (positionOnly === undefined) {
    $previewer.style.left = Math.round(box.left) + 'px';
    $previewer.style.top = Math.round(box.top) + 'px';
    $previewer.style.width = Math.max(1, Math.ceil(box.width)) + 'px';
    $previewer.style.height = Math.max(1, Math.ceil(box.height)) + 'px';
  } else {
    return { x: box.left + box.width / 2, y: box.top };
  }
}
