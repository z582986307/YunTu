package com.xiaoju.framework.service.impl;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class UniqueTitleResolverTest {
    @Test
    public void addsFirstFreeChineseNumberSuffix() {
        assertEquals("客户管理（3）", UniqueTitleResolver.nextAvailable("客户管理",
                title -> title.equals("客户管理") || title.equals("客户管理（1）") || title.equals("客户管理（2）")));
    }

    @Test
    public void leavesUnusedNameAlone() {
        assertEquals("新任务", UniqueTitleResolver.nextAvailable("新任务", title -> false));
    }

    @Test
    public void taskSuggestionStartsAtOneEvenWithoutExistingTask() {
        assertEquals("客户管理（1）", UniqueTitleResolver.nextAvailableNumbered("客户管理", title -> false));
        assertEquals("客户管理（3）", UniqueTitleResolver.nextAvailableNumbered("客户管理",
                title -> title.equals("客户管理（1）") || title.equals("客户管理（2）")));
    }
}
