package com.xiaoju.framework.service;

import com.github.pagehelper.Page;
import com.xiaoju.framework.entity.persistent.ExecRecord;
import com.xiaoju.framework.entity.response.controller.PageModule;
import com.xiaoju.framework.entity.response.records.RecordListResp;
import com.xiaoju.framework.mapper.ExecRecordMapper;
import com.xiaoju.framework.service.impl.RecordServiceImpl;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Date;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class RecordPageTests {
    @Test
    public void listsProductTasksByCreateTimeWithoutLoadingMindMapContent() {
        ExecRecordMapper mapper = mock(ExecRecordMapper.class);
        RecordServiceImpl service = new RecordServiceImpl();
        ReflectionTestUtils.setField(service, "recordMapper", mapper);
        ExecRecord row = new ExecRecord();
        row.setId(9L);
        row.setCaseId(7L);
        row.setTitle("执行任务");
        row.setGmtCreated(new Date(1000L));
        Page<ExecRecord> page = new Page<>();
        page.add(row);
        page.setTotal(1);
        when(mapper.getRecordPageByProductLineId(1L)).thenReturn(page);
        PageModule<RecordListResp> result = service.getPageByProductLineId(1L, 1, 10);
        assertEquals(Long.valueOf(1), result.getTotal());
        assertEquals(Long.valueOf(9), result.getDataSources().get(0).getId());
        assertEquals(Long.valueOf(1000), result.getDataSources().get(0).getCreateTime());
        verify(mapper).getRecordPageByProductLineId(1L);
    }
}
