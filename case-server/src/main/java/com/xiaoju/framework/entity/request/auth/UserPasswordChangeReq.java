package com.xiaoju.framework.entity.request.auth;

import lombok.Data;

@Data
public class UserPasswordChangeReq {
    private String oldPassword;
    private String newPassword;
}
