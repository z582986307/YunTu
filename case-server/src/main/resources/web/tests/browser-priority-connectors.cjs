// 合成数据下检查优先级节点与所有连线的真实像素相交，不访问业务数据。
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const root = path.resolve(__dirname, '../../../../../..');
const output = path.join(root, 'temp/builtin-tags-priority');
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
    await page.evaluate(async count => {
      window.__fixtureAcknowledge = true;
      window.testEditor = await window.mountTestEditor({ template: 'right', theme: 'ink-black', base: 1,
        root: { data: { id: 'r', text: '合成根节点', tagCatalog: { added: ['自定义'], removed: ['前置条件', '执行步骤', '预期结果'] } }, children: [
          { data: { id: 'a', text: '无费用' }, children: [{ data: { id: 'a1', text: '无牌通行智能成功出场' } }] },
          { data: { id: 'b', text: '有费用' }, children: [
            { data: { id: 'b1', text: '无牌通行智能成功出场' } },
            { data: { id: 'b2', text: '有牌通行智能成功出场', resource: ['自定义'] } },
          ] },
          ...Array.from({ length: count }, (_, i) => ({ data: { id: `f${i}`, text: `背景${i}` } })),
        ] } }, false, { width: '100%', height: '850px' });
    }, Number(process.env.NODE_COUNT || 0));
    const ready = () => page.waitForFunction(() => {
      const e = window.testEditor, m = e && e.minder;
      return m && !e.state.loading && !m._pendingLayout && (!m._viewLayoutCompletion || m._viewLayoutCompletion.finished) && !e.saveInFlight;
    });
    await ready();
    await page.click('[aria-label="展开外观"]');
    for (const tag of ['前置条件', '执行步骤', '预期结果']) {
      assert(await page.$(`[aria-label="应用标签：${tag}"]`), '内置标签必须显示');
      assert.strictEqual(await page.$(`[aria-label="删除可用标签：${tag}"]`), null, '内置标签不能显示删除按钮');
    }
    await page.click('[aria-label="删除可用标签：自定义"]');
    await ready();
    assert.strictEqual(await page.$('[aria-label="应用标签：自定义"]'), null, '自定义候选应可删除');
    assert.deepStrictEqual(await page.evaluate(() => window.testEditor.minder.getNodeById('b2').getData('resource')), ['自定义'], '删除自定义候选不应删除已用节点标签');
    await page.click('[aria-label="收起外观"]');
    const results = [];
    for (const id of ['a1', 'b1', 'b2']) {
      await page.evaluate(id => window.testEditor.minder.execCommand('camera', window.testEditor.minder.getNodeById(id)), id);
      await page.waitForFunction(id => Boolean(window.testEditor.minder.getNodeById(id).rc), {}, id);
      results.push(await page.evaluate(id => {
        const m = window.testEditor.minder, nodes = []; m.getRoot().traverse(n => { if (!n.getData('id').startsWith('f')) nodes.push(n); });
        m.select(m.getNodeById(id), true);
        m.execCommand('Priority', id === 'a1' ? 1 : id === 'b1' ? 2 : 3);
        const collisions = [];
        for (const n of nodes) {
          if (!n.rc || n.rc.node.style.visibility === 'hidden') continue;
          const b = n.getRenderer('OutlineRenderer').getRenderShape().node.getBoundingClientRect();
          for (const c of nodes) {
            if (!c.getConnection()) continue;
            if (c.getConnection().node.getAttribute('display') === 'none') continue;
            const p = c.getConnection().node, matrix = p.getScreenCTM(), length = p.getTotalLength();
            for (let d = 1; d < length; d += 1) {
              const point = p.getPointAtLength(d), x = matrix.a * point.x + matrix.c * point.y + matrix.e, y = matrix.b * point.x + matrix.d * point.y + matrix.f;
              if (x > b.left + 2 && x < b.right - 2 && y > b.top + 2 && y < b.bottom - 2) { collisions.push({ node: n.getData('id'), connection: c.getData('id'), x, y }); break; }
            }
          }
        }
        return { collisions, nodes: nodes.map(n => ({ id: n.getData('id'), box: n.getContentBox(), vertex: n.getVertexIn() })) };
      }, id));
      await ready();
      assert(await page.evaluate(id => {
        const n = window.testEditor.minder.getNodeById(id);
        return n.rc && n.rc.node.style.visibility !== 'hidden';
      }, id), '完成重排后变更节点必须显示');
    }
    await page.screenshot({ path: path.join(output, `${process.env.EVIDENCE_NAME || 'probe'}-connectors.png`) });
    fs.writeFileSync(path.join(output, `${process.env.EVIDENCE_NAME || 'probe'}-connectors.json`), JSON.stringify(results, null, 2));
    assert(results.every(r => !r.collisions.length), '优先级节点不得与连接线相交');
    console.log('优先级节点连线像素相交检查通过');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
