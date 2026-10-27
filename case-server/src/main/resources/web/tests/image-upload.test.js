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

test('粘贴保存等待图片命令的异步写入完成', async () => {
  const previous = global.fetch
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: 1, data: [{ url: '/image.png' }] }) })
  let finish
  let inserted = false
  const pending = pasteImageIntoNode({}, {}, { select: () => {}, execCommand: () => new Promise(resolve => { finish = resolve }) })
    .then(() => { inserted = true })
  try {
    for (let index = 0; index < 10; index += 1) await Promise.resolve()
    expect(inserted).toBe(false)
    finish()
    await pending
    expect(inserted).toBe(true)
  } finally { global.fetch = previous }
})

test('编辑器已卸载时晚到上传结果不能写入旧脑图', async () => {
  const previous = global.fetch
  global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: 1, data: [{ url: '/image.png' }] }) })
  const minder = { select: jest.fn(), execCommand: jest.fn() }
  try {
    await expect(pasteImageIntoNode({}, {}, minder, '', '', () => false)).rejects.toThrow('已关闭')
    expect(minder.execCommand).not.toHaveBeenCalled()
  } finally { global.fetch = previous }
})
