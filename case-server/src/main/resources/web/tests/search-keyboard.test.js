/* eslint-env jest */
import React from 'react'
import ReactDOM from 'react-dom'
import { act, Simulate } from 'react-dom/test-utils'
import Editor from '../src/components/react-mindmap-editor'
import MindMapSearch from '../src/components/react-mindmap-editor/components/mindMapSearch'

jest.mock('kity', () => ({}))
jest.mock('antd/es/locale/zh_CN', () => ({}))
jest.mock('hotbox-ui/hotbox', () => ({}))
jest.mock(
  '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js',
  () => ({}),
)
jest.mock('../src/components/react-mindmap-editor/util/clipboard', () => ({
  init: () => {},
  removeListener: () => {},
}))

test('搜索Enter选中结果导致输入框失焦后，不继续冒泡到真实编辑器新增兄弟节点', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const leaf = {
    getData: () => ({ text: '唯一搜索结果' }),
    isExpanded: () => true,
    getRenderer: () => null,
  }
  const nodes = [leaf]
  let selected = leaf
  let keyups = 0
  let keypresses = 0
  const minder = {
    getRoot: () => ({ traverse: visit => nodes.forEach(visit) }),
    getSelectedNodes: () => [selected],
    getSelectedNode: () => selected,
    select: items => {
      selected = items[0]
      // 复现真实select把焦点交还画布；不能靠全局window.search保住当前Enter。
      host.querySelector('input').blur()
    },
    fire: () => {},
    on: () => {},
    off: () => {},
    execCommand: name => {
      if (name === 'AppendSiblingNode') nodes.push({})
    },
  }
  const editor = new Editor({ readOnly: false })
  editor.minder = minder
  editor.state = {
    ...editor.state,
    selectedNode: leaf,
    loading: false,
    isLock: false,
    wsConnected: true,
  }
  editor.scheduleNewNodeInput = () => {}
  const keyup = () => {
    keyups += 1
  }
  const keypress = () => {
    keypresses += 1
  }
  const requestFrame = window.requestAnimationFrame
  const cancelFrame = window.cancelAnimationFrame
  window.requestAnimationFrame = () => 1
  window.cancelAnimationFrame = () => {}
  try {
    act(() => {
      ReactDOM.render(<MindMapSearch minder={minder} />, host)
    })
    const input = host.querySelector('input')
    act(() => {
      input.focus()
      Simulate.change(input, { target: { value: '唯一搜索结果' } })
    })
    // AntD桌面分支尝试自动抢回焦点；模拟焦点已交给画布、该次focus未生效的浏览器边界。
    // 保留真实blur/focus事件和document冒泡，只隔离这次自动回焦，确保覆盖全局search已清空路径。
    input.focus = () => {}
    // React16先注册document委托监听，再安装真实编辑器原生监听，复现同document竞态。
    document.addEventListener('keydown', editor.handleKeyDown)
    document.addEventListener('keyup', keyup)
    document.addEventListener('keypress', keypress)
    const enter = type =>
      new KeyboardEvent(type, {
        key: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      })
    const down = enter('keydown')
    act(() => {
      input.dispatchEvent(down)
    })
    expect(document.activeElement).not.toBe(input)
    expect(host.querySelector('.mindmap-search-count').textContent).toBe('1/1')
    expect(nodes).toHaveLength(1)
    // 浏览器默认输入发生前可能已切焦到隐藏节点textarea；必须阻止原Enter默认行为。
    expect(down.defaultPrevented).toBe(true)
    act(() => {
      input.dispatchEvent(enter('keypress'))
    })
    expect(keypresses).toBe(0)
    act(() => {
      input.dispatchEvent(enter('keyup'))
    })
    expect(keyups).toBe(0)
    expect(selected).toBe(leaf)
    const letter = new KeyboardEvent('keydown', {
      key: 'a',
      keyCode: 65,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      input.dispatchEvent(letter)
    })
    expect(letter.defaultPrevented).toBe(false)
  } finally {
    document.removeEventListener('keydown', editor.handleKeyDown)
    document.removeEventListener('keyup', keyup)
    document.removeEventListener('keypress', keypress)
    act(() => {
      ReactDOM.unmountComponentAtNode(host)
    })
    host.remove()
    window.requestAnimationFrame = requestFrame
    window.cancelAnimationFrame = cancelFrame
    window.search = false
  }
})
