/* eslint-env jest */
import Editor from '../src/components/react-mindmap-editor';
jest.mock('kity', () => ({}));
jest.mock('antd/es/locale/zh_CN', () => ({}));
jest.mock('hotbox-ui/hotbox', () => ({}));
jest.mock('../src/components/react-mindmap-editor/assets/kityminder-core/kityminder.core.js', () => ({}));
jest.mock('../src/components/react-mindmap-editor/util/clipboard', () => ({ init: () => {}, removeListener: () => {} }));

const setup = () => {
  const dataA = { id: 'a', resource: ['甲', '乙'] }, dataB = { id: 'b', resource: ['丙'] };
  const node = data => ({ getData: key => data[key] });
  const a = node(dataA), b = node(dataB);
  let selected = b;
  const e = new Editor({ readOnly: false });
  e.state = { ...e.state, loading: false, isLock: false, wsConnected: true };
  e.minder = { getNodeById: id => id === 'a' ? a : b, select: value => { selected = value; },
    execCommand: (command, value) => { if (command === 'Resource') (selected === a ? dataA : dataB).resource = value; } };
  return { e, a, dataA, dataB };
};
test('节点标签清除仅操作悬浮的节点和对应标签，最后一个清除后为空', () => {
  const { e, a, dataA, dataB } = setup();
  e.handleResourceRemove({ node: a, resource: '甲' });
  expect(dataA.resource).toEqual(['乙']);
  expect(dataB.resource).toEqual(['丙']);
  e.handleResourceRemove({ node: a, resource: '乙' });
  expect(dataA.resource).toBeNull();
});
test('任务只读、被锁、保存准备中及过期节点上的删除请求均不能改数据', () => {
  const { e, a, dataA } = setup();
  e.props = { readOnly: true };
  e.handleResourceRemove({ node: a, resource: '甲' });
  e.props = { readOnly: false }; e.state.isLock = true;
  e.handleResourceRemove({ node: a, resource: '甲' });
  e.state.isLock = false; e.savePreparing = true;
  e.handleResourceRemove({ node: a, resource: '甲' });
  e.savePreparing = false;
  e.handleResourceRemove({ node: { getData: key => key === 'id' ? 'a' : ['甲'] }, resource: '甲' });
  expect(dataA.resource).toEqual(['甲', '乙']);
});
