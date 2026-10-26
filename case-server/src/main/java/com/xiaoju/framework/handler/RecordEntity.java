package com.xiaoju.framework.handler;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.corundumstudio.socketio.SocketIOClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.xiaoju.framework.constants.enums.StatusCode;
import com.xiaoju.framework.entity.exception.CaseServerException;
import com.xiaoju.framework.entity.persistent.ExecRecord;
import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.entity.xmind.IntCount;
import com.xiaoju.framework.mapper.ExecRecordMapper;
import com.xiaoju.framework.mapper.TestCaseMapper;
import com.xiaoju.framework.util.TreeUtil;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import static com.xiaoju.framework.constants.SystemConstant.COMMA;

public class RecordEntity extends RoomEntity {
    Long recordId;
//    ExecRecord execRecord;
    ExecRecordMapper recordMapper;
    private JSONObject appearance;
    private int sourceVersion;
    private byte[] sourceFingerprint;
    private static final Set<String> APPEARANCE_FIELDS = new HashSet<>(Arrays.asList(
            "font-size", "font-family", "font-weight", "font-style", "text-decoration",
            "background", "color", "layout", "shape"));

    public RecordEntity(String roomId, Long caseId, TestCaseMapper caseMapper, Long recordId, ExecRecordMapper execRecordMapper) {
        super(roomId, caseId, caseMapper);
        this.recordId = recordId;
        this.sourceVersion = JSON.parseObject(testCase.getCaseContent()).getIntValue("base");
        this.sourceFingerprint = fingerprint(testCase.getCaseContent());
        String recordContent = mergeRecord(recordId, testCase.getCaseContent(), execRecordMapper);
        testCase.setCaseContent(recordContent);
        testCase.setGroupId(recordId);
        this.recordMapper = execRecordMapper;

    }

    public synchronized int getSourceVersion() {
        return sourceVersion;
    }

    public synchronized boolean refreshFromSourceIfChanged() {
        TestCase latest = caseMapper.selectOne(caseId);
        if (latest == null) throw new IllegalStateException("源用例不存在");
        int latestVersion = JSON.parseObject(latest.getCaseContent()).getIntValue("base");
        byte[] latestFingerprint = fingerprint(latest.getCaseContent());
        if (Arrays.equals(latestFingerprint, sourceFingerprint)) return false;
        int currentBase = JSON.parseObject(getCaseContent()).getIntValue("base");
        JSONObject merged = JSON.parseObject(mergeRecord(recordId, latest.getCaseContent(), recordMapper));
        int nextBase = currentBase + 1;
        merged.put("base", nextBase);
        setCaseContent(merged.toJSONString());
        sourceVersion = latestVersion;
        sourceFingerprint = latestFingerprint;
        invalidateExistingClients(nextBase);
        return true;
    }

    private static byte[] fingerprint(String sourceContent) {
        try {
            // 数据库无变化保存不改写 JSON 字节；固定 32 字节摘要避免常驻第二份大型脑图。
            return MessageDigest.getInstance("SHA-256").digest(sourceContent.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("源用例版本检查不可用", error);
        }
    }

    @Override
    public synchronized void removeClient(SocketIOClient client) {
        forgetClient(client);
        LOGGER.info("remove client, current user number:" + this.clientMap.size());
        String user = client.getHandshakeData().getSingleUrlParam("user");
        persistExecutionRecord(user);
    }

    public synchronized void persistExecutionRecord(String user) {
        testCase.setGmtModified(new Date(System.currentTimeMillis()));
        ExecRecord record = recordMapper.selectOne(recordId);
        if (record == null) {
            throw new CaseServerException("执行任务不存在", StatusCode.NOT_FOUND_ENTITY);
        }
        JSONObject jsonObject = TreeUtil.parse(testCase.getCaseContent());
        JSONObject jsonProgress = jsonObject.getJSONObject("progress");
        JSONObject currentRoot = jsonObject.getJSONObject("content").getJSONObject("root");
        jsonProgress.put("__expandState", collectExpandState(currentRoot));
        jsonProgress.put("__notes", collectExecutionNotes(currentRoot));
        if (appearance != null) jsonProgress.put("__appearance", appearance);
        Integer totalCount = jsonObject.getInteger("totalCount");
        Integer passCount = jsonObject.getInteger("passCount");
        Integer failCount = jsonObject.getInteger("failCount");
        Integer blockCount = jsonObject.getInteger("blockCount");
        Integer successCount = jsonObject.getInteger("successCount");
        Integer ignoreCount = jsonObject.getInteger("ignoreCount");

        String executors = record.getExecutors();
        List<String> names = StringUtils.isEmpty(executors)
                ? new ArrayList<>()
                : Arrays.stream(executors.split(COMMA)).filter(e->!StringUtils.isEmpty(e)).collect(Collectors.toList());
        long count = names.stream().filter(e -> e.equals(user)).count();

        if (count > 0) {
            // 有重合，不管了
            ;
        } else {
            // 没重合往后面塞一个
            names.add(user);
        }

        record.setExecutors(String.join(",", names));
        record.setModifier(user);
        record.setGmtModified(new Date(System.currentTimeMillis()));
        record.setCaseContent(jsonProgress.toJSONString());
        record.setFailCount(failCount);
        record.setBlockCount(blockCount);
        record.setIgnoreCount(ignoreCount);
        record.setPassCount(passCount);
        record.setTotalCount(totalCount);
        record.setSuccessCount(successCount);
        recordMapper.update(record);

        LOGGER.info("数据库用例执行记录已更新，recordId={}", recordId);
    }

    private String mergeRecord(Long recordId, String caseContentStr, ExecRecordMapper execRecordMapper) {

        String retCaseContent;

        ExecRecord record = execRecordMapper.selectOne(recordId);
        if (record == null) {
            //todo: 在controller层应该已经创建了任务，因此这里一定不为空
            LOGGER.error(Thread.currentThread().getName() + ": 当前用例执行者初次打开任务");
        }

        String recordContent = record.getCaseContent();
        JSONObject recordObj = new JSONObject();
        if (StringUtils.isEmpty(recordContent)) {
            // 其实当前任务还没有任何执行记录
            LOGGER.info(Thread.currentThread().getName() + ": first create record.");
        } else if (recordContent.startsWith("[{")) {
            JSONArray jsonArray = JSON.parseArray(recordContent);
            for (Object o : jsonArray) {
                recordObj.put(((JSONObject) o).getString("id"), ((JSONObject) o).getLong("progress"));
            }
        } else {
            recordObj = JSON.parseObject(recordContent);
        }
        appearance = recordObj.getJSONObject("__appearance");
        if (appearance == null) {
            // 旧任务没有外观快照：首次打开时锁定当前外观，以后不再跟随源用例变化。
            appearance = captureAppearance(JSON.parseObject(caseContentStr));
            recordObj.put("__appearance", appearance);
            record.setCaseContent(recordObj.toJSONString());
            execRecordMapper.update(record);
        }

        IntCount ExecCount = new IntCount(recordObj.size());
        // 如果当前record是圈选了部分的圈选用例
        if (!StringUtils.isEmpty(record.getChooseContent()) && !record.getChooseContent().contains("\"priority\":[\"0\"]")) {
            Map<String, List<String>> chosen = JSON.parseObject(record.getChooseContent(), Map.class);

            JSONObject caseContent = JSON.parseObject(caseContentStr);
            JSONObject caseRoot = caseContent.getJSONObject("root");
            Stack<JSONObject> objCheck = new Stack<>();

            Stack<IntCount> iCheck = new Stack<>();
            objCheck.push(caseRoot);

            List<String> priority = chosen.get("priority");
            List<String> resource = chosen.get("resource");
            //获取对应级别用例
            if (!CollectionUtils.isEmpty(priority)) {
                TreeUtil.getPriority(objCheck, iCheck, caseRoot, priority);
            }
            if (!CollectionUtils.isEmpty(resource)) {
                TreeUtil.getChosenCase(caseRoot, new HashSet<>(resource), "resource");
            }

            TreeUtil.mergeExecRecord(caseContent.getJSONObject("root"), recordObj, ExecCount);
            applyExpandState(caseContent.getJSONObject("root"), recordObj.getJSONObject("__expandState"));
            applyExecutionNotes(caseContent.getJSONObject("root"), recordObj.getJSONObject("__notes"));
            retCaseContent = caseContent.toJSONString();
        } else {
            // 如果是全部的，那么直接把testcase 给 merge过来
            JSONObject caseContent = JSON.parseObject(caseContentStr);
            TreeUtil.mergeExecRecord(caseContent.getJSONObject("root"), recordObj, ExecCount);
            applyExpandState(caseContent.getJSONObject("root"), recordObj.getJSONObject("__expandState"));
            applyExecutionNotes(caseContent.getJSONObject("root"), recordObj.getJSONObject("__notes"));
            retCaseContent = caseContent.toJSONString();
        }
        if (appearance != null) {
            JSONObject content = JSON.parseObject(retCaseContent);
            applyAppearance(content, appearance);
            retCaseContent = content.toJSONString();
        }
        return retCaseContent;
    }

    public synchronized void saveAppearance(String incomingContent, String user) {
        JSONObject incoming = JSON.parseObject(incomingContent);
        JSONObject current = JSON.parseObject(getCaseContent());
        if (incoming == null || incoming.getJSONObject("root") == null ||
                !Objects.equals(incoming.getInteger("base"), current.getInteger("base"))) {
            throw new IllegalStateException("用例版本冲突，请刷新后重试");
        }
        JSONObject nextAppearance = captureAppearance(incoming);
        applyAppearance(current, nextAppearance);
        setCaseContent(current.toJSONString());
        appearance = nextAppearance;
        persistExecutionRecord(user);
    }

    public static String initialAppearanceRecord(String caseContent) {
        JSONObject record = new JSONObject();
        record.put("__appearance", captureAppearance(JSON.parseObject(caseContent)));
        return record.toJSONString();
    }

    private static JSONObject captureAppearance(JSONObject content) {
        JSONObject result = new JSONObject();
        for (String key : Arrays.asList("theme", "template", "right")) {
            if (content.containsKey(key)) result.put(key, content.get(key));
        }
        JSONObject nodes = new JSONObject();
        Deque<JSONObject> pending = new ArrayDeque<>();
        pending.push(content.getJSONObject("root"));
        while (!pending.isEmpty()) {
            JSONObject node = pending.pop();
            JSONObject data = node.getJSONObject("data");
            if (data != null && data.getString("id") != null) {
                JSONObject style = new JSONObject();
                for (String key : APPEARANCE_FIELDS) if (data.containsKey(key)) style.put(key, data.get(key));
                nodes.put(data.getString("id"), style);
            }
            JSONArray children = node.getJSONArray("children");
            if (children != null) for (Object child : children) pending.push((JSONObject) child);
        }
        result.put("nodes", nodes);
        return result;
    }

    private void applyAppearance(JSONObject content, JSONObject saved) {
        for (String key : Arrays.asList("theme", "template", "right")) {
            if (saved.containsKey(key)) content.put(key, saved.get(key));
        }
        JSONObject nodes = saved.getJSONObject("nodes");
        if (nodes == null) return;
        Deque<JSONObject> pending = new ArrayDeque<>();
        pending.push(content.getJSONObject("root"));
        while (!pending.isEmpty()) {
            JSONObject node = pending.pop();
            JSONObject data = node.getJSONObject("data");
            if (data != null && nodes.containsKey(data.getString("id"))) {
                JSONObject style = nodes.getJSONObject(data.getString("id"));
                for (String key : APPEARANCE_FIELDS) {
                    if (style.containsKey(key)) data.put(key, style.get(key));
                    else data.remove(key);
                }
            }
            JSONArray children = node.getJSONArray("children");
            if (children != null) for (Object child : children) pending.push((JSONObject) child);
        }
    }

    private JSONObject collectExecutionNotes(JSONObject root) {
        JSONObject notes = new JSONObject();
        if (root == null) return notes;
        Deque<JSONObject> pending = new ArrayDeque<>();
        pending.push(root);
        while (!pending.isEmpty()) {
            JSONObject node = pending.pop();
            JSONObject data = node.getJSONObject("data");
            if (data != null && data.getString("id") != null && data.getString("note") != null) {
                notes.put(data.getString("id"), data.getString("note"));
            }
            JSONArray children = node.getJSONArray("children");
            if (children != null) for (Object child : children) pending.push((JSONObject) child);
        }
        return notes;
    }

    private void applyExecutionNotes(JSONObject root, JSONObject notes) {
        if (root == null || notes == null || notes.isEmpty()) return;
        Deque<JSONObject> pending = new ArrayDeque<>();
        pending.push(root);
        while (!pending.isEmpty()) {
            JSONObject node = pending.pop();
            JSONObject data = node.getJSONObject("data");
            if (data != null && notes.containsKey(data.getString("id"))) {
                data.put("note", notes.getString(data.getString("id")));
            }
            JSONArray children = node.getJSONArray("children");
            if (children != null) for (Object child : children) pending.push((JSONObject) child);
        }
    }

    private JSONObject collectExpandState(JSONObject root) {
        JSONObject states = new JSONObject();
        if (root == null) return states;
        JSONObject data = root.getJSONObject("data");
        if (data != null && data.getString("id") != null && data.getString("expandState") != null) {
            states.put(data.getString("id"), data.getString("expandState"));
        }
        JSONArray children = root.getJSONArray("children");
        if (children != null) {
            for (Object child : children) states.putAll(collectExpandState((JSONObject) child));
        }
        return states;
    }

    private void applyExpandState(JSONObject root, JSONObject states) {
        if (root == null || states == null) return;
        JSONObject data = root.getJSONObject("data");
        if (data != null && data.getString("id") != null && states.containsKey(data.getString("id"))) {
            data.put("expandState", states.getString(data.getString("id")));
        }
        JSONArray children = root.getJSONArray("children");
        if (children != null) {
            for (Object child : children) applyExpandState((JSONObject) child, states);
        }
    }
}
