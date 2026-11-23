package org.prcfindonesia.firehotspot;

import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/* Widget 5 – Bahaya kebakaran 7 hari (4×2): 7 pil tembus pandang berwarna menurut tingkat bahaya (FWI, BMKG/ECMWF) dengan suhu maks & nama hari. */
public class WidgetBahaya extends WidgetDasar {
    static final int[] PP = { R.id.b_p0, R.id.b_p1, R.id.b_p2, R.id.b_p3, R.id.b_p4, R.id.b_p5, R.id.b_p6 }, TT = { R.id.b_t0, R.id.b_t1, R.id.b_t2, R.id.b_t3, R.id.b_t4, R.id.b_t5, R.id.b_t6 }, HH = { R.id.b_h0, R.id.b_h1, R.id.b_h2, R.id.b_h3, R.id.b_h4, R.id.b_h5, R.id.b_h6 };
    @Override
    RemoteViews tampilan(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_bahaya); WidgetData.ketuk(c, v, R.id.b_akar);
        WidgetData d = WidgetData.baca(c);
        JSONArray h = d.situs != null ? d.situs.optJSONArray("hari") : null;
        if (h == null || h.length() == 0) {
            v.setTextViewText(R.id.b_judul, d.t("Bahaya kebakaran 7 hari", "Fire danger 7 days"));
            v.setTextViewText(R.id.b_ket, d.data == null ? d.t("Menunggu data – sambungkan internet", "Waiting for data") : d.t("Pilih Hutan Desa di aplikasi untuk melihat prakiraan", "Choose a village forest in the app"));
            for (int i = 0; i < 7; i++) { v.setTextViewText(TT[i], ""); v.setTextViewText(HH[i], ""); v.setInt(PP[i], "setBackgroundResource", R.drawable.w_lv_kosong); }
            return v;
        }
        v.setTextViewText(R.id.b_judul, d.t("Bahaya api 7 hari · ", "Fire danger 7 days · ") + d.nama);
        int maks = -1;
        for (int i = 0; i < 7; i++) {
            JSONObject x = i < h.length() ? h.optJSONObject(i) : null;
            if (x == null) { v.setTextViewText(TT[i], ""); v.setTextViewText(HH[i], ""); v.setInt(PP[i], "setBackgroundResource", R.drawable.w_lv_kosong); continue; }
            int l = x.optInt("lv", -1); maks = Math.max(maks, l);
            v.setTextViewText(TT[i], x.isNull("tmaks") ? "–" : WidgetData.satu(x.optDouble("tmaks")) + "°");
            v.setTextViewText(HH[i], i == 0 ? d.t("Ini", "Tdy") : d.hariPendek(x.optString("t")));
            v.setInt(PP[i], "setBackgroundResource", l >= 0 && l < 4 ? WidgetData.PIL_LV[l] : R.drawable.w_lv_kosong);
        }
        v.setTextViewText(R.id.b_ket, d.t("Tertinggi pekan ini: ", "Highest this week: ") + d.bahaya(maks) + d.t(" · hijau → merah = rendah → ekstrem", " · green → red = low → extreme"));
        return v;
    }
}
