/* eslint-env jest */
import { captureViewState, restoreViewState, readViewState, writeViewState } from '../src/components/react-mindmap-editor/util/viewState';

const fixture = () => {
  const root = { getData: () => 'r', parent: null, getChildren: () => [parent], isExpanded: () => true };
  const parent = { getData: () => 'p', parent: root, getChildren: () => [child], isExpanded: () => true };
  const child = { getData: () => 'c', parent, getChildren: () => [], getRenderContainer: () => ({ node: {
    getBoundingClientRect: () => ({ left: 250, top: 180 }),
  } }) };
  let movement = { x: 30, y: 40 };
  let selected = [child];
  let zoom = 120;
  const minder = {
    getSelectedNodes: () => selected,
    getRoot: () => root,
    getNodeById: id => ({ r: root, p: parent, c: child }[id]),
    queryCommandValue: () => zoom,
    getOption: () => 200,
    setOption: () => {},
    execCommand: (cmd, value) => { if (cmd.toLowerCase() === 'zoom') zoom = value; },
    select: nodes => { selected = [].concat(nodes); },
    getViewDragger: () => ({ getMovement: () => movement, move: delta => {
      movement = { x: movement.x + delta.x, y: movement.y + delta.y };
    } }),
  };
  const container = { getBoundingClientRect: () => ({ left: 50, top: 80 }) };
  return { minder, container, child, parent, movement: () => movement, selected: () => selected, zoom: () => zoom };
};

test('记录实际缩放和不含正文的节点、祖先及屏幕锚点', () => {
  const { minder, container } = fixture();
  expect(captureViewState(minder, container)).toEqual({ selectedIds: ['c'], ancestorIds: ['p', 'r'],
    zoom: 120, anchor: { x: 200, y: 100 }, movement: { x: 30, y: 40 } });
});

test('节点因新内容移位后按锚点补偿平移，不重复换算缩放', async () => {
  const f = fixture();
  await restoreViewState(f.minder, f.container, { selectedIds: ['c'], ancestorIds: ['p', 'r'],
    zoom: 120, anchor: { x: 320, y: 220 }, movement: { x: -999, y: -999 } });
  expect(f.zoom()).toBe(120);
  expect(f.movement()).toEqual({ x: 130, y: 140 });
  expect(f.selected()).toEqual([f.child]);
});

test('节点删除后选择最近仍存在的祖先', async () => {
  const f = fixture();
  await restoreViewState(f.minder, f.container, { selectedIds: ['deleted'], ancestorIds: ['p', 'r'], zoom: 120 });
  expect(f.selected()).toEqual([f.parent]);
});

test('损坏存储与浏览器禁用存储只能降级，不影响编辑', () => {
  expect(readViewState({ getItem: () => '{' }, 'key')).toBeNull();
  expect(readViewState({ getItem: () => '{"zoom":-1,"selectedIds":[{"text":"secret"}]}' }, 'key')).toBeNull();
  expect(() => writeViewState({ setItem: () => { throw new Error('denied'); } }, 'key', {})).not.toThrow();
});
