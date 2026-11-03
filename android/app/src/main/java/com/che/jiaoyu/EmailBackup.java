package com.che.jiaoyu;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Properties;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.mail.Authenticator;
import javax.mail.Message;
import javax.mail.Multipart;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeBodyPart;
import javax.mail.internet.MimeMessage;
import javax.mail.internet.MimeMultipart;
import javax.mail.internet.MimeUtility;

/**
 * 每天首次打开时，把数据库压缩后发到指定邮箱。
 * 邮件正文附带数据概览；数据库过大时自动降级为「文字数据（不含照片）」。
 * 无网络、发送失败都静默跳过，不打扰使用。
 */
public class EmailBackup {

    private static final String SMTP_HOST = "smtp.163.com";
    private static final String SMTP_PORT = "465";
    private static final String MAIL_USER = "cheyu_987@163.com";
    private static final String MAIL_PASS = "JNZWIYKNWTCOKJMK";
    private static final String MAIL_TO = "cheyu_987@163.com";
    private static final String SUBJECT = "老姐教学助手数据备份推送";

    /** 超过 30MB 就不再发完整库，改为发文字备份（163 附件上限约 50MB） */
    private static final long MAX_ATTACH_BYTES = 30L * 1024 * 1024;
    private static final String[] TABLES = {"students", "contacts", "assessments", "feedbacks", "plans", "courses"};

    public static void triggerDaily(final Context ctx, final File dbFile) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    SharedPreferences sp = ctx.getSharedPreferences("daily_mail", Context.MODE_PRIVATE);
                    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
                    if (today.equals(sp.getString("last_date", ""))) return;
                    if (!hasNetwork(ctx)) return;
                    if (!dbFile.exists() || dbFile.length() == 0) return;

                    String overview = buildOverview(dbFile, today);

                    File zip = new File(ctx.getCacheDir(), "jiaoyu_backup_" + today + ".zip");
                    File attach;
                    String attachName;
                    String note;
                    if (zipDb(dbFile, zip) && zip.length() <= MAX_ATTACH_BYTES) {
                        attach = zip;
                        attachName = "教育工作台备份_" + today + ".zip";
                        note = "附件为完整数据库（含错题照片），下载后在 App「数据与备份 → 导入数据库」即可整库恢复。";
                    } else {
                        zip.delete();
                        attach = buildTextJson(ctx, dbFile, today);
                        if (attach == null) return;
                        attachName = "教育工作台文字备份_" + today + ".json";
                        note = "数据库已超过 30MB（含错题照片），本次改为发送文字数据备份（不含照片）。\n"
                                + "如需完整备份，请在手机上打开 App →「数据与备份 → 导出数据库」，手动保存或传网盘。";
                    }

                    String body = "车老师教学助手 · 每日自动备份\n"
                            + "日期：" + today + "\n\n"
                            + "—— 数据概览 ——\n" + overview + "\n\n"
                            + "—— 备份说明 ——\n" + note;

                    if (!sendMail(attach, attachName, body)) {
                        attach.delete();
                        return;
                    }
                    sp.edit().putString("last_date", today).apply();
                    attach.delete();
                } catch (Throwable ignored) {
                    // 全程静默，用户无感
                }
            }
        }).start();
    }

    private static boolean hasNetwork(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network n = cm.getActiveNetwork();
            if (n == null) return false;
            NetworkCapabilities nc = cm.getNetworkCapabilities(n);
            return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Throwable e) {
            return false;
        }
    }

    /** 学生数 / 累计课程数 / 今日课程 / 反馈数 */
    private static String buildOverview(File dbFile, String today) {
        StringBuilder sb = new StringBuilder();
        SQLiteDatabase d = null;
        try {
            d = SQLiteDatabase.openDatabase(dbFile.getPath(), null, SQLiteDatabase.OPEN_READONLY);
            sb.append("学生：").append(count(d, "students")).append(" 人\n");
            sb.append("课程：累计 ").append(count(d, "courses")).append(" 次课\n");
            sb.append("反馈记录：").append(count(d, "feedbacks")).append(" 条\n");

            Cursor c = d.rawQuery("SELECT name,start,end FROM courses WHERE date=? ORDER BY start", new String[]{today});
            try {
                if (c.getCount() == 0) {
                    sb.append("今日课程：无");
                } else {
                    StringBuilder names = new StringBuilder();
                    int n = 0;
                    while (c.moveToNext()) {
                        n++;
                        if (names.length() > 0) names.append("；");
                        names.append(c.getString(0));
                        String st = c.getString(1), en = c.getString(2);
                        if (st != null && en != null && st.length() > 0) names.append(" ").append(st).append("-").append(en);
                    }
                    sb.append("今日课程：有（").append(n).append(" 节）\n").append(names);
                }
            } finally {
                c.close();
            }
        } catch (Throwable e) {
            if (sb.length() == 0) sb.append("（数据读取失败）");
        } finally {
            if (d != null) d.close();
        }
        return sb.toString();
    }

    private static int count(SQLiteDatabase d, String table) {
        Cursor c = null;
        try {
            c = d.rawQuery("SELECT COUNT(*) FROM " + table, null);
            return c.moveToFirst() ? c.getInt(0) : 0;
        } catch (Throwable e) {
            return 0;
        } finally {
            if (c != null) c.close();
        }
    }

    private static boolean zipDb(File db, File zip) {
        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(zip))) {
            zos.putNextEntry(new ZipEntry("jiaoyu.db"));
            try (FileInputStream fis = new FileInputStream(db)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = fis.read(buf)) > 0) zos.write(buf, 0, n);
            }
            zos.closeEntry();
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    /** 去掉 photos 字段的文字备份，体积通常只有几十 KB */
    private static File buildTextJson(Context ctx, File dbFile, String today) {
        SQLiteDatabase d = null;
        try {
            d = SQLiteDatabase.openDatabase(dbFile.getPath(), null, SQLiteDatabase.OPEN_READONLY);
            JSONObject all = new JSONObject();
            for (String t : TABLES) {
                JSONArray arr = new JSONArray();
                Cursor c = d.rawQuery("SELECT data FROM " + t, null);
                try {
                    while (c.moveToNext()) {
                        try {
                            JSONObject o = new JSONObject(c.getString(0));
                            o.remove("photos");
                            arr.put(o);
                        } catch (Exception ignored) {
                        }
                    }
                } finally {
                    c.close();
                }
                all.put(t, arr);
            }
            File f = new File(ctx.getCacheDir(), "jiaoyu_text_" + today + ".json");
            try (FileOutputStream fos = new FileOutputStream(f)) {
                fos.write(all.toString().getBytes("UTF-8"));
            }
            return f;
        } catch (Throwable e) {
            return null;
        } finally {
            if (d != null) d.close();
        }
    }

    private static boolean sendMail(File attachment, String fileName, String body) {
        try {
            Properties p = new Properties();
            p.put("mail.smtp.host", SMTP_HOST);
            p.put("mail.smtp.port", SMTP_PORT);
            p.put("mail.smtp.auth", "true");
            p.put("mail.smtp.ssl.enable", "true");
            p.put("mail.smtp.ssl.trust", SMTP_HOST);
            p.put("mail.smtp.connectiontimeout", "20000");
            p.put("mail.smtp.timeout", "20000");
            p.put("mail.smtp.writetimeout", "20000");

            Session session = Session.getInstance(p, new Authenticator() {
                @Override
                protected PasswordAuthentication getPasswordAuthentication() {
                    return new PasswordAuthentication(MAIL_USER, MAIL_PASS);
                }
            });

            MimeMessage msg = new MimeMessage(session);
            msg.setFrom(new InternetAddress(MAIL_USER));
            msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(MAIL_TO));
            msg.setSubject(SUBJECT, "UTF-8");
            msg.setSentDate(new Date());

            MimeBodyPart text = new MimeBodyPart();
            text.setText(body, "UTF-8");

            MimeBodyPart att = new MimeBodyPart();
            att.attachFile(attachment);
            att.setFileName(MimeUtility.encodeText(fileName, "UTF-8", "B"));

            Multipart mp = new MimeMultipart();
            mp.addBodyPart(text);
            mp.addBodyPart(att);
            msg.setContent(mp);

            Transport.send(msg);
            return true;
        } catch (Throwable e) {
            return false;
        }
    }
}
