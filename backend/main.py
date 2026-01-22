from fastapi import FastAPI, Request, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import sqlite3
import hashlib
import time
import requests

app = FastAPI(title="🐧 Stalking Penguin")

# Frontend templates + static
templates = Jinja2Templates(directory="../frontend")
app.mount("/static", StaticFiles(directory="../frontend"), name="static")

# Always store DB next to this file (prevents path issues on Windows)
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
    try:
        geo_response = requests.get(f"https://ipapi.co/{client_ip}/json/", timeout=5)
        geo = geo_response.json()
    except Exception:
        geo = {"country_name": "Unknown", "city": "Unknown", "org": "Unknown"}

    return {
        "ip": client_ip,
        "country": geo.get("country_name", "Unknown"),
        "city": geo.get("city", "Unknown"),
        "isp": geo.get("org", "Unknown"),
        "user_agent": str(request.headers.get("user-agent", "")),
        "languages": request.headers.get("accept-language", ""),
        "platform": request.headers.get("sec-ch-ua-platform", "")
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


@app.get("/api/lookup")
async def lookup(strong_fp: str, soft_fp: str):
    strong_hash = hashlib.sha256(strong_fp.encode()).hexdigest()
    soft_hash = hashlib.sha256(soft_fp.encode()).hexdigest()

    conn = sqlite3.connect(DB_PATH)

    # 1) Try strong match
    cur = conn.execute("SELECT name FROM names WHERE strong_fp = ?", (strong_hash,))
    row = cur.fetchone()
    if row:
        conn.close()
        return {"name": row[0], "match": "strong"}

    # 2) Fallback: soft match
    cur = conn.execute("SELECT name FROM names WHERE soft_fp = ?", (soft_hash,))
    row = cur.fetchone()
    conn.close()
    return {"name": row[0] if row else None, "match": "soft" if row else None}



@app.get("/api/lookup")
async def lookup(strong_fp: str, soft_fp: str):
    strong_hash = hashlib.sha256(strong_fp.encode()).hexdigest()
    soft_hash = hashlib.sha256(soft_fp.encode()).hexdigest()

    conn = sqlite3.connect(DB_PATH)

    # 1) Try strong match
    cur = conn.execute("SELECT name FROM names WHERE strong_fp = ?", (strong_hash,))
    row = cur.fetchone()
    if row:
        conn.close()
        return {"name": row[0], "match": "strong"}

    # 2) Fallback: soft match
    cur = conn.execute("SELECT name FROM names WHERE soft_fp = ?", (soft_hash,))
    row = cur.fetchone()
    conn.close()
    return {"name": row[0] if row else None, "match": "soft" if row else None}

