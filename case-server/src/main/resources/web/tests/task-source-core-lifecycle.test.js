/* eslint-env jest */
import fs from 'fs';
import path from 'path';

const core = fs.readFileSync(path.join(__dirname, '../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js'), 'utf8');
// 使用生产方法本体运行可控宿主，避免 SVG 几何及浏览器渲染依赖掩盖生命周期断言。
const method = (name, next, offset = 0, context = {}) => {
  const start = core.indexOf(`${name}: function`, offset) + name.length + 2;
  const end = core.indexOf(`${next}: function`, start);
  const section = core.slice(start, end);
  const body = section.slice(0, section.lastIndexOf('},') + 1);
  return Function(...Object.keys(context), `return (${body});`)(...Object.values(context));
};

test('销毁脑图解除全局事件，且不能重新绑定 resize', () => {
  const resize = jest.fn();
  const paper = { on: jest.fn(), off: jest.fn() };
  const owner = { _paper: paper, _firePharse: resize,
    _initEvents: jest.fn(), _garbage: jest.fn(), _modules: {} };
  const add = jest.spyOn(window, 'addEventListener');
  const remove = jest.spyOn(window, 'removeEventListener');
  try {
    owner._bindEvents = method('_bindEvents', 'dispatchKeyEvent');
    owner._resetEvents = method('_resetEvents', '_bindEvents');
    owner._bindEvents();
    const handler = add.mock.calls.find(call => call[0] === 'resize')[1];
    const count = add.mock.calls.length;
    method('destroy', 'reset').call(owner);
    expect(add.mock.calls.length).toBe(count);
    expect(remove).toHaveBeenCalledWith('resize', handler);
    expect(paper.off).toHaveBeenCalled();
  } finally { add.mockRestore(); remove.mockRestore(); }
});

test('图片命令返回的数据写入 Promise 仅在内容变更完成后兑现', async () => {
  let loaded;
  const data = {};
  const node = { setData: (key, value) => { data[key] = value; }, render: () => {} };
  const events = [];
  const minder = { getSelectedNodes: () => [node], getOption: () => 800,
    fire: name => events.push(name), layout: () => {} };
  const execute = method('execute', 'queryState', core.indexOf("var ImageCommand ="), {
    loadImageSize: (url, callback) => { loaded = callback; },
    fitImageSize: (width, height) => ({ width, height }),
  });
  const pending = execute(minder, '/image.png', '');
  expect(pending && typeof pending.then).toBe('function');
  loaded(100, 80);
  await pending;
  expect(data.image).toBe('/image.png');
  expect(events).toContain('contentchange');
});
