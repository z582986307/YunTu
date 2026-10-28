// 数据与布局全量保留，大图屏外 renderer 图形释放，避免隐藏 SVG 仍参与大规模 GC。
export const releaseNodeGraphics = node => {
  const container = node.rc;
  if (container && container.container) container.container.removeShape(container);
  node.rc = null;
  node._renderers = null;
  node.expanderRenderer = null;
};

// 平移/缩放事件内同步更新，不等待网络或异步补建节点。
export const createPaintGroups = minder => {
  const groups = [];
  const nodeGroups = new WeakMap();
  const connectionGroups = new WeakMap();
  const dirty = new Set();
  let frame = null;
  let disposed = false;
  let exportsInProgress = 0;
  let restoring = false;

  const restore = (entry, view) => {
    if (!minder._boundedRenderObjects) return;
    if (entry.connections) {
      entry.nodes.forEach(node => {
        if (!node.attached || node.isRoot()) return;
        const from = node.parent.getLayoutVertexOut();
        const to = node.getLayoutVertexIn();
        const visible = exportsInProgress || (Math.max(from.x, to.x) + 24 >= view.left && Math.min(from.x, to.x) - 24 <= view.right && Math.max(from.y, to.y) + 24 >= view.top && Math.min(from.y, to.y) - 24 <= view.bottom);
        if (!visible) {
          const old = node.getConnection();
          if (old && old.container) old.container.removeShape(old);
          node._connection = null;
          return;
        }
        if (node.getConnection()) return;
        // 初次导入仍在进行时，沿用连接线渲染器而不提前结束 loading。
        const connection = new window.kity.Path();
        node._connection = connection;
        entry.shape.addShape(connection);
        minder.updateConnect(node);
      });
      return;
    }
    const missing = entry.nodes.filter(node => node.attached && !node._renderers);
    if (!missing.length) return;
    restoring = true;
    try {
      entry.shape.node.style.display = '';
      missing.forEach(node => entry.shape.addShape(node.getRenderContainer()));
      minder.renderNodeBatch(missing);
      missing.forEach(node => minder.fire('layoutapply', { node, matrix: node.getGlobalLayoutTransform() }));
    } finally { restoring = false; }
  };

  const getView = () => {
    const box = minder.getViewDragger().getView();
    const paddingX = Math.max(300, box.width / 2);
    const paddingY = Math.max(300, box.height);
    return { left: box.left - paddingX, right: box.right + paddingX, top: box.top - paddingY, bottom: box.bottom + paddingY };
  };

  const measure = entry => {
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    entry.nodes.forEach(node => {
      if (!node.attached) return;
      let b = node.getLayoutBox();
      if (entry.connections && node.parent) {
        const from = node.parent.getLayoutVertexOut();
        const to = node.getLayoutVertexIn();
        b = { left: Math.min(from.x, to.x), right: Math.max(from.x, to.x), top: Math.min(from.y, to.y), bottom: Math.max(from.y, to.y) };
      }
      // 包含边框、展开按钮以及连接线拐角，避免边缘被提前裁掉。
      box.left = Math.min(box.left, b.left - 24);
      box.right = Math.max(box.right, b.right + 24);
      box.top = Math.min(box.top, b.top - 24);
      box.bottom = Math.max(box.bottom, b.bottom + 24);
    });
    entry.box = box;
  };

  const apply = (entry, view) => {
    const b = entry.box;
    const selected = minder.getSelectedNodes().some(node => nodeGroups.get(node) === entry);
    const visible = exportsInProgress || selected || (b.right >= view.left && b.left <= view.right && b.bottom >= view.top && b.top <= view.bottom);
    const display = visible ? '' : 'none';
    if (entry.shape.node.style.display !== display) entry.shape.node.style.display = display;
    if (visible) restore(entry, view);
    else if (minder._boundedRenderObjects) entry.nodes.forEach(node => {
      if (!entry.connections) releaseNodeGraphics(node);
      else {
        const connection = node.getConnection();
        if (connection && connection.container) connection.container.removeShape(connection);
        node._connection = null;
      }
    });
  };

  const update = () => {
    if (disposed) return;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    dirty.forEach(measure);
    dirty.clear();
    const view = getView();
    groups.forEach(entry => apply(entry, view));
  };

  const changed = event => {
    if (minder._progressiveImporting || disposed || restoring) return;
    const node = event.node;
    if (!node) return;
    const mark = entry => { if (entry) dirty.add(entry); };
    mark(nodeGroups.get(node));
    mark(connectionGroups.get(node));
    node.children.forEach(child => mark(connectionGroups.get(child)));
    if (frame === null) frame = requestAnimationFrame(update);
  };

  const beforeCommand = event => {
    if (event.commandName !== 'camera') return;
    const target = event.commandArgs[0] || minder.getRoot();
    const entry = nodeGroups.get(target);
    // Camera 沿用原有 SVG 包围盒算法，读取前先恢复目标分组。
    if (entry) {
      entry.shape.node.style.display = '';
      restore(entry);
    }
  };

  const removed = event => {
    const deleted = new Set();
    const affected = new Set();
    event.node.traverse(node => {
      deleted.add(node);
      [nodeGroups, connectionGroups].forEach(index => {
        const entry = index.get(node);
        if (entry) affected.add(entry);
        index.delete(node);
      });
    });
    affected.forEach(entry => {
      entry.nodes = entry.nodes.filter(node => !deleted.has(node));
      dirty.add(entry);
    });
    if (frame === null) frame = requestAnimationFrame(update);
  };

  minder.on('viewchange layout layoutallfinish resize selectionchange', update);
  minder.on('layoutapply noderender', changed);
  minder.on('beforeExecCommand', beforeCommand);
  minder.on('noderemove', removed);

  return {
    getBounds() {
      const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      // 绘制分组可能不含导入后新增节点；滚动范围读取当前完整树的可见布局。
      minder.getRoot().traverse(node => {
        if (!node.attached || (node.parent && !node.parent.isExpanded())) return;
        const box = node.getLayoutBox();
        bounds.left = Math.min(bounds.left, box.left - 24);
        bounds.top = Math.min(bounds.top, box.top - 24);
        bounds.right = Math.max(bounds.right, box.right + 24);
        bounds.bottom = Math.max(bounds.bottom, box.bottom + 24);
      });
      return Number.isFinite(bounds.left) ? bounds : null;
    },
    mount(nodes) {
      const view = getView();
      [false, true].forEach(connections => {
        const shape = new window.kity.Group();
        const entry = { shape, nodes, connections };
        const index = connections ? connectionGroups : nodeGroups;
        nodes.forEach(node => {
          const child = connections ? node.getConnection() : node.rc;
          if (child) shape.addShape(child);
          index.set(node, entry);
        });
        (connections ? minder.getConnectContainer() : minder.getRenderContainer()).addShape(shape);
        measure(entry);
        apply(entry, view);
        groups.push(entry);
        minder._progressiveGroups.push(shape);
      });
    },
    revealForExport() {
      exportsInProgress++;
      update();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        exportsInProgress--;
        update();
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (minder._layoutTask) minder._layoutTask.cancelled = true;
      minder._scheduleLayout = null;
      if (frame !== null) cancelAnimationFrame(frame);
      minder.off('viewchange layout layoutallfinish resize selectionchange', update);
      minder.off('layoutapply noderender', changed);
      minder.off('beforeExecCommand', beforeCommand);
      minder.off('noderemove', removed);
      dirty.clear();
      groups.length = 0;
    },
  };
};
