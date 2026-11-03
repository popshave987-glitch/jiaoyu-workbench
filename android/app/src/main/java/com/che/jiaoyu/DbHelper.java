package com.che.jiaoyu;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

/**
 * 本地结构化数据库：每类数据一张表，另存 data 列保留完整 JSON，
 * 便于后续 SQL 统计（按班级、日期、课程查询）。
 */
public class DbHelper extends SQLiteOpenHelper {

    public static final String NAME = "jiaoyu.db";
    public static final int VERSION = 1;

    public DbHelper(Context c) {
        super(c, NAME, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,name TEXT,cls TEXT,grade TEXT,school TEXT,status TEXT,created TEXT,data TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,sid TEXT,date TEXT,data TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS assessments(id TEXT PRIMARY KEY,sid TEXT,date TEXT,subject TEXT,data TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS feedbacks(id TEXT PRIMARY KEY,sid TEXT,course_id TEXT,date TEXT,data TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,sid TEXT,data TEXT)");
        db.execSQL("CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,name TEXT,subject TEXT,date TEXT,start TEXT,end TEXT,data TEXT)");

        db.execSQL("CREATE INDEX IF NOT EXISTS idx_students_cls ON students(cls)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_contacts_sid ON contacts(sid)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_assessments_sid ON assessments(sid)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_feedbacks_sid ON feedbacks(sid)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_feedbacks_course ON feedbacks(course_id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_plans_sid ON plans(sid)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_courses_date ON courses(date)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
    }
}
