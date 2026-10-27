import React, { Component } from 'react';
import { Button, Tooltip } from 'antd';
import jsonDiff from 'fast-json-patch';
import './DoGroup.scss';

const MAX_HISTORY = 100;

class DoGroup extends Component {
  doDiffs = [];
  state = {
    undoDiffs: [],
    redoDiffs: [],
    patchLock: false,
    lastSnap: this.props.minder && this.props.minder.exportJson(),
  };
  componentDidMount() {
    let { minder } = this.props;
    minder.on('import progressiveimportdone', this.reset);
    // minder.on('patch', this.updateSelection);
  }
  reset = () => {
    if (this.props.minder._progressiveImporting) return;
    this.doDiffs = [];
    this.setState({
      undoDiffs: [],
      redoDiffs: [],
      lastSnap: this.props.minder.exportJson(),
    });
  };

  componentWillUnmount() {
    this.unmounted = true;
    this.doDiffs = [];
    this.props.minder.off('import progressiveimportdone', this.reset);
  }

  makeUndoDiff = () => {
    const { minder } = this.props;
    let { undoDiffs, lastSnap } = this.state;
    const headSnap = minder.exportJson();
    const diff = jsonDiff.compare(headSnap, lastSnap);

    const doDiff = jsonDiff.compare(lastSnap, headSnap);
    if (diff.length) {
      if (diff.length === 1 && diff[0].path === '/base') {
        const undoTop = undoDiffs[undoDiffs.length - 1];
        if (undoTop) undoTop.push(diff[0]);
      } else {
        undoDiffs.push(diff);
        this.doDiffs.push(doDiff);
      }
      while (undoDiffs.length > MAX_HISTORY) {
        undoDiffs.shift();
        this.doDiffs.shift();
      }
      lastSnap = headSnap;
      this.setState({ undoDiffs, lastSnap });
      return { changed: true, snapshot: headSnap };
    }
    return { changed: false, snapshot: headSnap };
  };
  makeRedoDiff = () => {
    const { minder } = this.props;
    let { lastSnap, redoDiffs } = this.state;
    let revertSnap = minder.exportJson();
    redoDiffs.push(jsonDiff.compare(revertSnap, lastSnap));

    lastSnap = revertSnap;
    this.setState({ redoDiffs, lastSnap });
  };

  // 撤销
  undo = async (notifyInfo = {}) => {
    if ((this.props.isLock && notifyInfo instanceof Object) || !this.hasUndo()) return;
    if (this.props.sourceEditing && notifyInfo instanceof Object &&
        !(await this.props.beginSourceHistory())) return;
    if (this.unmounted) return;
    this.notifyInfo = notifyInfo;
    this.setState({ patchLock: true }, () => {
      const { minder } = this.props;
      let { undoDiffs } = this.state;
      const undoDiff = undoDiffs.pop();
      this.doDiffs.pop();
      if (undoDiff) {
        if (this.notifyInfo instanceof Object) {
          this.props.wsInstance.sendMessage('undo', {
            message: JSON.stringify(undoDiff),
          });
          minder.applyPatches(undoDiff);
        } else {
          minder.applyPatches(JSON.parse(notifyInfo || '{}'));
        }

        this.makeRedoDiff();
      }
      this.setState({ patchLock: false });
    });
  };
  // 重做
  redo = async (notifyInfo = {}) => {
    if ((this.props.isLock && notifyInfo instanceof Object) || !this.hasRedo()) return;
    if (this.props.sourceEditing && notifyInfo instanceof Object &&
        !(await this.props.beginSourceHistory())) return;
    if (this.unmounted) return;
    this.notifyInfo = notifyInfo;
    this.setState({ patchLock: true }, () => {
      const { minder } = this.props;
      let { redoDiffs } = this.state;
      const redoDiff = redoDiffs.pop();

      if (redoDiff) {
        if (this.notifyInfo instanceof Object) {
          this.props.wsInstance.sendMessage('redo', {
            message: JSON.stringify(redoDiff),
          });
          minder.applyPatches(redoDiff);
        } else {
          minder.applyPatches(JSON.parse(notifyInfo || '{}'));
        }
        this.makeUndoDiff();
        this.doDiffs.pop();
      }
      this.setState({ patchLock: false });
    });
  };
  getAndResetPatch = () => {
    const diffs = [...this.doDiffs];
    this.doDiffs = [];
    return diffs;
  };
  changed = () => {
    const { patchLock } = this.state;
    if (window.minderData) {
      if (patchLock) return;
      const change = this.makeUndoDiff();
      if (change.changed) {
        this.setState({ redoDiffs: [] });
      }
      return {
        snapshot: change.snapshot,
        patch: this.getAndResetPatch(),
      };
    }
    return null;
  };
  recordDirectChange = (forwardPatches, inversePatches) => {
    if (!forwardPatches.length) return;
    const { undoDiffs, lastSnap } = this.state;
    jsonDiff.applyPatch(lastSnap, forwardPatches, false, true);
    undoDiffs.push(inversePatches);
    this.doDiffs.push(forwardPatches);
    while (undoDiffs.length > MAX_HISTORY) {
      undoDiffs.shift();
      this.doDiffs.shift();
    }
    this.setState({ undoDiffs, redoDiffs: [], lastSnap });
    this.getAndResetPatch();
  };
  hasUndo = () => {
    const { undoDiffs } = this.state;
    return !!undoDiffs.length;
  };
  syncBase = base => {
    this.state.lastSnap.base = base;
    this.setState({ lastSnap: this.state.lastSnap });
  };
  hasRedo = () => {
    const { redoDiffs } = this.state;
    return !!redoDiffs.length;
  };

  renderHistoryIcon = redo => (
    <svg className={`do-group-history-icon${redo ? ' redo' : ''}`} viewBox="0 0 32 28" aria-hidden="true">
      <path d="M8 7H20a8 8 0 1 1 0 16h-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9 1 3 7l6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  updateSelection = e => {
    const { patchLock } = this.state;
    const { minder } = this.props;
    if (!patchLock) return;
    const patch = e.patch;
    // eslint-disable-next-line default-case
    switch (patch.express) {
      case 'node.add':
        minder.select(patch.node.getChild(patch.index), true);
        break;
      case 'node.remove':
      case 'data.replace':
      case 'data.remove':
      case 'data.add':
        minder.select(patch.node, true);
        break;
    }
  };

  render() {
    const { isLock } = this.props;
    let hasUndo = this.hasUndo();
    let hasRedo = this.hasRedo();
    if (isLock) {
      hasUndo = false;
      hasRedo = false;
    }
    return (
      <div className="nodes-actions do-group">
        <Tooltip title="撤销（Ctrl+Z）">
          <Button
            aria-label="撤销"
            title="撤销（Ctrl+Z）"
            type="link"
            onClick={this.undo}
            disabled={!hasUndo}
            >{this.renderHistoryIcon(false)}<span className="do-group-label">撤销</span></Button>
        </Tooltip>
        <Tooltip title="重做（Ctrl+Y）">
          <Button
            aria-label="重做"
            title="重做（Ctrl+Y）"
            type="link"
            disabled={!hasRedo}
            onClick={this.redo}
            >{this.renderHistoryIcon(true)}<span className="do-group-label">重做</span></Button>
        </Tooltip>
      </div>
    );
  }
}
export default DoGroup;
