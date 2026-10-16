import { projectComparison } from '../src/pages/contrast/comparisonFilter';

const node = (id, background, children = []) => ({ data: { id, text: id, ...(background ? { background } : {}) }, children });

test('按新增、删除、内容变更筛选，并保留上级路径与原始数据', () => {
  const source = { base: 7, root: node('root', null, [
    node('branch', null, [node('added', '#ddfade')]),
    node('changed', '#d6f0ff'),
    node('deleted', '#ffe7e7', [node('deleted-child', '#ffe7e7')]),
    node('plain'),
  ]) };
  const added = projectComparison(source, 'added');
  expect(added.content.root.children.map(item => item.data.id)).toEqual(['branch']);
  expect(added.content.root.children[0].children.map(item => item.data.id)).toEqual(['added']);
  expect(added.count).toBe(1);
  const changed = projectComparison(source, 'changed');
  expect(changed.content.root.children.map(item => item.data.id)).toEqual(['changed']);
  const deleted = projectComparison(source, 'deleted');
  expect(deleted.content.root.children.map(item => item.data.id)).toEqual(['deleted']);
  expect(deleted.count).toBe(2);
  expect(source.root.children).toHaveLength(4);
  expect(projectComparison(source, 'all').content).toBe(source);
});

test('无匹配时只保留中心主题，深层脑图不递归溢出', () => {
  const source = { root: node('root') };
  let cursor = source.root;
  for (let index = 0; index < 5000; index++) {
    const child = node(`level-${index}`, index === 4999 ? '#d6f0ff' : null);
    cursor.children = [child];
    cursor = child;
  }
  const missing = projectComparison(source, 'added');
  expect(missing.count).toBe(0);
  expect(missing.content.root.children).toEqual([]);
  const changed = projectComparison(source, 'changed');
  expect(changed.count).toBe(1);
  expect(changed.content.root.children).toHaveLength(1);
  expect(source.root.children).toHaveLength(1);
});
