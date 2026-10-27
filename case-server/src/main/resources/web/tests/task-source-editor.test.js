/* eslint-env jest */
import jsonDiff from 'fast-json-patch';
import Editor from '../src/components/react-mindmap-editor';
import DoGroup from '../src/components/react-mindmap-editor/toolbar/DoGroup';
import fs from 'fs';
import path from 'path';

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

test('保存准备等待旧编辑期间冻结新节点输入和执行备注写入', async () => {
  const f = setup();
  f.editor.pendingEditCount = 1;
  const pending = f.editor.saveAndWait();
  await flush();
  expect(f.editor.canEditContent()).toBe(false);
  const node = { parent: null, getData: key => f.data().root.data[key] };
  f.editor.handleExecutionChange('note', [node], 'late draft', () => { f.data().root.data.note = 'late draft'; });
  f.editor.handleEditInput({ target: { value: 'late text' } });
  expect(f.data().root.data.note).toBeUndefined();
  expect(f.editor.state.showEdit).toBe(false);
  f.editor.handleEditAck();
  await flush();
  f.editor.handleSaveAck('ok');
  await pending;
});

test('历史准备先排空已登记图片及其编辑确认，随后才发送撤销', async () => {
  const f = setup();
  f.data().root.data.text = 'after';
  f.editor.groupNode.changed();
  let finishImage;
  f.editor.trackImageWork(new Promise(resolve => { finishImage = () => {
    f.data().root.data.image = '/synthetic.png';
    f.minder.fire('contentchange');
    resolve();
  }; }));
  const pending = f.editor.groupNode.undo({});
  await flush();
  expect(f.sent).toEqual([]);
  expect(f.editor.canEditContent()).toBe(false);
  finishImage();
  await flush();
  expect(f.sent.map(item => item.type)).toEqual(['edit']);
  f.data().base = 2;
  f.editor.handleEditAck();
  await pending;
  expect(f.sent.map(item => item.type)).toEqual(['edit', 'undo']);
  f.editor.handleSourceRevision('[{"op":"replace","path":"/base","value":3}]');
});

test('无未确认内容的 warning 可经当前连接和版本检查后重新保存', async () => {
  const f = setup();
  f.editor.ws.confirmCurrentVersion = jest.fn(() => Promise.resolve());
  f.editor.handleSocketFailure();
  const pending = f.editor.saveAndWait();
  pending.catch(() => {});
  await flush();
  expect(f.editor.ws.confirmCurrentVersion).toHaveBeenCalledWith(1);
  expect(f.sent.map(item => item.type)).toEqual(['save']);
  f.editor.handleSaveAck('ok');
  await pending;
});

test.each(['save', 'history'])('%s 准备冻结用户但已登记上传仍可通过受限入口完成插图并等待确认', async operation => {
  const f = setup();
  f.data().root.data.text = 'after';
  f.editor.groupNode.changed();
  f.editor.initOnEvent(f.minder);
  f.minder.execCommand = (name, url) => {
    let blocked = false;
    f.events.beforeExecCommand({ commandName: name, stopPropagationImmediately: () => { blocked = true; } });
    if (blocked) return false;
    f.data().root.data.image = url;
    f.minder.fire('contentchange');
    return Promise.resolve();
  };
  let finishUpload;
  f.editor.trackImageWork(new Promise(resolve => { finishUpload = resolve; }).then(() => f.editor.insertPendingImage('/synthetic.png', '')));
  const pending = operation === 'save' ? f.editor.saveAndWait() : f.editor.groupNode.undo({});
  await flush();
  expect(f.editor.canEditContent()).toBe(false);
  finishUpload();
  await flush();
  expect(f.data().root.data.image).toBe('/synthetic.png');
  expect(f.sent.map(item => item.type)).toEqual(['edit']);
  f.data().base = 2;
  f.editor.handleEditAck();
  await flush();
  if (operation === 'save') {
    f.editor.handleSaveAck('ok');
    await pending;
  } else {
    await pending;
    expect(f.sent.map(item => item.type)).toEqual(['edit', 'undo']);
    f.editor.handleSourceRevision('[{"op":"replace","path":"/base","value":3}]');
  }
});

test('超时后的迟到确认不算新保存成功，重试先核实当前连接版本', async () => {
  jest.useFakeTimers();
  try {
    const f = setup();
    f.editor.saveBarrier.timeout = 20;
    f.editor.ws.confirmCurrentVersion = jest.fn(() => Promise.resolve());
    const first = f.editor.saveAndWait();
    const failed = expect(first).rejects.toThrow('超时');
    await flush();
    jest.advanceTimersByTime(21);
    await failed;
    expect(f.editor.canEditContent()).toBe(true);
    const second = f.editor.saveAndWait();
    let completed = false;
    second.then(() => { completed = true; }, () => {});
    await flush();
    expect(f.sent.map(item => item.type)).toEqual(['save']);
    f.editor.handleSaveAck('ok');
    await flush();
    expect(f.editor.ws.confirmCurrentVersion).toHaveBeenCalledWith(1);
    expect(f.sent.map(item => item.type)).toEqual(['save', 'save']);
    expect(completed).toBe(false);
    f.editor.handleSaveAck('ok');
    await second;
  } finally { jest.useRealTimers(); }
});

test('warning 后未确认内容不可盲目重发，保留输入并明确给出安全失败', async () => {
  const f = setup();
  f.editor.pendingEditCount = 1;
  f.editor.handleSocketFailure();
  await expect(f.editor.saveAndWait()).rejects.toThrow('确认状态未知');
  expect(f.editor.saveBarrier.error).toBeUndefined();
  expect(f.editor.pendingEditCount).toBe(1);
  expect(f.sent).toEqual([]);
  expect(f.data().root.data.text).toBe('before');
});

test('重试版本校验失败不发送保存，也不宣称成功', async () => {
  const f = setup();
  f.editor.ws.confirmCurrentVersion = () => Promise.reject(new Error('版本不一致'));
  f.editor.handleSocketFailure();
  await expect(f.editor.saveAndWait()).rejects.toThrow('版本不一致');
  expect(f.sent).toEqual([]);
  expect(f.editor.state.saving).toBe(false);
});

test('base 0 的新任务首次执行补丁必须携带 0，而不是 1', () => {
  const f = setup({ sourceEditing: false, readOnly: true, progressShow: true });
  const core = fs.readFileSync(path.join(__dirname, '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js'), 'utf8');
  f.minder.getBase = Function(`return (${core.match(/getBase:\s*(function \(\) \{[^}]*\})/)[1]});`)();
  f.minder._base = 0;
  f.editor.expectedBase = 0;
  const node = { parent: null, getData: key => f.data().root.data[key] };
  f.editor.handleExecutionChange('progress', [node], 1, () => { f.data().root.data.progress = 1; });
  expect(f.sent[0].type).toBe('edit');
  expect(f.sent[0].payload.caseVersion).toBe(0);
  expect(f.editor.expectedBase).toBe(1);
});
