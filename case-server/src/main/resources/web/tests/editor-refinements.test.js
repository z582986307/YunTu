/* eslint-env jest */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../src/components/react-mindmap-editor');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('链接和图片提示输入给200字计数预留独立空间', () => {
  ['components/linkModal.js', 'components/imageModal.js'].forEach(file => {
    expect(read(file)).toContain('className="mindmap-caption-input"');
    expect(read(file)).toContain('maxLength={200}');
  });
  expect(read('index.scss')).toMatch(/\.mindmap-caption-input[\s\S]*?padding-right:\s*76px/);
});

test('历史按钮只保留撤销重做，外观图片入口和粘贴能力仍保留', () => {
  const editor = read('index.js');
  const history = editor.slice(editor.indexOf('<div className="mindmap-history-actions">'), editor.indexOf('{this.state.showEditImage'));
  expect(history).not.toContain('aria-label="插入图片"');
  expect(editor).toContain('<ImageModal');
  expect(editor).toContain('MediaGroup');
});

test('链接删除稍向右上移动且保留悬浮桥，外观区有浅分隔线', () => {
  const core = read('assets/kityminder-core/kityminder.core.js');
  expect(core).toContain('remove.setTranslate(23, -7)');
  expect(core).toContain('new kity.Rect(46, 38, -2, -20, 4)');
  expect(read('index.scss')).toMatch(/\.kityminder-tools-tab:not\(\.collapsed\)[\s\S]*?border-bottom:\s*1px solid #e2e8f0/);
});
