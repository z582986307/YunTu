package com.xiaoju.framework.handler;

import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.mapper.TestCaseMapper;
import com.xiaoju.framework.mapper.CaseBackupMapper;
import com.corundumstudio.socketio.BroadcastOperations;
import com.corundumstudio.socketio.HandshakeData;
import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import org.junit.Test;

import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.eq;

public class RoomFreshnessTests {
    @Test
    public void ownQueuedChangesDoNotLookLikeAnotherTabsChanges() {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase content = new TestCase();
        content.setCaseContent("{\"base\":1,\"root\":{\"data\":{\"id\":\"root\"},\"children\":[]}}");
        when(mapper.selectOne(7L)).thenReturn(content);
        RoomEntity room = new RoomEntity("7", 7L, mapper);
        UUID firstTab = UUID.randomUUID();
        UUID secondTab = UUID.randomUUID();
        room.clientMap.put(firstTab, "a");
        room.clientMap.put(secondTab, "a");

        room.noteAcceptedEdit(firstTab, 2);
        assertFalse(room.hasForeignEditSince(firstTab, 1));
        assertTrue(room.hasForeignEditSince(secondTab, 1));
        room.noteAcceptedEdit(secondTab, 3);
        assertTrue(room.hasForeignEditSince(firstTab, 2));
        assertFalse(room.hasForeignEditSince(secondTab, 2));
    }

    @Test
    public void rejectedStaleTabDoesNotOverwriteNewerRoomContent() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase content = new TestCase();
        content.setCaseContent("{\"base\":2,\"root\":{\"data\":{\"id\":\"root\",\"text\":\"new\"},\"children\":[]}}");
        when(mapper.selectOne(7L)).thenReturn(content);
        RoomEntity room = new RoomEntity("7", 7L, mapper);
        UUID firstTab = UUID.randomUUID();
        UUID secondTab = UUID.randomUUID();
        room.clientMap.put(firstTab, "a");
        room.clientMap.put(secondTab, "a");
        room.noteAcceptedEdit(secondTab, 2);
        SocketIOClient client = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        SocketIOServer server = mock(SocketIOServer.class);
        when(client.getSessionId()).thenReturn(firstTab);
        when(client.getHandshakeData()).thenReturn(handshake);
        when(handshake.getSingleUrlParam("caseId")).thenReturn("7");
        when(handshake.getSingleUrlParam("recordId")).thenReturn("undefined");
        when(server.getRoomOperations("7")).thenReturn(mock(BroadcastOperations.class));
        ExecutorService outgoing = Executors.newSingleThreadExecutor();
        try {
            new EditIngressTask(client, server, room, outgoing, new EditMessage("",
                    "[[{\"op\":\"replace\",\"path\":\"/root/data/text\",\"value\":\"old\"}]]", 1)).run();
        } finally {
            outgoing.shutdown();
            outgoing.awaitTermination(5, TimeUnit.SECONDS);
        }
        assertEquals("new", new com.fasterxml.jackson.databind.ObjectMapper().readTree(room.getCaseContent())
                .path("root").path("data").path("text").asText());
        verify(client).sendEvent(eq("stale_data_event"), any(PushMessage.class));
    }

    @Test
    public void ownQueuedExecutionPatchIsAcceptedWithoutFalseConflict() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase content = new TestCase();
        content.setCaseContent("{\"base\":2,\"root\":{\"data\":{\"id\":\"root\",\"text\":\"first\"},\"children\":[]}}");
        when(mapper.selectOne(7L)).thenReturn(content);
        RoomEntity room = new RoomEntity("7", 7L, mapper);
        UUID firstTab = UUID.randomUUID();
        room.clientMap.put(firstTab, "a");
        room.noteAcceptedEdit(firstTab, 2);
        SocketIOClient client = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        SocketIOServer server = mock(SocketIOServer.class);
        when(client.getSessionId()).thenReturn(firstTab);
        when(client.getHandshakeData()).thenReturn(handshake);
        when(handshake.getSingleUrlParam("caseId")).thenReturn("7");
        when(handshake.getSingleUrlParam("recordId")).thenReturn("undefined");
        when(server.getRoomOperations("7")).thenReturn(mock(BroadcastOperations.class));
        ExecutorService outgoing = Executors.newSingleThreadExecutor();
        try {
            new EditIngressTask(client, server, room, outgoing, new EditMessage("",
                    "[[{\"op\":\"replace\",\"path\":\"/root/data/text\",\"value\":\"second\"}]]", 1)).run();
        } finally {
            outgoing.shutdown();
            outgoing.awaitTermination(5, TimeUnit.SECONDS);
        }
        assertEquals("second", new com.fasterxml.jackson.databind.ObjectMapper().readTree(room.getCaseContent())
                .path("root").path("data").path("text").asText());
        assertEquals(3, new com.fasterxml.jackson.databind.ObjectMapper().readTree(room.getCaseContent())
                .path("base").asInt());
    }

    @Test
    public void rejectedAutosaveNotifiesStalePage() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase content = new TestCase();
        content.setCaseContent("{\"base\":2,\"root\":{\"data\":{\"id\":\"root\"},\"children\":[]}}");
        when(mapper.selectOne(7L)).thenReturn(content);
        RoomEntity room = new RoomEntity("7", 7L, mapper);
        SocketIOClient client = mock(SocketIOClient.class);
        ExecutorService outgoing = Executors.newSingleThreadExecutor();
        try {
            new SaveIngressTask(client, mock(SocketIOServer.class), room, outgoing,
                    new EditMessage("{\"base\":1,\"root\":{\"data\":{\"id\":\"root\"},\"children\":[]}}", "", 1),
                    mock(CaseBackupMapper.class), false).run();
        } finally {
            outgoing.shutdown();
            outgoing.awaitTermination(5, TimeUnit.SECONDS);
        }
        verify(client).sendEvent(eq("save_ack_event"), any(PushMessage.class));
        assertEquals(2, new com.fasterxml.jackson.databind.ObjectMapper().readTree(room.getCaseContent()).path("base").asInt());
    }

    @Test
    public void firstClientGetsDefaultLockAndLaterClientDoesNot() {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase content = new TestCase();
        content.setCaseContent("{\"base\":0,\"root\":{\"data\":{\"id\":\"root\"},\"children\":[]}}");
        when(mapper.selectOne(7L)).thenReturn(content);
        RoomEntity room = new RoomEntity("7", 7L, mapper);
        SocketIOClient first = mock(SocketIOClient.class);
        SocketIOClient second = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        when(first.getSessionId()).thenReturn(UUID.randomUUID());
        when(second.getSessionId()).thenReturn(UUID.randomUUID());
        when(first.getHandshakeData()).thenReturn(handshake);
        when(second.getHandshakeData()).thenReturn(handshake);
        when(handshake.getSingleUrlParam("user")).thenReturn("a");

        room.addClient(first);
        room.addClient(second);
        assertTrue(room.lockByClient(first));
        assertFalse(room.lockByClient(second));
    }

    @Test
    public void lockedRoomRejectsOtherClientsEdit() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase content = new TestCase();
        content.setCaseContent("{\"base\":1,\"root\":{\"data\":{\"id\":\"root\",\"text\":\"original\"},\"children\":[]}}");
        when(mapper.selectOne(7L)).thenReturn(content);
        RoomEntity room = new RoomEntity("7", 7L, mapper);
        SocketIOClient owner = mock(SocketIOClient.class);
        SocketIOClient other = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        when(owner.getSessionId()).thenReturn(UUID.randomUUID());
        when(other.getSessionId()).thenReturn(UUID.randomUUID());
        when(owner.getHandshakeData()).thenReturn(handshake);
        when(other.getHandshakeData()).thenReturn(handshake);
        when(handshake.getSingleUrlParam("user")).thenReturn("a");
        when(handshake.getSingleUrlParam("caseId")).thenReturn("7");
        when(handshake.getSingleUrlParam("recordId")).thenReturn("undefined");
        room.addClient(owner);
        room.addClient(other);
        SocketIOServer server = mock(SocketIOServer.class);
        when(server.getRoomOperations("7")).thenReturn(mock(BroadcastOperations.class));
        ExecutorService outgoing = Executors.newSingleThreadExecutor();
        try {
            new EditIngressTask(other, server, room, outgoing, new EditMessage("",
                    "[[{\"op\":\"replace\",\"path\":\"/root/data/text\",\"value\":\"overwritten\"}]]", 1)).run();
        } finally {
            outgoing.shutdown();
            outgoing.awaitTermination(5, TimeUnit.SECONDS);
        }
        assertEquals("original", new com.fasterxml.jackson.databind.ObjectMapper().readTree(room.getCaseContent())
                .path("root").path("data").path("text").asText());
    }

    @Test
    public void lockedRoomRejectsOtherClientsManualSave() throws Exception {
        TestCaseMapper mapper = mock(TestCaseMapper.class);
        TestCase content = new TestCase();
        content.setCaseContent("{\"base\":1,\"root\":{\"data\":{\"id\":\"root\",\"text\":\"original\"},\"children\":[]}}");
        when(mapper.selectOne(7L)).thenReturn(content);
        RoomEntity room = new RoomEntity("7", 7L, mapper);
        SocketIOClient owner = mock(SocketIOClient.class);
        SocketIOClient other = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        when(owner.getSessionId()).thenReturn(UUID.randomUUID());
        when(other.getSessionId()).thenReturn(UUID.randomUUID());
        when(owner.getHandshakeData()).thenReturn(handshake);
        when(other.getHandshakeData()).thenReturn(handshake);
        when(handshake.getSingleUrlParam("user")).thenReturn("a");
        room.addClient(owner);
        room.addClient(other);
        ExecutorService outgoing = Executors.newSingleThreadExecutor();
        try {
            new SaveIngressTask(other, mock(SocketIOServer.class), room, outgoing,
                    new EditMessage("{\"base\":2,\"root\":{\"data\":{\"id\":\"root\",\"text\":\"overwritten\"},\"children\":[]}}", "", 2),
                    mock(CaseBackupMapper.class)).run();
        } finally {
            outgoing.shutdown();
            outgoing.awaitTermination(5, TimeUnit.SECONDS);
        }
        assertEquals("original", new com.fasterxml.jackson.databind.ObjectMapper().readTree(room.getCaseContent())
                .path("root").path("data").path("text").asText());
    }
}
