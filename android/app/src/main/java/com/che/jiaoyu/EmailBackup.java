package com.che.jiaoyu;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

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

/**
 * 每天首次打开时，把数据库压缩后发到指定邮箱。
 * 无网络、发送失败都静默跳过，不打扰使用。
 */
public class EmailBackup {

    private static final String SMTP_HOST = "smtp.163.com";
    private static final String SMTP_PORT = "465";
    private static final String MAIL_USER = "cheyu_987@163.com";
    private static final String MAIL_PASS = "JNZWIYKNWTCOKJMK";
    private static final String MAIL_TO = "cheyu_987@163.com";
    private static final String SUBJECT = "老姐教学助手数据备份推送";
    private static final long MAX_ATTACH_BYTES = 40L * 1024 * 1024;

    public static void triggerDaily(final Context ctx, final File dbFile) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    SharedPreferences sp = ctx.getSharedPreferences("daily_mail", Context.MODE_PRIVATE);
                    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
                    if (today.equals(sp.getString("last_date", ""))) return;   // 今天已成功推送
                    if (!hasNetwork(ctx)) return;                               // 没网：不触发、不报错
                    if (!dbFile.exists() || dbFile.length() == 0) return;

                    File zip = new File(ctx.getCacheDir(), "jiaoyu_backup_" + today + ".zip");
                    if (!zipDb(dbFile, zip)) return;

                    if (!sendMail(zip, today)) {
                        zip.delete();
                        return;
                    }
                    sp.edit().putString("last_date", today).apply();
                    zip.delete();
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

    private static boolean sendMail(File zip, String today) {
        if (zip.length() > MAX_ATTACH_BYTES) return false;
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
            text.setText("车老师教学助手每日自动备份\n日期：" + today + "\n附件为完整数据库（含错题照片），下载后可整库导入。", "UTF-8");

            MimeBodyPart att = new MimeBodyPart();
            att.attachFile(zip);
            att.setFileName(javax.mail.internet.MimeUtility.encodeText("教育工作台备份_" + today + ".zip", "UTF-8", "B"));

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
