/* eslint-env jest */
import { buildSaveContent } from '../src/components/react-mindmap-editor/util/saveContent';

test('手动保存与编辑补丁使用相同的脑图方向字段', () => {
  const minder = { exportJson: () => ({ base: 53, theme: 'ink-black', root: { data: { text: '用例' }, children: [] } }) };
  const content = JSON.parse(buildSaveContent(minder, { right: 1 }));
  expect(content).toEqual({ base: 53, theme: 'ink-black', root: { data: { text: '用例' }, children: [] }, right: 1 });
});
