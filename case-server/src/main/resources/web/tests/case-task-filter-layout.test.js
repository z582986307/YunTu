const fs = require('fs')
const path = require('path')
const source = file => fs.readFileSync(path.resolve(__dirname, '../src/components/' + file), 'utf8')

test('用例五项筛选常驻列表顶部，任务筛选清空日期不显示无效值', () => {
  const page = source('case/caselist/index.js')
  const filters = source('case/caselist/oefilter.js')
  const tasks = source('case/caselist/taskList.js')
  expect(page).toContain('<OeFilter inline')
  expect(page.indexOf('<OeFilter inline')).toBeLessThan(page.indexOf('<List\n'))
  expect(page).not.toContain('filterVisble &&')
  expect(filters).toContain('inline-case-filters')
  expect(tasks).toContain('placeholder="任务名称、任务 ID、用例 ID"')
  expect(tasks).toContain('>搜索</Button>')
  expect(tasks).toContain('placeholder="负责人"')
  expect(tasks).toContain("placeholder={['开始时间', '结束时间']}")
  expect(tasks).toContain('draft.dates.every(Boolean)')
})

test('字体颜色预设包含默认黑色', () => {
  expect(source('react-mindmap-editor/components/colorPicker.js')).toContain("'#000000'")
})

test('文字筛选框有内容时可清空，不触发自动查询', () => {
  const filters = source('case/caselist/oefilter.js')
  const tasks = source('case/caselist/taskList.js')
  expect((filters.match(/allowClear/g) || []).length).toBeGreaterThanOrEqual(3)
  expect(tasks).toContain('<Input.Search allowClear')
  expect(tasks).toContain('onChange={event => this.changeDraft({ keyword: event.target.value })}')
})

test('重置后关联需求输入值是空字符串而不是空数组', () => {
  const filters = source('case/caselist/oefilter.js')
  expect(filters).not.toMatch(/value:\s*\[\]/)
  expect(filters).toContain("value: '',")
})

test('新建用例和任务均在成功后显示提示', () => {
  const cases = source('case/caselist/caseModal.js')
  const tasks = source('case/caselist/taskModal.js')
  expect(cases).toContain('新建测试用例成功')
  expect(tasks).toContain("'新建测试任务成功'")
})

test('用例和任务列表列宽仅在当前页面可拖动调整', () => {
  const cases = source('case/caselist/list.js')
  const tasks = source('case/caselist/taskList.js')
  const resize = source('case/caselist/resizableColumns.js')
  expect(cases).toContain('resizableColumns(this.setColumns(), this.state.columnWidths')
  expect(tasks).toContain('resizableColumns(columns, this.state.columnWidths')
  expect(tasks).toContain("width: 360")
  expect(resize).toContain("document.addEventListener('mousemove'")
  expect(resize).not.toContain('localStorage')
})
