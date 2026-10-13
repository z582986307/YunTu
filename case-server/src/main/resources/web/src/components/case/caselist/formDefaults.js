export const fileTitle = name => String(name || '').replace(/\.(xmind|xlsx|xls)$/i, '')

export const taskTitle = record => (record && record.title) || ''
