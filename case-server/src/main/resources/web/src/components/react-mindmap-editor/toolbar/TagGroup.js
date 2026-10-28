import React, { Component } from 'react';
import { Tag, Input, Button, Icon, message } from 'antd';
import { runInSlices } from '../progressiveRender';

const cleanTags = values => Array.from(new Set((Array.isArray(values) ? values : [])
  .filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean)));

class TagGroup extends Component {
  state = { selectedResource: [], availableTags: [], newTags: [], inputVisible: false, inputValue: '' };
  componentDidMount() {
    this.props.minder.on('selectionchange', this.updateSelection);
    this.props.minder.on('contentchange', this.onContentChange);
    this.props.minder.on('import progressiveimportdone', this.refreshAvailableTags);
    this.updateSelection();
    this.refreshAvailableTags();
  }
  componentWillUnmount() {
    this.unmounted = true;
    clearTimeout(this.scanTimer);
    if (this.scanTask) this.scanTask.cancelled = true;
    this.props.minder.off('selectionchange', this.updateSelection);
    this.props.minder.off('contentchange', this.onContentChange);
    this.props.minder.off('import progressiveimportdone', this.refreshAvailableTags);
    window.tagInput = false;
  }
  disabled = () => this.props.readOnly || this.props.isLock || !this.props.minder.getSelectedNodes().length;
  updateSelection = () => {
    if (!this.unmounted) this.setState({ selectedResource: cleanTags(this.props.minder.queryCommandValue('Resource')) });
  };
  onContentChange = () => {
    this.updateSelection();
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(this.refreshAvailableTags, 800);
  };
  refreshAvailableTags = async () => {
    if (this.scanTask) this.scanTask.cancelled = true;
    const task = { cancelled: false };
    this.scanTask = task;
    const tags = new Set();
    const nodes = [this.props.minder.getRoot()];
    await runInSlices(nodes, node => {
      nodes.push(...node.getChildren());
      cleanTags(node.getData('resource')).forEach(tag => tags.add(tag));
    }, task);
    if (!task.cancelled && !this.unmounted) this.setState({ availableTags: Array.from(tags) });
  };
  showInput = () => {
    if (this.disabled()) return;
    window.tagInput = true;
    this.setState({ inputVisible: true }, () => this.input && this.input.focus());
  };
  handleInputChange = event => this.setState({ inputValue: event.target.value });
  stopInputKeyboard = event => {
    if (!event || !/^key/.test(event.type)) return;
    event.stopPropagation();
    // React16 与脑图原生监听都在 document；只停止合成冒泡不足以阻止后续原生监听。
    if (event.nativeEvent && event.nativeEvent.stopImmediatePropagation) event.nativeEvent.stopImmediatePropagation();
  };
  handleInputConfirm = event => {
    this.stopInputKeyboard(event);
    if (this.composing || (event && (event.isComposing || event.keyCode === 229 ||
        (event.nativeEvent && event.nativeEvent.isComposing) ||
        (this.pendingImeEnter && event.type === 'keydown')))) return;
    const value = this.state.inputValue.trim();
    const exists = cleanTags([...(this.props.tags || []), ...this.state.availableTags, ...this.state.newTags]);
    if (value && !this.disabled()) {
      if (exists.includes(value)) message.info('该标签已存在，点击标签即可应用到选中节点');
      else this.setState({ newTags: [...this.state.newTags, value] });
    }
    this.setState({ inputVisible: false, inputValue: '' });
    window.tagInput = false;
  };
  onAdd = value => {
    if (this.disabled()) return;
    const tag = String(value || '').trim();
    if (!tag) return;
    const resource = cleanTags(this.props.minder.queryCommandValue('Resource'));
    if (!resource.includes(tag)) this.props.minder.execCommand('Resource', [...resource, tag]);
    this.updateSelection();
  };
  onRemove = value => {
    if (this.disabled()) return;
    const resource = cleanTags(this.props.minder.queryCommandValue('Resource')).filter(tag => tag !== value);
    this.props.minder.execCommand('Resource', resource.length ? resource : null);
    this.updateSelection();
  };
  render() {
    const { selectedResource, availableTags, newTags, inputVisible, inputValue } = this.state;
    const disabled = this.disabled();
    const tags = cleanTags([...(this.props.tags || []), ...availableTags, ...newTags, ...selectedResource]);
    return <div className="nodes-actions mindmap-tag-actions">
      <span className="mindmap-tag-hint">点击应用；已选标签可移除</span>
      <div className="mindmap-tag-list">
        {tags.map(tag => <Tag key={tag}
          className={`mindmap-tool-tag${selectedResource.includes(tag) ? ' is-selected' : ''}`}
          aria-disabled={disabled}
          closable={!disabled && (selectedResource.includes(tag) || newTags.includes(tag))}
          onClose={event => {
            event.preventDefault();
            if (selectedResource.includes(tag)) this.onRemove(tag);
            else this.setState({ newTags: newTags.filter(value => value !== tag) });
          }}>
          <button type="button" disabled={disabled} className="mindmap-tag-button"
            title={tag}
            aria-label={`${selectedResource.includes(tag) ? '已应用标签' : '应用标签'}：${tag}`}
            aria-pressed={selectedResource.includes(tag)} onClick={() => this.onAdd(tag)}>{tag}</button>
        </Tag>)}
      </div>
      {inputVisible ? <Input ref={input => { this.input = input; }} size="small" value={inputValue}
        className="mindmap-tag-input"
        aria-label="新标签名称" onChange={this.handleInputChange} onBlur={this.handleInputConfirm}
        onKeyDown={this.stopInputKeyboard}
        onKeyUp={event => { this.stopInputKeyboard(event); if (!this.composing) this.pendingImeEnter = false; }}
        onCompositionStart={() => { this.composing = true; this.pendingImeEnter = false; }}
        onCompositionEnd={() => { this.composing = false; this.pendingImeEnter = true; }}
        onPressEnter={this.handleInputConfirm} disabled={disabled} /> :
        <Button type="link" className="mindmap-tool-button mindmap-tag-add" size="small" disabled={disabled} onClick={this.showInput}><Icon type="plus" />添加标签</Button>}
    </div>;
  }
}
export default TagGroup;
