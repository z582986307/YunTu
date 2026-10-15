/** 历史版本对比结果 */
import React from 'react';
import { message, Spin, Card, Tag, Button } from 'antd';
import moment from 'moment';
moment.locale('zh-cn');
import request from '@/utils/axios';
import Headers from '../../layouts/headers';
import YunTuEditor from '../../components/react-mindmap-editor';
import './index.scss';

class SeeResult extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      info: [],
    };
  }
  componentDidMount() {
    this.setState({ loading: true });
    const { caseId, backupId, caseId1, caseId2 } = this.props.match.params;
    request(caseId ? '/backup/getCurrentCaseDiff' : '/backup/getCaseDiff', {
      method: 'GET',
      params: caseId ? { caseId, backupId } : { caseId1, caseId2 },
    }).then(res => {
      if (res.code === 200 && res.data && res.data.content && res.data.content.root) {
        this.editorNode.setEditerData(res.data.content).then(() => {
          this.setState({ loading: false });
        });
        this.setState({ info: res.data.backupinfo });
      } else {
        this.setState({ loading: false });
        message.error(res.msg || '版本对比失败');
      }
    }).catch(() => {
      this.setState({ loading: false });
      message.error('版本对比失败，请重试');
    });
  }
  render() {
    return (
      <React.Fragment>
        <Headers light />
        <div className="history-navigation">
          <Button type="link" icon="arrow-left" onClick={() => {
            const { caseId } = this.props.match.params;
            if (caseId) this.props.history.push(`/history/${caseId}`);
            else this.props.history.goBack();
          }}>
            返回
          </Button>
        </div>
        <Spin tip="Loading..." spinning={this.state.loading}>
          <div className="historyBox">
            <div className="box_title">
              <Card bordered={false} title="测试用例版本对比" className="title_history">
                <div style={{ display: 'flex' }}>
                  {this.state.info &&
                    this.state.info.map((item, i) => (
                      <Card style={{ marginRight: 20 }} key={i}>
                        <span>
                          {i === 0 ? '选中历史版本' : '当前测试用例'}<br />
                          更新人: {item.user || '-'}
                          <br />
                          更新时间:{' '}
                          {item.time ? moment(item.time).format('YYYY-MM-DD HH:mm:ss') : '-'}
                        </span>
                      </Card>
                    ))}
                </div>
              </Card>
              <Card bordered={false} title="颜色标识" className="title_color">
                <Tag color="#ddfade">该节点被添加</Tag>
                <Tag color="#ffe7e7">该节点被删除</Tag>
                <Tag color="#d6f0ff">内容已变更</Tag>
              </Card>
            </div>
            <YunTuEditor
              ref={editorNode => (this.editorNode = editorNode)}
              tags={['前置条件', '执行步骤', '预期结果']}
              progressShow={false}
              readOnly={true}
              mediaShow={true}
              editorStyle={{ height: 'calc(100vh - 240px)' }}
              toolbar={{
                image: true,
                theme: ['classic-compact', 'fresh-blue', 'byte-blue', 'ink-black', 'fresh-green-compat'],
                template: ['default', 'right', 'fish-bone'],
                noteTemplate: '# test',
              }}
              uploadUrl="/api/file/uploadAttachment"
              // wsUrl="ws://localhost:8094/api/case/2227/undefined/0/user"
              type="compare"
            />
          </div>
        </Spin>
      </React.Fragment>
    );
  }
}
export default SeeResult;
