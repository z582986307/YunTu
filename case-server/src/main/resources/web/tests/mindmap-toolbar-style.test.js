/* eslint-env jest */
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import MediaGroup from '../src/components/react-mindmap-editor/toolbar/MediaGroup';
import PriorityGroup from '../src/components/react-mindmap-editor/toolbar/PriorityGroup';
import TagGroup from '../src/components/react-mindmap-editor/toolbar/TagGroup';
import FontGroup from '../src/components/react-mindmap-editor/outlook/FontGroup';

let holder;
beforeEach(() => { holder = document.createElement('div'); document.body.appendChild(holder); });
afterEach(() => {
  act(() => { ReactDOM.unmountComponentAtNode(holder); });
  holder.remove();
});
const mount = component => act(() => { ReactDOM.render(component, holder); });
const fixture = () => {
  const data = { priority: 2, resource: ['回归'] };
  const node = { getData: key => data[key], getChildren: () => [] };
  const minder = { getSelectedNodes: () => [node], getSelectedNode: () => node, getRoot: () => node,
    queryCommandValue: name => data[name.toLowerCase()], queryCommandState: () => 0,
    execCommand: (name, value, operation) => {
      const remaining = operation === 'remove' ? (data.resource || []).filter(tag => tag !== value) : value;
      data[name.toLowerCase()] = Array.isArray(remaining) && !remaining.length ? null : remaining;
    }, on: () => {}, off: () => {} };
  return { minder, data };
};

test('外观媒体入口仅有横排图片和链接，不再提供备注，锁定后入口不可点击', () => {
  const { minder } = fixture();
  mount(<MediaGroup minder={minder} />);
  const buttons = Array.from(holder.querySelectorAll('button'));
  expect(buttons.map(button => button.textContent.trim())).toEqual(['链接', '图片']);
  expect(holder.querySelector('br')).toBeNull();
  expect(buttons.every(button => button.querySelector('svg'))).toBe(true);
  mount(<MediaGroup minder={minder} isLock />);
  expect(Array.from(holder.querySelectorAll('button')).every(button => button.disabled)).toBe(true);
});

test('优先级在新按钮上显示当前等级，切换、清除和只读保护保持不变', () => {
  const { minder, data } = fixture();
  mount(<PriorityGroup minder={minder} />);
  expect(holder.querySelector('[aria-label="优先级 P1"]').getAttribute('aria-pressed')).toBe('true');
  act(() => { holder.querySelector('[aria-label="优先级 P0"]').click(); });
  expect(data.priority).toBe(1);
  expect(holder.querySelector('[aria-label="优先级 P0"]').getAttribute('aria-pressed')).toBe('true');
  act(() => { holder.querySelector('[aria-label="清除优先级"]').click(); });
  expect(data.priority).toBe(0);
  mount(<PriorityGroup minder={minder} readOnly />);
  expect(Array.from(holder.querySelectorAll('button')).every(button => button.disabled)).toBe(true);
  expect(holder.querySelector('[aria-label="清除优先级"]').classList.contains('mindmap-tool-button')).toBe(true);
});

test('标签按钮保持应用和移除能力，长名称可查看全文，添加按钮仍进入输入态', () => {
  const { minder, data } = fixture();
  const label = '一个用于验证长标签完整提示的名称';
  mount(<TagGroup minder={minder} tags={['回归', label]} />);
  const apply = holder.querySelector(`[aria-label="应用标签：${label}"]`);
  expect(apply.title).toBe(label);
  act(() => { apply.click(); });
  expect(data.resource).toEqual(['回归', label]);
  expect(holder.querySelector(`[aria-label="已应用标签：${label}"]`).getAttribute('aria-pressed')).toBe('true');
  act(() => { holder.querySelector(`[aria-label="已应用标签：${label}"]`).closest('.ant-tag').querySelector('.anticon-close').click(); });
  expect(data.resource).toEqual(['回归']);
  act(() => { holder.querySelector('.mindmap-tag-add').click(); });
  const input = holder.querySelector('input[aria-label="新标签名称"]');
  expect(document.activeElement).toBe(input);
  act(() => { Simulate.change(input, { target: { value: '冒烟' } }); });
  act(() => { Simulate.keyDown(input, { key: 'Enter', keyCode: 13 }); });
  expect(holder.querySelector('[aria-label="应用标签：冒烟"]')).not.toBeNull();
});

test('字号控件有独立可访问名称，选择字号仍写入相同命令', () => {
  const { minder, data } = fixture();
  mount(<FontGroup minder={minder} />);
  expect(holder.querySelector('[aria-label="字号"]')).not.toBeNull();
  expect(holder.querySelector('.mindmap-tool-select')).not.toBeNull();
  act(() => { Simulate.click(holder.querySelector('.ant-select-selection')); });
  const option = Array.from(holder.querySelectorAll('.ant-select-dropdown-menu-item')).find(item => item.textContent === '18');
  expect(option).not.toBeUndefined();
  act(() => { Simulate.click(option); });
  expect(data.fontsize).toBe(18);
});
