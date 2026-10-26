package com.xiaoju.framework.handler;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import java.util.concurrent.ExecutorService;

public class RedoIngressTask extends UndoIngressTask {

    public RedoIngressTask(SocketIOClient client, SocketIOServer socketIOServer, RoomEntity room, ExecutorService executorEgressService, PushMessage data) {
        super(client, socketIOServer, room, executorEgressService, data);
    }
    @Override
    public void run() {
        applyHistory("redo");
    }
}
