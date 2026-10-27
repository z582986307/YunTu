import React from 'react';
import PropTypes from 'prop-types';
import io from './assets/socketio/socket.io.js';
import { message } from 'antd';
import {
    importMindMapProgressively,
    cancelMindMapImport,
    isMindMapReady,
} from './largeMindMap';
import { normalizeRightMindMap } from './executionPanelUtils';
import { shouldRecoverCachedContent } from './util/saveContent';
import { bundlePathFromHtml, isConfirmedDataStale } from './pageFreshness';
// import { AsyncStorage } from 'react-native-community/async-storage';

class Socket extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            ws: io(this.props.url, {
                ...props.wsParam,
                query: {
                    ...props.wsParam.query,
                    build: bundlePathFromHtml(Array.from(document.scripts || [])
                        .map(script => `<script src="${script.getAttribute('src') || ''}"></script>`).join('')),
                },
                autoConnect: false,
            }),
        };
        this.sendMessage = this.sendMessage.bind(this);
        this.setupSocket = this.setupSocket.bind(this);
        this.leaveListener = this.leaveListener.bind(this);
    }

    setupSocket() {
        var websocket = this.state.ws;

        websocket.on ('connect', () => {
            if (typeof this.props.onOpen === 'function') this.props.onOpen();
        });

        websocket.on ('reconnect', () => {
            websocket.disconnect();
        });

        websocket.on('disconnect', async () => {
            if (this.unmounted) return;
            if (this.props.onConnectionLost) this.props.onConnectionLost();
            const changed = await this.checkDeploymentVersion();
            if (this.unmounted) return;
            if (changed && typeof this.props.handlePlatformUpdate === 'function') this.props.handlePlatformUpdate();
            else if (typeof this.props.onClose === 'function') this.props.onClose();
            if (!this.skipCache && !this.isExecutionRecord() && !this.isSourceEditing() && isMindMapReady(this.props.wsMinder)) {
                try { localStorage.setItem(JSON.stringify(this.props.wsParam), JSON.stringify(this.props.wsMinder.exportJson())); } catch (error) { /* 安全降级 */ }
            }
        });

        websocket.on('connect_notify_event', evt => {
            if (typeof this.props.handleWsUserStat === 'function') this.props.handleWsUserStat(evt.message);
        });

        websocket.on('open_event', async evt => {
            if (this.unmounted || this.sourceDenied) return;
            try {
                const serverData = JSON.parse(evt.message || '{}');
                if (typeof this.props.handleServerSnapshot === 'function') this.props.handleServerSnapshot(evt.message, serverData.base);
                let data = normalizeRightMindMap(serverData);
                const cacheKey = JSON.stringify(this.props.wsParam);
                if (!this.isExecutionRecord() && !this.isSourceEditing()) {
                    try {
                        const cached = JSON.parse(localStorage.getItem(cacheKey));
                        if (shouldRecoverCachedContent(data, cached)) data = normalizeRightMindMap(cached);
                    } catch (error) { /* 缓存损坏时使用服务端内容 */ }
                }
                window.minderData = undefined;
                this.pendingImport = importMindMapProgressively(this.props.wsMinder, data);
                const result = await this.pendingImport;
                if (result.cancelled || this.unmounted || this.sourceDenied) return;
                window.minderData = data;
                this.expectedBase = this.props.wsMinder.getBase();
                try { localStorage.removeItem(cacheKey); } catch (error) { /* 安全降级 */ }
                if (typeof this.props.onImported === 'function') await this.props.onImported(data);
            } catch (error) {
                if (!this.unmounted) message.error('用例加载失败，请重新进入当前页面');
            }
        });

        websocket.on('save_ack_event', evt => {
            if (typeof this.props.handleSaveAck === 'function') this.props.handleSaveAck(evt.message);
        });

        websocket.on('source_case_updated', evt => {
            if (!this.unmounted && this.props.onSourceCaseUpdated) this.props.onSourceCaseUpdated(evt.message);
        });
        websocket.on('source_edit_denied', () => this.denySourceEditing());
        websocket.on('source_revision_event', async evt => {
            if (!(await this.waitForImport())) return;
            try {
                if (this.props.handleSourceRevision) this.props.handleSourceRevision(evt.message);
            } catch (error) {
                if (this.props.onFailure) this.props.onFailure();
            }
        });

        websocket.on('stale_data_event', () => {
            if (typeof this.props.handleDataStale === 'function') this.props.handleDataStale();
        });

        websocket.on('platform_update_event', () => {
            if (typeof this.props.handlePlatformUpdate === 'function') this.props.handlePlatformUpdate();
        });

        websocket.on('state_check_event', async evt => {
            if (!(await this.waitForImport())) return;
            if (this.props.isOwnEditPending && this.props.isOwnEditPending()) {
                this.checkAfterEditAck = true;
                return;
            }
            if (isConfirmedDataStale(this.props.wsMinder.getBase(), Number(evt.message)) &&
                typeof this.props.handleDataStale === 'function') this.props.handleDataStale();
        });

        websocket.on('edit_ack_event', async evt => {
            if (!(await this.waitForImport())) return;
            const recv = JSON.parse(evt.message || '{}');
            // 如果json解析没有root节点
            this.props.wsMinder.setStatus('readonly');
            const recvPatches = this.travere(recv);
            // const recvBase = recvPatches.filter((item) => item.path === '/base')[0]?.value;
            // const recvFromBase = recvPatches.filter((item) => item.path === '/base')[0]?.fromValue;
            try {
                this.props.wsMinder.applyPatches(recvPatches);
                if (typeof this.props.handleEditAck === 'function') this.props.handleEditAck();
                if (this.checkAfterEditAck) {
                    this.checkAfterEditAck = false;
                    this.requestStateCheck();
                }
            } catch(e) {
                alert('客户端接受应答消息异常，请刷新重试');
            }
            // this.props.wsMinder._status='nomal';
        });

        websocket.on('edit_notify_event', async evt => {
            if (!(await this.waitForImport())) return;
            const recv = JSON.parse(evt.message || '{}');
            // 如果json解析没有root节点
            try {
                this.props.wsMinder.setStatus('readonly');
                const recvPatches = this.travere(recv);
                this.props.wsMinder.applyPatches(recvPatches);
            } catch(e) {
                alert('客户端接受通知消息异常，请刷新重试');
            }
            
        });
        websocket.on('undo', async evt => {
            if (!(await this.waitForImport())) return;
            try {
                if (typeof this.props.handleUndoAck === 'function') {
                    this.props.handleUndoAck(evt.message);
                }
            } catch(e) {
                alert('客户端接受通知消息异常，请刷新重试');
            }
        })
        websocket.on('redo', async evt => {
            if (!(await this.waitForImport())) return;
            try {
                if (typeof this.props.handleRedoAck === 'function') {
                    this.props.handleRedoAck(evt.message);
                }
            } catch(e) {
                alert('客户端接受通知消息异常，请刷新重试');
            }
        })
        // message 0:加锁；1：解锁；2:加/解锁成功；3:加/解锁失败
        websocket.on('lock', evt => {
            if (this.isSourceEditing() && evt.message === '0') {
                this.denySourceEditing();
                return;
            }
            if (typeof this.props.handleLock === 'function') this.props.handleLock(evt.message);
        });

        websocket.on('connect_error', () => {
            if (this.props.onFailure) this.props.onFailure();
            websocket.disconnect();
        });

        websocket.on('warning', () => {
            if (this.props.onFailure) this.props.onFailure();
            else message.error('服务端处理变更失败，请刷新页面');
        });
    }

    denySourceEditing = () => {
        if (this.unmounted || this.sourceDenied) return;
        this.sourceDenied = true;
        this.skipCache = true;
        cancelMindMapImport(this.props.wsMinder);
        if (this.props.onSourceEditDenied) this.props.onSourceEditDenied();
    };

    waitForImport = async () => {
        const pending = this.pendingImport;
        if (!pending) return !this.unmounted && !this.sourceDenied;
        try {
            const result = await pending;
            return !this.unmounted && !this.sourceDenied && !result.cancelled && pending === this.pendingImport;
        } catch (error) {
            return false;
        }
    };

    travere = (arrPatches) => {
        var patches = [];
        for (var i = 0; i < arrPatches.length; i++) {
          if (arrPatches[i].op === undefined) {
            for (var j = 0; j < arrPatches[i].length; j++) {
              patches.push(arrPatches[i][j]);
            }
          } else {
            patches.push(arrPatches[i]);
          }
        }
        return patches;
    };

    checkDeploymentVersion = async () => {
        const current = bundlePathFromHtml(Array.from(document.scripts || [])
            .map(script => `<script src="${script.getAttribute('src') || ''}"></script>`).join(''));
        if (!current) return false;
        try {
            const response = await fetch(`/?freshness=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok) return false;
            const latest = bundlePathFromHtml(await response.text());
            return Boolean(latest && latest !== current);
        } catch (error) {
            return false;
        }
    };

    requestStateCheck = () => {
        if (this.state.ws.connected && isMindMapReady(this.props.wsMinder) && !this.skipCache) {
            this.sendMessage('state_check', { message: '' });
        }
    };

    checkFreshness = async () => {
        if (this.unmounted || this.skipCache || document.hidden) return;
        if (await this.checkDeploymentVersion()) {
            if (typeof this.props.handlePlatformUpdate === 'function') this.props.handlePlatformUpdate();
            return;
        }
        this.requestStateCheck();
    };

    sendMessage(type, message) {
        let websocket = this.state.ws;
        // var jsonObject = {userName: 'userName', message: message};
        websocket.emit(type, message);
    }

    isExecutionRecord = () => {
        const query = this.props.wsParam && this.props.wsParam.query;
        return Boolean(query && query.recordId && query.recordId !== 'undefined');
    };
    isSourceEditing = () => Boolean(this.props.wsParam && this.props.wsParam.query && this.props.wsParam.query.sourceTaskId);

    leaveListener(e) {
        e.preventDefault();
        e.returnValue = '请确认当前内容已保存后再离开页面';
        if (!this.skipCache && !this.isExecutionRecord() && !this.isSourceEditing() && isMindMapReady(this.props.wsMinder) && this.props.wsMinder.getBase() > 16) {
            try { localStorage.setItem(JSON.stringify(this.props.wsParam), JSON.stringify(this.props.wsMinder.exportJson())); } catch (error) { /* 安全降级 */ }
        }
    }

    componentDidMount() {
        this.setupSocket();
        this.state.ws.connect();
        window.addEventListener('beforeunload', this.leaveListener);
        window.addEventListener('focus', this.checkFreshness);
        document.addEventListener('visibilitychange', this.checkFreshness);
    }

    componentWillUnmount() {
        this.unmounted = true;
        cancelMindMapImport(this.props.wsMinder);
        window.removeEventListener('beforeunload', this.leaveListener);
        window.removeEventListener('focus', this.checkFreshness);
        document.removeEventListener('visibilitychange', this.checkFreshness);

        this.state.ws.off();
        this.state.ws.disconnect();
        this.pendingImport = null;
    }

    render() {
        return (<div></div>)
    }
}

Socket.propTypes = {
    url: PropTypes.string.isRequired,
    onMessage: PropTypes.func.isRequired,
    onOpen: PropTypes.func,
    onClose: PropTypes.func,
    handleLock: PropTypes.func,
    handleUndoAck: PropTypes.func,
    handleRedoAck: PropTypes.func,
    handleWsUserStat: PropTypes.func
}

export default Socket;
