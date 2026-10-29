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
    execCommand: (command, value, operation) => {
      if (command === 'TagCatalog') {
        const catalog = data.tagCatalog || { added: [], removed: [] };
        data.tagCatalog = operation === 'remove'
          ? { added: catalog.added.filter(tag => tag !== value), removed: [...catalog.removed, value] }
          : { added: [...catalog.added, value], removed: catalog.removed.filter(tag => tag !== value) };
        return;
      }
      const remaining = operation === 'remove' ? (data.resource || []).filter(tag => tag !== value) : value;
      data[command.toLowerCase()] = Array.isArray(remaining) && !remaining.length ? null : remaining;
    } } };
};
test('内置标签不可删除且旧删除记录不能隐藏内置项，自定义标签仍可删除', () => {
  const { minder, data } = fixture();
  data.tagCatalog = { added: ['自定义'], removed: ['前置条件', '执行步骤', '预期结果'] };
  let group;
  act(() => { ReactDOM.render(<TagGroup ref={v => { group = v; }} minder={minder}
    tags={['前置条件', '执行步骤', '预期结果']} />, holder); });
  for (const tag of ['前置条件', '执行步骤', '预期结果']) {
    expect(holder.querySelector(`[title="${tag}"]`)).not.toBeNull();
    expect(holder.querySelector(`[aria-label="删除可用标签：${tag}"]`)).toBeNull();
    act(() => { group.onRemove(tag); });
  }
  expect(data.tagCatalog.removed).toEqual(['前置条件', '执行步骤', '预期结果']);
  act(() => { holder.querySelector('[aria-label="删除可用标签：自定义"]').click(); });
  expect(holder.querySelector('[title="自定义"]')).toBeNull();
});
test('标签标题和括号说明同一标题区，应用后删除控件不再改变标签DOM占位', () => {
  const { minder, data } = fixture();
  act(() => { ReactDOM.render(<TagGroup minder={minder} tags={['甲', '乙']} />, holder); });
  expect(holder.querySelector('.mindmap-tag-heading').textContent).toContain('标签');
  const tag = holder.querySelector('[aria-label="应用标签：甲"]').closest('.mindmap-tool-tag');
  const remove = tag.querySelector('.mindmap-tag-remove');
  expect(remove.disabled).toBe(false);
  const count = tag.childNodes.length;
  act(() => { tag.querySelector('.mindmap-tag-button').click(); });
  expect(data.resource).toEqual(['甲']);
  expect(tag.querySelector('.mindmap-tag-remove')).toBe(remove);
  expect(tag.childNodes.length).toBe(count);
  expect(remove.disabled).toBe(false);
  act(() => { remove.click(); });
  expect(data.resource).toEqual(['甲']);
  expect(holder.querySelector('[title="甲"]')).toBeNull();
  expect(holder.querySelector('[aria-label="应用标签：乙"]')).not.toBeNull();
});
test('标签组清除只移除节点标签，不删除可选标签，任务只读不显示可用删除', () => {
  const { minder, data } = fixture();
  data.resource = ['甲', '乙'];
  act(() => { ReactDOM.render(<TagGroup minder={minder} tags={['甲', '乙']} />, holder); });
  act(() => { holder.querySelector('[aria-label="清除当前节点标签"]').click(); });
  expect(data.resource).toBeNull();
  expect(holder.querySelectorAll('.mindmap-tool-tag').length).toBe(5);
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

test('新建标签应用后点击列表×，只删除候选而保留节点标签', async () => {
  const { minder, data } = fixture();
  let group;
  act(() => { ReactDOM.render(<TagGroup ref={value => { group = value; }} minder={minder} tags={[]} />, holder); });
  act(() => { group.setState({ inputValue: '临时标签' }); });
  act(() => { group.handleInputConfirm(); });
  act(() => { holder.querySelector('[aria-label="应用标签：临时标签"]').click(); });
  expect(data.resource).toEqual(['临时标签']);
  act(() => { holder.querySelector('.mindmap-tag-remove').click(); });
  await act(async () => { await group.refreshAvailableTags(); });
  expect(data.resource).toEqual(['临时标签']);
  expect(holder.querySelector('[aria-label="应用标签：临时标签"]')).toBeNull();
});

test('其他节点与选中节点同名标签不会复活已删除候选', async () => {
  const { minder, data } = fixture();
  const other = { getData: key => key === 'resource' ? ['共享标签'] : undefined, getChildren: () => [] };
  const root = minder.getRoot();
  root.getChildren = () => [other];
  let group;
  data.resource = ['共享标签'];
  act(() => { ReactDOM.render(<TagGroup ref={value => { group = value; }} minder={minder} tags={[]} />, holder); });
  await act(async () => { await group.refreshAvailableTags(); });
  act(() => { holder.querySelector('.mindmap-tag-remove').click(); });
  await act(async () => { await group.refreshAvailableTags(); });
  expect(data.resource).toEqual(['共享标签']);
  expect(holder.querySelector('[title="共享标签"]')).toBeNull();
  expect(other.getData('resource')).toEqual(['共享标签']);
});

test('新建但尚未应用的自定义标签可以直接点击×删除', () => {
  const { minder, data } = fixture();
  let group;
  act(() => { ReactDOM.render(<TagGroup ref={value => { group = value; }} minder={minder} tags={[]} />, holder); });
  act(() => { group.setState({ inputValue: '未应用标签' }); });
  act(() => { group.handleInputConfirm(); });
  act(() => { holder.querySelector('.mindmap-tag-remove').click(); });
  expect(holder.querySelector('[aria-label="应用标签：未应用标签"]')).toBeNull();
  expect(data.resource).toEqual([]);
});

test('无节点选中仍可管理候选，应用与清除禁用；只读、锁定和保存准备禁止管理', () => {
  const { minder, data } = fixture();
  minder.getSelectedNodes = () => [];
  let group;
  const mount = props => act(() => { ReactDOM.render(<TagGroup ref={v => { group = v; }} minder={minder} tags={['甲']} {...props} />, holder); });
  mount({});
  expect(holder.querySelector('.mindmap-tag-button').disabled).toBe(true);
  expect(holder.querySelector('.mindmap-tag-add').disabled).toBe(false);
  act(() => { holder.querySelector('.mindmap-tag-remove').click(); });
  expect(data.resource).toEqual([]);
  expect(holder.querySelector('[title="甲"]')).toBeNull();
  for (const props of [{ readOnly: true }, { isLock: true }, { isUserInputAllowed: () => false }]) {
    mount(props);
    act(() => { group.setState({ inputValue: '禁止添加' }); });
    act(() => { group.handleInputConfirm(); });
    expect(data.tagCatalog.added).not.toContain('禁止添加');
    expect([...holder.querySelectorAll('button')].every(button => button.disabled)).toBe(true);
  }
});
