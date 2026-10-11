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
    };
  }
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
        this.setState({ recordDetail: res.data });
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
    const { recordDetail, casedetail } = this.state;
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
            用例名称：
            {recordDetail ? recordDetail.title : ''}
            {casedetail ? casedetail.title : ''}
          </span>
          <span className="case-detail-requirement">
            关联需求：
            {(recordDetail && recordDetail.requirementIds) ||
              (casedetail && casedetail.requirementId) ||
              '未关联'}
          </span>
          {Number(iscore) !== 2 && (
            <Button
              type="primary"
              className="case-detail-save"
              onClick={() => this.editorNode && this.editorNode.onButtonSave()}
            >
              保存
            </Button>
          )}
        </div>
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
            ref={editorNode => (this.editorNode = editorNode)}
            tags={['前置条件', '执行步骤', '预期结果']}
            iscore={iscore}
            progressShow={progressShow}
            planCycle={planCycle}
            readOnly={readOnly}
            mediaShow={!progressShow}
            toolbar={{
              image: true,
              theme: ['classic-compact', 'fresh-blue', 'byte-blue', 'fresh-green-compat'],
              template: ['default', 'right', 'fish-bone'],
              noteTemplate: '# test',
              addFactor,
            }}
            baseUrl=""
            uploadUrl="/api/file/uploadAttachment"
            wsUrl={getSocketUrl(window.location)}
            wsParam = {{ transports:['websocket','xhr-polling','jsonp-polling'], query: { caseId: caseId, recordId: itemid, user: user }}}
            // wsUrl={`ws://localhost:8094/api/case/${caseId}/${itemid}/${iscore}/${user}`}
          />
        </div>
      </div>
    );
  }
}
