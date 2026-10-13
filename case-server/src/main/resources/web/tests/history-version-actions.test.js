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
  const page = new Compare({ match: { params: { caseId1: '11', caseId2: '12' } } });
  page.setState = update => Object.assign(page.state, update);
  page.editorNode = { setEditerData: jest.fn(() => Promise.resolve()) };
  page.componentDidMount();
  await Promise.resolve();
  expect(page.editorNode.setEditerData).toHaveBeenCalledWith(content);
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
