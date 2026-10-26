package com.xiaoju.framework.handler;

import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.mapper.TestCaseMapper;
import com.xiaoju.framework.mapper.CaseBackupMapper;
import com.corundumstudio.socketio.HandshakeData;
import com.corundumstudio.socketio.SocketIOClient;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.any;

public class RoomEntityPersistenceTests {
    @Test
    public void currentEditorCanManuallySaveAppearanceAtAcceptedEditVersion() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase roomCopy = new TestCase();
        roomCopy.setCaseContent("{\"base\":2,\"root\":{\"data\":{\"text\":\"old\"},\"children\":[]}}");
        TestCase stored = new TestCase();
        stored.setCaseContent(roomCopy.getCaseContent());
        when(mapper.selectOne(2212L)).thenReturn(roomCopy, stored);
        when(mapper.update(stored)).thenReturn(1);
        RoomEntity room = new RoomEntity("2212", 2212L, mapper);
        room.setCaseContent("{\"base\":3,\"root\":{\"data\":{\"text\":\"new\"},\"children\":[]}}");
        stored.setCaseContent(room.getCaseContent());
        SocketIOClient client = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        when(client.getSessionId()).thenReturn(java.util.UUID.randomUUID());
        when(client.getHandshakeData()).thenReturn(handshake);
        room.addClient(client);
        CaseBackupMapper backups = mock(CaseBackupMapper.class);
        when(backups.selectByCaseId(2212L, null, null)).thenReturn(java.util.Collections.emptyList());
        when(backups.insert(any())).thenReturn(1);
        EditMessage appearance = EditMessage.builder()
                .caseContent("{\"base\":3,\"theme\":\"ink-black\",\"root\":{\"data\":{\"text\":\"new\"},\"children\":[]}}")
                .build();

        new SaveIngressTask(client, null, room, mock(java.util.concurrent.ExecutorService.class),
                appearance, backups).run();

        verify(mapper).update(stored);
        assertEquals("ink-black", com.alibaba.fastjson.JSON.parseObject(stored.getCaseContent()).getString("theme"));
    }

    @Test
    public void autosavePersistsAcceptedEditWithoutReplacingItWithExportedSnapshot() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase roomCopy = new TestCase();
        roomCopy.setCaseContent("{\"base\":2,\"root\":{\"data\":{\"text\":\"old\"},\"children\":[]}}");
        TestCase stored = new TestCase();
        stored.setCaseContent(roomCopy.getCaseContent());
        when(mapper.selectOne(2211L)).thenReturn(roomCopy, stored);
        when(mapper.update(stored)).thenReturn(1);
        RoomEntity room = new RoomEntity("2211", 2211L, mapper);
        room.setCaseContent("{\"base\":3,\"root\":{\"data\":{\"text\":\"new\"},\"children\":[]}}");
        SocketIOClient client = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        when(client.getSessionId()).thenReturn(java.util.UUID.randomUUID());
        when(client.getHandshakeData()).thenReturn(handshake);
        room.addClient(client);
        room.clientUnlock();
        room.noteAcceptedEdit(java.util.UUID.randomUUID(), 3);
        EditMessage export = EditMessage.builder()
                .caseContent("{\"base\":3,\"root\":{\"data\":{\"text\":\"new\",\"expandState\":\"expand\"},\"children\":[]}}")
                .build();

        new SaveIngressTask(client, null, room, mock(java.util.concurrent.ExecutorService.class),
                export, null, false).run();

        verify(mapper).update(stored);
        assertEquals("new", com.alibaba.fastjson.JSON.parseObject(stored.getCaseContent())
                .getJSONObject("root").getJSONObject("data").getString("text"));
    }

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
