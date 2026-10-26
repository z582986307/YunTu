package com.xiaoju.framework.handler;

import com.corundumstudio.socketio.SocketIOServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 仅通知任务源版本变化，不替换正在执行的任务快照。 */
public class SourceCaseUpdateNotifier {
    private static final Logger LOGGER = LoggerFactory.getLogger(SourceCaseUpdateNotifier.class);
    private final SocketIOServer server;

    public SourceCaseUpdateNotifier(SocketIOServer server) {
        this.server = server;
    }

    public void notifyUpdated(Long caseId, int sourceVersion) {
        for (RecordEntity room : RecordFactory.roomsForCase(caseId)) {
            try {
                server.getRoomOperations(room.getRoomId()).sendEvent("source_case_updated",
                        PushMessage.builder().message(Integer.toString(sourceVersion)).build());
            } catch (RuntimeException error) {
                // 数据库已提交；通知失败不能把已成功的写入伪装成失败并回滚内存。
                LOGGER.warn("源用例更新通知发送失败，任务重新连接时将检查源版本");
            }
        }
    }
}
