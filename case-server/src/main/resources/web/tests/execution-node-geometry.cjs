const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const root = path.resolve(__dirname, '../../../../../..');
const deps = path.join(root, '项目依赖/YunTu-Web/node_modules');
const puppeteer = require(path.join(deps, 'puppeteer-core'));
const core = path.resolve(__dirname, '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js');
const output = path.join(root, '运行日志/脑图性能');

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((request, response) => {
    if (request.url === '/kity.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(path.join(deps, 'kity/dist/kity.js')));
      return;
    }
    if (request.url === '/core.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(core));
      return;
    }
    response.end('<!doctype html><div id="map" style="width:1000px;height:600px"></div><script src="/kity.js"></script><script src="/core.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: path.join(output, `chrome-geometry-${process.pid}`),
      args: ['--disable-extensions', '--no-first-run'],
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const states = await page.evaluate(() => {
      const minder = new window.kityminder.Minder({ renderTo: '#map' });
      minder.importJson({ template: 'right', theme: 'byte-blue', root: {
        data: { text: '根节点' }, children: [{ data: { text: '分组' }, children: [{ data: { text: '末级用例' }, children: [] }] }],
      } });
      const leaf = minder.getRoot().children[0].children[0];
      const metrics = () => {
        const outline = leaf.getRenderer('OutlineRenderer').getRenderShape().node.getBoundingClientRect();
        const text = leaf.getRenderer('TextRenderer').getRenderShape().node.getBoundingClientRect();
        const connection = leaf.getConnection().node.getBoundingClientRect();
        const priority = leaf.getRenderer('PriorityRenderer');
        const progress = leaf.getRenderer('ProgressRenderer');
        const hyperlink = leaf.getRenderer('hyperlinkrender');
        const pick = rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        const visible = renderer => Boolean(renderer.getRenderShape() && getComputedStyle(renderer.getRenderShape().node).display !== 'none');
        return {
          outline: pick(outline), text: pick(text), connection: pick(connection),
          layout: pick(leaf.getLayoutBox()),
          progressVisible: visible(progress),
          priorityVisible: visible(priority),
          progressIcon: progress.getRenderShape() ? pick(progress.getRenderShape().node.getBoundingClientRect()) : null,
          linkIcon: visible(hyperlink) ? pick(hyperlink.getRenderShape().node.querySelector('a').getBoundingClientRect()) : null,
        };
      };
      minder.select(leaf, true);
      const before = metrics();
      minder.execCommand('Progress', 1);
      const marked = metrics();
      minder.execCommand('Progress', undefined);
      const cleared = metrics();
      minder.execCommand('HyperLink', 'https://example.com/case', '用例链接');
      const linked = metrics();
      minder.execCommand('HyperLink', null, null);
      const unlinked = metrics();
      return { before, marked, cleared, linked, unlinked, zoom: minder.queryCommandValue('zoom'), result: leaf.getData('progress') };
    });
    for (const key of ['outline', 'text', 'connection', 'layout']) {
      assert.deepStrictEqual(states.marked[key], states.before[key], `${key} 标记后发生位置或尺寸变化`);
      assert.deepStrictEqual(states.cleared[key], states.before[key], `${key} 取消标记后发生位置或尺寸变化`);
      assert.deepStrictEqual(states.unlinked[key], states.before[key], `${key} 删除链接后发生位置或尺寸变化`);
    }
    assert.deepStrictEqual(states.linked.text, states.before.text, '添加链接后节点文字不应移动');
    assert.strictEqual(states.linked.outline.x, states.before.outline.x, '添加链接后节点左边框不应移动');
    assert.strictEqual(states.linked.outline.height, states.before.outline.height, '添加链接后节点高度不应变化');
    assert(states.linked.outline.width > states.before.outline.width, '添加链接后只应向右扩展节点边框');
    assert(states.linked.linkIcon.x >= states.linked.outline.x &&
      states.linked.linkIcon.x + states.linked.linkIcon.width <= states.linked.outline.x + states.linked.outline.width,
    `链接图标应处于节点边框内：${JSON.stringify(states.linked)}`);
    assert.strictEqual(states.before.progressVisible, false, '未标记不应显示执行结果图标');
    assert.strictEqual(states.marked.progressVisible, true, '标记后应显示执行结果图标');
    assert.strictEqual(states.cleared.progressVisible, false, '取消标记后应隐藏执行结果图标');
    assert.strictEqual(states.before.priorityVisible, false, '无优先级数据时不应显示额外图标');
    assert(states.before.outline.width / (states.zoom / 100) < 80, '未标记节点不应为隐藏图标留出明显空白');
    assert(states.marked.progressIcon.width / (states.zoom / 100) > 8.5, '节点内的结果图标应比原尺寸稍大');
    assert(states.marked.progressIcon.x + states.marked.progressIcon.width <= states.marked.text.x,
      `状态图标不应遮住节点内文案：${JSON.stringify({ icon: states.marked.progressIcon, text: states.marked.text })}`);
    assert(states.marked.progressIcon.x >= states.marked.outline.x &&
      states.marked.progressIcon.x + states.marked.progressIcon.width <= states.marked.outline.x + states.marked.outline.width &&
      states.marked.progressIcon.y >= states.marked.outline.y &&
      states.marked.progressIcon.y + states.marked.progressIcon.height <= states.marked.outline.y + states.marked.outline.height,
    `状态图标应完整处于节点内：${JSON.stringify({ icon: states.marked.progressIcon, outline: states.marked.outline })}`);
    assert.strictEqual(states.result, null, '取消标记后应清除执行结果');
    console.log(JSON.stringify(states));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
