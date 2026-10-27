package com.xiaoju.framework;

import org.junit.Test;
import com.corundumstudio.socketio.SocketIOServer;
import com.xiaoju.framework.config.SocketIOConfig;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.support.PropertySourcesPlaceholderConfigurer;
import org.springframework.core.env.PropertiesPropertySource;

import java.io.InputStream;
import java.util.Properties;

import static org.junit.Assert.assertEquals;

public class SocketPayloadConfigurationTests {

    @Test
    public void websocketPayloadLimitsSupportLargeCaseSets() throws Exception {
        assertEffectiveLimits(socketProperties(), 16777216, 16777216);
    }

    @Test
    public void frameAndHttpOverridesReachTheActualServerIndependently() throws Exception {
        Properties properties = socketProperties();
        properties.setProperty("socketio.maxFramePayloadLength", "5242880");
        properties.setProperty("socketio.maxHttpContentLength", "9437184");
        assertEffectiveLimits(properties, 5242880, 9437184);
    }

    @Test
    public void omittedPayloadPropertiesKeepFiniteLargeCaseDefaults() throws Exception {
        Properties properties = socketProperties();
        properties.remove("socketio.maxFramePayloadLength");
        properties.remove("socketio.maxHttpContentLength");
        assertEffectiveLimits(properties, 16777216, 16777216);
    }

    private Properties socketProperties() throws Exception {
        Properties application = new Properties();
        try (InputStream input = getClass().getClassLoader().getResourceAsStream("application.properties")) {
            application.load(input);
        }
        Properties properties = new Properties();
        for (String name : application.stringPropertyNames()) {
            if (name.startsWith("socketio.")) properties.setProperty(name, application.getProperty(name));
        }
        properties.setProperty("socketio.port", "0");
        return properties;
    }

    private void assertEffectiveLimits(Properties properties, int frameLimit, int httpLimit) {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new PropertiesPropertySource("socket-test", properties));
            context.register(PropertySourcesPlaceholderConfigurer.class, SocketIOConfig.class);
            // 不注册业务启动器、不监听端口；未 start 的 netty server 不能调用 stop。
            context.addBeanFactoryPostProcessor(factory ->
                factory.getBeanDefinition("socketIOServer").setDestroyMethodName(""));
            context.refresh();
            SocketIOServer server = context.getBean(SocketIOServer.class);
            assertEquals("实际 WebSocket 帧上限必须来自 Spring 配置", frameLimit,
                server.getConfiguration().getMaxFramePayloadLength());
            assertEquals("实际 HTTP 内容上限必须来自 Spring 配置", httpLimit,
                server.getConfiguration().getMaxHttpContentLength());
        }
    }
}
