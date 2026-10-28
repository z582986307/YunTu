/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import { Row, Button, Col, message, Tooltip } from 'antd';
import './index.scss';
import request from '@/utils/axios';
import getQueryString from '@/utils/getCookies';
import moment from 'moment';
import { getSocketUrl } from '../../react-mindmap-editor/util/socketUrl';
import YunTuEditor from '../../react-mindmap-editor';

const getCookies = getQueryString.getCookie;
/* global staffNamePY */
export default class CaseMgt extends React.Component {
  static propTypes = {
    params: PropTypes.any,
    form: PropTypes.any,
    productId: PropTypes.any,
    updateCallBack: PropTypes.any,
    activeProductObj: PropTypes.any,
  };
  constructor(props) {
    super(props);
    this.state = {
      modaltitle: '',
      visibleStatus: false,
      visible: false,
      title: '',
      caseContent: '',
      id: 0,
      productId: 0,
      recordDetail: null,
      casedetail: null,
      requirementObj: [],
      sourceEditing: false,
      switchingMode: false,
      editorReady: false,
      sourceCaseLocked: false,
      taskLockedByOther: false,
      sourceUpdated: false,
      editorEpoch: 0,
    };
  }
  componentWillUnmount() {
    this.unmounted = true;
  }

  enterSourceEditing = async () => {
    if (this.modeTransition || this.state.sourceCaseLocked || this.state.taskLockedByOther || !this.editorNode || !this.editorNode.canOperate()) return;
    this.modeTransition = true;
    this.setState({ switchingMode: true });
    try {
      const editor = this.editorNode;
      await editor.saveAndWait();
      if (this.unmounted || this.state.sourceCaseLocked || this.state.taskLockedByOther) return;
      this.taskViewState = editor.captureViewState();
      this.assignedNodeIds = editor.getAssignedNodeIds();
      this.setState(state => ({ sourceEditing: true, editorReady: false, editorEpoch: state.editorEpoch + 1 }));
    } catch (error) {
      message.error(error.message || '保存未完成，暂不能编辑源用例');
    } finally {
      this.modeTransition = false;
      if (!this.unmounted) this.setState({ switchingMode: false });
    }
  };

  finishSourceEditing = async () => {
    if (this.modeTransition || !this.editorNode) return;
    this.modeTransition = true;
    this.setState({ switchingMode: true });
    try {
      await this.editorNode.saveAndWait();
      if (this.unmounted) return;
      // 新任务实例重新连接，后端将最新源内容与已保存执行数据合并；不复用旧脑图。
      this.setState(state => ({ sourceEditing: false, sourceUpdated: false,
        editorReady: false, editorEpoch: state.editorEpoch + 1 }));
      this.getContentById();
    } catch (error) {
      message.error(error.message || '保存未完成，请留在编辑状态重试');
    } finally {
      this.modeTransition = false;
      if (!this.unmounted) this.setState({ switchingMode: false });
    }
  };

  handleSourceEditDenied = () => {
    if (!this.state.sourceEditing || this.unmounted) return;
    this.setState(state => ({ sourceEditing: false, editorReady: false,
      editorEpoch: state.editorEpoch + 1 }));
    message.warning('源用例被占用或无法编辑，已返回原任务位置');
  };

  handleSourceCaseUpdated = () => {
    if (!this.unmounted && !this.state.sourceEditing) this.setState({ sourceUpdated: true });
  };

  handleSourceCaseLockChanged = locked => {
    if (!this.unmounted) this.setState({ sourceCaseLocked: Boolean(locked) });
  };

  refreshTask = async () => {
    if (this.modeTransition || !this.editorNode) return;
    this.modeTransition = true;
    this.setState({ switchingMode: true });
    try {
      await this.editorNode.saveAndWait();
      if (this.unmounted) return;
      this.taskViewState = this.editorNode.captureViewState();
      this.setState(state => ({ sourceUpdated: false, editorReady: false, editorEpoch: state.editorEpoch + 1 }));
      this.getContentById();
    } catch (error) {
      message.error(error.message || '保存未完成，暂不能刷新');
    } finally {
      this.modeTransition = false;
      if (!this.unmounted) this.setState({ switchingMode: false });
    }
  };
  componentDidMount() {
    const { iscore } = this.props.match.params;
    if (iscore === '3') {
      this.getContentById();
    } else {
      this.getCaseById();
    }
  }

  getRequirementsById = requirementIds => {
    // request(`${this.props.oeApiPrefix}/business-lines/requirements`, {
    //   method: 'GET',
    //   params: { requirementIds: requirementIds },
    // }).then(res => {
    //   this.setState({ requirementObj: res, loading: false });
    // });
  };

  getCaseById = () => {
    let url = `${this.props.doneApiPrefix}/case/getCaseInfo`;
    request(url, {
      method: 'GET',
      params: { id: this.props.match.params.caseId },
    }).then(res => {
      if (res.code == 200) {
        this.setState(
          {
            casedetail: res.data,
          },
          () => {
            this.state.casedetail.requirementId &&
              this.getRequirementsById(this.state.casedetail.requirementId);
          },
        );
      } else {
        message.error(res.msg);
        this.props.history.push('/case/caseList/1');
      }
    });
  };

  ///record/getContentById
  getContentById = () => {
    let url = `${this.props.doneApiPrefix}/record/getRecordInfo`;

    request(url, {
      method: 'GET',
      params: { id: this.props.match.params.itemid },
    }).then(res => {
      if (res.code == 200) {
        if (!this.unmounted) this.setState({ recordDetail: res.data });
      } else {
        message.error(res.msg);
      }
    });
  };

  //清除执行记录
  clearRecord = () => {
    const params = {
      id: this.props.match.params.itemid,
      modifier: getCookies('username'),
    };

    let url = `${this.props.doneApiPrefix}/record/clear`;
    request(url, { method: 'POST', body: params }).then(res => {
      if (res.code == 200) {
        message.success('清除执行记录成功');
        this.editorNode.setEditerData(JSON.parse(res.data.caseContent));
      } else {
        message.error(res.msg);
      }
    });
  };

  render() {
    //this.props.match.params.iscore  0:需求case  3:执行记录详情
    const { match } = this.props;
    const { iscore, caseId, itemid } = match.params;
    const user = getCookies('username');
    const { recordDetail, casedetail, sourceEditing, switchingMode, editorEpoch, editorReady } = this.state;
    const sourceEditLocked = !sourceEditing && (this.state.sourceCaseLocked || this.state.taskLockedByOther);
    let readOnly = false;
    let progressShow = false;
    let addFactor = false;
    if (iscore === '0' || iscore === '1') {
      readOnly = false;
      progressShow = false;
      addFactor = true;
    } else {
      readOnly = true;
      progressShow = true;
      addFactor = false;
    }
    if (sourceEditing) {
      readOnly = false;
      progressShow = false;
      addFactor = true;
    }
    const planCycle = recordDetail
      ? `${recordDetail.expectStartTime
          ? moment(recordDetail.expectStartTime).format('YYYY/MM/DD')
          : '未设置'} - ${recordDetail.expectEndTime
          ? moment(recordDetail.expectEndTime).format('YYYY/MM/DD')
          : '未设置'}`
      : '';
    return (
      <div className="case-detail-shell">
        <div className="case-detail-heading">
          <div className="case-detail-navigation">
            <Button
              type="link"
              icon="arrow-left"
              className="case-detail-back"
              onClick={() => this.props.history.push('/case/caseList/1')}
            >
              返回
            </Button>
          </div>
          <span className="case-detail-title">
            {Number(iscore) === 3 ? '测试任务名称：' : '用例名称：'}
            {recordDetail ? recordDetail.title : ''}
            {casedetail ? casedetail.title : ''}
          </span>
          <span className="case-detail-requirement">
            关联需求：
            {(recordDetail && recordDetail.requirementIds) ||
              (casedetail && casedetail.requirementId) ||
              '未关联'}
          </span>
          <div className="case-detail-actions">
          {Number(iscore) === 3 && <Tooltip title={sourceEditLocked ? '源用例被锁定，不可编辑' : undefined}>
          <span><Button
            className="mindmap-tool-button case-source-edit-button"
            icon={sourceEditing ? 'check' : 'edit'}
            aria-pressed={sourceEditing}
            loading={switchingMode}
            disabled={!editorReady || switchingMode || sourceEditLocked}
            onClick={sourceEditing ? this.finishSourceEditing : this.enterSourceEditing}
          >{sourceEditing ? '结束编辑' : '编辑用例'}</Button></span></Tooltip>}
          {Number(iscore) !== 2 && (
            <Button
              type="primary"
              className="case-detail-save"
              disabled={switchingMode}
              onClick={() => this.editorNode && this.editorNode.onButtonSave()}
            >
              保存
            </Button>
          )}
          </div>
        </div>
        {sourceEditing && <div className="case-source-edit-notice" role="status">
          正在编辑完整源用例；淡化节点未分配到当前任务。结束编辑并保存后返回原执行位置。
        </div>}
        {!sourceEditing && this.state.sourceUpdated && <div className="case-source-update-notice" role="status">
          源用例已更新，刷新后查看
          <Button type="link" loading={switchingMode} onClick={this.refreshTask}>刷新</Button>
        </div>}
        <div className="case-detail-content">
          {(recordDetail && (
            <Row>
              <Col span={6} className="description-case elipsis-case">
                <Tooltip
                  title={recordDetail.description}
                  placement="bottomLeft"
                >
                  {recordDetail.description}
                </Tooltip>
              </Col>
            </Row>
          )) ||
            null}

          {(casedetail && (
            <Row>
              <Col span={6} className="description-case elipsis-case">
                <Tooltip title={casedetail.description} placement="topLeft">
                  {casedetail.description}
                </Tooltip>
              </Col>
            </Row>
          )) ||
            null}
           
          <YunTuEditor
            key={`${sourceEditing ? 'source' : 'task'}-${editorEpoch}`}
            ref={editorNode => (this.editorNode = editorNode)}
            sourceEditing={sourceEditing}
            assignedNodeIds={this.assignedNodeIds}
            initialViewState={this.taskViewState}
            viewStateKey={`mindmap-view:${caseId}:${itemid || 'case'}:${sourceEditing ? 'source' : (Number(iscore) === 3 ? 'task' : 'case')}`}
            onOperationStateChanged={(ready, status) => !this.unmounted && this.setState({
              editorReady: ready, taskLockedByOther: Boolean(status && status.lockedByOther),
            })}
            onSourceCaseUpdated={this.handleSourceCaseUpdated}
            onSourceCaseLockChanged={this.handleSourceCaseLockChanged}
            onSourceEditDenied={this.handleSourceEditDenied}
            tags={['前置条件', '执行步骤', '预期结果']}
            iscore={iscore}
            progressShow={progressShow}
            planCycle={planCycle}
            readOnly={readOnly}
            mediaShow={!progressShow}
            toolbar={{
              image: true,
              theme: ['byte-blue', 'ink-black', 'classic-compact', 'fresh-blue', 'fresh-green-compat'],
              template: ['default', 'right', 'fish-bone'],
              noteTemplate: '# test',
              addFactor,
            }}
            baseUrl=""
            uploadUrl="/api/file/uploadAttachment"
            wsUrl={getSocketUrl(window.location)}
            wsParam = {{ transports:['websocket','xhr-polling','jsonp-polling'], query: { caseId: caseId,
              recordId: sourceEditing ? 'undefined' : itemid, user: user,
              ...(sourceEditing ? { sourceTaskId: itemid } : {}) }}}
            // wsUrl={`ws://localhost:8094/api/case/${caseId}/${itemid}/${iscore}/${user}`}
          />
        </div>
      </div>
    );
  }
}
