package com.che.jiaoyu;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 网页与 SQLite 之间的桥：
 *   NativeDB.loadAll()        → 返回 {students:[...], courses:[...], ...}
 *   NativeDB.save(table, json) → 整表覆盖写入（页面每次保存调用一次）
 *   NativeDB.info()            → 数据库路径与体积
 */
public class DbBridge {

    private static final Set<String> TABLES = new HashSet<>(Arrays.asList(
            "students", "contacts", "assessments", "feedbacks", "plans", "courses"));

    private final DbHelper helper;
    private SQLiteDatabase cachedDb;

    public DbBridge(Context c) {
        helper = new DbHelper(c.getApplicationContext());
    }

    private SQLiteDatabase db() {
        if (cachedDb == null || !cachedDb.isOpen()) {
            cachedDb = helper.getWritableDatabase();
        }
        return cachedDb;
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
                ContentValues cv = new ContentValues();
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
            o.put("size", new java.io.File(d.getPath()).length());
        } catch (Exception ignored) {
        }
        return o.toString();
    }
}
