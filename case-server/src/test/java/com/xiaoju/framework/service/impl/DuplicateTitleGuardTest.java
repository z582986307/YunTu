package com.xiaoju.framework.service.impl;

import com.xiaoju.framework.entity.exception.CaseServerException;
import com.xiaoju.framework.entity.persistent.ExecRecord;
import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.entity.request.cases.CaseCreateReq;
import com.xiaoju.framework.entity.request.cases.CaseEditReq;
import com.xiaoju.framework.entity.request.record.RecordUpdateReq;
import com.xiaoju.framework.entity.request.record.RecordAddReq;
import com.xiaoju.framework.mapper.ExecRecordMapper;
import com.xiaoju.framework.mapper.TestCaseMapper;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.mockito.ArgumentCaptor;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

public class DuplicateTitleGuardTest {
    @Test
    public void rejectsDuplicateCaseTitleOnCreateAndRename() {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        CaseServiceImpl service = new CaseServiceImpl();
        ReflectionTestUtils.setField(service, "caseMapper", mapper);
        when(mapper.countActiveByTitle("客户管理", null)).thenReturn(1);
        CaseCreateReq create = new CaseCreateReq();
        create.setTitle("客户管理");
        expectDuplicate(() -> service.insertOrDuplicateCase(create), "用例名称");

        TestCase existing = new TestCase();
        existing.setId(7L);
        when(mapper.selectOne(7L)).thenReturn(existing);
        when(mapper.countActiveByTitle("客户管理", 7L)).thenReturn(1);
        CaseEditReq edit = new CaseEditReq();
        edit.setId(7L);
        edit.setTitle("客户管理");
        expectDuplicate(() -> service.updateCase(edit), "用例名称");
    }

    @Test
    public void rejectsDuplicateTaskTitleOnRename() {
        ExecRecordMapper mapper = mock(ExecRecordMapper.class);
        RecordServiceImpl service = new RecordServiceImpl();
        ReflectionTestUtils.setField(service, "recordMapper", mapper);
        ExecRecord existing = new ExecRecord();
        existing.setId(8L);
        when(mapper.selectOne(8L)).thenReturn(existing);
        when(mapper.countActiveByTitle("任务", 8L)).thenReturn(1);
        RecordUpdateReq edit = new RecordUpdateReq();
        edit.setId(8L);
        edit.setTitle("任务");
        expectDuplicate(() -> service.editRecord(edit), "测试任务名称");
    }

    @Test
    public void defaultTaskTitleTakesFirstUnusedSuffix() {
        ExecRecordMapper records = mock(ExecRecordMapper.class);
        TestCaseMapper cases = mock(TestCaseMapper.class);
        RecordServiceImpl service = new RecordServiceImpl();
        ReflectionTestUtils.setField(service, "recordMapper", records);
        ReflectionTestUtils.setField(service, "caseMapper", cases);
        TestCase source = new TestCase();
        source.setId(3L);
        source.setTitle("客户管理");
        source.setCaseContent("{\"root\":{\"data\":{\"id\":\"root\",\"text\":\"客户管理\"},\"children\":[]}}");
        when(cases.selectOne(3L)).thenReturn(source);
        when(records.countActiveByTitle("客户管理", null)).thenReturn(1);
        when(records.countActiveByTitle("客户管理（1）", null)).thenReturn(1);
        when(records.insert(org.mockito.ArgumentMatchers.any(ExecRecord.class))).thenReturn(9L);
        RecordAddReq create = new RecordAddReq();
        create.setCaseId(3L);
        create.setTitle("客户管理");
        create.setCreator("tester");
        create.setChooseContent("{\"priority\":[\"0\"]}");
        service.addRecord(create);
        ArgumentCaptor<ExecRecord> saved = ArgumentCaptor.forClass(ExecRecord.class);
        verify(records).insert(saved.capture());
        assertTrue(saved.getValue().getTitle().equals("客户管理（2）"));
    }

    private void expectDuplicate(Runnable operation, String label) {
        try {
            operation.run();
            fail("应拒绝重复名称");
        } catch (CaseServerException error) {
            assertTrue(error.getMessage().contains(label));
        }
    }
}
