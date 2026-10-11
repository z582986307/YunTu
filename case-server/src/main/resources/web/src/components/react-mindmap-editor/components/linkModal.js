import React from 'react';
import { Modal, Form, Input } from 'antd';

const LinkModal = (props) => {
  const onOk = () => {
    const { form, minder, onCancel } = props;
    form.validateFields((err, values) => {
      if (err) {
        console.log('Received values of form: ', values);
        return;
      }
      const params = { ...values };
      minder.execCommand('HyperLink', params.url, params.title);
      onCancel();
    });
  };
  const defaultObj = props.minder.queryCommandValue('HyperLink');
  const { getFieldDecorator } = props.form;
  const [titleLength, setTitleLength] = React.useState((defaultObj.title || '').length);
  return (
    <Modal
      title="插入链接"
      className="yuntu-modal"
      visible={props.visible}
      onOk={onOk}
      onCancel={props.onCancel}
    >
      <Form layout="vertical">
        <Form.Item label="链接地址">
          {getFieldDecorator('url', {
            rules: [
              {
                required: true,
                message: '必填：以 http(s):// 或 ftp:// 开头',
              },
            ],
            initialValue: defaultObj.url,
          })(<Input placeholder="必填：以 http(s):// 或 ftp:// 开头" />)}
        </Form.Item>
        <Form.Item label="提示文本">
          {getFieldDecorator('title', {
            initialValue: defaultObj.title,
            rules: [{ max: 200, message: '提示文本最多 200 字' }],
          })(
            <Input
              maxLength={200}
              placeholder="选填：鼠标在链接上悬停时提示的文本"
              onChange={event => setTitleLength(event.target.value.length)}
              suffix={<span className="link-title-remaining">{Math.max(0, 200 - titleLength)}/200</span>}
            />
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};
const WrappedLinkForm = Form.create({ name: 'link' })(LinkModal);
export default WrappedLinkForm;
