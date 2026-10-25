"""
Pengirim notifikasi Web Push (standar W3C Push API) tanpa pustaka pihak ketiga selain `cryptography`.
- Enkripsi isi pesan: RFC 8291 (Message Encryption for Web Push) dengan pengodean aes128gcm (RFC 8188).
- Identitas server: VAPID (RFC 8292), tanda tangan JWT ES256.
Dipakai scripts/peringatan.py – Fire Hotspot PRCF.
"""
import base64, hashlib, hmac, json, os, struct, time, urllib.parse, urllib.request
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def b64u(b): return base64.urlsafe_b64encode(b).decode().rstrip("=")
def ub64(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
def _hmac(k, m): return hmac.new(k, m, hashlib.sha256).digest()

def enkripsi(isi: bytes, p256dh: str, auth: str, salt: bytes = None, as_priv=None):
    ua_pub = ub64(p256dh); auth_s = ub64(auth)
    as_priv = as_priv or ec.generate_private_key(ec.SECP256R1())
    as_pub = as_priv.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub)
    shared = as_priv.exchange(ec.ECDH(), ua_key)
    ikm = _hmac(_hmac(auth_s, shared), b"WebPush: info\x00" + ua_pub + as_pub + b"\x01")
    salt = salt or os.urandom(16)
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    ct = AESGCM(cek).encrypt(nonce, isi + b"\x02", None)
    return salt + struct.pack("!IB", 4096, len(as_pub)) + as_pub + ct

def vapid_header(endpoint, priv_b64u, pub_b64u, sub):
    u = urllib.parse.urlparse(endpoint)
    head = b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    claim = b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": sub}, separators=(",", ":")).encode())
    key = ec.derive_private_key(int.from_bytes(ub64(priv_b64u), "big"), ec.SECP256R1())
    r, s = decode_dss_signature(key.sign(f"{head}.{claim}".encode(), ec.ECDSA(hashes.SHA256())))
    sig = b64u(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return f"vapid t={head}.{claim}.{sig}, k={pub_b64u}"

def kirim(langganan: dict, data: dict, vapid_priv, vapid_pub, sub="https://erikprcfi.github.io/hotspot-fire-prcf/", ttl=86400):
    """Mengembalikan kode HTTP layanan push (201 = terkirim; 404/410 = langganan sudah tidak berlaku)."""
    body = enkripsi(json.dumps(data, ensure_ascii=False).encode(), langganan["keys"]["p256dh"], langganan["keys"]["auth"])
    req = urllib.request.Request(langganan["endpoint"], data=body, method="POST", headers={
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": str(ttl), "Urgency": "high",
        "Authorization": vapid_header(langganan["endpoint"], vapid_priv, vapid_pub, sub)})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status
    except urllib.error.HTTPError as e: return e.code
    except Exception: return 0
