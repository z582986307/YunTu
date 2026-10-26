package com.xiaoju.framework.handler;

import com.xiaoju.framework.mapper.ExecRecordMapper;
import com.xiaoju.framework.mapper.TestCaseMapper;

import java.util.concurrent.ConcurrentHashMap;
import java.util.Collection;
import java.util.stream.Collectors;

public class RecordFactory {
    static ConcurrentHashMap<String, RecordEntity> recordEntityMap = new ConcurrentHashMap<>();

    public static RecordEntity getRoom(String roomId, Long caseId, TestCaseMapper caseMapper, Long recordId, ExecRecordMapper recordMapper) {
        return recordEntityMap.computeIfAbsent(roomId, id -> new RecordEntity(id, caseId, caseMapper, recordId, recordMapper));
    }

    public static void clearRoom(String roomId) {
        recordEntityMap.remove(roomId);
    }

    public static Collection<RecordEntity> roomsForCase(Long caseId) {
        return recordEntityMap.values().stream()
                .filter(room -> caseId.equals(room.getCaseId())).collect(Collectors.toList());
    }
}
