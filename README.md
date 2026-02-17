![Banner](frontend/static/Images/Stalkingpenguin.webp)

**Stalking Penguin** is an interactive web application that demonstrates the effectiveness of browser fingerprinting as an identification technique. It proves that switching to private/incognito mode isn't enough to hide from tracking - your device's unique characteristics can still reveal your identity.


## Technology Stack

**Frontend:**
- HTML5 with responsive CSS
- Vanilla JavaScript (minified for performance)
- FingerprintJS library for browser identification

**Backend:**
- FastAPI (Python)
- SQLite database
- Security headers (CSP, HSTS, etc.)
- Dual geo-IP service fallback (ipapi.co & ip-api.com)

### Prerequisites
- Python 3.11+
- pip or conda

### Installation

```bash
# Clone the repository
git clone https://github.com/aditya-inorder/stalking-penguin.git
cd stalking-penguin

# Install backend dependencies
cd backend
pip install -r requirements.txt

# Run the application
uvicorn main:app --reload
```


## Project Structure

```
stalking-penguin/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt      # Python dependencies
│   └── names.db            # SQLite database (auto-created)
├── frontend/
│   ├── index.html          # Main HTML file
│   └── static/
│       ├── script.js        # Minified JavaScript
│       ├── fonts/           # Custom font files
│       └── images/          # Logo and penguin assets
└── README.md
```

## Privacy & Disclaimer

This is an **educational project** designed to raise awareness about browser fingerprinting. The collected data is:
- Stored locally in SQLite
- Not shared with third parties
- Used only for demonstration purposes

## Contributing

Feel free to fork and submit pull requests for improvements.

## License

MIT License - Feel free to use this for educational purposes.

## Author

Created by Aditya Pratap Singh



