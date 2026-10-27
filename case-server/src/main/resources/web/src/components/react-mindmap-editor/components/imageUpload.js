export const getUploadedImageUrl = response => {
  const url = response && response.success === 1 && response.data && response.data[0] && response.data[0].url
  if (!url) throw new Error('图片上传失败，请重试')
  return url
}

export const getClipboardImage = clipboardData => {
  const items = clipboardData && clipboardData.items
  if (!items) return null
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item.type && item.type.indexOf('image/') === 0) return item.getAsFile()
  }
  return null
}

export const uploadImage = (file, baseUrl = '', uploadUrl = '') => {
  const data = new FormData()
  data.append('file', file)
  return fetch(baseUrl + uploadUrl, {
    method: 'POST',
    credentials: 'include',
    body: data,
  }).then(response => {
    if (!response.ok) throw new Error('图片上传失败，请重试')
    return response.json()
  }).then(getUploadedImageUrl)
}

export const pasteImageIntoNode = (file, node, minder, baseUrl = '', uploadUrl = '', isActive = () => true) =>
  uploadImage(file, baseUrl, uploadUrl).then(async url => {
    if (!isActive()) throw new Error('编辑器已关闭或失去操作权，图片未插入')
    minder.select(node, true)
    await minder.execCommand('image', url, '')
    return url
  })
