/** @jest-environment node */
/* eslint-env jest */
import { splitMatches } from '../src/components/react-mindmap-editor/components/searchHighlight'

test('搜索词高亮只拆分显示文字，不改变大小写和原始文本', () => {
  expect(splitMatches('客户管理客户', '客户')).toEqual([
    { text: '客户', matched: true }, { text: '管理', matched: false },
    { text: '客户', matched: true },
  ])
  expect(splitMatches('Login login', 'LOGIN')).toEqual([
    { text: 'Login', matched: true }, { text: ' ', matched: false },
    { text: 'login', matched: true },
  ])
})
