/** @jest-environment node */
/* eslint-env jest */
import { getEditInputBox } from '../src/components/react-mindmap-editor/util/editInput'

test('双击编辑框仅覆盖文字绘制区域，不挤压节点下边框', () => {
  const node = { getRenderBox: () => ({ x: 12, y: 20, width: 90, height: 22 }) }
  expect(getEditInputBox(node, 7)).toEqual({ left: 12, top: 27, width: 90, height: 22 })
})
