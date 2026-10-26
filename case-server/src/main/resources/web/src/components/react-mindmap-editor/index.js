import React, { Component, createRef } from 'react';
import PropTypes from 'prop-types';
import './index.scss';
import 'kity';
import './assets/kityminder-core/kityminder.core.js';
import './assets/kityminder-core/kityminder.core.css';
// import Websocket from 'react-websocket';
import Socket from './socket.js';
import {
  ConfigProvider,
  Tabs,
  Input,
  Button,
  Icon,
  message,
  Modal,
  Spin,
  Switch,
  Tooltip,
  Popover,
  List,
  Avatar,
} from 'antd';
import zhCN from 'antd/es/locale/zh_CN';
import marked from 'marked';
import 'hotbox-ui/hotbox';
import 'hotbox-ui/hotbox.css';
import DoGroup from './toolbar/DoGroup';
import ExecutionFloatingPanels from './components/executionFloatingPanels';
import ImageModal from './components/imageModal';
import { pasteImageIntoNode } from './components/imageUpload';
import MindMapScrollbars from './components/mindMapScrollbars';
import { buildSaveContent } from './util/saveContent';
import ThemeGroup from './outlook/ThemeGroup';
import TemplateGroup from './outlook/TemplateGroup';
import FontGroup from './outlook/FontGroup';
import MindMapSearch from './components/mindMapSearch';
import { expandToList, initData, buttons } from './constants';
import { NavBar } from './components';
import { preview, editInput, clipboardRuntime } from './util';
import { waitForNewNodeLayout } from './util/editInput';
import {
  expandAllExecutionNodes,
  normalizeRightMindMap,
  buildNodeDataPatches,
  invertNodeDataPatches,
  toWirePatches,
} from './executionPanelUtils';
import {
  importMindMapProgressively,
  cancelMindMapImport,
} from './largeMindMap';

const HotBox = window.HotBox;

const TabPane = Tabs.TabPane;

// 鼠标右键
const MOUSE_RB = 2;

const normalizeOnlineUsers = (value, currentUser) => {
  const users = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (currentUser && !users.includes(currentUser)) users.unshift(currentUser);
  return Array.from(new Set(users));
};

marked.setOptions({
  gfm: true,
  tables: true,
  breaks: true,
  pedantic: false,
  sanitize: true,
  smartLists: true,
  smartypants: false,
});

class KityminderEditor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      minder: null,
      selectedNode: null,
      noteNode: null,
      noteContent: null,
      showEdit: false,
      inputContent: null,
      activeTab: this.props.type === 'compare' ? '1' : '2',
      showToolBar: false,
      fullScreen: false,
      loading: true,
      isLock: this.props.isLock || false, // 被其他人锁住
      locked: false, // 当前session主动锁住
      popoverVisible: false,
      nowUseList: [],
      wsConnected: false,
      contextMenu: null,
      hoverImage: null,
      selectedImage: null,
      imageResizePreview: null,
      showEditImage: false,
    };
    this.base = -1;
    this.expectedBase = -1;
    setTimeout(() => {
      if (this.minder) {
        this.setState({
          minder: this.minder,
        });
        clipboardRuntime.init(this.minder, this.props.readOnly, this.handlePasteImage);
      }
    }, 100);
    this.navNode = createRef();
  }
  componentDidMount() {
    document.addEventListener('mousedown', this.handleContextDismiss);
    document.addEventListener('mousedown', this.handlePendingCompositionPointerDown, true);
    this.initKeyBoardEvent();
    this.initData = initData;
  }
  componentWillUnmount() {
    clearTimeout(this.autoSaveTimer);
    if (this.minder) this.minder.off('layoutapply layoutallfinish', this.followEditLayout);
    this.restoreEditingNodeLayer();
    window.removeEventListener('mousemove', this.handleImageResizeMove);
    window.removeEventListener('mouseup', this.handleImageResizeEnd);
    window.showEdit = false;
    cancelMindMapImport(this.minder);
    if (this.minder && this.minder._paintGroups) this.minder._paintGroups.dispose();
    window.minderData = undefined;
    document.removeEventListener('keydown', this.handleKeyDown);
    clipboardRuntime.removeListener();
    document.removeEventListener('mousedown', this.handleContextDismiss);
    document.removeEventListener('mousedown', this.handlePendingCompositionPointerDown, true);
    // this.heartCheck.reset();
  }
  handleContextDismiss = event => {
    if (this.contextMenuRef && !this.contextMenuRef.contains(event.target)) {
      this.setState({ contextMenu: null });
    }
  };
  handlePendingCompositionPointerDown = event => {
    if (this.composing && this.inputNode && !this.inputNode.contains(event.target)) {
      this.discardPendingComposition = true;
    }
  };
  getAllData = () => {
    return this.minder.exportJson();
  };
  setEditerData = data => {
    return importMindMapProgressively(
      this.minder,
      normalizeRightMindMap(data),
    ).then(result => {
      if (!result.cancelled) this.minder.fire('contentchange');
    });
  };
  // 键盘事件的监听
  initKeyBoardEvent = () => {
    document.addEventListener('keydown', this.handleKeyDown);
  };
  initOnEvent = minder => {
    const { readOnly } = this.props;
    minder.setOption('externalImageViewerHandling', true);
    minder.on('progressiveimportstart', () => this.setState({ loading: true }));
    minder.on('import', () => {
      if (!minder._progressiveImporting) this.centerImportedMap();
    });
    minder.on('progressiveimportdone', this.centerImportedMap);
    minder.on('progressiveimporterror', () => this.setState({ loading: false }));
    minder.on('layouterror', () => message.error('脑图布局更新失败，请重新进入当前页面'));
    // 视图选中节点变更事件
    minder.on('selectionchange', () => {
      const node = minder.getSelectedNode();
      if (!readOnly) {
        const { selectedNode, showEdit } = this.state;
        // 如果被选中节点之前处于编辑状态，变更后节点失去焦点
        // 则先更新节点内容，然后隐藏编辑框、清空编辑框字段
        if (showEdit) {
          minder.off('layoutapply layoutallfinish', this.followEditLayout);
          const input = this.inputNode && this.inputNode.querySelector('textarea');
          const inputContent = input ? input.value : this.state.inputContent;
          const discardComposition = this.composing || this.discardPendingComposition ||
            (this.lastCompositionText === inputContent && !this.imeConfirmedByKey);
          delete selectedNode._editingText;
          if (discardComposition) {
            selectedNode.render();
            this.minder.layout()._interactChange();
          } else if (selectedNode.getText() !== inputContent) {
            selectedNode.setText(inputContent);
            selectedNode.render();
            this.minder.layout()._interactChange();
            this.minder.fire('contentchange');
          }
          this.composing = false;
          this.pendingImeEnter = false;
          this.discardPendingComposition = false;
          this.lastCompositionText = null;
          this.imeConfirmedByKey = false;
          this.restoreEditingNodeLayer();
          this.setState({ showEdit: false, inputContent: null });
          window.showEdit = false;
        }
      }
      this.hotbox.active(HotBox.STATE_IDLE);
      this.setState(state => ({
        selectedNode: node,
        noteContent: null,
        selectedImage: state.selectedImage && state.selectedImage.node === node ? state.selectedImage : null,
      }), this.prepareNodeInput);
    });
    minder.on('dblclick', e => {
      const image = this.getImageEventTarget(e);
      if (image) {
        this.imageSelectionArmedNode = image.node;
        if (!readOnly) this.selectNodeImage(image.node);
        if (minder.viewer) minder.viewer.open(image.node.getData('image'));
        return;
      }
      if (!readOnly) this.handleShowInput();
    });
    minder.on('mousedown', e => {
      if (e.originEvent.button === MOUSE_RB) {
        e.preventDefault();
        const { minder } = this;
        const selectedNode = minder.getSelectedNode();
        const containerRect = this.editorContainer.getBoundingClientRect();
        this.hotbox.active(HotBox.STATE_IDLE);
        this.setState({
          contextMenu: {
            x: e.originEvent.clientX - containerRect.left,
            y: e.originEvent.clientY - containerRect.top,
            type: selectedNode ? 'selected' : 'blank',
            node: selectedNode,
          },
        });
      }
      this.setState({
        noteContent: null,
      });
    });

    minder.on('click', e => {
      const image = this.getImageEventTarget(e);
      if (!image) {
        this.imageSelectionArmedNode = e.getTargetNode && e.getTargetNode();
        if (this.state.selectedImage) this.setState({ selectedImage: null });
        return;
      }
      if (this.imageSelectionArmedNode !== image.node) {
        this.imageSelectionArmedNode = image.node;
        minder.select(image.node, true);
        if (this.state.selectedImage) this.setState({ selectedImage: null });
      } else if (!readOnly) {
        this.selectNodeImage(image.node);
      }
    });

    // 视图改变事件的监听，用于持续渲染编辑框的位置
    minder.on('viewchange', e => {
      const { showEdit, noteContent } = this.state;
      const node = minder.getSelectedNode();
      if (showEdit) {
        editInput(node, this.inputNode);
      }
      this.hotbox.active(HotBox.STATE_IDLE);
      if (noteContent !== null) {
        this.handleNotePreview();
      }
      if (this.state.selectedImage) this.forceUpdate();
    });

    // 备注是否展示的事件监听
    let previewTimer = null;
    minder.on('shownoterequest', e => {
      previewTimer = setTimeout(() => this.handleNotePreview(e), 200);
    });
    minder.on('hidenoterequest', () => {
      clearTimeout(previewTimer);
    });

    minder.on('contentchange', this.sendPatch);
    if (!readOnly) minder.on('mousemove', this.handleImageHover);
  };
  centerImportedMap = () => {
    const { minder } = this;
    if (!minder || !minder.getRoot()) return;
    const duration = minder.getOption('viewAnimationDuration');
    minder.setOption('viewAnimationDuration', 0);
    minder.execCommand('camera', minder.getRoot());
    minder.setOption('viewAnimationDuration', duration);
    this.setState({ loading: false });
  };
  handlePasteImage = (file, node) => {
    if (this.state.isLock) return;
    if (!this.minder || !node) return;
    pasteImageIntoNode(file, node, this.minder, this.props.baseUrl, this.props.uploadUrl)
      .catch(error => message.error(error.message || '图片粘贴失败，请重试'));
  };
  getImageEventTarget = event => {
    const node = event.getTargetNode && event.getTargetNode();
    const shape = event.kityEvent && event.kityEvent.targetShape;
    const target = event.originEvent && event.originEvent.target;
    const isImage = (shape && shape.__KityClassName === 'Image') ||
      (target && target.tagName && target.tagName.toLowerCase() === 'image');
    if (!node || !node.getData('image')) return null;
    if (!isImage) {
      const mouse = event.originEvent;
      const images = node.getRenderContainer().node.querySelectorAll('image');
      let hit = false;
      for (let i = 0; i < images.length; i += 1) {
        const bounds = images[i].getBoundingClientRect();
        if (mouse.clientX >= bounds.left && mouse.clientX <= bounds.right &&
            mouse.clientY >= bounds.top && mouse.clientY <= bounds.bottom) hit = true;
      }
      if (!hit) return null;
    }
    return { node };
  };
  getSelectedImageRect = () => {
    const selected = this.state.selectedImage;
    if (!selected || !this.editorContainer) return null;
    const renderer = selected.node.getRenderer('ImageRenderer');
    const shape = renderer && renderer.getRenderShape();
    const image = shape && shape.node;
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    const container = this.editorContainer.getBoundingClientRect();
    return { left: rect.left - container.left, top: rect.top - container.top,
      width: rect.width, height: rect.height };
  };
  selectNodeImage = node => {
    if (this.props.readOnly || this.state.isLock) return;
    this.minder.select(node, true);
    this.setState({ selectedImage: { node } });
  };
  handleImageResizeStart = event => {
    event.preventDefault();
    event.stopPropagation();
    const selected = this.state.selectedImage;
    if (!selected || this.props.readOnly || this.state.isLock) return;
    const rect = this.getSelectedImageRect();
    const size = selected.node.getData('imageSize');
    if (!rect || !size) return;
    this.imageResizeStart = { x: event.clientX, size, rect, node: selected.node };
    window.addEventListener('mousemove', this.handleImageResizeMove);
    window.addEventListener('mouseup', this.handleImageResizeEnd);
  };
  handleImageResizeMove = event => {
    const start = this.imageResizeStart;
    if (!start) return;
    const scale = start.rect.width / start.size.width;
    const width = Math.max(30, Math.min(800, start.size.width + (event.clientX - start.x) / scale));
    this.setState({ imageResizePreview: { width: width * scale,
      height: width * start.size.height / start.size.width * scale } });
  };
  handleImageResizeEnd = event => {
    window.removeEventListener('mousemove', this.handleImageResizeMove);
    window.removeEventListener('mouseup', this.handleImageResizeEnd);
    const start = this.imageResizeStart;
    this.imageResizeStart = null;
    this.setState({ imageResizePreview: null });
    if (!start || this.props.readOnly) return;
    const scale = start.rect.width / start.size.width;
    const width = Math.round(Math.max(30, Math.min(800, start.size.width + (event.clientX - start.x) / scale)));
    if (width === start.size.width) return;
    start.node.setData('imageSize', { width,
      height: Math.round(width * start.size.height / start.size.width) });
    start.node.render();
    this.minder.fire('saveScene');
    this.minder.layout(100);
    this.minder.fire('contentchange');
  };
  handleImageHover = event => {
    if (this.state.isLock) return;
    const shape = event.kityEvent && event.kityEvent.targetShape;
    if (!shape || shape.__KityClassName !== 'Image' || !shape.url) {
      if (this.state.hoverImage) this.setState({ hoverImage: null });
      return;
    }
    const node = event.getTargetNode();
    const target = event.originEvent && event.originEvent.target;
    if (!node || !target || !this.editorContainer) return;
    const imageRect = target.getBoundingClientRect();
    const containerRect = this.editorContainer.getBoundingClientRect();
    const x = imageRect.right - containerRect.left - 12;
    const y = imageRect.top - containerRect.top - 12;
    const current = this.state.hoverImage;
    if (!current || current.node !== node || Math.abs(current.x - x) > 1 || Math.abs(current.y - y) > 1) {
      this.setState({ hoverImage: { node, x, y } });
    }
  };
  handleDeleteImage = event => {
    event.preventDefault();
    event.stopPropagation();
    const hoverImage = this.state.hoverImage;
    if (!hoverImage || this.state.isLock) return;
    this.setState({ hoverImage: null });
    this.minder.select(hoverImage.node, true);
    this.minder.execCommand('image', null);
  };
  initHotbox = minder => {
    const { priority = [1, 2, 3], readOnly = false } = this.props;
    const container = minder.getPaper().container.parentNode;
    const hotbox = new HotBox(container);
    const main = hotbox.state('main');
    if (!readOnly) {
      main.button({
        position: 'top',
        label: '编辑',
        key: 'F2',
        enable: () => !readOnly,
        action: this.handleShowInput,
      });
      buttons.forEach(button => {
        const parts = button.split(':');
        const label = parts.shift();
        const key = parts.shift();
        const command = parts.shift();
        main.button({
          position: 'top',
          label: label,
          key: key,
          enable: () => !readOnly,
          action: () => {
            if (
              'AppendSiblingNode,AppendChildNode,AppendParentNode'.indexOf(
                command,
              ) > -1
            ) {
              minder.execCommand(command, '分支主题');
              this.scheduleNewNodeInput();
            } else {
              minder.execCommand(command);
            }
          },
        });
      });
    }

    if (!readOnly) {
      main.button({
        position: 'top',
        label: '优先级',
        key: 'P',
        next: 'priorityBox',
        enable: () => !readOnly,
      });
      const priorityBox = hotbox.state('priorityBox');
      priority.join('').replace(/./g, p => {
        priorityBox.button({
          position: 'ring',
          label: `P${Number(p) - 1}`,
          key: `${Number(p) - 1}`,
          action: () => {
            minder.execCommand('Priority', p);
          },
        });
      });
      priorityBox.button({
        position: 'top',
        label: '移除',
        key: 'Del',
        action: () => {
          minder.execCommand('Priority', 0);
        },
      });
      priorityBox.button({
        position: 'top',
        label: '返回',
        key: 'esc',
        next: 'back',
      });
    }
    this.hotbox = hotbox;
  };
  handleUndoAck = (data) => {
    
    console.log('undo ack get', data)
    this.groupNode.undo(data)
  }
  handleRedoAck = (data) => { 
    console.log('redo ack get', data)
    this.groupNode.redo(data)
    
  }

  // handleUndo = () => {
  //   this.ws.sendMessage('1undo');
  //   const { undoCnt, redoCnt } = this.state;
  //   this.setState({ undoCnt: undoCnt - 1, redoCnt: redoCnt + 1 });
  // };
  // handleRedo = () => {
  //   this.ws.sendMessage('1redo');
  //   const { undoCnt, redoCnt } = this.state;
  //   this.setState({ undoCnt: undoCnt + 1, redoCnt: redoCnt - 1 });
  // };
  handleKeyDown = event => {
    if (this.pageBlocked) return;
    const e = event;
    const ctrlKey = e.metaKey || e.ctrlKey;
    const hasModal =
      document.getElementsByClassName('yuntu-modal').length > 0;
    const { showEdit, selectedNode } = this.state;
    const hasDrawer =
      document.getElementsByClassName('yuntu-note-drawer').length > 0;
    const isRefresh = ctrlKey && e.keyCode === 82;
    const preparedInput = !showEdit && this.inputNode &&
      e.target === this.inputNode.querySelector('textarea');
    const typing = !preparedInput && e.target && e.target.closest &&
      e.target.closest('input, textarea, [contenteditable="true"]');
    if (ctrlKey && (e.keyCode === 90 || e.keyCode === 89) &&
        !hasModal && !hasDrawer && !showEdit && !typing &&
        !window.search && !window.tagInput && this.groupNode) {
      e.preventDefault();
      if (e.keyCode === 90) this.groupNode.undo({});
      else this.groupNode.redo({});
      return;
    }
    if (this.props.readOnly) return;
    const directTextKey = e.keyCode === 229 ||
      (typeof e.key === 'string' && e.key.length === 1 && !ctrlKey && !e.altKey);
    if (directTextKey && selectedNode && !showEdit && !typing && !preparedInput && !hasModal &&
        !hasDrawer && !window.search && !window.tagInput && !this.state.isLock) {
      if (e.keyCode !== 229) e.preventDefault();
      this.handleShowInput(e.keyCode === 229 ? '' : e.key, true);
      return;
    }
    // comm + s 保存
    if (ctrlKey && e.keyCode === 83 && !this.props.readOnly) {
      e.preventDefault();
      this.onButtonSave();
    }
    // comm + f 搜索
    if (ctrlKey && e.keyCode === 70) {
      e.preventDefault();
      this.setState({ activeTab: '3' });
    }
    if (
      !hasModal &&
      !hasDrawer &&
      !showEdit &&
      e.preventDefault &&
      !isRefresh &&
      !window.search &&
      !window.tagInput
    ) {
      // ctrl + a 全选
      if (ctrlKey && e.keyCode === 65) {
        e.preventDefault();
        let selection = [];
        this.minder.getRoot().traverse(node => {
          selection.push(node);
        });
        this.minder.select(selection, true);
      }
      if (this.state.selectedNode !== null) {
        // if (ctrlKey && window.event.keyCode === 67) {
        //   e.preventDefault();
        //   this.minder.execCommand('Copy');
        // }
        // if (ctrlKey && window.event.keyCode === 88) {
        //   e.preventDefault();
        //   this.minder.execCommand('Cut');
        // }
        // if (ctrlKey && window.event.keyCode === 86) {
        //   e.preventDefault();
        //   this.minder.execCommand('Paste');
        // }
        if ([13, 9].indexOf(e.keyCode) > -1) {
          const parentClass =
            document.activeElement.parentNode.parentNode.className || '';
          if (
            e.keyCode === 13 &&
            parentClass.indexOf('resource-input') < 0
          ) {
            e.preventDefault();
            this.minder.execCommand('AppendSiblingNode', '分支主题');
            this.scheduleNewNodeInput();
          }
          if (e.keyCode === 9) {
            e.preventDefault();
            this.minder.execCommand('AppendChildNode', '分支主题');
            this.scheduleNewNodeInput();
          }
        }
        if (e.keyCode === 8 && this.state.selectedImage && !this.state.isLock) {
          e.preventDefault();
          const node = this.state.selectedImage.node;
          this.minder.select(node, true);
          this.minder.execCommand('image', null);
          this.setState({ selectedImage: null, hoverImage: null });
        } else if (e.keyCode === 8) {
          e.preventDefault();
          this.minder.execCommand('RemoveNode');
        }
      }
    }
    if (showEdit) {
      // 显示编辑框时，shift+回车=换行
      if (e.keyCode === 13 && !e.shiftKey && (e.isComposing || this.composing)) {
        this.imeConfirmedByKey = true;
        return;
      }
      if (e.keyCode === 13 && !e.shiftKey && this.pendingImeEnter) {
        this.imeConfirmedByKey = true;
        e.preventDefault();
        return;
      }
      if (e.keyCode === 13 && !e.shiftKey) {
        e.preventDefault();
        this.minder.off('layoutapply layoutallfinish', this.followEditLayout);
        const input = this.inputNode && this.inputNode.querySelector('textarea');
        const inputContent = input ? input.value : this.state.inputContent;
        delete selectedNode._editingText;
        selectedNode.setText(inputContent);
        // this.minder.setStatus('readonly');
        selectedNode.render();
        this.minder.layout()._interactChange();
        this.restoreEditingNodeLayer();
        // this.minder.setStatus('normal');
        this.minder.fire('contentchange');
        this.setState({ showEdit: false, inputContent: null }, this.prepareNodeInput);
        window.showEdit = false;
      }
    }
  };
  sendPatch = e => {
    if (this.pageBlocked) return;
    if (this.minder._progressiveImporting || this.minder._mindMapImportFailed) return;
    if (this.skipNextContentChange) {
      this.skipNextContentChange = false;
      e.minder._status = 'normal';
      return;
    }
    if (this.groupNode && window.minderData) {
      const change = this.groupNode.changed();
      if (!change) return;
      const caseObj = {
        ...change.snapshot,
        right: window.minderData.right || 1,
      };

      const patch = change.patch;
      if (patch.length === 1 && patch[0].path === '/base') {
          e.minder._status = 'normal';
          return;
      }

      if (patch.length > 0 && e.minder._status !== 'readonly') {
        this.hasLocalEdits = true;
        this.pendingEditCount = (this.pendingEditCount || 0) + 1;
        // if (this.expectedBase !== e.minder.getBase()) {
        //   alert(
        //     `版本信息不对，请刷新页面重试。ExpBase: ${
        //       this.expectedBase
        //     }, base: ${e.minder.getBase()}`,
        //   );
        //   return;
        // }
        // this.ws.sendMessage('1' + JSON.stringify({ case: caseObj, patch }));
        // const { undoCnt } = this.state;
        // this.setState({ undoCnt: undoCnt + 1 });
        // this.websocketHeartbeatJs.send(JSON.stringify({ case: caseObj, patch }));
        
        this.ws.sendMessage('edit', { caseContent: JSON.stringify(caseObj), patch: JSON.stringify(patch), caseVersion: caseObj.base });
        if (!this.props.readOnly) {
          clearTimeout(this.autoSaveTimer);
          this.autoSaveTimer = setTimeout(() => this.saveCurrentCase(false), 1200);
        }
        this.base = e.minder.getBase();
        this.expectedBase = this.base + 1;
        // e.minder.execCommand('resetlayout');
      }
      e.minder._status = 'normal';
    }
  };
  travere = arrPatches => {
    var patches = [];
    for (var i = 0; i < arrPatches.length; i++) {
      if (arrPatches[i].op === undefined) {
        for (var j = 0; j < arrPatches[i].length; j++) {
          patches.push(arrPatches[i][j]);
        }
      } else {
        patches.push(arrPatches[i]);
      }
    }
    return patches;
  };

  scheduleNewNodeInput = () => {
    const node = this.minder.getSelectedNode();
    if (!node) return;
    waitForNewNodeLayout(this.minder, node, () => {
      if (!this.state.showEdit && this.minder.getSelectedNode() === node) {
        this.handleShowInput('', true);
      }
    });
  };

  followEditLayout = event => {
    if (!this.state.showEdit || !this.inputNode) return;
    const node = this.minder.getSelectedNode();
    if (node && (!event || !event.node || event.node === node)) editInput(node, this.inputNode);
  };

  handleShowInput = (replacementText, showWhileTyping = false, preserveExistingInput = false) => {
    const { minder, inputNode } = this;
    if (minder.getSelectedNode() && minder.getStatus() !== 'readonly') {
      const node = minder.getSelectedNode();
      const inputContent = typeof replacementText === 'string' ? replacementText : node.getText();
      this.directReplace = typeof replacementText === 'string';
      this.showWhileTyping = showWhileTyping;
      this.pendingImeEnter = false;
      this.setState({ showEdit: true, inputContent }, () => {
        window.showEdit = true;
        minder.on('layoutapply layoutallfinish', this.followEditLayout);
        this.raiseEditingNodeLayer(node);
        const input = inputNode.querySelector('textarea');
        if (!preserveExistingInput) input.value = inputContent;
        if (preserveExistingInput) {
          node._editingText = input.value;
          node.render();
        }
        editInput(node, inputNode);
        inputNode.style.backgroundColor = node.getData('background') ||
          node.getStyle(node.isSelected() ? 'selected-background' : 'background') || '#fff';
        input.style.backgroundColor = 'transparent';
        input.style.color = node.getStyle('color');
        if (document.activeElement !== input) input.focus({ preventScroll: true });
        if (!preserveExistingInput) input.setSelectionRange(input.value.length, input.value.length);
      });
    }
  };
  handleNotePreview = e => {
    if (e) {
      this.setState(
        {
          noteContent: e.node.getData('note')
            ? marked(e.node.getData('note'))
            : '',
          noteNode: e,
        },
        () => {
          preview(e.node, this.previewNode);
        },
      );
    } else {
      this.setState({ noteContent: null });
    }
  };
  handleWsClose = e => {
    this.setState({ wsConnected: false, nowUseList: [] });
    if (this.pageBlocked) return;
    // if (this.props.onClose) {
    //   this.props.onClose(this.minder.exportJson());
    // }
    if (this.modal === undefined) {
      this.modal = Modal.warning({
        title: '服务已断开，请手动刷新页面',
        className: 'yuntu-modal ws-warning',
        getContainer: () =>
          document.getElementsByClassName('kityminder-core-container')[0],
        okText: '确定',
        onOk: () => {
          this.modal = undefined;
          location.reload();
        },
      });
    }
    // this.heartCheck.reset();
  };

  /**
   * 懒绘制大量节点函数
   * @param minder 实例
   * @param data JSON数据
   * @param level 缓加载层数,默认3层
   * @param taskBatchCount 每次执行任务数,默认5次
   */
  largeJsonImport = (minder, data, level = 3, taskBatchCount = 5) => {
    const childrens = [];
    /**
     * 工具函数
     */
    const handleTreeOnDepthWithCallback = (root, depth = 1, cb = () => {}) => {
      if (depth === 0) {
        cb(root);
        return;
      }
      if (root && root.children.length > 0) {
        root.children.forEach(child =>
          handleTreeOnDepthWithCallback(child, depth - 1, cb),
        );
      }
    };
    return new Promise(resolve => {
      let idx = 0;
      handleTreeOnDepthWithCallback(data.root, 3, root => {
        idx++;
        if (root.children && root.children.length > 0) {
          childrens[idx] = JSON.parse(JSON.stringify(root));
          childrens[idx].expandState = 'collapse';
          root.children = [];
        }
      });

      idx = 0;
      const tasks = [];
      const batchRunTask = deadline => {
        while (
          (deadline.timeRemaining() > 0 || deadline.didTimeout) &&
          tasks.length > 0
        ) {
          // 批量执行任务 默认5个一批
          let taskBatchIdx = taskBatchCount;
          while (taskBatchIdx-- && tasks.length) {
            tasks.shift()();
          }
        }

        // 刷新
        minder.refresh(0);
        if (tasks.length > 0) {
          // 需要考虑浏览器兼容，可以考虑pollyfill；
          requestIdleCallback(batchRunTask);
        } else {
          resolve();
        }
      };

      const handleImportBigBundle = () => {
        handleTreeOnDepthWithCallback(minder._root, 3, root => {
          tasks.push(() => {
            idx++;
            const temp = childrens[idx];
            temp !== undefined && minder.importNode(root, temp);
          });
        });
        // 启动渲染
        requestIdleCallback(batchRunTask);

        // 取消动画
        minder.refresh(0);
        // 没有once，手动实现
        minder.off('import', handleImportBigBundle);
      };
      minder.on('import', handleImportBigBundle);
    });
  };

  heartCheck = {
    timeout: 10000, // 毫秒
    timeoutObj: null,
    serverTimeoutObj: null,
    reset: function() {
      clearInterval(this.timeoutObj);
      clearInterval(this.serverTimeoutObj);
      return this;
    },
    start: function(ws) {
      const self = this;
      this.timeoutObj = setTimeout(function() {
        // 这里发送一个心跳，后端收到后，返回一个心跳消息，
        // onmessage拿到返回的心跳就说明连接正常
        ws.sendMessage('0' + 'ping ping ping');
        self.serverTimeoutObj = setTimeout(function() {
          // 如果超过一定时间还没重置，说明后端主动断开了
          // 这里为什么要在send检测消息后，倒计时执行这个代码呢，因为这个代码的目的时为了触发onclose方法，这样才能实现onclose里面的重连方法
          // 所以这个代码也很重要，没有这个方法，有些时候发了定时检测消息给后端，后端超时（我们自己设定的时间）后，不会自动触发onclose方法。
          ws.state.ws.close();
          ws.state.ws.onclose();
        }, self.timeout);
      }, this.timeout);
    },
  };

  handleWsOpen = () => {
    window.ws = this.ws;
    const query = this.props.wsParam && this.props.wsParam.query;
    const currentUser = query && query.user;
    this.setState(state => ({
      wsConnected: true,
      nowUseList: state.nowUseList.length ? state.nowUseList : normalizeOnlineUsers('', currentUser),
    }));
    // this.heartCheck.reset().start(this.ws);
    console.log("handle ws open", window.ws);
  };
  handleLock = (data) => {
    switch (data) {
      case '0':
          this.minder.setStatus('readonly');
          this.setState({ isLock: true }, () => {
              document.removeEventListener('keydown', this.handleKeyDown);
          });
          message.warning(this.props.progressShow ? '当前任务已锁定，不可执行' : '当前用例已锁定，不可编辑');
          break;

      case '1':
          this.minder.setStatus('normal', true);
          this.setState({ isLock: false }, () => {
              this.initOnEvent(this.minder);
              document.addEventListener('keydown', this.handleKeyDown);
          });
          message.warning('用例被解锁，请刷新重试');
        break;

      case '2':
          message.success(this.pendingLockState ? '锁定成功' : '解锁成功');
          this.setState({ locked: Boolean(this.pendingLockState) });
          this.pendingLockState = undefined;
        break;

      case '4':
          this.setState({ locked: false, isLock: false });
        break;

      case '3':
          message.error('加/解锁失败');
          this.pendingLockState = undefined;
          break;
    }
  }

  handleWsUserStat = (data) => {
    const query = this.props.wsParam && this.props.wsParam.query;
    const currentUser = query && query.user;
    this.setState({
      nowUseList: normalizeOnlineUsers(data, currentUser),
    });
  }

  handleLockToggle = checked => {
    if (this.pageBlocked) return;
    if (!this.ws || typeof this.ws.sendMessage !== 'function') {
      message.error('锁定服务未连接，请稍后重试');
      return;
    }
    this.pendingLockState = checked;
    this.ws.sendMessage('lock', { message: checked ? 'lock' : 'unlock' });
  };
  prepareNodeInput = () => {
    if (this.props.readOnly || this.state.showEdit || !this.state.selectedNode || !this.inputNode ||
        document.getElementsByClassName('yuntu-modal').length) return;
    const input = this.inputNode.querySelector('textarea');
    if (!input) return;
    input.value = '';
    input.focus({ preventScroll: true });
  };
  raiseEditingNodeLayer = node => {
    this.restoreEditingNodeLayer();
    const element = node.getRenderContainer().node;
    const parent = element.parentNode;
    if (!parent) return;
    this.editingNodeLayer = { element, parent, nextSibling: element.nextSibling };
    parent.appendChild(element);
  };
  restoreEditingNodeLayer = () => {
    const layer = this.editingNodeLayer;
    if (!layer) return;
    this.editingNodeLayer = null;
    if (layer.element.parentNode !== layer.parent) return;
    const next = layer.nextSibling && layer.nextSibling.parentNode === layer.parent ?
      layer.nextSibling : null;
    layer.parent.insertBefore(layer.element, next);
  };
  handleEditInput = event => {
    const node = this.state.selectedNode;
    if (!node) return;
    if (!this.state.showEdit) {
      this.handleShowInput(event.target.value, true, true);
      return;
    }
    node._editingText = event.target.value;
    node.render();
    editInput(node, this.inputNode);
  };
  handleExecutionChange = (field, nodes, value, apply) => {
    if (this.pageBlocked) return;
    const patches = buildNodeDataPatches(nodes.filter(Boolean), field, value);
    if (!patches.length) return;
    const inversePatches = invertNodeDataPatches(patches);
    this.skipNextContentChange = true;
    apply();
    if (this.groupNode) {
      this.groupNode.recordDirectChange(patches, inversePatches);
    }
    const currentBase = this.minder.getBase();
    this.pendingEditCount = (this.pendingEditCount || 0) + 1;
    this.ws.sendMessage('edit', {
      caseContent: '',
      patch: JSON.stringify([toWirePatches(patches)]),
      caseVersion: currentBase,
    });
    this.base = currentBase;
    this.expectedBase = currentBase + 1;
  };

  handleWsData = async data => {
    // if (data === 'pong pong pong') {
    //   this.heartCheck.reset().start(this.ws);
    //   return;
    // }
    // if (data === 'ping ping ping') {
    //   this.heartCheck.reset().start(this.ws);
    //   this.ws.sendMessage('0' + 'pong pong pong');
    //   return;
    // }
    if (data === 'HTTP_ACCESS_ERROR') {
      message.warning('服务端实例退出，请刷新页面。');
      return;
    }
    if (data === 'websocket on error') {
      this.ws.state.ws.onclose();
      return;
    }

    if (data.substring(0, 4) == '当前用户') {
      // notification.warning({ message: data.split(',')[0] });
      this.setState({ nowUseList: data.split('用户是:')[1]?.split(',') || [] });
      return;
    }
    // if (data.substring(0, 1) == '2') {
    //   // 控制消息
    //   if (data.substring(1, 5) == 'lock') {
    //     this.minder.setStatus('readonly');
    //     this.setState({ isLock: true }, () => {
    //       document.removeEventListener('keydown', this.handleKeyDown);
    //     });
    //     notification.warning({ message: '用例被锁住，当前只读' });
    //   } else if (data.substring(1, 5) == 'unlo') {
    //     this.minder.setStatus('normal', true);
    //     this.setState({ isLock: false }, () => {
    //       this.initOnEvent(this.minder);
    //       document.addEventListener('keydown', this.handleKeyDown);
    //     });
    //     notification.warning({ message: '用例被解锁，请刷新重试' });
    //   } else if (data.substring(1, 5) == 'succ') {
    //     notification.success({ message: '加/解锁成功' });
    //     this.setState({ locked: !this.state.locked });
    //   } else {
    //     notification.error({ message: '加/解锁失败' });
    //   }
    //   return;
    // }
    // const recv;
    try {
      const recv = JSON.parse(data || '{}');

      if (recv.root === undefined) {
        // 如果json解析没有root节点
        this.minder.setStatus('readonly');
        const recvPatches = this.travere(recv);
        const recvBase = recvPatches.filter(item => item.path === '/base')[0]
          ?.value;
        const recvFromBase = recvPatches.filter(
          item => item.path === '/base',
        )[0]?.fromValue;
        this.minder.applyPatches(recvPatches);
        if (!(recvPatches.length === 1)) {
          // 如果是通知报文
          if (recvFromBase != undefined && recvFromBase == recvBase + 1) {
            // undo
            if (this.expectedBase != recvBase + 1) {
              alert(
                `通知报文回复的version错误，需要刷新. Exp:${this.expectedBase},Act:${recvBase}`,
              );
            } else {
              this.expectedBase = recvBase;
            }
          } else {
            if (this.expectedBase != recvBase - 1) {
              alert(
                `通知报文回复的version错误，需要刷新. Exp:${this.expectedBase},Act:${recvBase}`,
              );
            } else {
              this.expectedBase = recvBase;
            }
          }
        } else {
          // 如果是应答报文
          if (this.expectedBase != recvBase) {
            alert(
              `应答报文回复的version错误，需要刷新. Exp:${this.expectedBase},Act:${recvBase}`,
            );
          }
        }
      } else {
        const dataJson = normalizeRightMindMap({ ...recv });

        // this.largeJsonImport(this.minder, data).then(() => {
        //   // 可以给个右下角的loading标记
        //   // 不需要加遮罩层，界面还是可以操作的
        // });
        if (data === JSON.stringify(this.minder.exportJson())) {
          return;
        }
        window.minderData = undefined;
        const result = await importMindMapProgressively(this.minder, dataJson);
        if (result.cancelled) return;
        window.minderData = dataJson;

        // 第一次打开用例，预期base与用例的base保持一直
        this.expectedBase = this.minder.getBase();
      }
    } catch (e) {
      console.error(e);
      alert('连接异常，请刷新重试');
    }
  };
  // 随机色
  getColorByName(str) {
    for (
      var i = 0, hash = 0;
      i < str.length;
      hash = str.charCodeAt(i++) + ((hash << 5) - hash)
    );
    let color = Math.floor(
      Math.abs(((Math.sin(hash) * 10000) % 1) * 16777216),
    ).toString(16);
    let rgb = '#' + Array(6 - color.length + 1).join('0') + color;
    return rgb + 'bf';
  }

  saveCurrentCase = manual => {
    if (this.pageBlocked) return;
    if (!this.ws || !this.minder || (this.props.readOnly && !(manual && this.props.progressShow))) return;
    if (manual && !this.props.readOnly) this.minder.fire('contentchange');
    clearTimeout(this.autoSaveTimer);
    if (this.expectedBase > this.minder.getBase()) {
      this.queuedSaveManual = Boolean(manual || this.queuedSaveManual);
      return;
    }
    if (manual) this.manualSavePending = true;
    this.ws.sendMessage(manual ? 'save' : 'autosave', { caseContent: buildSaveContent(this.minder, window.minderData,
      this.props.readOnly ? null : this.rawServerData, this.hasLocalEdits), patch: '', caseVersion: '' });
  };

  handleEditAck = () => {
    this.pendingEditCount = Math.max(0, (this.pendingEditCount || 0) - 1);
    if (this.queuedSaveManual !== undefined && this.expectedBase <= this.minder.getBase()) {
      const manual = this.queuedSaveManual;
      this.queuedSaveManual = undefined;
      this.saveCurrentCase(manual);
    }
  };

  onButtonSave = () => this.saveCurrentCase(true);

  handleSaveAck = result => {
    if (result === 'conflict') this.handleDataStale();
    else if (result !== 'ok') message.error('保存失败，请重试');
    else if (this.manualSavePending) message.success('保存成功');
    this.manualSavePending = false;
  };

  blockUntilRefresh = text => {
    if (this.pageBlocked) return;
    this.pageBlocked = true;
    clearTimeout(this.autoSaveTimer);
    if (this.ws) {
      this.ws.skipCache = true;
      localStorage.removeItem(JSON.stringify(this.props.wsParam));
    }
    if (this.minder) this.minder.setStatus('readonly');
    if (this.modal) this.modal.destroy();
    this.modal = Modal.warning({
      title: text,
      className: 'yuntu-modal ws-warning',
      okText: '确定',
      keyboard: false,
      maskClosable: false,
      onOk: () => location.reload(),
    });
  };

  handlePlatformUpdate = () => this.blockUntilRefresh('平台已更新，请刷新页面后继续');

  handleDataStale = () => this.blockUntilRefresh(this.props.progressShow
    ? '当前任务数据已变更，请刷新后重试'
    : '当前用例数据已变更，请刷新后重试');

  render() {
    const {
      minder,
      noteContent,
      showEdit,
      noteNode,
      activeTab,
      showToolBar,
      fullScreen,
      loading,
      isLock,
      locked,
      // undoCnt,
      // redoCnt,
      popoverVisible,
      nowUseList,
      wsConnected,
      selectedNode,
    } = this.state;
    const {
      progressShow = true,
      readOnly = false,
      editorStyle = {},
      tags,
      wsUrl = '',
      wsParam,
      callback,
      type,
      planCycle,
    } = this.props;
    const childProps = {
      ...this.props,
      minder,
      isLock,
    };

    const tabContentClass = `toolbar has-right-border`;

    return (
      <ConfigProvider locale={zhCN}>
        <div
          className={`kityminder-editor-container${
            fullScreen ? ' full-screen' : ''
          }`}
          ref={node => (this.editorContainer = node)}
          style={editorStyle}
        >
          {minder && type !== 'compare' && (
            <Socket
              url={wsUrl}
              wsParam={wsParam}
              onOpen={this.handleWsOpen}
              onMessage={this.handleWsData}
              onClose={this.handleWsClose}
              wsMinder={this.minder}
              handleLock={this.handleLock}
              handleUndoAck={this.handleUndoAck}
              handleRedoAck={this.handleRedoAck}
              handleWsUserStat={this.handleWsUserStat}
              handleSaveAck={this.handleSaveAck}
              handlePlatformUpdate={this.handlePlatformUpdate}
              handleDataStale={this.handleDataStale}
              isOwnEditPending={() => (this.pendingEditCount || 0) > 0}
              handleServerSnapshot={(serialized, base) => { this.rawServerData = { serialized, base }; this.hasLocalEdits = false; }}
              handleEditAck={this.handleEditAck}
              // onError={e => {
              //   notification.info({
              //     message: 'websocket连接错误，错误详情：' + e,
              //   });
              // }}
              // reconnect={false}
              ref={ws => {
                this.ws = ws;
                window.ws = ws;
              }}
            />
          )}
          {minder && (
            <Tabs
              activeKey={activeTab}
              className={`kityminder-tools-tab${
                showToolBar ? '' : ' collapsed'
              }`}
              tabBarExtraContent={[
                type !== 'compare' && <MindMapSearch key="search" minder={minder} />,
                type !== 'compare' && <Popover
                  key="list"
                  placement="bottomRight"
                  content={
                    <List
                      grid={{
                        gutter: 30,
                        column: nowUseList.length >= 4 ? 4 : 1,
                      }}
                      itemLayout="horizontal"
                      dataSource={nowUseList || []}
                      renderItem={item => (
                        <List.Item>
                          <List.Item.Meta
                            avatar={
                              <Avatar
                                style={{
                                  backgroundColor: this.getColorByName(item),
                                }}
                              >
                                {item.substr(0, 1)}
                              </Avatar>
                            }
                            title={
                              <div style={{ lineHeight: '32px' }}>{item}</div>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  }
                  trigger="click"
                  visible={popoverVisible}
                  onVisibleChange={visible =>
                    this.setState({ popoverVisible: visible })
                  }
                >
                  <Tooltip title={'当前在线列表'}>
                    <Button
                      type="primary"
                      className="mindmap-online-button"
                      style={{ marginRight: 15 }}
                      onClick={() =>
                        this.setState({ popoverVisible: !popoverVisible })
                      }
                    >
                      {wsConnected ? Math.max(nowUseList.length, 1) : 0}人在线
                    </Button>
                  </Tooltip>
                </Popover>,
                <Tooltip
                  key="lock"
                  title={isLock ? '已锁定' : (locked ? '可编辑，点击解锁' : '点击锁定')}
                  getPopupContainer={triggerNode => triggerNode.parentNode}
                >
                  {type !== 'compare' && (
                    <span className="yuntu-lock-wrap">
                      <Switch
                        size="small"
                        aria-label={isLock ? '已锁定' : (locked ? '解锁' : '锁定')}
                        checkedChildren={<Icon type="lock" />}
                        unCheckedChildren={<Icon type="unlock" />}
                        checked={isLock || locked}
                        disabled={isLock}
                        onChange={this.handleLockToggle}
                        className="yuntu-lock"
                      />
                    </span>
                  )}
                </Tooltip>,
                <Button
                  key="full"
                  type="link"
                  icon={`fullscreen${fullScreen ? '-exit' : ''}`}
                  onClick={() => {
                    this.setState({ fullScreen: !fullScreen });
                    callback && callback({ fullScreen: !fullScreen });
                  }}
                >
                  {fullScreen ? '退出全屏' : '全屏'}
                </Button>,
                type !== 'compare' && <Button
                  key="show"
                  type="link"
                  className="mindmap-outlook-toggle"
                  aria-label={showToolBar ? '收起外观' : '展开外观'}
                  title={showToolBar ? '收起外观' : '展开外观'}
                  onClick={() => this.setState({ showToolBar: !showToolBar })}
                >
                  <span>外观</span>
                  <Icon type={showToolBar ? 'up' : 'down'} />
                </Button>,
              ]}
              onChange={activeKey => {
                this.setState({ activeTab: activeKey });
              }}
            >
              <TabPane tab={null} key={type !== 'compare' ? '2' : '1'}>
                {type !== 'compare' && <div className={tabContentClass}>
                  <ThemeGroup {...childProps} />
                  <TemplateGroup {...childProps} />
                  <FontGroup {...childProps} />
                </div>}
              </TabPane>
            </Tabs>
          )}
          <div
            className="kityminder-core-container"
            ref={input => {
              if (!this.minder) {
                this.minder = new window.kityminder.Minder({
                  renderTo: input,
                  disableNodeDrag: progressShow,
                });
                this.centerNode = input;
                this.initOnEvent(this.minder);
                this.initHotbox(this.minder);
              }
            }}
          >
            {loading && <Spin className="yuntu-loader" />}
            {minder && !loading && <MindMapScrollbars minder={minder} />}
            {minder && progressShow && (
              <ExecutionFloatingPanels
                minder={minder}
                selectedNode={selectedNode}
                isLock={isLock}
                planCycle={planCycle}
                baseUrl={this.props.baseUrl}
                uploadUrl={this.props.uploadUrl}
                onExecutionChange={this.handleExecutionChange}
                onChange={() => this.forceUpdate()}
              />
            )}
          </div>
          {!readOnly && this.state.hoverImage && (
            <button
              type="button"
              className="mindmap-node-image-delete"
              aria-label="删除节点图片"
              title="删除图片"
              style={{ left: this.state.hoverImage.x, top: this.state.hoverImage.y }}
              onMouseLeave={() => this.setState({ hoverImage: null })}
              onMouseDown={event => event.stopPropagation()}
              onClick={this.handleDeleteImage}
            >
              <Icon type="close" />
            </button>
          )}
          {!readOnly && this.state.selectedImage && (() => {
            const rect = this.getSelectedImageRect();
            if (!rect) return null;
            const preview = this.state.imageResizePreview;
            return <div className="mindmap-selected-image" style={{
              left: rect.left, top: rect.top,
              width: preview ? preview.width : rect.width,
              height: preview ? preview.height : rect.height,
            }}>
              <button type="button" className="mindmap-image-resize-handle"
                aria-label="调整图片尺寸" title="拖动调整图片尺寸"
                onMouseDown={this.handleImageResizeStart} />
            </div>;
          })()}
          {this.state.contextMenu && (
            <div
              ref={node => (this.contextMenuRef = node)}
              className={`mindmap-context-menu ${
                this.state.contextMenu.type === 'selected' ? 'selected-node' : ''
              }`}
              style={{
                left: this.state.contextMenu.x,
                top: this.state.contextMenu.y,
              }}
              onMouseDown={event => event.stopPropagation()}
            >
              {this.state.contextMenu.type === 'selected' ? (
                <button
                  type="button"
                  className="mindmap-context-menu-item selected-expand"
                  onClick={() => {
                    expandAllExecutionNodes(this.state.contextMenu.node);
                    this.state.contextMenu.node.renderTree();
                    this.minder.layout(100);
                    this.setState({ contextMenu: null });
                  }}
                >
                  <Icon type="arrows-alt" />
                  <span>展开选中节点</span>
                </button>
              ) : (
                <div className="mindmap-context-menu-item has-submenu">
                  <Icon type="arrows-alt" />
                  <Icon type="right" className="mindmap-context-menu-arrow" />
                  <div className="mindmap-context-submenu">
                    {Object.keys(expandToList).map(level => (
                      <button
                        type="button"
                        className="mindmap-context-menu-item"
                        key={level}
                        onClick={() => {
                          this.minder.execCommand('ExpandToLevel', Number(level));
                          this.setState({ contextMenu: null });
                        }}
                      >
                        {expandToList[level]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {minder && type !== 'compare' && (
            <div className="mindmap-history-actions">
              <DoGroup
                ref={groupNode => (this.groupNode = groupNode)}
                initData={this.initData}
                {...childProps}
                wsInstance={this.ws}
              />
              {!readOnly && (
                <Tooltip title="插入图片">
                  <Button
                    type="link"
                    icon="picture"
                    aria-label="插入图片"
                    disabled={!selectedNode || isLock}
                    onClick={() => this.setState({ showEditImage: true })}
                  >插入图片</Button>
                </Tooltip>
              )}
            </div>
          )}
          {this.state.showEditImage && (
            <ImageModal
              visible
              minder={minder}
              initialFile={this.state.pastedImageFile}
              baseUrl={this.props.baseUrl}
              uploadUrl={this.props.uploadUrl}
              onCancel={() => this.setState({ showEditImage: false, pastedImageFile: null })}
            />
          )}
          <NavBar ref={this.navNode} {...childProps} />
          {this.minder && noteContent && (
            <div
              ref={previewNode => (this.previewNode = previewNode)}
              className={`note-previewer${noteContent ? '' : ' hide'}`}
              dangerouslySetInnerHTML={{ __html: noteContent }}
              onMouseEnter={() => this.minder.fire('shownoterequest', noteNode)}
            />
          )}
          {this.minder && (
            <div
              className={`edit-input${showEdit ? '' : ' hide'}${this.directReplace && !this.showWhileTyping ? ' direct-replace' : ''}`}
              ref={inputNode => (this.inputNode = inputNode)}
            >
              <textarea
                className="ant-input"
                tabIndex={showEdit ? 0 : -1}
                rows={1}
                defaultValue=""
                onInput={this.handleEditInput}
                onCompositionStart={() => {
                  this.composing = true;
                  this.pendingImeEnter = false;
                  this.lastCompositionText = null;
                  this.imeConfirmedByKey = false;
                }}
                onCompositionUpdate={event => {
                  if (/^[a-z' ]+$/i.test(event.data)) this.lastCompositionText = event.data;
                }}
                onCompositionEnd={() => {
                  this.composing = false;
                  this.pendingImeEnter = true;
                }}
                onKeyUp={event => {
                  if (!this.composing && event.keyCode !== 13) this.pendingImeEnter = false;
                }}
                onBlur={() => {
                  if (!this.state.showEdit || this.composing || this.discardPendingComposition) return;
                  // minder.setStatus('readonly');
                  if (selectedNode) selectedNode.render();
                  minder.layout()._interactChange();
                  // this.minder.setStatus('normal');
                  minder.fire('contentchange');
                }}
                style={{ width: '100%', height: '100%' }}
                autoFocus
              />
            </div>
          )}
        </div>
      </ConfigProvider>
    );
  }
}
KityminderEditor.propTypes = {
  priority: PropTypes.any, // priority优先级列表，默认[1,2,3]
  progressShow: PropTypes.any, // 进度toolbar是否显示
  planCycle: PropTypes.string, // 执行记录计划周期
  readOnly: PropTypes.any, // 是否只读，不可编辑，不展示toolbar
  tags: PropTypes.any, // 标签列表，没有改属性则工具栏不展示
  toolbar: PropTypes.any, // 工具栏其他设置
  editorStyle: PropTypes.any, // 容器样式
  uploadUrl: PropTypes.any, // 上传请求地址（相对路径）
  wsUrl: PropTypes.any, // websocket请求地址（绝对路径）
  wsParam: PropTypes.any, // websocket 房间与当前用户参数
  baseUrl: PropTypes.any, // 请求前缀
  onClose: PropTypes.any, // wesocket通信关闭时触发的回调
  onSave: PropTypes.any, // 快捷键保存时触发的事件
  callback: PropTypes.any, // 抛出其他事件，例如全屏
  type: PropTypes.any, // 判断是否为对比历史版本结果页面or查看xmind（只读）
};

export default KityminderEditor;
