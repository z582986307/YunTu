package com.xiaoju.framework.service;

import com.xiaoju.framework.entity.dto.User;
import com.xiaoju.framework.entity.exception.CaseServerException;
import com.xiaoju.framework.entity.request.auth.UserPasswordChangeReq;
import com.xiaoju.framework.mapper.UserMapper;
import com.xiaoju.framework.service.impl.UserServiceImpl;
import com.xiaoju.framework.util.CodecUtils;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class UserPasswordChangeTests {
    @Test
    public void changesOnlyCurrentUsersPasswordAfterCheckingOldPassword() {
        UserMapper mapper = mock(UserMapper.class);
        UserServiceImpl service = new UserServiceImpl();
        ReflectionTestUtils.setField(service, "userMapper", mapper);
        User user = new User();
        user.setId(7L);
        user.setUsername("sample");
        user.setSalt("old-salt");
        user.setPassword(CodecUtils.md5Hex("old-example", "old-salt"));
        when(mapper.selectByUserName("sample")).thenReturn(user);

        UserPasswordChangeReq req = new UserPasswordChangeReq();
        req.setOldPassword("old-example");
        req.setNewPassword("new-example");
        service.changePassword("sample", req);

        assertNotEquals("old-salt", user.getSalt());
        assertEquals(CodecUtils.md5Hex("new-example", user.getSalt()), user.getPassword());
        verify(mapper).updateByPrimaryKeySelective(user);
    }

    @Test
    public void rejectsWrongOldPasswordWithoutSaving() {
        UserMapper mapper = mock(UserMapper.class);
        UserServiceImpl service = new UserServiceImpl();
        ReflectionTestUtils.setField(service, "userMapper", mapper);
        User user = new User();
        user.setSalt("old-salt");
        user.setPassword(CodecUtils.md5Hex("old-example", "old-salt"));
        when(mapper.selectByUserName("sample")).thenReturn(user);
        UserPasswordChangeReq req = new UserPasswordChangeReq();
        req.setOldPassword("wrong-example");
        req.setNewPassword("new-example");

        try {
            service.changePassword("sample", req);
            fail("expected rejection");
        } catch (CaseServerException expected) {
            verify(mapper, never()).updateByPrimaryKeySelective(any(User.class));
        }
    }
}
