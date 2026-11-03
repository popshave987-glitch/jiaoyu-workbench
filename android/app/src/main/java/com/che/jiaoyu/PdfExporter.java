package com.che.jiaoyu;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** 生成「一个学生的全部反馈 + 错题照片」PDF；照片存相册 */
public class PdfExporter {

    private static final int W = 595, H = 842, M = 40;

    public static File build(Context ctx, File dbFile, String sid, String studentName) throws Exception {
        List<JSONObject> list = new ArrayList<>();
        SQLiteDatabase d = SQLiteDatabase.openDatabase(dbFile.getPath(), null, SQLiteDatabase.OPEN_READONLY);
        try {
            Cursor c = d.rawQuery("SELECT data FROM feedbacks WHERE sid=? ORDER BY date", new String[]{sid});
            try {
                while (c.moveToNext()) {
                    try { list.add(new JSONObject(c.getString(0))); } catch (Exception ignored) { }
                }
            } finally { c.close(); }
        } finally { d.close(); }

        PdfDocument doc = new PdfDocument();
        Paint title = new Paint(); title.setAntiAlias(true); title.setTextSize(17); title.setTypeface(Typeface.DEFAULT_BOLD); title.setColor(Color.rgb(2, 128, 144));
        Paint h2 = new Paint(); h2.setAntiAlias(true); h2.setTextSize(12); h2.setTypeface(Typeface.DEFAULT_BOLD); h2.setColor(Color.rgb(30, 41, 59));
        Paint body = new Paint(); body.setAntiAlias(true); body.setTextSize(11); body.setColor(Color.rgb(51, 65, 85));
        Paint label = new Paint(); label.setAntiAlias(true); label.setTextSize(11); label.setTypeface(Typeface.DEFAULT_BOLD); label.setColor(Color.rgb(2, 128, 144));
        Paint line = new Paint(); line.setColor(Color.rgb(226, 232, 240));
        Paint small = new Paint(); small.setTextSize(9); small.setColor(Color.rgb(148, 163, 184));

        int pageNo = 1;
        PdfDocument.Page page = doc.startPage(new PdfDocument.PageInfo.Builder(W, H, pageNo).create());
        Canvas cv = page.getCanvas();
        int y = M + 8;

        cv.drawText("车老师 · 学生课堂反馈", M, y, title);
        y += 22;
        cv.drawText(studentName + "    导出日期：" + new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date())
                + "    反馈共 " + list.size() + " 条", M, y, body);
        y += 10;
        cv.drawLine(M, y, W - M, y, line);
        y += 18;

        final int bottom = H - M;
        int[] yy = new int[]{y};
        final Canvas[] cRef = new Canvas[]{cv};
        final PdfDocument.Page[] pRef = new PdfDocument.Page[]{page};

        // 换页工具
        Runnable newPage = () -> { };
        final int[] pn = new int[]{pageNo};

        for (int i = 0; i < list.size(); i++) {
            JSONObject f = list.get(i);

            if (yy[0] > bottom - 80) {
                doc.finishPage(pRef[0]);
                pn[0]++;
                pRef[0] = doc.startPage(new PdfDocument.PageInfo.Builder(W, H, pn[0]).create());
                cRef[0] = pRef[0].getCanvas();
                yy[0] = M + 20;
            }
            Canvas c = cRef[0];

            c.drawText("反馈 " + (i + 1) + "    " + f.optString("date", "") + "    " + f.optString("subject", ""), M, yy[0], h2);
            yy[0] += 16;

            String topic = f.optString("topic", "").trim();
            if (!topic.isEmpty()) {
                yy[0] = wrap(c, "考点：" + topic, M, yy[0], W - 2 * M, body, 16);
            }
            String[] pair = {"课堂表现", f.optString("performance", ""), "课后作业", f.optString("homework", f.optString("task", "")),
                    "进步点", f.optString("progress", f.optString("good", "")), "需要加强", f.optString("weak", ""),
                    "默写检查", f.optString("dictation", "")};
            for (int k = 0; k < pair.length; k += 2) {
                if (pair[k + 1] == null || pair[k + 1].trim().isEmpty()) continue;
                int w = (int) label.measureText(pair[k] + "：");
                c.drawText(pair[k] + "：", M, yy[0], label);
                yy[0] = wrap(c, pair[k + 1], M + w, yy[0], W - 2 * M - w, body, 15);
            }
            String notes = htmlToText(f.optString("notes", f.optString("content", "")));
            if (!notes.isEmpty()) {
                yy[0] = wrap(c, "课堂笔记：\n" + notes, M, yy[0], W - 2 * M, body, 15);
            }

            JSONArray photos = f.optJSONArray("photos");
            int drawn = 0;
            if (photos != null) {
                for (int pi = 0; pi < photos.length(); pi++) {
                    String name = photos.optString(pi, "");
                    if (name.isEmpty() || name.startsWith("data:")) continue;
                    File pf = new File(ctx.getFilesDir(), "photos/" + name);
                    if (!pf.exists()) continue;

                    Bitmap bmp = decodeScaled(pf, 1400);
                    if (bmp == null) continue;
                    int maxW = W - 2 * M;
                    int maxH = 300;
                    float sc = Math.min(1f, Math.min((float) maxW / bmp.getWidth(), (float) maxH / bmp.getHeight()));
                    int dw = (int) (bmp.getWidth() * sc), dh = (int) (bmp.getHeight() * sc);

                    if (yy[0] + dh + 20 > bottom) {
                        doc.finishPage(pRef[0]);
                        pn[0]++;
                        pRef[0] = doc.startPage(new PdfDocument.PageInfo.Builder(W, H, pn[0]).create());
                        cRef[0] = pRef[0].getCanvas();
                        c = cRef[0];
                        yy[0] = M + 20;
                    }
                    c.drawBitmap(bmp, null, new android.graphics.Rect(M, yy[0] + 6, M + dw, yy[0] + 6 + dh), null);
                    yy[0] += dh + 14;
                    bmp.recycle();
                    drawn++;
                }
            }
            if (drawn > 0) yy[0] += 4;
            c.drawText("——", M, yy[0], small);
            yy[0] += 20;
        }

        doc.finishPage(pRef[0]);

        String stamp = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
        File out = new File(ctx.getCacheDir(), sanitize(studentName) + "_课堂反馈_" + stamp + ".pdf");
        try (FileOutputStream fos = new FileOutputStream(out)) {
            doc.writeTo(fos);
        }
        doc.close();
        return out;
    }

    private static int wrap(Canvas c, String text, int x, int y, int width, Paint p, int lh) {
        for (String raw : text.split("\n")) {
            String s = raw;
            while (s.length() > 0) {
                int n = p.breakText(s, true, width, null);
                if (n <= 0) break;
                c.drawText(s.substring(0, n), x, y, p);
                s = s.substring(n);
                y += lh;
                x = M;
            }
        }
        return y;
    }

    private static String htmlToText(String html) {
        if (html == null) return "";
        String s = html.replace("<div class=\"nli\">", "\n• ").replace("<br>", "\n").replace("<br/>", "\n")
                .replace("</div>", "\n").replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">");
        s = s.replaceAll("<[^>]+>", "");
        s = s.replaceAll("\n{3,}", "\n\n").trim();
        return s;
    }

    private static Bitmap decodeScaled(File f, int maxSide) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(f.getPath(), o);
        int s = 1;
        while (Math.max(o.outWidth, o.outHeight) / s > maxSide) s *= 2;
        o.inJustDecodeBounds = false;
        o.inSampleSize = s;
        return BitmapFactory.decodeFile(f.getPath(), o);
    }

    private static String sanitize(String s) {
        if (s == null || s.trim().isEmpty()) return "学生";
        return s.replaceAll("[\\\\/:*?\"<>|]", "").trim();
    }

    /** 把一张错题照片存到相册 Pictures/教育工作台；返回 "OK" / "SHARE" / "ERR:..." */
    public static String saveToGallery(Context ctx, String photoName) {
        try {
            File f = new File(ctx.getFilesDir(), "photos/" + photoName);
            if (!f.exists()) return "ERR:文件不存在";
            String lower = photoName.toLowerCase(Locale.ROOT);
            String mime = lower.endsWith(".png") ? "image/png" : "image/jpeg";
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, photoName);
                v.put(MediaStore.Images.Media.MIME_TYPE, mime);
                v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/教育工作台");
                Uri uri = ctx.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return "ERR:无法创建相册文件";
                try (OutputStream os = ctx.getContentResolver().openOutputStream(uri);
                     java.io.FileInputStream fis = new java.io.FileInputStream(f)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = fis.read(buf)) > 0) os.write(buf, 0, n);
                }
                return "OK";
            }
            return "SHARE";
        } catch (Throwable e) {
            return "ERR:" + e.getMessage();
        }
    }
}
