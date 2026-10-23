/** @jest-environment node */
/* eslint-env jest */
import { fileTitle, taskTitle, copyCaseTitle } from '../src/components/case/caselist/formDefaults'

test('导入文件默认使用不带扩展名的文件名作为用例名称', () => {
  expect(fileTitle('客户管理.xmind')).toBe('客户管理')
  expect(fileTitle('客户.管理.xlsx')).toBe('客户.管理')
  expect(fileTitle('无扩展名')).toBe('无扩展名')
})

test('新建测试任务默认显示首个编号，已有编号由服务端校正', () => {
  expect(taskTitle({ title: '客户管理' })).toBe('客户管理（1）')
  expect(taskTitle(null)).toBe('')
})

test('复制用例默认名称在原名后追加副本', () => {
  expect(copyCaseTitle('客户管理')).toBe('客户管理_副本')
})
