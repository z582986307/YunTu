/* eslint-env jest */
import { buildSaveContent, shouldRecoverCachedContent } from '../src/components/react-mindmap-editor/util/saveContent';

test('手动保存与编辑补丁使用相同的脑图方向字段', () => {
  const minder = { exportJson: () => ({ base: 53, theme: 'ink-black', root: { data: { text: '用例' }, children: [] } }) };
  const content = JSON.parse(buildSaveContent(minder, { right: 1 }));
  expect(content).toEqual({ base: 53, theme: 'ink-black', root: { data: { text: '用例' }, children: [] }, right: 1 });
});

test('同版本的旧缓存不得覆盖服务端已保存的外观', () => {
  expect(shouldRecoverCachedContent({ base: 53, theme: 'ink-black' }, { base: 53, theme: 'byte-blue', root: {} })).toBe(false);
  expect(shouldRecoverCachedContent({ base: 53 }, { base: 54, root: {} })).toBe(true);
  expect(shouldRecoverCachedContent({ base: 54 }, { base: 53, root: {} })).toBe(false);
});

test('手动保存包含主题图形和节点字体配置', () => {
  const minder = { exportJson: () => ({ base: 54, theme: 'ink-black', template: 'fish-bone',
    root: { data: { id: 'root', 'font-size': 24, 'font-family': 'Arial', color: '#111111' }, children: [] } }) };
  const saved = JSON.parse(buildSaveContent(minder, { right: 1 }));
  expect(saved.theme).toBe('ink-black');
  expect(saved.template).toBe('fish-bone');
  expect(saved.root.data).toMatchObject({ 'font-size': 24, 'font-family': 'Arial', color: '#111111' });
});

test('未修改的脑图手动保存沿用服务端原始内容，避免默认外观补值造成冲突', () => {
  const raw = { base: 54, root: { data: { id: 'root', text: '原文' }, children: [] } };
  const minder = { exportJson: () => ({ ...raw, theme: 'byte-blue', template: 'right',
    root: { data: { ...raw.root.data, layout: 'right', expandState: 'expand' }, children: [] } }) };
  expect(JSON.parse(buildSaveContent(minder, { right: 1 }, raw, false))).toEqual(raw);
  expect(buildSaveContent(minder, { right: 1 }, { base: 54, serialized: JSON.stringify(raw) }, false)).toBe(JSON.stringify(raw));
  expect(JSON.parse(buildSaveContent(minder, { right: 1 }, raw, true)).theme).toBe('byte-blue');
});
