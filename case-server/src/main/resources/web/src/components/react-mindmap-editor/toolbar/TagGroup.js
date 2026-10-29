import React, { Component } from 'react';
import { Input, Button, Icon, message } from 'antd';
import { runInSlices } from '../progressiveRender';

const cleanTags = values => Array.from(new Set((Array.isArray(values) ? values : [])
  .filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean)));
const BUILTIN_TAGS = ['前置条件', '执行步骤', '预期结果'];

class TagGroup extends Component {
  state = { selectedResource: [], availableTags: [], inputVisible: false, inputValue: '' };
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
  catalogDisabled = () => this.props.readOnly || this.props.isLock ||
    (this.props.isUserInputAllowed && !this.props.isUserInputAllowed());
  disabled = () => this.catalogDisabled() || !this.props.minder.getSelectedNodes().length;
  getTags = () => {
    const catalog = this.props.minder.getRoot().getData('tagCatalog') || {};
    const removed = cleanTags(catalog.removed);
    return cleanTags([...BUILTIN_TAGS, ...(this.props.tags || []), ...this.state.availableTags,
      ...this.state.selectedResource, ...cleanTags(catalog.added)])
      .filter(tag => BUILTIN_TAGS.includes(tag) || !removed.includes(tag));
  };
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
    if (this.catalogDisabled()) return;
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
    const exists = this.getTags();
    if (value && !this.catalogDisabled()) {
      if (exists.includes(value)) message.info('该标签已存在，点击标签即可应用到选中节点');
      else this.props.minder.execCommand('TagCatalog', value, 'add');
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
    if (this.catalogDisabled() || BUILTIN_TAGS.includes(value)) return;
    this.props.minder.execCommand('TagCatalog', value, 'remove');
    this.updateSelection();
  };
  onClear = () => {
    if (this.disabled()) return;
    this.props.minder.execCommand('Resource', null);
    this.updateSelection();
  };
  render() {
    const { selectedResource, inputVisible, inputValue } = this.state;
    const disabled = this.disabled();
    const catalogDisabled = this.catalogDisabled();
    const tags = this.getTags();
    return <div className="nodes-actions mindmap-tag-actions">
      <div className="mindmap-tag-heading mindmap-appearance-heading">
        <span className="mindmap-group-label">标签</span><span className="mindmap-tag-hint">（点击应用；×仅删除可用项）</span>
      </div>
      <div className="mindmap-tag-controls">
      <div className="mindmap-tag-list">
        {tags.map(tag => <span key={tag}
          className={`ant-tag mindmap-tool-tag${selectedResource.includes(tag) ? ' is-selected' : ''}`}
          aria-disabled={catalogDisabled}>
          <button type="button" disabled={disabled} className="mindmap-tag-button"
            title={tag}
            aria-label={`${selectedResource.includes(tag) ? '已应用标签' : '应用标签'}：${tag}`}
            aria-pressed={selectedResource.includes(tag)} onClick={() => this.onAdd(tag)}>{tag}</button>
          {!BUILTIN_TAGS.includes(tag) && <button type="button" className="mindmap-tag-remove" aria-label={`删除可用标签：${tag}`} title={`删除可用标签：${tag}`}
            disabled={catalogDisabled}
            onClick={event => {
              event.stopPropagation();
              this.onRemove(tag);
            }}><Icon type="close" /></button>}
        </span>)}
      </div>
      {inputVisible ? <Input ref={input => { this.input = input; }} size="small" value={inputValue}
        className="mindmap-tag-input"
        aria-label="新标签名称" onChange={this.handleInputChange} onBlur={this.handleInputConfirm}
        onKeyDown={this.stopInputKeyboard}
        onKeyUp={event => { this.stopInputKeyboard(event); if (!this.composing) this.pendingImeEnter = false; }}
        onCompositionStart={() => { this.composing = true; this.pendingImeEnter = false; }}
        onCompositionEnd={() => { this.composing = false; this.pendingImeEnter = true; }}
        onPressEnter={this.handleInputConfirm} disabled={catalogDisabled} /> :
        <Button type="link" className="mindmap-tool-button mindmap-tag-add" size="small" disabled={catalogDisabled} onClick={this.showInput}><Icon type="plus" />添加标签</Button>}
      <Button type="link" className="mindmap-tool-button mindmap-tag-clear" size="small"
        aria-label="清除当前节点标签" disabled={disabled || !selectedResource.length} onClick={this.onClear}>清除</Button>
      </div>
    </div>;
  }
}
export default TagGroup;
