package com.xiaoju.framework.handler;

import com.xiaoju.framework.mapper.ExecRecordMapper;
import com.xiaoju.framework.mapper.TestCaseMapper;

import java.util.concurrent.ConcurrentHashMap;

public class RoomFactory {
    static ConcurrentHashMap<String, RoomEntity> roomEntityMap = new ConcurrentHashMap<>();
    static ConcurrentHashMap<String, RecordEntity> recordEntityMap = new ConcurrentHashMap<>();

    public static RoomEntity getRoom(String roomId, Long caseId, TestCaseMapper caseMapper) {
        return roomEntityMap.computeIfAbsent(roomId, id -> new RoomEntity(id, caseId, caseMapper));
    }

    public static void clearRoom(String roomId) {
        roomEntityMap.remove(roomId);
    }

    public static boolean isCaseBeingEdited(Long caseId) {
        return roomEntityMap.values().stream()
                .anyMatch(room -> caseId.equals(room.getCaseId()) && room.getClientNum() > 0);
    }
}
