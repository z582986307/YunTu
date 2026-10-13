package com.xiaoju.framework.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiaoju.framework.entity.persistent.CaseBackup;
import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.mapper.CaseBackupMapper;
import com.xiaoju.framework.mapper.TestCaseMapper;
import com.xiaoju.framework.handler.RoomEntity;
import com.xiaoju.framework.handler.RoomFactory;
import com.xiaoju.framework.service.impl.CaseBackupServiceImpl;
import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.HandshakeData;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class CaseBackupRestoreTests {
    private final CaseBackupMapper backups = mock(CaseBackupMapper.class);
    private final TestCaseMapper cases = mock(TestCaseMapper.class);
    private final CaseBackupServiceImpl service = new CaseBackupServiceImpl();

    public CaseBackupRestoreTests() {
        ReflectionTestUtils.setField(service, "caseBackupMapper", backups);
        ReflectionTestUtils.setField(service, "caseMapper", cases);
    }

    private CaseBackup backup(long id, long caseId, String content) {
        CaseBackup result = new CaseBackup();
        result.setId(id);
        result.setCaseId(caseId);
        result.setCaseContent(content);
        result.setCreator("tester");
        result.setGmtCreated(new Date(0));
        return result;
    }

    @Test
    public void historyKeepsVersionsWithSameBaseWithoutSendingFullMindMaps() {
        when(backups.selectHistoryByCaseId(7L, null, null)).thenReturn(Arrays.asList(
                backup(12L, 7L, null), backup(11L, 7L, null)));
        List<CaseBackup> history = service.getBackupByCaseId(7L, null, null);
        assertEquals(2, history.size());
        assertEquals(Long.valueOf(12L), history.get(0).getId());
        assertNull(history.get(0).getCaseContent());
    }

    @Test
    public void restoringPreservesCurrentContentAsHistoryAndAdvancesVersion() throws Exception {
        String current = "{\"base\":5,\"root\":{\"data\":{\"text\":\"现在\"},\"children\":[]}}";
        String old = "{\"base\":3,\"root\":{\"data\":{\"text\":\"过去\"},\"children\":[]}}";
        TestCase testCase = new TestCase();
        testCase.setId(7L);
        testCase.setCaseContent(current);
        when(cases.selectOne(7L)).thenReturn(testCase);
        when(cases.update(testCase)).thenReturn(1);
        when(backups.selectByBackupId(11L)).thenReturn(backup(11L, 7L, old));
        when(backups.insert(any(CaseBackup.class))).thenReturn(1);

        service.restoreBackup(7L, 11L, "tester");

        JsonNode restored = new ObjectMapper().readTree(testCase.getCaseContent());
        assertEquals("过去", restored.path("root").path("data").path("text").asText());
        assertEquals(6, restored.path("base").asInt());
        org.mockito.ArgumentCaptor<CaseBackup> saved = org.mockito.ArgumentCaptor.forClass(CaseBackup.class);
        verify(backups, times(2)).insert(saved.capture());
        assertEquals(current, saved.getAllValues().get(0).getCaseContent());
        assertEquals(testCase.getCaseContent(), saved.getAllValues().get(1).getCaseContent());
    }

    @Test
    public void cannotRestoreVersionFromAnotherCase() {
        TestCase testCase = new TestCase();
        testCase.setId(7L);
        testCase.setCaseContent("{\"base\":5,\"root\":{\"data\":{\"text\":\"现在\"},\"children\":[]}}");
        when(cases.selectOne(7L)).thenReturn(testCase);
        when(backups.selectByBackupId(11L)).thenReturn(backup(11L, 8L, "{}"));
        try {
            service.restoreBackup(7L, 11L, "tester");
            fail("不能恢复其他用例的版本");
        } catch (RuntimeException expected) {
            verify(cases, never()).update(any(TestCase.class));
            verify(backups, never()).insert(any(CaseBackup.class));
        }
    }

    @Test
    public void comparisonProducesAViewableMindMapForTwoVersions() {
        when(backups.selectByBackupId(11L)).thenReturn(backup(11L, 7L,
                "{\"base\":1,\"root\":{\"data\":{\"text\":\"旧内容\"},\"children\":[]}}"));
        when(backups.selectByBackupId(12L)).thenReturn(backup(12L, 7L,
                "{\"base\":2,\"root\":{\"data\":{\"text\":\"新内容\"},\"children\":[]}}"));
        JsonNode comparison = service.getCaseDiff(12L, 11L);
        assertNotNull(comparison);
        assertTrue(comparison.path("content").path("root").path("data").path("text").asText()
                .contains("新内容"));
    }

    @Test
    public void activeEditorPreventsRestoringOverUnsavedChanges() {
        TestCase testCase = new TestCase();
        testCase.setId(7L);
        testCase.setCaseContent("{\"base\":5,\"root\":{\"data\":{\"text\":\"未保存\"},\"children\":[]}}");
        when(cases.selectOne(7L)).thenReturn(testCase);
        RoomEntity room = RoomFactory.getRoom("7", 7L, cases);
        SocketIOClient client = mock(SocketIOClient.class);
        HandshakeData handshake = mock(HandshakeData.class);
        when(client.getSessionId()).thenReturn(UUID.randomUUID());
        when(client.getHandshakeData()).thenReturn(handshake);
        room.addClient(client);
        try {
            service.restoreBackup(7L, 11L, "tester");
            fail("编辑页在线时不能恢复");
        } catch (RuntimeException expected) {
            verify(cases, never()).update(any(TestCase.class));
            verify(backups, never()).insert(any(CaseBackup.class));
        } finally {
            RoomFactory.clearRoom("7");
        }
    }
}
