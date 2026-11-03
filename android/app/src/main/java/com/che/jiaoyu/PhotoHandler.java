package com.che.jiaoyu;

import android.webkit.WebResourceResponse;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileInputStream;

/**
 * 把私有目录里的照片通过 https://appassets.androidplatform.net/photos/<文件名> 提供给网页。
 */
public class PhotoHandler implements WebViewAssetLoader.PathHandler {

    private final File dir;

    public PhotoHandler(File dir) {
        this.dir = dir;
    }

    @Override
    public WebResourceResponse handle(String path) {
        try {
            String name = path == null ? "" : path.replace("..", "").replace("\\", "/");
            while (name.startsWith("/")) name = name.substring(1);
            if (name.length() == 0) return null;
            File f = new File(dir, name);
            if (!f.exists() || !f.isFile()) return null;
            String mime = name.endsWith(".png") ? "image/png"
                    : name.endsWith(".webp") ? "image/webp"
                    : name.endsWith(".heic") ? "image/heic"
                    : name.endsWith(".gif") ? "image/gif"
                    : "image/jpeg";
            return new WebResourceResponse(mime, null, new FileInputStream(f));
        } catch (Exception e) {
            return null;
        }
    }
}
