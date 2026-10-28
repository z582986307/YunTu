/* eslint-env jest */
import jsonDiff from 'fast-json-patch';
import DoGroup from '../src/components/react-mindmap-editor/toolbar/DoGroup';
import PriorityGroup from '../src/components/react-mindmap-editor/toolbar/PriorityGroup';
import TagGroup from '../src/components/react-mindmap-editor/toolbar/TagGroup';

const synchronousState = instance => {
  instance.setState = (change, cb) => {
    instance.state = { ...instance.state, ...change };
    if (cb) cb();
  };
  return instance;
};

test('普通源用例撤销和重做先等待编辑上传确认，任务只读执行不采用源历史屏障', async () => {
  const order = [];
  let release;
  const minder = { exportJson: () => ({ base: 3, root: { data: { resource: ['synthetic-tag'] } } }),
    applyPatches: () => { order.push('apply'); } };
  const group = synchronousState(new DoGroup({ minder, readOnly: false, sourceEditing: false,
    beginSourceHistory: () => { order.push('prepare'); return new Promise(resolve => { release = resolve; }); },
    wsInstance: { sendMessage: () => { order.push('send'); } } }));
  group.state.undoDiffs = [[{ op: 'remove', path: '/root/data/resource' }]];
  const pending = group.undo({});
  expect(order).toEqual(['prepare']);
  release(true);
  await pending;
  expect(order).toEqual(['prepare', 'send', 'apply']);
  order.length = 0;
  group.state.redoDiffs = [[{ op: 'add', path: '/root/data/resource', value: ['synthetic-tag'] }]];
  const redo = group.redo({});
  expect(order).toEqual(['prepare']);
  release(true);
  await redo;
  expect(order).toEqual(['prepare', 'send', 'apply']);
  order.length = 0;
  group.props = { ...group.props, readOnly: true };
  group.state.undoDiffs = [[{ op: 'remove', path: '/root/data/resource' }]];
  await group.undo({});
  expect(order).toEqual(['send', 'apply']);
});

test('撤销最后一次修改后源版本确认只同步快照 base，不创建伪历史或访问空栈', async () => {
  let data = { base: 1, root: { data: { id: 'r', text: 'before' }, children: [] } };
  const minder = { exportJson: () => JSON.parse(JSON.stringify(data)),
    applyPatches: patches => { data = jsonDiff.applyPatch(data, patches, false, true).newDocument; } };
  let allowed = false;
  const requests = [];
  const group = synchronousState(new DoGroup({ minder, sourceEditing: true, beginSourceHistory: async () => allowed,
    wsInstance: { sendMessage: (type, payload) => requests.push({ type, payload }) } }));
  window.minderData = data;
  data.root.data.text = 'after';
  group.changed();
  await group.undo({});
  expect(data.root.data.text).toBe('after');
  allowed = true;
  await group.undo({});
  expect(data.root.data.text).toBe('before');
  expect(requests).toHaveLength(1);
  data.base = 4;
  group.syncBase(4);
  expect(() => group.changed()).not.toThrow();
  expect(group.hasUndo()).toBe(false);
  expect(group.hasRedo()).toBe(true);
  expect(group.state.lastSnap.base).toBe(4);
});

test('优先级可写真实节点数据，任务执行和无节点时不允许写入', () => {
  const data = {};
  const minder = { getSelectedNodes: () => [{}], execCommand: (command, value) => { data.priority = value; } };
  const group = new PriorityGroup({ minder });
  group.handleAction(2);
  expect(data.priority).toBe(2);
  group.props = { minder, readOnly: true };
  group.handleAction(3);
  expect(data.priority).toBe(2);
  group.props = { minder: { ...minder, getSelectedNodes: () => [] } };
  group.handleAction(1);
  expect(data.priority).toBe(2);
});

test('他人持锁时仍应用服务端历史通知，本地按钮则不能发起写入', async () => {
  let data = { base: 2, root: { data: { text: 'after' } } };
  const minder = { exportJson: () => JSON.parse(JSON.stringify(data)),
    applyPatches: patches => { data = jsonDiff.applyPatch(data, patches, false, true).newDocument; } };
  const sent = [];
  const group = synchronousState(new DoGroup({ minder, isLock: true,
    wsInstance: { sendMessage: type => sent.push(type) } }));
  group.state.undoDiffs = [[{ op: 'replace', path: '/root/data/text', value: 'before' }]];
  await group.undo({});
  expect(data.root.data.text).toBe('after');
  await group.undo('[{"op":"replace","path":"/root/data/text","value":"before"}]');
  expect(data.root.data.text).toBe('before');
  expect(sent).toEqual([]);
});

test('标签资源空值安全、过滤空白去重、可移除且只读操作不改变节点', () => {
  let resource = null;
  const minder = { getSelectedNodes: () => [{}], queryCommandValue: () => resource,
    execCommand: (command, value) => { resource = value; } };
  const group = synchronousState(new TagGroup({ minder, tags: [] }));
  expect(() => group.onAdd('  smoke  ')).not.toThrow();
  group.onAdd('smoke');
  group.onAdd(' ');
  expect(resource).toEqual(['smoke']);
  group.props = { minder, readOnly: true };
  group.onRemove('smoke');
  expect(resource).toEqual(['smoke']);
  group.props = { minder };
  group.onRemove('smoke');
  expect(resource).toBeNull();
});
