package com.xiaoju.framework.service;

import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.service.impl.FileServiceImpl;
import org.dom4j.Document;
import org.dom4j.io.SAXReader;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.File;

import static org.junit.Assert.*;

public class XmindExportStyleTests {
    @Test
    public void exportsRightFacingBlueLogicMap() throws Exception {
        File output = new File("target/xmind-export-style-test");
        assertTrue(output.isDirectory() || output.mkdirs());
        TestCase testCase = new TestCase();
        testCase.setCaseContent("{\"root\":{\"data\":{\"id\":\"root\",\"text\":\"中心\"},\"children\":[{\"data\":{\"id\":\"child\",\"text\":\"分支\"},\"children\":[{\"data\":{\"id\":\"leaf\",\"text\":\"用例\"},\"children\":[]}]}]}}");
        FileServiceImpl service = new FileServiceImpl();

        ReflectionTestUtils.invokeMethod(service, "writeContentXml", testCase, output.getPath());
        ReflectionTestUtils.invokeMethod(service, "writeStylesXml", output.getPath());
        ReflectionTestUtils.invokeMethod(service, "writeManifestXml", output.getPath());

        Document content = new SAXReader().read(new File(output, "content.xml"));
        Document styles = new SAXReader().read(new File(output, "styles.xml"));
        Document manifest = new SAXReader().read(new File(output, "META-INF/manifest.xml"));
        assertEquals("xmap-content", content.getRootElement().getName());
        assertEquals("urn:xmind:xmap:xmlns:content:2.0", content.getRootElement().getNamespaceURI());
        assertEquals("urn:xmind:xmap:xmlns:content:2.0", content.getRootElement().element("sheet").getNamespaceURI());
        assertEquals("org.xmind.ui.logic.right", content.getRootElement().element("sheet").element("topic").attributeValue("structure-class"));
        assertNotNull(content.getRootElement().element("sheet").element("topic").attributeValue("style-id"));
        assertEquals("yuntu-main", content.getRootElement().element("sheet").element("topic")
                .element("children").element("topics").element("topic").attributeValue("style-id"));
        assertEquals("yuntu-sub", content.getRootElement().element("sheet").element("topic")
                .element("children").element("topics").element("topic")
                .element("children").element("topics").element("topic").attributeValue("style-id"));
        assertEquals("xmap-styles", styles.getRootElement().getName());
        assertEquals("urn:xmind:xmap:xmlns:style:2.0", styles.getRootElement().getNamespaceURI());
        assertEquals("urn:xmind:xmap:xmlns:style:2.0", styles.getRootElement().element("automatic-styles").getNamespaceURI());
        assertTrue(styles.asXML().contains("line-color=\"#000000\""));
        assertTrue(styles.asXML().contains("border-line-color=\"#000000\""));
        assertTrue(styles.asXML().contains("line-class=\"org.xmind.branchConnection.elbow\""));
        assertTrue(styles.asXML().contains("shape-class=\"org.xmind.topicShape.rect\""));
        assertTrue(manifest.asXML().contains("styles.xml"));
        assertEquals("urn:xmind:xmap:xmlns:manifest:1.0", manifest.getRootElement().getNamespaceURI());
    }
}
