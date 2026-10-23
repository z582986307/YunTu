export const fileTitle = name => String(name || '').replace(/\.(xmind|xlsx|xls)$/i, '')

export const taskTitle = record => (record && record.title) ? `${record.title}（1）` : ''

export const copyCaseTitle = title => `${String(title || '').trim()}_副本`
