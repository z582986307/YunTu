const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const dist = path.join(__dirname, '../dist');
const puppeteer = require(path.join(root, '项目依赖/YunTu-Web/node_modules/puppeteer-core'));
const json = value => JSON.stringify({ code: 200, msg: '成功', data: value });
let restoreCalls = 0;

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/api/backup/getBackupByCaseId')) {
      response.setHeader('Content-Type', 'application/json');
      response.end(json([
        { id: 12, caseId: 7, creator: 'tester', gmtCreated: '2026-10-13T09:00:00' },
        { id: 11, caseId: 7, creator: 'tester', gmtCreated: '2026-10-12T09:00:00' },
      ]));
      return;
    }
    if (request.url.startsWith('/api/backup/getCaseDiff')) {
      response.setHeader('Content-Type', 'application/json');
      response.end(json({
        content: { base: 2, template: 'right', root: { data: { text: '版本比较结果' }, children: [] } },
        backupinfo: [{ user: 'tester', time: '2026-10-12T09:00:00' }, { user: 'tester', time: '2026-10-13T09:00:00' }],
      }));
      return;
    }
    if (request.url === '/api/backup/restore') {
      restoreCalls++;
      response.setHeader('Content-Type', 'application/json');
      response.end(json(null));
      return;
    }
    const pathname = decodeURIComponent(request.url.split('?')[0]);
    const file = path.join(dist, pathname.replace(/^\/+/, ''));
    const target = file.startsWith(dist + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
      ? file : path.join(dist, 'index.html');
    response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' :
      target.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(fs.readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: path.join(root, '运行日志/历史版本浏览器验证', `chrome-${process.pid}`),
      args: ['--disable-extensions', '--no-first-run'],
    });
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setCookie({ name: 'username', value: 'fixture-user', url: base });
    await page.goto(`${base}/history/7`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.ant-table-tbody tr');
    await page.screenshot({ path: path.join(root, '运行日志/历史版本浏览器验证/历史列表.png') });
    assert.strictEqual(await page.$$eval('.ant-table-tbody tr', rows => rows.length), 2);
    assert(await page.evaluate(() => Array.from(document.querySelectorAll('button'))
      .some(button => button.textContent.trim() === '返回')), '历史页显示返回按钮');

    await page.click('.ant-table-tbody tr:first-child button');
    await page.waitForSelector('.ant-modal-confirm');
    assert.strictEqual(restoreCalls, 0, '确认前不恢复');
    await page.evaluate(() => Array.from(document.querySelectorAll('.ant-modal-confirm button'))
      .find(button => button.textContent.replace(/\s/g, '') === '取消').click());
    await page.waitForSelector('.ant-modal-confirm', { hidden: true });
    assert.strictEqual(restoreCalls, 0, '取消后不恢复');
    await page.click('.ant-table-tbody tr:first-child button');
    await page.evaluate(() => Array.from(document.querySelectorAll('.ant-modal-confirm button'))
      .find(button => button.textContent.trim() === '确认恢复').click());
    await page.waitForFunction(() => document.querySelector('.ant-message-success'));
    assert.strictEqual(restoreCalls, 1, '确认后恢复一次');
    await page.waitForSelector('.ant-modal-confirm', { hidden: true });
    await page.waitForFunction(() => !document.querySelector('.ant-table .ant-spin-spinning'));

    await page.click('.ant-table-tbody tr:nth-child(1) .ant-checkbox-wrapper');
    await page.click('.ant-table-tbody tr:nth-child(2) .ant-checkbox-wrapper');
    assert.strictEqual(await page.$$eval('.ant-table-tbody .ant-checkbox-checked', boxes => boxes.length), 2);
    await page.evaluate(() => Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent.includes('对比已选择版本')).click());
    await page.waitForFunction(() => location.pathname.includes('/historyContrast/'));
    await page.waitForFunction(() => document.body.textContent.includes('版本比较结果'));
    await page.screenshot({ path: path.join(root, '运行日志/历史版本浏览器验证/版本对比.png') });
    console.log('browser-history-versions: pass');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
