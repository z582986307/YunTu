// 真实编辑器隔离夹具；网络边界替换，所有文字均为合成测试数据。
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const root = path.resolve(__dirname, '../../../../../..');
const output = path.join(root, 'temp/tag-catalog-priority');
const puppeteer = require(path.join(root, '项目依赖/YunTu-Web/node_modules/puppeteer-core'));

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((request, response) => {
    if (request.url === '/editor.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(path.join(output, 'editor-build/editor.js')));
    } else response.end('<!doctype html><meta charset="utf-8"><div id="map"></div><script src="/editor.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const evidence = { nodeCount: Number(process.env.NODE_COUNT || 0) };
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true, userDataDir: path.join(output, `chrome-${process.pid}`), defaultViewport: { width: 1600, height: 1000 } });
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async count => {
      window.__fixtureAcknowledge = true;
      window.testEditor = await window.mountTestEditor({ template: 'right', theme: 'byte-blue', base: 1,
        root: { data: { id: 'r', text: '合成根节点' }, children: [
          { data: { id: 'a', text: '优先级与标签甲', priority: 1, resource: ['候选甲', '保留标签'] } },
          { data: { id: 'b', text: '优先级与标签乙', priority: 2, resource: ['候选甲'] } },
          { data: { id: 'branch', text: '折叠分支', expandState: 'collapse' }, children: [
            { data: { id: 'leaf', text: '隐藏节点', priority: 1, resource: ['叶标签'] } },
          ] },
          ...Array.from({ length: count }, (_, i) => ({ data: { id: `f${i}`, text: `背景${i}` } })),
        ] } }, false, { width: '100%', height: '900px' });
    }, evidence.nodeCount);
    const ready = () => page.waitForFunction(() => {
      const e = window.testEditor, m = e && e.minder;
      return m && !e.state.loading && !m._progressiveImporting && !m._pendingLayout &&
        (!m._viewLayoutCompletion || m._viewLayoutCompletion.finished) && !e.historyPreparing && !e.historyPending &&
        !(e.pendingEditCount || 0) && !e.saveInFlight;
    });
    await ready();
    await page.evaluate(() => {
      const m = window.testEditor.minder;
      m.setOption('viewAnimationDuration', 0);
      m.setOption('layoutAnimationDuration', 0);
      m.select(m.getNodeById('a'), true);
      m.execCommand('camera', m.getNodeById('a'));
      window.captureGeometry = () => ['a', 'b'].map(id => {
        const m = window.testEditor.minder;
        const node = m.getNodeById(id), priority = node.getRenderer('PriorityRenderer');
        const rect = element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
        return { id, outline: rect(node.getRenderer('OutlineRenderer').getRenderShape().node),
          text: rect(node.getRenderer('TextRenderer').getRenderShape().node),
          priority: rect(priority.getRenderShape().node), priorityData: node.getData('priority'),
          badges: [...node.rc.node.querySelectorAll('.km-resource-badge')].map(rect),
          matrix: node.getGlobalLayoutTransform().m };
      });
    });
    await page.click('[aria-label="展开外观"]');
    evidence.before = await page.evaluate(() => window.captureGeometry());
    const deleteCandidate = '[aria-label="删除可用标签：候选甲"]';
    const oldDelete = '[aria-label="清除标签：候选甲"]';
    await page.click(await page.$(deleteCandidate) ? deleteCandidate : oldDelete);
    await ready();
    evidence.afterCandidateDelete = await page.evaluate(() => ({
      resources: ['a', 'b'].map(id => window.testEditor.minder.getNodeById(id).getData('resource')),
      catalog: window.testEditor.minder.getRoot().getData('tagCatalog'),
      stillListed: Boolean(document.querySelector('.mindmap-tag-list [title="候选甲"]')),
    }));
    await page.click('[aria-label="清除优先级"]');
    await ready();
    evidence.afterPriorityClear = await page.evaluate(() => ({ data: window.testEditor.minder.getNodeById('a').getData(), geometry: window.captureGeometry() }));
    await page.screenshot({ path: path.join(output, `${process.env.EVIDENCE_NAME || 'green'}-detail.png`), clip: { x: 10, y: 50, width: 1250, height: 650 } });
    fs.writeFileSync(path.join(output, `${process.env.EVIDENCE_NAME || 'green'}.json`), JSON.stringify(evidence, null, 2));
    assert.deepStrictEqual(evidence.afterCandidateDelete.resources, [['候选甲', '保留标签'], ['候选甲']], '删除候选不得删除节点同名标签');
    assert.strictEqual(evidence.afterCandidateDelete.stillListed, false, '删除候选必须立即隐藏');
    assert(!Object.prototype.hasOwnProperty.call(evidence.afterPriorityClear.data, 'priority'), '优先级清除应删除数据字段');
    for (const geometry of evidence.before) {
      const p = geometry.priority, o = geometry.outline;
      assert(p.x >= o.x - 1 && p.y >= o.y - 1 && p.x + p.width <= o.x + o.width + 1 && p.y + p.height <= o.y + o.height + 1, '优先级实际图形应处于节点轮廓内');
      assert(p.x + p.width <= geometry.text.x + 1, '优先级不得覆盖正文');
    }
    await page.click('[aria-label="撤销"]');
    await ready();
    assert.strictEqual(await page.evaluate(() => window.testEditor.minder.getNodeById('a').getData('priority')), 1);
    await page.click('[aria-label="撤销"]');
    await ready();
    await page.waitForSelector('.mindmap-tag-list [title="候选甲"]');
    await page.click('[aria-label="重做"]');
    await ready();
    await page.waitForSelector('.mindmap-tag-list [title="候选甲"]', { hidden: true });
    await page.click('[aria-label="重做"]');
    await ready();
    await page.click('[aria-label="清除当前节点标签"]');
    await ready();
    evidence.clear = await page.evaluate(() => ({
      data: window.testEditor.minder.getNodeById('a').getData(),
      other: window.testEditor.minder.getNodeById('b').getData(),
      catalog: window.testEditor.minder.getRoot().getData('tagCatalog'),
      deletedResurrected: Boolean(document.querySelector('.mindmap-tag-list [title="候选甲"]')),
      retainedListed: Boolean(document.querySelector('.mindmap-tag-list [title="保留标签"]')),
    }));
    assert(!evidence.clear.data.resource && evidence.clear.retainedListed, '清除节点必须保留可用候选');
    assert(!evidence.clear.deletedResurrected, '先删除候选再清同名节点，不得复活候选');
    assert.deepStrictEqual(evidence.clear.other.resource, ['候选甲']);
    await page.evaluate(() => window.testEditor.minder.select([], true));
    assert.strictEqual(await page.$eval('.mindmap-tag-add', button => button.disabled), false, '无选中节点仍可新增候选');
    const addCandidate = async value => {
      await page.click('.mindmap-tag-add');
      await page.type('[aria-label="新标签名称"]', value);
      await page.keyboard.press('Enter');
      await page.waitForSelector(`.mindmap-tag-list [title="${value}"]`);
    };
    await addCandidate('未应用候选');
    await addCandidate('候选甲');
    evidence.noSelection = await page.evaluate(() => ({ catalog: window.testEditor.minder.getRoot().getData('tagCatalog'),
      selected: window.testEditor.minder.getSelectedNodes().length,
      applicationDisabled: [...document.querySelectorAll('.mindmap-tag-button')].every(button => button.disabled) }));
    assert.strictEqual(evidence.noSelection.selected, 0);
    assert(evidence.noSelection.applicationDisabled);
    assert(evidence.noSelection.catalog.added.includes('未应用候选'));
    assert(!evidence.noSelection.catalog.removed.includes('候选甲'), '手动加回同名候选应解除删除状态');
    await page.click('[aria-label="删除可用标签：候选甲"]');
    // 保存准备中的保护不仅依赖上次 render 得到的 disabled 属性。
    evidence.blocked = await page.evaluate(() => {
      const e = window.testEditor, before = JSON.stringify(e.minder.exportJson());
      e.savePreparing = true;
      document.querySelector('[aria-label="删除可用标签：未应用候选"]').click();
      e.minder.execCommand('TagCatalog', '禁止候选', 'add');
      e.savePreparing = false;
      return before === JSON.stringify(e.minder.exportJson());
    });
    assert(evidence.blocked, '保存准备应阻止候选修改');
    evidence.patches = await page.evaluate(() => window.__sentMessages.filter(message => ['edit', 'undo', 'redo'].includes(message.name)));
    const exported = await page.evaluate(() => window.testEditor.minder.exportJson());
    await page.evaluate(async data => {
      window.unmountTestEditor();
      window.testEditor = await window.mountTestEditor(data, false, { width: '100%', height: '900px' });
    }, exported);
    await ready();
    await page.click('[aria-label="展开外观"]');
    await page.waitForSelector('.mindmap-tag-list [title="未应用候选"]');
    assert.strictEqual(Boolean(await page.$('.mindmap-tag-list [title="候选甲"]')), false, '导出再打开后已删除候选不复活');
    evidence.reopened = await page.evaluate(() => window.testEditor.minder.getRoot().getData('tagCatalog'));
    await page.evaluate(() => {
      const m = window.testEditor.minder;
      m.setOption('viewAnimationDuration', 0);
      m.setOption('layoutAnimationDuration', 0);
      m.select(m.getNodeById('a'), true);
      m.execCommand('camera', m.getNodeById('a'));
    });
    for (const phase of ['priority-add', 'tag-add', 'tag-clear', 'priority-clear', 'rapid']) {
      await page.evaluate(async phase => {
        const m = window.testEditor.minder;
        if (phase === 'priority-add') m.execCommand('Priority', 1);
        if (phase === 'tag-add') m.execCommand('Resource', ['布局标签', '第二标签']);
        if (phase === 'tag-clear') m.execCommand('Resource', null);
        if (phase === 'priority-clear') m.execCommand('Priority', 0);
        if (phase === 'rapid') for (let i = 0; i < 6; i++) {
          m.execCommand('Priority', i % 3 + 1);
          m.execCommand('Resource', i % 2 ? null : ['连续标签']);
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }, phase);
      await ready();
      const result = await page.evaluate(() => {
        const m = window.testEditor.minder;
        const snapshot = () => m.getAllNode().map(node => [node.getData('id'), node.getGlobalLayoutTransform().m.e, node.getGlobalLayoutTransform().m.f]);
        const before = JSON.stringify(snapshot()), schedule = m._scheduleLayout;
        m._scheduleLayout = null;
        m.layout(0);
        m._scheduleLayout = schedule;
        return { geometry: window.captureGeometry(), matchesSynchronous: before === JSON.stringify(snapshot()) };
      });
      evidence[phase] = result;
      assert(result.matchesSynchronous, `${phase}不得遗留旧矩阵`);
      for (const geometry of result.geometry) {
        const o = geometry.outline;
        for (const box of [geometry.text, geometry.priority, ...geometry.badges].filter(box => box.width)) {
          assert(box.x >= o.x - 1 && box.y >= o.y - 1 && box.x + box.width <= o.x + o.width + 1 && box.y + box.height <= o.y + o.height + 1, `${phase}节点内容应处于轮廓内`);
        }
      }
    }
    evidence.transportError = await page.evaluate(() => window.__fixtureTransportError || null);
    assert.strictEqual(evidence.transportError, null, 'RFC6902严格镜像不应拒绝补丁');
    await page.screenshot({ path: path.join(output, `${process.env.EVIDENCE_NAME || 'green'}-final.png`), clip: { x: 10, y: 50, width: 1250, height: 650 } });
    fs.writeFileSync(path.join(output, `${process.env.EVIDENCE_NAME || 'green'}.json`), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ nodeCount: evidence.nodeCount, candidate: evidence.afterCandidateDelete, clear: evidence.clear,
      noSelection: evidence.noSelection, blocked: evidence.blocked, reopened: evidence.reopened,
      phases: ['priority-add', 'tag-add', 'tag-clear', 'priority-clear', 'rapid'].map(phase => ({ phase, matchesSynchronous: evidence[phase].matchesSynchronous })) }));
    console.log('browser-tag-catalog-priority: PASS');
    await page.evaluate(() => window.unmountTestEditor());
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
