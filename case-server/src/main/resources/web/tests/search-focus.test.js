/* eslint-env jest */
import React from 'react'
import ReactDOM from 'react-dom'
import { act, Simulate } from 'react-dom/test-utils'
import MindMapSearch from '../src/components/react-mindmap-editor/components/mindMapSearch'

const setup = () => {
  const frames = []
  window.requestAnimationFrame = callback => {
    frames.push(callback)
    return frames.length
  }
  window.cancelAnimationFrame = () => {}
  const host = document.createElement('div')
  document.body.appendChild(host)
  const commands = []
  const events = {}
  const nodes = ['根', '命中一', '命中二'].map(text => ({
    getData: () => ({ text }),
    isExpanded: () => true,
    getRenderer: () => null,
    getRenderContainer: () => ({ getRenderBox: () => ({ x: 0, y: 0, width: 100, height: 20 }) }),
  }))
  const minder = {
    getRoot: () => ({ traverse: visit => nodes.forEach(visit) }),
    getSelectedNode: () => minder.selected,
    on: (name, callback) => {
      if (!events[name]) events[name] = new Set()
      events[name].add(callback)
    },
    off: (name, callback) => {
      if (events[name]) events[name].delete(callback)
    },
    select: selected => {
      minder.selected = selected[0]
    },
    fire: () => {},
    execCommand: (...args) => commands.push(args),
    getOption: () => 100,
    setOption: () => {},
    getViewDragger: () => ({ timeline: () => null, move: () => {} }),
    getRenderTarget: () => ({
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    }),
    getPaper: () => ({
      shapeNode: { getScreenCTM: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1 }) }) },
    }),
  }
  act(() => {
    ReactDOM.render(<MindMapSearch minder={minder} />, host)
  })
  const search = value => {
    const input = host.querySelector('input')
    act(() => {
      Simulate.change(input, { target: { value } })
    })
    act(() => {
      Simulate.keyDown(input, { keyCode: 13, key: 'Enter' })
    })
  }
  return {
    host,
    minder,
    commands,
    nodes,
    search,
    emit: name => {
      act(() => {
        Array.from(events[name] || []).forEach(callback => callback())
      })
    },
    listeners: name => (events[name] || new Set()).size,
    frame: () => {
      act(() => {
        const batch = frames.splice(0)
        batch.forEach(callback => callback())
      })
    },
    close: () => {
      act(() => {
        ReactDOM.unmountComponentAtNode(host)
      })
      host.remove()
    },
  }
}

test('旧普通布局完成标记永远false也须首帧定位，真实末帧事件再校准且卸载取消监听', () => {
  const f = setup()
  f.minder._viewLayoutCompletion = { finished: false }
  try {
    f.search('命中一')
    f.frame()
    expect(f.commands).toEqual([['camera', f.nodes[1]]])
    f.emit('layoutallfinish')
    f.frame()
    expect(f.commands).toEqual([
      ['camera', f.nodes[1]],
      ['camera', f.nodes[1]],
    ])
    expect(f.listeners('layoutallfinish')).toBe(0)
    f.search('命中二')
    expect(f.listeners('layoutallfinish')).toBe(1)
  } finally {
    f.close()
  }
  expect(f.listeners('layoutallfinish')).toBe(0)
  f.emit('layoutallfinish')
  f.frame()
  expect(f.commands).toHaveLength(2)
})

test.each([
  [1, 88, 632],
  [1, 216, 504],
  [1.2, 88, 632],
])('旧viewport中心在缩放%s、canvas顶部%s高度%s时仍按真实DOM中心定位', (zoom, top, height) => {
  const f = setup()
  let center = { x: 800, y: 500 }
  let duration = 100
  const stopped = []
  f.minder.getOption = () => duration
  f.minder.setOption = (key, value) => {
    duration = value
  }
  f.minder.getRenderTarget = () => ({
    getBoundingClientRect: () => ({ left: 30, top, width: 1200, height }),
  })
  f.minder.getPaper = () => ({
    shapeNode: {
      getScreenCTM: () => ({
        inverse: () => ({ a: 1 / zoom, b: 0, c: 0, d: 1 / zoom, e: -30 / zoom, f: -top / zoom }),
      }),
    },
  })
  f.nodes[1].getRenderContainer = () => ({
    getRenderBox: () => ({
      x: center.x - 50,
      y: center.y - 10,
      width: 100,
      height: 20,
    }),
  })
  f.minder.getViewDragger = () => ({
    timeline: () => ({ stop: () => stopped.push(true) }),
    move: delta => {
      center = { x: center.x + delta.x * zoom, y: center.y + delta.y * zoom }
    },
  })
  f.minder.execCommand = () => {
    center = { x: 30 + 640 * zoom, y: top + 342 * zoom }
  }
  try {
    f.search('命中一')
    f.frame()
    expect(center.x).toBeCloseTo(630, 5)
    expect(center.y).toBeCloseTo(top + height / 2, 5)
    expect(stopped).toEqual([true])
    expect(duration).toBe(100)
  } finally {
    f.close()
  }
})

test('搜索camera异常也恢复动画配置，不污染普通相机', () => {
  const f = setup()
  let duration = 100
  let usedDuration = null
  f.minder.getOption = () => duration
  f.minder.setOption = (key, value) => {
    duration = value
  }
  f.minder.execCommand = () => {
    usedDuration = duration
    throw new Error('camera失败')
  }
  try {
    f.search('命中')
    expect(() => f.frame()).toThrow('camera失败')
    expect(usedDuration).toBe(0)
    expect(duration).toBe(100)
  } finally {
    f.close()
  }
})

test('搜索首项及下一项显式居中，而非仅选择节点', () => {
  const f = setup()
  try {
    f.search('命中')
    f.frame()
    f.frame()
    expect(f.commands).toContainEqual(['camera', f.nodes[1]])
    act(() => {
      Simulate.click(f.host.querySelector('[aria-label="下一个搜索结果"]'))
    })
    f.frame()
    f.frame()
    expect(f.commands[f.commands.length - 1]).toEqual(['camera', f.nodes[2]])
  } finally {
    f.close()
  }
})

test('隐藏命中展开祖先后等待新布局，不提前读取旧坐标', () => {
  const f = setup()
  try {
    f.nodes[1].isExpanded = () => false
    f.minder.execCommand = (...args) => {
      f.commands.push(args)
      if (args[0] === 'expand') f.minder._pendingLayout = Promise.resolve()
    }
    f.search('命中')
    f.frame()
    f.frame()
    expect(f.commands).toEqual([['expand', true]])
    f.minder._pendingLayout = null
    f.frame()
    expect(f.commands).toEqual([
      ['expand', true],
      ['camera', f.nodes[1]],
    ])
  } finally {
    f.close()
  }
})

test('快速改搜和卸载取消旧定位，不发生延迟跳回', () => {
  const f = setup()
  f.minder._viewLayoutCompletion = { finished: false }
  f.search('命中一')
  f.search('命中二')
  f.minder._viewLayoutCompletion.finished = true
  f.frame()
  expect(f.commands).toEqual([['camera', f.nodes[2]]])
  f.minder._viewLayoutCompletion.finished = false
  f.search('命中一')
  f.close()
  f.minder._viewLayoutCompletion.finished = true
  f.frame()
  expect(f.commands).toEqual([['camera', f.nodes[2]]])
})

test('普通布局先定位当前节点，真实末帧事件完成后再最终校准一次', () => {
  const f = setup()
  try {
    f.minder._viewLayoutCompletion = { finished: false }
    f.search('命中')
    f.frame()
    f.frame()
    expect(f.commands).toEqual([['camera', f.nodes[1]]])
    f.minder._viewLayoutCompletion.finished = true
    f.emit('layoutallfinish')
    f.frame()
    f.frame()
    expect(f.commands).toEqual([
      ['camera', f.nodes[1]],
      ['camera', f.nodes[1]],
    ])
  } finally {
    f.close()
  }
})

test('导入期间等待树完整后搜索，清空搜索取消未完成定位', () => {
  const f = setup()
  try {
    f.minder._progressiveImporting = true
    f.search('命中')
    f.frame()
    expect(f.commands).toEqual([])
    f.minder._progressiveImporting = false
    f.frame()
    f.frame()
    f.frame()
    expect(f.commands).toEqual([['camera', f.nodes[1]]])
    f.minder._viewLayoutCompletion = { finished: false }
    f.search('命中')
    f.search('')
    f.minder._viewLayoutCompletion.finished = true
    f.frame()
    f.frame()
    expect(f.commands).toEqual([['camera', f.nodes[1]]])
  } finally {
    f.close()
  }
})
