from fastapi import FastAPI

app = FastAPI(title="Stalking Penguin")

@app.get("/")
def root():
    return {"message": "Stalking Penguin backend is alive", "status": "ok"}
