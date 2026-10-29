import React from 'react'
import 'antd/dist/antd.css'
import { Layout, Icon, Menu, Dropdown, Modal, Input, message } from 'antd'
import getQueryString from '@/utils/getCookies'
import '../pages/landing/less/index.less'
import request from '@/utils/axios'
import './headers.scss'
const { Header } = Layout
const getCookies = getQueryString.getCookie

class Headers extends React.Component {
  state = { passwordVisible: false, oldPassword: '', newPassword: '', confirmPassword: '', savingPassword: false }

  componentDidMount() {
    if (!getCookies('username')) {
      window.location.href = `/login?jumpto=${window.location.href}`
    }
  }
  // 登出
  handleDropdownClick = ({ key }) => {
    if (key === 'changePassword') {
      this.setState({ passwordVisible: true })
      return
    }
    request(`/user/quit`, {
      method: 'POST',
    }).then(res => {
      if (res && res.code === 200) {
        window.location.href = `/login?jumpto=${window.location.href}`
      } else {
        message.error(res.msg)
      }
    })
  }

  closePasswordDialog = () => {
    this.setState({ passwordVisible: false, oldPassword: '', newPassword: '', confirmPassword: '' })
  }

  savePassword = () => {
    const { oldPassword, newPassword, confirmPassword } = this.state
    if (!oldPassword || !newPassword) return message.error('请填写旧密码和新密码')
    if (newPassword !== confirmPassword) return message.error('两次输入的新密码不一致')
    this.setState({ savingPassword: true })
    request(`/user/changePassword`, { method: 'POST', body: { oldPassword, newPassword } })
      .then(res => {
        if (res && res.code === 200) {
          message.success('密码修改成功')
          this.closePasswordDialog()
        } else {
          message.error((res && res.msg) || '修改密码失败')
        }
      })
      .catch(() => message.error('修改密码失败，请稍后重试'))
      .finally(() => this.setState({ savingPassword: false }))
  }

  render() {
    const menu = (
      <Menu className="menu" onClick={this.handleDropdownClick}>
        <Menu.Item key="changePassword">
          <span><Icon type="lock" /> 修改密码</span>
        </Menu.Item>
        <Menu.Item key="logout">
          <span>
            <Icon type="logout" />
            退出登录
          </span>
        </Menu.Item>
      </Menu>
    )
    return getCookies('username') ? (
      <React.Fragment>
      <Header className={this.props.light ? 'yuntu-header-light' : ''} style={{ zIndex: 9 }}>
        <a href="/" style={{ color: this.props.light ? '#111827' : '#fff', fontSize: this.props.light ? 20 : 24 }}>
          YunTu
        </a>
        {getCookies('username') ? (
          <Dropdown overlay={menu} overlayClassName="dropStyle" placement="bottomLeft">
            <div className="user">
              <Icon type="user" className="userIcon" />
              <span className="username">{getCookies('username')}</span>
              <Icon type="down" className="dowm" />
            </div>
          </Dropdown>
        ) : (
          <a href="/login" className="loginCss">
            登录/注册
          </a>
        )}
      </Header>
      <Modal title="修改密码" visible={this.state.passwordVisible} onOk={this.savePassword}
        onCancel={this.closePasswordDialog} okText="确定" cancelText="取消"
        confirmLoading={this.state.savingPassword} destroyOnClose>
        <Input.Password aria-label="旧密码" placeholder="旧密码" autoComplete="current-password"
          value={this.state.oldPassword} onChange={e => this.setState({ oldPassword: e.target.value })} />
        <Input.Password aria-label="新密码" placeholder="新密码" autoComplete="new-password"
          style={{ marginTop: 12 }} value={this.state.newPassword}
          onChange={e => this.setState({ newPassword: e.target.value })} />
        <Input.Password aria-label="确认新密码" placeholder="确认新密码" autoComplete="new-password"
          style={{ marginTop: 12 }} value={this.state.confirmPassword}
          onChange={e => this.setState({ confirmPassword: e.target.value })} />
      </Modal>
      </React.Fragment>
    ) : null
  }
}
export default Headers
