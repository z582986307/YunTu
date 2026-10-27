/* eslint-env jest */
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import NoteDrawer from '../src/components/react-mindmap-editor/components/noteDrawer';
import ExecutionFloatingPanels from '../src/components/react-mindmap-editor/components/executionFloatingPanels';

jest.mock('antd', () => ({ Drawer: props => <div>{props.children}</div>, message: { success: () => {} } }));
jest.mock('for-editor', () => props => <textarea value={props.value} onChange={event => props.onChange(event.target.value)} />);
jest.mock('../src/components/react-mindmap-editor/components/index', () => ({ LinkModal: () => null }));

test('执行备注草稿在模式切换保存前提交到真实节点，重复提交不产生修改', () => {
  let note = null;
  const node = { isRoot: () => true, getChildren: () => [], getData: key => key === 'note' ? note : null };
  let changes = 0;
  const minder = { getRoot: () => node, getSelectedNode: () => node, getSelectedNodes: () => [node],
    execCommand: (name, value) => { note = value; changes += 1; } };
  const panel = new ExecutionFloatingPanels({ minder, selectedNode: node, onChange: () => {} });
  panel.state.note = '未提交草稿';
  panel.commitPendingInput();
  expect(note).toBe('未提交草稿');
  panel.commitPendingInput();
  expect(changes).toBe(1);
});

test('源备注输入注册保存前 flush，卸载取消防抖，不能晚到写入旧节点', () => {
  jest.useFakeTimers();
  const holder = document.createElement('div');
  let note = '';
  const node = { data: {}, getData: () => note, setData: (key, value) => { note = value; }, render: () => {} };
  const minder = { queryCommandValue: () => '', getSelectedNode: () => node,
    execCommand: (name, value) => { note = value; }, fire: () => {} };
  let flush;
  let inputAllowed = true;
  let unregistered = false;
  const registerPendingInput = commit => { flush = commit; return () => { unregistered = true; }; };
  try {
    act(() => { ReactDOM.render(<NoteDrawer minder={minder} visible registerPendingInput={registerPendingInput}
      isUserInputAllowed={() => inputAllowed} />, holder); });
    const input = holder.querySelector('textarea');
    act(() => { Simulate.change(input, { target: { value: 'draft' } }); });
    expect(typeof flush).toBe('function');
    act(() => flush());
    expect(note).toBe('draft');
    inputAllowed = false;
    act(() => { Simulate.change(input, { target: { value: 'blocked' } }); flush(); });
    expect(note).toBe('draft');
    inputAllowed = true;
    act(() => { Simulate.change(input, { target: { value: 'later' } }); });
    act(() => { ReactDOM.unmountComponentAtNode(holder); });
    jest.runAllTimers();
    expect(note).toBe('draft');
    expect(unregistered).toBe(true);
  } finally { ReactDOM.unmountComponentAtNode(holder); jest.useRealTimers(); }
});
