package com.xiaoju.framework.service.impl;

import java.util.function.Predicate;

final class UniqueTitleResolver {
    private UniqueTitleResolver() { }

    static String nextAvailable(String base, Predicate<String> occupied) {
        if (!occupied.test(base)) return base;
        for (int number = 1; number < Integer.MAX_VALUE; number++) {
            String candidate = base + "（" + number + "）";
            if (!occupied.test(candidate)) return candidate;
        }
        throw new IllegalStateException("无法生成不重复的任务名称");
    }
}
