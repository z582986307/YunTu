/* eslint-env jest */
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import Editor from '../src/components/react-mindmap-editor';
import TagGroup from '../src/components/react-mindmap-editor/toolbar/TagGroup';

jest.mock('kity', () => ({}));
jest.mock('antd/es/locale/zh_CN', () => ({}));
jest.mock('hotbox-ui/hotbox', () => ({}));
jest.mock('../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js', () => ({}));
jest.mock('../src/components/react-mindmap-editor/util/clipboard', () => ({ init: () => {}, removeListener: () => {} }));

const setup = () => {
  const holder = document.createElement('div');
  document.body.appendChild(holder);
  const data = {};
  const leaf = { getData: key => data[key], getChildren: () => [] };
  const nodes = [leaf];
  let selected = leaf;
  const minder = { getSelectedNodes: () => [selected], getSelectedNode: () => selected,
    getRoot: () => leaf, queryCommandValue: () => [], on: () => {}, off: () => {},
    execCommand: (name, value) => {
      if (name === 'TagCatalog') data.tagCatalog = { added: [value], removed: [] };
      if (name === 'AppendSiblingNode') { selected = {}; nodes.push(selected); }
    } };
  const editor = new Editor({ readOnly: false });
  editor.minder = minder;
  editor.state = { ...editor.state, selectedNode: leaf, loading: false, isLock: false, wsConnected: true };
  editor.scheduleNewNodeInput = () => {};
  let group;
  act(() => { ReactDOM.render(<TagGroup ref={value => { group = value; }} minder={minder} tags={[]} />, holder); });
  act(() => { holder.querySelector('.mindmap-tag-add').click(); });
  const input = holder.querySelector('input');
  act(() => { Simulate.change(input, { target: { value: 'synthetic-tag' } }); });
  // React16 的委托监听已建立，再接入脑图 document 原生监听，复现同一层级的冒泡。
  document.addEventListener('keydown', editor.handleKeyDown);
  return { holder, editor, input, nodes, leaf, group: () => group, selected: () => selected,
    cleanup: () => {
      document.removeEventListener('keydown', editor.handleKeyDown);
      act(() => { ReactDOM.unmountComponentAtNode(holder); });
      holder.parentNode.removeChild(holder);
      window.tagInput = false;
    } };
};
const enter = (input, composing = false, type = 'keydown') => {
  const event = new KeyboardEvent(type, { key: 'Enter', keyCode: 13, which: 13, bubbles: true });
  if (composing) Object.defineProperty(event, 'isComposing', { value: true });
  act(() => { input.dispatchEvent(event); });
};

test('标签 Enter 只确认标签，真实冒泡到 document 时不新增兄弟或切换选择', () => {
  const f = setup();
  try {
    enter(f.input);
    expect(f.leaf.getData('tagCatalog').added).toEqual(['synthetic-tag']);
    expect(f.nodes).toHaveLength(1);
    expect(f.selected()).toBe(f.leaf);
    expect(f.editor.state.showEdit).toBe(false);
  } finally { f.cleanup(); }
});

test('输入法选词 Enter 不确认标签也不落入脑图，组词完成后下一次 Enter 才确认', () => {
  const f = setup();
  try {
    act(() => { Simulate.compositionStart(f.input); });
    enter(f.input, true);
    expect(f.group().state.inputVisible).toBe(true);
    expect(f.leaf.getData('tagCatalog')).toBeUndefined();
    expect(f.nodes).toHaveLength(1);
    act(() => {
      Simulate.change(f.input, { target: { value: '合成标签' } });
      Simulate.compositionEnd(f.input);
    });
    enter(f.input, false, 'keyup');
    enter(f.input);
    expect(f.leaf.getData('tagCatalog').added).toEqual(['合成标签']);
    expect(f.nodes).toHaveLength(1);
    expect(f.selected()).toBe(f.leaf);
  } finally { f.cleanup(); }
});
