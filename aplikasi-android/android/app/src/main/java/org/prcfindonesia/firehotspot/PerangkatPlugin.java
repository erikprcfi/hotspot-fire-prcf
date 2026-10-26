package org.prcfindonesia.firehotspot;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* Izin & pengaturan perangkat yang dibutuhkan pelacakan tim lapangan:
 * - izin notifikasi (Android 13+) agar notifikasi "lokasi sedang dibagikan" tampil,
 * - pengecualian penghemat baterai agar Android tidak menghentikan pelacakan saat layar mati. */
@CapacitorPlugin(name = "Perangkat")
public class PerangkatPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext(); JSObject r = new JSObject();
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("bebasBaterai", pm == null || pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        r.put("notifikasi", Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        try { PackageInfo p = c.getPackageManager().getPackageInfo(c.getPackageName(), 0); r.put("versi", p.versionName); } catch (Exception e) { r.put("versi", ""); }
        r.put("android", Build.VERSION.RELEASE); r.put("merek", Build.MANUFACTURER); r.put("model", Build.MODEL);
        call.resolve(r);
    }
    @PluginMethod
    public void izinNotifikasi(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7101);
        call.resolve();
    }
    @PluginMethod
    public void bebasBaterai(PluginCall call) {
        Context c = getContext(); PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        if (pm != null && !pm.isIgnoringBatteryOptimizations(c.getPackageName())) {
            try { Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS); i.setData(Uri.parse("package:" + c.getPackageName())); getActivity().startActivity(i); }
            catch (Exception e) { try { getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignored) { } }
        }
        call.resolve();
    }
    @PluginMethod
    public void pengaturan(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS); i.setData(Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(i); call.resolve();
    }
}
