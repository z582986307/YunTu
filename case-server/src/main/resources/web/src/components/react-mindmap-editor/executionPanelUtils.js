export const RESULT_OPTIONS = [
  { key: 'passed', label: '通过', value: 9, icon: 'checked', tone: 'success' },
  { key: 'failed', label: '失败', value: 1, icon: 'fail', tone: 'danger' },
  { key: 'blocked', label: '阻塞', value: 5, icon: 'block', tone: 'warning' },
  { key: 'skipped', label: '跳过', value: 4, icon: 'skip', tone: 'skipped' },
]
export const EXECUTION_MARK_OPTIONS = [
  {
    key: 'untested',
    label: '未测试',
    value: undefined,
    icon: 'minus-circle',
    tone: 'untested',
    antIcon: true,
  },
  ...RESULT_OPTIONS,
]
export const EXECUTION_FILTER_OPTIONS = EXECUTION_MARK_OPTIONS
export const getExecutionContextOptions = () => EXECUTION_MARK_OPTIONS
export const EXECUTION_STATUS_PATHS = {
  untested: 'M5 9h10v2H5z',
  success: 'M15.812 7.896l-6.75 6.75-4.5-4.5L6.25 8.459l2.812 2.803 5.062-5.053z',
  danger: 'M5.5 6.9L6.9 5.5 10 8.6l3.1-3.1 1.4 1.4-3.1 3.1 3.1 3.1-1.4 1.4L10 11.4l-3.1 3.1-1.4-1.4L8.6 10z',
  warning: 'M9 4h2v8H9V4zm0 10h2v2H9v-2z',
  skipped: 'M5 9h7L9.5 6.5 11 5l5 5-5 5-1.5-1.5L12 11H5z',
}
export const renderExecutionStatusIcon = item =>
  `<svg class="execution-status-icon ${item.tone}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"></circle><path d="${EXECUTION_STATUS_PATHS[item.tone]}"></path></svg>`
export const renderExecutionContextLabel = item =>
  `<span class="execution-context-list execution-context-label ${item.tone}">${renderExecutionStatusIcon(
    item,
  )}<span>${item.label}</span></span>`
export const getLockStatusLabel = locked => (locked ? '已锁定' : '已解锁')
export const PANEL_TOGGLE_ICONS = { expanded: 'right', collapsed: 'left' }
export const getExecutionOptionClassName = (tone, active) =>
  `execution-status-button ${tone}${active ? ' active' : ''}`
export const getExecutionMarkGridStyle = () => ({
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
})
export const matchesExecutionFilter = (progress, value) =>
  value === 'pending'
    ? progress === undefined || progress === null || Number(progress) === 0
    : Number(progress) === Number(value)
export const expandAllExecutionNodes = root => {
  const expandTree = node => {
    const children = childrenOf(node)
    if (!children.length) return
    node.expand()
    children.forEach(expandTree)
  }
  expandTree(root)
}
export const shouldShowMediaToolbar = progressShow => !progressShow
export const canMarkExecutionResult = (selectedCount, isLock) => !isLock && selectedCount > 0
export const getExecutionProgress = counts => {
  const completed = counts.passed + counts.failed + counts.blocked + counts.skipped
  const total = counts.total
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  }
}
const childrenOf = node => (node && node.getChildren ? node.getChildren() : [])
export const isExecutableNode = node =>
  Boolean(node && !(node.isRoot && node.isRoot()) && childrenOf(node).length === 0)
export const collectExecutionNodes = root => {
  const nodes = []
  const visit = node => {
    if (!node) return
    if (node !== root && isExecutableNode(node)) nodes.push(node)
    childrenOf(node).forEach(visit)
  }
  visit(root)
  return nodes
}
export const collectSelectedExecutionNodes = selectedNodes => {
  const nodes = []
  const seen = new Set()
  selectedNodes.forEach(selectedNode => {
    const visit = node => {
      if (isExecutableNode(node)) {
        if (!seen.has(node)) {
          seen.add(node)
          nodes.push(node)
        }
        return
      }
      childrenOf(node).forEach(visit)
    }
    visit(selectedNode)
  })
  return nodes
}
export const normalizeRightMindMap = data => {
  if (!data || !data.root) return data
  if (!data.template) data.template = 'right'
  if (!data.theme) data.theme = 'byte-blue'
  const setRight = node => {
    node.data = node.data || {}
    if (!node.data.layout && data.template === 'right') node.data.layout = 'right'
    if (node.data.expandState == null) node.data.expandState = 'expand'
    const children = node.children || []
    children.forEach(child => {
      setRight(child)
    })
  }
  setRight(data.root)
  return data
}
export const forceRightMindMap = minder => {
  minder.getRoot().traverse(node => node.setLayout('right'))
  minder.layout(100)
  minder.fire('contentchange')
}
export const focusFilteredExecutionNodes = (root, matchedNodes) => {
  const collapseTree = node => {
    const children = childrenOf(node)
    if (!children.length) return
    node.collapse()
    children.forEach(collapseTree)
  }
  collapseTree(root)
  root.expand()
  const expanded = new Set([root])
  matchedNodes.forEach(node => {
    const path = []
    let parent = node.parent
    while (parent && parent !== root) {
      path.unshift(parent)
      parent = parent.parent
    }
    path.forEach(item => {
      if (!expanded.has(item)) {
        expanded.add(item)
        item.expand()
      }
    })
  })
}
export const countExecutionResults = root => {
  const counts = {
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    pending: 0,
    total: 0,
  }
  const keyByValue = { 9: 'passed', 1: 'failed', 5: 'blocked', 4: 'skipped' }
  collectExecutionNodes(root).forEach(node => {
    counts.total += 1
    counts[keyByValue[node.getData('progress')] || 'pending'] += 1
  })
  return counts
}
const executionKeyByValue = { 9: 'passed', 1: 'failed', 5: 'blocked', 4: 'skipped' }
export const getExecutionResultKey = progress =>
  executionKeyByValue[progress] || 'pending'
export const createExecutionResultIndex = root => {
  const counts = {
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    pending: 0,
    total: 0,
  }
  const nodesByKey = Object.keys(counts).reduce((result, key) => {
    if (key !== 'total') result[key] = new Set()
    return result
  }, {})
  collectExecutionNodes(root).forEach(node => {
    const key = getExecutionResultKey(node.getData('progress'))
    counts.total += 1
    counts[key] += 1
    nodesByKey[key].add(node)
  })
  return { counts, nodesByKey }
}
export const updateExecutionResultIndex = (index, nodes, previous, next) => {
  const previousKey = getExecutionResultKey(previous)
  const nextKey = getExecutionResultKey(next)
  if (previousKey === nextKey) return index
  nodes.forEach(node => {
    index.nodesByKey[previousKey].delete(node)
    index.nodesByKey[nextKey].add(node)
  })
  index.counts[previousKey] -= nodes.length
  index.counts[nextKey] += nodes.length
  return index
}

export const getNodeDataPath = (node, field) => {
  const segments = []
  let current = node
  while (current && current.parent) {
    const parent = current.parent
    segments.unshift('children', parent.children.indexOf(current))
    current = parent
  }
  return `/root/${segments.join('/')}${segments.length ? '/' : ''}data/${field}`
}

export const buildNodeDataPatches = (nodes, field, value) =>
  nodes.reduce((patches, node) => {
    const previous = node.getData(field)
    if (previous === value || (previous == null && value == null)) return patches
    const patch = { path: getNodeDataPath(node, field) }
    if (value == null) patch.op = 'remove'
    else if (previous == null) {
      patch.op = 'add'
      patch.value = value
    } else {
      patch.op = 'replace'
      patch.value = value
      patch.fromValue = previous
    }
    if (patch.op === 'remove') patch.fromValue = previous
    patches.push(patch)
    return patches
  }, [])
export const invertNodeDataPatches = patches =>
  [...patches].reverse().map(patch => {
    if (patch.op === 'add') return { op: 'remove', path: patch.path }
    if (patch.op === 'remove')
      return { op: 'add', path: patch.path, value: patch.fromValue }
    return { op: 'replace', path: patch.path, value: patch.fromValue }
  })
export const toWirePatches = patches =>
  patches.map(({ fromValue, ...patch }) => patch)
export const getNodeNote = node => (node && node.getData('note')) || ''
