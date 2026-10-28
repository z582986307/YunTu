/* eslint-env jest */
import CaseMgt from '../src/components/case/casemgt';
import YunTuEditor from '../src/components/react-mindmap-editor';
import { Button, Tooltip } from 'antd';

jest.mock('../src/components/react-mindmap-editor', () => () => null);
jest.mock('../src/utils/axios', () => jest.fn(() => Promise.resolve({ code: 200, data: { title: 'task' } })));
jest.mock('../src/utils/getCookies', () => ({ getCookie: () => '' }));

const page = () => {
  const instance = new CaseMgt({ match: { params: { iscore: '3', caseId: '10', itemid: '20' } } });
  instance.setState = (change, callback) => {
    instance.state = { ...instance.state, ...(typeof change === 'function' ? change(instance.state) : change) };
    if (callback) callback();
  };
  instance.editorNode = { saveAndWait: () => Promise.resolve(), canOperate: () => true,
    captureViewState: () => ({ selectedIds: ['a'], zoom: 120 }), getAssignedNodeIds: () => ['a'] };
  return instance;
};
const findEditors = element => {
  if (!element || typeof element !== 'object') return [];
  const children = element.props && element.props.children;
  return [element.type === YunTuEditor ? element : null, ...[].concat(children || []).reduce((list, child) => list.concat(findEditors(child)), [])].filter(Boolean);
};
const findElement = (element, predicate) => {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  const children = [].concat((element.props && element.props.children) || []);
  return children.reduce((found, child) => found || findElement(child, predicate), null);
};

test('源锁与任务他人锁均阻止进入源编辑并显示准确悬浮提示，自己任务锁不误禁用', async () => {
  const p = page();
  p.state.editorReady = true;
  p.handleSourceCaseLockChanged(true);
  let button = findElement(p.render(), item => item.type === Button && item.props.className === 'mindmap-tool-button case-source-edit-button');
  expect(button.props.disabled).toBe(true);
  const tooltip = findElement(p.render(), item => item.type === Tooltip && item.props.title === '源用例被锁定，不可编辑');
  expect(tooltip.props.children.type).toBe('span');
  await p.enterSourceEditing();
  expect(p.state.sourceEditing).toBe(false);
  p.handleSourceCaseLockChanged(false);
  const editor = findEditors(p.render())[0];
  editor.props.onOperationStateChanged(false, { lockedByOther: true });
  button = findElement(p.render(), item => item.type === Button && item.props.className === 'mindmap-tool-button case-source-edit-button');
  expect(button.props.disabled).toBe(true);
  expect(findElement(p.render(), item => item.type === Tooltip && item.props.title === '源用例被锁定，不可编辑')).not.toBeNull();
  editor.props.onOperationStateChanged(true, { lockedByOther: false });
  button = findElement(p.render(), item => item.type === Button && item.props.className === 'mindmap-tool-button case-source-edit-button');
  expect(button.props.disabled).toBe(false);
});

test('已进入源编辑后自己的源锁不禁用结束编辑', () => {
  const p = page();
  p.state = { ...p.state, sourceEditing: true, editorReady: true };
  p.handleSourceCaseLockChanged(true);
  const button = findElement(p.render(), item => item.type === Button && item.props.className === 'mindmap-tool-button case-source-edit-button');
  expect(button.props.disabled).toBe(false);
});

test('进入源编辑必须等待真实保存成功，且始终只有一个不同 key 的编辑器', async () => {
  const p = page();
  let finish;
  p.editorNode.saveAndWait = () => new Promise(resolve => { finish = resolve; });
  const pending = p.enterSourceEditing();
  expect(p.state.sourceEditing).toBe(false);
  finish();
  await pending;
  const editors = findEditors(p.render());
  expect(editors).toHaveLength(1);
  expect(editors[0].props.wsParam.query).toMatchObject({ caseId: '10', recordId: 'undefined', sourceTaskId: '20' });
  expect(editors[0].props.readOnly).toBe(false);
  expect(editors[0].props.progressShow).toBe(false);
  expect(editors[0].key).not.toBe('task-0');
  expect(p.taskViewState).toEqual({ selectedIds: ['a'], zoom: 120 });
  expect(editors[0].props.initialViewState).toEqual({ selectedIds: ['a'], zoom: 120 });
});

test('结束编辑失败保持源编辑实例，成功后重建任务并用原执行位置', async () => {
  const p = page();
  await p.enterSourceEditing();
  const key = findEditors(p.render())[0].key;
  p.editorNode.saveAndWait = () => Promise.reject(new Error('保存失败'));
  await p.finishSourceEditing();
  expect(p.state.sourceEditing).toBe(true);
  expect(findEditors(p.render())[0].key).toBe(key);
  p.editorNode.saveAndWait = () => Promise.resolve();
  await p.finishSourceEditing();
  const editor = findEditors(p.render())[0];
  expect(p.state.sourceEditing).toBe(false);
  expect(editor.props.wsParam.query.recordId).toBe('20');
  expect(editor.props.initialViewState).toEqual({ selectedIds: ['a'], zoom: 120 });
  expect(editor.key).not.toBe(key);
});

test('收到源更新只提示，不重建任务编辑器、不修改执行版本', () => {
  const p = page();
  const before = findEditors(p.render())[0].key;
  p.handleSourceCaseUpdated('9');
  p.handleSourceCaseUpdated('9');
  expect(p.state.sourceUpdated).toBe(true);
  expect(findEditors(p.render())[0].key).toBe(before);
});

test('源拒绝后返回任务并保留原执行位置', async () => {
  const p = page();
  await p.enterSourceEditing();
  p.handleSourceEditDenied();
  expect(p.state.sourceEditing).toBe(false);
  expect(findEditors(p.render())[0].props.initialViewState).toEqual({ selectedIds: ['a'], zoom: 120 });
});
