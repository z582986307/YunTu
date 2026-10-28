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

    /** 只读查询；不能为查询锁创建房间或加入源用例会话。 */
    public static RoomEntity findExistingSourceRoom(Long caseId) {
        return roomEntityMap.values().stream()
                .filter(room -> caseId.equals(room.getCaseId())).findFirst().orElse(null);
    }

    public static boolean isCaseBeingEdited(Long caseId) {
        return roomEntityMap.values().stream()
                .anyMatch(room -> caseId.equals(room.getCaseId()) && room.getClientNum() > 0);
    }
}
