/** @jest-environment node */
/* eslint-env jest */
import fs from 'fs'
import path from 'path'

test('左侧测试用例管理包含用例与任务入口，用例表不再内嵌任务行', () => {
  const root = path.join(__dirname, '../src/components/case/caselist')
  const page = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const list = fs.readFileSync(path.join(root, 'list.js'), 'utf8')
  const tree = fs.readFileSync(path.join(root, 'tree.js'), 'utf8')
  expect(page).toContain('测试用例管理')
  expect(page).toContain("navExpanded: true")
  expect(page).toContain('aria-expanded={this.state.navExpanded}')
  expect(page).toContain('{this.state.navExpanded &&')
  expect(page).toContain('测试任务')
  expect(page).toContain('<TaskList')
  expect(tree).toContain('case-directory-heading')
  expect(list).not.toContain('expandedRowRender={item => this.renderExpand(item)}')
})
