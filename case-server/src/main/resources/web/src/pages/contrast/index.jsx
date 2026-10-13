/** 历史版本对比 */
import React from 'react'
import { Table, Button, Card, Tooltip, Modal, message } from 'antd'
import moment from 'moment'
import './index.scss'
import Headers from '../../layouts/headers'
import request from '@/utils/axios'
import getQueryString from '@/utils/getCookies'
moment.locale('zh-cn')

class Contrast extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      rowKeys: [], // 当前选择行的 key
      rows: [], // 当前选择的行数据
      historyList: [],
      loading: false,
    }
  }
  componentDidMount() {
    this.getHistoryList()
  }
  getHistoryList = () => {
    this.setState({ loading: true })
    return request(`/backup/getBackupByCaseId`, {
      method: 'GET',
      params: {
        caseId: this.props.match.params.caseId,
      },
    }).then(res => {
      if (res.code === 200) {
        this.setState({ historyList: res.data || [], loading: false })
      } else {
        this.setState({ loading: false })
        message.error(res.msg || '历史版本加载失败')
      }
    }).catch(() => {
      this.setState({ loading: false })
      message.error('历史版本加载失败，请重试')
    })
  }
  contrastClick = () => {
    const { rows } = this.state
    if (rows.length !== 2) return
    this.props.history.push(`/caseManager/historyContrast/${rows[0].id}/${rows[1].id}`)
  }
  restoreClick = record => {
    Modal.confirm({
      title: '恢复历史版本？',
      content: '恢复前会保存当前用例为新历史版本，已有测试任务和执行记录不变。',
      okText: '确认恢复',
      cancelText: '取消',
      onOk: () => request('/backup/restore', {
        method: 'POST',
        body: {
          caseId: Number(this.props.match.params.caseId),
          backupId: record.id,
          modifier: getQueryString.getCookie('username'),
        },
      }).then(res => {
        if (res.code !== 200) {
          message.error(res.msg || '恢复失败')
          return Promise.reject(new Error(res.msg || '恢复失败'))
        }
        message.success('已恢复历史版本')
        this.setState({ rowKeys: [], rows: [] })
        return this.getHistoryList()
      }),
    })
  }
  setTableColums = () => {
    const columns = [
      {
        title: '备份ID',
        dataIndex: 'id',
      },
      {
        title: '创建时间',
        dataIndex: 'gmtCreated',
        render: text => {
          return <span>{moment(text).format('YYYY-MM-DD HH:mm:ss')}</span>
        },
      },
      {
        title: '创建人',
        dataIndex: 'creator',
      },
      {
        title: '操作',
        key: 'operation',
        render: (_, record) => <Button type="link" onClick={() => this.restoreClick(record)}>恢复</Button>,
      },
    ]
    return columns
  }
  render() {
    const rowSelection = {
      selectedRowKeys: this.state.rowKeys,
      onChange: (selectedRowKeys, selectedRows) => {
        this.setState({ rowKeys: selectedRowKeys, rows: selectedRows })
      },
      getCheckboxProps: record => ({
        disabled: this.state.rowKeys.length >= 2 && !this.state.rowKeys.includes(record.id),
        name: record.name,
      }),
    }
    return (
      <section style={{ marginBottom: 30 }}>
        <Headers />
        <div className="history-navigation">
          <Button type="link" icon="arrow-left" onClick={() => this.props.history.goBack()}>
            返回
          </Button>
        </div>
        <Card
          bordered={false}
          className={this.state.rowKeys.length >= 2 ? 'contras_card' : 'contras_card_default'}
        >
          <div className="contras_title">
            {/* <span>历史版本</span> */}
            <Tooltip
              placement="top"
              title={this.state.rowKeys.length < 2 ? '选择两个版本后，才可以对比哦～' : null}
            >
              <Button
                type="primary"
                disabled={this.state.rowKeys.length < 2}
                onClick={this.contrastClick}
              >
                对比已选择版本
              </Button>
            </Tooltip>
          </div>
          <Table
            rowKey="id"
            rowSelection={rowSelection}
            columns={this.setTableColums()}
            dataSource={this.state.historyList}
            loading={this.state.loading}
          />
        </Card>
      </section>
    )
  }
}
export default Contrast
