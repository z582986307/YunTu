/* eslint-env jest */
import fs from 'fs';
import path from 'path';
import jsonDiff from 'fast-json-patch';
import DoGroup from '../src/components/react-mindmap-editor/toolbar/DoGroup';

const core = fs.readFileSync(path.join(__dirname, '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js'), 'utf8');
const method = (name, next, context = {}, offset = 0) => {
  const start = core.indexOf(`${name}: function`, offset) + name.length + 2;
  const end = core.indexOf(`${next}: function`, start);
  const section = core.slice(start, end);
  return Function(...Object.keys(context), `return (${section.slice(0, section.lastIndexOf('},') + 1)});`)(...Object.values(context));
};
const patchStart = core.indexOf('function applyPatch(minder, patch)');
const patchEnd = core.indexOf('kity.extendClass(Minder, {', patchStart);
const applyPatch = Function(`return (${core.slice(patchStart, patchEnd).trim()});`)();
const clone = value => JSON.parse(JSON.stringify(value));

// 运行实际 importJson/importNode/exportJson/Resource.execute/applyPatch 方法，
// 仅替换与数据契约无关的 SVG 绘制宿主；服务端镜像严格校验 RFC6902。
const fixture = (initialData, multi = false) => {
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
  minder.importJson({ root: { data: clone(initialData), children: multi ? [{ data: { id: 'synthetic-child' }, children: [] }] : [] }, base: 1 });
  let server = minder.exportJson();
  const group = new DoGroup({ minder, wsInstance: { sendMessage: (type, payload) => {
    server = jsonDiff.applyPatch(server, JSON.parse(payload.message), true, false).newDocument;
  } } });
  group.setState = (update, callback) => { group.state = { ...group.state, ...update }; if (callback) callback(); };
  window.minderData = server;
  const resourceExecute = method('execute', 'queryValue', {}, core.indexOf('var ResourceCommand ='));
  return { minder, group, server: () => server,
    persistCanonical() {
      // 与 TreeUtil.caseDFSValidate 的 resource:null 删除规则相同，不修改客户端基线。
      const visit = current => {
        if (current.data.resource === null) delete current.data.resource;
        current.children.forEach(visit);
      };
      visit(server.root);
    },
    resource(value) { resourceExecute(minder, value); const change = group.changed();
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
