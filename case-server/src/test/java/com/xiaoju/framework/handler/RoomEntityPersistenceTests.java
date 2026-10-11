package com.xiaoju.framework.handler;

import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.mapper.TestCaseMapper;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class RoomEntityPersistenceTests {
    @Test
    public void manualSavePersistsCurrentCaseForNewTaskLoads() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase stored = new TestCase();
        stored.setId(2209L);
        stored.setCaseContent("{\"base\":1,\"root\":{\"data\":{\"text\":\"old\"},\"children\":[]}}");
        TestCase roomCopy = new TestCase();
        roomCopy.setId(2209L);
        roomCopy.setCaseContent(stored.getCaseContent());
        when(mapper.selectOne(2209L)).thenReturn(roomCopy, stored);
        when(mapper.update(stored)).thenReturn(1);

        RoomEntity room = new RoomEntity("2209", 2209L, mapper);
        room.setCaseContent("{\"base\":2,\"root\":{\"data\":{\"text\":\"new\"},\"children\":[]}}");
        room.persistCaseContent("editor");

        verify(mapper).update(stored);
        assertEquals("new", com.alibaba.fastjson.JSON.parseObject(stored.getCaseContent())
                .getJSONObject("root").getJSONObject("data").getString("text"));
    }

    @Test
    public void staleSaveCannotOverwriteNewerRoomEdit() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase stored = new TestCase();
        stored.setId(2209L);
        stored.setCaseContent("{\"base\":3,\"root\":{\"data\":{\"text\":\"latest\"},\"children\":[]}}");
        when(mapper.selectOne(2209L)).thenReturn(stored);
        RoomEntity room = new RoomEntity("2209", 2209L, mapper);

        try {
            room.acceptSaveContent("{\"base\":2,\"root\":{\"data\":{\"text\":\"stale\"},\"children\":[]}}");
            fail("旧版本不应被确认保存");
        } catch (IllegalStateException expected) {
            // 保留较新的内存版本。
        }

        assertEquals("latest", com.alibaba.fastjson.JSON.parseObject(room.getCaseContent())
                .getJSONObject("root").getJSONObject("data").getString("text"));
    }

    @Test
    public void sameVersionDifferentContentCannotOverwriteRoomEdit() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase stored = new TestCase();
        stored.setId(2210L);
        stored.setCaseContent("{\"base\":3,\"root\":{\"data\":{\"text\":\"latest\"},\"children\":[]}}");
        when(mapper.selectOne(2210L)).thenReturn(stored);
        RoomEntity room = new RoomEntity("2210", 2210L, mapper);
        try {
            room.acceptSaveContent("{\"base\":3,\"root\":{\"data\":{\"text\":\"conflict\"},\"children\":[]}}");
            fail("相同版本的冲突快照不应覆盖");
        } catch (IllegalStateException expected) {
            // 同版本不同内容需要由客户端重新同步。
        }
        assertEquals("latest", com.alibaba.fastjson.JSON.parseObject(room.getCaseContent())
                .getJSONObject("root").getJSONObject("data").getString("text"));
    }
}
