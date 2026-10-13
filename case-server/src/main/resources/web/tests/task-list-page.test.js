/** @jest-environment node */
/* eslint-env jest */
jest.mock('antd', () => ({ Table: () => null, Pagination: () => null, Button: () => null,
  message: { error: jest.fn() } }))
jest.mock('@/utils/axios', () => jest.fn())
jest.mock('umi/router', () => ({ push: jest.fn() }))
jest.mock('umi/link', () => () => null)
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

test('筛选任务名称或 ID、负责人和创建时间时重置第一页并传给分页接口', async () => {
  request.mockResolvedValue({ code: 200, data: { dataSources: [], total: 0 } })
  const page = new TaskList({ productLineId: '1' })
  page.setState = update => Object.assign(page.state, update)
  page.state.page = 4
  await page.applyFilters({ keyword: '客户', owner: 'tester', dates: ['2026-10-01', '2026-10-31'] })
  expect(request).toHaveBeenLastCalledWith('/record/page', expect.objectContaining({ params: expect.objectContaining({
    pageNum: 1, keyword: '客户', owner: 'tester',
    beginTime: '2026-10-01 00:00:00', endTime: '2026-10-31 23:59:59',
  }) }))
})

test('旧筛选请求晚返回时不能覆盖新筛选结果', async () => {
  let finishOld
  request.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    .mockResolvedValueOnce({ code: 200, data: { dataSources: [{ id: 2 }], total: 1 } })
  const page = new TaskList({ productLineId: '1' })
  page.setState = update => Object.assign(page.state, update)
  const oldRequest = page.loadPage(1, { keyword: '旧', owner: '', dates: [] })
  await page.loadPage(1, { keyword: '新', owner: '', dates: [] })
  finishOld({ code: 200, data: { dataSources: [{ id: 1 }], total: 1 } })
  await oldRequest
  expect(page.state.tasks).toEqual([{ id: 2 }])
})
