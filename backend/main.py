from fastapi import FastAPI, Request, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import sqlite3
import hashlib
import time
import requests

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

    # If testing locally, ipapi on 127.0.0.1 will be useless.
    # Use ipapi's "auto IP" endpoint to show meaningful public IP/ISP/location.
    lookup_url = (
        "https://ipapi.co/json/"
        if client_ip in ("127.0.0.1", "::1")
        else f"https://ipapi.co/{client_ip}/json/"
    )

    geo = {}
    try:
        geo_response = requests.get(lookup_url, timeout=5)
        geo = geo_response.json() if geo_response.ok else {}
    except Exception:
        geo = {}

    ip_out = geo.get("ip", client_ip) if client_ip in ("127.0.0.1", "::1") else client_ip
    city = geo.get("city") or "Unknown"
    country = geo.get("country_name") or "Unknown"
    org = geo.get("org") or "Unknown"

    location = "Unknown"
    if city != "Unknown" or country != "Unknown":
        location = ", ".join([x for x in [city, country] if x and x != "Unknown"]) or "Unknown"

    return {
        "ip": ip_out,
        "location": location,
        "city": city,
        "country": country,
        "isp": org,
        "platform": request.headers.get("sec-ch-ua-platform", "") or "",
    }


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
    return {"name": row[0] if row else None, "match": "soft" if row else None}
