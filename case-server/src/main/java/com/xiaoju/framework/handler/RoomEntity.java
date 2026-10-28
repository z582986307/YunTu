package com.xiaoju.framework.handler;

import com.corundumstudio.socketio.SocketIOClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.mapper.TestCaseMapper;
import com.xiaoju.framework.util.TreeUtil;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

public class RoomEntity {
    protected static final Logger LOGGER = LoggerFactory.getLogger(RoomEntity.class);
    String roomId;
    Long caseId;
    Map<UUID, String> clientMap;
    TestCase testCase;
    TestCaseMapper caseMapper;
    SocketIOClient lockClient;
    ObjectMapper jsonMapper;
    JsonNodeFactory FACTORY;
    ReentrantLock lock;
    private final Map<UUID, Integer> lastForeignEditVersion = new HashMap<>();
    private final Set<UUID> staleClients = new HashSet<>();
    private SourceCaseUpdateNotifier sourceCaseUpdateNotifier;

    public RoomEntity(String roomId, Long caseId, TestCaseMapper caseMapper) {
        this.roomId = roomId;
        this.caseMapper = caseMapper;
        this.caseId = caseId;
        this.testCase = caseMapper.selectOne(caseId);
        this.clientMap = new HashMap<>();
        this.jsonMapper = new ObjectMapper();
        this.FACTORY = JsonNodeFactory.instance;
        String res = testCase == null ? null : testCase.getCaseContent();
        if (StringUtils.isEmpty(res)) {
            LOGGER.error(Thread.currentThread().getName() + ": 用例内容为空");
            // todo: 此处需要走异常处理流程
        }
    }

    public synchronized boolean addClient(SocketIOClient client) {
        if (this.clientMap.containsKey(client.getSessionId())) return false;
        if (this.lockClient == null && (this.clientMap.isEmpty() || isSourceTaskClient(client))) clientLock(client);
        this.clientMap.put(client.getSessionId(), client.getHandshakeData().getSingleUrlParam("user"));
        LOGGER.info("add client, current user number: {}", this.clientMap.size());
        return true;
    }

    public synchronized void removeClient(SocketIOClient client) {
        forgetClient(client);
        LOGGER.info("remove client, current user number:" + this.clientMap.size());
        if (this.clientMap.size() == 0) {
            try {
                persistCaseContent(client.getHandshakeData().getSingleUrlParam("user"));
            } catch (Exception e) {
                LOGGER.error("离开页面时保存用例失败", e);
            }
        }
    }

    protected void forgetClient(SocketIOClient client) {
        this.clientMap.remove(client.getSessionId());
        this.lastForeignEditVersion.remove(client.getSessionId());
        this.staleClients.remove(client.getSessionId());
    }

    public static boolean isSourceTaskClient(SocketIOClient client) {
        if (client.getHandshakeData() == null) return false;
        String taskId = client.getHandshakeData().getSingleUrlParam("sourceTaskId");
        return taskId != null && !"undefined".equals(taskId);
    }

    public synchronized boolean isStaleClient(UUID client) {
        // 已排队的写任务可能在断开、清除失效标记后才出队，离房会话仍须拒绝。
        return !clientMap.containsKey(client) || staleClients.contains(client);
    }

    protected void invalidateExistingClients(int version) {
        staleClients.addAll(clientMap.keySet());
        noteAcceptedEdit(null, version);
    }

    public synchronized void setSourceCaseUpdateNotifier(SourceCaseUpdateNotifier notifier) {
        this.sourceCaseUpdateNotifier = notifier;
    }

    public synchronized void persistAcceptedEdit(SocketIOClient client, String previousContent) throws Exception {
        try {
            String modifier = client.getHandshakeData().getSingleUrlParam("user");
            if (this instanceof RecordEntity) {
                ((RecordEntity) this).persistExecutionRecord(modifier);
            } else if (isSourceTaskClient(client)) {
                if (!lockByClient(client)) throw new IllegalStateException("请先取得用例编辑锁");
                persistCaseContent(modifier, previousContent);
            }
        } catch (Exception error) {
            setCaseContent(previousContent);
            throw error;
        }
    }

    public synchronized boolean persistCaseContent(String modifier) throws Exception {
        return persistCaseContent(modifier, null);
    }

    public synchronized boolean persistCaseContent(String modifier, String previousContent) throws Exception {
        JsonNode saveContent = jsonMapper.readTree(testCase.getCaseContent());
        TestCase stored = caseMapper.selectOne(caseId);
        if (stored == null) throw new IllegalStateException("用例不存在");
        JsonNode storedContent = jsonMapper.readTree(stored.getCaseContent());
        if (saveContent.equals(storedContent)) return true;
        // 与真正写入数据库的形态比较，避免旧用例的空标签清理造成自己的下一次保存冲突。
        TreeUtil.caseDFSValidate(saveContent.get("root"));
        int saveVersion = saveContent.path("base").asInt();
        int storedVersion = storedContent.path("base").asInt();
        boolean unchangedSinceEditorRead = previousContent != null &&
                storedContent.equals(jsonMapper.readTree(previousContent));
        if (saveVersion < storedVersion ||
                (saveVersion == storedVersion && !saveContent.equals(storedContent) &&
                        !unchangedSinceEditorRead)) {
            throw new IllegalStateException("用例版本冲突，不能覆盖数据库");
        }
        if (saveContent.equals(storedContent)) {
            setCaseContent(saveContent.toString());
            return true;
        }
        stored.setCaseContent(saveContent.toString());
        stored.setGmtModified(new Date());
        stored.setModifier(modifier);
        if (caseMapper.update(stored) < 1) throw new IllegalStateException("用例内容更新失败");
        setCaseContent(saveContent.toString());
        if (sourceCaseUpdateNotifier != null) sourceCaseUpdateNotifier.notifyUpdated(caseId, saveVersion);
        return true;
    }

    public int getClientNum() {
        return this.clientMap.size();
    }

    public boolean isLockedByClient() {
        return this.lockClient != null;
    }

    public synchronized void clientLock(SocketIOClient client) {
        boolean changed = this.lockClient == null;
        this.lockClient = client;
        if (changed) notifySourceLockChanged(true);
    }

    public boolean lockByClient(SocketIOClient client) {
        return this.lockClient != null && this.lockClient.getSessionId().equals(client.getSessionId());
    }


    public synchronized void clientUnlock() {
        boolean changed = this.lockClient != null;
        this.lockClient = null;
        if (changed) notifySourceLockChanged(false);
    }

    private void notifySourceLockChanged(boolean locked) {
        // RecordEntity继承相同锁方法，但任务锁不能伪装成源用例锁。
        if (!(this instanceof RecordEntity) && sourceCaseUpdateNotifier != null) {
            sourceCaseUpdateNotifier.notifyLockChanged(caseId, locked);
        }
    }

    public void lock() {
//        this.lock.lock();
    }

    public void unlock() {
//        this.lock.unlock();
    }

    public void noteAcceptedEdit(UUID editor, int version) {
        for (UUID participant : clientMap.keySet()) {
            if (!participant.equals(editor)) lastForeignEditVersion.put(participant, version);
        }
    }

    public boolean hasForeignEditSince(UUID participant, int version) {
        return lastForeignEditVersion.getOrDefault(participant, 0) > version;
    }

    public String getRoomId() {
        return this.roomId;
    }

    public String getClientName() {

        return clientMap.values().stream().collect(Collectors.joining(","));
    }

    public Long getCaseId() {
        return this.caseId;
    }
    public String getCaseContent() {
        return testCase.getCaseContent();
    }

    public void setCaseContent(String caseContent) {
        this.testCase.setCaseContent(caseContent);
    }

    public synchronized void acceptSaveContent(String caseContent) throws Exception {
        acceptSaveContent(caseContent, null);
    }

    public synchronized void acceptSaveContent(String caseContent, UUID editor) throws Exception {
        JsonNode incoming = jsonMapper.readTree(caseContent);
        JsonNode current = jsonMapper.readTree(testCase.getCaseContent());
        int incomingVersion = incoming.path("base").asInt();
        int currentVersion = current.path("base").asInt();
        boolean currentEditor = editor != null && lockClient != null &&
                editor.equals(lockClient.getSessionId()) &&
                !hasForeignEditSince(editor, incomingVersion - 1);
        if (incomingVersion < currentVersion ||
                (incomingVersion == currentVersion && !incoming.equals(current) && !currentEditor)) {
            throw new IllegalStateException("用例版本冲突，请刷新后重试");
        }
        this.testCase.setCaseContent(caseContent);
    }
}
