const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const puppeteer = require(path.join(root, '项目依赖/YunTu-Web/node_modules/puppeteer-core'));
const bundle = path.join(root, '运行日志/脑图性能/editor-build/editor.js');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="blue"/></svg>';

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === '/editor.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(bundle));
    } else if (request.url === '/image.svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end(svg);
    } else if (request.url === '/api/file/uploadAttachment') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ success: 1, data: [{ url: `http://127.0.0.1:${server.address().port}/image.svg` }] }));
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><meta charset="utf-8"><div id="map" style="height:800px"></div><script src="/editor.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const browserData = path.join(root, '运行日志/图片删除验证', `chrome-${process.pid}`);
    fs.mkdirSync(path.dirname(browserData), { recursive: true });
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: browserData,
      args: ['--disable-extensions', '--no-first-run'],
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      const data = { template: 'right', root: { data: { text: '中心' }, children: [{ data: { text: '用例' }, children: [] }] } };
      window.testEditor = await window.mountTestEditor(data, false);
    });
    await page.waitForFunction(() => window.testEditor && window.testEditor.minder &&
      window.testEditor.minder.getRoot().children[0] &&
      window.testEditor.minder.getRoot().children[0].getRenderContainer());
    await page.evaluate(() => window.testEditor.minder.select(window.testEditor.minder.getRoot().children[0], true));
    await page.waitForSelector('button[aria-label="插入图片"]');
    await page.click('button[aria-label="插入图片"]');
    const input = await page.$('.yuntu-modal input[type="file"]');
    await input.uploadFile(path.join(root, 'case-server/src/main/resources/web/dist/favicon.svg'));
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]');
    await page.waitForSelector('.yuntu-modal [aria-label="删除已选图片"]:not([disabled])');
    const position = await page.evaluate(() => {
      const image = document.querySelector('.yuntu-modal [aria-label="图片预览"]').getBoundingClientRect();
      const button = document.querySelector('.yuntu-modal [aria-label="删除已选图片"]');
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { right: rect.right - image.right, top: rect.top - image.top,
        background: getComputedStyle(button).backgroundColor, hit: hit?.outerHTML.slice(0, 100) };
    });
    assert(Math.abs(position.right) <= 10 && Math.abs(position.top) <= 10,
      `删除按钮贴近图片右上角：${JSON.stringify(position)}`);
    assert.strictEqual(position.background, 'rgb(240, 68, 56)');
    await page.screenshot({ path: path.join(root, '运行日志/图片删除验证/图片预览.png') });
    await page.waitForTimeout(300);
    await page.click('.yuntu-modal [aria-label="删除已选图片"]');
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]', { hidden: true });
    const retryInput = await page.$('.yuntu-modal input[type="file"]');
    await retryInput.uploadFile(path.join(root, 'case-server/src/main/resources/web/dist/favicon.svg'));
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]');
    await page.waitForTimeout(300);
    await page.click('.yuntu-modal .ant-modal-footer .ant-btn-primary');
    await page.waitForSelector('.yuntu-modal', { hidden: true });
    await page.waitForSelector('svg image');
    await page.hover('svg image');
    await page.waitForSelector('.mindmap-node-image-delete');
    const nodePosition = await page.evaluate(() => {
      const image = document.querySelector('svg image').getBoundingClientRect();
      const button = document.querySelector('.mindmap-node-image-delete');
      const rect = button.getBoundingClientRect();
      return { right: rect.right - image.right, top: rect.top - image.top,
        background: getComputedStyle(button).backgroundColor };
    });
    assert(Math.abs(nodePosition.right) <= 15 && Math.abs(nodePosition.top) <= 15,
      `节点图片删除按钮贴近右上角：${JSON.stringify(nodePosition)}`);
    assert.strictEqual(nodePosition.background, 'rgb(240, 68, 56)');
    await page.click('.mindmap-node-image-delete');
    await page.waitForFunction(() => !window.testEditor.minder.getRoot().children[0].getData('image'));
    console.log('browser-image-delete-style: pass');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
