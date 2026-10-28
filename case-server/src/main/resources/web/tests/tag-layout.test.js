/* eslint-env jest */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import TagGroup from '../src/components/react-mindmap-editor/toolbar/TagGroup';
import FontGroup from '../src/components/react-mindmap-editor/outlook/FontGroup';

let holder;
beforeEach(() => { holder = document.createElement('div'); document.body.appendChild(holder); });
afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(holder); }); holder.remove(); });
const fixture = () => {
  const data = { resource: [] };
  const node = { getData: key => data[key], getChildren: () => [] };
  return { data, minder: { getRoot: () => node, getSelectedNode: () => node, getSelectedNodes: () => [node], on: () => {}, off: () => {},
    queryCommandValue: command => data[command.toLowerCase()], queryCommandState: () => 0,
    execCommand: (command, value) => { data[command.toLowerCase()] = value; } } };
};
test('标签标题和括号说明同一标题区，应用后删除控件不再改变标签DOM占位', () => {
  const { minder, data } = fixture();
  act(() => { ReactDOM.render(<TagGroup minder={minder} tags={['甲', '乙']} />, holder); });
  expect(holder.querySelector('.mindmap-tag-heading').textContent).toBe('标签（点击应用；已选标签可移除）');
  const tag = holder.querySelector('[aria-label="应用标签：甲"]').closest('.mindmap-tool-tag');
  const remove = tag.querySelector('.mindmap-tag-remove');
  expect(remove.disabled).toBe(true);
  const count = tag.childNodes.length;
  act(() => { tag.querySelector('.mindmap-tag-button').click(); });
  expect(data.resource).toEqual(['甲']);
  expect(tag.querySelector('.mindmap-tag-remove')).toBe(remove);
  expect(tag.childNodes.length).toBe(count);
  expect(remove.disabled).toBe(false);
  act(() => { remove.click(); });
  expect(data.resource).toBeNull();
  expect(holder.querySelector('[aria-label="应用标签：乙"]')).not.toBeNull();
});
test('标签组清除只移除节点标签，不删除可选标签，任务只读不显示可用删除', () => {
  const { minder, data } = fixture();
  data.resource = ['甲', '乙'];
  act(() => { ReactDOM.render(<TagGroup minder={minder} tags={['甲', '乙']} />, holder); });
  act(() => { holder.querySelector('[aria-label="清除当前节点标签"]').click(); });
  expect(data.resource).toBeNull();
  expect(holder.querySelectorAll('.mindmap-tool-tag').length).toBe(2);
  act(() => { ReactDOM.render(<TagGroup minder={minder} tags={['甲', '乙']} readOnly />, holder); });
  expect([...holder.querySelectorAll('button')].every(button => button.disabled)).toBe(true);
});
test('字体五操作排在字号前，保留独立控件与命令入口', () => {
  const { minder } = fixture();
  act(() => { ReactDOM.render(<FontGroup minder={minder} />, holder); });
  const actions = holder.querySelector('.mindmap-font-actions');
  const select = holder.querySelector('.mindmap-font-size');
  expect(actions.querySelectorAll('button').length).toBe(5);
  expect([...actions.querySelectorAll('button')].map(button => button.title)).toEqual(['加粗', '斜体', '删除线', '字体颜色', '背景颜色']);
  expect(actions.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
