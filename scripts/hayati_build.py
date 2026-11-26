"""
Daftar jenis tumbuhan & satwa dilindungi (Permen LHK P.106/MENLHK/SETJEN/KUM.1/12/2018) -> data/hayati/dilindungi.json
Diambil dari teks lampiran peraturan yang sudah diunduh & diverifikasi SHA-256 untuk asisten Bara Api (data/bara/kb.json,
scripts/kb_build.py). Hanya nama ilmiah binomial (Genus spesies) yang diambil; aplikasi mencocokkannya dengan nama spesies
dari GBIF, sehingga hanya nama yang benar-benar ada di peraturan yang ditandai "dilindungi".
"""
import os, re, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KB = json.load(open(os.path.join(ROOT, "data", "bara", "kb.json"), encoding="utf-8"))
P = [p for p in KB["potongan"] if p.get("doc") == "PermenLHK-106-2018"]
teks = " ".join(p.get("teks", "") for p in P)
nama = sorted(set(m for m in re.findall(r"\b([A-Z][a-z]{2,} [a-z]{3,}(?:-[a-z]+)?)\b", teks)))
STOP = {"Menteri", "Peraturan", "Lampiran", "Pasal", "Jenis", "Republik", "Direktur", "Kementerian", "Lingkungan", "Hutan", "Satwa", "Tumbuhan", "Nomor", "Undang", "Pemerintah", "Presiden", "Daftar", "Berita", "Negara", "Ditetapkan", "Diundangkan", "Salinan", "Kepala", "Biro", "Sekretaris", "Jenderal", "Dengan", "Bahwa", "Menimbang", "Mengingat", "Memutuskan", "Menetapkan", "Kehutanan", "Indonesia", "Tahun", "Huruf", "Dalam", "Pada", "Untuk"}
nama = [n for n in nama if n.split()[0] not in STOP]
src = P[0] if P else {}
json.dump({"sumber": src.get("judul", "Permen LHK P.106/2018"), "url": src.get("url"), "sha256": src.get("sha256"),
           "catatan": "Nama ilmiah dari lampiran peraturan; dicocokkan persis dengan nama spesies GBIF.", "jumlah": len(nama), "nama": nama},
          open(os.path.join(ROOT, "data", "hayati", "dilindungi.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("nama dilindungi:", len(nama))
