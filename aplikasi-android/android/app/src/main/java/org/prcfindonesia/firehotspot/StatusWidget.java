package org.prcfindonesia.firehotspot;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/* Widget layar utama Pantau Rimbak: status Hutan Desa yang dipilih di aplikasi (Aman/Waspada/Siaga – aturan sama dengan aplikasi),
 * jumlah titik panas <= 5 km & <= 25 km 7 hari terakhir, dan bahaya kebakaran hari ini. Tanpa Hutan Desa terpilih (mode umum):
 * jumlah titik panas se-Indonesia 24 jam. Data: data/widget.json (< 3 KB) dari server Pantau Rimbak, diperbarui otomatis
 * (±3 jam, saat aplikasi mengganti Hutan Desa, dan saat widget diketuk lalu aplikasi dibuka). Salinan terakhir dipakai saat tanpa sinyal. */
public class StatusWidget extends AppWidgetProvider {
    static final String PREF = "pantau_widget", URL_DATA = "https://erikprcfi.github.io/hotspot-fire-prcf/data/widget.json";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        gambarSemua(ctx);                                   // tampilkan salinan terakhir dulu
        final PendingResult pr = goAsync(); final Context c = ctx.getApplicationContext();
        new Thread(() -> { try { ambil(c); gambarSemua(c); } catch (Throwable ignored) { } finally { pr.finish(); } }).start();
    }

    /* dipanggil aplikasi saat Hutan Desa diganti / akses berubah */
    static void segarkan(Context ctx) {
        final Context c = ctx.getApplicationContext(); gambarSemua(c);
        new Thread(() -> { try { ambil(c); gambarSemua(c); } catch (Throwable ignored) { } }).start();
    }

    static void ambil(Context c) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(URL_DATA + "?t=" + System.currentTimeMillis()).openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(15000); h.setUseCaches(false);
        try (InputStream in = h.getInputStream(); ByteArrayOutputStream o = new ByteArrayOutputStream()) {
            byte[] b = new byte[4096]; int n; while ((n = in.read(b)) > 0) { o.write(b, 0, n); if (o.size() > 200000) break; }
            String s = o.toString("UTF-8"); new JSONObject(s);   // pastikan JSON sah sebelum disimpan
            c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString("data", s).putLong("diambil", System.currentTimeMillis()).apply();
        } finally { h.disconnect(); }
    }

    static void gambarSemua(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, StatusWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = tampilan(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    static String angka(int n) { return NumberFormat.getIntegerInstance(new Locale("id", "ID")).format(n); }

    static String wib(String iso) {
        try {
            SimpleDateFormat p = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US); p.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = p.parse(iso.substring(0, 16));
            SimpleDateFormat f = new SimpleDateFormat("d MMM HH.mm", new Locale("id", "ID")); f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));
            return f.format(d) + " WIB";
        } catch (Exception e) { return ""; }
    }

    static RemoteViews tampilan(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_status);
        Intent buka = new Intent(c, MainActivity.class); buka.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.w_akar, PendingIntent.getActivity(c, 0, buka, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        SharedPreferences sp = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String situs = sp.getString("situs", ""), raw = sp.getString("data", "");
        boolean en = "en".equals(sp.getString("bahasa", "id"));
        try {
            if (raw.isEmpty()) throw new Exception("kosong");
            JSONObject d = new JSONObject(raw), L = d.optJSONObject("lokasi");
            JSONObject s = (!situs.isEmpty() && L != null) ? L.optJSONObject(situs) : null;
            String waktu = wib(d.optString("data_titik_utc", d.optString("diperbarui_utc", "")));
            if (s != null) {
                String st = s.optString("status", "Aman");
                int warna = "Siaga".equals(st) ? Color.parseColor("#EF4444") : "Waspada".equals(st) ? Color.parseColor("#F59E0B") : Color.parseColor("#4ADE80");
                String stT = en ? ("Siaga".equals(st) ? "Alert" : "Waspada".equals(st) ? "Watch" : "Safe") : st;
                v.setTextViewText(R.id.w_judul, s.optString("nama", "Hutan Desa").replace("Hutan Desa ", en ? "" : "HD "));
                v.setTextViewText(R.id.w_status, stT); v.setTextColor(R.id.w_status, warna); v.setInt(R.id.w_titik, "setColorFilter", warna);
                v.setTextViewText(R.id.w_rinci, (en ? "Hotspots 7 days: " : "Titik panas 7 hari: ") + angka(s.optInt("dekat")) + (en ? " ≤5 km · " : " ≤5 km · ") + angka(s.optInt("r25")) + " ≤25 km");
                String bh = s.optString("bahaya", "");
                v.setTextViewText(R.id.w_bahaya, bh.isEmpty() ? "" : (en ? "Fire danger today: " + bahasaEn(bh) : "Bahaya kebakaran hari ini: " + bh));
            } else {
                JSONObject n = d.optJSONObject("nasional");
                v.setTextViewText(R.id.w_judul, "Indonesia");
                v.setTextViewText(R.id.w_status, n != null ? angka(n.optInt("total24")) : "–"); v.setTextColor(R.id.w_status, Color.parseColor("#FDBA74"));
                v.setInt(R.id.w_titik, "setColorFilter", Color.parseColor("#FB923C"));
                v.setTextViewText(R.id.w_rinci, en ? "hotspots in the last 24 hours" : "titik panas 24 jam terakhir");
                v.setTextViewText(R.id.w_bahaya, n != null ? (en ? "7 days: " : "7 hari: ") + angka(n.optInt("total7")) : "");
            }
            v.setTextViewText(R.id.w_waktu, "NASA FIRMS · " + waktu);
        } catch (Exception e) {
            v.setTextViewText(R.id.w_judul, "Pantau Rimbak");
            v.setTextViewText(R.id.w_status, "–"); v.setTextColor(R.id.w_status, Color.WHITE);
            v.setTextViewText(R.id.w_rinci, en ? "Waiting for data – connect to the internet" : "Menunggu data – sambungkan internet");
            v.setTextViewText(R.id.w_bahaya, ""); v.setTextViewText(R.id.w_waktu, en ? "Tap to open the app" : "Ketuk untuk membuka aplikasi");
        }
        return v;
    }

    static String bahasaEn(String b) { switch (b) { case "Rendah": return "Low"; case "Sedang": return "Moderate"; case "Tinggi": return "High"; case "Ekstrem": return "Extreme"; default: return b; } }
}
