import React, { useEffect, useRef, useState } from 'react'
import { Button, Icon, Input } from 'antd'
import PropTypes from 'prop-types'
import { highlightNodeText } from './searchHighlight'

const MindMapSearch = ({ minder }) => {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const highlights = useRef({ cancel: 0, cleanups: [] })
  const focusRequest = useRef(0)
  const pendingFrame = useRef(null)
  const finalLayout = useRef(null)

  const cancelFocus = () => {
    focusRequest.current += 1
    if (pendingFrame.current != null) window.cancelAnimationFrame(pendingFrame.current)
    pendingFrame.current = null
    if (finalLayout.current) minder.off('layoutallfinish', finalLayout.current)
    finalLayout.current = null
  }

  // 导入和分片布局等待真实完成；旧普通布局标记可能永久遗留false，不能无限阻塞搜索。
  const afterLayout = (request, callback) => {
    const check = () => {
      pendingFrame.current = null
      if (request !== focusRequest.current || minder._mindMapImportFailed) return
      if (minder._progressiveImporting || minder._progressiveApplying || minder._pendingLayout) {
        pendingFrame.current = window.requestAnimationFrame(check)
        return
      }
      callback()
    }
    pendingFrame.current = window.requestAnimationFrame(check)
  }

  const clearHighlights = () => {
    cancelFocus()
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

  const centerResult = (node, request) => {
    if (request !== focusRequest.current || minder.getSelectedNode() !== node) return
    const dragger = minder.getViewDragger()
    const timeline = dragger.timeline()
    if (timeline) {
      timeline.stop()
      // 沿用视图恢复逻辑：kity.stop不触发finish，不能留下已停时间线引用。
      dragger._moveTimeline = null
    }
    const duration = minder.getOption('viewAnimationDuration')
    minder.setOption('viewAnimationDuration', 0)
    try {
      // 保留camera的目标绘制恢复；缓存viewport中心可能不随外观栏尺寸变化。
      minder.execCommand('camera', node)
      if (request !== focusRequest.current) return
      const canvas = minder.getRenderTarget().getBoundingClientRect()
      const box = node.getRenderContainer().getRenderBox('screen')
      const matrix = minder.getPaper().shapeNode.getScreenCTM()
      if (!matrix) return
      const inverse = matrix.inverse()
      const dx = canvas.left + canvas.width / 2 - box.x - box.width / 2
      const dy = canvas.top + canvas.height / 2 - box.y - box.height / 2
      // 屏幕差值必须转回view坐标；只取逆矩阵线性部分，平移分量在差值中抵消。
      dragger.move({ x: inverse.a * dx + inverse.c * dy, y: inverse.b * dx + inverse.d * dy })
    } finally {
      minder.setOption('viewAnimationDuration', duration)
    }
  }

  const selectResult = (items, index) => {
    cancelFocus()
    const request = focusRequest.current
    const node = items.length ? items[index] : minder.getRoot()
    const expand = !node.isExpanded()
    if (
      expand ||
      minder._pendingLayout ||
      (minder._viewLayoutCompletion && !minder._viewLayoutCompletion.finished)
    ) {
      const finish = () => {
        minder.off('layoutallfinish', finish)
        if (finalLayout.current === finish) finalLayout.current = null
        afterLayout(request, () => centerResult(node, request))
      }
      finalLayout.current = finish
      minder.on('layoutallfinish', finish)
    }
    minder.select([node], true)
    if (expand) {
      const duration = minder.getOption('layoutAnimationDuration')
      minder.setOption('layoutAnimationDuration', 0)
      try {
        minder.execCommand('expand', true)
      } finally {
        minder.setOption('layoutAnimationDuration', duration)
      }
    }
    afterLayout(request, () => centerResult(node, request))
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
    if (minder._progressiveImporting || minder._progressiveApplying) {
      // 渐进导入尚未构造完整树时，不能把当前半棵树当作全部搜索结果。
      afterLayout(focusRequest.current, () => search(value))
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

  const stopInputKeyboard = event => {
    // 搜索选中结果会把焦点交给节点的预备textarea，原Enter默认输入不能随焦点迁移过去。
    if (event.keyCode === 13) event.preventDefault()
    event.stopPropagation()
    // React16与脑图原生监听都在document，必须同时阻止同层后续原生监听。
    if (event.nativeEvent && event.nativeEvent.stopImmediatePropagation) {
      event.nativeEvent.stopImmediatePropagation()
    }
  }

  return (
    <div className="mindmap-header-search">
      <Input.Search
        placeholder="搜索用例"
        value={keyword}
        onChange={event => setKeyword(event.target.value)}
        onSearch={search}
        onKeyDown={stopInputKeyboard}
        onKeyPress={stopInputKeyboard}
        onKeyUp={stopInputKeyboard}
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
            <Button aria-label="下一个搜索结果" onClick={() => move(1)} disabled={!results.length}>
              <Icon type="down" />
            </Button>
            <Button aria-label="上一个搜索结果" onClick={() => move(-1)} disabled={!results.length}>
              <Icon type="up" />
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
