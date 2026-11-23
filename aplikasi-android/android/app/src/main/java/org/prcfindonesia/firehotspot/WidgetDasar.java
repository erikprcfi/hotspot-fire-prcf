package org.prcfindonesia.firehotspot;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/* Dasar semua widget: tampilkan salinan terakhir dulu, lalu ambil data baru di latar belakang (maks. ±18 dtk). */
public abstract class WidgetDasar extends AppWidgetProvider {
    abstract RemoteViews tampilan(Context c);
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        WidgetData.gambarSemua(ctx);
        final PendingResult pr = goAsync(); final Context c = ctx.getApplicationContext();
        new Thread(() -> { try { WidgetData.ambil(c); WidgetData.gambarSemua(c); } catch (Throwable ignored) { } finally { pr.finish(); } }).start();
    }
}
