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
        if (this.clientMap.isEmpty() && this.lockClient == null) this.lockClient = client;
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
    }

    public synchronized boolean persistCaseContent(String modifier) throws Exception {
        JsonNode saveContent = jsonMapper.readTree(testCase.getCaseContent());
        TestCase stored = caseMapper.selectOne(caseId);
        if (stored == null) throw new IllegalStateException("用例不存在");
        JsonNode storedContent = jsonMapper.readTree(stored.getCaseContent());
        int saveVersion = saveContent.path("base").asInt();
        int storedVersion = storedContent.path("base").asInt();
        if (saveVersion < storedVersion ||
                (saveVersion == storedVersion && !saveContent.equals(storedContent))) {
            throw new IllegalStateException("用例版本冲突，不能覆盖数据库");
        }
        if (saveContent.equals(storedContent)) return true;
        TreeUtil.caseDFSValidate(saveContent.get("root"));
        stored.setCaseContent(saveContent.toString());
        stored.setGmtModified(new Date());
        stored.setModifier(modifier);
        if (caseMapper.update(stored) < 1) throw new IllegalStateException("用例内容更新失败");
        return true;
    }

    public int getClientNum() {
        return this.clientMap.size();
    }

    public boolean isLockedByClient() {
        return this.lockClient != null;
    }

    public void clientLock(SocketIOClient client) {
        this.lockClient = client;
    }

    public boolean lockByClient(SocketIOClient client) {
        return this.lockClient != null && this.lockClient.getSessionId().equals(client.getSessionId());
    }


    public void clientUnlock() {
        this.lockClient = null;
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
        JsonNode incoming = jsonMapper.readTree(caseContent);
        JsonNode current = jsonMapper.readTree(testCase.getCaseContent());
        int incomingVersion = incoming.path("base").asInt();
        int currentVersion = current.path("base").asInt();
        if (incomingVersion < currentVersion ||
                (incomingVersion == currentVersion && !incoming.equals(current))) {
            throw new IllegalStateException("用例版本冲突，请刷新后重试");
        }
        this.testCase.setCaseContent(caseContent);
    }
}
