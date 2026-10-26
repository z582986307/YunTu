package com.xiaoju.framework.handler;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.flipkart.zjsonpatch.JsonPatch;
import com.xiaoju.framework.util.JsonNodeOp;
import com.xiaoju.framework.util.PairWise;

import java.util.List;
import java.util.concurrent.ExecutorService;

public class CaseDesignIngressTask extends IngressTask{
    CaseDesignMessage data;

    public CaseDesignIngressTask(SocketIOClient client, SocketIOServer socketIOServer, RoomEntity room, ExecutorService executorEgressService, CaseDesignMessage data) {
        super(client, socketIOServer, room, executorEgressService);
        this.data = data;
    }

    @Override
    public void run() {
        synchronized (room) {
            applyDesign();
        }
    }

    private void applyDesign() {
        if (room.isStaleClient(client.getSessionId())) {
            executorEgressService.submit(new AckEgressTask("stale_data_event", PushMessage.builder().message("stale").build(), client));
            return;
        }
        if ((room.isLockedByClient() || RoomEntity.isSourceTaskClient(client)) && !room.lockByClient(client)) {
            executorEgressService.submit(new AckEgressTask("lock", PushMessage.builder().message("0").build(), client));
            return;
        }
        room.lock();
        String msgCode = data.getMethod();
        String nodeId = data.getNodeId();
        String content = data.getMessage();
        ClientEntity clientEntity = getRoomFromClient(client);
        String roomId = clientEntity.getRoomId();
        String caseContent = room.getCaseContent();
        ArrayNode patch = FACTORY.arrayNode();

        switch (msgCode) {

            case "pariwise" :
                List<String> pairWiseCases = PairWise.solution(content);
                if (pairWiseCases.size() == 0) {
                    LOGGER.error("未生成用例。");
                    break;
                }
                patch = JsonNodeOp.generatePatch(caseContent, nodeId, pairWiseCases);

                break;
            default:
                break;
        }

        try {
            if (patch.size() == 0) {
                return;
            }
            JsonNode target = JsonPatch.apply(patch, jsonMapper.readTree(caseContent));
            room.setCaseContent(target.toString());
            room.persistAcceptedEdit(client, caseContent);
            room.noteAcceptedEdit(client.getSessionId(), target.path("base").asInt());
//            BroadcastOperations broadcastOperations = socketIOServer.getRoomOperations(roomId);
            executorEgressService.submit(new NotifyEgressTask("edit_notify_event",
                    PushMessage.builder().message(patch.toString()).build(), socketIOServer.getRoomOperations(roomId)));

        } catch (Exception e) {
            room.setCaseContent(caseContent);
            LOGGER.warn("用例设计提交失败");
            executorEgressService.submit(new AckEgressTask("warning", PushMessage.builder().message("用例设计保存失败，请刷新后重试").build(), client));
            room.unlock();
        }

        room.unlock();
    }
}
