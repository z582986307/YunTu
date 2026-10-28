import React, { Component } from 'react';
import { Button, Dropdown, Menu, Icon } from 'antd';
import {
  LinkModal,
  ImageModal,
  NoteAddDrawer,
} from '../components';
import { shouldShowMediaToolbar } from '../executionPanelUtils';
import './MediaGroup.scss';

class MediaGroup extends Component {
  state = {
    showLink: false,
    showImage: false,
    drawerVisible: false,
  };
  handleLinkMenuClick = ({ key }) => {
    if (key === 'add' || key === 'edit') {
      this.setState({ showLink: true });
    } else {
      this.props.minder.execCommand('HyperLink', null);
    }
  };
  handleImageMenuClick = ({ key }) => {
    if (key === 'add' || key === 'edit') {
      this.setState({ showImage: true });
    } else {
      this.props.minder.execCommand('image', '');
      setTimeout(() => {
        this.props.minder.fire('contentchange');
      }, 100);
    }
  };
  renderMenu = (label, key) => {
    const { minder } = this.props;
    const selectedNode = minder.getSelectedNode();
    return (
      <Menu
        className="mindmap-media-menu"
        onClick={params => {
          if (key === 'hyperlink') this.handleLinkMenuClick(params);
          if (key === 'image') this.handleImageMenuClick(params);
        }}
      >
        <Menu.Item key="add">插入{label}</Menu.Item>
        <Menu.Item key="remove" className="mindmap-media-remove">移除已有{label}</Menu.Item>
        {selectedNode && selectedNode.getData(key) !== undefined && (
          <Menu.Item key="edit">编辑已有{label}</Menu.Item>
        )}
      </Menu>
    );
  };
  render() {
    const {
      minder,
      toolbar = {},
      isLock,
      toolbarCustom = { custom: null, title: '自定义' },
    } = this.props;
    const showMediaActions = shouldShowMediaToolbar(this.props.executionMode);
    const {
      showLink,
      showImage,
      drawerVisible,
    } = this.state;

    let disabled = minder.getSelectedNodes().length === 0;
    if (isLock) disabled = true;
    if (!showMediaActions && !toolbar.addFactor && !toolbarCustom.custom)
      return null;

    const linkMenu = this.renderMenu('链接', 'hyperlink');
    const imageMenu = this.renderMenu('图片', 'image');
    return (
      <div
        className="nodes-actions mindmap-media-actions"
      >
        {showMediaActions && (
          <Dropdown
            overlay={linkMenu}
            trigger={['click']}
            disabled={disabled}
            getPopupContainer={triggerNode => triggerNode.parentNode}
          >
            <Button type="link" size="small" className="mindmap-tool-button" disabled={disabled} aria-label="链接">
              <svg className="mindmap-media-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)" />
              </svg>
              <span>链接</span>
              <Icon type="down" />
            </Button>
          </Dropdown>
        )}
        {showMediaActions && toolbar.image !== false && (
          <Dropdown
            overlay={imageMenu}
            trigger={['click']}
            disabled={disabled}
            getPopupContainer={triggerNode => triggerNode.parentNode}
          >
            <Button type="link" size="small" className="mindmap-tool-button" disabled={disabled} aria-label="图片">
              <svg className="mindmap-media-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8" cy="8" r="1.5" />
                <path d="m3 17 5-5 4 4 4-6 5 7" />
              </svg>
              <span>图片</span>
              <Icon type="down" />
            </Button>
          </Dropdown>
        )}
        {toolbar.addFactor && (
          <Dropdown
            overlay={
              <Menu onClick={() => this.setState({ drawerVisible: true })}>
                <Menu.Item key="add">用例设计</Menu.Item>
              </Menu>
            }
            trigger={['click']}
            disabled={disabled}
            getPopupContainer={triggerNode => triggerNode.parentNode}
          >
            <Button
              type="link"
              size="small"
              className="big-icon"
              style={{ marginRight: 10 }}
            >
              <Icon type="tool" style={{ fontSize: '1.6em' }} />
              <br />
              工具
              <Icon type="caret-down" />
            </Button>
          </Dropdown>
        )}
        {toolbarCustom.custom &&
          (!disabled ? (
            toolbarCustom.custom
          ) : (
            <Button type="link" disabled size="small" className="big-icon">
              <Icon type="edit" style={{ fontSize: '1.6em' }} />
              <br />
              {toolbarCustom.title || '自定义'}
            </Button>
          ))}
        {showLink && (
          <LinkModal
            visible={showLink}
            onCancel={() => this.setState({ showLink: false })}
            {...this.props}
            minder={minder}
          />
        )}
        {showImage && (
          <ImageModal
            visible={showImage}
            onCancel={() => this.setState({ showImage: false })}
            {...this.props}
            minder={minder}
          />
        )}
        {drawerVisible && (
          <NoteAddDrawer
            visible={drawerVisible}
            onCancel={() => this.setState({ drawerVisible: false })}
            {...this.props}
            minder={minder}
          />
        )}
      </div>
    );
  }
}
export default MediaGroup;
