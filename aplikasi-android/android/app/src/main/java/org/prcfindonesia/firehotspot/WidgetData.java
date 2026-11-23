package org.prcfindonesia.firehotspot;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
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

/* Data bersama semua widget Pantau Rimbak: data/widget.json (< 5 KB) dari server Pantau Rimbak, disimpan di HP
 * (dipakai saat tanpa sinyal), Hutan Desa terpilih & bahasa dari aplikasi (Perangkat.widget). */
final class WidgetData {
    static final String PREF = "pantau_widget", URL_DATA = "https://erikprcfi.github.io/hotspot-fire-prcf/data/widget.json";
    static final Class<?>[] SEMUA = { StatusWidget.class, WidgetJam.class, WidgetCuaca.class, WidgetGrafik.class, WidgetBahaya.class };
    static final int[] WARNA_LV = { Color.parseColor("#4ADE80"), Color.parseColor("#FACC15"), Color.parseColor("#FB923C"), Color.parseColor("#EF4444") };
    static final String[] LV_ID = { "Rendah", "Sedang", "Tinggi", "Ekstrem" }, LV_EN = { "Low", "Moderate", "High", "Extreme" };

    final JSONObject data, situs, nasional; final boolean en; final String nama;

    private WidgetData(Context c) {
        SharedPreferences sp = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        JSONObject d = null; try { String r = sp.getString("data", ""); if (!r.isEmpty()) d = new JSONObject(r); } catch (Exception ignored) { }
        data = d; en = "en".equals(sp.getString("bahasa", "id"));
        String id = sp.getString("situs", "");
        JSONObject L = d != null ? d.optJSONObject("lokasi") : null;
        situs = (!id.isEmpty() && L != null) ? L.optJSONObject(id) : null;
        nasional = d != null ? d.optJSONObject("nasional") : null;
        String n = situs != null ? situs.optString("nama", "Hutan Desa") : "Indonesia";
        nama = en ? n.replace("Hutan Desa ", "") + (situs != null ? " Village Forest" : "") : n.replace("Hutan Desa ", "HD ");
    }
    static WidgetData baca(Context c) { return new WidgetData(c); }

    String t(String id, String en_) { return en ? en_ : id; }
    static String angka(int n) { return NumberFormat.getIntegerInstance(new Locale("id", "ID")).format(n); }
    static String satu(double v) { return String.format(new Locale("id", "ID"), "%.0f", v); }

    String waktu() {
        if (data == null) return "";
        String iso = data.optString("data_titik_utc", data.optString("diperbarui_utc", ""));
        try {
            SimpleDateFormat p = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US); p.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = p.parse(iso.substring(0, 16));
            SimpleDateFormat f = new SimpleDateFormat("d MMM HH.mm", en ? Locale.UK : new Locale("id", "ID")); f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));
            return "NASA FIRMS · " + f.format(d) + " WIB";
        } catch (Exception e) { return ""; }
    }
    String status() { String s = situs != null ? situs.optString("status", "Aman") : ""; return en ? ("Siaga".equals(s) ? "Alert" : "Waspada".equals(s) ? "Watch" : "Safe") : s; }
    int warnaStatus() { String s = situs != null ? situs.optString("status", "Aman") : ""; return "Siaga".equals(s) ? Color.parseColor("#EF4444") : "Waspada".equals(s) ? Color.parseColor("#FACC15") : Color.parseColor("#4ADE80"); }
    int lv() { return situs != null ? situs.optInt("bahaya_level", -1) : -1; }
    String bahaya(int l) { return l >= 0 && l < 4 ? (en ? LV_EN[l] : LV_ID[l]) : "–"; }
    String titik() { return situs == null ? "" : t("Titik panas 7 hr: ", "Hotspots 7 d: ") + angka(situs.optInt("dekat")) + " ≤5 km · " + angka(situs.optInt("r25")) + " ≤25 km"; }
    String nasional24() { return nasional != null ? angka(nasional.optInt("total24")) : "–"; }

    static final int[] UBIN_LV = { R.drawable.w_ubin_hijau, R.drawable.w_ubin_kuning, R.drawable.w_ubin_oranye, R.drawable.w_ubin_merah };
    static final int[] PIL_LV = { R.drawable.w_lv0, R.drawable.w_lv1, R.drawable.w_lv2, R.drawable.w_lv3 };
    int ubinStatus() { String s = situs != null ? situs.optString("status", "Aman") : ""; return "Siaga".equals(s) ? R.drawable.w_ubin_merah : "Waspada".equals(s) ? R.drawable.w_ubin_kuning : R.drawable.w_ubin_hijau; }
    String hariPendek(String iso) {
        try { java.text.SimpleDateFormat p = new java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US), f = new java.text.SimpleDateFormat("EEE", en ? Locale.UK : new Locale("id", "ID")); return f.format(p.parse(iso)); }
        catch (Exception e) { return ""; }
    }
    String jamData() {
        if (data == null) return "";
        try {
            SimpleDateFormat p = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US); p.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = p.parse(data.optString("data_titik_utc", data.optString("diperbarui_utc", "")).substring(0, 16));
            SimpleDateFormat f = new SimpleDateFormat("HH.mm", Locale.US); f.setTimeZone(TimeZone.getTimeZone("Asia/Jakarta"));
            return f.format(d) + " WIB";
        } catch (Exception e) { return ""; }
    }

    /* ---------- umum ---------- */
    static void ketuk(Context c, RemoteViews v, int id) {
        Intent buka = new Intent(c, MainActivity.class); buka.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(id, PendingIntent.getActivity(c, 0, buka, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }
    static void ambil(Context c) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(URL_DATA + "?t=" + System.currentTimeMillis()).openConnection();
        h.setConnectTimeout(9000); h.setReadTimeout(9000); h.setUseCaches(false);
        try (InputStream in = h.getInputStream(); ByteArrayOutputStream o = new ByteArrayOutputStream()) {
            byte[] b = new byte[4096]; int n; while ((n = in.read(b)) > 0) { o.write(b, 0, n); if (o.size() > 300000) break; }
            String s = o.toString("UTF-8"); new JSONObject(s);
            c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString("data", s).putLong("diambil", System.currentTimeMillis()).apply();
        } finally { h.disconnect(); }
    }
    static void gambarSemua(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> k : SEMUA) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, k));
            if (ids == null || ids.length == 0) continue;
            try { WidgetDasar w = (WidgetDasar) k.getDeclaredConstructor().newInstance(); RemoteViews v = w.tampilan(c); for (int id : ids) m.updateAppWidget(id, v); } catch (Exception ignored) { }
        }
    }
    static void segarkan(Context ctx) {
        final Context c = ctx.getApplicationContext(); gambarSemua(c);
        new Thread(() -> { try { ambil(c); gambarSemua(c); } catch (Throwable ignored) { } }).start();
    }
}
