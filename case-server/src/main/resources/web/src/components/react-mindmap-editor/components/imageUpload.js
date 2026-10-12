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

export const pasteImageIntoNode = (file, node, minder, baseUrl = '', uploadUrl = '') =>
  uploadImage(file, baseUrl, uploadUrl).then(url => {
    minder.select(node, true)
    minder.execCommand('image', url, '')
    return url
  })
