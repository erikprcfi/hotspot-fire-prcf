package org.prcfindonesia.firehotspot;

import android.content.Context;
import android.graphics.Color;
import android.widget.RemoteViews;
import org.json.JSONObject;

/* Widget 1 – Ubin status (4×2): 6 ubin tembus pandang – Status, titik panas <=5 km & <=25 km 7 hari, bahaya api, hujan & suhu hari ini.
 * Tanpa Hutan Desa terpilih (tamu/umum/SHP): ringkasan titik panas se-Indonesia. Nama kelas tetap (widget lama di HP tetap jalan). */
public class StatusWidget extends WidgetDasar {
    static final String PREF = WidgetData.PREF;
    static void segarkan(Context c) { WidgetData.segarkan(c); }
    static final int[] T = { R.id.s_t0, R.id.s_t1, R.id.s_t2, R.id.s_t3, R.id.s_t4, R.id.s_t5 }, L = { R.id.s_l0, R.id.s_l1, R.id.s_l2, R.id.s_l3, R.id.s_l4, R.id.s_l5 }, V = { R.id.s_v0, R.id.s_v1, R.id.s_v2, R.id.s_v3, R.id.s_v4, R.id.s_v5 };
    void ubin(RemoteViews v, int i, String l, String val, int bg) { v.setTextViewText(L[i], l); v.setTextViewText(V[i], val); v.setInt(T[i], "setBackgroundResource", bg); }
    @Override
    RemoteViews tampilan(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_status); WidgetData.ketuk(c, v, R.id.w_akar);
        WidgetData d = WidgetData.baca(c); int abu = R.drawable.w_ubin_abu;
        v.setTextViewText(R.id.w_judul, d.data == null ? "Pantau Rimbak" : d.nama); v.setTextViewText(R.id.w_waktu, d.t("diperbarui ", "updated ") + d.jamData());
        if (d.data == null) {
            for (int i = 0; i < 6; i++) ubin(v, i, i == 0 ? d.t("Menunggu data", "Waiting") : "", i == 0 ? "–" : "", abu);
            v.setTextViewText(R.id.w_waktu, d.t("sambungkan internet", "connect to internet")); return v;
        }
        if (d.situs != null) {
            v.setInt(R.id.w_titik, "setColorFilter", d.warnaStatus());
            int l = d.lv(); JSONObject w = d.situs.optJSONObject("cuaca");
            ubin(v, 0, "Status", d.status(), d.ubinStatus());
            ubin(v, 1, d.t("Titik ≤5 km", "Hotspots ≤5 km"), WidgetData.angka(d.situs.optInt("dekat")), d.situs.optInt("dekat") > 0 ? R.drawable.w_ubin_kuning : abu);
            ubin(v, 2, d.t("Titik ≤25 km", "Hotspots ≤25 km"), WidgetData.angka(d.situs.optInt("r25")), abu);
            ubin(v, 3, d.t("Bahaya api", "Fire danger"), d.bahaya(l), l >= 0 && l < 4 ? WidgetData.UBIN_LV[l] : abu);
            ubin(v, 4, d.t("Hujan hari ini", "Rain today"), w == null || w.isNull("hujan") ? "–" : WidgetData.satu(w.optDouble("hujan")) + " mm", abu);
            ubin(v, 5, d.t("Suhu maks", "Max temp"), w == null || w.isNull("tmaks") ? "–" : WidgetData.satu(w.optDouble("tmaks")) + "°C", abu);
        } else {
            v.setInt(R.id.w_titik, "setColorFilter", Color.parseColor("#FB923C"));
            ubin(v, 0, d.t("Indonesia 24 jam", "Indonesia 24 h"), d.nasional24(), R.drawable.w_ubin_oranye);
            ubin(v, 1, d.t("7 hari", "7 days"), d.nasional != null ? WidgetData.angka(d.nasional.optInt("total7")) : "–", abu);
            ubin(v, 2, d.t("Sumber", "Source"), "NASA FIRMS", abu);
            org.json.JSONArray top = d.nasional != null ? d.nasional.optJSONArray("teratas") : null;   // 3 provinsi terbanyak 24 jam
            for (int i = 3; i < 6; i++) {
                org.json.JSONObject x = top != null && i - 3 < top.length() ? top.optJSONObject(i - 3) : null;
                ubin(v, i, x != null ? x.optString("nama") : "", x != null ? WidgetData.angka(x.optInt("n24")) + d.t(" titik", "") : "", x != null && i == 3 ? R.drawable.w_ubin_oranye : abu);
            }
        }
        return v;
    }
}
