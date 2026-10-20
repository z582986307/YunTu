const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const puppeteer = require(path.join(root, '项目依赖/YunTu-Web/node_modules/puppeteer-core'));
const bundle = path.join(root, '运行日志/脑图性能/editor-build/editor.js');

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === '/editor.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(bundle));
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><meta charset="utf-8"><div id="map" style="height:800px"></div><script src="/editor.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const browserData = path.join(root, '运行日志/输入法节点切换验证', `chrome-${process.pid}`);
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
      window.editor = await window.mountTestEditor({ template: 'right', root: {
        data: { id: 'root', text: '中心' }, children: [
          { data: { id: 'a', text: '原节点A' }, children: [] },
          { data: { id: 'b', text: '原节点B' }, children: [] },
        ],
      } }, false);
    });
    await page.waitForFunction(() => window.editor && window.editor.minder.getRoot().children.length === 2);
    await page.waitForTimeout(500);
    const clickNode = async id => {
      const point = await page.evaluate(nodeId => {
        const node = window.editor.minder.getRoot().children.find(child => child.getData('id') === nodeId);
        const rect = node.getRenderer('TextRenderer').getRenderShape().node.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }, id);
      await page.mouse.click(point.x, point.y);
      const selected = await page.evaluate(({ x, y }) => ({
        id: window.editor.minder.getSelectedNode()?.getData('id'),
        hit: document.elementFromPoint(x, y)?.tagName,
      }), point);
      assert.strictEqual(selected.id, id,
        `点击节点 ${id} 后应选中：${JSON.stringify({ point, selected })}`);
    };
    await clickNode('a');
    const ready = await page.evaluate(() => {
      const input = document.querySelector('.edit-input textarea');
      return { focused: document.activeElement === input,
        prepared: getComputedStyle(input).display !== 'none' && input.value === '',
        editorOpen: window.editor.state.showEdit };
    });
    assert.deepStrictEqual(ready, { focused: true, prepared: true, editorOpen: false },
      `选中节点即准备接收第一段拼音：${JSON.stringify(ready)}`);

    const ime = await page.target().createCDPSession();
    await ime.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
    await page.waitForFunction(() => window.editor.state.showEdit);
    const composing = await page.evaluate(() => ({
      value: document.querySelector('.edit-input textarea').value,
      active: document.activeElement === document.querySelector('.edit-input textarea'),
      composing: window.editor.composing,
      original: window.editor.minder.getRoot().children[0].getText(),
    }));
    assert.deepStrictEqual(composing,
      { value: 'ni', active: true, composing: true, original: '原节点A' },
      `首个拼音应显示在输入法组词中，节点原文未改：${JSON.stringify(composing)}`);
    await clickNode('b');
    await page.waitForFunction(() => !window.editor.state.showEdit);
    assert.strictEqual(await page.evaluate(() => window.editor.minder.getRoot().children[0].getText()), '原节点A',
      '未确认选词就点击其他节点，不能把拼音保存到节点A');

    await clickNode('a');
    await ime.send('Input.imeSetComposition', { text: 'bbb', selectionStart: 3, selectionEnd: 3 });
    await page.evaluate(() => {
      const input = document.querySelector('.edit-input textarea');
      input.dispatchEvent(new CompositionEvent('compositionend', { data: 'bbb', bubbles: true }));
    });
    await page.waitForFunction(() => !window.editor.composing);
    await clickNode('b');
    await page.waitForFunction(() => !window.editor.state.showEdit);
    assert.strictEqual(await page.evaluate(() => window.editor.minder.getRoot().children[0].getText()), '原节点A',
      '输入法在点击前结束组词但没有确认选词时，原节点仍不能被原始拼音覆盖');

    await clickNode('a');
    await ime.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
    await ime.send('Input.insertText', { text: '你' });
    await clickNode('b');
    await page.waitForFunction(() => !window.editor.state.showEdit);
    assert.strictEqual(await page.evaluate(() => window.editor.minder.getRoot().children[0].getText()), '你',
      '确认选词后的中文在切换节点时正常保存');
    const beforeUndo = await page.evaluate(() => {
      const editor = window.editor;
      editor.minder.select([editor.minder.getRoot()], true);
      editor.minder.execCommand('AppendChildNode', '临时节点');
      return editor.minder.getRoot().children.length;
    });
    await page.keyboard.down('Control');
    await page.keyboard.press('z');
    await page.keyboard.up('Control');
    assert.strictEqual(await page.evaluate(() => window.editor.minder.getRoot().children.length), beforeUndo - 1,
      '隐藏输入框接收首个拼音时，Ctrl+Z 仍应撤销节点操作');
    await clickNode('a');
    await page.keyboard.type('x');
    assert.deepStrictEqual(await page.evaluate(() => ({
      editing: window.editor.state.showEdit,
      input: document.querySelector('.edit-input textarea').value,
      original: window.editor.minder.getRoot().children[0].getText(),
    })), { editing: true, input: 'x', original: '你' },
    '预备输入框仍支持单击节点后直接输入普通文字，回车前不改原节点');
    console.log('browser-ime-node-switch: pass');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
