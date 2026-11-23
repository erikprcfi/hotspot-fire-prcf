package org.prcfindonesia.firehotspot;

import android.content.Context;
import android.graphics.Color;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/* Widget 3 – Cuaca & prakiraan (4×2): kondisi & suhu hari ini di Hutan Desa + 5 kolom hari (suhu maks, titik warna bahaya api, nama hari). BMKG/ECMWF. */
public class WidgetCuaca extends WidgetDasar {
    static final int[] TT = { R.id.c_t0, R.id.c_t1, R.id.c_t2, R.id.c_t3, R.id.c_t4 }, DD = { R.id.c_d0, R.id.c_d1, R.id.c_d2, R.id.c_d3, R.id.c_d4 }, HH = { R.id.c_h0, R.id.c_h1, R.id.c_h2, R.id.c_h3, R.id.c_h4 };
    @Override
    RemoteViews tampilan(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_cuaca); WidgetData.ketuk(c, v, R.id.c_akar);
        WidgetData d = WidgetData.baca(c);
        JSONObject w = d.situs != null ? d.situs.optJSONObject("cuaca") : null; JSONArray h = d.situs != null ? d.situs.optJSONArray("hari") : null;
        if (w == null) {
            v.setTextViewText(R.id.c_judul, d.t("Cuaca Hutan Desa", "Village forest weather")); v.setTextViewText(R.id.c_suhu, "–"); v.setTextViewText(R.id.c_min, ""); v.setTextViewText(R.id.c_bahaya, "");
            v.setTextViewText(R.id.c_teks, d.data == null ? d.t("Menunggu data", "Waiting for data") : d.t("Pilih Hutan Desa di aplikasi", "Choose a forest in the app"));
            for (int i = 0; i < 5; i++) { v.setTextViewText(TT[i], ""); v.setTextViewText(HH[i], ""); v.setInt(DD[i], "setColorFilter", Color.TRANSPARENT); }
            return v;
        }
        v.setTextViewText(R.id.c_judul, d.nama);
        v.setTextViewText(R.id.c_teks, w.optString("teks", ""));
        v.setTextViewText(R.id.c_suhu, w.isNull("tmaks") ? "–" : WidgetData.satu(w.optDouble("tmaks")) + "°");
        v.setTextViewText(R.id.c_min, (w.isNull("tmin") ? "" : "min " + WidgetData.satu(w.optDouble("tmin")) + "° · ") + d.t("hujan ", "rain ") + (w.isNull("hujan") ? "–" : WidgetData.satu(w.optDouble("hujan"))) + " mm");
        int l = d.lv(); v.setTextViewText(R.id.c_bahaya, d.t("Bahaya api ", "Fire danger ") + d.bahaya(l).toLowerCase(java.util.Locale.ROOT)); v.setTextColor(R.id.c_bahaya, l >= 0 && l < 4 ? WidgetData.WARNA_LV[l] : Color.WHITE);
        for (int i = 0; i < 5; i++) {
            JSONObject x = h != null && i + 1 < h.length() ? h.optJSONObject(i + 1) : null;   // 5 hari setelah hari ini
            if (x == null) { v.setTextViewText(TT[i], ""); v.setTextViewText(HH[i], ""); v.setInt(DD[i], "setColorFilter", Color.TRANSPARENT); continue; }
            int lv = x.optInt("lv", -1);
            v.setTextViewText(TT[i], x.isNull("tmaks") ? "–" : WidgetData.satu(x.optDouble("tmaks")) + "°");
            v.setTextViewText(HH[i], d.hariPendek(x.optString("t")));
            v.setInt(DD[i], "setColorFilter", lv >= 0 && lv < 4 ? WidgetData.WARNA_LV[lv] : Color.GRAY);
        }
        return v;
    }
}
