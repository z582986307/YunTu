/* eslint-env jest */
import fs from 'fs';
import path from 'path';
import 'kity';

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

test('导入和设置合法 base 0 后读取及导出仍为 0，其他缺省策略不变', () => {
  const owner = {
    getBase: method('getBase', 'setBase'),
    setBase: Function(`return (${core.match(/setBase:\s*(function \(base\) \{[^}]*\})/)[1]});`)(),
    importJson: method('importJson', 'exportData', 0, { compatibility: json => json, MinderEvent: function() {} }),
    exportJson: method('exportJson', 'Text2Children', 0, { Minder: { version: '1.4.43' } }),
    setTemplate: () => {}, setTheme: () => {}, getTemplate: () => 'right', getTheme: () => 'byte-blue',
    refresh: () => {}, fire: () => {}, _fire: () => {}, _firePharse: () => {}, _interactChange: () => {},
    importNode: (node, json) => { node.data = json.data; },
    getRoot() { return this._root; },
    _root: { data: {}, getChildren: () => [], getData() { return this.data; } },
  };
  expect(owner.getBase()).toBe(1);
  owner.importJson({ version: '1.4.43', base: 0, root: { data: { id: 'r' }, children: [] } });
  expect(owner.getBase()).toBe(0);
  expect(owner.exportJson().base).toBe(0);
  owner.setBase(0);
  expect(owner.getBase()).toBe(0);
  owner.setBase(-2);
  expect(owner.getBase()).toBe(-2);
  owner.setBase('invalid');
  expect(owner.getBase()).toBe(1);
});

test('真实 kity Paper 上销毁 Minder 不抛错，只移除本实例事件且可重复销毁', () => {
  const paper = new window.kity.Paper(document.createElement('div'));
  let received = 0;
  let unrelated = 0;
  const otherHandler = () => { unrelated += 1; };
  paper.on('click', otherHandler);
  const owner = { _paper: paper, _firePharse: () => { received += 1; },
    _initEvents: () => {}, _garbage: () => {}, _modules: {} };
  owner._bindEvents = method('_bindEvents', 'dispatchKeyEvent');
  owner._bindEvents();
  paper.node.dispatchEvent(new MouseEvent('click'));
  expect(received).toBe(1);
  try {
    expect(() => method('destroy', 'reset').call(owner)).not.toThrow();
    paper.node.dispatchEvent(new MouseEvent('click'));
    expect(received).toBe(1);
    expect(unrelated).toBe(2);
    expect(() => method('destroy', 'reset').call(owner)).not.toThrow();
  } finally {
    window.removeEventListener('resize', owner._firePharseHandler);
    'click dblclick mousedown contextmenu mouseup mousemove mouseover mousewheel DOMMouseScroll touchstart touchmove touchend dragenter dragleave drop'
      .split(' ').forEach(type => paper.off(type));
  }
});
