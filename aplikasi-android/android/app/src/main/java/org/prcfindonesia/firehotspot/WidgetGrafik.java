package org.prcfindonesia.firehotspot;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.widget.RemoteViews;
import org.json.JSONArray;

/* Widget 4 – Angka besar + grafik (4×2): jumlah titik panas <=25 km 7 hari dengan grafik batang harian & chip status.
 * Tanpa Hutan Desa terpilih: titik panas se-Indonesia 24 jam & grafik 7 hari. Grafik digambar di HP (Bitmap). */
public class WidgetGrafik extends WidgetDasar {
    static Bitmap grafik(JSONArray h, int warna) {
        int W = 700, H = 170, n = h == null ? 0 : h.length(); Bitmap b = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888); Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), g = new Paint(Paint.ANTI_ALIAS_FLAG); g.setColor(0x55FFFFFF); g.setStrokeWidth(2);
        c.drawLine(0, H - 2, W, H - 2, g);
        if (n == 0) return b;
        int maks = 1; for (int i = 0; i < n; i++) maks = Math.max(maks, h.optJSONObject(i).optInt("n"));
        float slot = W / (float) n, lebar = slot * 0.56f;
        for (int i = 0; i < n; i++) {
            int v = h.optJSONObject(i).optInt("n"); float tinggi = v == 0 ? 6 : Math.max(10, (H - 12) * v / (float) maks);
            float x = i * slot + (slot - lebar) / 2; p.setColor(i == n - 1 ? warna : (warna & 0x00FFFFFF) | 0x99000000);
            c.drawRoundRect(new RectF(x, H - 2 - tinggi, x + lebar, H - 2), 10, 10, p);
        }
        return b;
    }
    @Override
    RemoteViews tampilan(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_grafik); WidgetData.ketuk(c, v, R.id.g_akar);
        WidgetData d = WidgetData.baca(c);
        if (d.data == null) { v.setTextViewText(R.id.g_angka, "–"); v.setTextViewText(R.id.g_sub, d.t("Menunggu data – sambungkan internet", "Waiting for data")); v.setTextViewText(R.id.g_chip, "Pantau Rimbak"); v.setTextViewText(R.id.g_waktu, ""); return v; }
        if (d.situs != null) {
            v.setTextViewText(R.id.g_angka, WidgetData.angka(d.situs.optInt("r25")));
            v.setTextViewText(R.id.g_sub, d.t("titik panas ≤25 km · 7 hari · ", "hotspots ≤25 km · 7 days · ") + d.nama);
            v.setTextViewText(R.id.g_chip, d.status());
            v.setImageViewBitmap(R.id.g_grafik, grafik(d.situs.optJSONArray("harian"), d.warnaStatus()));
        } else {
            v.setTextViewText(R.id.g_angka, d.nasional24());
            v.setTextViewText(R.id.g_sub, d.t("titik panas se-Indonesia · 24 jam", "hotspots in Indonesia · 24 h"));
            v.setTextViewText(R.id.g_chip, d.t("7 hr: ", "7 d: ") + (d.nasional != null ? WidgetData.angka(d.nasional.optInt("total7")) : "–"));
            v.setImageViewBitmap(R.id.g_grafik, grafik(d.nasional != null ? d.nasional.optJSONArray("harian") : null, Color.parseColor("#FB923C")));
        }
        v.setTextViewText(R.id.g_waktu, d.waktu());
        return v;
    }
}
