/* eslint-env jest */
import jsonDiff from 'fast-json-patch';
import Editor from '../src/components/react-mindmap-editor';
import DoGroup from '../src/components/react-mindmap-editor/toolbar/DoGroup';

jest.mock('kity', () => ({}));
jest.mock('antd/es/locale/zh_CN', () => ({}));
jest.mock('hotbox-ui/hotbox', () => ({}));
jest.mock('../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js', () => ({}));
jest.mock('../src/components/react-mindmap-editor/util/clipboard', () => ({ init: () => {}, removeListener: () => {} }));

const flush = async () => { for (let i = 0; i < 15; i += 1) await Promise.resolve(); };
const stateSync = component => {
  component.setState = (change, cb) => {
    component.state = { ...component.state, ...(typeof change === 'function' ? change(component.state) : change) };
    if (cb) cb();
  };
  return component;
};
const setup = (props = {}) => {
  const editor = stateSync(new Editor({ sourceEditing: true, readOnly: false, ...props }));
  let data = { base: 1, root: { data: { id: 'r', text: 'before' }, children: [] } };
  const sent = [];
  const events = {};
  const minder = {
    getBase: () => data.base,
    exportJson: () => JSON.parse(JSON.stringify(data)),
    setStatus: status => { minder._status = status; },
    setOption: () => {},
    on: (names, callback) => { names.split(' ').forEach(name => { events[name] = callback; }); },
    off: () => {},
    applyPatches: patches => { data = jsonDiff.applyPatch(data, patches, false, true).newDocument; minder.fire('contentchange'); },
    fire: name => { if (name === 'contentchange') editor.sendPatch({ minder }); },
  };
  minder._status = 'normal';
  editor.minder = minder;
  editor.ws = { sendMessage: (type, payload) => sent.push({ type, payload }) };
  editor.state = { ...editor.state, loading: false, isLock: false, locked: true, wsConnected: true };
  editor.expectedBase = 1;
  editor.groupNode = stateSync(new DoGroup({ minder, sourceEditing: true, wsInstance: editor.ws,
    beginSourceHistory: editor.beginSourceHistory }));
  window.minderData = minder.exportJson();
  return { editor, minder, sent, events, data: () => data };
};

afterEach(() => { jest.clearAllTimers(); });

test('编辑器保存必须等 pendingEditCount 与 expectedBase 同时确认，再按新版本发送', async () => {
  const f = setup();
  f.editor.pendingEditCount = 1;
  f.editor.expectedBase = 2;
  const pending = f.editor.saveAndWait();
  await flush();
  expect(f.sent).toEqual([]);
  f.data().base = 2;
  f.editor.handleEditAck();
  await flush();
  expect(f.sent.map(item => item.type)).toEqual(['save']);
  expect(JSON.parse(f.sent[0].payload.caseContent).base).toBe(2);
  f.editor.handleSaveAck('error');
  await expect(pending).rejects.toThrow('保存失败');
});

test('未确认输入法选词时保存拒绝且保留编辑态和原节点文字', async () => {
  const f = setup();
  const node = { getText: () => 'before', setText: jest.fn() };
  f.editor.state.showEdit = true;
  f.editor.state.selectedNode = node;
  f.editor.inputNode = { querySelector: () => ({ value: 'pin yin' }) };
  f.editor.composing = true;
  await expect(f.editor.saveAndWait()).rejects.toThrow('选词');
  expect(f.editor.state.showEdit).toBe(true);
  expect(node.setText).not.toHaveBeenCalled();
  expect(f.sent).toEqual([]);
  await expect(f.editor.beginSourceHistory()).resolves.toBe(false);
});

test('撤销最后一次编辑后立即结束，等待独立历史确认并保存新版本和撤销内容', async () => {
  const f = setup();
  f.data().root.data.text = 'after';
  f.editor.groupNode.changed();
  await f.editor.groupNode.undo({});
  expect(f.editor.historyPending).toBe(true);
  expect(f.data().root.data.text).toBe('before');
  const pending = f.editor.saveAndWait();
  await flush();
  expect(f.sent.map(item => item.type)).toEqual(['undo']);
  f.editor.handleSourceRevision('[{"op":"replace","path":"/base","value":4}]');
  await flush();
  expect(f.sent.map(item => item.type)).toEqual(['undo', 'save']);
  expect(JSON.parse(f.sent[1].payload.caseContent)).toMatchObject({ base: 4, root: { data: { text: 'before' } } });
  expect(f.editor.groupNode.hasUndo()).toBe(false);
  f.editor.handleSaveAck('ok');
  await pending;
});

test('源模式锁授权前及历史确认前拦截内容命令，但允许视图缩放', () => {
  const f = setup();
  f.editor.initOnEvent(f.minder);
  f.editor.state.locked = false;
  const event = commandName => ({ commandName, stopPropagationImmediately: jest.fn() });
  const denied = event('priority');
  f.events.beforeExecCommand(denied);
  expect(denied.stopPropagationImmediately).toHaveBeenCalled();
  f.editor.state.locked = true;
  const allowed = event('priority');
  f.events.beforeExecCommand(allowed);
  expect(allowed.stopPropagationImmediately).not.toHaveBeenCalled();
  f.editor.historyPending = true;
  const waiting = event('appendchildnode');
  f.events.beforeExecCommand(waiting);
  expect(waiting.stopPropagationImmediately).toHaveBeenCalled();
  const zoom = event('zoom');
  f.events.beforeExecCommand(zoom);
  expect(zoom.stopPropagationImmediately).not.toHaveBeenCalled();
});

test('保存确认前停用内容入口，失败确认后恢复，不让后续操作混入旧保存', async () => {
  const f = setup();
  const pending = f.editor.saveAndWait();
  await flush();
  expect(f.editor.canEditContent()).toBe(false);
  expect(f.editor.state.saving).toBe(true);
  f.editor.handleSaveAck('error');
  await expect(pending).rejects.toThrow();
  expect(f.editor.canEditContent()).toBe(true);
  expect(f.editor.state.saving).toBe(false);
});

test('既有 autosave 不提供成功确认，不能因此永久挡住后续手动保存', async () => {
  const f = setup();
  f.editor.saveCurrentCase(false);
  const pending = f.editor.saveAndWait();
  await flush();
  expect(f.sent.map(item => item.type)).toEqual(['autosave', 'save']);
  f.editor.handleSaveAck('ok');
  await pending;
});

test('未分配标识只改已绘制 DOM，不修改节点数据或创建屏外 SVG', () => {
  const f = setup({ assignedNodeIds: ['assigned'] });
  const element = document.createElement('g');
  const node = { data: { id: 'unassigned' }, getData: key => node.data[key], rc: { node: element } };
  f.editor.decorateAssignedNode(node);
  expect(element.classList.contains('mindmap-source-unassigned')).toBe(true);
  expect(element.getAttribute('aria-label')).toBe('未分配到当前任务的源节点');
  expect(node.data).toEqual({ id: 'unassigned' });
  node.rc = null;
  node.getRenderContainer = jest.fn();
  f.editor.decorateAssignedNode(node);
  expect(node.getRenderContainer).not.toHaveBeenCalled();
});

test('任务保存确认期间不能再提交执行结果，以免切换模式越过在途编辑', async () => {
  const f = setup({ sourceEditing: false, readOnly: true, progressShow: true });
  const pending = f.editor.saveAndWait();
  await flush();
  const node = { parent: null, getData: key => f.data().root.data[key] };
  f.editor.handleExecutionChange('progress', [node], 1, () => { f.data().root.data.progress = 1; });
  expect(f.data().root.data.progress).toBeUndefined();
  expect(f.sent.map(item => item.type)).toEqual(['save']);
  f.editor.handleSaveAck('ok');
  await pending;
});

test('断开连接后在线人数归零并通知页面停用操作入口', () => {
  const f = setup();
  let ready = true;
  f.editor.props.onOperationStateChanged = value => { ready = value; };
  f.editor.state.nowUseList = ['synthetic-user'];
  f.editor.handleWsClose();
  expect(f.editor.state.wsConnected).toBe(false);
  expect(f.editor.state.nowUseList).toEqual([]);
  expect(ready).toBe(false);
});
