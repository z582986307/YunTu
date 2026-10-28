import React, { Component } from 'react';
import { Select, Button } from 'antd';
import { fontSizeList } from '../constants';
import { ColorPicker } from '../components';

class FontGroup extends Component {
  state = {
    FontSize: this.props.minder.queryCommandValue('FontSize'),
  };
  componentWillReceiveProps(nextProps) {
    this.setState({ FontSize: nextProps.minder.queryCommandValue('FontSize') || '' });
  }
  onChange = (action, value) => {
    const { minder } = this.props;
    if (minder.queryCommandState(action) !== -1) {
      minder.execCommand(action, value);
      this.setState({ [action]: value });
    }
  };
  render() {
    const { minder, isLock } = this.props;
    const { FontSize = '' } = this.state;
    let disabled = minder.getSelectedNodes().length === 0;
    if (isLock) disabled = true;
    const commonStyle = { size: 'small', disabled };
    return (
      <div className="nodes-actions mindmap-font-group" style={{ width: 144 }}>
        <div>
          <Select
            {...commonStyle}
            className="mindmap-tool-select"
            aria-label="字号"
            dropdownClassName="mindmap-tool-menu"
            value={FontSize || ''}
            onChange={(value) => this.onChange('FontSize', value)}
            dropdownMatchSelectWidth={false}
            getPopupContainer={(triggerNode) => triggerNode.parentNode}
          >
            <Select.Option value="">字号</Select.Option>
            {fontSizeList &&
              fontSizeList.map((item) => (
                <Select.Option key={item} value={item}>
                  {item}
                </Select.Option>
              ))}
          </Select>
        </div>
        <div>
          <Button
            icon="bold"
            title="加粗"
            type="link"
            {...commonStyle}
            onClick={() => this.onChange('Bold', '')}
          />
          <Button
            icon="italic"
            title="斜体"
            type="link"
            {...commonStyle}
            onClick={() => this.onChange('Italic', '')}
          />
          <Button
            icon="strikethrough"
            title="删除线"
            type="link"
            {...commonStyle}
            onClick={() => this.onChange('del', '')}
          />
          <ColorPicker
            onChange={(color) => this.onChange('ForeColor', color)}
            {...this.props}
            button={{
              ...commonStyle,
              type: 'link',
              title: '字体颜色',
            }}
            icon="font-colors"
            action="ForeColor"
          />
          <ColorPicker
            onChange={(color) => this.onChange('Background', color)}
            {...this.props}
            button={{
              ...commonStyle,
              type: 'link',
              title: '背景颜色',
            }}
            icon="bg-colors"
            action="Background"
          />
        </div>
      </div>
    );
  }
}
export default FontGroup;
