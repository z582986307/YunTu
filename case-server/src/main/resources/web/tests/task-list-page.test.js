/** @jest-environment node */
/* eslint-env jest */
jest.mock('antd', () => ({ Table: () => null, Pagination: () => null, Button: () => null,
  message: { error: jest.fn() } }))
jest.mock('@/utils/axios', () => jest.fn())
jest.mock('umi/router', () => ({ push: jest.fn() }))
jest.mock('@/utils/getCookies', () => ({ getCookie: () => 'tester' }))
jest.mock('../src/components/case/caselist/taskModal', () => () => null)

const request = require('@/utils/axios')
const TaskList = require('../src/components/case/caselist/taskList').default

test('测试任务列表使用产品级分页接口，不逐个请求用例', async () => {
  request.mockResolvedValueOnce({ code: 200, data: { dataSources: [{ id: 8, title: '任务' }], total: 1 } })
  const page = new TaskList({ productLineId: '1' })
  page.setState = update => Object.assign(page.state, update)
  await page.loadPage(1)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('/record/page', expect.objectContaining({
    method: 'GET', params: expect.objectContaining({ productLineId: 1, pageNum: 1 }),
  }))
  expect(page.state.tasks).toHaveLength(1)
})
