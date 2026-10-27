const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../src/components/react-mindmap-editor')
const editor = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
const styles = fs.readFileSync(path.join(root, 'index.scss'), 'utf8')
const socket = fs.readFileSync(path.join(root, 'socket.js'), 'utf8')
const axios = fs.readFileSync(path.resolve(__dirname, '../src/utils/axios.js'), 'utf8')

test('被锁定页面按用例和任务分别给出明确提示', () => {
  expect(editor).toContain("this.props.progressShow ? '当前任务已锁定，不可执行' : '当前用例已锁定，不可编辑'")
  expect(editor).toContain("locked ? '已锁定，仅当前用户可操作' : '已解锁，所有用户均可操作'")
  expect(editor).toContain('<span className="yuntu-lock-wrap">')
})

test('首个进入者显示持有锁且可编辑，点击后发送解锁请求', () => {
  const handlerBody = editor.match(/handleLock = \(data\) => \{([\s\S]*?)\n  \}/)[1]
  const handleLock = new Function('data', 'message', handlerBody)
  const page = {
    props: {},
    minder: { setStatus: jest.fn() },
    notifyOperationState: () => {},
    state: { locked: false, isLock: false },
    setState(update) { Object.assign(this.state, update) },
  }

  handleLock.call(page, '4', {})

  expect(page.state).toEqual({ locked: true, isLock: false })
  const toggleBody = editor.match(/handleLockToggle = checked => \{([\s\S]*?)\n  \};/)[1]
  const toggle = new Function('checked', 'message', toggleBody)
  page.ws = { sendMessage: jest.fn() }
  toggle.call(page, false, {})
  expect(page.ws.sendMessage).toHaveBeenCalledWith('lock', { message: 'unlock' })
  handleLock.call(page, '2', { success: () => {} })
  expect(page.state).toEqual({ locked: false, isLock: false })
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
