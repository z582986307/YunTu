// 由隔离编辑器浏览器夹具调用；本模块不启动浏览器/服务，也不访问业务数据。
const assert = require('assert');

module.exports = async function verifySearchFocus(page) {
  for (const execution of [false, true]) {
    for (const large of [false, true]) {
      await page.evaluate(async ({ execution, large }) => {
        if (window.testEditor) window.unmountTestEditor();
        const children = Array.from({ length: large ? 2100 : 12 }, (_, i) => ({
          data: { text: `普通节点-${i}` }, children: [],
        }));
        children.push({ data: { text: '折叠分支', expandState: 'collapse' }, children: [
          { data: { text: '搜索唯一目标' }, children: [] },
        ] });
        window.testEditor = await window.mountTestEditor({ template: 'right', base: 1,
          root: { data: { text: '隔离测试根节点' }, children } }, execution);
        window.testMinder = window.testEditor.minder;
      }, { execution, large });
      await page.waitForFunction(() => {
        const m = window.testMinder;
        return m && !window.testEditor.state.loading && !m._progressiveImporting &&
          !m._pendingLayout && (!m._viewLayoutCompletion || m._viewLayoutCompletion.finished);
      });
      const search = await page.$('.mindmap-header-search input');
      await search.type('搜索唯一目标');
      await search.press('Enter');
      // 断言实际 SVG 屏幕坐标，不以camera调用次数、固定sleep或放大超时替代结果。
      await page.waitForFunction(() => {
        const m = window.testMinder;
        const selected = m.getSelectedNode();
        if (!selected || selected.getText() !== '搜索唯一目标' || !selected.rc) return false;
        if (m._progressiveImporting || m._pendingLayout ||
            (m._viewLayoutCompletion && !m._viewLayoutCompletion.finished)) return false;
        const node = selected.getRenderContainer().getRenderBox('screen');
        const canvas = m.getPaper().node.getBoundingClientRect();
        return Math.abs(node.x + node.width / 2 - canvas.left - canvas.width / 2) < 3 &&
          Math.abs(node.y + node.height / 2 - canvas.top - canvas.height / 2) < 3;
      });
      assert.strictEqual(await page.evaluate(() => window.testMinder.getSelectedNode().getText()), '搜索唯一目标');
    }
  }
  return '用例/任务、小图/大图折叠隐藏首命中真实SVG居中通过';
};
