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
  if (!state || cancelled()) return false;
  const viewDuration = minder.getOption('viewAnimationDuration');
  const zoomDuration = minder.getOption('zoomAnimationDuration');
  minder.setOption('viewAnimationDuration', 0);
  minder.setOption('zoomAnimationDuration', 0);
  try {
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
      if (minder._pendingLayout) await minder._pendingLayout;
    }
    if (cancelled()) return false;
    minder.select(selected, true);
    const node = selected[0];
    const element = node && node.getRenderContainer && node.getRenderContainer().node;
    const dragger = minder.getViewDragger();
    if (element && state.anchor) {
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
