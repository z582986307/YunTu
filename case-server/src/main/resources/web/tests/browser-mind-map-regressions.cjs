/* Chrome 中验证分片导入不改变布局、折叠与数据；不访问业务服务。 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const root = path.resolve(__dirname, '../../../../../..');
const deps = path.join(root, '项目依赖/YunTu-Web/node_modules');
const editor = path.resolve(__dirname, '../src/components/react-mindmap-editor');
const output = path.join(root, '运行日志/脑图性能');
const puppeteer = require(path.join(deps, 'puppeteer-core'));

async function main() {
  const server = http.createServer((req, res) => {
    const files = {
      '/kity.js': path.join(deps, 'kity/dist/kity.js'),
      '/core.js': path.join(editor, 'assets/kityminder-core/kityminder.core.js'),
      '/largeMindMap.js': path.join(editor, 'largeMindMap.js'),
      '/progressiveRender': path.join(editor, 'progressiveRender.js'),
      '/paintGroups': path.join(editor, 'paintGroups.js'),
    };
    if (files[req.url]) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(fs.readFileSync(files[req.url]));
    } else res.end('<!doctype html><meta charset="utf-8"><div id="map" style="width:1200px;height:900px"></div><script src="/kity.js"></script><script src="/core.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, userDataDir: path.join(output, `regression-${process.pid}`), defaultViewport: { width: 1280, height: 900 } });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => {
      const { importMindMapProgressively, prepareLargeMindMap, isMindMapReady, cancelMindMapImport } = await import('/largeMindMap.js');
      const clone = value => JSON.parse(JSON.stringify(value));
      const data = { template: 'right', theme: 'byte-blue', base: 21, root: { data: { text: '回归根节点' }, children: [] } };
      for (let i = 0; i < 10; i++) {
        const branch = { data: { text: `分支 ${i}`, expandState: i === 1 ? 'collapse' : 'expand' }, children: [] };
        for (let j = 0; j < 300; j++) branch.children.push({ data: { text: j % 2 ? `用例 ${i}-${j}` : '多行正文\n第二行包含中文和 English', progress: [undefined, 9, 1, 5, 4][j % 5], note: '备注保留' }, children: [] });
        data.root.children.push(branch);
      }
      prepareLargeMindMap(data);
      const minder = new window.kityminder.Minder({ renderTo: '#map' });
      minder.setOption('layoutAnimationDuration', 0);
      minder.importJson(clone(data));
      await new Promise(resolve => setTimeout(resolve, 50));
      const snapshot = () => minder.getAllNode().filter(n => !n.parent || (n.parent.isExpanded() && (!n.parent.parent || n.parent.parent.isExpanded()))).map(n => {
        const b = n.getContentBox(); const m = n.getGlobalLayoutTransform().m;
        return [n.getText(), b.x, b.y, b.width, b.height, m.e, m.f];
      });
      const baseline = snapshot();
      const expected = minder.exportJson();
      const svgSummary = text => {
        const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
        return { width: svg.getAttribute('width'), height: svg.getAttribute('height'), text: Array.from(svg.querySelectorAll('text')).map(n => n.textContent).sort() };
      };
      const baselineSvg = svgSummary(await minder.exportData('svg'));
      await importMindMapProgressively(minder, clone(expected));
      const sameGeometry = JSON.stringify(snapshot()) === JSON.stringify(baseline);
      const sameData = JSON.stringify(minder.exportJson()) === JSON.stringify(expected);
      const collapsed = minder.getRoot().children[1];
      const collapsePreserved = collapsed.isCollapsed() && collapsed.children.every(n => !n.getRenderContainer().node.isConnected);
      const visibleNodes = minder.getAllNode().filter(n => n._contentBox);
      const graphicsBounded = visibleNodes.filter(n => n.rc).length < 1000;
      const exportedSvg = svgSummary(await minder.exportData('svg'));
      const svgExportComplete = JSON.stringify(exportedSvg) === JSON.stringify(baselineSvg);
      cancelMindMapImport(minder);
      const completedStillCacheable = isMindMapReady(minder);
      const leaf = minder.getRoot().children[0].children[0];
      minder.setOption('viewAnimationDuration', 0);
      minder.execCommand('camera', leaf, 0);
      minder.select(leaf, true);
      minder.execCommand('AppendChildNode', '新增子节点');
      const expanderCreatedWhenNeeded = Boolean(leaf.getRenderer('ExpanderRenderer').getRenderShape()) && leaf.children.length === 1;
      leaf.setText('连续编辑后最终文字');
      leaf.render();
      minder.layout();
      await minder._pendingLayout;
      const asyncGeometry = snapshot();
      const schedule = minder._scheduleLayout;
      minder._scheduleLayout = null;
      minder.layout();
      const asyncLayoutMatches = JSON.stringify(snapshot()) === JSON.stringify(asyncGeometry);
      minder._scheduleLayout = schedule;
      // 原有删除/重新导入操作必须能清理分组内的节点和连线。
      const removed = minder.getRoot().children[0];
      const removedShapes = removed.children.map(n => n.getRenderContainer().node);
      const removedConnections = removed.children.map(n => n.getConnection() && n.getConnection().node).filter(Boolean);
      minder.removeNode(removed);
      const removedCleanly = removedShapes.concat(removedConnections).every(n => !n.isConnected);
      // 删除的节点不能继续被绘制分组持有或参与后续边界计算。
      let removedNodeRead = false;
      removed.attached = true;
      const oldGetBox = removed.getLayoutBox;
      removed.getLayoutBox = function () { removedNodeRead = true; return oldGetBox.call(this); };
      minder.fire('layoutapply', { node: minder.getRoot() });
      minder._paintGroups.revealForExport()();
      removed.attached = false;
      const removedReferencesReleased = !removedNodeRead;
      const loading = importMindMapProgressively(minder, clone(expected), 1);
      await new Promise(resolve => setTimeout(resolve, 0));
      const replacement = { template: 'right', root: { data: { text: '替换后的根节点' }, children: [{ data: { text: '唯一子节点', progress: 1 }, children: [] }] } };
      await importMindMapProgressively(minder, replacement);
      const cancelled = await loading;
      const replacementSafe = cancelled.cancelled && isMindMapReady(minder) && minder.getAllNode().length === 2 && minder.getRoot().children[0].getData('progress') === 1;
      let failed = false;
      try { await importMindMapProgressively(minder, { template: 'right' }); } catch (error) { failed = true; }
      const failureProtected = failed && minder._mindMapImportFailed && !isMindMapReady(minder);
      await importMindMapProgressively(minder, clone(replacement));
      const retryReady = isMindMapReady(minder) && !minder._mindMapImportFailed;
      return { sameGeometry, sameData, collapsePreserved, graphicsBounded, svgExportComplete, completedStillCacheable, expanderCreatedWhenNeeded, asyncLayoutMatches, removedCleanly, removedReferencesReleased, replacementSafe, failureProtected, retryReady, comparedVisibleNodes: baseline.length };
    });
    fs.writeFileSync(path.join(output, 'regressions.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    for (const name of ['sameGeometry', 'sameData', 'collapsePreserved', 'graphicsBounded', 'svgExportComplete', 'completedStillCacheable', 'expanderCreatedWhenNeeded', 'asyncLayoutMatches', 'removedCleanly', 'removedReferencesReleased', 'replacementSafe', 'failureProtected', 'retryReady']) assert(result[name], `${name} 回归失败`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
