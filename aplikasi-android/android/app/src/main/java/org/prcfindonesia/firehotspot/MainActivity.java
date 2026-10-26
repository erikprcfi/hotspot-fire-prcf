package org.prcfindonesia.firehotspot;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/* Fire Hotspot – Yayasan PRCF Indonesia. Halaman aplikasi dimuat dari situs resmi (selalu versi terbaru);
 * fitur asli Android (GPS latar belakang, simpan/bagikan berkas, izin) disediakan lewat plugin. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PerangkatPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
