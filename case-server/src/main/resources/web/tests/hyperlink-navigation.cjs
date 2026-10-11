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
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(fs.readFileSync(path.join(deps, 'kity/dist/kity.js')));
    } else if (request.url === '/core.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(fs.readFileSync(core));
    } else if (request.url === '/editor.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(fs.readFileSync(path.join(output, 'editor-build/editor.js')));
    } else if (request.url === '/linked-target') {
      response.end('linked target');
    } else if (request.url === '/editor') {
      response.end('<!doctype html><div id="map"></div><script src="/editor.js"></script>');
    } else if (request.url === '/layout-editor') {
      response.end('<!doctype html><section class="case-detail-page"><div class="case-detail-shell"><div class="case-detail-heading"></div><div class="case-detail-content" id="map"></div></div></section><script src="/editor.js"></script>');
    } else {
      response.end('<!doctype html><div id="map" style="width:1000px;height:600px"></div><script src="/kity.js"></script><script src="/core.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      userDataDir: path.join(output, `chrome-link-${process.pid}`),
      args: ['--disable-extensions', '--no-first-run'],
    });
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/`);
    const result = await page.evaluate(target => {
      const minder = new window.kityminder.Minder({ renderTo: '#map' });
      minder.importJson({ template: 'right', root: { data: { text: '用例' }, children: [
        { data: { text: '链接节点', hyperlink: `  ${target}  ` }, children: [] },
        { data: { text: '旧链接', hyperlink: 'www.example.com/path' }, children: [] },
        { data: { text: '不安全链接', hyperlink: 'javascript:alert(1)' }, children: [] },
      ] } });
      const link = minder.getRoot().children[0].getRenderer('hyperlinkrender').getRenderShape().node.querySelector('a');
      const oldLink = minder.getRoot().children[1].getRenderer('hyperlinkrender').getRenderShape().node.querySelector('a');
      const unsafeLink = minder.getRoot().children[2].getRenderer('hyperlinkrender').getRenderShape().node.querySelector('a');
      const href = node => node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      const result = { href: href(link), target: link.getAttribute('target'), oldHref: href(oldLink), unsafeHref: href(unsafeLink) };
      minder.importJson({ template: 'right', root: { data: { text: '用例' }, children: [
        { data: { text: '链接节点', hyperlink: target }, children: [] },
      ] } });
      minder.setOption('viewAnimationDuration', 0);
      minder.execCommand('camera', minder.getRoot().children[0], 0);
      return result;
    }, `${origin}/linked-target`);
    assert.strictEqual(result.href, `${origin}/linked-target`, '链接应使用插入的地址，而不是当前页面的 #');
    assert.strictEqual(result.target, '_blank', '点击链接应新开页面');
    assert.strictEqual(result.oldHref, 'https://www.example.com/path', '已保存的无协议链接应补全协议');
    assert.strictEqual(result.unsafeHref, null, '不安全协议不应打开当前页面或外部页面');
    await page.waitForTimeout(350);
    const linkPoint = await page.evaluate(target => {
      const node = [...window.document.querySelectorAll('svg a')].find(item =>
        item.getAttributeNS('http://www.w3.org/1999/xlink', 'href') === target);
      const rect = node.getBoundingClientRect();
      for (let y = 2; y < rect.height; y += 2) {
        for (let x = 2; x < rect.width; x += 2) {
          const hit = document.elementFromPoint(rect.x + x, rect.y + y);
          if (hit && hit.closest('a') === node) return { x: rect.x + x, y: rect.y + y };
        }
      }
      return null;
    }, `${origin}/linked-target`);
    assert(linkPoint, '节点链接图标应具有可点击区域');
    const popup = browser.waitForTarget(target => target.url() === `${origin}/linked-target`, { timeout: 5000 });
    await page.mouse.click(linkPoint.x, linkPoint.y);
    await popup;
    assert.strictEqual(page.url(), `${origin}/`, '原用例管理页面应保持不变');
    const editorPage = await browser.newPage();
    await editorPage.goto(`${origin}/editor`);
    await editorPage.evaluate(async target => {
      window.testEditor = await window.mountTestEditor({ template: 'right', root: {
        data: { text: '用例' }, children: [{ data: { text: '链接节点', hyperlink: target }, children: [] }],
      } }, true);
    }, `${origin}/linked-target`);
    await editorPage.waitForFunction(() => {
      const instance = window.testEditor;
      const child = instance && instance.minder.getRoot().children[0];
      return child && child._renderers;
    }, { timeout: 10000 });
    const panelLayout = await editorPage.evaluate(() => {
      document.querySelector('.kityminder-editor-container').style.height = '720px';
      const filter = document.querySelector('.execution-filter-panel').getBoundingClientRect();
      const result = document.querySelector('.execution-result-panel').getBoundingClientRect();
      const handles = [...document.querySelectorAll('.execution-panel-collapse-handle')].map(button => {
        const rect = button.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button;
      });
      return { filterBottom: filter.bottom, resultTop: result.top, handles };
    });
    assert(panelLayout.filterBottom + 8 <= panelLayout.resultTop,
      `笔记本高度下执行进度和标记结果悬浮窗不应重叠：${JSON.stringify(panelLayout)}`);
    assert(panelLayout.handles.every(Boolean), `展开面板的收起按钮应保持可点击：${JSON.stringify(panelLayout)}`);
    const initialZoom = await editorPage.evaluate(() => ({
      actual: window.testEditor.minder.queryCommandValue('zoom'),
      displayed: document.querySelector('.nav-bar .zoom-text').textContent.trim(),
    }));
    assert.strictEqual(initialZoom.actual, 120, '当前实际 120% 应成为新默认比例');
    assert.strictEqual(initialZoom.displayed, '100%', '新默认比例应显示 100%');
    const toolbarStyle = await editorPage.evaluate(() => {
      const history = [...document.querySelectorAll('.do-group .ant-btn-link')].map(button => {
        const icon = button.querySelector('.do-group-history-icon');
        const label = button.querySelector('.do-group-label');
        const buttonBox = button.getBoundingClientRect();
        const iconBox = icon.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        const paths = [...icon.querySelectorAll('path')].map(path => path.getBoundingClientRect());
        return {
          visualCenter: (Math.min(iconBox.top, labelBox.top) + Math.max(iconBox.bottom, labelBox.bottom)) / 2,
          visualX: (Math.min(...paths.map(box => box.left), labelBox.left) + Math.max(...paths.map(box => box.right), labelBox.right)) / 2,
          buttonCenter: (buttonBox.top + buttonBox.bottom) / 2,
          buttonX: (buttonBox.left + buttonBox.right) / 2,
        };
      });
      const outlook = document.querySelector('.mindmap-outlook-toggle');
      const fullscreen = [...document.querySelectorAll('.kityminder-tools-tab .ant-btn-link')].find(item => item.textContent.includes('全屏'));
      return {
        history,
        outlookColor: getComputedStyle(outlook).color,
        fullscreenColor: getComputedStyle(fullscreen).color,
      };
    });
    assert.strictEqual(toolbarStyle.history.length, 2, '撤销、重做按钮应同时展示');
    for (const button of toolbarStyle.history) {
      assert(Math.abs(button.visualCenter - button.buttonCenter) < 0.75, `撤销/重做内容应垂直居中：${JSON.stringify(button)}`);
      assert(Math.abs(button.visualX - button.buttonX) < 0.5, `撤销/重做图标与文字整体应水平居中：${JSON.stringify(button)}`);
    }
    await editorPage.mouse.move(500, 250);
    await editorPage.keyboard.down('Control');
    await editorPage.mouse.wheel({ deltaY: -120 });
    await editorPage.waitForTimeout(50);
    const zoomedIn = await editorPage.evaluate(() => window.testEditor.minder.queryCommandValue('zoom'));
    assert(zoomedIn > 120, `Ctrl+滚轮向上应放大: ${zoomedIn}`);
    await editorPage.mouse.wheel({ deltaY: 120 });
    await editorPage.keyboard.up('Control');
    await editorPage.waitForTimeout(50);
    const zoomedOut = await editorPage.evaluate(() => window.testEditor.minder.queryCommandValue('zoom'));
    assert(zoomedOut < zoomedIn, 'Ctrl+滚轮向下应缩小');
    const hover = await editorPage.evaluate(() => {
      const node = window.testEditor.minder.getRoot().children[0];
      const shape = node.getRenderer('hyperlinkrender').getRenderShape().node;
      const link = shape.querySelector('a');
      const remove = shape.querySelector('[data-link-remove="true"]');
      const color = shape.querySelector('a path:last-child').getAttribute('fill');
      return { link: Boolean(link), remove: Boolean(remove), hidden: remove && getComputedStyle(remove).display === 'none', color };
    });
    assert(hover.link && hover.remove && hover.hidden, `节点链接右侧应有默认隐藏的删除按钮: ${JSON.stringify(hover)}`);
    await editorPage.evaluate(() => {
      const minder = window.testEditor.minder;
      minder.setOption('viewAnimationDuration', 0);
      minder.execCommand('camera', minder.getRoot().children[0], 0);
    });
    await editorPage.waitForTimeout(350);
    const nodeLinkPoint = await editorPage.evaluate(() => {
      const shape = window.testEditor.minder.getRoot().children[0].getRenderer('hyperlinkrender').getRenderShape().node;
      const link = shape.querySelector('a').getBoundingClientRect();
      return { x: link.x + link.width / 2, y: link.y + link.height / 2 };
    });
    await editorPage.mouse.move(nodeLinkPoint.x, nodeLinkPoint.y);
    const shown = await editorPage.evaluate(() => {
      const shape = window.testEditor.minder.getRoot().children[0].getRenderer('hyperlinkrender').getRenderShape().node;
      return getComputedStyle(shape.querySelector('[data-link-remove="true"]')).display !== 'none';
    });
    assert(shown, '悬浮节点链接时应显示删除按钮');
    const removePoint = await editorPage.evaluate(() => {
      const shape = window.testEditor.minder.getRoot().children[0].getRenderer('hyperlinkrender').getRenderShape().node;
      const remove = shape.querySelector('[data-link-remove="true"]').getBoundingClientRect();
      return { x: remove.x + remove.width / 2, y: remove.y + remove.height / 2 };
    });
    await editorPage.mouse.move((nodeLinkPoint.x + removePoint.x) / 2, nodeLinkPoint.y);
    const stillShown = await editorPage.evaluate(() => {
      const shape = window.testEditor.minder.getRoot().children[0].getRenderer('hyperlinkrender').getRenderShape().node;
      return getComputedStyle(shape.querySelector('[data-link-remove="true"]')).display !== 'none';
    });
    assert(stillShown, '鼠标从链接移向删除按钮时按钮不应消失');
    assert.strictEqual(hover.color, '#3370ff', '节点链接应采用与返回文字一致的主蓝色');
    await editorPage.mouse.move(removePoint.x, removePoint.y);
    await editorPage.mouse.click(removePoint.x, removePoint.y);
    const deleted = await editorPage.evaluate(() => {
      const node = window.testEditor.minder.getRoot().children[0];
      const renderer = node.getRenderer('hyperlinkrender');
      return { url: node.getData('hyperlink'), visible: Boolean(renderer.getRenderShape() &&
        getComputedStyle(renderer.getRenderShape().node).display !== 'none') };
    });
    assert.strictEqual(deleted.url, null, '删除后节点应清除链接数据');
    assert.strictEqual(deleted.visible, false, '删除后节点不应继续显示链接图标');
    assert.strictEqual(toolbarStyle.outlookColor, toolbarStyle.fullscreenColor, '外观文案应与全屏文案同色');
    const layout = await editorPage.evaluate(() => {
      const outer = document.querySelector('.kityminder-editor-container').getBoundingClientRect();
      const canvas = document.querySelector('.kityminder-core-container').getBoundingClientRect();
      const navigation = document.querySelector('.nav-bar').getBoundingClientRect();
      let trackNode = document.querySelector('.mindmap-scroll-track.horizontal');
      if (!trackNode) {
        trackNode = document.createElement('div');
        trackNode.className = 'mindmap-scroll-track horizontal';
        document.querySelector('.mindmap-scrollbars').appendChild(trackNode);
      }
      const track = trackNode.getBoundingClientRect();
      return { outerBottom: outer.bottom, canvasBottom: canvas.bottom, navigationBottom: navigation.bottom, trackTop: track.top };
    });
    assert(Math.abs(layout.canvasBottom - layout.outerBottom) <= 1, `普通模式画布应延伸到编辑器底部：${JSON.stringify(layout)}`);
    assert(layout.navigationBottom < layout.trackTop, '横向滚动条应在缩放工具条下方');
    await editorPage.evaluate(() => window.testEditor.setState({ fullScreen: true }));
    const fullScreen = await editorPage.evaluate(() => {
      const outer = document.querySelector('.kityminder-editor-container').getBoundingClientRect();
      const canvas = document.querySelector('.kityminder-core-container').getBoundingClientRect();
      return { outerBottom: outer.bottom, canvasBottom: canvas.bottom, viewportBottom: window.innerHeight };
    });
    assert(Math.abs(fullScreen.outerBottom - fullScreen.viewportBottom) <= 1, '全屏编辑器应到达视口底部');
    assert(Math.abs(fullScreen.canvasBottom - fullScreen.viewportBottom) <= 1, '全屏画布底部不应留灰色空白');
    const layoutPage = await browser.newPage();
    await layoutPage.setViewport({ width: 1200, height: 800 });
    await layoutPage.goto(`${origin}/layout-editor`);
    await layoutPage.evaluate(async () => {
      window.layoutEditor = await window.mountTestEditor({ template: 'right', root: { data: { text: '用例' }, children: [] } }, false, {});
    });
    const viewportLayout = await layoutPage.evaluate(() => {
      const rect = document.querySelector('.kityminder-core-container').getBoundingClientRect();
      return { left: rect.left, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert(Math.abs(viewportLayout.left) <= 1, '非全屏画布左侧应贴住浏览器边缘');
    assert(Math.abs(viewportLayout.right - viewportLayout.viewportWidth) <= 1, '非全屏画布右侧应贴住浏览器边缘');
    assert(Math.abs(viewportLayout.bottom - viewportLayout.viewportHeight) <= 1, `非全屏画布底部应贴住浏览器边缘: ${JSON.stringify(viewportLayout)}`);
    const returnColors = await layoutPage.evaluate(() => {
      const button = document.createElement('button');
      button.className = 'ant-btn ant-btn-link case-detail-back';
      button.innerHTML = '<i class="anticon">←</i><span>返回</span>';
      document.body.appendChild(button);
      const colors = {
        button: getComputedStyle(button).color,
        icon: getComputedStyle(button.querySelector('.anticon')).color,
        text: getComputedStyle(button.querySelector('span')).color,
      };
      button.remove();
      return colors;
    });
    assert.strictEqual(returnColors.icon, returnColors.text, '返回按钮图标应与返回文案同色');
    assert.strictEqual(returnColors.button, returnColors.text, '返回按钮应与返回文案同色');
    const modalPage = await browser.newPage();
    await modalPage.goto(`${origin}/editor`);
    await modalPage.evaluate(async () => {
      window.testEditor = await window.mountTestEditor({ template: 'right', root: {
        data: { text: '用例' }, children: [{ data: { text: '链接节点' }, children: [] }],
      } }, true);
    });
    await modalPage.waitForFunction(() => {
      const instance = window.testEditor;
      const child = instance && instance.minder.getRoot().children[0];
      return child && child._renderers;
    }, { timeout: 10000 });
    await modalPage.evaluate(() => {
      const minder = window.testEditor.minder;
      minder.select(minder.getRoot().children[0], true);
      minder.fire('receiverfocus');
    });
    await modalPage.waitForSelector('button[aria-label="插入链接"]:not([disabled])', { timeout: 10000 });
    await modalPage.click('button[aria-label="插入链接"]');
    await modalPage.waitForSelector('.yuntu-modal input[placeholder="选填：鼠标在链接上悬停时提示的文本"]', { timeout: 10000 });
    const titleInput = '.yuntu-modal input[placeholder="选填：鼠标在链接上悬停时提示的文本"]';
    const modalTitle = await modalPage.$eval('.yuntu-modal .ant-modal-title', node => node.textContent.trim());
    assert.strictEqual(modalTitle, '插入链接', '链接弹窗标题应为插入链接');
    await modalPage.click(titleInput);
    await modalPage.keyboard.type('字');
    await modalPage.waitForFunction(() => document.querySelector('.link-title-remaining').textContent.trim() === '199/200');
    const firstCount = await modalPage.$eval('.link-title-remaining', node => node.textContent.trim());
    assert.strictEqual(firstCount, '199/200', '输入一个字后应显示剩余 199/200');
    await modalPage.keyboard.type('字'.repeat(200));
    const titleLimit = await modalPage.evaluate(selector => ({
      length: document.querySelector(selector).value.length,
      remaining: document.querySelector('.link-title-remaining').textContent.trim(),
    }), titleInput);
    assert.deepStrictEqual(titleLimit, { length: 200, remaining: '0/200' }, '提示文本应限制 200 字并显示剩余数量');
    console.log(JSON.stringify(result));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
