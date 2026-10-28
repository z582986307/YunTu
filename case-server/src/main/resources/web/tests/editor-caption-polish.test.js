/* eslint-env jest */
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import fs from 'fs';
import path from 'path';
import sass from 'node-sass';
import Editor from '../src/components/react-mindmap-editor';
import LinkModal from '../src/components/react-mindmap-editor/components/linkModal';
import ImageModal from '../src/components/react-mindmap-editor/components/imageModal';
import MediaGroup from '../src/components/react-mindmap-editor/toolbar/MediaGroup';

jest.mock('kity', () => ({}));
jest.mock('antd/es/locale/zh_CN', () => ({}));
jest.mock('hotbox-ui/hotbox', () => ({}));
jest.mock('../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js', () => ({}));
jest.mock('../src/components/react-mindmap-editor/util/clipboard', () => ({ init: () => {}, removeListener: () => {} }));

let holder;
let style;
beforeEach(() => {
  holder = document.createElement('div');
  document.body.appendChild(holder);
  style = document.createElement('style');
  const compiled = sass.renderSync({ file: path.join(__dirname, '../src/components/react-mindmap-editor/index.scss') }).css.toString();
  // 旧JSDOM选择器引擎无法计算整份编辑器中的focus-within等规则；仅装载本次真实编译的规则。
  style.textContent = (compiled.match(/(?:\.yuntu-modal \.mindmap-caption-input \.ant-input|\.yuntu-modal \.link-title-remaining|\.kityminder-tools-tab:not\(\.collapsed\))\s*\{[^}]*\}/g) || []).join('\n');
  document.head.appendChild(style);
});
afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(holder); }); holder.remove(); style.remove(); });

test.each([[LinkModal, '链接'], [ImageModal, '图片']])('%s提示文本给计数独立预留宽度，仍限制200字并更新剩余字数', (Modal, kind) => {
  const minder = { queryCommandValue: () => ({ url: '', title: '' }) };
  act(() => { ReactDOM.render(<Modal visible minder={minder} onCancel={() => {}} />, holder); });
  const input = document.querySelector(`input[placeholder="选填：鼠标在${kind}上悬停时提示的文本"]`);
  expect(input.maxLength).toBe(200);
  expect(Number.parseFloat(getComputedStyle(input).paddingRight)).toBeGreaterThanOrEqual(72);
  act(() => { Simulate.change(input, { target: { value: '合成提示' } }); });
  expect(document.querySelector('.link-title-remaining').textContent).toBe('196/200');
});

const find = (element, predicate) => {
  if (Array.isArray(element)) return element.reduce((found, child) => found || find(child, predicate), null);
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  return [].concat(element.props && element.props.children || []).reduce((found, child) => found || find(child, predicate), null);
};

test.each([false, true])('sourceEditing=%s历史区只留撤销重做，图片入口仍在共用外观菜单', sourceEditing => {
  const editor = new Editor({ type: 'edit', readOnly: false, sourceEditing });
  editor.minder = {};
  editor.state = { ...editor.state, minder: editor.minder, loading: false };
  const tree = editor.render();
  const history = find(tree, item => item.props && item.props.className === 'mindmap-history-actions');
  expect(history).not.toBeNull();
  expect(find(history, item => item.props && item.props['aria-label'] === '插入图片')).toBeNull();
  expect(find(tree, item => item.type === MediaGroup)).not.toBeNull();
  expect(typeof editor.handlePasteImage).toBe('function');
});

test('外观工具栏与脑图画布有轻量下边界，折叠时不占额外内容高度', () => {
  holder.innerHTML = '<div class="kityminder-tools-tab"><div class="ant-tabs-content"></div></div>';
  const toolbar = holder.firstChild;
  const computed = getComputedStyle(toolbar);
  expect(computed.borderBottomStyle).toBe('solid');
  expect(computed.borderBottomWidth).toBe('1px');
  expect(computed.borderBottomColor).not.toBe('transparent');
});

test('链接删除按钮更靠右上且悬浮桥仍覆盖链接到删除按钮的路径', () => {
  const core = fs.readFileSync(path.join(__dirname, '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js'), 'utf8');
  const start = core.indexOf('create: function (node)', core.indexOf("kity.createClass('hyperlinkrender'"));
  const section = core.slice(start + 'create: '.length, core.indexOf('shouldRender: function', start));
  const body = section.slice(0, section.lastIndexOf('},') + 1);
  const shapes = [];
  const shape = () => {
    const element = document.createElement('div');
    const result = { node: element, children: [], addShape(child) { this.children.push(child); element.appendChild(child.node); return this; },
      fill() { return this; }, stroke() { return this; }, setPathData() { return this; }, setTarget() { return this; },
      setStyle() { return this; }, setTranslate(x, y) { this.position = { x, y }; return this; },
      setVisible(value) { this.visible = value; return this; }, on() { return this; } };
    shapes.push(result);
    return result;
  };
  const kity = { Group: shape, HyperLink: shape, Path: shape, Circle: shape, Rect: function(width, height, x, y) {
    const rect = shape(); rect.bounds = { width, height, x, y }; return rect;
  } };
  const create = Function('kity', 'linkShapePath', `return (${body});`)(kity, 'M0,0');
  const group = create({});
  const remove = shapes.find(item => item.node.getAttribute('data-link-remove') === 'true');
  expect(remove.position.x).toBeGreaterThan(20);
  expect(remove.position.y).toBeLessThan(-4);
  const bridge = group.children.find(item => item.bounds && item.bounds.width > 30).bounds;
  expect(bridge.x + bridge.width).toBeGreaterThanOrEqual(remove.position.x + 7);
  expect(bridge.y).toBeLessThanOrEqual(remove.position.y - 7);
  group.node.dispatchEvent(new MouseEvent('mouseenter'));
  expect(remove.visible).toBe(true);
  remove.node.dispatchEvent(new MouseEvent('mouseenter'));
  expect(remove.visible).toBe(true);
});
