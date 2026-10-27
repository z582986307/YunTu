/* eslint-env jest */
import SaveBarrier from '../src/components/react-mindmap-editor/util/saveBarrier';

const tick = () => Promise.resolve().then(() => Promise.resolve());

test('保存等待在途编辑与上传完成，并且只有真实成功确认才返回', async () => {
  const barrier = new SaveBarrier(1000);
  let edits = 1;
  let finishUpload;
  barrier.track(new Promise(resolve => { finishUpload = resolve; }));
  let requests = 0;
  const pending = barrier.save(async () => {
    await barrier.waitForUploads();
    await barrier.waitUntil(() => edits === 0);
  }, () => { requests += 1; });
  expect(barrier.save(() => {}, () => {})).toBe(pending);
  await tick();
  expect(requests).toBe(0);
  finishUpload();
  await tick();
  expect(requests).toBe(0);
  edits = 0;
  barrier.notify();
  await tick();
  expect(requests).toBe(1);
  let returned = false;
  pending.then(() => { returned = true; });
  await tick();
  expect(returned).toBe(false);
  barrier.ack('ok');
  await pending;
  expect(returned).toBe(true);
});

test.each(['conflict', 'error'])('保存确认 %s 必须拒绝，不能返回成功', async result => {
  const barrier = new SaveBarrier(1000);
  const pending = barrier.save(() => {}, () => {});
  await tick();
  barrier.ack(result);
  await expect(pending).rejects.toThrow();
});

test('断线和卸载立即拒绝等待中的保存及历史等待', async () => {
  const barrier = new SaveBarrier(1000);
  const pending = barrier.save(() => barrier.waitUntil(() => false), () => {});
  await tick();
  barrier.fail(new Error('连接已断开'));
  await expect(pending).rejects.toThrow('连接已断开');
});

test('上传失败保留失败状态，不能跳过后直接结束编辑', async () => {
  const barrier = new SaveBarrier(1000);
  await barrier.track(Promise.reject(new Error('图片上传失败'))).catch(() => {});
  await expect(barrier.save(() => barrier.waitForUploads(), () => {})).rejects.toThrow('图片上传失败');
});

test('保存超时明确失败', async () => {
  jest.useFakeTimers();
  const barrier = new SaveBarrier(20);
  const pending = barrier.save(() => {}, () => {});
  const rejection = expect(pending).rejects.toThrow('超时');
  jest.advanceTimersByTime(21);
  await rejection;
  jest.useRealTimers();
});
