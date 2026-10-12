/* eslint-env jest */
import { getUploadedImageUrl, getClipboardImage, pasteImageIntoNode } from '../src/components/react-mindmap-editor/components/imageUpload'

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
