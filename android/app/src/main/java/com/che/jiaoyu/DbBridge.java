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
            File src = dbFile();
            if (!src.exists()) return "ERR:数据库还不存在";
            String stamp = new SimpleDateFormat("yyyy-MM-dd_HHmm", Locale.CHINA).format(new Date());
            File out = new File(act.getCacheDir(), "教育活动台_" + stamp + ".db");
            copyFile(src, out);
            Uri uri = FileProvider.getUriForFile(act, act.getPackageName() + ".fileprovider", out);
            act.shareDbFile(uri, out.getName());
            return out.getAbsolutePath();
        } catch (Exception e) {
            return "ERR:" + e.getMessage();
        }
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
        File tmp = new File(act.getCacheDir(), "incoming.db");
        try {
            closeDb();
            ContentResolver cr = act.getContentResolver();
            InputStream in = cr.openInputStream(uri);
            if (in == null) return "读不到文件";
            try (FileOutputStream fos = new FileOutputStream(tmp)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) fos.write(buf, 0, n);
            } finally {
                try { in.close(); } catch (Exception ignored) {
                }
            }
            if (!looksLikeOurDb(tmp)) return "不是本应用的数据库文件";
            File dst = dbFile();
            File parent = dst.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            new File(dst.getPath() + "-wal").delete();
            new File(dst.getPath() + "-shm").delete();
            copyFile(tmp, dst);
            tmp.delete();
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
