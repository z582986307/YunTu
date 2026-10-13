import React, { useEffect, useRef, useState } from 'react'
import { Button, Icon, Input } from 'antd'
import PropTypes from 'prop-types'
import { highlightNodeText } from './searchHighlight'

const MindMapSearch = ({ minder }) => {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const highlights = useRef({ cancel: 0, cleanups: [] })

  const clearHighlights = () => {
    highlights.current.cancel += 1
    highlights.current.cleanups.forEach(cleanup => cleanup())
    highlights.current.cleanups = []
  }

  useEffect(() => () => clearHighlights(), [])

  const highlightMatches = (items, value) => {
    const token = highlights.current.cancel
    let offset = 0
    const paint = () => {
      if (token !== highlights.current.cancel) return
      const end = Math.min(offset + 80, items.length)
      for (; offset < end; offset += 1) {
        highlights.current.cleanups.push(highlightNodeText(items[offset], value))
      }
      if (offset < items.length) window.requestAnimationFrame(paint)
    }
    window.requestAnimationFrame(paint)
  }

  const focusCanvas = () => {
    const container = document.querySelector('.kityminder-core-container')
    if (container && !container.classList.contains('focus')) {
      container.classList.add('focus')
    }
  }

  const selectResult = (items, index) => {
    const node = items.length ? items[index] : minder.getRoot()
    minder.select([node], true)
    if (!node.isExpanded()) minder.execCommand('expand', true)
  }

  const search = value => {
    const normalized = value.trim().toLowerCase()
    clearHighlights()
    minder.fire('hidenoterequest')
    focusCanvas()
    if (!normalized) {
      setResults(null)
      setActiveIndex(0)
      return
    }
    const matches = []
    minder.getRoot().traverse(node => {
      const data = node.getData()
      const searchable = ['text', 'note', 'resource'].reduce((items, key) => {
        const field = data[key]
        if (Array.isArray(field)) return items.concat(field)
        if (field != null) items.push(String(field))
        return items
      }, [])
      if (
        searchable.some(item =>
          String(item)
            .toLowerCase()
            .includes(normalized),
        )
      ) {
        matches.push(node)
      }
    })
    setResults(matches)
    setActiveIndex(0)
    selectResult(matches, 0)
    highlightMatches(matches, normalized)
  }

  const move = offset => {
    if (!results || !results.length) return
    const next = (activeIndex + offset + results.length) % results.length
    setActiveIndex(next)
    selectResult(results, next)
    highlights.current.cleanups.push(highlightNodeText(results[next], keyword.trim()))
  }

  return (
    <div className="mindmap-header-search">
      <Input.Search
        placeholder="搜索用例"
        value={keyword}
        onChange={event => setKeyword(event.target.value)}
        onSearch={search}
        onFocus={() => {
          window.search = true
        }}
        onBlur={() => {
          window.search = false
        }}
      />
      {results && (
        <React.Fragment>
          <span className="mindmap-search-count">
            {results.length ? activeIndex + 1 : 0}/{results.length}
          </span>
          <Button.Group size="small">
            <Button aria-label="上一个搜索结果" onClick={() => move(-1)} disabled={!results.length}>
              <Icon type="up" />
            </Button>
            <Button aria-label="下一个搜索结果" onClick={() => move(1)} disabled={!results.length}>
              <Icon type="down" />
            </Button>
          </Button.Group>
        </React.Fragment>
      )}
    </div>
  )
}

export default MindMapSearch

MindMapSearch.propTypes = {
  minder: PropTypes.object.isRequired,
}
