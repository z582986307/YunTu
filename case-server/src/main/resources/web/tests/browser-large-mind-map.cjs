/* 实际 Chrome 回归；报告仅包含计数、耗时，不包含用例正文或凭据。 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const root = path.resolve(__dirname, '../../../../../..');
const deps = path.join(root, '项目依赖/YunTu-Web/node_modules');
const puppeteer = require(path.join(deps, 'puppeteer-core'));
const editor = path.resolve(__dirname, '../src/components/react-mindmap-editor');
const output = path.join(root, '运行日志/脑图性能');
const count = Number(process.argv[2] || 2000);
const mode = process.argv[3] || 'engine';

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const files = {
      '/kity.js': path.join(deps, 'kity/dist/kity.js'),
      '/core.js': path.join(editor, 'assets/kityminder-core/kityminder.core.js'),
      '/largeMindMap.js': path.join(editor, 'largeMindMap.js'),
      '/progressiveRender': path.join(editor, 'progressiveRender.js'),
      '/paintGroups': path.join(editor, 'paintGroups.js'),
      '/editor.js': path.join(output, 'editor-build/editor.js'),
    };
    if (files[req.url]) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(fs.readFileSync(files[req.url]));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}#map{width:1200px;height:900px}</style><div id="map"></div>' + (mode === 'engine' ? '<script src="/kity.js"></script><script src="/core.js"></script>' : '<script src="/editor.js"></script>'));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  let watchdog;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: path.join(output, `chrome-${process.pid}`),
      args: ['--disable-background-networking', '--disable-extensions', '--no-first-run'],
      defaultViewport: { width: 1280, height: 900 },
      timeout: 60000,
    });
    const page = await browser.newPage();
    watchdog = setTimeout(() => { console.error('浏览器验收超时（240秒）'); browser.close(); }, 240000);
    const errors = [];
    page.on('error', e => { console.error(`浏览器页面异常：${e.message}`); browser.close(); });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.text().startsWith('[metric]')) console.log(msg.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    if (process.env.MINDMAP_TRACE) await page.tracing.start({ path: path.join(output, `trace-${count}.json`), categories: ['devtools.timeline', 'v8.execute', 'blink.user_timing'] });
    const result = await page.evaluate(async ({ nodeCount, mode }) => {
      const { importMindMapProgressively } = await import('/largeMindMap.js');
      const data = { template: 'right', theme: 'byte-blue', root: { data: { text: '性能验收', layout: 'right' }, children: [] } };
      for (let i = 0; i < nodeCount; i++) {
        if (i % 100 === 0) data.root.children.push({ data: { text: `模块 ${i / 100}`, layout: 'right' }, children: [] });
        const branch = data.root.children[data.root.children.length - 1];
        branch.children.push({ data: { text: `客户管理用例 ${i}：检查输入和预期结果`, layout: 'right', progress: [undefined, 9, 1, 5, 4][i % 5] }, children: [] });
      }
      const instance = mode === 'engine' ? null : await window.mountTestEditor(data, mode === 'execute');
      window.testEditor = instance;
      const minder = instance ? instance.minder : new window.kityminder.Minder({ renderTo: '#map' });
      window.testMinder = minder;
      const operations = {};
      ['importJson', 'createNode', 'renderNodeBatch', 'fire'].forEach(name => {
        const original = minder[name];
        minder[name] = function(...args) {
          const key = name === 'fire' ? `${name}:${args[0]}` : name;
          const start = performance.now();
          try { return original.apply(this, args); }
          finally {
            const elapsed = performance.now() - start;
            const entry = operations[key] || (operations[key] = { count: 0, max: 0, total: 0 });
            entry.count++;
            if ((name === 'createNode' || key === 'fire:layoutfinish') && entry.count % 10000 === 0) console.log(`[metric] ${key}: ${entry.count}`);
            if (name === 'renderNodeBatch' && entry.count % 625 === 0) console.log(`[metric] render batches: ${entry.count}`);
            entry.total += elapsed;
            entry.max = Math.max(entry.max, elapsed);
          }
        };
      });
      const longTasks = [];
      const observer = new PerformanceObserver(list => list.getEntries().forEach(e => longTasks.push(e.duration)));
      observer.observe({ type: 'longtask', buffered: false });
      let last = performance.now();
      let maxDelay = 0;
      let ticks = 0;
      const heartbeat = setInterval(() => {
        const now = performance.now();
        maxDelay = Math.max(maxDelay, now - last);
        last = now;
        ticks++;
      }, 16);
      const start = performance.now();
      if (instance) {
        await new Promise(resolve => minder.on('progressiveimportdone', resolve));
      } else {
        await importMindMapProgressively(minder, data);
      }
      const duration = performance.now() - start;
      // 心跳持续覆盖首次操作、最后节点显示及其后的 15 秒。
      window.finishPerformanceObservation = () => {
        clearInterval(heartbeat);
        observer.takeRecords().forEach(e => longTasks.push(e.duration));
        observer.disconnect();
        return { maxHeartbeatMs: Math.round(maxDelay), maxLongTaskMs: Math.round(Math.max(0, ...longTasks)), longTasks: longTasks.length, ticks };
      };
      const nodes = minder.getAllNode();
      const leaves = nodes.filter(n => !n.children.length);
      const measured = nodes.filter(n => n._contentBox);
      const liveRenderers = nodes.filter(n => n._renderers).length;
      const finite = nodes.every(n => {
        const m = n.getGlobalLayoutTransform();
        return m && Number.isFinite(m.m.e) && Number.isFinite(m.m.f);
      });
      const result = {
        requestedLeaves: nodeCount, nodes: nodes.length, leaves: leaves.length,
        measured: measured.length, liveRenderers, finite, durationMs: Math.round(duration),
        maxHeartbeatMs: Math.round(maxDelay), maxLongTaskMs: Math.round(Math.max(0, ...longTasks)),
        longTasks: longTasks.length, ticks,
        expanded: nodes.every(n => n.isExpanded()),
        statesPreserved: leaves.every((n, i) => n.getData('progress') === [undefined, 9, 1, 5, 4][i % 5]),
        domElements: document.querySelectorAll('*').length,
        svgRect: minder.getPaper().node.getBoundingClientRect().toJSON(),
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        operations: Object.fromEntries(Object.entries(operations).filter(([,v]) => v.max > 20)),
      };
      window.testMinder = minder;
      return result;
    }, { nodeCount: count, mode });
    if (mode !== 'engine') {
      await page.waitForSelector('.mindmap-scroll-track.vertical', { timeout: 5000 });
      result.scrollbarInitiallyHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.mindmap-scroll-track.vertical')).opacity === '0');
      assert(result.scrollbarInitiallyHidden, '静止时滚动条未隐藏');
      const scrollStart = await page.evaluate(() => ({
        x: window.testMinder.getViewDragger().getView().left,
        y: window.testMinder.getViewDragger().getView().top,
      }));
      await page.mouse.move(600, 450);
      await page.mouse.wheel({ deltaY: 120 });
      const axes = await page.evaluate(() => ['horizontal', 'vertical'].filter(axis => document.querySelector(`.mindmap-scroll-track.${axis}`)));
      for (const axis of axes) {
        const track = await page.$(`.mindmap-scroll-track.${axis}`);
        const box = await track.boundingBox();
        const from = axis === 'horizontal' ? { x: box.x + 12, y: box.y + box.height / 2 } : { x: box.x + box.width / 2, y: box.y + 12 };
        const to = axis === 'horizontal' ? { x: box.x + box.width - 2, y: from.y } : { x: from.x, y: box.y + box.height - 2 };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();
      }
      result.scrollbarEndEvidence = await page.evaluate(start => {
        const view = window.testMinder.getViewDragger().getView();
        const bounds = window.testMinder._paintGroups.getBounds();
        return { start, view, bounds, hasHorizontal: !!document.querySelector('.mindmap-scroll-track.horizontal') };
      }, scrollStart);
      const { start, view, bounds, hasHorizontal } = result.scrollbarEndEvidence;
      result.scrollbarReachedEnds = view.top > start.y + view.height
        && (hasHorizontal ? view.left > start.x + view.width && Math.abs(view.right - bounds.right) < view.width / 4 : true)
        && Math.abs(view.bottom - bounds.bottom) < view.height / 4;
      assert(result.scrollbarReachedEnds, `拖动滚动条未到达脑图右下边界：${JSON.stringify(result.scrollbarEndEvidence)}`);
      await page.waitForTimeout(1300);
      result.scrollbarAutoHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.mindmap-scroll-track.vertical')).opacity === '0');
      assert(result.scrollbarAutoHidden, '停止滑动后滚动条未隐藏');
      await page.evaluate(() => {
        const leaf = window.testMinder.getRoot().children[0].children[0];
        window.testMinder.setOption('viewAnimationDuration', 0);
        window.testMinder.execCommand('camera', leaf, 0);
        window.__testLeaf = leaf;
      });
      const point = await page.evaluate(() => {
        const rect = window.__testLeaf.getRenderContainer().node.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.mouse.click(point.x, point.y);
      if (mode === 'execute') {
        const nodeGeometry = () => page.evaluate(() => {
          const node = window.__testLeaf;
          const box = shape => {
            const rect = shape.node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          };
          return {
            outline: box(node.getRenderer('OutlineRenderer').getRenderShape()),
            text: box(node.getRenderer('TextRenderer').getRenderShape()),
            connection: box(node.getConnection()),
          };
        });
        const beforeMark = await nodeGeometry();
        await page.click('.execution-result-button.danger');
        console.log(JSON.stringify(await page.evaluate(() => ({ selected: window.testMinder.getSelectedNodes().length, progress: window.__testLeaf.getData('progress'), sent: window.__sentMessages.map(m => m.name), disabled: document.querySelector('.execution-result-button.danger').disabled }))));
        result.markedFailed = await page.evaluate(() => window.__testLeaf.getData('progress') === 1 && window.__sentMessages.some(m => m.name === 'edit'));
        assert(result.markedFailed, '实际点击失败按钮后未产生正确结果补丁');
        assert.deepStrictEqual(await nodeGeometry(), beforeMark, '点击失败按钮后末级节点几何发生变化');
        await page.click('.execution-result-button.untested');
        result.markCleared = await page.evaluate(() => window.__testLeaf.getData('progress') == null);
        assert(result.markCleared, '实际点击未测试按钮后没有清除执行结果');
        assert.deepStrictEqual(await nodeGeometry(), beforeMark, '点击未测试按钮后末级节点几何发生变化');
      } else {
        await page.mouse.click(point.x, point.y, { clickCount: 2 });
        await page.waitForSelector('.edit-input:not(.hide) textarea', { visible: true, timeout: 5000 });
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.type('browser-edit-check');
        await page.keyboard.press('Enter');
        result.textEdited = await page.evaluate(() => window.__testLeaf.getText().includes('browser-edit-check'));
        assert(result.textEdited, '实际双击编辑文本未生效');
        const undo = await page.$('.do-group button[aria-label="撤销"]');
        const undoBox = await undo.boundingBox();
        await page.mouse.move(undoBox.x + undoBox.width / 2, undoBox.y + undoBox.height / 2);
        result.undoStyle = await page.evaluate(() => {
          const button = document.querySelector('.do-group button[aria-label="撤销"]');
          return { disabled: button.disabled, width: Math.round(button.getBoundingClientRect().width), text: button.textContent.trim(), color: getComputedStyle(button).color };
        });
        assert(!result.undoStyle.disabled && result.undoStyle.width === 72 && result.undoStyle.text === '撤销', '撤销按钮未与保存按钮保持同尺寸');
        await page.mouse.down();
        result.undoPressedColor = await page.evaluate(() => getComputedStyle(document.querySelector('.do-group button[aria-label="撤销"]')).color);
        await page.mouse.up();
        assert(result.undoPressedColor === 'rgb(36, 111, 255)', `点击撤销按钮时颜色为 ${result.undoPressedColor}`);
        result.undoRevertedText = await page.evaluate(() => !window.__testLeaf.getText().includes('browser-edit-check'));
        assert(result.undoRevertedText, '撤销按钮未执行原有撤销操作');
        await page.click('.do-group button[aria-label="重做"]');
        result.redoRestoredText = await page.evaluate(() => window.__testLeaf.getText().includes('browser-edit-check'));
        assert(result.redoRestoredText, '重做按钮未执行原有重做操作');
      }
      // 跳到最远的已生成节点，再通过真实鼠标选中，验证不是只有首屏可操作。
      result.farRegionMs = await page.evaluate(async () => {
        const minder = window.testMinder;
        const branch = minder.getRoot().children.slice(-1)[0];
        window.__farLeaf = branch.children.slice(-1)[0];
        const start = performance.now();
        minder.execCommand('camera', window.__farLeaf);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return Math.round(performance.now() - start);
      });
      const farPoint = await page.evaluate(() => {
        const rect = window.__farLeaf.getRenderContainer().node.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.mouse.click(farPoint.x, farPoint.y);
      result.farNodeSelected = await page.evaluate(() => window.testMinder.getSelectedNode() === window.__farLeaf);
      assert(result.farNodeSelected, '远处节点显示后无法真实点击选中');
      result.lastNodePainted = await page.evaluate(lastIndex => {
        const texts = window.__farLeaf.getRenderContainer().node.querySelectorAll('text');
        return texts.length > 0 && Array.from(texts).some(text => text.textContent.includes(`客户管理用例 ${lastIndex}：`));
      }, count - 1);
      assert(result.lastNodePainted, '最后末级节点没有绘制正文');
      const oldMovement = await page.evaluate(() => window.testMinder.getViewDragger().getMovement().y);
      await page.keyboard.down('Alt');
      await page.mouse.move(200, 700);
      await page.mouse.down();
      await page.mouse.move(200, 350, { steps: 8 });
      await page.mouse.up();
      await page.keyboard.up('Alt');
      result.dragMoved = await page.evaluate(previous => Math.abs(window.testMinder.getViewDragger().getMovement().y - previous) > 200, oldMovement);
      assert(result.dragMoved, '原有 Alt + 鼠标拖动交互失效');
      assert(result.farRegionMs < 500, `远区域显示延迟 ${result.farRegionMs}ms`);
    }
    await page.waitForTimeout(15000);
    Object.assign(result, await page.evaluate(() => window.finishPerformanceObservation()));
    if (process.env.MINDMAP_TRACE) await page.tracing.stop();
    result.errors = errors;
    fs.writeFileSync(path.join(output, `${mode}-${count}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    assert.strictEqual(result.leaves, count);
    assert.strictEqual(result.measured, result.nodes);
    if (count >= 5000) assert(result.liveRenderers < 2000, `屏外绘制对象未释放：${result.liveRenderers}`);
    if (count >= 5000) assert(result.domElements < 15000, `屏外 SVG 容器未释放：${result.domElements}`);
    assert(result.finite && result.expanded && result.statesPreserved);
    assert.strictEqual(errors.length, 0);
    assert(result.maxHeartbeatMs < 500, `加载期间主线程连续失去响应 ${result.maxHeartbeatMs}ms`);
  } finally {
    clearTimeout(watchdog);
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
