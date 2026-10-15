import React from 'react';
import PropTypes from 'prop-types';
import io from './assets/socketio/socket.io.js';
import { notification } from 'antd';
import {
    importMindMapProgressively,
    cancelMindMapImport,
    isMindMapReady,
} from './largeMindMap';
import { normalizeRightMindMap } from './executionPanelUtils';
// import { AsyncStorage } from 'react-native-community/async-storage';

class Socket extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            ws: io(this.props.url, { ...props.wsParam, autoConnect: false }),
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
            notification.error({ message: 'Version of client is not equal to server, please refresh.'});
        });

        websocket.on('disconnect', () => {
            if (typeof this.props.onClose === 'function') this.props.onClose();
            console.log('disconnect happened.')
            if (!this.isExecutionRecord() && isMindMapReady(this.props.wsMinder)) {
                localStorage.setItem(JSON.stringify(this.props.wsParam), JSON.stringify(this.props.wsMinder.exportJson()));
            }
        });

        websocket.on('connect_notify_event', evt => {
            console.log('connect notify ', evt.message);
            if (typeof this.props.handleWsUserStat === 'function') this.props.handleWsUserStat(evt.message);
        });

        websocket.on('open_event', async evt => {
            try {
                let data = normalizeRightMindMap(JSON.parse(evt.message || '{}'));
                const cacheKey = JSON.stringify(this.props.wsParam);
                if (!this.isExecutionRecord()) {
                    try {
                        const cached = JSON.parse(localStorage.getItem(cacheKey));
                        if (cached && cached.root && !(data.base > cached.base)) data = normalizeRightMindMap(cached);
                    } catch (error) { /* 缓存损坏时使用服务端内容 */ }
                }
                window.minderData = undefined;
                this.pendingImport = importMindMapProgressively(this.props.wsMinder, data);
                const result = await this.pendingImport;
                if (result.cancelled || this.unmounted) return;
                window.minderData = data;
                this.expectedBase = this.props.wsMinder.getBase();
                localStorage.removeItem(cacheKey);
            } catch (error) {
                if (!this.unmounted) notification.error({ message: '用例加载失败，请重新进入当前页面' });
            }
        });

        websocket.on('save_ack_event', evt => {
            if (typeof this.props.handleSaveAck === 'function') this.props.handleSaveAck(evt.message);
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
            console.log('undo info', evt.message);
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
            console.log('redo info', evt.message);
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
            console.log('lock info', evt.message);
            if (typeof this.props.handleLock === 'function') this.props.handleLock(evt.message);
        });

        websocket.on('connect_error', e => {
            console.log('connect_error', e);
            websocket.disconnect();
        });

        websocket.on('warning', e => {
            notification.error({ message: 'server process patch failed, please refresh'});
        });
    }

    waitForImport = async () => {
        const pending = this.pendingImport;
        if (!pending) return !this.unmounted;
        try {
            const result = await pending;
            return !this.unmounted && !result.cancelled && pending === this.pendingImport;
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

    sendMessage(type, message) {
        let websocket = this.state.ws;
        // var jsonObject = {userName: 'userName', message: message};
        websocket.emit(type, message);
    }

    isExecutionRecord = () => {
        const query = this.props.wsParam && this.props.wsParam.query;
        return Boolean(query && query.recordId && query.recordId !== 'undefined');
    };

    leaveListener(e) {
        e.preventDefault();
        e.returnValue = '内容将被存储到缓存，下次打开相同用例优先从缓存获取！';
        if (!this.isExecutionRecord() && isMindMapReady(this.props.wsMinder) && this.props.wsMinder.getBase() > 16) {
            localStorage.setItem(JSON.stringify(this.props.wsParam), JSON.stringify(this.props.wsMinder.exportJson()));
        }
    }

    componentDidMount() {
        console.log(' -- componentDidMount -- ')
        this.setupSocket();
        this.state.ws.connect();
        window.addEventListener('beforeunload', this.leaveListener);
    }

    componentWillUnmount() {
        this.unmounted = true;
        cancelMindMapImport(this.props.wsMinder);
        window.removeEventListener('beforeunload', this.leaveListener);

        this.state.ws.disconnect();
        console.log(' -- componentWillUnmount -- ');
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
