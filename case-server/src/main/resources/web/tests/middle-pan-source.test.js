/** @jest-environment node */
/* eslint-env jest */
import fs from 'fs'
import path from 'path'

test('按下鼠标中键进入临时画布拖动分支', () => {
  const source = fs.readFileSync(path.join(__dirname,
    '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js'), 'utf8')
  const start = source.indexOf('// 点击未选中的根节点临时开启')
  expect(start).toBeGreaterThan(0)
  expect(source.slice(start, start + 220)).toContain('e.originEvent.button == 1 ||')
})
