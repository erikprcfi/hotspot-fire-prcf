package org.prcfindonesia.firehotspot;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/* Pantau Rimbak – Yayasan PRCF Indonesia. Seluruh tampilan & kode dibundel di dalam APK (berjalan tanpa sinyal);
 * data diambil dari server Pantau Rimbak dan disimpan di HP. Fitur asli Android (GPS latar belakang, simpan/bagikan berkas,
 * izin) lewat plugin; pembaruan kode lewat paket terverifikasi (Capacitor Updater). */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PerangkatPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
