export default function createSocketFixture() {
  const handlers = {};
  const socket = {
    on(name, callback) { handlers[name] = callback; return socket; },
    off(name) { delete handlers[name]; return socket; },
    connect() {
      setTimeout(() => {
        if (handlers.connect) handlers.connect();
        if (handlers.open_event) handlers.open_event({ message: JSON.stringify(window.__fixtureData) });
      }, 0);
    },
    disconnect() { if (handlers.disconnect) handlers.disconnect(); },
    emit(name, payload) { window.__sentMessages.push({ name, payload }); },
  };
  window.__testSocket = { receive: (name, event) => handlers[name] && handlers[name](event) };
  return socket;
}
