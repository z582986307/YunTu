const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y)
  ? { x: value.x, y: value.y } : null;
const ids = value => Array.isArray(value) && value.length <= 10000 &&
  value.every(id => typeof id === 'string' && id.length <= 200);

export const validateViewState = value => {
  if (!value || !ids(value.selectedIds) || !ids(value.ancestorIds || []) ||
      !Number.isFinite(value.zoom) || value.zoom <= 0 || value.zoom > 1000) return null;
  return { selectedIds: value.selectedIds, ancestorIds: value.ancestorIds || [], zoom: value.zoom,
    ...(point(value.anchor) ? { anchor: point(value.anchor) } : {}),
    ...(point(value.movement) ? { movement: point(value.movement) } : {}) };
};

export const captureViewState = (minder, container) => {
  if (!minder || !container) return null;
  const nodes = minder.getSelectedNodes();
  const node = nodes[0];
  const ancestorIds = [];
  for (let parent = node && node.parent; parent; parent = parent.parent) ancestorIds.push(parent.getData('id'));
  const element = node && node.getRenderContainer().node;
  const bounds = element && element.getBoundingClientRect();
  const canvas = container.getBoundingClientRect();
  return validateViewState({ selectedIds: nodes.map(item => item.getData('id')), ancestorIds,
    zoom: minder.queryCommandValue('Zoom'),
    anchor: bounds ? { x: bounds.left - canvas.left, y: bounds.top - canvas.top } : null,
    movement: point(minder.getViewDragger().getMovement()) });
};

export const restoreViewState = async (minder, container, value, cancelled = () => false) => {
  const state = validateViewState(value);
  if (!state || cancelled() || minder._restoringViewState) return false;
  const token = {};
  minder._restoringViewState = token;
  const stopped = () => cancelled() || minder._destroyed;
  let observedLayout;
  let layoutError;
  const waitForLayout = async () => {
    while (!stopped()) {
      const pending = minder._pendingLayout;
      const completion = minder._viewLayoutCompletion;
      if (layoutError) throw layoutError;
      if (pending && pending !== observedLayout) {
        observedLayout = pending;
        pending.then(() => {}, error => { layoutError = error; });
      }
      if (!pending && (!completion || completion.finished)) return true;
      // RAF 只检查生产完成条件；不把经过的帧数/毫秒数当作成功。
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return false;
  };
  const dragger = minder.getViewDragger();
  const stopMovement = () => {
    const timeline = dragger.timeline && dragger.timeline();
    if (timeline) {
      // kity.stop 会写入终点，但不会触发 finish，所以同时清除旧 timeline 引用。
      timeline.stop();
      dragger._moveTimeline = null;
    }
  };
  const viewDuration = minder.getOption('viewAnimationDuration');
  const zoomDuration = minder.getOption('zoomAnimationDuration');
  const layoutDuration = minder.getOption('layoutAnimationDuration');
  minder.setOption('viewAnimationDuration', 0);
  minder.setOption('zoomAnimationDuration', 0);
  try {
    stopMovement();
    if (!(await waitForLayout())) return false;
    minder.setOption('layoutAnimationDuration', 0);
    minder.execCommand('Zoom', state.zoom);
    let selected = state.selectedIds.map(id => minder.getNodeById(id)).filter(Boolean);
    if (!selected.length && state.selectedIds.length) {
      selected = [state.ancestorIds.map(id => minder.getNodeById(id)).find(Boolean) || minder.getRoot()];
    }
    let expanded = false;
    selected.forEach(node => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (!parent.isExpanded()) { parent.expand(); expanded = true; }
      }
    });
    if (expanded) {
      minder.layout(0);
      if (!(await waitForLayout())) return false;
    }
    if (stopped()) return false;
    minder.select(selected, true);
    const node = selected[0];
    const element = node && node.getRenderContainer && node.getRenderContainer().node;
    // select 的真实 selectionchange 同步恢复被虚拟绘制释放的目标分组后才测量。
    if (element && element.isConnected !== false && state.anchor) {
      const bounds = element.getBoundingClientRect();
      const canvas = container.getBoundingClientRect();
      const scale = state.zoom / 100;
      dragger.move({ x: (state.anchor.x - bounds.left + canvas.left) / scale,
        y: (state.anchor.y - bounds.top + canvas.top) / scale }, 0);
    } else if (state.movement) {
      const current = dragger.getMovement();
      dragger.move({ x: state.movement.x - current.x, y: state.movement.y - current.y }, 0);
    }
    return true;
  } finally {
    minder.setOption('viewAnimationDuration', viewDuration);
    minder.setOption('zoomAnimationDuration', zoomDuration);
    minder.setOption('layoutAnimationDuration', layoutDuration);
    if (minder._restoringViewState === token) delete minder._restoringViewState;
  }
};

export const readViewState = (storage, key) => {
  try { return validateViewState(JSON.parse(storage.getItem(key))); } catch (error) { return null; }
};
export const writeViewState = (storage, key, state) => {
  try {
    const safe = validateViewState(state);
    if (safe) storage.setItem(key, JSON.stringify(safe));
  } catch (error) { /* 存储不可用不影响保存与当前会话位置恢复。 */ }
};
