// 仅使用真实编辑器与本地 Socket 夹具；不访问业务服务或用户数据。
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const root = path.resolve(__dirname, '../../../../../..');
const output = process.env.BROWSER_EVIDENCE_OUTPUT || path.join(root, 'temp/tag-delete-collapse');
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
  const evidence = {};
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true, userDataDir: path.join(output, `chrome-${process.pid}`), defaultViewport: { width: 1600, height: 1000 } });
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      window.testEditor = await window.mountTestEditor({ template: 'right', theme: 'byte-blue', base: 1,
        root: { data: { id: 'r', text: '隔离根节点' }, children: [
          { data: { id: 'a', text: '目标节点', resource: ['标签甲', '标签乙', ' 历史空格标签 '] } },
          { data: { id: 'b', text: '其他节点', resource: ['标签丙'] } },
        ] } }, false, { width: '100%', height: '900px' });
    });
    const ready = () => page.waitForFunction(() => {
      const e = window.testEditor, m = e && e.minder;
      return m && !e.state.loading && !m._progressiveImporting && !m._pendingLayout &&
        (!m._viewLayoutCompletion || m._viewLayoutCompletion.finished);
    });
    await ready();
    await page.evaluate(() => {
      const m = window.testEditor.minder;
      m.setOption('viewAnimationDuration', 0);
      m.execCommand('camera', m.getNodeById('a'));
      m.select(m.getNodeById('b'), true);
    });
    const badge = 'svg [aria-label="标签：标签甲"]';
    await page.hover(badge);
    const remove = `${badge} [data-resource-remove]`;
    await page.waitForSelector(remove);
    evidence.tag = await page.$eval(remove, element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        opacity: getComputedStyle(element).opacity, hitInside: element.contains(hit) };
    });
    await page.click(remove);
    evidence.tag.resourcesAfterClick = await page.evaluate(() => {
      const m = window.testEditor.minder;
      return { a: m.getNodeById('a').getData('resource'), b: m.getNodeById('b').getData('resource') };
    });
    await page.click('[aria-label="展开外观"]');
    await page.click('[aria-label="删除可用标签：历史空格标签"]');
    evidence.toolbarTrim = await page.evaluate(() => window.testEditor.minder.getNodeById('a').getData('resource'));
    assert.deepStrictEqual(evidence.toolbarTrim, ['标签乙', ' 历史空格标签 '], '真实工具栏删除候选不得删除节点历史空格标签');
    await page.click('.mindmap-tag-add');
    await page.type('[aria-label="新标签名称"]', '浏览器新增标签');
    await page.keyboard.press('Enter');
    await page.click('[aria-label="应用标签：浏览器新增标签"]');
    const candidate = '[aria-label="删除可用标签：浏览器新增标签"]';
    await page.hover('[aria-label="已应用标签：浏览器新增标签"]');
    evidence.toolbar = await page.$eval(candidate, button => {
      const box = button.getBoundingClientRect(), tag = button.parentElement.getBoundingClientRect();
      return { background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color,
        width: box.width, height: box.height, tagWidth: tag.width };
    });
    await page.screenshot({ path: path.join(output, 'tag-toolbar.png') });
    // 测试标签保持键盘聚焦，同时悬浮工具栏×，一张局部截图呈现两种实际控件。
    await page.focus('svg [aria-label="标签：标签乙"]');
    await page.hover(candidate);
    await page.screenshot({ path: path.join(output, 'tag-remove-detail.png'), clip: { x: 630, y: 40, width: 620, height: 520 } });
    await page.click(candidate);
    await page.waitForSelector('[aria-label="应用标签：浏览器新增标签"]', { hidden: true });
    evidence.toolbar.removed = true;
    // 初始收起分支的孩子尚无最终坐标，展开前后逐帧记录真实SVG矩形。
    await page.evaluate(async nodeCount => {
      window.unmountTestEditor();
      const fillers = nodeCount < 10000
        ? Array.from({ length: nodeCount }, (_, i) => ({ data: { id: `f${i}`, text: `背景节点${i}` } }))
        : Array.from({ length: Math.ceil(nodeCount / 100) }, (_, i) => ({ data: { id: `f${i}`, text: `背景分支${i}` },
          children: Array.from({ length: 100 }, (_, j) => ({ data: { id: `f${i}-${j}`, text: `背景节点${i}-${j}` } })) }));
      window.testEditor = await window.mountTestEditor({ template: 'right', theme: 'byte-blue', root: { data: { id: 'r', text: '根' }, children: [
        { data: { id: 'branch', text: '折叠分支', expandState: 'collapse' }, children: Array.from({ length: 7 }, (_, i) => ({
          data: { id: `c${i}`, text: `子节点${i}`, expandState: i === 0 ? 'collapse' : 'expand' },
          children: i === 0 ? [{ data: { id: 'nested-hidden', text: '保持收起的孙节点' } }] : [],
        })) },
        { data: { id: 'sibling', text: '相邻节点' }, children: [{ data: { id: 'leaf', text: '相邻叶节点' } }] },
        ...fillers,
      ] } }, false, { width: '100%', height: '900px' });
    }, Number(process.env.NODE_COUNT || 0));
    await ready();
    console.log('真实编辑器数据就绪，开始折叠帧录取');
    await page.evaluate(() => {
      const m = window.testEditor.minder;
      m.setOption('viewAnimationDuration', 0);
      m.execCommand('camera', m.getNodeById('branch'));
      window.geometryFrames = [];
      window.commitStats = [];
      const nodePrototype = Object.getPrototypeOf(m.getRoot());
      const setTransform = nodePrototype.setGlobalLayoutTransform;
      nodePrototype.setGlobalLayoutTransform = function (matrix) {
        const entry = window.commitStats[window.commitStats.length - 1];
        if (entry && this.rc) {
          entry.domMatrices++;
          if (entry.domFirst == null) entry.domFirst = performance.now();
          const result = setTransform.call(this, matrix);
          entry.domLast = performance.now();
          return result;
        }
        return setTransform.call(this, matrix);
      };
      window.longTasks = [];
      new PerformanceObserver(list => window.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration }))))
        .observe({ type: 'longtask', buffered: true });
      m.on('layoutapply', () => {
        const entry = window.commitStats[window.commitStats.length - 1];
        if (entry) { entry.applied++; entry.last = performance.now(); }
      });
      const capture = phase => {
        const nodes = m.getAllNode().filter(node => node.rc && node.rc.node.isConnected && getComputedStyle(node.rc.node).display !== 'none' && getComputedStyle(node.rc.node).visibility !== 'hidden');
        const boxes = nodes.map(node => { const b = node.rc.node.getBoundingClientRect(); return { id: node.getData('id'), x: b.x, y: b.y, width: b.width, height: b.height }; })
          .filter(b => b.width && b.height && b.x < innerWidth && b.x + b.width > 0 && b.y < innerHeight && b.y + b.height > 0);
        window.geometryFrames.push({ phase, boxes });
      };
      const finish = () => window.rapidClicksDone !== false && !m._pendingLayout && (!m._viewLayoutCompletion || m._viewLayoutCompletion.finished);
      window.recordGeometry = phase => {
        window.commitStats.push({ phase, applied: 0, domMatrices: 0, start: performance.now() });
        capture(`${phase}:before`);
        let count = 0;
        const tick = () => { capture(`${phase}:frame${count++}`); if (!finish() || count < 3) requestAnimationFrame(tick); else window.geometryDone = true; };
        window.geometryDone = false;
        requestAnimationFrame(tick);
      };
    });
    const expander = await page.evaluate(() => window.testEditor.minder.getNodeById('branch').getRenderer('ExpanderRenderer').expander.node.id);
    for (const phase of ['expand', 'collapse', 'expand-again']) {
      await page.evaluate(({ phase, expander }) => {
        document.getElementById(expander).addEventListener('mousedown', () => window.recordGeometry(phase), { capture: true, once: true });
      }, { phase, expander });
      await page.click(`#${expander}`);
      await page.waitForFunction(() => window.geometryDone);
    }
    await page.evaluate(expander => {
      window.rapidClicksDone = false;
      window.rapidTasks = [];
      document.getElementById(expander).addEventListener('mousedown', () => window.recordGeometry('rapid'), { capture: true, once: true });
    }, expander);
    for (let i = 0; i < 6; i++) {
      await page.click(`#${expander}`);
      await page.evaluate(() => {
        const m = window.testEditor.minder;
        window.rapidTasks.push({ task: m._layoutTask, completion: m._viewLayoutCompletion });
      });
    }
    await page.evaluate(() => { window.rapidClicksDone = true; });
    await page.waitForFunction(() => window.geometryDone);
    evidence.frames = await page.evaluate(() => window.geometryFrames);
    evidence.layout = await page.evaluate(() => ({ nodeCount: window.testEditor.minder.getAllNode().length,
      progressive: Boolean(window.testEditor.minder._scheduleLayout), commits: window.commitStats,
      completion: window.testEditor.minder._viewLayoutCompletion,
      cancelledWithoutCompletion: window.rapidTasks.filter(entry => entry.task && entry.task.cancelled && !entry.completion.finished).length,
      longTasks: window.longTasks.filter(entry => entry.start >= window.commitStats[0].start),
      hidden: window.testEditor.minder.getAllNode().filter(node => node._expandRevealPending).length }));
    evidence.layout.matchesSynchronous = await page.evaluate(() => {
      const m = window.testEditor.minder;
      const snapshot = () => m.getAllNode().filter(node => !node.parent || node.parent.isExpanded()).map(node => {
        const matrix = node.getGlobalLayoutTransform().m; return [node.getData('id'), matrix.e, matrix.f];
      });
      const before = JSON.stringify(snapshot()), schedule = m._scheduleLayout;
      m._scheduleLayout = null;
      const duration = m.getOption('layoutAnimationDuration');
      m.setOption('layoutAnimationDuration', 0);
      m.layout();
      m.setOption('layoutAnimationDuration', duration);
      m._scheduleLayout = schedule;
      return before === JSON.stringify(snapshot());
    });
    evidence.failureRecovery = [];
    const childExpander = await page.evaluate(() => window.testEditor.minder.getNodeById('c0').getRenderer('ExpanderRenderer').expander.node.id);
    await page.click(`#${childExpander}`); await ready();
    await page.click(`#${childExpander}`); await ready();
    for (const failureSite of evidence.layout.progressive ? ['doLayout'] : ['doLayout', 'applyLayoutResult']) {
      await page.click(`#${expander}`); // 成功收起，随后真实鼠标展开才会产生临时隐藏的节点和边。
      await ready();
      await page.evaluate(failureSite => {
        const m = window.testEditor.minder, branch = m.getNodeById('branch');
        window.fixtureLayoutError = null;
        window.fixtureSyncErrorPropagated = false;
        const errorMessage = `隔离夹具展开失败:${failureSite}`;
        const receive = event => {
          const error = event.error || event;
          if (error.message && error.message.includes(errorMessage)) window.fixtureLayoutError = error.message;
        };
        m.on('layouterror', receive);
        window.addEventListener('error', receive);
        const target = failureSite === 'doLayout' ? branch : m;
        const method = failureSite === 'doLayout' ? 'getLayoutInstance' : 'applyLayoutResult';
        const original = target[method];
        const originalLayout = m.layout;
        m.layout = function () {
          try { return originalLayout.apply(this, arguments); }
          catch (error) {
            if (error.message === errorMessage) {
              window.fixtureLayoutError = error.message;
              window.fixtureSyncErrorPropagated = true;
            }
            throw error;
          }
        };
        target[method] = failureSite === 'doLayout'
          ? () => ({ doLayout() { throw new Error(errorMessage); } })
          : () => { throw new Error(errorMessage); };
        window.restoreFixtureFailure = () => {
          target[method] = original;
          m.layout = originalLayout;
          m.off('layouterror', receive);
          window.removeEventListener('error', receive);
        };
      }, failureSite);
      await page.click(`#${expander}`);
      await page.waitForFunction(() => Boolean(window.fixtureLayoutError));
      const failure = await page.evaluate(() => {
        const m = window.testEditor.minder;
        const shown = shape => Boolean(shape && shape.node.isConnected && getComputedStyle(shape.node).display !== 'none' && getComputedStyle(shape.node).visibility !== 'hidden');
        const children = m.getNodeById('branch').children;
        const result = { message: window.fixtureLayoutError, syncErrorPropagated: window.fixtureSyncErrorPropagated, pending: Boolean(m._expandLayoutPending),
          finished: m._viewLayoutCompletion.finished,
          revealPending: m.getAllNode().filter(node => node._expandRevealPending).length,
          visibleChildren: children.filter(node => shown(node.rc)).length,
          visibleConnections: children.filter(node => shown(node.getConnection())).length,
          hiddenConnectionExists: Boolean(m.getNodeById('nested-hidden').getConnection()),
          collapsedDescendantHidden: !shown(m.getNodeById('nested-hidden').rc) && !shown(m.getNodeById('nested-hidden').getConnection()) };
        window.restoreFixtureFailure();
        return result;
      });
      evidence.failureRecovery.push({ failureSite, ...failure });
      // 失败后仍为展开态；鼠标收起再展开，证明后续正常布局恢复而非伪成功。
      await page.click(`#${expander}`); await ready();
      await page.click(`#${expander}`); await ready();
      evidence.failureRecovery[evidence.failureRecovery.length - 1].retryFinished = await page.evaluate(() => window.testEditor.minder._viewLayoutCompletion.finished);
    }
    evidence.overlaps = [];
    for (const frame of evidence.frames) {
      for (let i = 0; i < frame.boxes.length; i++) for (let j = i + 1; j < frame.boxes.length; j++) {
        const a = frame.boxes[i], b = frame.boxes[j];
        if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 &&
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2) evidence.overlaps.push({ phase: frame.phase, ids: [a.id, b.id] });
      }
    }
    await page.evaluate(() => window.unmountTestEditor());
    evidence.unmounted = await page.evaluate(() => !document.querySelector('#map svg'));
    fs.writeFileSync(path.join(output, `${process.env.EVIDENCE_NAME || 'browser'}.json`), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ tag: evidence.tag, layout: evidence.layout, frameCount: evidence.frames.length, overlaps: evidence.overlaps.slice(0, 8) }));
    assert.deepStrictEqual(evidence.tag.resourcesAfterClick, { a: ['标签乙', ' 历史空格标签 '], b: ['标签丙'] }, '真实鼠标点击SVG×应仅移除目标标签');
    assert.strictEqual(evidence.overlaps.length, 0, '展开收起各可见帧不应交叉重叠');
    assert.strictEqual(evidence.layout.hidden, 0, '完成后不能留下永久隐藏节点');
    assert(evidence.layout.matchesSynchronous, '最终矩阵必须与既有同步布局一致');
    assert(evidence.unmounted, '卸载后必须释放实际SVG画布');
    for (const failure of evidence.failureRecovery) {
      assert.deepStrictEqual({ pending: failure.pending, finished: failure.finished, revealPending: failure.revealPending,
        visibleChildren: failure.visibleChildren, visibleConnections: failure.visibleConnections,
        hiddenConnectionExists: failure.hiddenConnectionExists, collapsedDescendantHidden: failure.collapsedDescendantHidden, retryFinished: failure.retryFinished },
      { pending: false, finished: false, revealPending: 0, visibleChildren: 7, visibleConnections: 7,
        hiddenConnectionExists: true, collapsedDescendantHidden: true, retryFinished: true }, `展开${failure.failureSite}失败应恢复节点与按父状态的连接线`);
      if (!evidence.layout.progressive) assert(failure.syncErrorPropagated, '同步失败必须继续向调用者抛出');
    }
    console.log('browser-tag-delete-collapse: PASS');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
