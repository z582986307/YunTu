/** @jest-environment node */
/* eslint-env jest */
import { getEditInputBox, getScreenEditMetrics, waitForNewNodeLayout } from '../src/components/react-mindmap-editor/util/editInput'

test('双击编辑框仅覆盖文字绘制区域，不挤压节点下边框', () => {
  const node = { getRenderBox: () => ({ x: 12, y: 20, width: 90, height: 22 }) }
  expect(getEditInputBox(node, 7)).toEqual({ left: 12, top: 27, width: 90, height: 22 })
})

test('编辑文字使用 SVG 在屏幕上的实际缩放字号和坐标', () => {
  const text = {
    getBBox: () => ({ width: 100, height: 20 }),
    getBoundingClientRect: () => ({ left: 140, top: 80, width: 120, height: 24 }),
  }
  const parent = { getBoundingClientRect: () => ({ left: 20, top: 10 }) }
  expect(getScreenEditMetrics(text, parent, 16)).toEqual({
    left: 120, top: 70, width: 120, height: 24, fontSize: 19.2,
  })
})

test('新节点布局完成前隐藏，完成后再进入编辑且恢复可见', () => {
  const callbacks = {}
  const minder = {
    _pendingLayout: new Promise(() => {}),
    on: (name, callback) => { callbacks[name] = callback },
    off: (name) => { delete callbacks[name] },
  }
  const element = { style: { visibility: '' } }
  const node = { getRenderContainer: () => ({ node: element }) }
  const onReady = jest.fn()
  waitForNewNodeLayout(minder, node, onReady)
  expect(element.style.visibility).toBe('hidden')
  expect(onReady).not.toHaveBeenCalled()
  callbacks.layoutallfinish()
  expect(element.style.visibility).toBe('')
  expect(onReady).toHaveBeenCalledTimes(1)
  expect(callbacks.layoutallfinish).toBeUndefined()
})

test('同步布局已完成时直接进入编辑，不隐藏新节点', () => {
  const element = { style: { visibility: '' } }
  const onReady = jest.fn()
  waitForNewNodeLayout({}, { getRenderContainer: () => ({ node: element }) }, onReady)
  expect(onReady).toHaveBeenCalledTimes(1)
  expect(element.style.visibility).toBe('')
})
