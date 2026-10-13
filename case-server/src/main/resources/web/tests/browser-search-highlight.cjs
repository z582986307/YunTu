const assert = require('assert')
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '../../../../../..')
const puppeteer = require(path.join(root, '项目依赖/YunTu-Web/node_modules/puppeteer-core'))
const source = fs.readFileSync(path.join(__dirname,
  '../src/components/react-mindmap-editor/components/searchHighlight.js'), 'utf8')

async function main() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--disable-extensions', '--no-first-run'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60">' +
      '<g><text x="10" y="30" font-size="16">客户管理节点</text></g></svg>')
    const result = await page.evaluate(code => {
      const { highlightNodeText } = new Function(code.replace(/export const/g, 'const') +
        '; return { highlightNodeText };')()
      const group = document.querySelector('svg g')
      const text = group.querySelector('text')
      const before = text.getBoundingClientRect()
      const cleanup = highlightNodeText({ getRenderer: () => ({ getRenderShape: () => ({ node: group }) }) }, '管理')
      const mark = text.querySelector('tspan.yuntu-search-match')
      const highlighted = mark && mark.textContent === '管理' && text.textContent === '客户管理节点'
      cleanup()
      const after = text.getBoundingClientRect()
      return { highlighted, restored: !text.querySelector('tspan') && text.textContent === '客户管理节点',
        unchangedSize: Math.abs(before.width - after.width) < 1 }
    }, source)
    assert.deepStrictEqual(result, { highlighted: true, restored: true, unchangedSize: true })
    console.log('browser-search-highlight: pass')
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
