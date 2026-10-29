import jsonDiff from 'fast-json-patch';

export default function createSocketFixture() {
  const handlers = {};
  let snapshot;
  const reply = (name, message) => handlers[name] && handlers[name]({ message });
  const socket = {
    on(name, callback) { handlers[name] = callback; return socket; },
    off(name) { delete handlers[name]; return socket; },
    connect() {
      if (window.__fixtureAcknowledge) {
        socket.connected = true;
        snapshot = JSON.parse(JSON.stringify(window.__fixtureData));
      }
      setTimeout(() => {
        if (handlers.connect) handlers.connect();
        if (handlers.open_event) handlers.open_event({ message: JSON.stringify(window.__fixtureData) });
      }, 0);
    },
    disconnect() { if (handlers.disconnect) handlers.disconnect(); },
    emit(name, payload) {
      window.__sentMessages.push({ name, payload });
      // 仅显式开启的本地验收模拟版本应答；默认夹具行为完全不变。
      if (!window.__fixtureAcknowledge) return;
      setTimeout(() => {
        try {
          if (name === 'edit' || name === 'undo' || name === 'redo') {
            const base = snapshot.base || 0;
            const patches = JSON.parse(name === 'edit' ? payload.patch : payload.message);
            const flattened = [].concat(...patches);
            snapshot = jsonDiff.applyPatch(snapshot, flattened, true, false).newDocument;
            snapshot.base = base + 1;
            const version = JSON.stringify([{ op: 'replace', path: '/base', value: snapshot.base }]);
            reply(name === 'edit' ? 'edit_ack_event' : 'source_revision_event', version);
          } else if (name === 'save') reply('save_ack_event', 'ok');
          else if (name === 'state_check') reply('state_check_event', String(snapshot.base || 0));
          window.__fixtureSavedSnapshot = snapshot;
        } catch (error) {
          window.__fixtureTransportError = error.message;
        }
      }, 0);
    },
  };
  window.__testSocket = { receive: (name, event) => handlers[name] && handlers[name](event) };
  return socket;
}
