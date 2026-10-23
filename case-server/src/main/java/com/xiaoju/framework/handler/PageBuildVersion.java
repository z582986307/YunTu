package com.xiaoju.framework.handler;

import org.springframework.core.io.ClassPathResource;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class PageBuildVersion {
    private static final Pattern MAIN_SCRIPT = Pattern.compile("<script\\b[^>]*\\bsrc=[\"']([^\"']*/umi\\.[^\"']+\\.js)[\"']", Pattern.CASE_INSENSITIVE);
    private static final String CURRENT = loadCurrent();

    private PageBuildVersion() { }

    static String current() { return CURRENT; }

    static String extract(String html) {
        Matcher matcher = MAIN_SCRIPT.matcher(html == null ? "" : html);
        return matcher.find() ? matcher.group(1) : null;
    }

    static boolean matches(String expected, String client) {
        return expected == null || expected.equals(client);
    }

    private static String loadCurrent() {
        try (InputStream input = new ClassPathResource("web/dist/index.html").getInputStream();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return extract(new String(output.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception error) {
            return null;
        }
    }
}
