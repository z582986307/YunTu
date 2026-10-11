import React, { Component } from 'react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const getScrollAxis = (start, end, viewStart, viewSize, trackSize) => {
  const min = Math.min(start, viewStart);
  const max = Math.max(end - viewSize, viewStart);
  const range = max - min;
  const thumbSize = range ? clamp(trackSize * viewSize / (range + viewSize), Math.min(28, trackSize), trackSize) : trackSize;
  const travel = trackSize - thumbSize;
  return {
    size: thumbSize,
    offset: range ? (viewStart - min) / range * travel : 0,
    position: ratio => min + clamp(ratio, 0, 1) * range,
    travel,
  };
};

class MindMapScrollbars extends Component {
  state = { visible: false, view: null, bounds: null };
  hideTimer = null;
  frame = null;
  drag = null;

  componentDidMount() {
    const { minder } = this.props;
    minder.on('viewchange', this.onViewChange);
    minder.on('layoutallfinish layout resize', this.onLayoutChange);
    this.onLayoutChange();
  }

  componentWillUnmount() {
    const { minder } = this.props;
    minder.off('viewchange', this.onViewChange);
    minder.off('layoutallfinish layout resize', this.onLayoutChange);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    clearTimeout(this.hideTimer);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }

  readBounds = () => {
    const { minder } = this.props;
    if (minder._paintGroups) return minder._paintGroups.getBounds();
    const root = minder.getRoot();
    if (!root) return null;
    const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    root.traverse(node => {
      if (!node.attached || (node.parent && !node.parent.isExpanded())) return;
      const box = node.getLayoutBox();
      bounds.left = Math.min(bounds.left, box.left - 24);
      bounds.top = Math.min(bounds.top, box.top - 24);
      bounds.right = Math.max(bounds.right, box.right + 24);
      bounds.bottom = Math.max(bounds.bottom, box.bottom + 24);
    });
    return Number.isFinite(bounds.left) ? bounds : null;
  };

  updateView = () => {
    this.frame = null;
    const view = this.props.minder.getViewDragger().getView();
    this.setState({ view });
  };

  onLayoutChange = () => {
    this.setState({ bounds: this.readBounds() });
    if (this.frame === null) this.frame = requestAnimationFrame(this.updateView);
  };

  onViewChange = () => {
    if (this.frame === null) this.frame = requestAnimationFrame(this.updateView);
    if (!this.state.visible) this.setState({ visible: true });
    clearTimeout(this.hideTimer);
    if (!this.drag) this.hideTimer = setTimeout(() => this.setState({ visible: false }), 1100);
  };

  scrollTo = (axis, position) => {
    const { minder } = this.props;
    const dragger = minder.getViewDragger();
    const view = dragger.getView();
    const movement = dragger.getMovement();
    dragger.moveTo(new window.kity.Point(
      movement.x + (axis === 'x' ? view.left - position : 0),
      movement.y + (axis === 'y' ? view.top - position : 0),
    ));
  };

  onPointerDown = (axis, event) => {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    const { bounds, view } = this.state;
    if (!bounds || !view) return;
    const length = axis === 'x' ? rect.width : rect.height;
    const geometry = axis === 'x'
      ? getScrollAxis(bounds.left, bounds.right, view.left, view.width, length)
      : getScrollAxis(bounds.top, bounds.bottom, view.top, view.height, length);
    const pointer = axis === 'x' ? event.clientX - rect.left : event.clientY - rect.top;
    const thumbStart = geometry.offset;
    const insideThumb = pointer >= thumbStart && pointer <= thumbStart + geometry.size;
    this.drag = { axis, rect, grip: insideThumb ? pointer - thumbStart : geometry.size / 2 };
    this.onPointerMove(event);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  onPointerMove = event => {
    if (!this.drag) return;
    const { axis, rect, grip } = this.drag;
    const { bounds } = this.state;
    const view = this.props.minder.getViewDragger().getView();
    const length = axis === 'x' ? rect.width : rect.height;
    const geometry = axis === 'x'
      ? getScrollAxis(bounds.left, bounds.right, view.left, view.width, length)
      : getScrollAxis(bounds.top, bounds.bottom, view.top, view.height, length);
    const coordinate = axis === 'x' ? event.clientX - rect.left : event.clientY - rect.top;
    const ratio = geometry.travel ? (coordinate - grip) / geometry.travel : 0;
    this.scrollTo(axis, geometry.position(ratio));
  };

  onPointerUp = () => {
    this.drag = null;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.onViewChange();
  };

  onKeyDown = (axis, event) => {
    const { bounds } = this.state;
    if (!bounds) return;
    const view = this.props.minder.getViewDragger().getView();
    const horizontal = axis === 'x';
    const start = horizontal ? bounds.left : bounds.top;
    const end = horizontal ? bounds.right - view.width : bounds.bottom - view.height;
    const current = horizontal ? view.left : view.top;
    const page = horizontal ? view.width : view.height;
    let next;
    if (event.key === 'Home') next = start;
    else if (event.key === 'End') next = end;
    else if (event.key === 'PageUp') next = current - page;
    else if (event.key === 'PageDown') next = current + page;
    else if (event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp')) next = current - page / 10;
    else if (event.key === (horizontal ? 'ArrowRight' : 'ArrowDown')) next = current + page / 10;
    else return;
    event.preventDefault();
    this.scrollTo(axis, clamp(next, start, end));
  };

  render() {
    const { visible, view, bounds } = this.state;
    if (!view || !bounds) return null;
    const target = this.props.minder.getRenderTarget();
    const x = getScrollAxis(bounds.left, bounds.right, view.left, view.width, Math.max(0, target.clientWidth - 28));
    const y = getScrollAxis(bounds.top, bounds.bottom, view.top, view.height, Math.max(0, target.clientHeight - 28));
    return (
      <div className={`mindmap-scrollbars${visible ? ' visible' : ''}`}>
        {x.travel > 0 && <div className="mindmap-scroll-track horizontal" role="scrollbar" tabIndex={0} aria-label="脑图横向滚动" aria-orientation="horizontal" aria-valuenow={Math.round(x.offset / x.travel * 100)} aria-valuemin={0} aria-valuemax={100} onKeyDown={event => this.onKeyDown('x', event)} onPointerDown={event => this.onPointerDown('x', event)}>
          <span className="mindmap-scroll-thumb" style={{ width: x.size, transform: `translateX(${x.offset}px)` }} />
        </div>}
        {y.travel > 0 && <div className="mindmap-scroll-track vertical" role="scrollbar" tabIndex={0} aria-label="脑图纵向滚动" aria-orientation="vertical" aria-valuenow={Math.round(y.offset / y.travel * 100)} aria-valuemin={0} aria-valuemax={100} onKeyDown={event => this.onKeyDown('y', event)} onPointerDown={event => this.onPointerDown('y', event)}>
          <span className="mindmap-scroll-thumb" style={{ height: y.size, transform: `translateY(${y.offset}px)` }} />
        </div>}
      </div>
    );
  }
}

export default MindMapScrollbars;
