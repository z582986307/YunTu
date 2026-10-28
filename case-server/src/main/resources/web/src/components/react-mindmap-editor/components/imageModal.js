import React from 'react';
import { Modal, Form, Input, Upload, Icon, Button, message } from 'antd';
import { uploadImage, getClipboardImage } from './imageUpload';

const ImageModal = (props) => {
  const defaultObj = props.minder.queryCommandValue('Image');
  const { getFieldDecorator } = props.form;
  const { baseUrl = '', uploadUrl = '' } = props;
  const [uploadedUrl, setUploadedUrl] = React.useState(defaultObj.url || '');
  const [busy, setBusy] = React.useState(false);
  const [titleLength, setTitleLength] = React.useState((defaultObj.title || '').length);
  const [uploadVersion, setUploadVersion] = React.useState(0);
  const uploadSequence = React.useRef(0);
  const alive = React.useRef(true);
  const active = () => alive.current && (!props.isEditorActive || props.isEditorActive());
  const track = promise => props.trackImageWork ? props.trackImageWork(promise) : promise;

  const checkImage = url => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => reject(new Error('图片地址无法加载，请确认地址指向图片文件'));
    image.src = url;
  });

  const onOk = () => {
    if (props.isUserInputAllowed && !props.isUserInputAllowed()) return;
    const { form, minder, onCancel } = props;
    form.validateFields(['title'], (err, values) => {
      if (err) {
        return;
      }
      if (!uploadedUrl) {
        message.error('请先上传或粘贴图片');
        return;
      }
      setBusy(true);
      track(checkImage(uploadedUrl).then(async () => {
        if (!active()) throw new Error('编辑器已关闭或失去操作权，图片未插入');
        await (props.insertImage ? props.insertImage(uploadedUrl, values.title) : minder.execCommand('image', uploadedUrl, values.title));
        if (active()) onCancel();
      })).catch(error => alive.current && message.error(error.message))
        .then(() => alive.current && setBusy(false));
    });
  };
  const selectImage = (file, success) => {
    if (props.isUserInputAllowed && !props.isUserInputAllowed()) return;
    const sequence = ++uploadSequence.current;
    setBusy(true);
    track(uploadImage(file, baseUrl, uploadUrl).then(url => checkImage(url).then(() => url))).then(url => {
      if (!active()) return;
      if (sequence !== uploadSequence.current) return;
      setUploadedUrl(url);
      if (success) success({ success: 1, data: [{ url }] });
    }).catch(error => {
      if (alive.current && sequence === uploadSequence.current) message.error(error.message);
    }).then(() => {
      if (alive.current && sequence === uploadSequence.current) setBusy(false);
    });
  };
  const onPaste = event => {
    const file = getClipboardImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    selectImage(file);
  };

  React.useEffect(() => {
    if (props.initialFile) selectImage(props.initialFile);
    return () => { alive.current = false; uploadSequence.current += 1; };
  }, []);

  return (
    <Modal
      title="插入图片"
      className="yuntu-modal"
      visible={props.visible}
      onOk={onOk}
      onCancel={props.onCancel}
      confirmLoading={busy}
      okButtonProps={{ disabled: busy }}
    >
      <Form layout="vertical">
        <Form.Item label="上传图片">
          <Upload key={uploadVersion} accept="image/*" showUploadList={false} disabled={busy}
            customRequest={({ file, onSuccess }) => selectImage(file, onSuccess)}>
            <Button aria-label="上传图片" disabled={busy}><Icon type="upload" />上传图片</Button>
          </Upload>
        </Form.Item>
        <Form.Item label="粘贴图片">
          <div aria-label="粘贴图片" role="textbox" tabIndex={0} onPaste={onPaste}
            style={{ minHeight: 80, padding: 16, border: '1px dashed #d9d9d9', borderRadius: 10, color: '#8c8c8c' }}>
            点击这里，按 Ctrl+V 粘贴图片
          </div>
        </Form.Item>
        {uploadedUrl && <Form.Item label="图片预览">
          <div className="mindmap-image-preview">
            <img aria-label="图片预览" src={uploadedUrl} alt="待插入图片预览"
              className="mindmap-image-preview-img" />
            <Button className="mindmap-image-preview-delete" icon="close" shape="circle"
              aria-label="删除已选图片" title="删除图片" disabled={busy} onClick={() => {
              uploadSequence.current += 1;
              setUploadedUrl('');
              setUploadVersion(version => version + 1);
            }} />
          </div>
        </Form.Item>}

        <Form.Item label="提示文本">
          {getFieldDecorator('title', {
            initialValue: defaultObj.title,
            rules: [{ max: 200, message: '提示文本最多 200 字' }],
          })(<Input className="mindmap-caption-input" maxLength={200} placeholder="选填：鼠标在图片上悬停时提示的文本"
            onChange={event => setTitleLength(event.target.value.length)}
            suffix={<span className="link-title-remaining">{Math.max(0, 200 - titleLength)}/200</span>} />)}
        </Form.Item>
      </Form>
    </Modal>
  );
};
const WrappedImageForm = Form.create({ name: 'image' })(ImageModal);
export default WrappedImageForm;
