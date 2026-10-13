package com.xiaoju.framework.service;

import com.xiaoju.framework.mapper.UserMapper;
import com.xiaoju.framework.service.impl.UserServiceImpl;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.*;

public class UserSuggestionTests {
    @Test
    public void searchReturnsOnlyRegisteredUsernamesAndSupportsPartialInput() {
        UserMapper mapper = mock(UserMapper.class);
        UserServiceImpl service = new UserServiceImpl();
        ReflectionTestUtils.setField(service, "userMapper", mapper);
        when(mapper.findUsernames("ming", 20)).thenReturn(Arrays.asList("xiaoming", "mingyu"));
        assertEquals(Arrays.asList("xiaoming", "mingyu"), service.suggestUsers(" ming "));
        assertEquals(Collections.emptyList(), service.suggestUsers(" "));
        verify(mapper, never()).findUsernames("", 20);
    }
}
