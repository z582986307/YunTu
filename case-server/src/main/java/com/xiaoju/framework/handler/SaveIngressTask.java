package com.xiaoju.framework.handler;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flipkart.zjsonpatch.JsonDiff;
import com.xiaoju.framework.entity.persistent.CaseBackup;
import com.xiaoju.framework.mapper.CaseBackupMapper;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutorService;

public class SaveIngressTask extends IngressTask {
    EditMessage data;
    CaseBackupMapper caseBackupMapper;
    boolean backup;

    public SaveIngressTask(SocketIOClient client, SocketIOServer socketIOServer, RoomEntity room, ExecutorService executorEgressService,
                           EditMessage data, CaseBackupMapper caseBackupMapper) {
        super(client, socketIOServer, room, executorEgressService);
        this.data = data;
        this.caseBackupMapper = caseBackupMapper;
        this.backup = true;
    }

    public SaveIngressTask(SocketIOClient client, SocketIOServer socketIOServer, RoomEntity room, ExecutorService executorEgressService,
                           EditMessage data, CaseBackupMapper caseBackupMapper, boolean backup) {
        this(client, socketIOServer, room, executorEgressService, data, caseBackupMapper);
        this.backup = backup;
    }

    @Override
    public void run() {
        synchronized (room) {
            saveLocked();
        }
    }

    private void saveLocked() {
        if (room.isStaleClient(client.getSessionId())) {
            executorEgressService.submit(new AckEgressTask("stale_data_event",
                    PushMessage.builder().message("stale").build(), client));
            acknowledgeSave("conflict");
            return;
        }
        if ((room.isLockedByClient() || RoomEntity.isSourceTaskClient(client)) && !room.lockByClient(client)) {
            executorEgressService.submit(new AckEgressTask("lock",
                    PushMessage.builder().message("0").build(), client));
            return;
        }
        if (backup && room instanceof RecordEntity) {
            try {
                ((RecordEntity) room).saveAppearance(data.getCaseContent(),
                        client.getHandshakeData().getSingleUrlParam("user"));
                acknowledgeSave("ok");
            } catch (IllegalStateException conflict) {
                LOGGER.warn("测试任务手动保存版本冲突", conflict);
                acknowledgeSave("conflict");
            } catch (Exception error) {
                LOGGER.error("测试任务手动保存失败", error);
                acknowledgeSave("error");
            }
            return;
        }
        // 1.更新内存中的用例
        String previousContent = room.getCaseContent();
        try {
            if (!backup && !(room instanceof RecordEntity)) {
                int clientVersion = jsonMapper.readTree(data.getCaseContent()).path("base").asInt();
                int roomVersion = jsonMapper.readTree(room.getCaseContent()).path("base").asInt();
                if (clientVersion != roomVersion) {
                    executorEgressService.submit(new AckEgressTask("stale_data_event",
                            PushMessage.builder().message("stale").build(), client));
                    return;
                }
                room.persistCaseContent(client.getHandshakeData().getSingleUrlParam("user"));
                return;
            }
            if (room instanceof RecordEntity) {
                if (jsonMapper.readTree(data.getCaseContent()).path("base").asInt() !=
                        jsonMapper.readTree(room.getCaseContent()).path("base").asInt()) {
                    throw new IllegalStateException("用例版本冲突，请刷新后重试");
                }
                ((RecordEntity) room).persistExecutionRecord(client.getHandshakeData().getSingleUrlParam("user"));
            }
            else room.acceptSaveContent(data.getCaseContent(), client.getSessionId());
        } catch (Exception error) {
            LOGGER.error("保存内容格式错误", error);
            acknowledgeSave(error instanceof IllegalStateException && error.getMessage() != null &&
                    error.getMessage().contains("版本冲突") ? "conflict" : "error");
            return;
        }
        if (!(room instanceof RecordEntity)) {
            try {
                room.persistCaseContent(client.getHandshakeData().getSingleUrlParam("user"), previousContent);
            } catch (Exception error) {
                room.setCaseContent(previousContent);
                LOGGER.error("保存用例主数据失败", error);
                acknowledgeSave(error instanceof IllegalStateException && error.getMessage() != null &&
                        error.getMessage().contains("版本冲突") ? "conflict" : "error");
                return;
            }
        }
        if (!backup) return;

        try {
        // 2.保存到backup表
        LOGGER.info(Thread.currentThread().getName() + ": 手动保存用例。");
        CaseBackup caseBackup = new CaseBackup();

        caseBackup.setCaseId(room.getCaseId());
        caseBackup.setCaseContent(room.getCaseContent());
        caseBackup.setRecordContent("");
        caseBackup.setCreator(client.getHandshakeData().getSingleUrlParam("user"));
        caseBackup.setExtra("");

        // 此处可以与最新的内容比对，如果一致，则不更新backup表，减少版本数量
        List<CaseBackup> caseBackups = caseBackupMapper.selectByCaseId(caseBackup.getCaseId(), null, null);

        // 如果当前已有，则直接返回
        // todo 此处还是用版本信息控制更加合理
        ObjectMapper jsonMapper = new ObjectMapper();
        try {
            if (caseBackups.size() > 0) {
                String caseContent = caseBackups.get(0).getCaseContent();
                if (JsonDiff.asJson(jsonMapper.readTree(caseContent), jsonMapper.readTree(caseBackup.getCaseContent())).size() == 0) { // 表示没有差别
                    LOGGER.info("当前内容已经保存过了，不再重复保存。");
                    acknowledgeSave("ok");
                    return;
                }
            }
        } catch (IOException e) {
            LOGGER.info("json转换异常. 数据继续备份", e);
        }

        int ret = caseBackupMapper.insert(caseBackup);
        if (ret < 1) {
            LOGGER.error("用例备份落库失败. casebackup id: " + caseBackup.getCaseId());
            acknowledgeSave("error");
            return;
        }

        LOGGER.info("备份保存当前用例。caseid:" + caseBackup.getCaseId());

        LOGGER.info(Thread.currentThread().getName() + ": 手动保存结束。");
        acknowledgeSave("ok");
        } catch (RuntimeException error) {
            LOGGER.error("用例备份失败", error);
            acknowledgeSave("error");
        }
    }

    private void acknowledgeSave(String result) {
        if (backup || "conflict".equals(result)) executorEgressService.submit(new AckEgressTask("save_ack_event",
                PushMessage.builder().message(result).build(), client));
    }
}
