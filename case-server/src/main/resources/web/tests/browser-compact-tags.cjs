// 合成脑图中检查标签配色与几何，只有网络边界替换为夹具。
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const root = path.resolve(__dirname, '../../../../../..');
const output = path.join(root, 'temp/compact-colored-tags');
const puppeteer = require(path.join(root, '项目依赖/YunTu-Web/node_modules/puppeteer-core'));
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/editor.js' ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(req.url === '/editor.js' ? fs.readFileSync(path.join(root, 'temp/tag-catalog-priority/editor-build/editor.js')) : '<div id="map"></div><script src="/editor.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
      userDataDir: path.join(output, `chrome-${process.pid}`), defaultViewport: { width: 1500, height: 900 } });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      window.__fixtureAcknowledge = true;
      window.testEditor = await window.mountTestEditor({ template: 'right', theme: 'byte-blue', base: 1,
        root: { data: { id: 'r', text: '标签样式验收' }, children: [
          { data: { id: 'a', text: '节点正文保持原样' } },
          { data: { id: 'b', text: '后续节点位置' } },
        ] } }, false, { width: '100%', height: '850px' });
      window.tagGeometry = () => {
        const m = window.testEditor.minder, n = m.getNodeById('a');
        const rect = shape => { const b = shape.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
        return { outline: rect(n.getRenderer('OutlineRenderer').getRenderShape().node),
          text: rect(n.getRenderer('TextRenderer').getRenderShape().node),
          badges: Array.from(n.rc.node.querySelectorAll('.km-resource-badge')).map(g => ({
            rect: rect(g.firstElementChild), fill: g.firstElementChild.getAttribute('fill'),
            textFill: g.querySelector('text').getAttribute('fill'), fontSize: Number(g.querySelector('text').getAttribute('font-size')),
          })) };
      };
    });
    const ready = () => page.waitForFunction(() => { const e = window.testEditor, m = e && e.minder;
      return m && !e.state.loading && !m._pendingLayout && (!m._viewLayoutCompletion || m._viewLayoutCompletion.finished) && !e.saveInFlight; });
    await ready();
    const results = [];
    for (const font of [12, 10, 18, 8, 24, 12]) {
      await page.evaluate(font => { const m = window.testEditor.minder, n = m.getNodeById('a'); m.select(n, true); m.execCommand('Resource', null);
        m.execCommand('FontSize', font); }, font);
      await ready();
      const before = await page.evaluate(() => window.tagGeometry());
      await page.evaluate(() => window.testEditor.minder.execCommand('Resource', ['前置条件', '执行步骤', '预期结果']));
      await ready();
      const after = await page.evaluate(() => window.tagGeometry());
      results.push({ font, before, after });
    }
    await page.screenshot({ path: path.join(output, `${process.env.EVIDENCE_NAME || 'probe'}.png`) });
    fs.writeFileSync(path.join(output, `${process.env.EVIDENCE_NAME || 'probe'}.json`), JSON.stringify(results, null, 2));
    for (const { font, before, after } of results) {
      assert(Math.abs(after.outline.height - before.outline.height) <= 1, '添加标签不能撑高节点');
      assert(Math.abs(after.outline.y - before.outline.y) <= 1, '添加标签不能上下移动节点');
      assert(Math.abs(after.text.height - before.text.height) <= 1 && Math.abs(after.text.width - before.text.width) <= 1, '不能缩小正文');
      assert(after.outline.width > before.outline.width, '标签只按需向右延长');
      assert(after.badges.every(b => b.fontSize < font), '标签字号应比正文小');
      assert(new Set(after.badges.map(b => b.fill)).size === 3, '三个标签应有不同浅色');
      assert(after.badges.every(b => b.rect.y >= after.outline.y && b.rect.y + b.rect.height <= after.outline.y + after.outline.height), '标签必须在节点框内');
    }
    console.log('标签颜色、字号、节点高度及正文尺寸检查通过');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
