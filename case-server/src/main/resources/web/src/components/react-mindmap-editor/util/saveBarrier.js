// 只由真实服务端确认完成保存；超时仅失败，不推测成功。
export default class SaveBarrier {
  constructor(timeout = 30000, onSettled) {
    this.timeout = timeout;
    this.onSettled = onSettled;
    this.uploads = new Set();
    this.waiters = new Set();
  }

  track(promise) {
    this.uploadError = null;
    const tracked = Promise.resolve(promise).catch(error => {
      this.uploadError = error;
      throw error;
    }).then(value => {
      this.uploads.delete(tracked);
      this.notify();
      return value;
    }, error => {
      this.uploads.delete(tracked);
      this.notify();
      throw error;
    });
    this.uploads.add(tracked);
    return tracked;
  }

  async waitForUploads() {
    await this.waitUntil(() => this.uploads.size === 0);
    if (this.uploadError) throw this.uploadError;
  }

  waitUntil(ready) {
    if (this.error) return Promise.reject(this.error);
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = { ready, resolve, reject };
      waiter.timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error('等待变更确认超时，请检查连接后重试'));
      }, this.timeout);
      this.waiters.add(waiter);
    });
  }

  notify() {
    this.waiters.forEach(waiter => {
      if (!waiter.ready()) return;
      clearTimeout(waiter.timer);
      this.waiters.delete(waiter);
      waiter.resolve();
    });
  }

  save(prepare, request) {
    if (this.pending) return this.pending;
    if (this.error) return Promise.reject(this.error);
    this.pending = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    const pending = this.pending;
    this.timer = setTimeout(() => this.fail(new Error('保存确认超时，请检查连接后重试')), this.timeout);
    Promise.resolve().then(prepare).then(() => {
      if (this.pending !== pending) return;
      return this.waitUntil(() => !this.orphanedAck);
    }).then(() => {
      if (this.pending !== pending) return;
      this.awaitingAck = true;
      request();
    }).catch(error => { if (this.pending === pending) this.finish(error); });
    return pending;
  }

  ack(result) {
    // 协议没有请求 ID；超时请求的迟到确认必须先排空，不能兑现后来的保存。
    if (this.orphanedAck) {
      this.orphanedAck = false;
      this.notify();
      return false;
    }
    if (!this.awaitingAck) return false;
    this.finish(result === 'ok' ? null : new Error(result === 'conflict'
      ? '当前数据已变更，保存未完成' : '保存失败，请重试'));
    return true;
  }

  finish(error) {
    if (!this.pending) return;
    clearTimeout(this.timer);
    const settle = error ? this.reject : this.resolve;
    this.pending = null;
    this.awaitingAck = false;
    this.resolve = this.reject = null;
    settle(error);
    if (this.onSettled) this.onSettled(error);
  }

  fail(error = new Error('连接已关闭，保存未完成'), terminal = false) {
    if (terminal) this.error = error;
    if (this.awaitingAck) this.orphanedAck = true;
    this.finish(error);
    this.waiters.forEach(waiter => {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    });
    this.waiters.clear();
  }
}
