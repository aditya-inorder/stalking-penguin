from fastapi import FastAPI, Request, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import sqlite3
import hashlib
import time
import requests
import json

app = FastAPI(title="Stalking Penguin")

templates = Jinja2Templates(directory="../frontend")
app.mount("/static", StaticFiles(directory="../frontend/static"), name="static")

DB_PATH = Path(__file__).resolve().parent / "names.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS names (
            strong_fp TEXT PRIMARY KEY,
            soft_fp TEXT,
            name TEXT,
            timestamp INTEGER
        )
    """)
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/fingerprint")
async def fingerprint(request: Request):
    client_ip = request.client.host

    # Get real IP from headers if behind proxy
    forwarded_for = request.headers.get("x-forwarded-for")
    real_ip = request.headers.get("x-real-ip")

    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    elif real_ip:
        client_ip = real_ip

    # Determine if using local IP fallback
    is_local = client_ip in ("127.0.0.1", "::1", "localhost")

    # Try multiple geo IP services for reliability
    geo = {}

    # Try ipapi.co first
    try:
        lookup_url = "https://ipapi.co/json/" if is_local else f"https://ipapi.co/{client_ip}/json/"

        geo_response = requests.get(lookup_url, timeout=6)
        if geo_response.ok:
            geo_data = geo_response.json()

            # Check for error in response
            if "error" not in geo_data and geo_data.get("ip"):
                geo = geo_data
    except Exception as e:
        pass

    # Fallback to ip-api.com if ipapi.co failed
    if not geo or geo.get("ip") == "127.0.0.1":
        try:
            fallback_url = "http://ip-api.com/json/" if is_local else f"http://ip-api.com/json/{client_ip}"

            fallback_response = requests.get(fallback_url, timeout=6)
            if fallback_response.ok:
                fallback_data = fallback_response.json()

                if fallback_data.get("status") == "success":
                    # Map ip-api.com format to ipapi.co format
                    geo = {
                        "ip": fallback_data.get("query", client_ip),
                        "city": fallback_data.get("city"),
                        "country_name": fallback_data.get("country"),
                        "org": fallback_data.get("isp")
                    }
        except Exception as e:
            pass

    # Extract data with better fallbacks
    ip_out = client_ip
    if geo.get("ip") and geo["ip"] != "127.0.0.1":
        ip_out = geo["ip"]

    city = geo.get("city") or ""
    country = geo.get("country_name") or ""
    org = geo.get("org") or geo.get("isp") or ""

    # Build location string
    location_parts = []
    if city:
        location_parts.append(city)
    if country:
        location_parts.append(country)

    location = ", ".join(location_parts) if location_parts else "Unknown"

    # ISP handling
    isp = org if org else "Unknown"

    # Platform detection
    platform = request.headers.get("sec-ch-ua-platform", "").strip('"') or "Unknown"

    result = {
        "ip": ip_out,
        "location": location,
        "city": city or "Unknown",
        "country": country or "Unknown",
        "isp": isp,
        "platform": platform,
    }

    return result


@app.post("/api/store_name")
async def store_name(
    strong_fp: str = Form(...),
    soft_fp: str = Form(...),
    name: str = Form(...)
):
    strong_hash = hashlib.sha256(strong_fp.encode()).hexdigest()
    soft_hash = hashlib.sha256(soft_fp.encode()).hexdigest()

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO names (strong_fp, soft_fp, name, timestamp) VALUES (?, ?, ?, ?)",
        (strong_hash, soft_hash, name, int(time.time()))
    )
    conn.commit()
    conn.close()

    return {"status": "stored"}


@app.post("/api/delete_name")
async def delete_name(
    strong_fp: str = Form(...),
    soft_fp: str = Form(...)
):
    strong_hash = hashlib.sha256(strong_fp.encode()).hexdigest()
    soft_hash = hashlib.sha256(soft_fp.encode()).hexdigest()

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "DELETE FROM names WHERE strong_fp = ? OR soft_fp = ?",
        (strong_hash, soft_hash)
    )
    conn.commit()
    conn.close()

    return {"status": "deleted"}


@app.get("/api/lookup")
async def lookup(strong_fp: str, soft_fp: str):
    strong_hash = hashlib.sha256(strong_fp.encode()).hexdigest()
    soft_hash = hashlib.sha256(soft_fp.encode()).hexdigest()

    conn = sqlite3.connect(DB_PATH)

    cur = conn.execute("SELECT name FROM names WHERE strong_fp = ?", (strong_hash,))
    row = cur.fetchone()
    if row:
        conn.close()
        return {"name": row[0], "match": "strong"}

    cur = conn.execute("SELECT name FROM names WHERE soft_fp = ?", (soft_hash,))
    row = cur.fetchone()
    conn.close()

    if row:
        return {"name": row[0], "match": "soft"}
    else:
        return {"name": None, "match": None}