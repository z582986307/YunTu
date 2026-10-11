package com.xiaoju.framework.handler;

import com.xiaoju.framework.entity.persistent.ExecRecord;
import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.mapper.ExecRecordMapper;
import com.xiaoju.framework.mapper.TestCaseMapper;
import com.alibaba.fastjson.JSON;
import org.junit.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class RecordEntityPersistenceTests {

    @Test
    public void persistsExecutionProgressImmediatelyAfterEdit() {
        TestCaseMapper caseMapper = mock(TestCaseMapper.class);
        ExecRecordMapper recordMapper = mock(ExecRecordMapper.class);

        TestCase testCase = new TestCase();
        testCase.setId(2209L);
        testCase.setCaseContent(caseContent(null));

        ExecRecord record = new ExecRecord();
        record.setId(900L);
        record.setCaseContent("");
        record.setExecutors("");

        when(caseMapper.selectOne(2209L)).thenReturn(testCase);
        when(recordMapper.selectOne(900L)).thenReturn(record);

        RecordEntity entity = new RecordEntity("record-900", 2209L, caseMapper, 900L, recordMapper);
        entity.setCaseContent(caseContent(1));
        entity.persistExecutionRecord("admin");

        ArgumentCaptor<ExecRecord> captor = ArgumentCaptor.forClass(ExecRecord.class);
        verify(recordMapper).update(captor.capture());
        ExecRecord saved = captor.getValue();
        assertEquals(Integer.valueOf(1), saved.getFailCount());
        assertEquals(Integer.valueOf(1), saved.getPassCount());
        assertEquals("admin", saved.getExecutors());
        assertTrue(saved.getCaseContent().contains("leaf-1"));
    }

    @Test
    public void newlyOpenedTaskUsesLatestCaseImageAndKeepsExecutionResult() {
        TestCaseMapper caseMapper = mock(TestCaseMapper.class);
        ExecRecordMapper recordMapper = mock(ExecRecordMapper.class);
        TestCase testCase = new TestCase();
        testCase.setId(2209L);
        testCase.setCaseContent(caseContent(null).replace("\"text\":\"case\"", "\"text\":\"case\",\"image\":\"/latest.png\""));
        ExecRecord record = new ExecRecord();
        record.setId(900L);
        record.setCaseContent("{\"leaf-1\":9}");
        when(caseMapper.selectOne(2209L)).thenReturn(testCase);
        when(recordMapper.selectOne(900L)).thenReturn(record);

        RecordEntity entity = new RecordEntity("record-900", 2209L, caseMapper, 900L, recordMapper);
        com.alibaba.fastjson.JSONObject leaf = JSON.parseObject(entity.getCaseContent())
                .getJSONObject("root").getJSONArray("children").getJSONObject(0).getJSONObject("data");
        assertEquals("/latest.png", leaf.getString("image"));
        assertEquals(Integer.valueOf(9), leaf.getInteger("progress"));
    }

    @Test
    public void executionNoteSurvivesTaskRefreshWithUpdatedCaseText() {
        TestCaseMapper caseMapper = mock(TestCaseMapper.class);
        ExecRecordMapper recordMapper = mock(ExecRecordMapper.class);
        TestCase source = new TestCase();
        source.setId(2209L);
        source.setCaseContent(caseContent(null));
        ExecRecord record = new ExecRecord();
        record.setId(900L);
        record.setCaseContent("");
        record.setExecutors("");
        when(caseMapper.selectOne(2209L)).thenReturn(source);
        when(recordMapper.selectOne(900L)).thenReturn(record);

        RecordEntity opened = new RecordEntity("record-900", 2209L, caseMapper, 900L, recordMapper);
        opened.setCaseContent(caseContent(9).replace("\"text\":\"case\"", "\"text\":\"case\",\"note\":\"执行备注\""));
        assertTrue(opened.getCaseContent().contains("执行备注"));
        opened.persistExecutionRecord("editor");
        assertTrue(record.getCaseContent().contains("执行备注"));
        source.setCaseContent(caseContent(null).replace("\"text\":\"case\"", "\"text\":\"新版用例\""));

        RecordEntity refreshed = new RecordEntity("record-900-new", 2209L, caseMapper, 900L, recordMapper);
        com.alibaba.fastjson.JSONObject leaf = JSON.parseObject(refreshed.getCaseContent())
                .getJSONObject("root").getJSONArray("children").getJSONObject(0).getJSONObject("data");
        assertEquals("新版用例", leaf.getString("text"));
        assertEquals("执行备注", leaf.getString("note"));
        assertEquals(Integer.valueOf(9), leaf.getInteger("progress"));
    }

    private String caseContent(Integer progress) {
        String progressValue = progress == null ? "" : ",\"progress\":" + progress;
        return "{\"base\":1,\"root\":{\"data\":{\"id\":\"root\",\"text\":\"root\"},"
                + "\"children\":[{\"data\":{\"id\":\"leaf-1\",\"text\":\"case\"" + progressValue
                + "},\"children\":[]}]}}";
    }
}
