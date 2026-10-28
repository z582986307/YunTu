/* eslint-env jest */
const fs = require('fs');
const path = require('path');
const core = fs.readFileSync(path.resolve(__dirname, '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js'), 'utf8');
const start = core.indexOf('execute: function', core.indexOf('var ProgressCommand')) + 'execute: '.length;
const end = core.indexOf('queryValue: function', start);
const code = core.slice(start, end);
const execute = Function('PROGRESS_DATA', `return (${code.slice(0, code.lastIndexOf('},') + 1)});`)('progress');

test.each([false, true])('标记与取消只重绘结果图标，不触发整图布局，large=%s', large => {
  const data = { progress: null, text: '原节点' };
  const node = { setData: (key, value) => { data[key] = value; return node; }, render: jest.fn() };
  const minder = { _largeMindMap: large, getSelectedNodes: () => [node], layout: jest.fn() };
  execute(minder, 1);
  expect(data).toEqual({ progress: 1, text: '原节点' });
  execute(minder, null);
  expect(data).toEqual({ progress: null, text: '原节点' });
  expect(node.render).toHaveBeenCalledTimes(2);
  expect(minder.layout).not.toHaveBeenCalled();
});
