import React, { Component } from 'react';
import { Icon, Button, Tooltip } from 'antd';
import './PriorityGroup.scss';

class PriorityGroup extends Component {
  componentDidMount() { this.mounted = true; }
  componentWillUnmount() { this.mounted = false; }
  handleAction = (priority) => {
    const { minder, isLock, readOnly } = this.props;
    if (isLock || readOnly || !minder.getSelectedNodes().length) return;
    minder.execCommand('Priority', priority || 0);
    // 选中态来自脑图外部数据；本次命令后立即刷新，不依赖父级保存确认。
    if (this.mounted) this.forceUpdate();
  };
  render() {
    const { minder, priority = [1, 2, 3], isLock, readOnly } = this.props;
    let disabled = minder.getSelectedNodes().length === 0;
    if (isLock || readOnly) disabled = true;
    const selectedPriority = Number(minder.queryCommandValue('Priority')) || 0;
    return (
      <div className="nodes-actions mindmap-priority-actions">
        <Tooltip title="移除优先级" getPopupContainer={(triggerNode) => triggerNode.parentNode}>
          <span>
          <Button
            type="link"
            size="small"
            disabled={disabled}
            className="mindmap-tool-button priority-clear"
            aria-label="清除优先级"
            onClick={() => this.handleAction()}
          >
            <Icon
              type="minus-circle"
            />
          </Button>
          </span>
        </Tooltip>
        {priority &&
          priority.map((item) => {
            return (
              <Button
                key={item}
                type="link"
                size="small"
                disabled={disabled}
                className={`mindmap-tool-button priority-btn p${item}`}
                aria-label={`优先级 P${item - 1}`}
                aria-pressed={selectedPriority === item}
                onClick={() => this.handleAction(item)}
              >
                P{item - 1}
              </Button>
            );
          })}
      </div>
    );
  }
}
export default PriorityGroup;
