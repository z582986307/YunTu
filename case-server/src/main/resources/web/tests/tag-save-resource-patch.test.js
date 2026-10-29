/* eslint-env jest */
import fs from 'fs';
import path from 'path';
import jsonDiff from 'fast-json-patch';
import DoGroup from '../src/components/react-mindmap-editor/toolbar/DoGroup';

const core = fs.readFileSync(path.join(__dirname, '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js'), 'utf8');
test('内置标签在命令层也不能删除，不生成删除配置', () => {
  const start = core.indexOf('var TagCatalogCommand =');
  const data = {};
  const minder = { getRoot: () => ({ getData: key => data[key], setData: (key, value) => { data[key] = value; } }) };
  for (const value of ['前置条件', '执行步骤', '预期结果']) {
    method('execute', 'queryValue', {}, start)(minder, value, 'remove');
    expect(data.tagCatalog).toBeUndefined();
  }
});
const method = (name, next, context = {}, offset = 0) => {
  const start = core.indexOf(`${name}: function`, offset) + name.length + 2;
  const end = core.indexOf(`${next}: function`, start);
  const section = core.slice(start, end);
  return Function(...Object.keys(context), `return (${section.slice(0, section.lastIndexOf('},') + 1)});`)(...Object.values(context));
};
const patchStart = core.indexOf('function applyPatch(minder, patch)');
const patchEnd = core.indexOf('kity.extendClass(Minder, {', patchStart);
const applyPatch = Function(`return (${core.slice(patchStart, patchEnd).trim()});`)();
test('优先级渲染失败时恢复暂存显示标记，避免节点永久隐藏', () => {
  const data = {}, node = { data, setData: (key, value) => { data[key] = value; }, render: () => { throw new Error('synthetic-render-failure'); } };
  const minder = { getSelectedNodes: () => [node], layout: () => {}, _recoverExpandLayout() {
    this._expandLayoutPending = false; node._expandRevealPending = false;
  } };
  const execute = method('execute', 'queryValue', { PRIORITY_DATA: 'priority' }, core.indexOf('var PriorityCommand ='));
  expect(() => execute(minder, 1)).toThrow('synthetic-render-failure');
  expect(minder._expandLayoutPending).toBe(false);
  expect(node._expandRevealPending).toBe(false);
});
test('历史与远端优先级补丁在渲染前进入最终布局事务', () => {
  const observed = [];
  const node = { data: {}, render() { observed.push([minder._expandLayoutPending, this._expandRevealPending]); } };
  const minder = { getRoot: () => node, layout: () => {}, fire: () => {} };
  applyPatch(minder, { op: 'add', path: '/root/data/priority', value: 2 });
  expect(node.data.priority).toBe(2);
  expect(observed).toEqual([[true, true]]);
});
const clone = value => JSON.parse(JSON.stringify(value));

// 运行实际 importJson/importNode/exportJson/Resource.execute/applyPatch 方法，
// 仅替换与数据契约无关的 SVG 绘制宿主；服务端镜像严格校验 RFC6902。
const fixture = (initialData, multi = false, childData = {}) => {
  const makeNode = () => ({ data: {}, children: [], getData(key) { return key ? this.data[key] : this.data; },
    setData(key, value) { this.data[key] = value; return this; },
    getChildren() { return this.children; }, getChild(index) { return this.children[index]; }, render() { return this; } });
  const node = makeNode();
  const minder = { _root: node, getRoot: () => node, getSelectedNodes: () => multi ? [node, node.children[0]] : [node],
    createNode(data, parent) { const child = makeNode(); parent.children.push(child); return child; },
    setTemplate: () => {}, setTheme: () => {}, setBase(value) { this.base = value; },
    getTemplate: () => 'default', getTheme: () => 'default', getBase() { return this.base; },
    refresh: () => {}, fire: () => {}, _fire: () => {}, _firePharse: () => {}, _interactChange: () => {}, layout: () => {},
    importNode: method('importNode', 'importJson'),
    importJson: method('importJson', 'exportData', { compatibility: json => json, MinderEvent: function() {} }),
    exportJson: method('exportJson', 'Text2Children', { Minder: { version: '1.4.43' } }),
    applyPatches(patches) { patches.forEach(patch => applyPatch(this, clone(patch))); },
  };
  minder.importJson({ root: { data: clone(initialData), children: multi ? [{ data: { id: 'synthetic-child', ...childData }, children: [] }] : [] }, base: 1 });
  let server = minder.exportJson();
  const group = new DoGroup({ minder, wsInstance: { sendMessage: (type, payload) => {
    server = jsonDiff.applyPatch(server, JSON.parse(payload.message), true, false).newDocument;
  } } });
  group.setState = (update, callback) => { group.state = { ...group.state, ...update }; if (callback) callback(); };
  window.minderData = server;
  const resourceExecute = method('execute', 'queryValue', {}, core.indexOf('var ResourceCommand ='));
  const priorityExecute = method('execute', 'queryValue', { PRIORITY_DATA: 'priority' }, core.indexOf('var PriorityCommand ='));
  return { minder, group, server: () => server,
    priority(value) { priorityExecute(minder, value); const change = group.changed();
      change.patch.forEach(batch => { server = jsonDiff.applyPatch(server, batch, true, false).newDocument; });
      return change;
    },
    catalog(value, operation) {
      const commandStart = core.indexOf('var TagCatalogCommand =');
      if (commandStart < 0) throw new Error('缺少独立候选配置命令');
      method('execute', 'queryValue', {}, commandStart)(minder, value, operation);
      const change = group.changed();
      change.patch.forEach(batch => { server = jsonDiff.applyPatch(server, batch, true, false).newDocument; });
      return change;
    },
    persistCanonical() {
      // 与 TreeUtil.caseDFSValidate 的 resource:null 删除规则相同，不修改客户端基线。
      const visit = current => {
        if (current.data.resource === null) delete current.data.resource;
        current.children.forEach(visit);
      };
      visit(server.root);
    },
    resource(value, operation) { resourceExecute(minder, value, operation); const change = group.changed();
      change.patch.forEach(batch => { server = jsonDiff.applyPatch(server, batch, true, false).newDocument; });
      return change;
    },
  };
};

test.each([['缺失', {}], ['null', { resource: null }], ['空数组', { resource: [] }]])(
  '%s资源：首次添加、多标签、清空、撤销重做后再次添加均可严格应用', async (name, data) => {
    const f = fixture({ id: 'synthetic-root', ...data });
    f.resource(['alpha']);
    f.resource(['alpha', 'beta']);
    f.resource(null);
    await f.group.undo({});
    expect(f.minder.exportJson().root.data.resource).toEqual(['alpha', 'beta']);
    await f.group.redo({});
    expect(Object.prototype.hasOwnProperty.call(f.minder.exportJson().root.data, 'resource')).toBe(false);
    f.resource(['gamma']);
    expect(f.server().root.data.resource).toEqual(['gamma']);
  });

test('首次add撤销必须真正移除resource，随后添加不能生成无目标replace', async () => {
  const f = fixture({ id: 'synthetic-root' });
  f.resource(['alpha']);
  await f.group.undo({});
  expect(Object.prototype.hasOwnProperty.call(f.minder.exportJson().root.data, 'resource')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(f.server().root.data, 'resource')).toBe(false);
  const change = f.resource(['beta']);
  expect(change.patch[0]).toEqual([{ op: 'add', path: '/root/data/resource', value: ['beta'] }]);
  expect(f.server().root.data.resource).toEqual(['beta']);
});

test('候选独立保存、撤销重做、重新添加及导出导入不影响已用节点标签', async () => {
  const f = fixture({ id: 'r', resource: ['共享'], priority: 1 }, true, { resource: ['共享'], progress: 9, note: '保留' });
  f.catalog('共享', 'remove');
  expect(f.server().root.data.tagCatalog).toEqual({ added: [], removed: ['共享'] });
  expect(f.server().root.data.resource).toEqual(['共享']);
  expect(f.server().root.children[0].data).toMatchObject({ resource: ['共享'], progress: 9, note: '保留' });
  await f.group.undo({});
  expect(f.minder.exportJson().root.data.tagCatalog).toBeUndefined();
  await f.group.redo({});
  expect(f.minder.exportJson().root.data.tagCatalog.removed).toEqual(['共享']);
  f.catalog('共享', 'add');
  f.catalog('未使用', 'add');
  const restored = fixture(f.server().root.data);
  expect(restored.minder.exportJson().root.data.tagCatalog).toEqual({ added: ['共享', '未使用'], removed: [] });
});

test('候选管理不需要选中节点，空或非法值不产生补丁', () => {
  const f = fixture({ id: 'r' });
  f.minder.getSelectedNodes = () => [];
  f.catalog('未应用', 'add');
  expect(f.server().root.data.tagCatalog.added).toEqual(['未应用']);
  for (const value of ['', ' ', null, 7]) expect(f.catalog(value, 'remove').patch).toEqual([]);
});

test('仅候选配置的命令与撤销重做不触发节点重绘或布局', async () => {
  const f = fixture({ id: 'r', resource: ['保留'] });
  f.minder.getRoot().render = jest.fn();
  f.minder.layout = jest.fn();
  f.catalog('保留', 'remove');
  await f.group.undo({});
  await f.group.redo({});
  expect(f.minder.getRoot().render).not.toHaveBeenCalled();
  expect(f.minder.layout).not.toHaveBeenCalled();
});

test('旧图最后一个节点清除标签也保留候选，单次撤销重做同时恢复节点与配置且不复活删除项', async () => {
  const f = fixture({ id: 'r', resource: ['旧标签'] });
  f.resource(null);
  expect(f.server().root.data.tagCatalog).toEqual({ added: ['旧标签'], removed: [] });
  expect(f.group.state.undoDiffs).toHaveLength(1);
  await f.group.undo({});
  expect(f.minder.exportJson().root.data).toMatchObject({ resource: ['旧标签'] });
  expect(f.minder.exportJson().root.data.tagCatalog).toBeUndefined();
  await f.group.redo({});
  expect(f.server().root.data.tagCatalog.added).toEqual(['旧标签']);
  f.resource(['旧标签']);
  f.catalog('旧标签', 'remove');
  f.resource(null);
  expect(f.server().root.data.tagCatalog).toEqual({ added: [], removed: ['旧标签'] });
});

test.each([false, true])('优先级清除删除字段并重排，严格补丁和撤销重做保持一致（大图=%s）', async large => {
  const f = fixture({ id: 'r', priority: 1, resource: ['保留'] });
  f.minder._largeMindMap = large;
  f.minder.layout = jest.fn();
  const change = f.priority(0);
  expect(change.patch[0]).toEqual([{ op: 'remove', path: '/root/data/priority' }]);
  expect(f.minder.layout).toHaveBeenCalled();
  expect(f.minder.exportJson().root.data).not.toHaveProperty('priority');
  await f.group.undo({});
  expect(f.minder.exportJson().root.data.priority).toBe(1);
  await f.group.redo({});
  expect(f.server().root.data).not.toHaveProperty('priority');
  f.priority(2);
  expect(f.server().root.data).toMatchObject({ priority: 2, resource: ['保留'] });
});

test('收到远端remove后导出保持缺失语义，不将下一次添加误报为replace', () => {
  const f = fixture({ resource: ['alpha'] });
  f.minder.applyPatches([{ op: 'remove', path: '/root/data/resource' }]);
  expect(Object.prototype.hasOwnProperty.call(f.minder.exportJson().root.data, 'resource')).toBe(false);
});

test('首次添加撤销后再添加，服务端严格补丁不得报缺失resource', async () => {
  const f = fixture({ id: 'synthetic-root' });
  f.resource(['alpha']);
  await f.group.undo({});
  expect(() => f.resource(['beta'])).not.toThrow();
  expect(f.server().root.data.resource).toEqual(['beta']);
});

test('首次添加撤销再重做可恢复字段，后续修改仍保持服务端一致', async () => {
  const f = fixture({ id: 'synthetic-root' });
  f.resource(['alpha']);
  await f.group.undo({});
  await f.group.redo({});
  expect(f.minder.exportJson().root.data.resource).toEqual(['alpha']);
  f.resource(['alpha', 'beta']);
  expect(f.server().root.data.resource).toEqual(['alpha', 'beta']);
});

test('多标签移除数组中间项后撤销重做，不能留下空洞或覆盖后一项', async () => {
  const f = fixture({ resource: ['alpha', 'beta', 'gamma'] });
  f.resource(['alpha', 'gamma']);
  await f.group.undo({});
  expect(f.minder.exportJson().root.data.resource).toEqual(['alpha', 'beta', 'gamma']);
  await f.group.redo({});
  expect(f.minder.exportJson().root.data.resource).toEqual(['alpha', 'gamma']);
  f.resource(['delta']);
  expect(f.server().root.data.resource).toEqual(['delta']);
});

test.each([null, []])('使用%p清空标签保存经TreeUtil规范化后再次添加仍可严格应用', value => {
  const f = fixture({ id: 'synthetic-root' });
  f.resource(['alpha']);
  f.resource(value);
  f.persistCanonical();
  expect(Object.prototype.hasOwnProperty.call(f.server().root.data, 'resource')).toBe(false);
  expect(() => f.resource(['beta'])).not.toThrow();
  expect(f.server().root.data.resource).toEqual(['beta']);
});

test('多选节点标签数组互不共享，撤销重做删项不会跨节点二次splice', async () => {
  const f = fixture({ id: 'synthetic-root' }, true);
  f.resource(['alpha', 'beta', 'gamma']);
  f.minder.applyPatches([{ op: 'remove', path: '/root/data/resource/1' }]);
  expect(f.minder.exportJson().root.children[0].data.resource).toEqual(['alpha', 'beta', 'gamma']);
  const change = f.group.changed();
  change.patch.forEach(batch => jsonDiff.applyPatch(f.server(), batch, true, true));
  await f.group.undo({});
  expect(f.minder.exportJson().root.data.resource).toEqual(['alpha', 'beta', 'gamma']);
  expect(f.minder.exportJson().root.children[0].data.resource).toEqual(['alpha', 'beta', 'gamma']);
  await f.group.redo({});
  expect(f.minder.exportJson().root.data.resource).toEqual(['alpha', 'gamma']);
  expect(f.minder.exportJson().root.children[0].data.resource).toEqual(['alpha', 'beta', 'gamma']);
});

test('多选移除标签只删各自目标项，不能把选择并集写回覆盖各节点', async () => {
  const f = fixture({ id: 'synthetic-root', text: '正文保留', image: 'synthetic.png', resource: ['alpha', 'beta'] }, true, { resource: ['alpha', 'gamma'] });
  f.resource('alpha', 'remove');
  const data = f.minder.exportJson().root;
  expect(data.data.resource).toEqual(['beta']);
  expect(data.children[0].data.resource).toEqual(['gamma']);
  expect(data.data.text).toBe('正文保留');
  expect(data.data.image).toBe('synthetic.png');
  await f.group.undo({});
  expect(f.minder.exportJson().root.data.resource).toEqual(['alpha', 'beta']);
  expect(f.minder.exportJson().root.children[0].data.resource).toEqual(['alpha', 'gamma']);
  await f.group.redo({});
  expect(f.minder.exportJson().root.data.resource).toEqual(['beta']);
  expect(f.minder.exportJson().root.children[0].data.resource).toEqual(['gamma']);
});

test('历史标签按显示时trim身份删除，保留其他原始值且空/非字符串目标不误删', () => {
  const f = fixture({ id: 'synthetic-root', resource: [' 标签甲 ', '保留', '', null, 7] });
  f.resource('标签甲', 'remove');
  expect(f.minder.exportJson().root.data.resource).toEqual(['保留', '', null, 7]);
  f.resource(' ', 'remove');
  f.resource(null, 'remove');
  f.resource(7, 'remove');
  expect(f.minder.exportJson().root.data.resource).toEqual(['保留', '', null, 7]);
});

test('撤销后的源版本确认只改变base，contentchange不能清空重做栈', async () => {
  const f = fixture({ id: 'synthetic-root' });
  f.resource(['alpha']);
  await f.group.undo({});
  expect(f.group.hasRedo()).toBe(true);
  // source_revision_event 的 applyPatches 会先触发contentchange，再调用syncBase。
  f.minder.setBase(2);
  f.group.changed();
  f.group.syncBase(2);
  expect(f.group.hasRedo()).toBe(true);
  f.resource(['beta']);
  expect(f.group.hasRedo()).toBe(false);
});
