/* eslint-env jest */
import MindMapScrollbars, {
  getScrollAxis,
} from '../src/components/react-mindmap-editor/components/mindMapScrollbars'
import { createPaintGroups } from '../src/components/react-mindmap-editor/paintGroups'
import 'kity'

const RealMatrix = window.kity.Matrix

test('外观高度变化后的首次按下也使用实时视口计算握点', () => {
  const component = new MindMapScrollbars({ minder: {} })
  component.state = { bounds: { left: 0, right: 5000 }, view: { left: 0, width: 1000 } }
  component.readView = () => ({ left: 0, width: 500 })
  component.onPointerMove = jest.fn()
  try {
    component.onPointerDown('x', {
      preventDefault: () => {}, stopPropagation: () => {}, clientX: 150,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 10 }) },
    })
    expect(component.drag.grip).toBe(50)
  } finally {
    window.removeEventListener('pointermove', component.onPointerMove)
    window.removeEventListener('pointerup', component.onPointerUp)
  }
})

test.each([-5000, 12000])('视野已平移至空白%s时，滑块两端仍只对应可见内容四端', viewStart => {
  const x = getScrollAxis(-100, 4900, viewStart, 1000, 600)
  expect(x.position(0)).toBe(-100)
  expect(x.position(1)).toBe(3900)
  expect(x.offset).toBeGreaterThanOrEqual(0)
  expect(x.offset).toBeLessThanOrEqual(x.travel)
  const y = getScrollAxis(200, 6200, viewStart, 800, 500)
  expect(y.position(0)).toBe(200)
  expect(y.position(1)).toBe(5400)
})

test('内容比视口小时不因原视野空白扩张滚动范围，键盘End不跳到反向空白', () => {
  const axis = getScrollAxis(100, 400, -5000, 1000, 500)
  expect(axis.travel).toBe(0)
  const component = new MindMapScrollbars({
    minder: {
      getViewDragger: () => ({
        getView: () => ({ left: -5000, top: -5000, width: 1000, height: 1000 }),
      }),
    },
  })
  component.state.bounds = { left: 100, right: 400, top: 200, bottom: 500 }
  component.readView = () => ({ left: -5000, top: -5000, width: 1000, height: 1000 })
  const positions = []
  component.scrollTo = (...args) => positions.push(args)
  component.onKeyDown('x', { key: 'End', preventDefault: () => {} })
  component.onKeyDown('y', { key: 'End', preventDefault: () => {} })
  expect(positions).toEqual([
    ['x', 100],
    ['y', 200],
  ])
})

test.each([1, 1.2])(
  '外观改变后的实际视口尺寸不沿用_lastClientSize，缩放%s的End到当前底端',
  zoom => {
    const movement = { x: 20, y: 100 }
    const target = { clientWidth: 1200, clientHeight: 645 }
    const minder = {
      _lastClientSize: { width: 1200, height: 685 },
      getRenderTarget: () => target,
      getPaper: () => ({ getViewPortMatrix: () => new RealMatrix(zoom, 0, 0, zoom, 5, 9) }),
      getViewDragger: () => ({
        getMovement: () => movement,
        getView: () => ({
          left: -5 / zoom - 20,
          top: -9 / zoom - 100,
          width: 1200 / zoom,
          height: 685 / zoom,
        }),
      }),
    }
    const component = new MindMapScrollbars({ minder })
    component.setState = state => {
      component.state = { ...component.state, ...state }
    }
    component.state.bounds = { left: 0, right: 5000, top: 0, bottom: 5000 }
    component.updateView()
    expect(component.state.view.height).toBeCloseTo(645 / zoom, 5)
    expect(component.state.view.top).toBeCloseTo(-9 / zoom - 100, 5)
    const positions = []
    component.scrollTo = (...args) => positions.push(args)
    component.onKeyDown('y', { key: 'End', preventDefault: () => {} })
    expect(positions[0][1]).toBeCloseTo(5000 - 645 / zoom, 5)
  },
)

test('大图绘制分组边界排除折叠后代并在重新展开后读取真实布局，不沿用缓存旧坐标', () => {
  const oldKity = window.kity
  window.kity = {
    Group: class {
      constructor() {
        this.node = { style: {} }
      }
      addShape() {}
    },
  }
  let expanded = true
  let far = 4000
  const root = {
    attached: true,
    parent: null,
    isRoot: () => true,
    isExpanded: () => expanded,
    getLayoutBox: () => ({ left: 0, top: 0, right: 100, bottom: 50 }),
    getLayoutVertexOut: () => ({ x: 100, y: 25 }),
    getConnection: () => null,
  }
  const child = {
    attached: true,
    parent: root,
    isRoot: () => false,
    getLayoutBox: () => ({ left: far, top: far, right: far + 100, bottom: far + 50 }),
    getLayoutVertexIn: () => ({ x: far, y: far }),
    getConnection: () => null,
  }
  const allNodes = [root, child]
  root.traverse = visit => allNodes.forEach(visit)
  const minder = {
    _progressiveGroups: [],
    on: () => {},
    off: () => {},
    getRoot: () => root,
    getViewDragger: () => ({
      getView: () => ({ left: 0, right: 1000, top: 0, bottom: 800, width: 1000, height: 800 }),
    }),
    getSelectedNodes: () => [],
    getConnectContainer: () => ({ addShape: () => {} }),
    getRenderContainer: () => ({ addShape: () => {} }),
  }
  const groups = createPaintGroups(minder)
  try {
    groups.mount([root, child])
    expect(groups.getBounds()).toEqual({ left: -24, top: -24, right: 4124, bottom: 4074 })
    expanded = false
    expect(groups.getBounds()).toEqual({ left: -24, top: -24, right: 124, bottom: 74 })
    expanded = true
    far = 800
    expect(groups.getBounds()).toEqual({ left: -24, top: -24, right: 924, bottom: 874 })
    allNodes.push({
      ...child,
      getLayoutBox: () => ({ left: 9000, top: 9000, right: 9100, bottom: 9050 }),
    })
    expect(groups.getBounds()).toEqual({ left: -24, top: -24, right: 9124, bottom: 9074 })
  } finally {
    groups.dispose()
    window.kity = oldKity
  }
})
