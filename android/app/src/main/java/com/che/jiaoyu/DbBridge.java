package com.che.jiaoyu;

import android.app.Activity;
import android.content.ContentResolver;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * 网页与 SQLite 之间的桥：
 *   NativeDB.loadAll()            → 读取全部数据
 *   NativeDB.save(table, json)    → 整表覆盖写入
 *   NativeDB.info()               → 数据库路径与体积
 *   NativeDB.exportDb()           → 生成 .db 并弹出分享面板
 *   NativeDB.importDb()           → 选择 .db 文件，导入并覆盖
 */
public class DbBridge {

    private static final Set<String> TABLES = new HashSet<>(Arrays.asList(
            "students", "contacts", "assessments", "feedbacks", "plans", "courses"));

    private final MainActivity act;
    private final DbHelper helper;
    private SQLiteDatabase cachedDb;

    public DbBridge(MainActivity a) {
        act = a;
        helper = new DbHelper(a.getApplicationContext());
    }

    private SQLiteDatabase db() {
        if (cachedDb == null || !cachedDb.isOpen()) {
            cachedDb = helper.getWritableDatabase();
        }
        return cachedDb;
    }

    private File dbFile() {
        return act.getDatabasePath(DbHelper.NAME);
    }

    @JavascriptInterface
    public String loadAll() {
        JSONObject out = new JSONObject();
        try {
            SQLiteDatabase d = db();
            for (String t : TABLES) {
                out.put(t, readTable(d, t));
            }
            return out.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private JSONArray readTable(SQLiteDatabase d, String table) {
        JSONArray arr = new JSONArray();
        Cursor c = d.rawQuery("SELECT data FROM " + table, null);
        try {
            while (c.moveToNext()) {
                String raw = c.getString(0);
                try {
                    arr.put(new JSONObject(raw));
                } catch (Exception ignored) {
                }
            }
        } finally {
            c.close();
        }
        return arr;
    }

    @JavascriptInterface
    public void save(String table, String json) {
        if (!TABLES.contains(table)) return;
        JSONArray arr;
        try {
            arr = new JSONArray(json == null ? "[]" : json);
        } catch (Exception e) {
            return;
        }
        SQLiteDatabase d = db();
        d.beginTransaction();
        try {
            d.delete(table, null, null);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put("id", o.optString("id"));
                cv.put("data", o.toString());
                switch (table) {
                    case "students":
                        cv.put("name", o.optString("name"));
                        cv.put("cls", o.optString("cls"));
                        cv.put("grade", o.optString("grade"));
                        cv.put("school", o.optString("school"));
                        cv.put("status", o.optString("status"));
                        cv.put("created", o.optString("created"));
                        break;
                    case "contacts":
                        cv.put("sid", o.optString("sid"));
                        cv.put("date", o.optString("date"));
                        break;
                    case "assessments":
                        cv.put("sid", o.optString("sid"));
                        cv.put("date", o.optString("date"));
                        cv.put("subject", o.optString("subject"));
                        break;
                    case "feedbacks":
                        cv.put("sid", o.optString("sid"));
                        cv.put("course_id", o.optString("courseId"));
                        cv.put("date", o.optString("date"));
                        break;
                    case "plans":
                        cv.put("sid", o.optString("sid"));
                        break;
                    case "courses":
                        cv.put("name", o.optString("name"));
                        cv.put("subject", o.optString("subject"));
                        cv.put("date", o.optString("date"));
                        cv.put("start", o.optString("start"));
                        cv.put("end", o.optString("end"));
                        break;
                }
                d.insertWithOnConflict(table, null, cv, SQLiteDatabase.CONFLICT_REPLACE);
            }
            d.setTransactionSuccessful();
        } catch (Exception e) {
        } finally {
            d.endTransaction();
        }
    }

    /** 原图直接落盘，返回文件名；网页通过 /photos/<文件名> 访问 */
    @JavascriptInterface
    public String savePhoto(String hint, String mime, String base64) {
        try {
            byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            String ext = (mime != null && mime.contains("png")) ? "png"
                    : (mime != null && mime.contains("webp")) ? "webp"
                    : (mime != null && mime.contains("heic")) ? "heic"
                    : (mime != null && mime.contains("gif")) ? "gif" : "jpg";
            String name = "ph_" + System.currentTimeMillis() + "_" + (int) (Math.random() * 10000) + "." + ext;
            File dir = new File(act.getFilesDir(), "photos");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, name);
            try (FileOutputStream fos = new FileOutputStream(f)) {
                fos.write(data);
            }
            return name;
        } catch (Throwable e) {
            return "ERR:" + e.getMessage();
        }
    }

    /** 保存导出文件（xlsx/json/zip）：Android 10+ 存「下载/教育工作台」，旧版本走分享面板 */
    @JavascriptInterface
    public String saveFile(String name, String mime, String base64) {
        try {
            byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(android.provider.MediaStore.Downloads.MIME_TYPE, mime);
                v.put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "Download/教育工作台");
                Uri uri = act.getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return "ERR:无法创建文件";
                try (java.io.OutputStream os = act.getContentResolver().openOutputStream(uri)) {
                    if (os == null) return "ERR:无法写入";
                    os.write(data);
                }
                final String msg = "已保存到 下载/教育工作台：" + name;
                act.runOnUiThread(new Runnable() {
                    @Override public void run() {
                        android.widget.Toast.makeText(act, msg, android.widget.Toast.LENGTH_LONG).show();
                    }
                });
                return "Download/教育工作台";
            }
            File dir = new File(act.getExternalFilesDir(null), "Download");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, name);
            try (FileOutputStream fos = new FileOutputStream(f)) { fos.write(data); }
            Uri u = FileProvider.getUriForFile(act, act.getPackageName() + ".fileprovider", f);
            act.shareFile(u, name, mime, "保存文件");
            return "SHARE:分享";
        } catch (Throwable e) {
            return "ERR:" + e.getMessage();
        }
    }

    @JavascriptInterface
    public String exportStudentPdf(String sid, String name) {
        try {
            closeDb();
            File pdf = PdfExporter.build(act.getApplicationContext(), dbFile(), sid, name);
            Uri uri = FileProvider.getUriForFile(act, act.getPackageName() + ".fileprovider", pdf);
            act.shareFile(uri, pdf.getName(), "application/pdf", "导出 PDF");
            return pdf.getAbsolutePath();
        } catch (Throwable e) {
            return "ERR:" + e.getMessage();
        }
    }

    @JavascriptInterface
    public String saveToGallery(String photoName) {
        return PdfExporter.saveToGallery(act.getApplicationContext(), photoName);
    }

    @JavascriptInterface
    public String info() {
        SQLiteDatabase d = db();
        JSONObject o = new JSONObject();
        try {
            o.put("engine", "SQLite");
            o.put("path", d.getPath());
            o.put("size", dbFile().length());
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    /* ---------------- 导出 / 导入数据库 ---------------- */
    private void closeDb() {
        try {
            if (cachedDb != null && cachedDb.isOpen()) {
                cachedDb.rawQuery("PRAGMA wal_checkpoint(FULL)", null).close();
                cachedDb.close();
            }
        } catch (Exception ignored) {
        }
        cachedDb = null;
    }

    @JavascriptInterface
    public String exportDb() {
        try {
            closeDb();
            if (!dbFile().exists()) return "ERR:数据库还不存在";
            String stamp = new SimpleDateFormat("yyyy-MM-dd_HHmm", Locale.CHINA).format(new Date());
            File out = new File(act.getCacheDir(), "教育活动台_" + stamp + ".zip");
            buildBackupZip(out);
            Uri uri = FileProvider.getUriForFile(act, act.getPackageName() + ".fileprovider", out);
            act.shareDbFile(uri, out.getName());
            return out.getAbsolutePath();
        } catch (Exception e) {
            return "ERR:" + e.getMessage();
        }
    }

    /** 备份包 = jiaoyu.db + photos/ 原图 */
    void buildBackupZip(File out) throws Exception {
        try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(new FileOutputStream(out))) {
            File db = dbFile();
            if (db.exists()) {
                zos.putNextEntry(new java.util.zip.ZipEntry("jiaoyu.db"));
                try (FileInputStream fis = new FileInputStream(db)) { pipe(fis, zos); }
                zos.closeEntry();
            }
            File photos = new File(act.getFilesDir(), "photos");
            File[] list = photos.listFiles();
            if (list != null) {
                for (File f : list) {
                    if (!f.isFile()) continue;
                    zos.putNextEntry(new java.util.zip.ZipEntry("photos/" + f.getName()));
                    try (FileInputStream fis = new FileInputStream(f)) { pipe(fis, zos); }
                    zos.closeEntry();
                }
            }
        }
    }

    private void pipe(java.io.InputStream in, java.io.OutputStream out) throws Exception {
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    @JavascriptInterface
    public void autoBackup() {
        try {
            Cursor c = db().rawQuery("SELECT COUNT(*) FROM students", null);
            int n = 0;
            if (c.moveToFirst()) n = c.getInt(0);
            c.close();
            if (n <= 0) return;   // 还没有学生数据，不推送空库
        } catch (Exception e) {
            return;
        }
        closeDb();
        EmailBackup.triggerDaily(act.getApplicationContext(), dbFile());
    }

    @JavascriptInterface
    public void importDb() {
        act.pickDbFile();
    }

    /** 校验并替换数据库文件；返回 null 表示成功，否则返回错误文案 */
    String replaceDbFromUri(Uri uri) {
        File tmp = new File(act.getCacheDir(), "incoming.pkg");
        try {
            closeDb();
            ContentResolver cr = act.getContentResolver();
            InputStream in = cr.openInputStream(uri);
            if (in == null) return "读不到文件";
            try (FileOutputStream fos = new FileOutputStream(tmp)) { pipe(in, fos); }
            finally { try { in.close(); } catch (Exception ignored) { } }

            if (isZip(tmp)) return restoreZip(tmp);
            if (!looksLikeOurDb(tmp)) return "不是本应用的备份文件";
            return swapDb(tmp);
        } catch (Exception e) {
            return "导入失败：" + e.getMessage();
        } finally {
            tmp.delete();
        }
    }

    private boolean isZip(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[2];
            return in.read(b) == 2 && b[0] == 'P' && b[1] == 'K';
        } catch (Exception e) {
            return false;
        }
    }

    private String restoreZip(File zip) throws Exception {
        File tmpDb = new File(act.getCacheDir(), "incoming.db");
        File photoDir = new File(act.getFilesDir(), "photos");
        if (!photoDir.exists()) photoDir.mkdirs();
        int photoCount = 0;
        try (java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(new FileInputStream(zip))) {
            java.util.zip.ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                String name = e.getName();
                if (name.equals("jiaoyu.db")) {
                    try (FileOutputStream fos = new FileOutputStream(tmpDb)) { pipe(zis, fos); }
                } else if (name.startsWith("photos/") && !e.isDirectory()) {
                    String fn = name.substring(7).replace("..", "").replace("\\", "/");
                    if (fn.length() == 0 || fn.contains("/")) continue;
                    File f = new File(photoDir, fn);
                    try (FileOutputStream fos = new FileOutputStream(f)) { pipe(zis, fos); }
                    photoCount++;
                }
                zis.closeEntry();
            }
        }
        if (!tmpDb.exists() || !looksLikeOurDb(tmpDb)) return "备份包里没有有效的数据库";
        String err = swapDb(tmpDb);
        tmpDb.delete();
        return err == null ? null : err;
    }

    private String swapDb(File src) {
        try {
            File dst = dbFile();
            File parent = dst.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            new File(dst.getPath() + "-wal").delete();
            new File(dst.getPath() + "-shm").delete();
            copyFile(src, dst);
            return null;
        } catch (Exception e) {
            return "导入失败：" + e.getMessage();
        }
    }

    private boolean looksLikeOurDb(File f) {
        SQLiteDatabase test = null;
        Cursor c = null;
        try {
            test = SQLiteDatabase.openDatabase(f.getPath(), null, SQLiteDatabase.OPEN_READONLY);
            c = test.rawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='students'", null);
            return c.moveToFirst();
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.close();
            if (test != null) test.close();
        }
    }

    private void copyFile(File src, File dst) throws Exception {
        try (FileInputStream fis = new FileInputStream(src);
             FileOutputStream fos = new FileOutputStream(dst)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = fis.read(buf)) > 0) fos.write(buf, 0, n);
        }
    }
}
