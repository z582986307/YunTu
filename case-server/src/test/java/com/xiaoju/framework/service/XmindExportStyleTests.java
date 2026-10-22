package com.xiaoju.framework.service;

import com.xiaoju.framework.entity.persistent.TestCase;
import com.xiaoju.framework.service.impl.FileServiceImpl;
import org.dom4j.Document;
import org.dom4j.io.SAXReader;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.File;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import javax.imageio.ImageIO;

import static org.junit.Assert.*;

public class XmindExportStyleTests {
    @Test
    public void exportsRightFacingBlueLogicMap() throws Exception {
        File output = new File("target/xmind-export-style-test");
        assertTrue(output.isDirectory() || output.mkdirs());
        TestCase testCase = new TestCase();
        testCase.setTitle("用例名称");
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
        assertEquals("用例名称", content.getRootElement().element("sheet").elementText("title"));
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
        assertTrue(styles.asXML().contains("line-class=\"org.xmind.branchConnection.roundedElbow\""));
        assertTrue(styles.asXML().contains("shape-class=\"org.xmind.topicShape.roundedRect\""));
        assertTrue(manifest.asXML().contains("styles.xml"));
        assertEquals("urn:xmind:xmap:xmlns:manifest:1.0", manifest.getRootElement().getNamespaceURI());
    }

    @Test
    public void exportsSavedThemeAndNodeAppearance() throws Exception {
        File output = new File("target/xmind-export-theme-test");
        assertTrue(output.isDirectory() || output.mkdirs());
        TestCase testCase = new TestCase();
        testCase.setTitle("黑色用例");
        testCase.setCaseContent("{\"theme\":\"ink-black\",\"root\":{\"data\":{\"id\":\"root\",\"text\":\"中心\"},\"children\":[{\"data\":{\"id\":\"child\",\"text\":\"节点\",\"font-size\":24,\"font-family\":\"Arial\",\"color\":\"#ff0000\"},\"children\":[]}]}}");
        FileServiceImpl service = new FileServiceImpl();
        ReflectionTestUtils.invokeMethod(service, "writeContentXml", testCase, output.getPath());
        ReflectionTestUtils.invokeMethod(service, "writeStylesXml", testCase, output.getPath());
        Document styles = new SAXReader().read(new File(output, "styles.xml"));
        assertTrue(styles.asXML().contains("#111827"));
        assertTrue(styles.asXML().contains("#ff0000"));
        assertTrue(styles.asXML().contains("24pt"));
        assertTrue(styles.asXML().contains("Arial"));
    }

    @Test
    public void embedsUploadedImagesWithoutCallingTheirOldHost() throws Exception {
        File output = new File("target/xmind-export-image-test");
        File uploads = new File(output, "uploads/2026/10/22");
        assertTrue(uploads.isDirectory() || uploads.mkdirs());
        File sourceImage = new File(uploads, "photo.png");
        assertTrue(ImageIO.write(new BufferedImage(2, 3, BufferedImage.TYPE_INT_RGB), "png", sourceImage));
        TestCase testCase = new TestCase();
        testCase.setTitle("图片用例");
        testCase.setCaseContent("{\"root\":{\"data\":{\"id\":\"root\",\"text\":\"中心\"},\"children\":[{\"data\":{\"id\":\"child\",\"text\":\"图片\",\"image\":\"http://old-host.invalid:8194/2026/10/22/photo.png\",\"imageSize\":{\"width\":20,\"height\":30}},\"children\":[]}]}}");
        FileServiceImpl service = new FileServiceImpl();
        ReflectionTestUtils.setField(service, "uploadPath", new File(output, "uploads").getAbsolutePath() + File.separator);
        ReflectionTestUtils.invokeMethod(service, "writeContentXml", testCase, output.getPath());
        File exportedImage = new File(output, "attachments/child-photo.png");
        assertTrue(exportedImage.isFile());
        assertArrayEquals(Files.readAllBytes(sourceImage.toPath()), Files.readAllBytes(exportedImage.toPath()));
        Document content = new SAXReader().read(new File(output, "content.xml"));
        assertTrue(content.asXML().contains("xap:attachments/child-photo.png"));
    }
}
