package com.xiaoju.framework.controller;

import com.xiaoju.framework.service.FileService;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class ExportFailureResponseTests {
    @Test
    public void missingImageShowsReadableErrorInsteadOfBlankDownloadTab() throws Exception {
        FileService files = mock(FileService.class);
        when(files.exportXmindFile(eq(2209L), any())).thenThrow(new IllegalStateException("导出图片失败：图片文件不存在或路径非法"));
        UploadController controller = new UploadController();
        ReflectionTestUtils.setField(controller, "fileService", files);
        MockHttpServletResponse response = new MockHttpServletResponse();

        controller.exportXmind(2209L, new MockHttpServletRequest(), response);

        assertEquals(500, response.getStatus());
        assertTrue(response.getContentType().startsWith("text/plain"));
        assertTrue(response.getContentAsString().contains("图片文件"));
    }

    @Test
    public void legacyFaviconPathPointsToCurrentBrand() throws Exception {
        MockHttpServletResponse response = MockMvcBuilders.standaloneSetup(new WebController())
                .build().perform(get("/favicon.ico")).andReturn().getResponse();
        assertEquals(302, response.getStatus());
        assertEquals("/favicon.svg?v=yuntu-20261022", response.getRedirectedUrl());
    }
}
