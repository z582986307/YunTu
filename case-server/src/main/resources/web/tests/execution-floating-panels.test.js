/* eslint-env jest */
import {
  RESULT_OPTIONS,
  EXECUTION_MARK_OPTIONS,
  EXECUTION_FILTER_OPTIONS,
  PANEL_TOGGLE_ICONS,
  canMarkExecutionResult,
  collectExecutionNodes,
  collectSelectedExecutionNodes,
  focusFilteredExecutionNodes,
  getExecutionProgress,
  getExecutionOptionClassName,
  getExecutionMarkGridStyle,
  matchesExecutionFilter,
  expandAllExecutionNodes,
  countExecutionResults,
  getNodeNote,
  isExecutableNode,
  normalizeRightMindMap,
  forceRightMindMap,
  getExecutionContextOptions,
  renderExecutionContextLabel,
  getLockStatusLabel,
  shouldShowMediaToolbar,
} from '../src/components/react-mindmap-editor/executionPanelUtils'
import { getSocketUrl } from '../src/components/react-mindmap-editor/util/socketUrl'
const node = (data, children = []) => ({
  getChildren: () => children,
  getData: key => data[key],
})
test('执行结果提供稳定的语义样式标识', () => {
  expect(RESULT_OPTIONS.map(item => item.tone)).toEqual(['success', 'danger', 'warning', 'skipped'])
})
test('通过失败阻塞跳过都计入执行进度，未测试不计入', () => {
  expect(getExecutionProgress({ passed: 1, failed: 2, blocked: 3, skipped: 4, pending: 10, total: 20 })).toEqual({ completed: 10, total: 20, percent: 50 })
  expect(getExecutionProgress({ passed: 0, failed: 0, blocked: 0, skipped: 0, pending: 0, total: 0 }).percent).toBe(0)
})
test('标记结果按钮按两列等宽换行避免窄悬浮窗重叠', () => {
  expect(getExecutionMarkGridStyle()).toEqual({
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  })
})
test('右键标记结果与悬浮窗共用相同文案顺序和语义样式', () => {
  expect(getExecutionContextOptions().map(item => [item.label, item.tone])).toEqual([
    ['未测试', 'untested'],
    ['通过', 'success'],
    ['失败', 'danger'],
    ['阻塞', 'warning'],
    ['跳过', 'skipped'],
  ])
  const label = document.createElement('div')
  label.innerHTML = renderExecutionContextLabel({ label: '失败', tone: 'danger' })
  expect(label.textContent).toBe('失败')
  expect(label.querySelector('.execution-context-label.danger')).not.toBeNull()
  expect(label.querySelector('svg.execution-status-icon.danger')).not.toBeNull()
})
test('锁定开关使用状态文案', () => {
  expect(getLockStatusLabel(true)).toBe('已锁定')
  expect(getLockStatusLabel(false)).toBe('已解锁')
})
test('未测试选项沿用原命令语义清空已选节点结果', () => {
  expect(EXECUTION_MARK_OPTIONS.map(item => item.label)).toEqual([
    '未测试',
    '通过',
    '失败',
    '阻塞',
    '跳过',
  ])
  expect(EXECUTION_MARK_OPTIONS[0].value).toBeUndefined()
})
test('结果筛选模块包含全部五种末级用例状态', () => {
  expect(EXECUTION_FILTER_OPTIONS.map(item => item.label)).toEqual([
    '未测试',
    '通过',
    '失败',
    '阻塞',
    '跳过',
  ])
})
test('进度筛选和标记结果共用同一套状态按钮样式', () => {
  expect(getExecutionOptionClassName('danger', false)).toBe('execution-status-button danger')
  expect(getExecutionOptionClassName('warning', true)).toBe(
    'execution-status-button warning active',
  )
})
test('执行进度筛选兼容数字和历史字符串状态', () => {
  expect(matchesExecutionFilter(1, 1)).toBe(true)
  expect(matchesExecutionFilter('1', 1)).toBe(true)
  expect(matchesExecutionFilter(null, 'pending')).toBe(true)
  expect(matchesExecutionFilter(undefined, 'pending')).toBe(true)
  expect(matchesExecutionFilter(9, 1)).toBe(false)
})
test('全部筛选展开整棵用例树', () => {
  const leaf = { getChildren: () => [], expand: jest.fn() }
  const branch = { getChildren: () => [leaf], expand: jest.fn() }
  const root = { getChildren: () => [branch], expand: jest.fn() }
  expandAllExecutionNodes(root)
  expect(root.expand).toHaveBeenCalled()
  expect(branch.expand).toHaveBeenCalled()
  expect(leaf.expand).not.toHaveBeenCalled()
})
test('面板展开时箭头向右，收起后入口箭头向左', () => {
  expect(PANEL_TOGGLE_ICONS).toEqual({ expanded: 'right', collapsed: 'left' })
})
test('执行模式隐藏左上角媒体工具栏', () => {
  expect(shouldShowMediaToolbar(false)).toBe(true)
  expect(shouldShowMediaToolbar(true)).toBe(false)
})
test('执行结果沿用原逻辑：选中任意数量节点即可标记', () => {
  expect(canMarkExecutionResult(0, false)).toBe(false)
  expect(canMarkExecutionResult(1, false)).toBe(true)
  expect(canMarkExecutionResult(2, false)).toBe(true)
  expect(canMarkExecutionResult(1, true)).toBe(false)
})
test('执行进度显示已执行用例数与总用例数', () => {
  expect(
    getExecutionProgress({
      passed: 2,
      failed: 1,
      blocked: 1,
      skipped: 0,
      pending: 2,
      total: 6,
    }),
  ).toEqual({ completed: 4, total: 6, percent: 67 })
  expect(
    getExecutionProgress({
      passed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0,
      total: 0,
    }),
  ).toEqual({
    completed: 0,
    total: 0,
    percent: 0,
  })
})
test('只允许末级用例执行并统计结果', () => {
  const passed = node({ progress: 9, note: '已核对' })
  const failed = node({ progress: 1 })
  const pending = node({})
  const group = node({}, [passed, failed])
  const root = node({}, [group, pending])
  expect(isExecutableNode(group)).toBe(false)
  expect(isExecutableNode(passed)).toBe(true)
  expect(collectExecutionNodes(root)).toEqual([passed, failed, pending])
  expect(countExecutionResults(root)).toEqual({
    passed: 1,
    failed: 1,
    blocked: 0,
    skipped: 0,
    pending: 1,
    total: 3,
  })
  expect(getNodeNote(passed)).toBe('已核对')
})
test('选择父级节点时只标记其下所有末级用例', () => {
  const first = node({})
  const second = node({})
  const group = node({}, [first, second])
  expect(collectSelectedExecutionNodes([group])).toEqual([first, second])
  expect(collectSelectedExecutionNodes([group, first])).toEqual([first, second])
})
test('缺失外观时使用默认主题并展开节点', () => {
  const data = {
    root: { data: {}, children: [{ data: {}, children: [] }] },
  }
  expect(normalizeRightMindMap(data)).toBe(data)
  expect(data.template).toBe('right')
  expect(data.theme).toBe('byte-blue')
  expect(data.root.data.layout).toBe('right')
  expect(data.root.children[0].data.layout).toBe('right')
  expect(data.root.data.expandState).toBe('expand')
  expect(data.root.children[0].data.expandState).toBe('expand')
})
test('重新打开时保留已保存的主题图形与节点布局', () => {
  const data = { theme: 'ink-black', template: 'fish-bone',
    root: { data: { layout: 'left' }, children: [{ data: { layout: 'left' }, children: [] }] } }
  normalizeRightMindMap(data)
  expect(data.theme).toBe('ink-black')
  expect(data.template).toBe('fish-bone')
  expect(data.root.children[0].data.layout).toBe('left')
})
test('切换思维导图后强制现有节点及后续子节点继承右向布局', () => {
  const layouts = []
  const minder = {
    getRoot: () => ({
      traverse: callback => {
        callback({ setLayout: value => layouts.push(value) })
        callback({ setLayout: value => layouts.push(value) })
      },
    }),
    layout: jest.fn(),
    fire: jest.fn(),
  }
  forceRightMindMap(minder)
  expect(layouts).toEqual(['right', 'right'])
  expect(minder.layout).toHaveBeenCalledWith(100)
  expect(minder.fire).toHaveBeenCalledWith('contentchange')
})
test('筛选时折叠整树并只展开命中末级节点路径', () => {
  const actions = []
  const makeNode = (name, children = []) => {
    const item = {
      name,
      children,
      getChildren: () => children,
      collapse: () => actions.push(`collapse:${name}`),
      expand: () => actions.push(`expand:${name}`),
    }
    children.forEach(child => {
      child.parent = item
    })
    return item
  }
  const passed = makeNode('passed')
  const failed = makeNode('failed')
  const passedGroup = makeNode('passed-group', [passed])
  const failedGroup = makeNode('failed-group', [failed])
  const root = makeNode('root', [passedGroup, failedGroup])
  focusFilteredExecutionNodes(root, [passed])
  expect(actions).toEqual([
    'collapse:root',
    'collapse:passed-group',
    'collapse:failed-group',
    'expand:root',
    'expand:passed-group',
  ])
})
test('独立 HTTP 服务自动使用相邻 Socket 端口', () => {
  expect(getSocketUrl({ protocol: 'http:', hostname: 'localhost', port: '8194' })).toBe(
    'http://localhost:8195',
  )
  expect(getSocketUrl({ protocol: 'https:', hostname: 'localhost', port: '8543' })).toBe(
    'https://localhost:8095',
  )
})
