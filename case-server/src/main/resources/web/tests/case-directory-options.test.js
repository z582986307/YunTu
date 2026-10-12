/** @jest-environment node */
/* eslint-env jest */
jest.mock('antd', () => ({
  Form: { create: () => Component => Component },
  TreeSelect: { TreeNode: () => null },
  Upload: { Dragger: () => null },
  message: {},
  Modal: () => null,
  Input: Object.assign(() => null, { TextArea: () => null }),
  Icon: () => null,
  Row: () => null,
  Col: () => null,
}));
jest.mock('umi/router', () => ({}));
jest.mock('@/utils/axios', () => () => Promise.resolve({ data: null }));
jest.mock('@/utils/getCookies', () => ({ getCookie: () => '' }));
jest.mock('../src/components/case/caselist/testcase-template.xlsx', () => 'template');

const CaseModal = require('../src/components/case/caselist/caseModal').default;

test('目录选项显示名称与左侧目录一致，保留原 ID', () => {
  const modal = new CaseModal({ show: false, productId: 1 });
  const nodes = modal.renderTreeNodes([
    { id: -1, text: '未分类用例集', children: [] },
    { id: 7, text: '客户管理', children: [] },
  ]);
  expect(nodes.map(node => ({ id: node.props.value, title: node.props.title.props.children }))).toEqual([
    { id: -1, title: '未分类用例' },
    { id: 7, title: '客户管理' },
  ]);
});
