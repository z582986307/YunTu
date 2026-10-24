const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../src/components/react-mindmap-editor')
const editor = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
const styles = fs.readFileSync(path.join(root, 'index.scss'), 'utf8')
const socket = fs.readFileSync(path.join(root, 'socket.js'), 'utf8')
const axios = fs.readFileSync(path.resolve(__dirname, '../src/utils/axios.js'), 'utf8')

test('被锁定页面按用例和任务分别给出明确提示', () => {
  expect(editor).toContain("this.props.progressShow ? '当前任务已锁定，不可执行' : '当前用例已锁定，不可编辑'")
  expect(editor).toContain("title={isLock ? '已锁定'")
  expect(editor).toContain("aria-label={isLock ? '已锁定'")
  expect(editor).toContain("locked ? '可编辑，点击解锁' : '点击锁定'")
  expect(editor).toContain('<span className="yuntu-lock-wrap">')
})

test('轻提示统一采用保存成功同款 message 样式', () => {
  expect(editor).toContain("message.warning(this.props.progressShow ? '当前任务已锁定，不可执行' : '当前用例已锁定，不可编辑')")
  expect(editor).not.toMatch(/^(?!\s*\/\/)[^\n]*notification\.(success|warning|error|info)/m)
  expect(socket).not.toMatch(/^(?!\s*\/\/)[^\n]*notification\.(success|warning|error|info)/m)
  expect(axios).not.toContain('notification.error(')
})

test('锁定开关保持紧凑尺寸且禁用态仍能看清锁图标', () => {
  expect(styles).toContain('.yuntu-lock.ant-switch')
  expect(styles).toContain('&.ant-switch-disabled')
  expect(styles).toContain('opacity: 1;')
})
