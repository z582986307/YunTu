package com.xiaoju.framework.handler;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.corundumstudio.socketio.*;
import com.xiaoju.framework.entity.persistent.ExecRecord;
import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.mapper.ExecRecordMapper;
import com.xiaoju.framework.mapper.TestCaseMapper;
import com.xiaoju.framework.mapper.CaseBackupMapper;
import org.junit.After;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import com.corundumstudio.socketio.listener.ConnectListener;
import com.corundumstudio.socketio.listener.DisconnectListener;
import com.corundumstudio.socketio.listener.DataListener;

import java.util.*;
import java.util.concurrent.ExecutorService;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class TaskSourceEditingTests {
    private final TestCaseMapper cases = mock(TestCaseMapper.class);
    private final ExecRecordMapper records = mock(ExecRecordMapper.class);
    private final SocketIOServer server = mock(SocketIOServer.class);
    private final BroadcastOperations broadcasts = mock(BroadcastOperations.class);
    private final ExecutorService egress = mock(ExecutorService.class);
    private String stored = source(3, "原用例");
    private boolean failWrite;

    public TaskSourceEditingTests() {
        when(cases.selectOne(12L)).thenAnswer(call -> copy(stored));
        when(cases.update(any(TestCase.class))).thenAnswer(call -> {
            if (failWrite) return 0;
            stored = ((TestCase) call.getArgument(0)).getCaseContent();
            return 1;
        });
        when(server.getRoomOperations(anyString())).thenReturn(broadcasts);
        doAnswer(call -> { ((Runnable) call.getArgument(0)).run(); return null; })
                .when(egress).submit(any(Runnable.class));
    }

    @After
    public void clearRooms() {
        RecordFactory.recordEntityMap.clear();
        RoomFactory.roomEntityMap.clear();
        SocketIOServiceImpl.clientRoomMap.clear();
    }

    @Test
    public void sourceLockChangesNotifyTasksWithoutConfusingTaskLocks() {
        task(900L);
        RoomEntity source = room();
        source.setSourceCaseUpdateNotifier(new SourceCaseUpdateNotifier(server));
        SocketIOClient owner = client(null);
        source.addClient(owner);
        source.clientUnlock();
        source.clientLock(owner);
        ArgumentCaptor<PushMessage> updates = ArgumentCaptor.forClass(PushMessage.class);
        verify(broadcasts, times(3)).sendEvent(eq("source_case_lock_event"), updates.capture());
        assertEquals(Arrays.asList("true", "false", "true"), Arrays.asList(
                updates.getAllValues().get(0).getMessage(), updates.getAllValues().get(1).getMessage(),
                updates.getAllValues().get(2).getMessage()));
        clearInvocations(broadcasts);
        RecordEntity task = task(900L);
        task.setSourceCaseUpdateNotifier(new SourceCaseUpdateNotifier(server));
        task.addClient(taskClient("900"));
        task.clientUnlock();
        verify(broadcasts, never()).sendEvent(eq("source_case_lock_event"), any(PushMessage.class));
    }

    @Test
    public void taskReceivesReadOnlyInitialSourceLockAndOwnerDisconnectUpdate() {
        task(900L);
        ConnectListener connect = connections();
        SocketIOClient owner = client(null);
        connect.onConnect(owner);
        RoomEntity source = SocketIOServiceImpl.clientRoomMap.get(owner);
        SocketIOClient taskPage = taskClient("900");
        connect.onConnect(taskPage);
        ArgumentCaptor<PushMessage> initial = ArgumentCaptor.forClass(PushMessage.class);
        verify(taskPage).sendEvent(eq("source_case_lock_event"), initial.capture());
        assertEquals("true", initial.getValue().getMessage());
        assertTrue(source.lockByClient(owner));
        assertEquals(1, source.getClientNum());
        ArgumentCaptor<DisconnectListener> disconnect = ArgumentCaptor.forClass(DisconnectListener.class);
        verify(server).addDisconnectListener(disconnect.capture());
        clearInvocations(broadcasts);
        disconnect.getValue().onDisconnect(owner);
        verify(broadcasts).sendEvent(eq("source_case_lock_event"), argThat((PushMessage value) -> "false".equals(value.getMessage())));
    }

    @Test
    public void taskSourceLockProbeDoesNotCreateSourceRoomOrTakeAnySourceLock() {
        task(900L);
        SocketIOClient taskPage = taskClient("900");
        connections().onConnect(taskPage);
        assertTrue(RoomFactory.roomEntityMap.isEmpty());
        verify(taskPage).sendEvent(eq("source_case_lock_event"), argThat((PushMessage value) -> "false".equals(value.getMessage())));
        verify(cases, never()).update(any(TestCase.class));
    }

    @Test
    public void sourceTaskPatchIsStoredBeforeSuccessAcknowledgement() throws Exception {
        RoomEntity room = room();
        SocketIOClient editor = client("900");
        room.addClient(editor);
        doAnswer(call -> {
            assertEquals("新版用例", leaf(stored).getString("text"));
            return null;
        }).when(editor).sendEvent(eq("edit_ack_event"), any());

        edit(room, editor);

        assertEquals("新版用例", leaf(stored).getString("text"));
        verify(editor).sendEvent(eq("edit_ack_event"), any());
    }

    @Test
    public void failedSourceTaskPatchRestoresMemoryAndNeverBroadcastsSuccess() {
        RoomEntity room = room();
        SocketIOClient editor = client("900");
        room.addClient(editor);
        String before = room.getCaseContent();
        failWrite = true;

        edit(room, editor);

        assertEquals(before, room.getCaseContent());
        assertEquals(before, stored);
        verify(editor, never()).sendEvent(eq("edit_ack_event"), any());
        verify(broadcasts, never()).sendEvent(eq("edit_notify_event"), any(SocketIOClient.class), any(PushMessage.class));
        verify(editor).sendEvent(eq("warning"), any());
    }

    @Test
    public void ordinarySourcePatchKeepsExistingDeferredSave() {
        RoomEntity room = room();
        SocketIOClient editor = client(null);
        room.addClient(editor);

        edit(room, editor);

        assertEquals("原用例", leaf(stored).getString("text"));
        assertEquals("新版用例", leaf(room.getCaseContent()).getString("text"));
    }

    @Test
    public void sourceTaskAcquiresUnlockedSourceWithExistingReaders() {
        RoomEntity room = room();
        room.addClient(client(null));
        room.clientUnlock();
        SocketIOClient editor = client("900");

        room.addClient(editor);

        assertTrue(room.lockByClient(editor));
    }

    @Test
    public void sourceTaskDoesNotStealSourceLockOrLockExecutionRooms() {
        RoomEntity source = room();
        SocketIOClient owner = client(null);
        SocketIOClient editor = client("900");
        source.addClient(owner);
        source.addClient(editor);
        RecordEntity first = task(900L);
        RecordEntity second = task(901L);
        SocketIOClient executor = client(null);
        second.addClient(executor);

        assertTrue(source.lockByClient(owner));
        assertFalse(source.lockByClient(editor));
        assertFalse(first.isLockedByClient());
        assertTrue(second.lockByClient(executor));
    }

    @Test
    public void sourceTaskCannotReleaseContentLockMidSession() {
        RoomEntity room = room();
        SocketIOClient editor = client("900");
        room.addClient(editor);

        new LockIngressTask(editor, server, room, egress, PushMessage.builder().message("unlock").build()).run();

        assertTrue(room.lockByClient(editor));
    }

    @Test
    public void rejectsInvalidSourceTaskBeforeJoiningSourceRoom() {
        ConnectListener connect = connections();
        for (String taskId : Arrays.asList("900", "bad-id", "901", "")) {
            ExecRecord wrongSource = new ExecRecord();
            wrongSource.setId(901L);
            wrongSource.setCaseId(99L);
            when(records.selectOne(901L)).thenReturn(wrongSource);
            SocketIOClient editor = client(taskId);

            connect.onConnect(editor);

            verify(editor).sendEvent(eq("source_edit_denied"), any(PushMessage.class));
            verify(editor, never()).joinRoom(anyString());
            assertFalse(SocketIOServiceImpl.clientRoomMap.containsKey(editor));
        }
    }

    @Test
    public void sourceLockAcquisitionMakesExistingSourceReadersReadOnly() {
        task(900L);
        ConnectListener connect = connections();
        SocketIOClient reader = client(null);
        connect.onConnect(reader);
        RoomEntity source = SocketIOServiceImpl.clientRoomMap.get(reader);
        source.clientUnlock();
        SocketIOClient editor = client("900");

        connect.onConnect(editor);

        assertSame(source, SocketIOServiceImpl.clientRoomMap.get(editor));
        assertTrue(source.lockByClient(editor));
        verify(broadcasts).sendEvent(eq("lock"), eq(editor), any(PushMessage.class));
        assertEquals(2, JSON.parseObject(source.getCaseContent()).getJSONObject("root").getJSONArray("children").size());
    }

    @Test
    public void sourceWriteNotifiesRelatedTasksOnlyAfterStorageAndNoOpDoesNotNotify() throws Exception {
        RecordEntity task = task(900L);
        RecordEntity other = task(901L);
        ConnectListener connect = connections();
        SocketIOClient editor = client("900");
        connect.onConnect(editor);
        RoomEntity source = SocketIOServiceImpl.clientRoomMap.get(editor);
        String oldTaskContent = task.getCaseContent();
        doAnswer(call -> {
            assertEquals(4, JSON.parseObject(stored).getIntValue("base"));
            assertEquals("4", ((PushMessage) call.getArgument(1)).getMessage());
            assertEquals(oldTaskContent, task.getCaseContent());
            return null;
        }).when(broadcasts).sendEvent(eq("source_case_updated"), any(PushMessage.class));

        edit(source, editor);
        source.persistCaseContent(null);

        verify(broadcasts, times(2)).sendEvent(eq("source_case_updated"), any(PushMessage.class));
        assertEquals("原用例", leaf(other.getCaseContent()).getString("text"));
        verify(editor, never()).sendEvent(eq("stale_data_event"), any(PushMessage.class));
    }

    @Test
    public void reconnectTaskRebuildsLatestSourceWithStoredExecutionStateAndMonotonicBase() {
        RecordEntity task = task(900L);
        RecordEntity other = task(901L);
        ConnectListener connect = connections();
        SocketIOClient oldPage = taskClient("900");
        connect.onConnect(oldPage);
        task.setCaseContent(task.getCaseContent().replace("\"base\":3", "\"base\":40")
                .replace("\"priority\":1", "\"priority\":1,\"progress\":9,\"note\":\"任务备注\",\"expandState\":\"collapse\""));
        task.saveAppearance(task.getCaseContent().replace("byte-blue", "ink-black"), null);
        stored = source(4, "新版用例");
        SocketIOClient newPage = taskClient("900");

        connect.onConnect(newPage);

        JSONObject current = JSON.parseObject(task.getCaseContent());
        assertEquals(41, current.getIntValue("base"));
        assertEquals("ink-black", current.getString("theme"));
        assertEquals("新版用例", leaf(task.getCaseContent()).getString("text"));
        assertEquals(9, leaf(task.getCaseContent()).getIntValue("progress"));
        assertEquals("任务备注", leaf(task.getCaseContent()).getString("note"));
        assertEquals("collapse", leaf(task.getCaseContent()).getString("expandState"));
        assertEquals("原用例", leaf(other.getCaseContent()).getString("text"));
        verify(oldPage).sendEvent(eq("stale_data_event"), any(PushMessage.class));
        String refreshed = task.getCaseContent();
        new EditIngressTask(oldPage, server, task, egress, new EditMessage("",
                "[[{\"op\":\"replace\",\"path\":\"/root/children/0/data/text\",\"value\":\"过期写入\"}]]", 40)).run();
        assertEquals(refreshed, task.getCaseContent());
        verify(oldPage, times(2)).sendEvent(eq("stale_data_event"), any(PushMessage.class));
    }

    @Test
    public void queuedEditCannotWriteReorderedTaskAfterSourceRefreshAndDisconnect() throws Exception {
        RecordEntity task = task(900L);
        ExecutorService ingress = mock(ExecutorService.class);
        List<Runnable> queued = new ArrayList<>();
        doAnswer(call -> { queued.add((Runnable) call.getArgument(0)); return null; })
                .when(ingress).submit(any(Runnable.class));
        ConnectListener connect = connections(ingress);
        SocketIOClient oldPage = taskClient("900");
        connect.onConnect(oldPage);
        ArgumentCaptor<DataListener> editListener = ArgumentCaptor.forClass(DataListener.class);
        verify(server).addEventListener(eq("edit"), eq(EditMessage.class), editListener.capture());
        editListener.getValue().onData(oldPage, new EditMessage("",
                "[[{\"op\":\"add\",\"path\":\"/root/children/0/data/progress\",\"value\":9}]]", 3), null);
        assertEquals(1, queued.size());

        JSONObject reordered = JSON.parseObject(source(4, "新版用例"));
        Collections.reverse(reordered.getJSONObject("root").getJSONArray("children"));
        stored = reordered.toJSONString();
        SocketIOClient newPage = taskClient("900");
        connect.onConnect(newPage);
        assertEquals("hidden", leaf(task.getCaseContent()).getString("id"));
        ArgumentCaptor<DisconnectListener> disconnect = ArgumentCaptor.forClass(DisconnectListener.class);
        verify(server).addDisconnectListener(disconnect.capture());
        disconnect.getValue().onDisconnect(oldPage);
        assertEquals(1, task.getClientNum());
        assertFalse(task.isLockedByClient());
        String refreshed = task.getCaseContent();
        String persisted = records.selectOne(900L).getCaseContent();
        clearInvocations(oldPage, records, broadcasts);

        queued.forEach(Runnable::run);

        assertEquals(refreshed, task.getCaseContent());
        assertEquals(persisted, records.selectOne(900L).getCaseContent());
        verify(records, never()).update(any(ExecRecord.class));
        verify(oldPage, never()).sendEvent(eq("edit_ack_event"), any(PushMessage.class));
        verify(broadcasts, never()).sendEvent(eq("edit_notify_event"), any(SocketIOClient.class), any(PushMessage.class));
        verify(oldPage).sendEvent(eq("stale_data_event"), any(PushMessage.class));
    }

    @Test
    public void queuedSavesCannotPersistAfterSourceRefreshAndDisconnect() throws Exception {
        RecordEntity task = task(900L);
        ExecutorService ingress = mock(ExecutorService.class);
        List<Runnable> queued = new ArrayList<>();
        doAnswer(call -> { queued.add((Runnable) call.getArgument(0)); return null; })
                .when(ingress).submit(any(Runnable.class));
        ConnectListener connect = connections(ingress);
        SocketIOClient oldPage = taskClient("900");
        connect.onConnect(oldPage);
        // Both save variants capture the room before being queued, unlike submitRoomWrite.
        for (String event : Arrays.asList("save", "autosave")) {
            ArgumentCaptor<DataListener> listener = ArgumentCaptor.forClass(DataListener.class);
            verify(server).addEventListener(eq(event), eq(EditMessage.class), listener.capture());
            listener.getValue().onData(oldPage,
                    new EditMessage(task.getCaseContent().replace("byte-blue", "ink-black"), "", 3), null);
        }
        stored = source(4, "新版用例");
        connect.onConnect(taskClient("900"));
        ArgumentCaptor<DisconnectListener> disconnect = ArgumentCaptor.forClass(DisconnectListener.class);
        verify(server).addDisconnectListener(disconnect.capture());
        disconnect.getValue().onDisconnect(oldPage);
        String refreshed = task.getCaseContent();
        String persisted = records.selectOne(900L).getCaseContent();
        clearInvocations(oldPage, records);

        queued.forEach(Runnable::run);

        assertEquals(refreshed, task.getCaseContent());
        assertEquals(persisted, records.selectOne(900L).getCaseContent());
        verify(records, never()).update(any(ExecRecord.class));
        verify(oldPage, times(2)).sendEvent(eq("stale_data_event"), any(PushMessage.class));
        ArgumentCaptor<PushMessage> acknowledgement = ArgumentCaptor.forClass(PushMessage.class);
        verify(oldPage, times(2)).sendEvent(eq("save_ack_event"), acknowledgement.capture());
        for (PushMessage result : acknowledgement.getAllValues()) assertEquals("conflict", result.getMessage());
    }

    @Test
    public void sourceTaskUndoAndRedoPersistAndRollbackOnFailure() {
        RoomEntity room = room();
        SocketIOClient editor = client("900");
        room.addClient(editor);
        String patch = "[{\"op\":\"replace\",\"path\":\"/base\",\"value\":2},"
                + "{\"op\":\"replace\",\"path\":\"/root/children/0/data/text\",\"value\":\"撤销内容\"}]";

        new UndoIngressTask(editor, server, room, egress, PushMessage.builder().message(patch).build()).run();

        assertEquals("撤销内容", leaf(stored).getString("text"));
        assertEquals(4, JSON.parseObject(stored).getIntValue("base"));
        verify(editor).sendEvent(eq("source_revision_event"), any(PushMessage.class));
        verify(editor, never()).sendEvent(eq("edit_ack_event"), any(PushMessage.class));
        String before = room.getCaseContent();
        failWrite = true;
        new RedoIngressTask(editor, server, room, egress, PushMessage.builder().message(patch.replace("撤销内容", "重做内容")).build()).run();
        assertEquals(before, room.getCaseContent());
        verify(broadcasts, never()).sendEvent(eq("redo"), eq(editor), any(PushMessage.class));
    }

    @Test
    public void ordinarySourceTagUndoAndRedoKeepMonotonicRevisionAndCanBeManuallySaved() {
        stored = stored.replace("\"priority\":1", "\"priority\":1,\"resource\":[\"synthetic-tag\"]");
        RoomEntity source = room();
        SocketIOClient editor = client(null);
        source.addClient(editor);
        CaseBackupMapper backups = mock(CaseBackupMapper.class);
        when(backups.selectByCaseId(12L, null, null)).thenReturn(Collections.emptyList());
        when(backups.insert(any())).thenReturn(1);
        String undo = "[{\"op\":\"remove\",\"path\":\"/root/children/0/data/resource\"},"
                + "{\"op\":\"replace\",\"path\":\"/base\",\"value\":2}]";

        new UndoIngressTask(editor, server, source, egress, PushMessage.builder().message(undo).build()).run();

        assertEquals(4, JSON.parseObject(source.getCaseContent()).getIntValue("base"));
        assertFalse(leaf(source.getCaseContent()).containsKey("resource"));
        assertEquals(3, JSON.parseObject(stored).getIntValue("base"));
        verify(editor).sendEvent(eq("source_revision_event"), any(PushMessage.class));
        new SaveIngressTask(editor, server, source, egress, EditMessage.builder()
                .caseContent(source.getCaseContent()).build(), backups).run();
        assertEquals(4, JSON.parseObject(stored).getIntValue("base"));
        assertFalse(leaf(stored).containsKey("resource"));
        verify(editor).sendEvent(eq("save_ack_event"), argThat((PushMessage value) -> "ok".equals(value.getMessage())));
        clearInvocations(editor);

        String redo = "[{\"op\":\"add\",\"path\":\"/root/children/0/data/resource\",\"value\":[\"synthetic-tag\"]},"
                + "{\"op\":\"replace\",\"path\":\"/base\",\"value\":3}]";
        new RedoIngressTask(editor, server, source, egress, PushMessage.builder().message(redo).build()).run();
        assertEquals(5, JSON.parseObject(source.getCaseContent()).getIntValue("base"));
        verify(editor).sendEvent(eq("source_revision_event"), any(PushMessage.class));
        new SaveIngressTask(editor, server, source, egress, EditMessage.builder()
                .caseContent(source.getCaseContent()).build(), backups).run();
        assertEquals(5, JSON.parseObject(stored).getIntValue("base"));
        assertEquals("synthetic-tag", leaf(stored).getJSONArray("resource").getString(0));
        verify(editor).sendEvent(eq("save_ack_event"), argThat((PushMessage value) -> "ok".equals(value.getMessage())));
    }

    @Test
    public void executionRoomHistoryRetainsExistingVersionAndAcknowledgementContract() {
        RecordEntity execution = task(900L);
        SocketIOClient executor = taskClient("900");
        execution.addClient(executor);
        String undo = "[{\"op\":\"replace\",\"path\":\"/base\",\"value\":2}]";

        new UndoIngressTask(executor, server, execution, egress, PushMessage.builder().message(undo).build()).run();

        assertEquals(2, JSON.parseObject(execution.getCaseContent()).getIntValue("base"));
        verify(executor, never()).sendEvent(eq("source_revision_event"), any(PushMessage.class));
        verify(broadcasts).sendEvent(eq("undo"), eq(executor), any(PushMessage.class));
    }

    @Test
    public void laggingSourceReaderCannotOverwriteSavedHistoryAfterOwnerUnlocks() {
        RoomEntity source = room();
        SocketIOClient owner = client(null);
        SocketIOClient reader = client(null);
        source.addClient(owner);
        source.addClient(reader);
        String undo = "[{\"op\":\"replace\",\"path\":\"/root/children/0/data/text\",\"value\":\"history-value\"},"
                + "{\"op\":\"replace\",\"path\":\"/base\",\"value\":2}]";
        new UndoIngressTask(owner, server, source, egress, PushMessage.builder().message(undo).build()).run();
        CaseBackupMapper backups = mock(CaseBackupMapper.class);
        when(backups.selectByCaseId(12L, null, null)).thenReturn(Collections.emptyList());
        when(backups.insert(any())).thenReturn(1);
        new SaveIngressTask(owner, server, source, egress, EditMessage.builder()
                .caseContent(source.getCaseContent()).build(), backups).run();
        assertEquals(4, JSON.parseObject(stored).getIntValue("base"));
        source.clientUnlock();
        clearInvocations(reader, broadcasts);
        String saved = stored;

        edit(source, reader);

        assertEquals(saved, stored);
        assertEquals(saved, source.getCaseContent());
        verify(reader).sendEvent(eq("stale_data_event"), any(PushMessage.class));
        verify(reader, never()).sendEvent(eq("edit_ack_event"), any(PushMessage.class));
        verify(broadcasts, never()).sendEvent(eq("edit_notify_event"), any(SocketIOClient.class), any(PushMessage.class));
    }

    @Test
    public void sameBaseSourceChangeRefreshesTaskWithoutChangingOrdinarySaveAcknowledgement() {
        RecordEntity task = task(900L);
        ConnectListener connect = connections();
        SocketIOClient editor = client(null);
        connect.onConnect(editor);
        RoomEntity source = SocketIOServiceImpl.clientRoomMap.get(editor);
        CaseBackupMapper backups = mock(CaseBackupMapper.class);
        when(backups.selectByCaseId(12L, null, null)).thenReturn(Collections.emptyList());
        when(backups.insert(any())).thenReturn(1);

        new SaveIngressTask(editor, server, source, egress, EditMessage.builder()
                .caseContent(source.getCaseContent().replace("byte-blue", "ink-black")).build(), backups).run();

        assertEquals(3, JSON.parseObject(stored).getIntValue("base"));
        verify(editor, never()).sendEvent(eq("edit_ack_event"), any(PushMessage.class));
        verify(broadcasts).sendEvent(eq("source_case_updated"), any(PushMessage.class));
        assertTrue(task.refreshFromSourceIfChanged());
        assertEquals(3, task.getSourceVersion());
        assertEquals(4, JSON.parseObject(task.getCaseContent()).getIntValue("base"));
        assertEquals("byte-blue", JSON.parseObject(task.getCaseContent()).getString("theme"));
        assertFalse(task.refreshFromSourceIfChanged());
    }

    @Test
    public void caseDesignCommandPersistsBeforeBroadcastAndRestoresOnFailure() {
        RoomEntity room = room();
        SocketIOClient editor = client("900");
        room.addClient(editor);
        CaseDesignMessage generated = CaseDesignMessage.builder().method("pariwise").nodeId("leaf")
                .message("{\"维度甲\":\"1\",\"维度乙\":\"2\"}").build();

        new CaseDesignIngressTask(editor, server, room, egress, generated).run();

        assertEquals(1, JSON.parseObject(stored).getJSONObject("root").getJSONArray("children")
                .getJSONObject(0).getJSONArray("children").size());
        String before = room.getCaseContent();
        failWrite = true;
        reset(broadcasts);
        new CaseDesignIngressTask(editor, server, room, egress, generated).run();
        assertEquals(before, room.getCaseContent());
        verify(broadcasts, never()).sendEvent(eq("edit_notify_event"), any(PushMessage.class));
    }

    @Test
    public void failedStoredSourceEditNeverNotifiesAnyTask() {
        task(900L);
        ConnectListener connect = connections();
        SocketIOClient editor = client("900");
        connect.onConnect(editor);
        failWrite = true;

        edit(SocketIOServiceImpl.clientRoomMap.get(editor), editor);

        verify(broadcasts, never()).sendEvent(eq("source_case_updated"), any(PushMessage.class));
    }

    @Test
    public void filteredTaskReconnectKeepsFilterAndSourceVersionIndependentOfExecutionBase() {
        RecordEntity task = task(900L);
        ExecRecord record = records.selectOne(900L);
        record.setChooseContent("{\"priority\":[\"1\"]}");
        record.setCaseContent("{\"leaf\":9,\"__notes\":{\"leaf\":\"执行备注\"}}");
        task.setCaseContent(task.getCaseContent().replace("\"base\":3", "\"base\":50"));
        assertEquals(3, task.getSourceVersion());
        stored = source(4, "新版用例");

        assertTrue(task.refreshFromSourceIfChanged());

        assertEquals(4, task.getSourceVersion());
        assertEquals(51, JSON.parseObject(task.getCaseContent()).getIntValue("base"));
        assertEquals(1, JSON.parseObject(task.getCaseContent()).getJSONObject("root").getJSONArray("children").size());
        assertEquals(9, leaf(task.getCaseContent()).getIntValue("progress"));
        assertEquals("执行备注", leaf(task.getCaseContent()).getString("note"));
        assertEquals("{\"priority\":[\"1\"]}", record.getChooseContent());
        assertFalse(task.refreshFromSourceIfChanged());
        assertEquals(2, JSON.parseObject(stored).getJSONObject("root").getJSONArray("children").size());
        assertFalse(stored.contains("progress"));
        assertFalse(stored.contains("执行备注"));
    }

    @Test
    public void queuedRefreshNotificationNeverMarksNewlyJoinedTaskPageStale() {
        task(900L);
        List<Runnable> queued = new ArrayList<>();
        doAnswer(call -> { queued.add((Runnable) call.getArgument(0)); return null; })
                .when(egress).submit(any(Runnable.class));
        ConnectListener connect = connections();
        SocketIOClient oldPage = taskClient("900");
        connect.onConnect(oldPage);
        stored = source(4, "新版用例");
        SocketIOClient newPage = taskClient("900");
        connect.onConnect(newPage);
        // BroadcastOperations 在异步任务真正执行时才选择成员；此时新页面已经加入房间。
        doAnswer(call -> {
            oldPage.sendEvent("stale_data_event", (PushMessage) call.getArgument(1));
            newPage.sendEvent("stale_data_event", (PushMessage) call.getArgument(1));
            return null;
        }).when(broadcasts).sendEvent(eq("stale_data_event"), any(PushMessage.class));

        queued.forEach(Runnable::run);

        verify(oldPage).sendEvent(eq("stale_data_event"), any(PushMessage.class));
        verify(newPage, never()).sendEvent(eq("stale_data_event"), any(PushMessage.class));
    }

    @Test
    public void separateTasksExecuteIndependentlyWhileSourceEditorOwnsContentLock() {
        RecordEntity first = task(900L);
        RecordEntity second = task(901L);
        SocketIOClient firstPage = taskClient("900");
        SocketIOClient secondPage = taskClient("901");
        first.addClient(firstPage);
        second.addClient(secondPage);
        RoomEntity source = room();
        SocketIOClient sourceEditor = client("900");
        source.addClient(sourceEditor);
        edit(source, sourceEditor);

        new EditIngressTask(firstPage, server, first, egress, new EditMessage("",
                "[[{\"op\":\"add\",\"path\":\"/root/children/0/data/progress\",\"value\":9}]]", 3)).run();
        new EditIngressTask(secondPage, server, second, egress, new EditMessage("",
                "[[{\"op\":\"add\",\"path\":\"/root/children/0/data/progress\",\"value\":1}]]", 3)).run();

        assertEquals(9, JSON.parseObject(records.selectOne(900L).getCaseContent()).getIntValue("leaf"));
        assertEquals(1, JSON.parseObject(records.selectOne(901L).getCaseContent()).getIntValue("leaf"));
        assertTrue(first.lockByClient(firstPage));
        assertTrue(second.lockByClient(secondPage));
        assertTrue(source.lockByClient(sourceEditor));
        assertFalse(stored.contains("progress"));
        assertEquals("新版用例", leaf(stored).getString("text"));
        assertEquals(3, first.getSourceVersion());
        assertEquals(3, second.getSourceVersion());
    }

    @Test
    public void notifierFailureDoesNotUndoAlreadyStoredSourcePatch() {
        task(900L);
        ConnectListener connect = connections();
        SocketIOClient editor = client("900");
        connect.onConnect(editor);
        doThrow(new IllegalStateException("模拟通知通道关闭"))
                .when(broadcasts).sendEvent(eq("source_case_updated"), any(PushMessage.class));

        edit(SocketIOServiceImpl.clientRoomMap.get(editor), editor);

        assertEquals("新版用例", leaf(stored).getString("text"));
        assertEquals(stored, SocketIOServiceImpl.clientRoomMap.get(editor).getCaseContent());
        verify(editor).sendEvent(eq("edit_ack_event"), any(PushMessage.class));
    }

    @Test
    public void disconnectingSourceEditorReleasesSharedSourceLockWithoutTouchingTaskLock() {
        RecordEntity task = task(900L);
        SocketIOClient taskPage = taskClient("900");
        task.addClient(taskPage);
        ConnectListener connect = connections();
        SocketIOClient editor = client("900");
        SocketIOClient reader = client(null);
        connect.onConnect(editor);
        connect.onConnect(reader);
        RoomEntity source = SocketIOServiceImpl.clientRoomMap.get(editor);
        ArgumentCaptor<DisconnectListener> disconnect = ArgumentCaptor.forClass(DisconnectListener.class);
        verify(server).addDisconnectListener(disconnect.capture());

        disconnect.getValue().onDisconnect(editor);

        assertFalse(source.isLockedByClient());
        assertEquals(1, source.getClientNum());
        assertFalse(SocketIOServiceImpl.clientRoomMap.containsKey(editor));
        assertTrue(task.lockByClient(taskPage));
        new LockIngressTask(reader, server, source, egress, PushMessage.builder().message("lock").build()).run();
        assertTrue(source.lockByClient(reader));
    }

    @Test
    public void normalizedLegacyNullTagsDoNotTurnEditorsOwnSaveIntoConflict() {
        stored = stored.replace("\"priority\":1", "\"priority\":1,\"resource\":null");
        RoomEntity source = room();
        SocketIOClient editor = client("900");
        source.addClient(editor);
        edit(source, editor);
        CaseBackupMapper backups = mock(CaseBackupMapper.class);
        when(backups.selectByCaseId(12L, null, null)).thenReturn(Collections.emptyList());
        when(backups.insert(any())).thenReturn(1);
        String clientContent = source.getCaseContent().replace("\"priority\":1", "\"priority\":1,\"resource\":null");
        clearInvocations(editor);

        new SaveIngressTask(editor, server, source, egress, EditMessage.builder().caseContent(clientContent).build(), backups).run();

        ArgumentCaptor<PushMessage> acknowledgement = ArgumentCaptor.forClass(PushMessage.class);
        verify(editor).sendEvent(eq("save_ack_event"), acknowledgement.capture());
        assertEquals("ok", acknowledgement.getValue().getMessage());
        assertEquals("新版用例", leaf(stored).getString("text"));
        assertFalse(leaf(stored).containsKey("resource"));
    }

    @Test
    public void unchangedLegacyNullTagsAreStillANoOpSave() {
        stored = stored.replace("\"priority\":1", "\"priority\":1,\"resource\":null");
        String before = stored;
        RoomEntity source = room();
        try {
            source.persistCaseContent(null);
        } catch (Exception error) {
            fail("未变化的旧用例不能被当作版本冲突");
        }
        assertEquals(before, stored);
        verify(cases, never()).update(any(TestCase.class));
    }

    private ConnectListener connections() {
        return connections(egress);
    }

    private ConnectListener connections(ExecutorService ingress) {
        SocketIOServiceImpl service = new SocketIOServiceImpl();
        ReflectionTestUtils.setField(service, "socketIOServer", server);
        ReflectionTestUtils.setField(service, "caseMapper", cases);
        ReflectionTestUtils.setField(service, "recordMapper", records);
        ReflectionTestUtils.setField(service, "executorEgressService", egress);
        ReflectionTestUtils.setField(service, "executorIngressService", ingress);
        service.start();
        ArgumentCaptor<ConnectListener> listener = ArgumentCaptor.forClass(ConnectListener.class);
        verify(server).addConnectListener(listener.capture());
        return listener.getValue();
    }

    private RecordEntity task(Long id) {
        ExecRecord record = new ExecRecord();
        record.setId(id);
        record.setCaseId(12L);
        record.setExecutors("");
        record.setCaseContent(RecordEntity.initialAppearanceRecord(stored));
        when(records.selectOne(id)).thenReturn(record);
        String roomId = String.valueOf(com.xiaoju.framework.util.BitBaseUtil.mergeLong(id, 12L));
        return RecordFactory.getRoom(roomId, 12L, cases, id, records);
    }

    private SocketIOClient taskClient(String id) {
        SocketIOClient client = client(null);
        when(client.getHandshakeData().getSingleUrlParam("recordId")).thenReturn(id);
        return client;
    }

    private void edit(RoomEntity room, SocketIOClient editor) {
        new EditIngressTask(editor, server, room, egress, EditMessage.builder()
                .caseVersion(3).caseContent(room.getCaseContent())
                .patch("[[{\"op\":\"replace\",\"path\":\"/root/children/0/data/text\",\"value\":\"新版用例\"}]]")
                .build()).run();
    }

    private RoomEntity room() { return new RoomEntity("12", 12L, cases); }

    private SocketIOClient client(String taskId) {
        SocketIOClient client = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        when(client.getSessionId()).thenReturn(UUID.randomUUID());
        when(client.getHandshakeData()).thenReturn(handshake);
        when(handshake.getSingleUrlParam("caseId")).thenReturn("12");
        when(handshake.getSingleUrlParam("recordId")).thenReturn("undefined");
        when(handshake.getSingleUrlParam("sourceTaskId")).thenReturn(taskId);
        when(handshake.getSingleUrlParam("build")).thenReturn(PageBuildVersion.current());
        when(handshake.getSingleUrlParam("user")).thenReturn("${LOGIN_ACCOUNT}");
        return client;
    }

    private static String source(int base, String text) {
        return "{\"base\":" + base + ",\"theme\":\"byte-blue\",\"root\":{\"data\":{\"id\":\"root\",\"text\":\"根节点\"},"
                + "\"children\":[{\"data\":{\"id\":\"leaf\",\"text\":\"" + text + "\",\"priority\":1},\"children\":[]},"
                + "{\"data\":{\"id\":\"hidden\",\"text\":\"未分配节点\",\"priority\":2},\"children\":[]}]}}";
    }

    private static TestCase copy(String content) {
        TestCase source = new TestCase();
        source.setId(12L);
        source.setCaseContent(content);
        return source;
    }

    private static JSONObject leaf(String content) {
        return JSON.parseObject(content).getJSONObject("root").getJSONArray("children").getJSONObject(0).getJSONObject("data");
    }
}
