/** @jest-environment node */
/* eslint-env jest */
jest.mock('antd', () => ({
  Table: () => null,
  Button: () => null,
  Card: () => null,
  Tooltip: () => null,
  Spin: () => null,
  Tag: () => null,
  Modal: { confirm: jest.fn() },
  message: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('@/utils/axios', () => jest.fn());
jest.mock('@/utils/getCookies', () => ({ getCookie: () => 'tester' }));
jest.mock('../src/layouts/headers', () => () => null);
jest.mock('../src/components/react-mindmap-editor', () => () => null);

const request = require('@/utils/axios');
const { Modal } = require('antd');
const History = require('../src/pages/contrast/index').default;
const Compare = require('../src/pages/contrast/seeResult').default;

beforeEach(() => {
  request.mockClear();
  Modal.confirm.mockClear();
});

test('对比页将完整脑图数据交给查看器', async () => {
  const content = { root: { data: { text: '中心' }, children: [] }, template: 'right', base: 2 };
  request.mockResolvedValueOnce({ code: 200, data: { content, backupinfo: [] } });
  const page = new Compare({ match: { params: { caseId: '7', backupId: '12' } } });
  page.setState = update => Object.assign(page.state, update);
  page.editorNode = { setEditerData: jest.fn(() => Promise.resolve()) };
  page.componentDidMount();
  await Promise.resolve();
  expect(page.editorNode.setEditerData).toHaveBeenCalledWith(content);
  expect(request).toHaveBeenCalledWith('/backup/getCurrentCaseDiff', expect.objectContaining({
    params: { caseId: '7', backupId: '12' },
  }));
});

test('已有的双历史版本链接继续使用原对比接口', async () => {
  request.mockResolvedValueOnce({ code: 200, data: { content: { root: { data: {}, children: [] } }, backupinfo: [] } });
  const page = new Compare({ match: { params: { caseId1: '11', caseId2: '12' } } });
  page.setState = update => Object.assign(page.state, update);
  page.editorNode = { setEditerData: jest.fn(() => Promise.resolve()) };
  page.componentDidMount();
  await Promise.resolve();
  expect(request).toHaveBeenCalledWith('/backup/getCaseDiff', expect.objectContaining({
    params: { caseId1: '11', caseId2: '12' },
  }));
});

test('历史页默认把当前用例与单选历史版本对比', () => {
  const history = { push: jest.fn() };
  const page = new History({ match: { params: { caseId: '7' } }, history });
  page.state.rows = [{ id: 12 }];
  page.contrastClick();
  expect(history.push).toHaveBeenCalledWith('/caseManager/currentContrast/7/12');
});

test('恢复操作二次确认后才提交所选版本', async () => {
  const page = new History({ match: { params: { caseId: '7' } } });
  page.getHistoryList = jest.fn();
  request.mockResolvedValueOnce({ code: 200 });
  page.restoreClick({ id: 11, caseId: 7 });
  expect(request).not.toHaveBeenCalled();
  const options = Modal.confirm.mock.calls[0][0];
  expect(options.title).toContain('恢复');
  await options.onOk();
  expect(request).toHaveBeenCalledWith('/backup/restore', expect.objectContaining({
    method: 'POST',
    body: expect.objectContaining({ caseId: 7, backupId: 11 }),
  }));
  expect(page.getHistoryList).toHaveBeenCalled();
});

test('历史版本页返回按钮回到上一页', () => {
  const history = { goBack: jest.fn() };
  const page = new History({ match: { params: { caseId: '7' } }, history });
  const findBack = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.props && node.props.children === '返回') return node;
    const children = node.props && node.props.children;
    return (Array.isArray(children) ? children : [children]).map(findBack).find(Boolean);
  };
  const button = findBack(page.render());
  expect(button).not.toBeNull();
  button.props.onClick();
  expect(history.goBack).toHaveBeenCalledTimes(1);
});

test.each([
  { caseId: '7', backupId: '12' },
  { caseId1: '11', caseId2: '12' },
])('版本对比页返回用例列表，不依赖来源页面', params => {
  const history = { push: jest.fn(), goBack: jest.fn() };
  const page = new Compare({ match: { params }, history });
  const findBack = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.props && node.props.children === '返回') return node;
    const children = node.props && node.props.children;
    return (Array.isArray(children) ? children : [children]).map(findBack).find(Boolean);
  };
  const button = findBack(page.render());
  expect(button).not.toBeNull();
  button.props.onClick();
  expect(history.push).toHaveBeenCalledWith('/case/caseList/1');
  expect(history.goBack).not.toHaveBeenCalled();
});

test('对比页筛选只改变脑图展示，不改原始对比结果', async () => {
  const content = { root: { data: { id: 'root' }, children: [
    { data: { id: 'added', background: '#ddfade' }, children: [] },
    { data: { id: 'plain' }, children: [] },
  ] } };
  const page = new Compare({ match: { params: { caseId: '7' } } });
  page.setState = (update, done) => { Object.assign(page.state, update); if (done) done(); };
  page.rawContent = content;
  page.editorNode = { setEditerData: jest.fn(() => Promise.resolve()) };
  page.handleFilterChange('added');
  await Promise.resolve();
  expect(page.editorNode.setEditerData.mock.calls[0][0].root.children.map(node => node.data.id)).toEqual(['added']);
  expect(content.root.children).toHaveLength(2);
  expect(request).not.toHaveBeenCalled();
});
