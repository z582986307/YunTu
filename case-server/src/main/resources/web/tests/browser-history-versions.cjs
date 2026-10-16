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
    const panStart = await page.$eval('.kityminder-core-container', canvas => {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + rect.width * 0.7, y: rect.top + Math.min(80, rect.height / 2) };
    });
    await page.mouse.move(panStart.x, panStart.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(panStart.x + 80, panStart.y + 30, { steps: 8 });
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
    await page.type('.edit-input textarea', '2');
    const typingDisplay = await page.evaluate(() => {
      const wrapper = document.querySelector('.edit-input');
      const textarea = wrapper.querySelector('textarea');
      return { text: textarea.value, opacity: Number(getComputedStyle(wrapper).opacity) };
    });
    assert.deepStrictEqual(typingDisplay, { text: '2', opacity: 1 }, '新建分支输入时立即显示正在输入的文字');
    await page.type('.edit-input textarea', '22');
    await page.keyboard.press('Enter');
    const newBranchText = await page.evaluate(() => window.__browserTestEditor.minder.getSelectedNode().getText());
    assert.strictEqual(newBranchText, '222', '新建分支输入后不保留默认的分支主题文字');
    await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      editor.minder.select(editor.minder.getSelectedNode(), true);
      editor.handleKeyDown({ key: '9', keyCode: 57, target: document.body, preventDefault() {} });
    });
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    const selectedNodeTyping = await page.evaluate(() => {
      const wrapper = document.querySelector('.edit-input');
      return { text: wrapper.querySelector('textarea').value, opacity: Number(getComputedStyle(wrapper).opacity) };
    });
    assert.deepStrictEqual(selectedNodeTyping, { text: '9', opacity: 1 }, '单击选中节点后直接输入也实时显示文字');
    const typingAlignment = await page.evaluate(() => {
      const node = window.__browserTestEditor.minder.getSelectedNode();
      const shape = node.getRenderer('TextRenderer').getRenderShape().node;
      const textarea = document.querySelector('.edit-input textarea');
      const wrapper = textarea.parentElement;
      return {
        textRise: wrapper.getBoundingClientRect().top - textarea.getBoundingClientRect().top,
        sameFont: getComputedStyle(textarea).fontFamily === getComputedStyle(shape.querySelector('text')).fontFamily,
        wrapperBackground: getComputedStyle(wrapper).backgroundColor,
        inputBackground: getComputedStyle(textarea).backgroundColor,
      };
    });
    assert(typingAlignment.textRise >= 2 && typingAlignment.textRise <= 4,
      `输入文字应位于节点文字基线：${JSON.stringify(typingAlignment)}`);
    assert(typingAlignment.sameFont, '输入文字与节点文字使用同一字体');
    assert.notStrictEqual(typingAlignment.wrapperBackground, 'rgba(0, 0, 0, 0)', '输入框遮住旧节点文字');
    assert.strictEqual(typingAlignment.inputBackground, 'rgba(0, 0, 0, 0)', '上移文字不遮挡节点边框');
    await page.screenshot({ path: path.join(root, '运行日志/历史版本浏览器验证/输入时位置.png') });
    await page.type('.edit-input textarea', '8');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => window.__browserTestEditor.minder.getSelectedNode().getText()), '98',
      '单击选中节点后输入的新文字覆盖原文字');
    const compose = async text => page.evaluate(value => {
      const input = document.querySelector('.edit-input:not(.hide) textarea');
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: value }));
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, input.value + value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: value }));
    }, text);
    await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      editor.minder.select(editor.minder.getSelectedNode(), true);
      editor.handleKeyDown({ key: 'Process', keyCode: 229, target: document.body, preventDefault() {} });
    });
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    await compose('你');
    const firstCandidate = await page.evaluate(() => {
      const input = document.querySelector('.edit-input:not(.hide) textarea');
      return { value: input && input.value, focused: document.activeElement === input,
        caret: input && input.selectionStart, editorOpen: window.__browserTestEditor.state.showEdit };
    });
    assert.deepStrictEqual(firstCandidate, { value: '你', focused: true, caret: 1, editorOpen: true },
      `选中旧节点后首次选词不提交，光标停在新文字末尾：${JSON.stringify(firstCandidate)}`);
    const sogouEnterOrder = await page.evaluate(() => {
      const input = document.querySelector('.edit-input:not(.hide) textarea');
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 }));
      const candidateEnter = new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'Enter', keyCode: 13,
      });
      input.dispatchEvent(candidateEnter);
      return { open: window.__browserTestEditor.state.showEdit,
        value: input.value, prevented: candidateEnter.defaultPrevented };
    });
    assert.deepStrictEqual(sogouEnterOrder, { open: true, value: '你', prevented: true },
      `输入法选词结束后的 Enter 抬起不能让随后补发的 Enter 提交节点：${JSON.stringify(sogouEnterOrder)}`);
    const candidateDefaultPrevented = await page.evaluate(() => {
      const input = document.querySelector('.edit-input textarea');
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13 });
      input.dispatchEvent(event);
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      return event.defaultPrevented;
    });
    assert.strictEqual(candidateDefaultPrevented, false, '正在组词时的回车仍允许浏览器完成选词');
    await compose('好');
    assert.strictEqual(await page.$eval('.edit-input:not(.hide) textarea', input => input.value), '你好',
      '第二次选词接在首次选词之后');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.$eval('.edit-input:not(.hide) textarea', input => input.value), '你好',
      '输入法选词产生的回车不能提前结束编辑');
    for (const character of ['世', '界', '啊']) {
      await compose(character);
      await page.evaluate(() => document.querySelector('.edit-input textarea')
        .dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ', keyCode: 32 })));
    }
    assert.strictEqual(await page.$eval('.edit-input:not(.hide) textarea', input => input.value), '你好世界啊',
      '连续五次选词始终追加文字');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => window.__browserTestEditor.minder.getSelectedNode().getText()), '你好世界啊',
      '选词后再按回车才提交旧节点的新文字');
    await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      editor.handleKeyDown({ key: '再', keyCode: 0, target: document.body, preventDefault() {} });
    });
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    assert.strictEqual(await page.$eval('.edit-input textarea', input => input.value), '再',
      '明确回车提交后，下次直接输入重新替换节点文字');
    await page.keyboard.press('Enter');
    await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      editor.handleKeyDown({ keyCode: 9, target: document.body, preventDefault() {} });
    });
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    await compose('新');
    const newNodeCandidateOrder = await page.evaluate(() => {
      const input = document.querySelector('.edit-input:not(.hide) textarea');
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 }));
      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'Enter', keyCode: 13,
      }));
      return { open: window.__browserTestEditor.state.showEdit, value: input.value };
    });
    assert.deepStrictEqual(newNodeCandidateOrder, { open: true, value: '新' },
      `新建节点选词后的补发 Enter 也不能提前提交：${JSON.stringify(newNodeCandidateOrder)}`);
    await compose('增');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    for (const character of ['节', '点', '啊']) {
      await compose(character);
      await page.evaluate(() => document.querySelector('.edit-input textarea')
        .dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ', keyCode: 32 })));
    }
    assert.strictEqual(await page.$eval('.edit-input:not(.hide) textarea', input => input.value), '新增节点啊',
      '新建节点连续五次选词也追加而不覆盖');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => window.__browserTestEditor.minder.getSelectedNode().getText()), '新增节点啊',
      '新建节点回车后才写入文字');
    await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      editor.minder.select(editor.minder.getRoot(), true);
    });
    await page.evaluate(() => window.__browserTestEditor.handleKeyDown({
      key: 'Process', keyCode: 229, target: document.body, preventDefault() {},
    }));
    await page.waitForSelector('.edit-input:not(.hide) textarea');
    const imeClient = await page.target().createCDPSession();
    for (const character of ['你', '好', '世', '界', '啊']) {
      await imeClient.send('Input.imeSetComposition', { text: 'n', selectionStart: 1, selectionEnd: 1 });
      await imeClient.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 });
      await imeClient.send('Input.insertText', { text: character });
      const snapshot = await page.evaluate(() => {
        const editor = window.__browserTestEditor;
        const input = document.querySelector('.edit-input:not(.hide) textarea');
        return { edit: editor.state.showEdit, value: input && input.value,
          focused: document.activeElement === input, nodeText: editor.minder.getSelectedNode().getText() };
      });
      assert.strictEqual(snapshot.value, '你好世界啊'.slice(0, '你好世界啊'.indexOf(character) + 1),
        `浏览器原生组词连续输入 ${character}`);
      assert(snapshot.edit && snapshot.focused, `连续输入 ${character} 后仍保持编辑框焦点`);
    }
    await page.evaluate(() => {
      const editor = window.__browserTestEditor;
      editor.setState({ showEdit: false, inputContent: null });
      editor.minder.select(editor.minder.getRoot(), true);
      editor.handleKeyDown({ keyCode: 9, target: document.body, preventDefault() {} });
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => window.__browserTestEditor.handleKeyDown({
      key: '先', keyCode: 0, target: document.body, preventDefault() {},
    }));
    assert.strictEqual(await page.$eval('.edit-input:not(.hide) textarea', input => input.value), '先',
      '新建节点首次输入显示正在输入的文字');
    await page.waitForTimeout(350);
    assert.strictEqual(await page.$eval('.edit-input:not(.hide) textarea', input => input.value), '先',
      '新建节点延迟打开输入框不能覆盖已输入的文字');
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
