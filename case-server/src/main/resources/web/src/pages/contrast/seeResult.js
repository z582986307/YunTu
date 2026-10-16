/** 历史版本对比结果 */
import React from 'react';
import { message, Spin, Card, Tag, Button } from 'antd';
import moment from 'moment';
moment.locale('zh-cn');
import request from '@/utils/axios';
import Headers from '../../layouts/headers';
import YunTuEditor from '../../components/react-mindmap-editor';
import { projectComparison } from './comparisonFilter';
import './index.scss';

class SeeResult extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      info: [],
      activeFilter: 'all',
      matchCount: 0,
      summaryCollapsed: false,
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
        this.rawContent = res.data.content;
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
  handleFilterChange = filter => {
    if (!this.rawContent || filter === this.state.activeFilter) return;
    const projection = projectComparison(this.rawContent, filter);
    this.setState({ activeFilter: filter, matchCount: projection.count, loading: true }, () => {
      Promise.resolve(this.editorNode.setEditerData(projection.content)).then(() => {
        this.setState({ loading: false });
      }).catch(() => {
        this.setState({ loading: false });
        message.error('筛选展示失败，请重试');
      });
    });
  };
  render() {
    const { activeFilter, matchCount, summaryCollapsed } = this.state;
    const comparesCurrent = Boolean(this.props.match.params.caseId);
    const filterOptions = [
      ['all', '全部'], ['added', '新增'], ['deleted', '删除'], ['changed', '内容变更'],
    ];
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
          <div className={`historyBox${summaryCollapsed ? ' summary-collapsed' : ''}`}>
            {!summaryCollapsed && <div className="box_title">
              <Card bordered={false} title="测试用例版本对比" className="title_history">
                <div className="comparison-versions">
                  {this.state.info &&
                    this.state.info.map((item, i) => (
                      <Card className={i === 1 && comparesCurrent ? 'comparison-current-version' : 'comparison-history-version'} key={i}>
                        <span>
                          {i === 0 ? '选中历史版本' : comparesCurrent ? '当前测试用例' : '对比历史版本'}
                          {i === 1 && comparesCurrent && <span className="comparison-current-badge">当前版本</span>}<br />
                          更新人: {item.user || '-'}
                          <br />
                          更新时间:{' '}
                          {item.time ? moment(item.time).format('YYYY-MM-DD HH:mm:ss') : '-'}
                        </span>
                      </Card>
                    ))}
                </div>
              </Card>
              <Card bordered={false} title="变更筛选" className="title_color">
                <div className="comparison-filters" role="group" aria-label="筛选变更节点">
                  {filterOptions.map(([value, label]) => (
                    <Button key={value} className={activeFilter === value ? 'active' : ''}
                      aria-pressed={activeFilter === value} onClick={() => this.handleFilterChange(value)}>
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="comparison-legend" aria-label="颜色标识">
                  <Tag color="#ddfade">新增</Tag>
                  <Tag color="#ffe7e7">删除</Tag>
                  <Tag color="#d6f0ff">内容变更</Tag>
                </div>
              </Card>
            </div>}
            <div className="comparison-summary-toggle">
              <Button type="link" icon={summaryCollapsed ? 'down' : 'up'}
                aria-expanded={!summaryCollapsed}
                onClick={() => this.setState({ summaryCollapsed: !summaryCollapsed })}>
                {summaryCollapsed ? '展开对比信息' : '收起对比信息'}
              </Button>
              {activeFilter !== 'all' && <span role="status">{matchCount ? `匹配 ${matchCount} 个节点` : '该类型暂无变更节点'}</span>}
            </div>
            <YunTuEditor
              ref={editorNode => (this.editorNode = editorNode)}
              tags={['前置条件', '执行步骤', '预期结果']}
              progressShow={false}
              readOnly={true}
              mediaShow={true}
              editorStyle={{ height: summaryCollapsed ? 'calc(100vh - 150px)' : 'calc(100vh - 250px)' }}
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
