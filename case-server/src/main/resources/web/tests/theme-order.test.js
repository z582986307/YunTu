const fs = require('fs')
const path = require('path')

test.each([
  '../src/components/case/casemgt/index.js',
  '../src/pages/contrast/seeResult.js',
])('外观主题首项是天蓝色新，第二项是经典黑：%s', relative => {
  const source = fs.readFileSync(path.resolve(__dirname, relative), 'utf8')
  const order = source.match(/theme:\s*\[([^\]]+)\]/)
  expect(order).not.toBeNull()
  expect(order[1].match(/'[^']+'/g).slice(0, 2)).toEqual(["'byte-blue'", "'ink-black'"])
})

test('导出下载不额外打开空白标签页', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/case/caselist/list.js'), 'utf8')
  const link = source.match(/<a\s+href=\{`\/api\/file\/export\?id=\$\{record\.id\}`\}([\s\S]*?)>/)
  expect(link).not.toBeNull()
  expect(link[1]).not.toContain('target="_blank"')
})
