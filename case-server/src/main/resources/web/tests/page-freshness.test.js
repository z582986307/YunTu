/** @jest-environment node */
/* eslint-env jest */
import { bundlePathFromHtml, isConfirmedDataStale } from '../src/components/react-mindmap-editor/pageFreshness'

test('部署版本只比较实际加载的主脚本，不受页面内容变化影响', () => {
  expect(bundlePathFromHtml('<script src="/umi.abc123.js"></script>')).toBe('/umi.abc123.js')
  expect(bundlePathFromHtml('<script src="/umi.def456.js"></script>')).toBe('/umi.def456.js')
  expect(bundlePathFromHtml('<script src="/vendor.js"></script>')).toBe(null)
})

test('仅服务端数据版本高于已应用版本才判定页面落后', () => {
  expect(isConfirmedDataStale(12, 13)).toBe(true)
  expect(isConfirmedDataStale(13, 13)).toBe(false)
  expect(isConfirmedDataStale(14, 13)).toBe(false)
  expect(isConfirmedDataStale(undefined, 13)).toBe(false)
})
