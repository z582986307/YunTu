package com.xiaoju.framework.entity.request.cases;

import com.xiaoju.framework.entity.request.ParamValidate;
import lombok.Data;

@Data
public class RestoreBackupReq implements ParamValidate {
    private Long caseId;
    private Long backupId;
    private String modifier;

    @Override
    public void validate() {
        if (caseId == null || caseId <= 0 || backupId == null || backupId <= 0 ||
                modifier == null || modifier.trim().isEmpty()) {
            throw new IllegalArgumentException("恢复参数不完整");
        }
    }
}
