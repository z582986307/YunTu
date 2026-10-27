/* eslint-env jest */
import Socket from '../src/components/react-mindmap-editor/socket';
import io from '../src/components/react-mindmap-editor/assets/socketio/socket.io.js';
import { importMindMapProgressively, cancelMindMapImport } from '../src/components/react-mindmap-editor/largeMindMap';

jest.mock('../src/components/react-mindmap-editor/assets/socketio/socket.io.js', () => jest.fn());
jest.mock('../src/components/react-mindmap-editor/largeMindMap', () => ({
  importMindMapProgressively: jest.fn(), cancelMindMapImport: jest.fn(), isMindMapReady: () => true,
}));

const makeSocket = (query = { recordId: 'undefined', sourceTaskId: '2' }) => {
  const callbacks = {};
  const socket = { on: (name, cb) => { callbacks[name] = cb; }, disconnect: jest.fn(), off: jest.fn() };
  io.mockReturnValue(socket);
  const imported = [];
  const component = new Socket({ url: '', wsParam: { query }, wsMinder: { getBase: () => 3 }, onImported: data => imported.push(data) });
  component.setupSocket();
  return { component, socket, callbacks, imported };
};

test('源任务模式不能恢复旧正文缓存，导入完成回调使用最新服务端内容', async () => {
  const f = makeSocket();
  const cache = JSON.stringify(f.component.props.wsParam);
  localStorage.setItem(cache, JSON.stringify({ base: 99, root: { data: { id: 'old' }, children: [] } }));
  importMindMapProgressively.mockImplementation((minder, data) => Promise.resolve(data));
  await f.callbacks.open_event({ message: JSON.stringify({ base: 3, root: { data: { id: 'new' }, children: [] } }) });
  expect(f.imported[0].root.data.id).toBe('new');
});

test('旧源实例卸载取消导入、释放回调，晚到导入不能覆盖新实例全局数据', async () => {
  const f = makeSocket();
  let finish;
  importMindMapProgressively.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.callbacks.open_event({ message: JSON.stringify({ base: 3, root: { data: { id: 'old' } } }) });
  f.component.componentWillUnmount();
  window.minderData = { base: 5 };
  finish({});
  await pending;
  expect(window.minderData).toEqual({ base: 5 });
  expect(f.imported).toEqual([]);
  expect(cancelMindMapImport).toHaveBeenCalledWith(f.component.props.wsMinder);
  expect(f.socket.off).toHaveBeenCalled();
});

test('源更新无条件通知，但历史确认不混为普通编辑确认', async () => {
  const f = makeSocket();
  let updates = 0;
  let editAcks = 0;
  let revisions = 0;
  f.component.props.onSourceCaseUpdated = () => { updates += 1; };
  f.component.props.handleEditAck = () => { editAcks += 1; };
  f.component.props.handleSourceRevision = () => { revisions += 1; };
  f.callbacks.source_case_updated({ message: '3' });
  f.callbacks.source_case_updated({ message: '3' });
  await f.callbacks.source_revision_event({ message: '[{"op":"replace","path":"/base","value":4}]' });
  expect(updates).toBe(2);
  expect(revisions).toBe(1);
  expect(editAcks).toBe(0);
});

test('重试前必须收到同一连接的当前版本确认，版本不一致必须拒绝', async () => {
  const f = makeSocket();
  f.socket.connected = true;
  f.socket.emit = () => {};
  const confirmed = f.component.confirmCurrentVersion(3);
  await f.callbacks.state_check_event({ message: '3' });
  await expect(confirmed).resolves.toBeUndefined();
  const stale = f.component.confirmCurrentVersion(3);
  const rejected = expect(stale).rejects.toThrow('版本');
  await f.callbacks.state_check_event({ message: '4' });
  await rejected;
});
