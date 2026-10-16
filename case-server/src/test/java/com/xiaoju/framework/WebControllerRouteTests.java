package com.xiaoju.framework;

import com.xiaoju.framework.controller.WebController;
import org.junit.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

public class WebControllerRouteTests {
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new WebController()).build();

    @Test
    public void currentVersionComparisonSupportsDirectRefresh() throws Exception {
        mvc.perform(get("/caseManager/currentContrast/7/12"))
                .andExpect(status().isOk())
                .andExpect(view().name("index"));
    }
}
