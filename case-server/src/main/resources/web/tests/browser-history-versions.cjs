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
    if (request.url.startsWith('/api/backup/getCurrentCaseDiff')) {
      response.setHeader('Content-Type', 'application/json');
      response.end(json({
        content: { base: 2, template: 'right', root: { data: { text: '版本比较结果' }, children: [
          { data: { id: 'branch', text: '分支' }, children: [
            { data: { id: 'leaf-a', text: '叶子 A', background: '#ddfade' }, children: [] },
            { data: { id: 'leaf-b', text: '叶子 B', background: '#d6f0ff' }, children: [] },
          ] },
        ] } },
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
    assert.strictEqual(await page.$$eval('.ant-table-tbody .ant-checkbox-checked', boxes => boxes.length), 1);
    await page.evaluate(() => Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent.includes('与当前版本对比')).click());
    await page.waitForFunction(() => location.pathname.includes('/currentContrast/'));
    await page.waitForFunction(() => document.body.textContent.includes('版本比较结果'));
    await page.waitForSelector('.comparison-legend button');
    assert(await page.evaluate(() => document.body.textContent.includes('当前版本')), '当前版本标识可见');
    assert(await page.evaluate(() => Array.from(document.querySelectorAll('svg text'))
      .some(node => node.textContent.includes('版本比较结果') && node.childElementCount === 0)));
    const textPosition = () => page.evaluate(() => {
      const node = Array.from(document.querySelectorAll('svg text'))
        .find(item => item.textContent.includes('版本比较结果'));
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
    const beforePan = await textPosition();
    await page.mouse.move(250, 350);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(330, 380, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
    const afterPan = await textPosition();
    assert(Math.abs(afterPan.x - beforePan.x) > 20, '中键拖动移动脑图');
    assert.strictEqual(await page.$$eval('.comparison-legend button', buttons => buttons.length), 4,
      '图例直接提供全部、新增、删除和内容变更四个筛选项');
    await page.click('.comparison-legend button:nth-child(2)');
    await page.waitForFunction(() => document.querySelector('.comparison-legend button.active').textContent.replace(/\s/g, '') === '新增');
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('svg text'))
      .some(node => node.textContent.includes('叶子 B')));
    assert(await page.evaluate(() => Array.from(document.querySelectorAll('svg text'))
      .some(node => node.textContent.includes('叶子 A'))), '新增筛选保留匹配节点');
    await page.click('.comparison-legend button:nth-child(1)');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('svg text'))
      .some(node => node.textContent.includes('叶子 B')));
    await page.evaluate(() => document.querySelector('.comparison-summary-toggle button').click());
    assert.strictEqual(await page.$('.box_title'), null, '折叠后隐藏版本和图例');
    await page.evaluate(() => document.querySelector('.comparison-summary-toggle button').click());
    await page.waitForSelector('.box_title');
    const editorFound = await page.evaluate(() => {
      const wrapper = document.querySelector('.edit-input');
      const fiberKey = Object.keys(wrapper).find(key => key.startsWith('__reactInternalInstance'));
      let fiber = wrapper[fiberKey];
      while (fiber && !(fiber.stateNode && fiber.stateNode.handleShowInput)) fiber = fiber.return;
      if (!fiber) return false;
      window.__browserTestEditor = fiber.stateNode;
      const editor = fiber.stateNode;
      editor.minder.setStatus('normal');
      editor.minder.select([editor.minder.getRoot()], true);
      editor.handleShowInput();
      return true;
    });
    assert(editorFound, '浏览器找到实际脑图编辑组件');
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    const editMetrics = await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      const group = editor.minder.getRoot().getRenderer('TextRenderer').getRenderShape().node;
      const text = group.querySelector('text');
      const textarea = document.querySelector('.edit-input textarea');
      const textRect = group.getBoundingClientRect();
      const inputRect = textarea.getBoundingClientRect();
      return {
        expectedFont: parseFloat(getComputedStyle(text).fontSize) * textRect.width / group.getBBox().width,
        actualFont: parseFloat(getComputedStyle(textarea).fontSize),
        deltaLeft: Math.abs(textRect.left - inputRect.left),
        deltaTop: Math.abs(textRect.top - inputRect.top),
      };
    });
    assert(Math.abs(editMetrics.expectedFont - editMetrics.actualFont) < 1,
      `编辑文字不缩小：${JSON.stringify(editMetrics)}`);
    assert(editMetrics.deltaLeft < 4 && editMetrics.deltaTop < 4,
      `编辑框覆盖原文字位置：${JSON.stringify(editMetrics)}`);
    const editBorderDiagnostics = await page.evaluate(() => {
      const node = window.__browserTestEditor.minder.getRoot();
      const wrapper = document.querySelector('.edit-input');
      const textarea = wrapper.querySelector('textarea');
      const shape = node.getRenderer('TextRenderer').getRenderShape().node;
      const bounds = value => { const rect = value.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }; };
      return { editor: bounds(wrapper), input: bounds(textarea), text: bounds(shape),
        background: getComputedStyle(textarea).backgroundColor,
        nodeBox: node.getRenderBox(), rendererNames: Object.keys(node._renderers || {}) };
    });
    assert(editBorderDiagnostics.input.bottom <= editBorderDiagnostics.editor.bottom + 1,
      `编辑输入框不能盖住节点下边框：${JSON.stringify(editBorderDiagnostics)}`);
    const collapsedCount = await page.evaluate(() => {
      const minder = window.__browserTestEditor.minder;
      const branch = minder.getRoot().getChildren()[0];
      branch.collapse();
      minder.layout();
      return branch.expanderRenderer.expander.count.getContent();
    });
    assert.strictEqual(collapsedCount, '2', '折叠后显示末级节点数量');
    const overflowCount = await page.evaluate(() => {
      const branch = window.__browserTestEditor.minder.getRoot().getChildren()[0];
      branch._collapsedLeafCount = 100;
      branch.expanderRenderer.expander.setState('collapse', branch);
      return branch.expanderRenderer.expander.count.getContent();
    });
    assert.strictEqual(overflowCount, '...', '超过 99 个末级节点显示省略号');
    const themeMetrics = await page.evaluate(() => {
      const minder = window.__browserTestEditor.minder;
      minder.setTheme('byte-blue');
      const baseline = { size: minder.getStyle('main-font-size'), padding: minder.getStyle('main-padding') };
      minder.setTheme('classic');
      const classic = { size: minder.getStyle('main-font-size'), padding: minder.getStyle('main-padding') };
      minder.setTheme('ink-black');
      const ink = { size: minder.getStyle('main-font-size'), padding: minder.getStyle('main-padding'),
        text: minder.getStyle('main-color'), line: minder.getStyle('connect-color'),
        border: minder.getStyle('main-stroke') };
      const branch = minder.getRoot().getChildren()[0];
      branch.collapse();
      minder.layout();
      const expander = branch.expanderRenderer.expander;
      ink.expander = {
        outline: expander.outline.node.getAttribute('stroke'),
        count: expander.count.node.getAttribute('fill'),
      };
      return { baseline, classic, ink };
    });
    assert.deepStrictEqual(themeMetrics.classic, themeMetrics.baseline, '普通主题不改变节点字体和边距');
    assert.strictEqual(themeMetrics.ink.text, '#111827');
    assert.strictEqual(themeMetrics.ink.line, '#111827');
    assert.strictEqual(themeMetrics.ink.border, '#cbd5e1', '经典黑节点边框改为浅灰');
    assert.deepStrictEqual(themeMetrics.ink.expander, { outline: '#111827', count: '#111827' },
      '经典黑的折叠按钮与末级节点数量使用黑色');
    const queuedSave = await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      const sends = [];
      const original = { ws: editor.ws, readOnly: editor.props.readOnly, base: editor.minder.getBase() };
      window.minderData = { right: 1 };
      editor.ws = { sendMessage: (kind, payload) => sends.push({ kind, payload }) };
      editor.props.readOnly = false;
      editor.expectedBase = original.base + 1;
      editor.saveCurrentCase(true);
      const beforeAck = sends.length;
      editor.minder.setBase(original.base + 1);
      editor.handleEditAck();
      const afterAck = sends.map(send => send.kind);
      editor.ws = original.ws;
      editor.props.readOnly = original.readOnly;
      editor.minder.setBase(original.base);
      return { beforeAck, afterAck, savedRight: JSON.parse(sends[0].payload.caseContent).right };
    });
    assert.strictEqual(queuedSave.beforeAck, 0, '编辑版本未确认前不抢先保存');
    assert.deepStrictEqual(queuedSave.afterAck, ['save'], '编辑版本确认后再手动保存外观');
    assert.strictEqual(queuedSave.savedRight, 1, '保存快照保留编辑补丁中的方向字段');
    await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      editor.props.readOnly = false;
      editor.setState({ showEdit: false, inputContent: null });
      editor.minder.select(editor.minder.getRoot(), true);
      editor.handleKeyDown({ keyCode: 9, target: document.body, preventDefault() {} });
    });
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    await page.type('.edit-input textarea', '222');
    await page.keyboard.press('Enter');
    const newBranchText = await page.evaluate(() => window.__browserTestEditor.minder.getSelectedNode().getText());
    assert.strictEqual(newBranchText, '222', '新建分支输入后不保留默认的分支主题文字');
    await page.screenshot({ path: path.join(root, '运行日志/历史版本浏览器验证/版本对比.png') });
    await page.evaluate(() => Array.from(document.querySelectorAll('.history-navigation button'))
      .find(button => button.textContent.trim() === '返回').click());
    await page.waitForFunction(() => location.pathname === '/case/caseList/1');
    console.log('browser-history-versions: pass');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
