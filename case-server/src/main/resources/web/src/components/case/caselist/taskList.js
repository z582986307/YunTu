import React from 'react'
import { Table, Pagination, Button, Modal, Checkbox, message } from 'antd'
import router from 'umi/router'
import moment from 'moment'
import request from '@/utils/axios'
import getQueryString from '@/utils/getCookies'
import TaskModal from './taskModal'

class TaskList extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      tasks: [], total: 0, page: 1, loading: false,
      editing: null, caseInfo: {}, ownerList: [], fetching: false,
    }
  }

  componentDidMount() { this.loadPage(1) }

  loadPage = page => {
    this.setState({ loading: true })
    return request('/record/page', {
      method: 'GET',
      params: { productLineId: Number(this.props.productLineId), pageNum: page, pageSize: 10 },
    }).then(res => {
      if (res.code !== 200) throw new Error(res.msg || '任务加载失败')
      this.setState({ tasks: res.data.dataSources || [], total: res.data.total || 0,
        page, loading: false })
    }).catch(error => {
      this.setState({ loading: false })
      message.error(error.message || '任务加载失败')
    })
  }

  taskUrl = record => `/caseManager/${this.props.productLineId}/${record.caseId}/${record.id}/3`

  openTask = record => {
    const username = getQueryString.getCookie('username') || ''
    const url = this.taskUrl(record)
    if (!record.owner || (username && record.owner.split(',').map(owner => owner.trim()).includes(username))) {
      router.push(url)
      return
    }
    Modal.confirm({
      title: '您不是当前测试任务指派的负责人，确认要执行该任务？',
      okText: '确认', cancelText: '取消', onOk: () => router.push(url),
    })
  }

  getCaseInfo = (priority = [], resource = []) => {
    if (!this.state.editing) return
    request('/case/countByCondition', {
      method: 'GET',
      params: { caseId: this.state.editing.caseId, priority, resource },
    }).then(res => {
      if (res.code === 200) this.setState({ caseInfo: res.data })
    })
  }

  editTask = record => {
    this.setState({ editing: record, caseInfo: {} }, () => {
      let selection = {}
      try { selection = JSON.parse(record.chooseContent || '{}') } catch (error) { selection = {} }
      this.getCaseInfo(selection.priority || [], selection.resource || [])
    })
  }

  searchOwners = value => {
    if (!value) { this.setState({ ownerList: [] }); return }
    this.setState({ fetching: true })
    request('/user/suggest', { method: 'GET', params: { username: value } }).then(res => {
      this.setState({ ownerList: res.code === 200 ? res.data || [] : [], fetching: false })
    }).catch(() => this.setState({ fetching: false }))
  }

  deleteTask = record => {
    let acknowledged = false
    Modal.confirm({
      title: '确认删除测试任务吗',
      content: <span>这将删除该任务下的测试结果，此操作不可撤销。<br />
        <Checkbox onChange={event => { acknowledged = event.target.checked }}>我明白以上操作</Checkbox>
      </span>,
      okText: '删除', cancelText: '取消',
      onOk: () => {
        if (!acknowledged) { message.info('请先勾选我明白以上操作'); return Promise.reject(new Error('未确认')) }
        return request('/record/delete', { method: 'POST', body: { id: record.id } }).then(res => {
          if (res.code !== 200) { message.error(res.msg || '删除失败'); return Promise.reject(new Error('删除失败')) }
          message.success('任务已删除')
          return this.loadPage(this.state.page)
        })
      },
    })
  }

  render() {
    const { tasks, total, page, loading, editing, caseInfo, ownerList, fetching } = this.state
    const columns = [
      { title: '任务名称', dataIndex: 'title', key: 'title', render: (text, record) =>
        <a className="task-list-name" title={text} onClick={() => this.openTask(record)}>{text}</a> },
      { title: '所属用例 ID', dataIndex: 'caseId', key: 'caseId', width: 120 },
      { title: '负责人', dataIndex: 'owner', key: 'owner', width: 130 },
      { title: '执行进度', key: 'progress', width: 120,
        render: (_, record) => `${record.executeNum || 0} / ${record.totalNum || 0}` },
      { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 180,
        render: value => value ? moment(value).format('YYYY-MM-DD HH:mm:ss') : '' },
      { title: '操作', key: 'actions', width: 180, render: (_, record) => <span className="task-list-actions">
        <Button type="link" onClick={() => this.openTask(record)}>执行</Button>
        <Button type="link" onClick={() => this.editTask(record)}>编辑</Button>
        <Button type="link" className="task-list-delete" onClick={() => this.deleteTask(record)}>删除</Button>
      </span> },
    ]
    return <div className="task-list-page">
      <div className="task-list-heading">测试任务</div>
      <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} pagination={false} scroll={{ x: 820 }}
        locale={{ emptyText: '暂无测试任务，请先从用例列表创建任务' }} />
      {total > 0 && <Pagination current={page} total={total} pageSize={10} onChange={this.loadPage} />}
      {editing && <TaskModal visible record={editing} caseInfo={caseInfo} ownerList={ownerList}
        fetching={fetching} titleModeTask="编辑测试任务" doneApiPrefix=""
        getOwnerList={this.searchOwners} getCaseInfo={this.getCaseInfo}
        onClose={form => { form.resetFields(); this.setState({ editing: null }) }}
        handleOkTask={() => { this.setState({ editing: null }); this.loadPage(page) }} />}
    </div>
  }
}

export default TaskList
