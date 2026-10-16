/* eslint-env jest */
import { getUploadedImageUrl, getClipboardImage, pasteImageIntoNode } from '../src/components/react-mindmap-editor/components/imageUpload'
import fs from 'fs'
import path from 'path'

test('上传和粘贴预览的删除按钮固定在图片右上角并使用红色危险操作样式', () => {
  const styles = fs.readFileSync(path.join(__dirname, '../src/components/react-mindmap-editor/index.scss'), 'utf8')
  const previewStyle = styles.match(/\.mindmap-image-preview-delete\.ant-btn\s*\{([^}]+)\}/)[1]
  expect(previewStyle).toMatch(/top:\s*-8px/)
  expect(previewStyle).toMatch(/right:\s*-8px/)
  expect(previewStyle).toMatch(/color:\s*#fff/)
  expect(previewStyle).toMatch(/background:\s*#f04438/)
  const nodeStyle = styles.match(/\.mindmap-node-image-delete\s*\{([^}]+)\}/)[1]
  expect(nodeStyle).toMatch(/width:\s*24px/)
  expect(nodeStyle).toMatch(/border:\s*0/)
})

test('上传接口只接受成功且包含图片地址的响应', () => {
  expect(getUploadedImageUrl({ success: 1, data: [{ url: '/2026/10/image.png' }] })).toBe('/2026/10/image.png')
  expect(() => getUploadedImageUrl({ success: 0, data: '' })).toThrow('图片上传失败')
  expect(() => getUploadedImageUrl({ success: 1, data: [] })).toThrow('图片上传失败')
})

test('粘贴时只读取剪贴板中的图片文件', () => {
  const image = { name: 'pasted.png', type: 'image/png' }
  expect(getClipboardImage({ items: [
    { type: 'text/plain', getAsFile: () => null },
    { type: 'image/png', getAsFile: () => image },
  ] })).toBe(image)
  expect(getClipboardImage({ items: [{ type: 'text/plain', getAsFile: () => null }] })).toBeNull()
})

test('选中节点粘贴图片后直接写入节点，不经过弹窗', async () => {
  const originalFetch = global.fetch
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: 1, data: [{ url: '/images/pasted.png' }] }) }))
  const node = { image: null }
  const minder = {
    select: () => {},
    execCommand: (command, url) => {
      if (command === 'image') node.image = url
    },
  }
  try {
    await pasteImageIntoNode({ name: 'pasted.png', type: 'image/png' }, node, minder, '', '/upload')
    expect(node.image).toBe('/images/pasted.png')
  } finally {
    global.fetch = originalFetch
  }
})
