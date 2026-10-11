const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const deps = path.join(root, '项目依赖/YunTu-Web/node_modules');
const puppeteer = require(path.join(deps, 'puppeteer-core'));
const editor = path.resolve(__dirname, '../src/components/react-mindmap-editor');
const output = path.join(root, '运行日志/脑图性能/editor-build/editor.js');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#3370ff"/></svg>';

async function main() {
  let uploadCount = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/editor.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(fs.readFileSync(output));
    } else if (request.url === '/sample.svg' || /^\/upload-\d+\.svg$/.test(request.url)) {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end(svg);
    } else if (request.url === '/api/file/uploadAttachment') {
      uploadCount += 1;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ success: 1, data: [{ url: `http://127.0.0.1:${server.address().port}/upload-${uploadCount}.svg` }] }));
    } else {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}#map{height:900px}</style><div id="map"></div><script src="/editor.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const browserData = path.join(root, '运行日志/脑图性能', `chrome-image-${process.pid}`);
    fs.mkdirSync(path.dirname(browserData), { recursive: true });
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: browserData,
      defaultViewport: { width: 1280, height: 900 },
      args: ['--disable-extensions', '--no-first-run'],
    });
    const page = await browser.newPage();
    page.on('pageerror', error => console.error('页面异常：', error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    await page.evaluate(async () => {
      const data = { template: 'right', root: { data: { text: '根节点' }, children: [{ data: { text: '待插图用例', image: '/sample.svg', imageSize: { width: 24, height: 24 } }, children: [] }] } };
      const instance = await window.mountTestEditor(data, true, { width: '100%', height: '900px' }, true);
      window.testEditor = instance;
      window.testMinder = instance.minder;
    });
    await page.waitForFunction(() => window.testMinder && window.testMinder.getRoot().children.length === 1, { timeout: 15000 });
    const rootOffset = await page.evaluate(() => {
      const canvas = document.querySelector('.kityminder-core-container').getBoundingClientRect();
      const rootBox = window.testMinder.getRoot().getRenderContainer().getRenderBox('screen');
      return { x: Math.round(rootBox.cx - (canvas.left + canvas.width / 2)), y: Math.round(rootBox.cy - (canvas.top + canvas.height / 2)) };
    });
    assert.ok(Math.abs(rootOffset.x) <= 24 && Math.abs(rootOffset.y) <= 24,
      `刷新后中心主题应位于画布中央，实际偏移 ${JSON.stringify(rootOffset)}`);
    await page.waitForSelector('svg image');
    await page.waitForFunction(() => document.querySelector('svg image').getBoundingClientRect().width > 0, { timeout: 10000 });
    await page.waitForTimeout(700);
    await page.click('svg image');
    await page.waitForSelector('.km-image-viewer');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.km-image-viewer', { hidden: true });
    await page.evaluate(() => window.testMinder.select(window.testMinder.getRoot().children[0], true));
    const gap = await page.evaluate(() => {
      const core = document.querySelector('.kityminder-core-container').getBoundingClientRect();
      const panel = document.querySelector('.execution-filter-panel').getBoundingClientRect();
      return Math.round(panel.top - core.top);
    });
    assert.strictEqual(gap, 16, `筛选悬浮框距画布顶部 ${gap}px`);

    const togglePosition = async (panel, rail) => {
      const expandedY = await page.$eval(`${panel} .execution-panel-collapse-handle`, element => {
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      await page.click(`${panel} .execution-panel-collapse-handle`);
      assert.strictEqual(await page.$eval(`${panel}.execution-panel-hidden`, element => getComputedStyle(element).pointerEvents), 'none');
      const collapsedY = await page.$eval(rail, element => {
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      assert.ok(Math.abs(expandedY - collapsedY) <= 1, `${rail} 收起后偏移 ${collapsedY - expandedY}px`);
      return { expandedY, collapsedY };
    };
    const filterPosition = await togglePosition('.execution-filter-panel', '.execution-filter-rail');
    const resultPosition = await togglePosition('.execution-result-panel', '.execution-result-rail');
    assert.ok(resultPosition.collapsedY - filterPosition.collapsedY >= 40, '两个收起入口不得重叠');
    await page.click('.execution-filter-rail');
    await page.click('.execution-result-rail');
    await page.setViewport({ width: 800, height: 600 });
    const narrowFilter = await togglePosition('.execution-filter-panel', '.execution-filter-rail');
    const narrowResult = await togglePosition('.execution-result-panel', '.execution-result-rail');
    assert.ok(narrowResult.collapsedY - narrowFilter.collapsedY >= 40, '窄屏收起入口不得重叠');
    await page.click('.execution-filter-rail');
    await page.click('.execution-result-rail');
    await page.setViewport({ width: 1280, height: 900 });
    assert.strictEqual(await page.$('button[aria-label="插入图片"]'), null, '任务页不应有插入图片入口');
    assert.strictEqual(await page.$eval('button[aria-label="撤销"]', button => button.title), '撤销（Ctrl+Z）');
    assert.strictEqual(await page.$eval('button[aria-label="重做"]', button => button.title), '重做（Ctrl+Y）');
    await page.click('.execution-result-panel .execution-result-button.success');
    await page.waitForFunction(() => window.testMinder.getRoot().children[0].getData('progress') === 9);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, keyCode: 90 })));
    await page.waitForFunction(() => !window.testMinder.getRoot().children[0].getData('progress'));
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, keyCode: 89 })));
    await page.waitForFunction(() => window.testMinder.getRoot().children[0].getData('progress') === 9);
    const beforeNoteHeight = await page.evaluate(() => window.testMinder.getRoot().children[0].getRenderBox().height);
    await page.type('.execution-result-panel textarea', '本次执行备注');
    await page.click('.execution-result-panel .execution-panel-footer button');
    await page.waitForFunction(() => window.testMinder.getRoot().children[0].getData('note') === '本次执行备注');
    const afterNoteHeight = await page.evaluate(() => window.testMinder.getRoot().children[0].getRenderBox().height);
    assert.strictEqual(afterNoteHeight, beforeNoteHeight, '保存执行备注不能撑高节点');
    await page.evaluate(async () => {
      window.unmountTestEditor();
      const data = { template: 'right', root: { data: { text: '根节点' }, children: [{ data: { text: '待插图用例' }, children: [] }] } };
      window.testEditor = await window.mountTestEditor(data, false);
      window.testMinder = window.testEditor.minder;
      window.testEditor.setState({ showToolBar: true });
    });
    await page.waitForFunction(() => window.testMinder && window.testMinder.getRoot().children.length === 1);
    await page.evaluate(() => window.testMinder.select(window.testMinder.getRoot().children[0], true));
    const saveProbe = await page.evaluate(async () => {
      const sent = [];
      window.testEditor.ws.sendMessage = (type, payload) => sent.push({ type, payload });
      window.testMinder.getRoot().children[0].setText('已修改用例');
      window.testMinder.fire('contentchange');
      await new Promise(resolve => setTimeout(resolve, 1800));
      const autoSave = sent.filter(item => item.type === 'autosave').length;
      window.testEditor.onButtonSave();
      return { autoSave, manualSave: sent.filter(item => item.type === 'save').length };
    });
    assert.deepStrictEqual(saveProbe, { autoSave: 1, manualSave: 1 }, '编辑后应自动保存，按钮应立即手动保存');
    const openImageModal = async () => {
      await page.click('button[aria-label="插入图片"]');
    };

    await openImageModal();
    await page.waitForSelector('.yuntu-modal [aria-label="上传图片"]');
    assert.strictEqual(await page.$('.yuntu-modal input[placeholder^="必填"]'), null);
    await page.type('.yuntu-modal input[placeholder^="选填"]', 'a'.repeat(205));
    assert.strictEqual(await page.$eval('.yuntu-modal input[placeholder^="选填"]', input => input.value.length), 200);
    assert.ok((await page.$eval('.yuntu-modal', element => element.innerText)).includes('0/200'));
    const input = await page.$('.yuntu-modal input[type="file"]');
    await input.uploadFile(path.join(root, 'case-server/src/main/resources/web/dist/favicon.svg'));
    await page.waitForFunction(url => document.querySelector('.yuntu-modal [aria-label="图片预览"]')?.src === url, {}, `${origin}/upload-1.svg`);
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]');
    await page.waitForSelector('.yuntu-modal [aria-label="删除已选图片"]:not([disabled])');
    assert.strictEqual(await page.$eval('.yuntu-modal [aria-label="删除已选图片"]', button => button.textContent.trim()), '');
    assert.strictEqual(await page.$eval('.yuntu-modal [aria-label="删除已选图片"]', button => getComputedStyle(button).position), 'absolute');
    await page.waitForFunction(() => document.querySelector('.yuntu-modal [aria-label="删除已选图片"]')?.getBoundingClientRect().width >= 25);
    await page.click('.yuntu-modal [aria-label="删除已选图片"]');
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]', { hidden: true });
    const retryInput = await page.$('.yuntu-modal input[type="file"]');
    await retryInput.uploadFile(path.join(root, 'case-server/src/main/resources/web/dist/favicon.svg'));
    await page.waitForFunction(url => document.querySelector('.yuntu-modal [aria-label="图片预览"]')?.src === url, {}, `${origin}/upload-2.svg`);
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]');
    await page.waitForSelector('.yuntu-modal .ant-modal-footer .ant-btn-primary:not([disabled])');
    await page.waitForTimeout(400);
    await page.click('.yuntu-modal .ant-modal-footer .ant-btn-primary');
    await page.waitForFunction(url => window.testMinder.getRoot().children[0].getData('image') === url, {}, `${origin}/upload-2.svg`);
    await page.waitForSelector('.yuntu-modal', { hidden: true });

    await openImageModal();
    await page.waitForSelector('.yuntu-modal [aria-label="粘贴图片"]');
    await page.evaluate(source => {
      const file = new File([source], 'pasted.svg', { type: 'image/svg+xml' });
      const clipboardData = new DataTransfer();
      clipboardData.items.add(file);
      document.querySelector('[aria-label="粘贴图片"]').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    }, svg);
    await page.waitForFunction(url => document.querySelector('.yuntu-modal [aria-label="图片预览"]')?.src === url, {}, `${origin}/upload-3.svg`);
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]');
    await page.waitForSelector('.yuntu-modal [aria-label="删除已选图片"]:not([disabled])');
    await page.waitForFunction(() => document.querySelector('.yuntu-modal [aria-label="删除已选图片"]')?.getBoundingClientRect().width >= 25);
    await page.click('.yuntu-modal [aria-label="删除已选图片"]');
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]', { hidden: true });
    await page.evaluate(source => {
      const file = new File([source], 'pasted-again.svg', { type: 'image/svg+xml' });
      const clipboardData = new DataTransfer();
      clipboardData.items.add(file);
      document.querySelector('[aria-label="粘贴图片"]').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    }, svg);
    await page.waitForFunction(url => document.querySelector('.yuntu-modal [aria-label="图片预览"]')?.src === url, {}, `${origin}/upload-4.svg`);
    await page.waitForSelector('.yuntu-modal [aria-label="图片预览"]');
    await page.waitForSelector('.yuntu-modal .ant-modal-footer .ant-btn-primary:not([disabled])');
    await page.waitForTimeout(400);
    await page.click('.yuntu-modal .ant-modal-footer .ant-btn-primary');
    await page.waitForFunction(url => window.testMinder.getRoot().children[0].getData('image') === url, {}, `${origin}/upload-4.svg`);
    await page.waitForSelector('.yuntu-modal', { hidden: true });
    await page.waitForSelector('svg image');
    await page.click('svg image');
    await page.waitForSelector('.km-image-viewer');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.km-image-viewer', { hidden: true });
    assert.strictEqual(uploadCount, 4);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'Process', keyCode: 229,
    })));
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    assert.strictEqual(await page.$eval('.edit-input:not(.hide)', input => getComputedStyle(input).opacity), '0', '单击输入法组词期间不得回显编辑框');
    await page.evaluate(() => document.querySelector('.edit-input textarea').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    assert.strictEqual(await page.evaluate(() => window.testMinder.getRoot().children[0].getText()), '已修改用例', '取消输入法选词不应清空节点');
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'Process', keyCode: 229,
    })));
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    assert.strictEqual(await page.$eval('.edit-input textarea', input => input.value), '', '直接输入应先清空原文字');
    await page.focus('.edit-input textarea');
    await page.evaluate(() => document.querySelector('.edit-input textarea').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    await page.keyboard.type('你坐什么');
    await page.evaluate(() => document.querySelector('.edit-input textarea').dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'Enter', keyCode: 13, isComposing: true,
    })));
    assert.ok(await page.$('.edit-input:not(.hide) textarea'), '输入法选词的 Enter 不应结束编辑');
    await page.evaluate(() => document.querySelector('.edit-input textarea').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await page.waitForFunction(() => window.testMinder.getRoot().children[0].getText() === '你坐什么');
    await page.waitForSelector('.edit-input:not(.hide) textarea', { hidden: true });
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: '新', keyCode: 0,
    })));
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    assert.strictEqual(await page.$eval('.edit-input textarea', input => input.value), '新');
    await page.focus('.edit-input textarea');
    await page.keyboard.type('名字');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.testMinder.getRoot().children[0].getText() === '新名字');
    await page.evaluate(() => window.testEditor.handleShowInput());
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    const editAppearance = await page.$eval('.edit-input:not(.hide) textarea', input => ({
      resize: getComputedStyle(input).resize,
      border: getComputedStyle(input).borderWidth,
      shadow: getComputedStyle(input.parentElement).boxShadow,
    }));
    assert.deepStrictEqual(editAppearance, { resize: 'none', border: '0px', shadow: 'none' }, '双击应在节点内无框编辑');
    const editState = await page.$eval('.edit-input:not(.hide) textarea', input => ({
      width: input.getBoundingClientRect().width,
      caret: input.selectionStart,
      textLength: input.value.length,
    }));
    assert.ok(editState.width < 300, `编辑框不应被撑到 ${editState.width}px`);
    assert.strictEqual(editState.caret, editState.textLength, '编辑光标应位于文字末尾');
    await page.evaluate(source => {
      const file = new File([source], 'node-paste.svg', { type: 'image/svg+xml' });
      const data = new DataTransfer();
      data.items.add(file);
      document.querySelector('.edit-input textarea').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    }, svg);
    await page.waitForFunction(previous => {
      const image = document.querySelector('.yuntu-modal [aria-label="图片预览"]');
      return image && image.src !== previous;
    }, {}, `${origin}/upload-4.svg`);
    const directPasteUrl = await page.$eval('.yuntu-modal [aria-label="图片预览"]', image => image.src);
    assert.notStrictEqual(await page.evaluate(() => window.testMinder.getRoot().children[0].getData('image')), directPasteUrl, '确认前不应改变节点图片');
    await page.waitForSelector('.yuntu-modal .ant-modal-footer .ant-btn-primary:not([disabled])');
    await page.waitForTimeout(400);
    await page.click('.yuntu-modal .ant-modal-footer .ant-btn-primary');
    await page.waitForFunction(url => window.testMinder.getRoot().children[0].getData('image') === url, {}, directPasteUrl);
    await page.waitForSelector('.yuntu-modal', { hidden: true });
    assert.strictEqual(await page.$eval('.edit-input textarea', input => input.value), '新名字');
    await page.evaluate(() => {
      window.showEdit = false;
      window.testEditor.setState({ showEdit: false, inputContent: null });
    });
    await page.hover('svg image');
    await page.waitForSelector('button[aria-label="删除节点图片"]');
    await page.click('button[aria-label="删除节点图片"]');
    await page.waitForFunction(() => !window.testMinder.getRoot().children[0].getData('image'));
    await page.waitForSelector('svg image', { hidden: true });
    await page.evaluate(source => {
      const file = new File([source], 'selected-paste.svg', { type: 'image/svg+xml' });
      const data = new DataTransfer();
      data.items.add(file);
      document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    }, svg);
    await page.waitForFunction(previous => {
      const image = document.querySelector('.yuntu-modal [aria-label="图片预览"]');
      return image && image.src !== previous;
    }, {}, directPasteUrl);
    const selectedPasteUrl = await page.$eval('.yuntu-modal [aria-label="图片预览"]', image => image.src);
    await page.waitForSelector('.yuntu-modal .ant-modal-footer .ant-btn-primary:not([disabled])');
    await page.waitForTimeout(400);
    await page.click('.yuntu-modal .ant-modal-footer .ant-btn-primary');
    await page.waitForFunction(url => window.testMinder.getRoot().children[0].getData('image') === url, {}, selectedPasteUrl);
    await page.waitForSelector('.yuntu-modal', { hidden: true });
    await page.evaluate(() => window.testMinder.execCommand('AppendChildNode', '新增主题'));
    await page.waitForFunction(() => window.testMinder.getRoot().children[0].children.length === 1);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, keyCode: 90 })));
    await page.waitForFunction(() => window.testMinder.getRoot().children[0].children.length === 0);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, keyCode: 89 })));
    await page.waitForFunction(() => window.testMinder.getRoot().children[0].children.length === 1);
    console.log(JSON.stringify({ floatingGapPx: gap, localUpload: true, clipboardPaste: true, deleteAndRetry: true }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
