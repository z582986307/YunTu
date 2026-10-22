import React from 'react'

export default function resizableColumns(columns, widths, onResize) {
  return columns.map((column, index) => {
    const key = column.key || column.dataIndex || String(index)
    const width = widths[key] || column.width || 180
    return {
      ...column,
      width,
      title: <span className="resizable-column-title">
        <span>{column.title}</span>
        <span className="resizable-column-handle" role="separator" aria-label={`调整${column.title}列宽`}
          onMouseDown={event => {
            event.preventDefault()
            event.stopPropagation()
            const startX = event.clientX
            const onMove = move => onResize(key, Math.max(72, width + move.clientX - startX))
            const onUp = () => {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
            }
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          }} />
      </span>,
    }
  })
}
