from fastapi import FastAPI, Request, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import sqlite3
import hashlib
import time
import requests

app = FastAPI(title="🐧 Stalking Penguin")

# Tell FastAPI where frontend files live
templates = Jinja2Templates(directory="../frontend")
app.mount("/static", StaticFiles(directory="../frontend"), name="static")


def init_db():
    conn = sqlite3.connect("names.db")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS names (
            fingerprint TEXT PRIMARY KEY,
            name TEXT,
            timestamp INTEGER
        )
    """)
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup():
    init_db()


# TEMP root – simple JSON to confirm server is up
@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# Return IP + basic header info
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


# Store name tied to fingerprint hash
@app.post("/api/store_name")
async def store_name(
    fingerprint: str = Form(...),
    name: str = Form(...)
):
    fp_hash = hashlib.sha256(fingerprint.encode()).hexdigest()
    conn = sqlite3.connect("names.db")
    conn.execute(
        "INSERT OR REPLACE INTO names VALUES (?, ?, ?)",
        (fp_hash, name, int(time.time()))
    )
    conn.commit()
    conn.close()
    return {"status": "stored"}


# Lookup name by fingerprint
@app.get("/api/lookup")
async def lookup(fingerprint: str):
    fp_hash = hashlib.sha256(fingerprint.encode()).hexdigest()
    conn = sqlite3.connect("names.db")
    cursor = conn.execute(
        "SELECT name FROM names WHERE fingerprint = ?",
        (fp_hash,)
    )
    result = cursor.fetchone()
    conn.close()
    return {"name": result[0] if result else None}
