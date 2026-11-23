package org.prcfindonesia.firehotspot;

import android.content.Context;
import android.graphics.Color;
import android.widget.RemoteViews;

/* Widget 2 – Jam digital berbentuk pil (jam & tanggal sistem HP) + status Hutan Desa & bahaya api hari ini. */
public class WidgetJam extends WidgetDasar {
    @Override
    RemoteViews tampilan(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_jam); WidgetData.ketuk(c, v, R.id.j_akar);
        WidgetData d = WidgetData.baca(c);
        if (d.data == null) { v.setTextViewText(R.id.j_status, "Pantau Rimbak"); v.setTextViewText(R.id.j_info, d.t("menunggu data", "waiting for data")); return v; }
        if (d.situs != null) {
            v.setInt(R.id.j_titik, "setColorFilter", d.warnaStatus());
            v.setTextViewText(R.id.j_status, d.nama + " · " + d.status());
            v.setTextViewText(R.id.j_info, d.t("Bahaya api ", "Fire danger ") + d.bahaya(d.lv()).toLowerCase(java.util.Locale.ROOT) + " · " + WidgetData.angka(d.situs.optInt("r25")) + d.t(" titik ≤25 km", " hotspots ≤25 km"));
        } else {
            v.setInt(R.id.j_titik, "setColorFilter", Color.parseColor("#FB923C"));
            v.setTextViewText(R.id.j_status, "Indonesia · " + d.nasional24() + d.t(" titik panas", " hotspots"));
            v.setTextViewText(R.id.j_info, d.t("24 jam terakhir · NASA FIRMS", "last 24 h · NASA FIRMS"));
        }
        return v;
    }
}
