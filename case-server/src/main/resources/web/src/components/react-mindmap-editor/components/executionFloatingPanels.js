import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { Button, Input, message, Tooltip } from 'antd'
import { LinkModal } from './index'
import {
  EXECUTION_FILTER_OPTIONS,
  EXECUTION_MARK_OPTIONS,
  RESULT_OPTIONS,
  canMarkExecutionResult,
  collectSelectedExecutionNodes,
  createExecutionResultIndex,
  getExecutionResultKey,
  updateExecutionResultIndex,
  expandAllExecutionNodes,
  focusFilteredExecutionNodes,
  getExecutionProgress,
  EXECUTION_STATUS_PATHS,
  getExecutionOptionClassName,
  getExecutionMarkGridStyle,
  getNodeNote,
  PANEL_TOGGLE_ICONS,
} from '../executionPanelUtils'

const renderExecutionStatusIcon = item => (
  <svg
    className={`execution-status-icon ${item.tone}`}
    viewBox="0 0 20 20"
    aria-hidden="true"
  >
    <circle cx="10" cy="10" r="9" />
    <path d={EXECUTION_STATUS_PATHS[item.tone]} />
  </svg>
)

class ExecutionFloatingPanels extends Component {
  state = {
    filterCollapsed: false,
    resultCollapsed: false,
    showLink: false,
    note: getNodeNote(this.props.selectedNode),
    executionIndex: createExecutionResultIndex(this.props.minder.getRoot()),
  }
  componentDidMount() {
    if (this.props.registerPendingInput)
      this.unregisterPendingInput = this.props.registerPendingInput(this.commitPendingInput)
    this.props.minder.on('import', this.rebuildExecutionIndex)
    this.props.minder.on('progressiveimportdone', this.rebuildExecutionIndex)
  }
  componentWillUnmount() {
    if (this.unregisterPendingInput) this.unregisterPendingInput()
    this.props.minder.off('import', this.rebuildExecutionIndex)
    this.props.minder.off('progressiveimportdone', this.rebuildExecutionIndex)
    this.props.minder.off('layoutallfinish', this.centerAfterFilter)
  }
  rebuildExecutionIndex = () =>
    this.setState({
      executionIndex: createExecutionResultIndex(this.props.minder.getRoot()),
    })
  componentDidUpdate(prevProps) {
    if (prevProps.selectedNode !== this.props.selectedNode)
      this.setState({ note: getNodeNote(this.props.selectedNode) })
  }
  mark = value => {
    const { minder } = this.props
    const selectedNodes = [...minder.getSelectedNodes()]
    const executionNodes = collectSelectedExecutionNodes(selectedNodes)
    if (!executionNodes.length) return
    const changes = executionNodes.map(node => ({
      node,
      previous: node.getData('progress'),
    }))
    const apply = () => {
      minder.select(executionNodes, true)
      minder.execCommand('Progress', value)
    }
    if (this.props.onExecutionChange)
      this.props.onExecutionChange('progress', executionNodes, value, apply)
    else apply()
    changes.forEach(change =>
      updateExecutionResultIndex(
        this.state.executionIndex,
        [change.node],
        change.previous,
        value,
      ),
    )
    this.setState({ executionIndex: { ...this.state.executionIndex } })
    minder.select(selectedNodes, true)
    minder.fire('receiverfocus')
    this.props.onChange()
  }
  commitPendingInput = () => {
    const node = this.props.minder.getSelectedNode()
    if (!node || this.props.isLock || this.props.minder.getSelectedNodes().length !== 1) return
    if (this.noteComposing) throw new Error('请先完成备注输入法选词，再保存或编辑源用例')
    if ((this.state.note.trim() || '') !== getNodeNote(node)) this.saveNote(false)
  }
  saveNote = (notify = true) => {
    const value = this.state.note.trim() || null
    const node = this.props.minder.getSelectedNode()
    const apply = () => this.props.minder.execCommand('Note', value)
    if (this.props.onExecutionChange)
      this.props.onExecutionChange('note', [node], value, apply)
    else apply()
    this.props.onChange()
    if (notify) message.success('备注已保存')
  }
  centerAfterFilter = () => {
    const { minder } = this.props
    minder.off('layoutallfinish', this.centerAfterFilter)
    const duration = minder.getOption('viewAnimationDuration')
    minder.setOption('viewAnimationDuration', 0)
    minder.execCommand('camera', minder.getRoot())
    minder.setOption('viewAnimationDuration', duration)
  }
  layoutAndCenter = () => {
    const { minder } = this.props
    minder.off('layoutallfinish', this.centerAfterFilter)
    minder.on('layoutallfinish', this.centerAfterFilter)
    minder.layout(100)
  }
  filter = value => {
    const { minder } = this.props
    const root = minder.getRoot()
    const key = value === 'pending' ? 'pending' : getExecutionResultKey(value)
    const nodes = [...this.state.executionIndex.nodesByKey[key]]
    focusFilteredExecutionNodes(root, nodes)
    root.renderTree()
    this.layoutAndCenter()
    minder.select([], true)
    minder.fire('receiverfocus')
  }
  showAll = () => {
    const { minder } = this.props
    const root = minder.getRoot()
    expandAllExecutionNodes(root)
    root.renderTree()
    this.layoutAndCenter()
    minder.select([], true)
    minder.fire('receiverfocus')
  }
  renderFilter() {
    const counts = this.state.executionIndex.counts
    const progress = getExecutionProgress(counts)
    return (
      <div className="execution-filter-shell">
        {this.state.filterCollapsed && (
        <Button
          className="execution-filter-rail"
          icon={PANEL_TOGGLE_ICONS.collapsed}
          aria-label="展开执行进度"
          title="展开执行进度"
          onClick={() => this.setState({ filterCollapsed: false })}
        >
          执行进度
        </Button>
        )}
      <section className={`execution-filter-panel${this.state.filterCollapsed ? ' execution-panel-hidden' : ''}`} aria-label="计划周期与执行进度">
        <Button
          className="execution-panel-collapse-handle"
          icon={PANEL_TOGGLE_ICONS.expanded}
          aria-label="收起计划周期与执行进度"
          title="收起执行进度"
          onClick={() => this.setState({ filterCollapsed: true })}
        />
        <div className="execution-panel-scroll-content">
        <div className="execution-plan-cycle">
          <span>计划周期</span>
          <strong>{this.props.planCycle || '未设置'}</strong>
        </div>
        <div className="execution-progress-summary">
          <span>执行进度</span>
          <span className="execution-progress-values">
            <strong>{progress.completed} / {progress.total}</strong>
            <strong>{progress.percent}%</strong>
          </span>
        </div>
        <div
          className="execution-progress-bar"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax={progress.total}
          aria-valuenow={progress.completed}
          aria-label={`已执行 ${progress.completed} 条，共 ${progress.total} 条`}
        >
          {RESULT_OPTIONS.map(item => (
            <Tooltip title={`${item.label} ${counts[item.key]}`} key={item.key}>
              <button
                type="button"
                className={`execution-progress-segment ${item.tone}`}
                aria-label={`筛选${item.label}用例 ${counts[item.key]} 条`}
                onClick={() => this.filter(item.value)}
                style={{
                  width: `${progress.total ? (counts[item.key] / progress.total) * 100 : 0}%`,
                }}
              />
            </Tooltip>
          ))}
          <Tooltip title={`未测试 ${counts.pending}`}>
            <button
              type="button"
              className="execution-progress-segment pending"
              aria-label={`筛选未测试用例 ${counts.pending} 条`}
              onClick={() => this.filter('pending')}
              style={{
                width: `${progress.total ? (counts.pending / progress.total) * 100 : 100}%`,
              }}
            />
          </Tooltip>
        </div>
        <div className="execution-filter-grid" aria-label="按执行结果筛选">
          <Button
            className="execution-status-button neutral execution-filter-item"
            aria-label={`展开全部用例 ${counts.total} 条`}
            onClick={this.showAll}
          >
            <span>
              <i className="execution-status-dot neutral" aria-hidden="true" />
              全部
            </span>
            <strong className="execution-status-count">{counts.total}</strong>
          </Button>
          {EXECUTION_FILTER_OPTIONS.map(item => {
            const count = item.key === 'untested' ? counts.pending : counts[item.key]
            const value = item.value === undefined ? 'pending' : item.value
            return (
              <Button
                className={`${getExecutionOptionClassName(item.tone, false)} execution-filter-item`}
                aria-label={`筛选${item.label}用例 ${count} 条`}
                key={item.key}
                onClick={() => this.filter(value)}
              >
                <span>
                  {renderExecutionStatusIcon(item)}
                  {item.label}
                </span>
                <strong className="execution-status-count">{count}</strong>
              </Button>
            )
          })}
        </div>
        </div>
      </section>
      </div>
    )
  }
  render() {
    const { selectedNode, isLock } = this.props
    const selectedCount = this.props.minder.getSelectedNodes().length
    const markDisabled = !canMarkExecutionResult(selectedCount, isLock)
    const noteDisabled = isLock || selectedCount !== 1 || !selectedNode
    const selectedProgress =
      selectedNode && selectedNode.getChildren().length === 0
        ? selectedNode.getData('progress')
        : '__parent__'
    return (
      <React.Fragment>
        <div className="execution-floating-stack">
          {this.renderFilter()}
        <div className="execution-result-shell">
        {this.state.resultCollapsed && (
          <Button
            className="execution-result-rail"
            icon={PANEL_TOGGLE_ICONS.collapsed}
            aria-label="展开标记结果"
            title="展开标记结果"
            onClick={() => this.setState({ resultCollapsed: false })}
          >
            标记结果
          </Button>
        )}
          <section className={`execution-result-panel${this.state.resultCollapsed ? ' execution-panel-hidden' : ''}`} aria-label="执行结果">
            <Button
              className="execution-panel-collapse-handle"
              icon={PANEL_TOGGLE_ICONS.expanded}
              aria-label="收起标记结果"
              title="收起标记结果"
              onClick={() => this.setState({ resultCollapsed: true })}
            />
            <div className="execution-panel-scroll-content">
            <div className="execution-section-label">标记状态</div>
            <div className="execution-result-actions" style={getExecutionMarkGridStyle()}>
              {EXECUTION_MARK_OPTIONS.map(item => {
                const active =
                  item.value === undefined
                    ? selectedProgress === undefined || selectedProgress === null
                    : selectedProgress === item.value
                return (
                  <Button
                    key={item.key}
                    title={item.label}
                    className={`${getExecutionOptionClassName(
                      item.tone,
                      active,
                    )} execution-result-button`}
                    disabled={markDisabled}
                    onClick={() => this.mark(item.value)}
                  >
                    {renderExecutionStatusIcon(item)}
                    <span>{item.label}</span>
                  </Button>
                )
              })}
            </div>
            <div className="execution-note-header">
              <span>执行备注</span>
              <div className="execution-note-tools">
                <Tooltip title="插入链接">
                  <Button
                    type="link"
                    icon="link"
                    disabled={noteDisabled}
                    aria-label="插入链接"
                    onClick={() => this.setState({ showLink: true })}
                  />
                </Tooltip>
                <em>{this.state.note.length}/500</em>
              </div>
            </div>
            <Input.TextArea
              rows={3}
              maxLength={500}
              disabled={noteDisabled}
              placeholder="填写本次执行备注"
              value={this.state.note}
              onChange={event => this.setState({ note: event.target.value })}
              onCompositionStart={() => { this.noteComposing = true }}
              onCompositionEnd={() => { this.noteComposing = false }}
            />
            <div className="execution-panel-footer">
              <Button type="primary" disabled={noteDisabled} onClick={this.saveNote}>
                保存备注
              </Button>
            </div>
            </div>
          </section>
        </div>
        </div>
        {this.state.showLink && (
          <LinkModal
            visible
            minder={this.props.minder}
            onCancel={() => this.setState({ showLink: false })}
          />
        )}
      </React.Fragment>
    )
  }
}
ExecutionFloatingPanels.propTypes = {
  minder: PropTypes.object.isRequired,
  selectedNode: PropTypes.object,
  isLock: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  planCycle: PropTypes.string,
  baseUrl: PropTypes.string,
  uploadUrl: PropTypes.string,
  onExecutionChange: PropTypes.func,
  registerPendingInput: PropTypes.func,
}
export default ExecutionFloatingPanels
