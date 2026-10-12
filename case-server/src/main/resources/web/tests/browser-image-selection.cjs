const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const deps = path.join(root, '项目依赖/YunTu-Web/node_modules');
const puppeteer = require(path.join(deps, 'puppeteer-core'));
const bundle = path.join(root, '运行日志/脑图性能/editor-build/editor.js');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#3370ff"/></svg>';

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === '/editor.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(bundle));
    } else if (request.url === '/sample.svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end(svg);
    } else {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><div id="map" style="height:900px"></div><script src="/editor.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: path.join(root, '运行日志/脑图性能', `chrome-image-select-${process.pid}`),
      defaultViewport: { width: 1280, height: 900 },
      args: ['--disable-extensions', '--no-first-run'],
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const data = { template: 'right', root: { data: { text: '中心' }, children: [
      { data: { text: '节点文字保留', image: '/sample.svg', imageSize: { width: 80, height: 40 } }, children: [] },
    ] } };
    await page.evaluate(async value => { window.editor = await window.mountTestEditor(value, true, undefined, true); }, data);
    await page.waitForSelector('svg image');
    await page.evaluate(() => { window.editor.minder.select([], true); window.editor.setState({ selectedNode: null }); });
    await page.click('svg image');
    await page.waitForTimeout(350);
    assert.strictEqual(await page.$('.km-image-viewer'), null, '执行页首次点图只选节点');
    assert.strictEqual(await page.evaluate(() => window.editor.minder.getSelectedNode().getText()), '节点文字保留');
    await page.click('svg image');
    assert.strictEqual(await page.$('.km-image-viewer'), null, '执行页二次单击也不能进入图片编辑');
    await page.click('svg image', { clickCount: 2, delay: 50 });
    await page.waitForSelector('.km-image-viewer');
    assert.deepStrictEqual(await page.$eval('.km-image-viewer', viewer => {
      const style = getComputedStyle(viewer);
      return { position: style.position, zIndex: style.zIndex };
    }), { position: 'fixed', zIndex: '99999' }, '大图查看器必须覆盖页面，而不只是插入 DOM');
    await page.waitForFunction(() => {
      const image = document.querySelector('.km-image-viewer img');
      return image && image.complete && image.naturalWidth > 0;
    });
    assert.strictEqual(await page.$eval('.km-image-viewer img', image => image.classList.contains('limited')), true);
    await page.click('.km-image-viewer img');
    assert.strictEqual(await page.$eval('.km-image-viewer img', image => image.classList.contains('limited')), false, '大图可点击放大');
    await page.click('.km-image-viewer img');
    assert.strictEqual(await page.$eval('.km-image-viewer img', image => image.classList.contains('limited')), true, '大图可点击缩小');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.km-image-viewer', { hidden: true });
    assert.strictEqual(await page.$('.mindmap-image-resize-handle'), null, '执行页不能调整图片尺寸');
    assert.strictEqual(await page.$('.mindmap-node-image-delete'), null, '执行页不能删除图片');
    await page.evaluate(() => window.editor.minder.select(window.editor.minder.getRoot().children[0], true));
    await page.keyboard.press('Backspace');
    assert.deepStrictEqual(await page.evaluate(() => {
      const node = window.editor.minder.getRoot().children[0];
      return { count: window.editor.minder.getRoot().children.length, image: node.getData('image') };
    }), { count: 1, image: '/sample.svg' }, '执行页 Backspace 不能删除节点或图片');
    await page.evaluate(async value => {
      window.unmountTestEditor();
      window.editor = await window.mountTestEditor(value, false);
      window.editor.minder.select([], true);
      window.editor.setState({ selectedNode: null, selectedImage: null });
    }, data);
    await page.waitForSelector('svg image');
    await page.click('svg image');
    await page.waitForTimeout(350);
    assert.strictEqual(await page.$('.km-image-viewer'), null, '编辑页首次点图只选节点');
    assert.strictEqual(await page.evaluate(() => window.editor.minder.getSelectedNode().getText()), '节点文字保留');
    await page.click('svg image');
    await page.waitForSelector('.mindmap-image-resize-handle');
    assert.strictEqual(await page.$('.km-image-viewer'), null, '编辑页二次单击只选图片');
    await page.click('svg image', { clickCount: 2, delay: 50 });
    await page.waitForSelector('.km-image-viewer');
    assert.notStrictEqual(await page.$('.mindmap-image-resize-handle'), null, '双击看大图时保持图片选中');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.km-image-viewer', { hidden: true });
    const before = await page.evaluate(() => window.editor.minder.getRoot().children[0].getData('imageSize'));
    const handle = await page.$('.mindmap-image-resize-handle');
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(width => window.editor.minder.getRoot().children[0].getData('imageSize').width > width, {}, before.width);
    await page.keyboard.press('Backspace');
    const after = await page.evaluate(() => {
      const node = window.editor.minder.getRoot().children[0];
      return { children: window.editor.minder.getRoot().children.length, text: node.getText(), image: node.getData('image') };
    });
    assert.deepStrictEqual(after, { children: 1, text: '节点文字保留', image: null }, 'Backspace 仅删除选中图片');
    console.log('image-selection: pass');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
