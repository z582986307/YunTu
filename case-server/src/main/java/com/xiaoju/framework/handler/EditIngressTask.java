package com.xiaoju.framework.handler;

import com.corundumstudio.socketio.BroadcastOperations;
import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.flipkart.zjsonpatch.JsonDiff;
import com.flipkart.zjsonpatch.JsonPatch;

import java.util.EnumSet;
import java.util.concurrent.ExecutorService;

import static com.flipkart.zjsonpatch.DiffFlags.ADD_ORIGINAL_VALUE_ON_REPLACE;
import static com.flipkart.zjsonpatch.DiffFlags.OMIT_MOVE_OPERATION;

public class EditIngressTask extends IngressTask {
    EditMessage data;

    public EditIngressTask(SocketIOClient client, SocketIOServer socketIOServer, RoomEntity room, ExecutorService executorEgressService, EditMessage data) {
        super(client, socketIOServer, room, executorEgressService);
        this.data = data;
    }

    @Override
    public void run() {
        synchronized (room) {
            applyEdit();
        }
    }

    private void applyEdit() {
        room.lock();
        ClientEntity clientEntity = getRoomFromClient(client);
        String roomId = clientEntity.getRoomId();

        BroadcastOperations broadcastOperations = socketIOServer.getRoomOperations(roomId);

        try {
            if (room.isStaleClient(client.getSessionId())) {
                executorEgressService.submit(new AckEgressTask("stale_data_event",
                        PushMessage.builder().message("stale").build(), client));
                return;
            }
            if ((room.isLockedByClient() || RoomEntity.isSourceTaskClient(client)) && !room.lockByClient(client)) {
                executorEgressService.submit(new AckEgressTask("lock", PushMessage.builder().message("0").build(), client));
                return;
            }
            ArrayNode patch = (ArrayNode) jsonMapper.readTree(data.getPatch());
            JsonNode roomContent = jsonMapper.readTree(room.getCaseContent());
            int serverCaseCurrentVersion = roomContent.get("base").asInt();
            int serverCaseExpectVersion = serverCaseCurrentVersion + 1;

            ArrayNode patchNew = patchTraverse(patch);
            ObjectNode basePatch = FACTORY.objectNode();
            basePatch.put("op", "replace");
            basePatch.put("path", "/base");
            basePatch.put("value", serverCaseExpectVersion);
            patchNew.add(basePatch);

            JsonNode roomContentNew;
            ArrayNode patchAck;

            boolean patchOnly = data.getCaseContent() == null || data.getCaseContent().isEmpty();
            if (serverCaseCurrentVersion < data.getCaseVersion() ||
                    (serverCaseCurrentVersion > data.getCaseVersion() &&
                            room.hasForeignEditSince(client.getSessionId(), data.getCaseVersion()))) {
                LOGGER.warn("拒绝落后页面的编辑. server: {}, client: {}", serverCaseCurrentVersion, data.getCaseVersion());
                executorEgressService.submit(new AckEgressTask("stale_data_event",
                        PushMessage.builder().message("stale").build(), client));
                return;
            }
            if (patchOnly) {
                roomContentNew = JsonPatch.apply(patchNew, roomContent);
                patchAck = FACTORY.arrayNode();
                patchAck.add(basePatch);
            } else if (serverCaseCurrentVersion > data.getCaseVersion()) { // 同一标签尚未收到前一次编辑应答
                LOGGER.warn("version of case in memory is bigger than client. version is: " + roomContent.get("base").asInt() + ", client version: " + data.getCaseVersion());
                roomContentNew = JsonPatch.apply(patchNew, roomContent);

                patchAck = (ArrayNode) JsonDiff.asJson(jsonMapper.readTree(data.getCaseContent()), roomContentNew, EnumSet.of(ADD_ORIGINAL_VALUE_ON_REPLACE, OMIT_MOVE_OPERATION));
//                    client.sendEvent("edit_ack_event", PushMessage.builder().message(patchAck.toString()).build(), PushMessage.builder().message(patchNew.toString()).build());
//                    broadcastOperations.sendEvent("edit_notify_event", client, PushMessage.builder().message(patchNew.toString()).build());
            } else { // 版本相同，只应用本次补丁，不用客户端快照覆盖其他数据
                roomContentNew = JsonPatch.apply(patchNew, roomContent);
                patchAck = FACTORY.arrayNode();
                patchAck.add(basePatch);
            }

            room.setCaseContent(roomContentNew.toString());
            room.persistAcceptedEdit(client, roomContent.toString());
            room.noteAcceptedEdit(client.getSessionId(), serverCaseExpectVersion);
            executorEgressService.submit(new AckEgressTask("edit_ack_event", PushMessage.builder().message(patchAck.toString()).build(), client));
            executorEgressService.submit(new NotifyExcludeEgressTask("edit_notify_event", PushMessage.builder().message(patchNew.toString()).build(), client, broadcastOperations));

        } catch (Exception e) {
            LOGGER.error("json 操作失败。", e);
            executorEgressService.submit(new AckEgressTask("warning", PushMessage.builder().message("可能存在编辑冲突，请刷新重试.").build(), client));
//            client.sendEvent("warning", PushMessage.builder().message("可能存在编辑冲突，请刷新重试.").build());
        } finally {
            room.unlock();
        }
    }

}
