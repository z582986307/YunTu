const assert = require('assert')
const fs = require('fs')
const http = require('http')
const path = require('path')

const root = path.resolve(__dirname, '../../../../../..')
const dist = path.join(__dirname, '../dist')
const puppeteer = require(path.join(root, '项目依赖/YunTu-Web/node_modules/puppeteer-core'))
const json = data => JSON.stringify({ code: 200, msg: '成功', data })
const evidence = path.join(root, '运行日志/任务列表浏览器验证')
fs.mkdirSync(evidence, { recursive: true })

async function main() {
  const taskPageQueries = []
  const server = http.createServer((request, response) => {
    let body = null
    if (request.url.startsWith('/api/dir/list') || request.url.startsWith('/api/dir/cardTree')) body = { children: [] }
    if (request.url.startsWith('/api/case/listCreators')) body = []
    if (request.url.startsWith('/api/case/list')) body = { dataSources: [
      { id: 7, title: '客户管理', creator: 'tester', modifier: 'tester', recordNum: 1,
        requirementId: '', gmtCreated: '2026-10-13T09:00:00' },
    ], total: 1 }
    if (request.url.startsWith('/api/case/countByCondition')) body = { count: 5 }
    if (request.url.startsWith('/api/case/getCaseInfo')) body = { id: 7, title: '客户管理', description: '' }
    if (request.url.startsWith('/api/user/suggest')) body = ['tester', 'test-user']
    if (request.url.startsWith('/api/record/page')) { taskPageQueries.push(request.url); body = { dataSources: [
      { id: 9, caseId: 7, title: '较新的任务', owner: 'tester', createTime: 2000, executeNum: 2, totalNum: 3 },
      { id: 8, caseId: 7, title: '较旧的任务', owner: 'tester', createTime: 1000, executeNum: 1, totalNum: 3 },
    ], total: 2 } }
    if (body !== null) {
      response.setHeader('Content-Type', 'application/json')
      response.end(json(body))
      return
    }
    const pathname = decodeURIComponent(request.url.split('?')[0])
    const file = path.join(dist, pathname.replace(/^\/+/, ''))
    const target = file.startsWith(dist + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
      ? file : path.join(dist, 'index.html')
    response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' :
      target.endsWith('.css') ? 'text/css' : 'text/html')
    response.end(fs.readFileSync(target))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: path.join(evidence, `chrome-${process.pid}`),
      args: ['--disable-extensions', '--no-first-run'],
    })
    const page = await browser.newPage()
    const base = `http://127.0.0.1:${server.address().port}`
    await page.setCookie({ name: 'username', value: 'fixture-user', url: base })
    await page.goto(`${base}/case/caseList/1`, { waitUntil: 'networkidle2' })
    await page.waitForSelector('.case-management-nav')
    assert(await page.evaluate(() => document.querySelector('.case-management-nav').textContent.includes('测试用例管理')))
    assert.strictEqual(await page.$$('.table-wrap .ant-table-row-expand-icon').then(items => items.length), 0,
      '用例表不再内嵌任务行')
    assert(await page.$eval('.table-wrap .case-list-actions', node =>
      ['编辑', '创建任务', '复制', '更多'].every(label => node.textContent.includes(label))))
    await page.screenshot({ path: path.join(evidence, '用例列表.png') })
    await page.evaluate(() => Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent.includes('新建用例')).click())
    await page.waitForSelector('.oe-caseModal-style-wrap input[id="case"]')
    const upload = await page.$('.oe-caseModal-style-wrap input[type="file"]')
    await upload.uploadFile(path.join(__dirname, '../src/components/case/caselist/testcase-template.xlsx'))
    await page.waitForFunction(() => document.querySelector('.oe-caseModal-style-wrap input[id="case"]')
      .value === 'testcase-template')
    assert.strictEqual(await page.$eval('.uploaded-case-file span', node => node.textContent), 'testcase-template.xlsx')
    assert(!(await page.$eval('.oe-caseModal-style-wrap', node => node.textContent)).includes('上传文件（非必传）'))
    await page.keyboard.press('Escape')
    await page.waitForSelector('.oe-caseModal-style-wrap', { hidden: true })
    await page.evaluate(() => Array.from(document.querySelectorAll('.table-wrap .ant-table-tbody tr:first-child button'))
      .find(button => button.textContent.trim() === '创建任务').click())
    await page.waitForSelector('.oe-taskModal-style-wrap input[id="title"]')
    assert.strictEqual(await page.$eval('.oe-taskModal-style-wrap input[id="title"]', node => node.value), '客户管理')
    await page.focus('.oe-taskModal-style-wrap div#owner .ant-select-selection')
    await page.keyboard.press('Enter')
    await page.focus('.oe-taskModal-style-wrap div#owner .ant-select-search__field')
    await page.keyboard.type('test', { delay: 60 })
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.ant-select-dropdown-menu-item'))
      .some(item => item.textContent.trim() === 'test-user'), { timeout: 5000 })
    await page.click('.oe-taskModal-style-wrap .ant-modal-close')
    await page.waitForSelector('.oe-taskModal-style-wrap', { hidden: true })
    await page.evaluate(() => Array.from(document.querySelectorAll('.case-management-nav button'))
      .find(button => button.textContent.trim() === '测试任务').click())
    await page.waitForFunction(() => document.querySelector('.task-list-page') &&
      document.querySelector('.task-list-page').textContent.includes('较新的任务'))
    assert.strictEqual(await page.$$eval('.task-list-page .ant-table-tbody tr', rows => rows.length), 2)
    assert.strictEqual(await page.$eval('.task-list-page .ant-table-tbody tr:first-child .task-list-name',
      node => node.textContent.trim()), '较新的任务')
    assert.strictEqual(await page.$eval('.task-list-page .ant-table-tbody tr:first-child td:first-child',
      node => node.textContent.trim()), '9')
    await page.type('.task-list-filters input[placeholder^="搜索任务名称"]', '较新')
    await page.click('.task-list-filters .ant-btn-primary')
    await page.waitForFunction(() => document.querySelector('.task-list-page') &&
      document.querySelector('.task-list-page .ant-table-tbody tr'))
    await page.waitForFunction(() => document.querySelector('.task-list-page .ant-table-tbody tr'))
    assert(taskPageQueries.some(query => decodeURIComponent(query).includes('keyword=较新')))
    const shot = path.join(evidence, '任务列表.png')
    await page.screenshot({ path: shot })
    await page.click('.task-list-page .ant-table-tbody tr:first-child td:nth-child(3) a')
    await page.waitForFunction(() => location.pathname === '/caseManager/1/7/undefined/0')
    console.log('browser-task-navigation: pass')
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
