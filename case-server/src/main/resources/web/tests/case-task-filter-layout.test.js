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
  expect(tasks).toContain("placeholder=\"任务名称、任务 ID、用例 ID\"")
  expect(tasks).toContain('placeholder="负责人"')
  expect(tasks).toContain("placeholder={['创建时间', '结束时间']}")
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
