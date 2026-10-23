package com.xiaoju.framework.handler;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class PageBuildVersionTests {
    @Test
    public void comparesActualBundledMainScript() {
        String html = "<html><script src=\"/umi.abc123.js\"></script></html>";
        assertEquals("/umi.abc123.js", PageBuildVersion.extract(html));
        assertTrue(PageBuildVersion.matches("/umi.abc123.js", "/umi.abc123.js"));
        assertFalse(PageBuildVersion.matches("/umi.abc123.js", "/umi.old.js"));
        assertFalse(PageBuildVersion.matches("/umi.abc123.js", null));
        assertTrue(PageBuildVersion.current() != null && PageBuildVersion.current().startsWith("/umi."));
    }
}
